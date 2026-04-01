# Tech Stack

Ground rules for technology choices, patterns, and architecture.

---

## Stack

| Layer | Choice | Config/Entry |
|---|---|---|
| Runtime | Node.js 18+, ES modules | `"type": "module"` in all package.json |
| Package manager | npm, workspaces | Root `package.json` → `packages/*` |
| Server | Express 5 | `packages/server/src/index.js` |
| Real-time | SSE (Server-Sent Events) | `res.write()` on held response, `GET /events` |
| Frontend | Svelte 5, Vite | `packages/web/`, runes syntax |
| Testing | Vitest | `*.test.js` co-located, runs with defaults |
| Linting | Biome | Lint + format in one tool, runs with defaults |
| Desktop | Tauri (Rust shell) | `src-tauri/` |
| Standalone binary | Node SEA (Single Executable App) | `scripts/build-sea.js` |

## Production Dependency

**Two: `express` and `adm-zip`.** Everything else is hand-rolled or dev-only. This is intentional — don't add dependencies without a strong reason.

Hand-rolled instead of libraries:
- SSE broadcast (`res.write()` loop in `index.js`)
- Multipart upload parsing (`multipart.js`, ~60 lines)
- SFX synthesis (Web Audio API in `sfx.js`)
- Hook config management (`hooks.js`)

---

## Architecture Rules

### Data flow is unidirectional

```
Hooks (POST) ──► Server (state machine) ──► SSE ──► Browser
                                    ◄── HTTP POST (focus, launch, settings)
```

No WebSocket. SSE covers server→browser push. Browser→server is plain HTTP POST for actions. Don't introduce bidirectional channels.

### Separation of concerns

Each module owns one thing. Don't cross boundaries. See `docs/overview.md` → Module Index for the full list. Key boundaries:

- **Transport** (`index.js`) ↔ **API** (`routes-api.js`) ↔ **State** (`session-tracker.js`)
- **Transform** (`hook-transform.js`) — raw stdin → event, no other job
- **OS** (`focus.js`, `job-object.js`) — all platform-specific code isolated here
- **Storage** (`avatar-storage.js`, `project-storage.js`, `preferences.js`) — file I/O only
- **External** (`claude-status.js`, `usage.js`) — outbound API calls, cached

If you're importing across these in unexpected directions, the boundary is wrong.

### Module size ceiling

~200 lines per file. If a module grows past this, split by responsibility.

### Function style

- Functions do one thing
- `const` by default, `let` only for reassignment, never `var`
- Async/await over raw promises
- No classes unless instance state is clearly needed
- Error handling at boundaries, not deep in logic

### Naming

Self-documenting. `getSessionDisplayName(cwd)` not `getName(s)`. Booleans as natural language: `isStale`, `hasActiveSession`.

---

## Frontend Patterns

- **Svelte 5 runes**: `$state`, `$derived`, `$effect` — no legacy reactive syntax
- **Props down, events up** — components don't reach into parents
- **One component, one concern** — small, focused files
- **No CSS framework** — hand-written CSS in component `<style>` blocks
- **Video**: HTML `<video>` with `loop` attribute for avatars
- **Audio**: Web Audio API for synth tones, `<audio>` for MP3 fallback

## Server Patterns

- **ES modules only** — `import`/`export`, never `require()`
- **Flat module structure** — all server modules in `packages/server/src/`, no nested dirs
- **Co-located tests** — `foo.js` and `foo.test.js` side by side
- **Platform code isolated** — OS-specific logic only in `focus.js` and `job-object.js`
- **Graceful degradation** — focus is best-effort (silent fail), hooks fail silently if server down

## Storage Locations

| What | Where |
|---|---|
| Hook config | `~/.claude/settings.json` |
| API credentials | `~/.claude/.credentials.json` |
| Avatar sets | `~/.claudia/avatars/{set-name}/` |
| Known projects | `~/.claudia/projects.json` |
| User preferences | `~/.claudia/config.json` |
| Default assets | `packages/server/assets/avatar/`, `packages/server/assets/icon.ico` |
| Shutdown token | Written at runtime, `mode 0o600` |

For details on each feature's data and API surface, see [docs/specs/](specs/index.md).

---

## Build & Distribution

| Script | Output | Notes |
|---|---|---|
| `npm run dev` | Dev server with watch | |
| `npm run build` | `packages/web/dist/` | Vite production build |
| `npm run bundle:server` | `dist/server-bundle.js` | esbuild, express kept external |
| `npm run build:sea:x64` | `dist/claudia-server-x64.exe` | Node SEA 64-bit |
| `npm run build:tauri` | Tauri app + SEA sidecar | Needs Rust toolchain |

CI: `.github/workflows/build.yml` — triggered by version tag push.

---

## Rejected Alternatives

| What | Why not |
|---|---|
| WebSocket / socket.io | Data flow is unidirectional, SSE is sufficient |
| React | Runtime overhead unnecessary, Svelte compiles away |
| Electron | ~150 MB for a simple dashboard |
| pnpm / yarn | npm ships with Node, no gain |
| Turborepo / Nx | Overkill for 2 packages |
| node-gyp / native addons | Shell commands already installed on every platform |
| ESLint + Prettier | Biome does both |
| multer / busboy | One upload endpoint, hand-rolled parser is simpler |
| howler.js | Web Audio API + `<audio>` covers it |
