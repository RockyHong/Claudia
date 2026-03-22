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
  │  │   anim)   │  │  ● api   working │   │
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
│  Claudia (Tauri menubar app)                     │
│                                                  │
│  ┌────────────────┐  ┌────────────────────────┐  │
│  │ Event Server   │  │ Session Tracker        │  │
│  │ localhost:7890 │──│ state per session       │  │
│  │ receives hooks │  │ timestamps, metadata   │  │
│  └────────────────┘  └───────────┬────────────┘  │
│                                  │               │
│  ┌────────────────┐  ┌───────────▼────────────┐  │
│  │ Window Focus   │  │ UI Layer              │  │
│  │ (OS native)    │◄─│ session list + avatar  │  │
│  │ AppleScript /  │  │ notifications         │  │
│  │ wmctrl / Win32 │  └────────────────────────┘  │
│  └────────────────┘                              │
└──────────────────────────────────────────────────┘
```

### Components

**1. Hook Configuration (Claude Code side)**

All Claude Code instances on the machine share the same `~/.claude/settings.json`. Hooks fire automatically for every session — no per-terminal setup required.

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "command": "curl -s -X POST http://localhost:7890/event -H 'Content-Type: application/json' -d '{\"session\": \"'\"$CLAUDE_SESSION_ID\"'\", \"state\": \"working\", \"tool\": \"'\"$CLAUDE_TOOL_NAME\"'\", \"cwd\": \"'\"$(pwd)\"'\", \"ts\": '$(date +%s)'}'"
      }
    ],
    "PostToolUse": [
      {
        "command": "curl -s -X POST http://localhost:7890/event -H 'Content-Type: application/json' -d '{\"session\": \"'\"$CLAUDE_SESSION_ID\"'\", \"state\": \"idle\", \"cwd\": \"'\"$(pwd)\"'\", \"ts\": '$(date +%s)'}'"
      }
    ],
    "Notification": [
      {
        "command": "curl -s -X POST http://localhost:7890/event -H 'Content-Type: application/json' -d '{\"session\": \"'\"$CLAUDE_SESSION_ID\"'\", \"state\": \"pending\", \"message\": \"'\"$CLAUDE_NOTIFICATION\"'\", \"cwd\": \"'\"$(pwd)\"'\", \"ts\": '$(date +%s)'}'"
      }
    ]
  }
}
```

**2. Event Server (Claudia backend — Rust/Tauri)**

A minimal HTTP server on `localhost:7890` that:

- Receives POST events from hooks
- Maintains a session registry (session ID → state, last event, cwd, timestamps)
- Automatically prunes stale sessions (no events for configurable timeout, e.g. 10 min)
- Emits state change events to the frontend via Tauri's event system

**3. Session Tracker**

In-memory state store:

```rust
struct Session {
    id: String,
    state: State,          // Working | Idle | Pending | Thinking
    cwd: String,           // working directory (used as display name)
    last_tool: Option<String>,
    last_event: Instant,
    pending_message: Option<String>,
}

enum State {
    Idle,
    Working,
    Pending,   // needs user attention
    Thinking,  // no output for >5s after last tool
}
```

State inference logic:

| Hook Event | Resulting State |
|---|---|
| `PreToolUse` fires | → **Working** |
| `PostToolUse` fires | → **Idle** (with debounce — wait 2s before displaying, in case next tool fires immediately) |
| `Notification` fires | → **Pending** (needs user attention) |
| No event for >5s after `Working` | → **Thinking** |
| No event for >10min | → session pruned from list |

**4. UI Layer (Tauri webview)**

A small popdown panel from the system tray:

- **Session list** — one row per active Claude Code session, showing:
  - Display name (derived from `cwd`, e.g. `~/projects/api-server` → `api-server`)
  - Current state with visual indicator (color dot, icon, or text)
  - Time in current state
  - `[Focus]` button to bring that terminal to front
