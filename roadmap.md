# Roadmap

Phased build plan for Claudia. Each phase is a shippable increment — you can stop after any phase and have something that works.

---

## Phase 1: Server Core

The backbone. Receive hook events, manage session state, broadcast via SSE.

### Session Tracker (`packages/server/src/session-tracker.js`)
- [ ] Define session data model (id, state, cwd, lastTool, lastEvent, pendingMessage)
- [ ] Define state enum (Idle, Working, Pending, Thinking)
- [ ] Implement `handleEvent(event)` — state transitions from hook events
- [ ] Implement idle debounce — wait 2s before transitioning Working to Idle
- [ ] Implement Thinking detection — no event for >5s after Working
- [ ] Implement stale session pruning — remove after 10min of silence
- [ ] Implement `getSessionDisplayName(cwd)` — extract directory name, handle duplicates
- [ ] Implement `getSessions()` — return current session list
- [ ] Implement `getAggregateState()` — Pending > Working > Thinking > Idle priority
- [ ] Write tests for all state transitions
- [ ] Write tests for debounce timing
- [ ] Write tests for pruning logic

### Express Server (`packages/server/src/index.js`)
- [ ] Set up Express 5 app
- [ ] `POST /event` — receive hook data, validate, pass to session tracker
- [ ] `GET /events` — SSE stream, push state updates to connected browsers
- [ ] `GET /` — serve built web assets (static files from `packages/web/dist`)
- [ ] `GET /api/sessions` — REST fallback for initial state load
- [ ] Wire session tracker state changes to SSE broadcast
- [ ] Handle SSE client connect/disconnect cleanly
- [ ] Add CORS for local development (Vite dev server on different port)
- [ ] Manual smoke test: curl POST events, observe SSE output

**Shippable after Phase 1:** A running server that receives curl events and broadcasts state via SSE. Testable from terminal alone.

---

## Phase 2: Web Dashboard

The UI. Display session state in a browser tab.

### Svelte App Setup
- [ ] Configure Vite with Svelte 5 plugin
- [ ] Set up `main.js` to mount `App.svelte`
- [ ] Configure dev proxy to server (Vite proxy for `/event`, `/events`, `/api`)

### SSE Client
- [ ] Create `sse.js` — EventSource connection to `/events`
- [ ] Handle auto-reconnect (native EventSource behavior)
- [ ] Parse incoming state updates into reactive Svelte state
- [ ] Fetch initial state from `/api/sessions` on load

### Session List
- [ ] `SessionList.svelte` — renders list of active sessions
- [ ] `SessionCard.svelte` — single session row: name, state dot, time, focus button
- [ ] State indicator colors: gray (idle), blue (working), orange (pending), purple (thinking)
- [ ] Time-in-state display, updating every second
- [ ] Empty state: "No active sessions" message

### Focus Button
- [ ] `POST /focus/:id` route on server
- [ ] Wire focus button click to POST request
- [ ] Server calls `focus.js` strategy for the target session
- [ ] Graceful failure: show "couldn't focus" message, never crash

### Browser Notifications
- [ ] Request notification permission on first visit
- [ ] Fire browser notification when any session enters Pending
- [ ] Notification click focuses the Claudia tab

**Shippable after Phase 2:** Open browser, see live session states, get notified when Claude needs you.

---

## Phase 3: CLI & Hooks

The glue. One command to configure, one command to run.

### `claudia init`
- [ ] Read `~/.claude/settings.json` (create if missing)
- [ ] Merge Claudia hook config into existing hooks (preserve user hooks)
- [ ] Show diff of changes, ask for confirmation before writing
- [ ] Validate config by sending test event (if server is running)
- [ ] Handle edge cases: malformed JSON, read-only file, missing directory

### `claudia teardown`
- [ ] Read `~/.claude/settings.json`
- [ ] Remove only Claudia-added hooks (identify by curl target URL)
- [ ] Show diff, confirm before writing
- [ ] No-op if hooks aren't present

### `claudia` (default — start)
- [ ] Start Express server on `localhost:7890`
- [ ] Detect port conflict, suggest alternative or show what's using it
- [ ] Open `http://localhost:7890` in default browser
- [ ] Clean shutdown on SIGINT/SIGTERM
- [ ] Print startup banner with URL and status

**Shippable after Phase 3:** `npx claudia init && npx claudia` — full zero-to-running experience.

---

## Phase 4: Personality & Polish

The character. Claudia isn't a dashboard, she's a receptionist.

### Personality Messages (`packages/server/src/personality.js`)
- [ ] Define message templates for state transitions
- [ ] Session finishes task: "Terminal 2 just wrapped up the API refactor."
- [ ] Multiple pending: "You're popular — both teams need you."
- [ ] All idle: "All quiet. Go grab a coffee."
- [ ] Session enters pending: "The api-server team needs your sign-off."
- [ ] Include personality messages in SSE state updates

### Avatar Panel
- [ ] Add `<video>` element to dashboard UI
- [ ] Map aggregate state to video source (idle/working/pending/thinking)
- [ ] Smooth video transitions on state change
- [ ] Create or source placeholder avatar videos

### UI Polish
- [ ] Favicon changes based on aggregate state
- [ ] Page title reflects state: "(1 pending) Claudia"
- [ ] Responsive layout: works on narrow and wide windows
- [ ] Dark/light mode (system preference)

**Shippable after Phase 4:** A polished, characterful receptionist experience.

---

## Phase 5: OS Integration

The last 20%. Native features that a browser tab can't provide.

### Terminal Focus (`packages/server/src/focus.js`)
- [ ] Define `focusTerminal(identifier)` interface
- [ ] Windows: PowerShell — find terminal window by title, `SetForegroundWindow`
- [ ] macOS: osascript — match terminal by window title
- [ ] Linux: xdotool/wmctrl — `windowactivate` by name
- [ ] Fallback: bring terminal app to front (no specific window match)
- [ ] Platform detection and strategy selection
- [ ] Test on each platform

### Future (Not Planned for v1)
- [ ] Native system tray (Tauri — Tier 2/3)
- [ ] Sound cues on Pending
- [ ] Session history / timeline
- [ ] Quick actions (approve/deny from Claudia)
- [ ] Multi-machine monitoring
- [ ] Theme/skin support

---

## Progress

| Phase | Status | Milestone |
|---|---|---|
| 1. Server Core | Not started | curl in, SSE out |
| 2. Web Dashboard | Not started | Live dashboard in browser |
| 3. CLI & Hooks | Not started | `npx claudia` works end-to-end |
| 4. Personality | Not started | Claudia has character |
| 5. OS Integration | Not started | Terminal focus works |
