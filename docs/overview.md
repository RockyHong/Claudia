# Claudia — Project Overview

Local session monitor for Claude Code. Just hooks, state tracking, and a dashboard.

---

## Problem

A developer running multiple Claude Code sessions across terminals lacks a centralized view. They tab-switch constantly to check: is it done? Does it need permission? Which terminal? The more sessions, the worse it gets.

## Solution

Claudia is a local receptionist that watches all Claude Code sessions from one place. It uses Claude Code's hook system to receive events, tracks state per session, and renders a live dashboard showing who's idle, who's busy, and who's waiting on the user — with one-click terminal focus.

Template-based personality messages. Pure event-driven state tracking.

## User

Solo developer or power user running 2+ Claude Code sessions simultaneously. Already has Node.js (required by Claude Code).

## User Flow

1. `npx @rockyhong/claudia` — starts server on `localhost:48901`, opens browser dashboard
2. Dashboard prompts hook installation on first run (one-time)
3. User works in their terminals as usual — hooks fire automatically
4. Dashboard shows all sessions: state, elapsed time, current tool, project name
5. Session enters pending → avatar changes, sound plays, personality message appears
6. User clicks session card → terminal focus jumps to that window
7. `npx @rockyhong/claudia uninstall` — removes hooks and data cleanly

Hooks fail silently when the server is down — Claude Code keeps working normally.

## Features

- **Session tracking** — live state machine, subagent awareness, aggregate state ([spec](specs/sessions.md))
- **Hook protocol** — 9 hook types, stdin JSON, silent failure design ([spec](specs/hooks.md))
- **Dashboard** — single-screen layout, immersive mode, sound, status indicators, modals ([spec](specs/dashboard.md))
- **Avatars** — video personality reacting to aggregate state, custom sets, import/export ([spec](specs/avatars.md))
- **Spawning & focus** — launch sessions, terminal linking, window focus with flash ([spec](specs/spawning.md))

See [docs/specs/](specs/index.md) for product-level behavior, design decisions, and cross-module flows.

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
- **API**: `routes-api.js` — REST endpoints for all features

## Distribution

Two entry points, same server code. Build details in `docs/building.md`.

| Entry | Shell | Runtime |
|---|---|---|
| `bin/cli.js` | Browser tab | Node.js (npx) |
| `bin/standalone.js` | Tauri native window | Node SEA 64-bit + Tauri |

### CLI commands

After `npm i -g @rockyhong/claudia` (or via `npx @rockyhong/claudia ...`):

| Command | What it does |
|---|---|
| `claudia` | Starts the server on `localhost:48901` and opens the dashboard. Replaces any existing instance. |
| `claudia md` | Opens the markdown viewer in your browser for the current working directory. Requires Claudia to be running. |
| `claudia shutdown` | Stops the running instance. |
| `claudia uninstall` | Removes hooks, `~/.claudia/` data, and SEA runtime temp (interactive). |

---

## Module Index

### Server — `packages/server/src/`

| File | Does |
|---|---|
| `index.js` | Express app, SSE broadcast, `/hook/:type`, `/event`, server lifecycle |
| `routes-api.js` | REST endpoints: projects, avatars, usage, focus, launch, terminals, hooks, preferences, claude-status |
| `session-tracker.js` | Session registry, state machine, display names, stale pruning, subagent gating |
| `hook-transform.js` | Raw stdin JSON → internal event format |
| `transcript-scan.js` | Count pending Agent invocations from a session's transcript JSONL — drives subagent gating |
| `hooks.js` | Read/write `~/.claude/settings.json` hook config |
| `personality.js` | Status message templates per state transition |
| `focus.js` | Terminal focus, flash, window enumeration — platform shell commands |
| `spawner.js` | Launch Claude Code sessions, folder browsing, open folder/terminal/URL |
| `terminal-title.js` | Opaque terminal title generation for HWND discovery |
| `avatar-storage.js` | Avatar set CRUD (`~/.claudia/avatars/`) |
| `multipart.js` | Multipart form-data parser (hand-rolled) |
| `project-storage.js` | Known project paths cache (`~/.claudia/projects.json`) |
| `git-status.js` | Git branch/status for session metadata |
| `usage.js` | Claude API usage/cost from `~/.claude/.credentials.json` |
| `sfx.js` | SFX file serving and preview |
| `preferences.js` | User config read/write (`~/.claudia/config.json`) |
| `claude-status.js` | Claude platform status polling from status.claude.com |
| `md-files.js` | Serves project markdown files |
| `job-object.js` | Windows Job Object — child process cleanup for standalone |
| `lifecycle.js` | Shared lifecycle state for managed distributions |

### Web — `packages/web/src/`

| File | Does |
|---|---|
| `App.svelte` | Root layout, reactive state, document title, theme |
| `main.js` | Svelte app entry point |
| `md-viewer.js` | Markdown file viewer entry point |
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
| `lib/ClaudeStatus.svelte` | Platform status indicator dot |
| `lib/DropZone.svelte` | Drag-and-drop file upload |
| `lib/ConfirmDialog.svelte` | Confirmation dialog |
| `lib/ToggleSlider.svelte` | Toggle switch |
| `lib/Modal.svelte` | Reusable modal shell |
| `lib/Tooltip.svelte` | Shared tooltip component |
| `lib/ConsentModal.svelte` | Usage monitoring consent prompt |
| `lib/DisconnectCover.svelte` | Server disconnected overlay |
| `lib/sse.js` | EventSource client, auto-reconnect, connection status |
| `lib/sfx.js` | Sound effects: Web Audio API synth + MP3 fallback |
| `lib/ambience.js` | Ambient background effects |
| `lib/tauri-bridge.js` | Tauri API integration for standalone mode |

### Other Paths

| Path | Contains |
|---|---|
| `src-tauri/` | Tauri config, Rust shell, sidecar binaries |
| `scripts/` | `bundle-server.js`, `build-sea.js`, `sea-entry-template.js` |
| `docs/building.md` | Build instructions for both distributions |
| `docs/specs/` | Feature specs — source of truth per feature |
| `packages/server/assets/` | Default avatar videos (`avatar/`), app icon |