- **Avatar panel** (optional) — displays a looping video reflecting aggregate state
- **Notification badge** on the tray icon when any session is in `Pending` state

**5. Terminal Focus (OS native)**

When the user clicks `[Focus]` on a session row, Claudia needs to find and raise the correct terminal window. Strategy:

- **macOS**: AppleScript or `NSRunningApplication` API. Most terminals put the cwd or process in the title bar. Match by window title containing the session's cwd or a known identifier.
  ```applescript
  tell application "System Events"
    set frontmost of (first process whose name is "Terminal" ¬
      and title of window 1 contains "api-server") to true
  end tell
  ```
- **Linux**: `wmctrl -a <window_title>` or `xdotool search --name "api-server" windowactivate`
- **Windows**: Win32 `FindWindow` + `SetForegroundWindow`, or PowerShell equivalent

Fallback: if window matching fails, Claudia can simply bring the terminal *application* to front and let the user pick the tab/window.

---

## States & Avatar Mapping

| State | Trigger | Avatar Behavior | Tray Icon |
|---|---|---|---|
| **Idle** | No activity / waiting for user input | Relaxed, looking around, maybe reading | ○ gray |
| **Working** | Tool calls firing, code streaming | Typing, focused, busy | ● blue |
| **Pending** | Permission prompt / plan approval needed | Looking at you, waving, tapping desk | ◉ orange (+ OS notification) |
| **Thinking** | Extended pause before response | Pondering, hand on chin | ◐ purple |

Aggregate avatar logic (when multiple sessions are active):

- If **any** session is `Pending` → avatar shows pending (highest priority — user needs to act)
- Else if **any** session is `Working` → avatar shows working
- Else if **any** session is `Thinking` → avatar shows thinking
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

### Tier 1: `npx claudia` (universal, zero install)

```bash
npx claudia init    # patches ~/.claude/settings.json with hooks
npx claudia         # starts the receptionist
```

This is the default and recommended path. It starts a Node.js server on `localhost:7890` and opens a dashboard in the user's default browser. No cloning, no building, no global install. The only prerequisite is Node.js, which anyone running Claude Code already has.

**What you get:** full session dashboard, browser Notification API alerts when a session enters `Pending`, avatar display, personality messages. Covers ~80% of Claudia's value.

**What you don't get:** native system tray icon, terminal focus (`[Focus]` button). A browser tab cannot raise other OS windows — this is a platform limitation, not a Claudia limitation.

### Tier 2: `claudia --native` (full features, global install)

```bash
npm install -g claudia
claudia --native
```

Everything in Tier 1, plus:

- System tray icon with notification badge
- Native OS notifications (not browser-based)
- Terminal focus via platform APIs (AppleScript / wmctrl / PowerShell)
- Runs as a background process, no browser tab needed

Uses optional native dependencies. If they're missing or unsupported on the current OS, Claudia gracefully falls back to Tier 1 behavior.

### Tier 3: Standalone binary (GitHub Releases)

For users who want a fully native app without Node.js:

- Platform-specific binaries built with Tauri (.dmg for macOS, .msi for Windows, .AppImage for Linux)
- Published on GitHub Releases with each tagged version
- Optional: Homebrew tap (`brew install claudia`), Scoop bucket, or AUR package — maintained only if community demand warrants it

This is the most polished experience but the highest distribution overhead. Not the priority for v1.

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

---

## Technology Stack

