# Building Claudia

Three distributions, one codebase. Pick the one you need.

```
                  +-------------------+
                  |   Server Core     |
                  |   + Web Dashboard |
                  +--------+----------+
                           |
            +--------------+--------------+
            |              |              |
        npx claudia    Standalone    Wallpaper Engine
        (npm package)  (desktop app) (desktop wallpaper)
```

---

## 1. npx (development / npm)

**What you get:** Terminal command that starts a local server + opens browser.

```bash
npm install
npm run build        # build the web UI
npx claudia          # start
```

That's it. No build step beyond the web UI.

---

## 2. Standalone Desktop App

**What you get:** `Claudia-Windows.zip` (extract and run) or `Claudia.dmg` (drag to Applications). Native window, taskbar icon, no Node.js required. Close window = stop server.

**How it works:** Tauri provides the native window shell (~5 MB). Inside it, a Node SEA (Single Executable Application) runs the server. Tauri's webview loads `localhost:48901`. No installer — just the exe.

### Prerequisites

| Tool | Why | Install |
|------|-----|---------|
| Node.js 22+ | SEA requires recent Node | `nvm install 22` |
| Rust + Cargo | Tauri is a Rust app | [rustup.rs](https://rustup.rs/) |
| npm | Package manager | Comes with Node |
| @tauri-apps/cli | Tauri build toolchain | `npm install -D @tauri-apps/cli` |

### Build

```bash
npm install
npm run build:tauri
```

This runs three things in sequence:

1. **`build:sea:x64`** -- bundles the server into a single `.exe` via Node SEA
2. **`npm run build`** -- builds the web UI
3. **`npx tauri build`** -- builds the native window shell

Output:
- Windows: `src-tauri/target/release/Claudia.exe` + sidecar — zip them together
- macOS: `src-tauri/target/release/bundle/dmg/Claudia.dmg`

### What's inside the SEA

```
node.exe (stripped)
  +-- server-bundle.js    (all server code, esbuild'd into one file)
  +-- web-dist.tar        (built web UI, embedded as SEA asset)
```

At startup the SEA extracts web assets to a temp dir and starts Express on port 48901. Tauri's webview points there.

### Manual step-by-step (if you need control)

```bash
# 1. Bundle server code
npm run bundle:server          # -> dist/server-bundle.js

# 2. Build web UI
npm run build                  # -> packages/web/dist/

# 3. Build the SEA executable
npm run build:sea:x64          # -> dist/claudia-server-x64.exe

# 4. Copy SEA into Tauri's sidecar dir
#    Tauri requires the target triple suffix — use `rustc -vV | grep host` to find yours
# Windows:
cp dist/claudia-server-x64.exe src-tauri/binaries/claudia-server-x86_64-pc-windows-msvc.exe
# macOS Apple Silicon:
# cp dist/claudia-server-x64 src-tauri/binaries/claudia-server-aarch64-apple-darwin
# macOS Intel:
# cp dist/claudia-server-x64 src-tauri/binaries/claudia-server-x86_64-apple-darwin

# 5. Build Tauri
npx tauri build
```

---

## 3. Wallpaper Engine

**What you get:** A Steam Workshop item. Claudia runs as your desktop wallpaper.

**How it works:** Wallpaper Engine launches a 32-bit `.exe` (Node SEA) that runs the server. WE's built-in browser renders `index.html`, which iframes `localhost:48901`. Switching wallpaper kills the server.

### Prerequisites

| Tool | Why |
|------|-----|
| Node.js 22+ (32-bit) | WE requires 32-bit executables |
| npm | Package manager |

### Build

```bash
npm run build:we
```

This runs:

1. **`build:sea:x86`** -- builds a 32-bit Node SEA
2. **`package-we.js`** -- copies SEA + template files into a zip

Output: `dist/claudia-wallpaper.zip`

### What's in the zip

```
claudia-wallpaper/
  server.exe       32-bit Node SEA (Express + web UI baked in)
  project.json     WE config: type "application", launches server.exe
  index.html       Loads localhost:48901 in an iframe (with retry logic)
  preview.jpg      Workshop thumbnail (placeholder -- replace before publishing)
```

### Publishing to Steam Workshop

1. Build the zip
2. Extract to a folder
3. Replace `preview.jpg` with a real screenshot (620x348 recommended)
4. In Wallpaper Engine: Editor > Open from folder > select the folder
5. Upload to Workshop

---

## CI (GitHub Actions)

Push a version tag to build everything automatically:

```bash
git tag v0.1.0
git push origin v0.1.0
```

The workflow (`.github/workflows/build.yml`) runs:

```
build-sea-x64 (Windows) --> build-standalone-win (zip) --+
                                                          +--> release
build-sea-x86 (Windows) --> package-we (zip) ------------+        |
                                                          +--> GitHub Release
build-standalone-mac -----> Claudia.dmg -----------------+    with all artifacts
```

Artifacts attached to the release:
- `Claudia-Windows.zip` -- portable exe (extract and run)
- `Claudia.dmg` -- macOS disk image (drag to Applications)
- `claudia-wallpaper.zip` -- Wallpaper Engine package

Manual trigger: Actions tab > "Build Distribution Artifacts" > Run workflow.

---

## Architecture at a glance

All three distributions run the same code:

| Layer | npx | Standalone | Wallpaper Engine |
|-------|-----|-----------|------------------|
| Window | Browser tab | Tauri (native) | WE's CEF |
| Server | Node.js | Node SEA (64-bit) | Node SEA (32-bit) |
| Entry | `bin/cli.js` | `bin/standalone.js` | `bin/wallpaper.js` |
| Child cleanup | Detached (survive) | Job Object (die together) | Job Object (die together) |
| Lifecycle | Ctrl+C | Close window | Switch wallpaper |

---

## Troubleshooting

**SEA build fails with "postject" errors**
- Make sure you're on Node 22+. SEA support matured in Node 20 but asset embedding requires 22.
- On Windows: run from an elevated terminal if signature removal fails.

**Tauri build fails**
- Install Rust: `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`
- Windows: install [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) with "Desktop development with C++".

**WE wallpaper shows blank screen**
- Server takes a moment to start. The iframe retries for 30 seconds.
- Check if port 48901 is free: `netstat -ano | findstr :48901`

**Bundle fails with import errors**
- Run `npm install` first. esbuild needs to be installed.
- The server bundle keeps `express` external -- it must be available at runtime (SEA embeds it via the bundle, npm provides it for dev).
