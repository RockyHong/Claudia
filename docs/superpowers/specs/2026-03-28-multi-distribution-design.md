# Multi-Distribution Architecture

Three ways to run Claudia — same server core, same dashboard, different shells.

## Distributions

| # | Distribution | Window | Lifecycle | Build |
|---|---|---|---|---|
| 1 | `npx claudia` | Terminal + browser tab | Ctrl+C kills server | npm package (current) |
| 2 | Standalone app | Tauri desktop window (taskbar) | Red X / right-click close kills server + terminals | Tauri + 64-bit Node SEA |
| 3 | Wallpaper Engine | None (WE renders via CEF) | WE controls lifecycle | 32-bit Node SEA as Application wallpaper |

### Entry Points

- `bin/cli.js` — current, unchanged (npx)
- `bin/standalone.js` — starts server, Tauri loads `localhost:48901`, on window close kills server + child processes
- `bin/wallpaper.js` — starts server headless, no tray, no browser open. WE kills on wallpaper switch.

### Shared Core

`packages/server/` and `packages/web/` are unchanged. All three distributions run the same Express server and serve the same Svelte dashboard. The only difference is how the process starts and how it dies.

---

## Standalone Desktop App (Tauri)

Tauri shell spawns Node server as child process. Tauri webview loads `localhost:48901`.

### Why Tauri

- ~5MB vs ~150MB (Electron)
- Uses OS webview (WebView2 on Windows, WebKit on macOS) — no Chromium bundled
- Dashboard is already a standalone web app, no platform-specific APIs needed

### Window Behavior

- Normal desktop window, icon in taskbar
- Resizable, can go fullscreen
- Red X = close app = kill server + kill all spawned terminals
- Right-click taskbar icon = standard "Close window"

### Child Process Lifecycle

- Tauri `setup()` spawns the Node SEA server binary as a sidecar
- Server stdout/stderr piped to Tauri logs
- On window close: Tauri sends `POST /api/shutdown` to server, then force-kills if timeout
- **Windows:** Job Object created at startup. Server process + all spawned terminals assigned. `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE` ensures everything dies even on crash.
- **macOS:** Process group kill on close.

### Build Output

- Windows: `Claudia-Setup.exe` (~10-15MB — Tauri shell + Node SEA server + web assets)
- macOS: `Claudia.dmg`
- Published as GitHub Release assets

---

## Wallpaper Engine Distribution

32-bit Node SEA `.exe` as an Application wallpaper. WE manages the process lifecycle. WE's CEF renders the dashboard via localhost.

### Workshop Package

```
claudia-wallpaper/
  project.json          WE config: type "application", points to server.exe
  server.exe            32-bit Node SEA (Express + web assets)
  index.html            loads localhost:48901 (iframe or redirect)
  preview.jpg           Workshop thumbnail
```

### How It Works

1. User subscribes on Steam Workshop, applies the wallpaper
2. WE launches `server.exe` — Express starts on `localhost:48901`
3. WE renders `index.html` in its CEF layer — which loads the dashboard from localhost
4. User switches wallpaper — WE kills `server.exe` — server dies, spawned terminals die (Job Object)

### Platform Scope

Windows-only. Wallpaper Engine is a Windows application.

---

## Universal Hook Management

All three distributions self-configure on first launch. No separate `claudia init` step required.

### Server API

Two new endpoints in `routes-api.js`:

- `GET /api/hooks/status` — calls `readSettings()` + `hasClaudiaHooks()`, returns `{ installed: boolean }`
- `POST /api/hooks/install` — runs init logic non-interactively, returns `{ success: boolean, error?: string }`

### Frontend — Hook Gate

On dashboard load, fetch `/api/hooks/status`. If not installed:

- Full-page overlay blocks the dashboard
- Message: "Claudia needs to install hooks in Claude Code to work"
- Single button: "Install Hooks"
- On click: `POST /api/hooks/install` — shows result — overlay dismisses on success
- Dashboard loads normally after

### Settings Integration

Settings modal gets a "Hooks" section:

- Status indicator: "Hooks installed" / "Hooks not installed"
- "Reinstall Hooks" button (for updates or repair)

### CLI `init` Stays

`npx claudia init` still works as a standalone command — useful for scripting or CLI-first users. But it's no longer a required step for any distribution.

---

## Build Pipeline

### Node SEA (Single Executable Application)

Bundles Node.js runtime + server code + web assets into a single executable.

**Two builds:**
- **64-bit** — used by Tauri standalone app as sidecar
- **32-bit** — used by Wallpaper Engine Application wallpaper

**Build steps:**
1. `npm run build` (web assets)
2. Bundle server code into single JS file via `esbuild`
3. Generate SEA blob via `node --experimental-sea-config sea-config.json`
4. Copy `node.exe`, inject blob via `postject`
5. Embed static assets (web dist, avatars, SFX) using Node SEA's `sea.getAsset()` API
6. For 32-bit: use 32-bit `node.exe` as the base

### Tauri Build

- Tauri CLI builds the native shell
- SEA server binary copied into Tauri bundle as a sidecar
- `tauri build` produces the installer

### CI (GitHub Actions)

```
build-sea-x64    -> server-x64.exe
build-sea-x86    -> server-x86.exe (for WE)
build-tauri-win  -> Claudia-Setup.exe (bundles server-x64.exe as sidecar)
build-tauri-mac  -> Claudia.dmg (bundles server-x64 as sidecar)
package-we       -> claudia-wallpaper.zip (server-x86.exe + index.html + project.json)
```

All published as GitHub Release assets.

---

## Process Lifecycle & Cleanup

### npx (no change)

- Ctrl+C -> SIGINT -> server shuts down
- Spawned terminals survive (detached, `unref()`'d) — current behavior, intentional

### Standalone (Tauri)

- Red X / right-click close -> Tauri cleanup handler fires
- **Windows:** Job Object created at Tauri startup. Server + all spawned terminals assigned. Window close -> Job Object closes -> OS kills everything.
- **macOS:** Process group. `kill(-pgid)` on close.
- Crash safety: Job Object / process group ensures cleanup even on hard crash.

### Wallpaper Engine

- User switches wallpaper -> WE kills `server.exe`
- Server creates its own Job Object at startup (no Tauri to do it). Spawned terminals assigned to it.
- Server dies -> Job Object closes -> terminals die.

### Spawner Managed Mode

The spawner gains a `managed` flag. When enabled, spawned processes are added to the Job Object instead of being detached with `unref()`.

```
bin/cli.js         -> managed: false (terminals detached, survive server)
bin/standalone.js  -> managed: true  (Tauri creates Job Object)
bin/wallpaper.js   -> managed: true  (server creates Job Object)
```

---

## Non-Goals

- Linux standalone app (no Tauri Linux build in v1)
- macOS Wallpaper Engine (WE is Windows-only)
- Auto-update mechanism (GitHub Releases + manual download for now)
- Bundling Claude Code itself (user installs it separately)
