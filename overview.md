# Claudia — Project Overview

Local session monitor for Claude Code. Just hooks, state tracking, and a dashboard.

---

## Problem

A developer running multiple Claude Code sessions across terminals has no centralized view. They tab-switch constantly to check: is it done? Does it need permission? Which terminal? The more sessions, the worse it gets.

## Solution

Claudia is a local receptionist that watches all Claude Code sessions from one place. It uses Claude Code's hook system to receive events, tracks state per session, and renders a live dashboard showing who's idle, who's busy, and who's waiting on the user — with one-click terminal focus.

No AI, no LLM. Template-based personality messages. Pure event-driven state tracking.

## User

Solo developer or power user running 2+ Claude Code sessions simultaneously. Already has Node.js (required by Claude Code).

## User Flow

1. `npx claudia` — starts server on `localhost:48901`, opens browser dashboard
2. Dashboard prompts hook installation on first run (one-time)
3. User works in their terminals as usual — hooks fire automatically
4. Dashboard shows all sessions: state, elapsed time, current tool, project name
5. Session enters pending → avatar changes, sound plays, personality message appears
6. User clicks session card → terminal focus jumps to that window
7. `npx claudia teardown` — removes hooks cleanly

If Claudia isn't running, hooks fail silently. Claude Code is unaffected.

## Features

- **Session list** — all active Claude Code sessions with live state, elapsed time, last tool
- **State detection** — idle (green), busy (blue pulsing), pending (orange pulsing)
- **Terminal focus** — click to raise the right terminal window (Windows/macOS/Linux)
- **Avatar** — video avatar that changes by aggregate state (pending > busy > idle)
- **Custom avatar sets** — upload/manage via settings, stored in `~/.claudia/avatars/`
- **Sound effects** — Web Audio synth tones on state transitions, custom MP3 override
- **Personality messages** — receptionist-style status text from templates (`personality.js`)
- **Session spawning** — launch new Claude Code sessions from the dashboard
- **Usage display** — API cost/usage rings from credentials
- **Hook gate** — first-run UX prompts hook installation if missing
- **Project browser** — browse/select known project folders
- **Dynamic favicon** — tab icon color matches aggregate state
- **Dark/light mode** — follows system preference

---

## Data Flow

```
Claude Code sessions ──► hooks (stdin JSON via POST) ──► Claudia server ──► SSE ──► Dashboard
                                                              │
                                                         state machine
                                                         per session
```

- **In**: `POST /hook/:type` — raw Claude Code stdin JSON, transformed by `hook-transform.js`
- **In (legacy)**: `POST /event` — pre-formatted `{session, state, tool, cwd, message, ts}`
- **Out**: `GET /events` — SSE `state_update` messages to browser (`EventSource`)
- **API**: `routes-api.js` — projects, avatars, usage, focus, launch, terminals, hooks status

## Session States

| State | Trigger hooks | Meaning |
|---|---|---|
| `idle` | `SessionStart`, `Stop` | Waiting for user input |
| `busy` | `UserPromptSubmit`, `PreToolUse`, `PostToolUse` | Working |
| `pending` | `PermissionRequest`, `Notification` | Needs user attention |
| `stopped` | `SessionEnd` | Session closed |

Aggregate rule: `pending` > `busy` > `idle` (highest priority wins for avatar/favicon).

No debouncing — `PreToolUse`/`PostToolUse` both map to `busy`, stays busy until `Stop`.

Stale pruning: no event for 10 min → session removed.

## Hook Protocol

Hooks installed in `~/.claude/settings.json` via the dashboard (first-run prompt or Settings → Reinstall). Claude Code passes context as **stdin JSON** (not env vars). The `"hooks"` key wraps all hook arrays. See `packages/server/src/hooks.js` for exact config shape.

8 hook types: `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PermissionRequest`, `Notification`, `Stop`, `SessionEnd`.

## SSE Payload

```json
{
  "type": "state_update",
  "sessions": [{ "id", "state", "cwd", "displayName", "lastTool", "lastEvent", "pendingMessage" }],
  "aggregateState": "pending",
  "statusMessage": "The frontend crew needs your sign-off."
}
```

## Display Name

