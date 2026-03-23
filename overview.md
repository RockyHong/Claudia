# Claudia

**Claude + IA (Inteligencia Artificial)**
A personal receptionist app for all your Claude Code agents.

---

## Purpose

When running multiple Claude Code sessions across different terminals, you constantly tab-switch to check: *Is it done? Does it need my permission? Which terminal was that?* Claudia eliminates this friction entirely.

Claudia is **not** another Claude agent. She is the **receptionist** — a lightweight system tray app that monitors all active Claude Code sessions on your machine via hooks, displays their states at a glance, notifies you when attention is needed, and lets you jump to the right terminal with one click.

She doesn't duplicate what the CLI already shows. She tells you *when* and *where* to look.

---

## Context & Origin

The idea evolved through three iterations:

1. **Wrapper approach** — embed Claude Code inside an Electron app with xterm.js and a video panel. Rejected because wrapping the terminal risks losing native CLI features (tmux, shell config, clipboard, font rendering). The terminal *is* the product; degrading it defeats the purpose.

2. **Sidecar approach** — keep Claude Code in your native terminal, run a separate display app that reads hook state for one session. Better, but scoped to a single session and the avatar was decorative without real utility.

3. **Receptionist approach (Claudia)** — monitor *all* Claude Code sessions, serve as a centralized attention hub with navigation. The parallel state conflict from the sidecar approach vanishes because each session is its own row, not a merged state. This is the design.

---

## Core Concept

```
You, working on something else
        │
        ▼
  ┌─ System Tray ─────────────────────────┐
  │  Claudia                               │
  │                                        │
  │  ┌──────────┐  ┌───────────────────┐   │
  │  │  Avatar   │  │  Sessions        │   │
  │  │  (video/  │  │                  │   │
  │  │   anim)   │  │  ● api   busy    │   │
  │  │           │  │  ◉ web   NEEDS U │   │
  │  │   😌💬    │  │  ○ data  idle    │   │
  │  └──────────┘  │         [focus]   │   │
  │                 └───────────────────┘   │
  │                                        │
  │  "Web team needs your OK on a          │
  │   file edit — go say hi"               │
  ├────────────────────────────────────────┤
  │  localhost:7890 (event receiver)       │
  │  ← hooks from all Claude sessions      │
  └────────────────────────────────────────┘
```

One glance at Claudia tells you if you need to do anything or not.

---

## Architecture

### System Overview

```
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ Terminal 1   │  │ Terminal 2   │  │ Terminal 3   │
│ claude code  │  │ claude code  │  │ claude code  │
│ (api-server) │  │ (frontend)   │  │ (pipeline)   │
└──────┬───────┘  └──────┬───────┘  └──────┬───────┘
       │ hooks           │ hooks           │ hooks
       │                 │                 │
       ▼                 ▼                 ▼
┌──────────────────────────────────────────────────┐
│  Claudia (Node.js server + browser dashboard)    │
│                                                  │
│  ┌────────────────┐  ┌────────────────────────┐  │
│  │ Express Server │  │ Session Tracker        │  │
│  │ localhost:7890 │──│ state per session       │  │
│  │ receives hooks │  │ timestamps, metadata   │  │
│  └────────┬───────┘  └───────────┬────────────┘  │
│           │                      │               │
│  ┌────────▼───────┐  ┌──────────▼─────────────┐  │
│  │ SSE Stream     │  │ Terminal Focus         │  │
│  │ GET /events    │  │ (shell commands)       │  │
│  └────────┬───────┘  │ osascript / wmctrl /   │  │
│           │          │ PowerShell             │  │
│           │          └────────────────────────┘  │
└───────────┼──────────────────────────────────────┘
            │  SSE (EventSource)
            ▼
   Browser tab (localhost:7890)
            │
            ├── Session list (Svelte 5)
            ├── Avatar video (HTML <video>)
            ├── Status messages (personality)
            └── Browser Notification API
```

### Components

**1. Hook Configuration (Claude Code side)**

All Claude Code instances on the machine share the same `~/.claude/settings.json`. Hooks fire automatically for every session — no per-terminal setup required. Run `claudia init` to configure them automatically.

Hooks use `node -e` instead of `curl` to avoid shell injection — `JSON.stringify` safely escapes all env var content (notification messages, paths with special characters, etc.).

