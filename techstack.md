# Tech Stack

Decisions and reasoning for Claudia's technology choices.

---

## Design Principles

These principles guide every choice below:

1. **Fast init/install** — `npx claudia` and you're running. No build step for the user, no global install required.
2. **Low OS coupling** — Core functionality is pure Node.js + browser. OS-specific features (terminal focus) are isolated behind a pluggable abstraction.
3. **Quick launch** — Server starts in <1s. UI is a browser tab, not a heavy app shell.
4. **Don't reinvent the wheel** — Use built-in platform capabilities (SSE, HTML `<video>`) before reaching for libraries.
5. **Separation of concerns** — Transport, state, presentation, and OS integration are independent layers.
6. **First principles** — Every dependency earns its place. If the platform provides it, don't wrap it.

---

## Architecture Decision: SSE Over WebSocket

The overview implies WebSocket for real-time UI updates. But the actual data flow is:

- **Hooks to Claudia**: HTTP POST (already decided)
- **Claudia to Browser**: unidirectional state pushes
- **Browser to Claudia**: Focus button click (plain HTTP POST)

There is no bidirectional channel. **Server-Sent Events (SSE)** is the correct primitive:

- Built into every browser — zero client library
- Auto-reconnect is native behavior
- Works over plain HTTP — no upgrade handshake
- No server library needed — just `res.write()` on a held-open response

This eliminates `ws`, `socket.io`, and their associated complexity.

---

## Architecture Decision: Tier 1 Is the Product

The overview frames the browser version as a "zero install compromise" with Tauri as the real target. From first principles, that's backwards:

- A browser tab displaying session state covers the core value proposition
- The only thing a browser *can't* do is focus other OS windows — and knowing *which* terminal needs you (then alt-tabbing) is 90% of the value

**Tier 1 (Node.js + browser) is the product.** Tauri is a future enhancement layer, not the goal. This means:

- All core logic lives in Node.js, not Rust
- The UI is a Svelte app served by Express, not a Tauri webview
- Terminal focus is a best-effort feature via platform shell commands, not a hard requirement

---

## Tech Choices

### Runtime & Package Management

| Choice | Detail | Reasoning |
|---|---|---|
| **Node.js 18+** | Minimum version | Claude Code already requires it — zero extra ask from users |
| **npm** | Package manager | Ships with Node, `npx` is npm-native. Adding pnpm/yarn is a dependency for no gain |
| **npm workspaces** | Monorepo | Built-in, no Turborepo/Nx overhead for 2-3 packages |

### Server

| Choice | Detail | Reasoning |
|---|---|---|
| **Express 5** | HTTP server | Universal knowledge, massive middleware ecosystem, boring in the best way |
| **SSE** | Real-time updates | Unidirectional fits perfectly, auto-reconnect free, zero dependencies |
| **No WebSocket** | Eliminated | No bidirectional need. SSE is simpler and sufficient |

### Frontend

| Choice | Detail | Reasoning |
|---|---|---|
| **Svelte 5** | UI framework | Compiles to tiny vanilla JS (quick launch), built-in reactivity (don't reinvent the wheel), component model (SOC), natural Tauri frontend if Tier 2 ever happens |
| **Vite** | Build tool | Only sane choice with Svelte, fast HMR, near-zero config |
| **HTML `<video>`** | Avatar playback | Native browser element, zero dependencies, loop attribute built-in |

### Quality

| Choice | Detail | Reasoning |
|---|---|---|
| **Vitest** | Testing | Vite-native, fast, Jest-compatible API |
| **Biome** | Lint + format | Single tool replaces ESLint+Prettier, Rust-fast, minimal config |

### OS Integration

| Choice | Detail | Reasoning |
|---|---|---|
| **Platform shell scripts** | Terminal focus | PowerShell (Windows), osascript (macOS), xdotool/wmctrl (Linux) — already installed, no native Node addons, no `node-gyp` |
| **Pluggable strategy** | Abstraction | `focusTerminal(sessionId)` calls the right script per platform. Fails gracefully to no-op. Core app has zero OS knowledge |

---

## What We're Not Using (and Why)

| Rejected | Why |
|---|---|
| **WebSocket / socket.io** | SSE covers our unidirectional need without a custom protocol layer |
| **React** | 40KB+ runtime for a session list is unjustifiable when Svelte compiles away |
| **Electron** | ~150MB for 5 rows of text and a video. Ruled out entirely |
| **Tauri (for v1)** | Real value is in Tier 1. Tauri is a future layer, not a prerequisite |
| **pnpm / yarn** | npm ships with Node. Extra package manager is a dependency with no gain for this project |
| **Turborepo / Nx** | Overkill for 2-3 packages. npm workspaces is sufficient |
| **Native Node addons** | `node-gyp` pain, platform build toolchain requirements. Shell commands are simpler and already installed |
| **ESLint + Prettier** | Two tools, two configs, two sets of plugins. Biome does both in one |

---

## How It All Connects

```
~/.claude/settings.json (hooks)
        │
        │  Claude Code fires shell commands on events
        │  curl -s POST http://localhost:48901/event {...}
        │
        ▼
Express server (localhost:48901)
        │
        ├── POST /event          ← receives hook data
        ├── GET  /events         ← SSE stream for UI
        ├── POST /focus/:id      ← triggers terminal focus
        └── GET  /               ← serves Svelte app (pre-built static files)
                    │
                    │  SSE (EventSource)
                    ▼
           Browser tab (localhost:48901)
                    │
                    ├── Session list (reactive, Svelte)
                    ├── Avatar video (HTML <video>)
                    ├── Status messages (personality templates)
                    └── SFX (Web Audio API, on state transitions)
```

All localhost. Nothing leaves the machine. If Claudia isn't running, hooks fail silently. Claude Code is completely unaffected.