| Component | Choice | Rationale |
|---|---|---|
| **App shell** | Tauri v2 | Lightweight (~5-10MB vs Electron's ~150MB), Rust backend with full OS access, system tray support built-in |
| **UI** | HTML/CSS/JS (or Svelte/React) in Tauri webview | Simple, easy to style, hot-reloadable during dev |
| **Event server** | Axum or Actix-web (Rust, inside Tauri) | Already in the Rust process, no extra dependency |
| **Video playback** | HTML `<video>` element with `loop` attribute | Native browser support, no extra libraries |
| **Video format** | WebM (VP9) for transparency, MP4 (H.264) for solid backgrounds | WebM allows avatar overlay on UI; MP4 for simpler side panel |
| **OS integration** | Tauri commands calling platform APIs | Window focus, system tray, native notifications |
| **State file fallback** | `~/.claudia/state.json` | Optional: for other tools to read Claudia's aggregated state |

### Why This Tiered Approach?

The core insight: **a browser tab covers 80% of the value with 0% install friction.** The session dashboard and notifications work perfectly in a browser. The only thing a browser *can't* do is focus other OS windows — and knowing *which* terminal needs you (then alt-tabbing to it) is almost as good as auto-focusing.

Tauri (Tier 2/3) adds the remaining 20% — system tray, native notifications, terminal focus — for users who want the full experience. But it should never be a prerequisite.

Electron is ruled out entirely. Claudia is a menubar utility. ~150MB for 5 rows of text and a video is indefensible when Tauri does the same at ~5-10MB, and the browser tier does it at 0MB.

---

## Project Structure

```
claudia/
├── packages/
│   ├── core/                        # Shared logic (both tiers use this)
│   │   ├── server.js                # Express event server on localhost:7890
│   │   ├── session-tracker.js       # Session state management & debouncing
│   │   ├── personality.js           # Status message templates
│   │   └── hooks.js                 # Claude Code hook config read/write/merge
│   │
│   ├── web/                         # Tier 1: browser UI
│   │   ├── index.html               # Dashboard served by Express
│   │   ├── app.js                   # UI logic, WebSocket state updates
│   │   ├── style.css                # Styling
│   │   └── assets/
│   │       ├── avatar-idle.webm
│   │       ├── avatar-working.webm
│   │       ├── avatar-pending.webm
│   │       └── avatar-thinking.webm
│   │
│   └── native/                      # Tier 2/3: Tauri native shell
│       ├── src-tauri/
│       │   ├── src/
│       │   │   ├── main.rs          # Tauri app entry, system tray
│       │   │   ├── window_focus.rs  # OS-specific terminal focus
│       │   │   └── notifications.rs # Native OS notifications
│       │   ├── Cargo.toml
│       │   └── tauri.conf.json
│       └── src/                     # Reuses web/ UI with native extensions
│           └── native-bridge.js     # Tauri invoke calls for focus, tray, etc.
│
├── bin/
│   └── cli.js                       # Entry point: `npx claudia`, `claudia init`, etc.
├── package.json
└── README.md
```

The `core/` and `web/` packages are all that's needed for `npx claudia`. The `native/` package is only built for Tier 2/3 distribution.

---

## Event Protocol

### Hook → Claudia (HTTP POST to localhost:7890/event)

```json
{
  "session": "abc123",
  "state": "working" | "idle" | "pending",
  "tool": "Edit",
  "cwd": "/home/user/projects/api-server",
  "message": "Permission needed for file edit",
  "ts": 1711100000
}
```

### Claudia Internal State (per session)

```json
{
  "sessions": {
    "abc123": {
      "displayName": "api-server",
      "state": "working",
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

### Claudia → UI (Tauri event)

```json
{
  "type": "state_update",
  "sessions": [ ... ],
  "aggregateState": "pending",
  "statusMessage": "The frontend crew needs your sign-off."
}
```

---

## Key Design Decisions

### Debouncing

Claude Code fires tools rapidly — `PreToolUse` and `PostToolUse` can alternate every 200ms during a multi-step task. Without debouncing, the UI would flicker between "working" and "idle" constantly.

Solution: when a session transitions from `Working` to `Idle`, wait 2 seconds before displaying the change. If another `PreToolUse` fires within that window, stay on `Working`. This creates a smooth, stable display.

### Session Naming

Sessions are identified by `CLAUDE_SESSION_ID` (opaque string). For display, Claudia derives a human-readable name from the `cwd`:

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