# Roadmap

Phased build plan for Claudia. Each phase is a shippable increment — you can stop after any phase and have something that works.

---

## Phase 1: Server Core

The backbone. Receive hook events, manage session state, broadcast via SSE.

### Session Tracker (`packages/server/src/session-tracker.js`)
- [x] Define session data model (id, state, cwd, lastTool, lastEvent, pendingMessage)
- [x] Define state enum (Idle, Working, Pending, Thinking)
- [x] Implement `handleEvent(event)` — state transitions from hook events
- [x] Implement idle debounce — wait 2s before transitioning Working to Idle
- [x] Implement Thinking detection — no event for >5s after Working
- [x] Implement stale session pruning — remove after 10min of silence
- [x] Implement `getSessionDisplayName(cwd)` — extract directory name, handle duplicates
- [x] Implement `getSessions()` — return current session list
- [x] Implement `getAggregateState()` — Pending > Working > Thinking > Idle priority
- [x] Write tests for all state transitions
- [x] Write tests for debounce timing
- [x] Write tests for pruning logic

### Express Server (`packages/server/src/index.js`)
- [x] Set up Express 5 app
- [x] `POST /event` — receive hook data, validate, pass to session tracker
- [x] `GET /events` — SSE stream, push state updates to connected browsers
- [x] `GET /` — serve built web assets (static files from `packages/web/dist`)
- [x] `GET /api/sessions` — REST fallback for initial state load
- [x] Wire session tracker state changes to SSE broadcast
- [x] Handle SSE client connect/disconnect cleanly
- [x] Add CORS for local development (Vite dev server on different port)
- [x] Manual smoke test: curl POST events, observe SSE output

**Shippable after Phase 1:** A running server that receives curl events and broadcasts state via SSE. Testable from terminal alone.

---

## Phase 2: Web Dashboard

The UI. Display session state in a browser tab.

### Svelte App Setup
- [x] Configure Vite with Svelte 5 plugin
- [x] Set up `main.js` to mount `App.svelte`
- [x] Configure dev proxy to server (Vite proxy for `/event`, `/events`, `/api`)

### SSE Client
- [x] Create `sse.js` — EventSource connection to `/events`
- [x] Handle auto-reconnect (native EventSource behavior)
- [x] Parse incoming state updates into reactive Svelte state
- [x] Fetch initial state from `/api/sessions` on load

### Session List
- [x] `SessionList.svelte` — renders list of active sessions
- [x] `SessionCard.svelte` — single session row: name, state dot, time, focus button
- [x] State indicator colors: gray (idle), blue (working), orange (pending), purple (thinking)
- [x] Time-in-state display, updating every second
- [x] Empty state: "No active sessions" message

### Focus Button
- [x] `POST /focus/:id` route on server
- [x] Wire focus button click to POST request
- [x] Server calls `focus.js` strategy for the target session
- [x] Graceful failure: show "couldn't focus" message, never crash

### Browser Notifications
- [x] Request notification permission on first visit
- [x] Fire browser notification when any session enters Pending
- [x] Notification click focuses the Claudia tab

**Shippable after Phase 2:** Open browser, see live session states, get notified when Claude needs you.

---

## Phase 3: CLI & Hooks

The glue. One command to configure, one command to run.

### `claudia init`
- [x] Read `~/.claude/settings.json` (create if missing)
- [x] Merge Claudia hook config into existing hooks (preserve user hooks)
- [x] Show diff of changes, ask for confirmation before writing
- [x] Handle edge cases: malformed JSON, read-only file, missing directory

### `claudia teardown`
- [x] Read `~/.claude/settings.json`
- [x] Remove only Claudia-added hooks (identify by curl target URL)
- [x] Show diff, confirm before writing
- [x] No-op if hooks aren't present

### `claudia` (default — start)
- [x] Start Express server on `localhost:7890`
- [x] Detect port conflict, suggest alternative or show what's using it
- [x] Open `http://localhost:7890` in default browser
- [x] Clean shutdown on SIGINT/SIGTERM
- [x] Print startup banner with URL and status

**Shippable after Phase 3:** `npx claudia init && npx claudia` — full zero-to-running experience.

