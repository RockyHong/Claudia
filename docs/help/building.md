# Building Claudia

Two distributions, one codebase. Pick the one you need.

```
                  +-------------------+
                  |   Server Core     |
                  |   + Web Dashboard |
                  +--------+----------+
                           |
                  +--------+--------+
                  |                 |
              npx cldi      Standalone
              (npm package)    (desktop app)
```

---

## 1. npx (development / npm)

**What you get:** Terminal command that starts a local server + opens browser.

```bash
npm install
npm run build        # build the web UI
npx cldi          # start
```

That's it. No build step beyond the web UI.

---

## 2. Standalone Desktop App

**What you get:** `Claudia-Windows.zip` (extract and run) or `Claudia.dmg` (drag to Applications). Native window, no Node.js required. Single instance — launching again focuses the existing window. Close window = stop server.

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

This runs two things in sequence:

1. **`build:sea`** -- bundles the server + web UI into a single executable via Node SEA
2. **`npx tauri build`** -- builds the native window shell

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
                                                          +--> GitHub Release
build-standalone-mac -----> Claudia.dmg -----------------+    with all artifacts
```

Artifacts attached to the release:
- `Claudia-Windows.zip` -- portable exe (extract and run)
- `Claudia.dmg` -- macOS disk image (drag to Applications)

Manual trigger: Actions tab > "Build Distribution Artifacts" > Run workflow.

---

## Architecture at a glance

Both distributions run the same code:

| Layer | npx | Standalone |
|-------|-----|-----------|
| Window | Browser tab | Tauri (native) |
| Server | Node.js | Node SEA (64-bit) |
| Entry | `bin/cli.js` | `bin/standalone.js` |
| Child cleanup | Detached (survive) | Job Object (die together) |
| Lifecycle | Ctrl+C | Close window |

---

## Troubleshooting

Build issues are covered in the [troubleshooting guide](../help/troubleshooting.md#dev).
