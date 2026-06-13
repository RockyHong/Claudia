# Tech Stack

Ground rules for technology choices, patterns, and architecture.

---

## Stack

| Layer | Choice | Config/Entry |
|---|---|---|
| Runtime | Node.js 20.19+ (or 22.12+), ES modules | `"type": "module"` in all package.json |
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

SSE covers server→browser push. Browser→server is plain HTTP POST for actions. Unidirectional by design.

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
- Classes only when instance state is clearly needed
- Error handling at boundaries, keep inner logic clean

### Naming

Self-documenting. `getSessionDisplayName(cwd)` not `getName(s)`. Booleans as natural language: `isStale`, `hasActiveSession`.

---

## Frontend Patterns

- **Svelte 5 runes**: `$state`, `$derived`, `$effect` — no legacy reactive syntax
- **Props down, events up** — components don't reach into parents
- **One component, one concern** — small, focused files
- **Hand-written CSS** — component `<style>` blocks, scoped by default
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

CI: `.github/workflows/build.yml` — triggered by version tag push. CI installs with `npm ci` (exact lockfile, no resolution drift).

### Dependency overrides (`package.json` → `overrides`)

Load-bearing — do not remove without re-verifying `npm ci` on both npm 10 and 11.

- **`@emnapi/core` / `@emnapi/runtime` / `@emnapi/wasi-threads`** pinned to one consistent version. Vite 8 is rolldown-based; `rolldown` lists `@rolldown/binding-wasm32-wasi` as an optional dep that pins `@emnapi/*` *exactly* while its own `@napi-rs/wasm-runtime` floats the same packages (`^1.7.1`). That conflict lives inside a wasm binding **never installed on any real platform** (native bindings win), so npm can't serialize a stable lock and different npm majors demand different versions from `npm ci`. Pinning collapses the conflict to a single version.
- **`esbuild: "$esbuild"`** dedupes vite's nested esbuild to the top-level `^0.28.1`. Without it npm may resolve vite's `^0.28.0` to the vulnerable 0.28.0 (advisory fixed in 0.28.1).

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

---

## Edit Discipline

`Edit replace_all: true` is naive whole-file string replace — no AST, no scope, no token boundaries. Running on common identifiers silently corrupts unrelated code (`state` → `swipe` rewrites `SwipeState` to `SwipeSwipe`, import paths, comments, CSS selectors). The trap is invisible until the next type-check.

**Preference order:**

1. **LSP rename** — symbol-aware, scope-respecting. Best for typed languages (TS, Rust, Go, Java, Python with pyright, C#).
2. **Per-occurrence Edit with unique surrounding context** — when LSP unavailable. Grep call sites; each Edit's `old_string` includes enough context to be unique to that call.
3. **`sed` / scripted bulk replace** — only when term is **8+ chars and unique to the domain** (`Conversation`, `MerchandiseInventory`). Always case-preserving pair: `s/OldName/NewName/g; s/oldName/newName/g; s/OLD_NAME/NEW_NAME/g`. Run build/test cycle immediately.
4. **`Edit replace_all: true`** — only on unique long string literals (URLs, full sentences, hash IDs). Never on identifiers <8 chars. Never on common English words.

**Pre-flight checklist (any bulk replace):**

1. Grep the exact term. Look at count + sample matches.
2. If hits >5 OR length <8 OR common English word → switch to options 1–3.
3. Scan sample matches for false positives (substrings inside other identifiers, string literals, CSS classes overlapping HTML tags, comments).
4. Any doubt → per-occurrence Edit. Caution token cost ≪ silent-corruption debug cost.

**Banned terms for `replace_all`** (always per-occurrence):
`state`, `name`, `data`, `value`, `item`, `key`, `id`, `type`, `props`, `node`, `text`, `link`, `error`, `result`, `body`, `head`, `main`, `time`, `path`, `file`, `index`, `count`, `child`, `style`, `class`, `tag`, `event`, `target`, `source`, `from`, `to`, `next`, `prev`, `init`, `done`.

**When a `replace_all` slips through:**

1. `git diff` first — see damage scope.
2. If uncommitted, `git checkout` the file and redo with the right tool.
3. If committed, fix as a NEW commit (preserves mistake in history).
4. Run type-check / lint / test — usually points straight at corruption.

Always run build/test after bulk operations.