`cwd` → last path segment. `/home/user/projects/api-server` → `api-server`. Duplicate cwds get a short session ID suffix. Logic in `session-tracker.js:extractDisplayName()`.

---

## Distribution

Two entry points, same server code. Build details in `docs/building.md`.

| Entry | Shell | Runtime |
|---|---|---|
| `bin/cli.js` | Browser tab | Node.js (npx) |
| `bin/standalone.js` | Tauri native window | Node SEA 64-bit + Tauri |

CLI: `npx claudia` / `npx claudia teardown`

---

## Server Modules — `packages/server/src/`

| File | Does |
|---|---|
| `index.js` | Express app, SSE broadcast, `/hook/:type`, `/event`, server lifecycle |
| `routes-api.js` | REST endpoints: projects, avatars, usage, focus, launch, terminals, hooks |
| `session-tracker.js` | Session registry, state machine, display names, stale pruning |
| `hook-transform.js` | Raw stdin JSON → internal event format |
| `hooks.js` | Read/write `~/.claude/settings.json` hook config |
| `personality.js` | Status message templates per state transition |
| `focus.js` | Terminal focus — platform shell commands (PowerShell / osascript / xdotool) |
| `spawner.js` | Launch Claude Code sessions from dashboard |
| `terminal-title.js` | Unique terminal title generation for spawned sessions |
| `avatar-storage.js` | Avatar set CRUD (`~/.claudia/avatars/`) |
| `multipart.js` | Multipart form-data parser (hand-rolled, no deps) |
| `project-storage.js` | Known project paths cache (`~/.claudia/projects.json`) |
| `git-status.js` | Git branch/status for session metadata |
| `usage.js` | Claude API usage/cost from `~/.claude/.credentials.json` |
| `sfx-preview.js` | Inline HTML page for SFX testing |
| `job-object.js` | Windows Job Object — child process cleanup for standalone |
| `lifecycle.js` | Shared lifecycle state for managed distributions |

## Web — `packages/web/src/`

| File | Does |
|---|---|
| `App.svelte` | Root layout, reactive state, document title, theme |
| `lib/SessionList.svelte` | Session card list, empty state |
| `lib/SessionCard.svelte` | Single session row: name, state dot, elapsed time, tool, focus |
| `lib/StatusBar.svelte` | Footer: aggregate state, personality message, count |
| `lib/AvatarPanel.svelte` | Video avatar, switches source by aggregate state |
| `lib/AvatarModal.svelte` | Avatar set browser/selector |
| `lib/AvatarSetEditor.svelte` | Upload/manage files in an avatar set |
| `lib/AvatarTab.svelte` | Settings tab: avatar config |
| `lib/ConfigTab.svelte` | Settings tab: general config |
| `lib/SettingsModal.svelte` | Settings modal with tabs |
| `lib/SpawnPopover.svelte` | Launch new Claude Code session |
| `lib/HookGate.svelte` | First-run gate: prompts hook installation |
| `lib/UsageRings.svelte` | API usage/cost ring visualization |
| `lib/DropZone.svelte` | Drag-and-drop file upload |
| `lib/ConfirmDialog.svelte` | Confirmation dialog |
| `lib/ToggleSlider.svelte` | Toggle switch |
| `lib/Modal.svelte` | Reusable modal shell |
| `lib/sse.js` | EventSource client, auto-reconnect, connection status |
| `lib/sfx.js` | Sound effects: Web Audio API synth + MP3 fallback |

## Other Paths

| Path | Contains |
|---|---|
| `src-tauri/` | Tauri config, Rust shell, sidecar binaries |
| `scripts/` | `bundle-server.js`, `build-sea.js` |
| `docs/building.md` | Build instructions for both distributions |
| `packages/server/assets/` | Default avatar videos (`avatar/`), sound files (`sfx/`) |

---

## File Tree

```
claudia/
├── bin/cli.js, standalone.js
├── packages/
│   ├── server/src/          # 17 modules (see table)
│   │   └── assets/          # avatars/, sfx/
│   └── web/src/             # 19 files (see table)
├── src-tauri/               # Tauri shell
├── scripts/                 # Build scripts
├── docs/building.md
├── CLAUDE.md                # Dev instructions (read first)
├── overview.md              # This file
├── techstack.md             # Tech choices & patterns
└── todo.md                  # Open work items
```