```json
{
  "hooks": {
    "PreToolUse": [{ "command": "node -e \"...JSON.stringify({session, state:'busy', tool, cwd, ts})...\"" }],
    "PostToolUse": [{ "command": "node -e \"...JSON.stringify({session, state:'busy', tool, cwd, ts})...\"" }],
    "Notification": [{ "command": "node -e \"...JSON.stringify({session, state:'pending', message, cwd, ts})...\"" }],
    "Stop": [{ "command": "node -e \"...JSON.stringify({session, state:'idle', cwd, ts})...\"" }]
  }
}
```

See `packages/server/src/hooks.js` for the full commands.

**2. Express Server (`packages/server/src/index.js`)**

A minimal HTTP server on `localhost:7890` that:

- Receives POST events from hooks at `/event`
- Maintains a session registry via the session tracker
- Broadcasts state changes to connected browsers via SSE at `/events`
- Serves the built Svelte dashboard at `/`
- Provides REST fallback at `/api/sessions` for initial state load
- Accepts focus requests at `/focus/:sessionId`

**3. Session Tracker (`packages/server/src/session-tracker.js`)**

In-memory state store using plain JavaScript objects:

```javascript
// Session shape
{
  id,              // CLAUDE_SESSION_ID
  state,           // 'idle' | 'busy' | 'pending'
  cwd,             // working directory (used as display name)
  lastTool,        // most recent tool name (cleared on idle)
  lastEvent,       // timestamp of last event
  pendingMessage,  // message from Notification hook
}
```

State logic — three states from the user's perspective:

| Hook Event | Resulting State | Rationale |
|---|---|---|
| `PreToolUse` fires | → **Busy** | Tool starting |
| `PostToolUse` fires | → **Busy** | Claude is still working between tools |
| `Notification` fires | → **Pending** | Needs user attention |
| `Stop` fires | → **Idle** | Claude finished its turn, waiting for user input |
| `SessionStart` fires | → **Idle** | Session just began |
| No event for >10min | → session pruned from list |

**4. Svelte Dashboard (`packages/web/src/`)**

A browser-based dashboard served by Express:

- **App.svelte** — Root component: layout, reactive state, notification permissions, document title updates
- **SessionList.svelte** — Renders list of active sessions, empty state
- **SessionCard.svelte** — Single session: display name, state dot, elapsed time, last tool, focus button
- **StatusBar.svelte** — Footer with aggregate state, personality message, session count
- **sse.js** — EventSource client with auto-reconnect (3s retry)

Uses Svelte 5 runes (`$state`, `$derived`, `$effect`) for reactivity. Browser Notification API fires when any session enters Pending.

**5. Terminal Focus (`packages/server/src/focus.js`)**

When the user clicks `[Focus]` on a session row, Claudia finds and raises the correct terminal window via platform shell commands:

- **macOS**: `osascript` — match terminal by window title
- **Linux**: `wmctrl -a` or `xdotool search --name` — activate by window name
- **Windows**: PowerShell — find process by window title, `SetForegroundWindow`

Fallback: if window matching fails, bring the terminal application to front and let the user pick the tab/window. Focus is best-effort — failure is silent, never crashes.

---

## States & Avatar Mapping

| State | Trigger | Avatar Behavior | Icon |
|---|---|---|---|
| **Pending** | Permission prompt / plan approval needed | Looking at you, waving, tapping desk | ◉ orange (+ browser notification) |
| **Busy** | Any tool use, or between tools during a turn | Typing, focused, busy | ● blue |
| **Idle** | `Stop` hook — Claude finished, waiting for user input | Relaxed, looking around, maybe reading | ○ gray |

Aggregate avatar logic (when multiple sessions are active):

- If **any** session is `Pending` → avatar shows pending (highest priority — user needs to act)
- Else if **any** session is `Busy` → avatar shows busy
- Else → avatar shows idle

---

## Personality Layer

Claudia isn't just a dashboard. She's the receptionist. She can have character in her status messages:

- Session finishes a big task → *"Terminal 2 just wrapped up the API refactor."*
- Two sessions need permission simultaneously → *"You're popular — both the frontend and backend crews need you."*
- Everything idle for 10+ minutes → *"All quiet. Go grab a coffee."*
- Session enters pending → *"The api-server team needs your sign-off on a file edit."*

