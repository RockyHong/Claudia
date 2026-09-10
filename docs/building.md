# Building Claudia

Two distributions, one codebase. Pick the one you need.

1. [npx (development / npm)](#1-npx-development--npm) — terminal command, no build step
2. [Standalone Desktop App](#2-standalone-desktop-app) — portable exe / dmg, no Node required

---

## 1. npx (development / npm)

**What you get:** Terminal command that starts a local server + opens browser.

```bash
npm install
npm run build        # build the web UI
npx @rockyhong/claudia          # start
```

That's it. No build step beyond the web UI.

---

## 2. Standalone Desktop App

**What you get:** `claudia.exe` (run directly) or `Claudia_<version>_aarch64.dmg` (drag to Applications, Apple Silicon only). Native window, no Node.js required. Single instance — launching again focuses the existing window. Close window = stop server.

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

1. **`clean`** -- removes previous build output (`dist/`, `packages/web/dist/`, `src-tauri/target/`)
2. **`build:sea`** -- bundles the server + web UI into a single executable via Node SEA
3. **`npx tauri build`** -- builds the native window shell

Output:
- Windows: `src-tauri/target/release/claudia.exe` — self-contained; the SEA server is compiled in via `include_bytes!`, so nothing ships alongside it
- macOS: `src-tauri/target/release/bundle/dmg/Claudia_<version>_aarch64.dmg` (and the unpacked `bundle/macos/Claudia.app`)

### What's inside the SEA

```
node.exe (stripped)
  +-- server-bundle.js    (all server code, esbuild'd into one file)
  +-- web-dist.tar        (built web UI, embedded as SEA asset)
```

At startup the SEA extracts web assets to a temp dir and starts Express on port 48901. Tauri's webview points there.

### Manual step-by-step (if you need control)

Script→output mapping is stated once in [`docs/techstack.md` § Build & Distribution](techstack.md#build--distribution); the arrows below are procedural context for the order.

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

### Cleaning up

All builds are clean builds — `build:sea` and `build:tauri` run `npm run clean` automatically before building.

| Command | What it removes |
|---------|----------------|
| `npm run clean` | Build output: `dist/`, `packages/web/dist/`, `.svelte-kit/`, `src-tauri/target/`, sidecar binaries |
| `npx @rockyhong/claudia uninstall` | Hooks, `~/.claudia/` data dir, and SEA runtime temp (with confirmation prompt) |

---

## CI (GitHub Actions)

Push a version tag to build everything automatically:

```bash
git tag v0.1.0
git push origin v0.1.0
```

The workflow (`.github/workflows/build.yml`) runs:

```
audit          (npm audit, non-blocking)

build-windows  --> claudia.exe                --+
                                                 +--> release --> GitHub Release
build-macos    --> Claudia_<ver>_aarch64.dmg  --+   (tags only)
```

`release` runs only when the ref is a `v*` tag, so `workflow_dispatch` produces artifacts without publishing. It waits on both build jobs; `audit` reports independently and never blocks.

Artifacts attached to the release:
- `claudia.exe` -- portable Windows executable, run directly
- `Claudia_<version>_aarch64.dmg` -- macOS disk image, Apple Silicon only

Manual trigger: Actions tab > "Build & Release" > Run workflow.

### macOS code signing (deliberately off)

Claudia ships unsigned by choice, not by omission. The releases exist so the author can install Claudia on their own machines; there is no wider audience to protect from the "damaged" message, and the `xattr` one-liner costs its single user a few seconds per install. The same reasoning covers the unsigned Windows executable and the absence of an Intel macOS build. Revisit only if Claudia acquires users who are not the author — then signing pays for itself immediately, because "damaged" reads as a broken download to anyone who does not know better.

The wiring below is already in place and stays inert until the secrets exist, so enabling it later is a settings change rather than a CI rewrite.

By default the macOS job produces an **unsigned** bundle. macOS quarantines unsigned downloads and reports them as "damaged" — users have to clear the flag by hand (see [troubleshooting](help/troubleshooting.md#macos-claudia-is-damaged-and-cant-be-opened)).

To sign and notarize instead, add these repository secrets. The workflow detects them and enables signing automatically; with any of the first two missing it builds unsigned exactly as before and logs a warning.

| Secret | What it is |
|---|---|
| `APPLE_CERTIFICATE` | Base64 of the exported Developer ID Application `.p12` |
| `APPLE_CERTIFICATE_PASSWORD` | Password set when exporting that `.p12` |
| `APPLE_SIGNING_IDENTITY` | Full identity name, e.g. `Developer ID Application: Name (TEAMID)` |
| `APPLE_ID` | Apple account email (notarization) |
| `APPLE_PASSWORD` | App-specific password, not the account password (notarization) |
| `APPLE_TEAM_ID` | Team ID from the Apple Developer membership page |

Requires a paid Apple Developer Program membership. The embedded SEA server binary needs no separate handling — it lives inside the Rust executable via `include_bytes!` and is already ad-hoc signed by `scripts/build-sea.js` after postject injection, so notarization does not see it as a nested executable.

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

Build issues are covered in the [troubleshooting guide](help/troubleshooting.md#dev).