---

## Phase 4: Personality & Polish

The character. Claudia isn't a dashboard, she's a receptionist.

### Personality Messages (`packages/server/src/personality.js`)
- [x] Define message templates for state transitions
- [x] Session finishes task: "Terminal 2 just wrapped up the API refactor."
- [x] Multiple pending: "You're popular — both teams need you."
- [x] All idle: "All quiet. Go grab a coffee."
- [x] Session enters pending: "The api-server team needs your sign-off."
- [x] Include personality messages in SSE state updates

### Avatar Panel
- [x] Add `<video>` element to dashboard UI
- [x] Map aggregate state to video source (idle/working/pending/thinking)
- [x] Smooth video transitions on state change
### UI Polish
- [x] Favicon changes based on aggregate state
- [x] Page title reflects state: "(1 pending) Claudia"
- [x] Responsive layout: works on narrow and wide windows
- [x] Dark/light mode (system preference)

**Shippable after Phase 4:** A polished, characterful receptionist experience.

---

## Phase 5: OS Integration

The last 20%. Native features that a browser tab can't provide.

### Terminal Focus (`packages/server/src/focus.js`)
- [x] Define `focusTerminal(identifier)` interface
- [x] Platform detection and strategy selection
- [x] Fallback: bring terminal app to front (no specific window match)
- [x] Windows: `FlashWindowEx` (taskbar blink) + monitor-wide orange overlay flash + `SetForegroundWindow`
- [x] macOS: NSWindow overlay flash on target monitor + `AXRaise` window focus
- [x] Linux: python3/tkinter overlay flash + `xdotool windowactivate`
- [x] Multi-monitor support: detect which monitor the terminal is on, flash that monitor only

### Known Limitations
- **No "generating" state** — Claude Code only fires hooks around tool use. Between tools, the session stays in `busy` state until the `Stop` hook fires (turn complete). This is accurate enough — Claude is still working between tools — but doesn't distinguish "running a tool" from "composing text."
- **Node process cold-start latency** — Each hook spawns a fresh `node` process to POST to Claudia. On Windows this adds 100-500ms per event. A persistent daemon/sidecar would eliminate this but adds complexity.
- **Hook data via stdin** — Claude Code passes session context (session_id, tool_name, cwd) to hooks via stdin as JSON, not environment variables. This was undocumented and discovered empirically.
- **Settings.json hook format** — Hooks must be under a `"hooks"` wrapper key in `~/.claude/settings.json`. The top-level format documented for user settings did not work in testing (v2.1.81).

### Sound Effects
- [x] MP3 audio cues served from `packages/server/assets/sfx/`
- [x] Three sounds: `busy.mp3` (starting work), `pending.mp3` (needs approval), `idle.mp3` (task complete)
- [x] Trigger per session — each session entering pending or idle plays its sound
- [x] Mute toggle + volume slider in settings modal, persisted in localStorage
- [x] Preview buttons in settings to audition each sound
- [x] To customize: replace MP3 files in `packages/server/assets/sfx/`

### Future (Not Planned for v1)
- [ ] Persistent hook daemon to eliminate per-event node startup cost
- [ ] Multi-machine monitoring
- [ ] Quick actions (approve/deny from Claudia) — blocked by lack of Claude Code approval API

---

## Phase 6: Session Launcher & Control

Claudia becomes a true receptionist — she spawns sessions, owns their lifecycle, and controls navigation. No more guessing which terminal belongs to which session.

### Core Principle
Claudia spawns the terminal → stores the window handle → controls it directly. Spawned sessions get reliable focus, flash, and foreground. Hook-monitored (external) sessions remain best-effort.

### Spawn Flow
- [x] `[+]` button in header bar (always visible, compact)
- [x] Click opens a popover with recent projects from known `cwd`s
- [x] Projects sorted by last activity
- [x] "Browse folder..." option at bottom for new directories
- [x] Pick a project → server spawns terminal → popover closes
- [x] Store spawned process handle and window handle on the session record