These messages are generated from templates based on state transitions, not from an LLM — keeping Claudia lightweight and instant.

---

## Distribution & Installation

Claudia is an open source tool for personal use. The distribution strategy prioritizes zero-friction adoption: one command to configure, one command to run.

### `npx claudia` (zero install)

```bash
npx claudia init    # patches ~/.claude/settings.json with hooks
npx claudia         # starts the receptionist
```

This is the product. It starts a Node.js server on `localhost:7890` and opens a dashboard in the user's default browser. No cloning, no building, no global install. The only prerequisite is Node.js, which anyone running Claude Code already has.

**What you get:** full session dashboard, browser Notification API alerts when a session enters `Pending`, avatar display, personality messages, terminal focus via platform shell commands.

### The `claudia init` Command

The biggest friction point for new users isn't installing Claudia — it's configuring the Claude Code hooks. The `init` command eliminates this:

```bash
npx claudia init
```

What it does:

1. Reads `~/.claude/settings.json` (creates it if missing)
2. Merges Claudia's hook configuration into the existing hooks (preserving any user-defined hooks already present)
3. Confirms the changes to the user before writing
4. Validates the config by sending a test event to `localhost:7890` (if Claudia is running)

What it does NOT do:

- Overwrite existing hooks
- Require sudo or elevated permissions
- Modify anything outside `~/.claude/settings.json`

Uninstall is equally clean: `npx claudia teardown` removes only the hooks Claudia added.

### Graceful Degradation

If Claudia is not running, the `curl` commands in the hooks fail silently (`-s` flag, fire-and-forget, no timeout blocking). Claude Code is completely unaffected. Claudia is purely additive — removing it changes nothing about the CLI experience.

### Future: Native Tier

If community demand warrants it, a native tier could add:

- System tray icon with notification badge
- Native OS notifications (not browser-based)
- Standalone binary distribution (Tauri — .dmg, .msi, .AppImage)

This is not planned for v1. The browser dashboard covers the core value proposition.

---

## Technology Stack

| Component | Choice | Rationale |
|---|---|---|
| **Runtime** | Node.js 18+ | Claude Code already requires it — zero extra ask from users |
| **Server** | Express 5 | Universal knowledge, boring in the best way, 4 routes |
| **Real-time** | SSE (Server-Sent Events) | Unidirectional data flow → unidirectional primitive. Zero client library (native EventSource) |
| **UI** | Svelte 5 + Vite | Compiles to tiny vanilla JS, built-in reactivity via runes, near-zero config |
| **Testing** | Vitest | Vite-native, fast, Jest-compatible API |
| **Linting** | Biome | Single tool replaces ESLint + Prettier |
| **Video playback** | HTML `<video>` element with `loop` attribute | Native browser support, no extra libraries |
| **OS integration** | Platform shell commands | osascript (macOS), wmctrl/xdotool (Linux), PowerShell (Windows) — already installed, no native addons |
| **Package manager** | npm workspaces | Ships with Node, `npx` is npm-native. No pnpm/yarn overhead |

### Why Browser-First?

**A browser tab covers 80% of the value with 0% install friction.** The session dashboard and notifications work perfectly in a browser. The only thing a browser *can't* do is focus other OS windows — and knowing *which* terminal needs you (then alt-tabbing to it) is almost as good as auto-focusing.

Production has one dependency: `express`. This is intentional. See `techstack.md` for full reasoning behind each choice.

---

## Project Structure

```
claudia/
├── bin/
│   └── cli.js                       # Entry point: npx claudia, claudia init
│
├── packages/
│   ├── server/                      # Express event server & session tracking
│   │   ├── package.json             # @claudia/server
│   │   └── src/
│   │       ├── index.js             # Express server, SSE, HTTP routes
│   │       ├── session-tracker.js   # Session registry, state machine, debouncing
│   │       ├── session-tracker.test.js
│   │       ├── personality.js       # Status message templates (Phase 4)
│   │       ├── hooks.js             # Hook config management (Phase 3)
│   │       └── focus.js             # Terminal focus strategy (Phase 5)
│   │
│   └── web/                         # Svelte 5 browser dashboard
│       ├── package.json             # @claudia/web
│       ├── index.html
│       ├── vite.config.js
│       ├── svelte.config.js
│       └── src/
│           ├── main.js              # Svelte app mount point
│           ├── App.svelte           # Root component: layout, state, notifications
│           └── lib/
│               ├── sse.js           # SSE client with auto-reconnect
│               ├── SessionList.svelte
│               ├── SessionCard.svelte
│               └── StatusBar.svelte
│
├── package.json                     # Workspace root
├── CLAUDE.md
├── overview.md
├── roadmap.md
└── techstack.md
```

Monorepo using npm workspaces. `packages/server` and `packages/web` are the only packages needed — no native tier required for v1.

---

## Event Protocol

### Hook → Claudia (HTTP POST to localhost:7890/event)

Claude Code passes hook context via **stdin as JSON** (not environment variables).
Hooks read stdin, extract `session_id`, `tool_name`, `cwd`, etc., and POST to Claudia.

Hooks are installed in `~/.claude/settings.json` under a `"hooks"` wrapper key.

```json
{
  "session": "abc123",
  "state": "busy" | "idle" | "pending" | "stopped",
  "tool": "Edit",
  "cwd": "/home/user/projects/api-server",
  "message": "Permission needed for file edit",
  "ts": 1711100000
}
```

#### Hook events used

| Claude Code Event | Claudia State | Purpose |
|-------------------|---------------|---------|
| `SessionStart`    | `idle`        | Register session immediately on start |
| `PreToolUse`      | `busy`        | Tool starting |
| `PostToolUse`     | `busy`        | Tool finished, Claude still working between tools |
| `Notification`    | `pending`     | Permission prompt (matcher: `permission_prompt`) |
| `Stop`            | `idle`        | Claude finished its turn, waiting for user input |

### Claudia Internal State (per session)

```json
{
  "sessions": {
    "abc123": {
      "displayName": "api-server",
      "state": "busy",
      "lastTool": "Edit",
      "lastEvent": "2026-03-22T14:30:00Z",
      "timeInState": "12s",
      "pendingMessage": null
    },
    "def456": {
      "displayName": "frontend",
      "state": "pending",
      "lastTool": null,
      "lastEvent": "2026-03-22T14:30:05Z",
      "timeInState": "7s",
      "pendingMessage": "Needs approval for npm install"
    }
  },
  "aggregateState": "pending"
}
```

### Claudia → Browser (SSE at GET /events)

Each SSE message is a `state_update` event with JSON data:

```json
{
  "type": "state_update",
  "sessions": [ ... ],
  "aggregateState": "pending",
  "statusMessage": "The frontend crew needs your sign-off."
}
```

The browser connects via native `EventSource` API with automatic reconnection.

---

## Key Design Decisions

### No Debouncing Needed

Both `PreToolUse` and `PostToolUse` map to `busy`. A session stays busy from the first tool call until Claude's turn completes (`Stop` hook). This eliminates the flickering problem entirely — no debounce timers or thinking detection needed.

### Session Naming

Sessions are identified by `session_id` from Claude Code's stdin JSON (opaque string). For display, Claudia derives a human-readable name from the `cwd`:

- `/home/user/projects/api-server` → **api-server**
- `/home/user/projects/frontend` → **frontend**

If two sessions share the same cwd (rare), append a short session ID suffix: **api-server (a3f)**.

### Stale Session Pruning

If no event is received from a session for 10 minutes (configurable), it's removed from the list. This handles cases where Claude Code exits without a clean "goodbye" event.

---

## Future Possibilities

- **Sound cues** — subtle audio pings when a session enters `Pending` (configurable, off by default)
- **Session history** — log of state transitions per session, for reviewing how long tasks took
- **Quick actions** — buttons to send common responses (approve, deny) directly from Claudia back to the terminal via stdin injection (complex but possible)
- **Multi-machine** — if Claude Code runs on a remote server, hooks could POST to a non-localhost address, letting Claudia monitor remote sessions
- **Theme/skin support** — custom avatar packs, UI themes
- **Plugin system** — let users add custom state detectors or notification behaviors

---

## Summary

Claudia is a personal, lightweight, system-tray receptionist for Claude Code. She watches all your agent sessions, tells you who needs what, and gets you there in one click. She doesn't replace the terminal — she makes sure you're in the right terminal at the right time.

The hardest part isn't the code. It's making good avatar videos.