### Window Control (spawned sessions only)
- [x] Click card → `SetForegroundWindow` with stored handle (bring to front)
- [x] Pending auto-alert → orange overlay flash on stored handle + taskbar blink
- [x] User click nav → blue overlay flash on stored handle
- [x] Minimized → restore then foreground
- [x] DPI-aware overlay positioning via `DwmGetWindowAttribute` (DWMWA_EXTENDED_FRAME_BOUNDS)
- [x] `FlashWindowEx` for taskbar icon blink (background windows)

### Server
- [x] `GET /api/projects` — return known project directories from session history
- [x] `POST /api/launch` — spawn a terminal at given `cwd` with `claude` running
- [x] Persist known projects across server restarts (small JSON file)
- [x] Platform-specific terminal spawn (cmd on Windows, default terminal on macOS/Linux)
- [x] Track `windowHandle` per spawned session — set at spawn, used for focus/flash
- [x] Detect spawned session exit (process end) — clean up session card

### Card Ordering
- [x] Sort cards by attention priority: **pending → idle → busy**
- [x] Within same state: most recent activity first
- [x] Busy sessions are lowest priority (working, leave them alone)
- [x] Smooth reorder animation when cards change position

### Git Status on Cards
- [x] On session registration, read git info from session `cwd`
- [x] Three data points: is git repo, current branch, clean/dirty
- [x] Display on card: `main • clean` or `feat/auth • dirty`
- [x] Refresh git status on each state change event
- [x] Non-git directories show no git info (graceful absence, not an error)

### Orphan Sessions (hook-detected, not spawned by Claudia)
- [x] Continue tracking external Claude Code sessions via hooks
- [x] Mark orphan cards visually (subtle badge or dimmed state) — "monitoring only"
- [x] Click on orphan card → best-effort focus (title matching, may not work)
- [x] No flash/foreground guarantee — honest about the limitation

### Design Decisions
- **Spawn = own** — Claudia spawns the terminal, stores the handle, controls focus/flash directly. No title matching, no PID walking, no guesswork.
- **Orphan sessions are honest** — hook-detected sessions still appear on the dashboard but focus/flash is best-effort. Card UI makes this clear rather than silently failing.
- **No embedded terminal** — real terminal windows, spread across monitors. Claudia is the control plane, not the terminal.
- **Session-based, not project-based** — one project can have multiple sessions; flat card list avoids nesting/layering problems.
- **Two flash intents** — navigate (blue, user clicked) vs alert (orange, system pending). Color indicates who initiated.

### Why This Order
Focus/flash on external terminals proved unreliable (Windows Terminal: all windows share one PID, titles show tasks not projects, no way to correlate). Spawning first solves the control problem, making card ordering and git status immediately useful on sessions you can actually navigate to.

---

## Phase 7: Settings & Avatar Sets

User-facing settings modal and persistent avatar management. Moves user data out of the package into `~/.claudia/`.

### File Structure

```
~/.claudia/
  avatars/
    active → default/       ← symlink or copy, served by Express
    default/                ← first uploaded set
      idle.webm
      busy.webm
      pending.webm
    pixel-art/              ← user-created set
      idle.webm
      busy.webm
      pending.webm
```

### Settings Modal
- [x] Settings button in header opens modal
- [x] Avatar section: upload 3 videos (idle/busy/pending), saved as a named set
- [x] Set browser: see all sets as thumbnails (first frame of idle video)
- [x] One-click switch active set — instant, no restart
- [x] Server serves from `~/.claudia/avatars/active/` instead of `public/avatar/`

### Why
- Current file-drop into `public/avatar/` is developer-friendly, not user-friendly
- Files inside the package get overwritten on npm updates
- Avatar sets enable personalization and community sharing

---

## Progress

| Phase | Status | Milestone |
|---|---|---|
| 1. Server Core | **Done** | curl in, SSE out |
| 2. Web Dashboard | **Done** | Live dashboard in browser |
| 3. CLI & Hooks | **Done** | `npx claudia` works end-to-end |
| 4. Personality | **Done** | Claudia has character |
| 5. OS Integration | **Done** | Terminal focus works |
| 6. Session Launcher & Control | **Done** | Spawn, navigate, flash — own the lifecycle |
| 7. Settings & Avatar Sets | **Done** | Upload, switch, persist avatar sets |
