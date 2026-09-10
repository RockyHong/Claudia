# Tech Stack

> Living doc — **state dimension only** (what the stack *is* now). Skeleton sections (Runtime / Framework / Key Dependencies / Build & Distribution / Packages; Edit Discipline, fixed prose). Grown sections (Architecture Rules / Coding Patterns / Storage Locations) grow via doc-sync — every commit that touches a relevant area triggers a sync proposal, admitted per § Doc Sync. Rejected stack directions are history, not state → [`docs/decisions.md`](decisions.md), never a section here. See `CLAUDE.md` Doc Sync.

## Runtime

Node.js 20.19+ (or 22.12+), ES modules — `"type": "module"` in every `package.json`. Package manager: npm with workspaces, root `package.json` → `packages/*`.

## Framework

| Layer | Choice | Config/Entry |
|---|---|---|
| Server | Express 5 | `packages/server/src/index.js` |
| Real-time | SSE (Server-Sent Events) | `res.write()` on held response, `GET /events` |
| Frontend | Svelte 5, Vite | `packages/web/`, runes syntax |
| Testing | Vitest | `*.test.js` co-located, runs with defaults |
| Linting | Biome | Lint + format in one tool, runs with defaults |
| Desktop | Tauri (Rust shell) | `src-tauri/` |
| Standalone binary | Node SEA (Single Executable App) | `scripts/build-sea.js` |

## Key Dependencies

**Two production deps: `express` and `adm-zip`.** Everything else is hand-rolled or build-time. This is intentional — don't add dependencies without a strong reason.

`packages/web` is `private` and never published; the root package ships its compiled `dist/` instead. So its `devDependencies` — `svelte`, `dompurify`, `marked`, `highlight.js`, `lucide-svelte` — are correctly classified for npm (users never install them) yet Vite compiles them into the artifact users receive. **Audit with plain `npm audit`, never `--omit=dev`**, which hides exactly this class. The `audit` job in `.github/workflows/build.yml` enforces that.

Hand-rolled instead of libraries:
- SSE broadcast (`res.write()` loop in `index.js`)
- Multipart upload parsing (`multipart.js`, ~60 lines)
- SFX synthesis (Web Audio API in `sfx.js`)
- Hook config management (`hooks.js`)

## Build & Distribution

| Script | Output | Notes |
|---|---|---|
| `npm run dev` | Dev server with watch | |
| `npm run build` | `packages/web/dist/` | Vite production build |
| `npm run bundle:server` | `dist/server-bundle.js` | esbuild, express kept external |
| `npm run build:sea:x64` | `dist/claudia-server-x64.exe` | Node SEA 64-bit |
| `npm run build:tauri` | Tauri app + SEA sidecar | Needs Rust toolchain |

CI: `.github/workflows/build.yml` — triggered by version tag push. CI installs with `npm ci` (exact lockfile, no resolution drift) on Linux, Windows + macOS.

### Lockfile contract (vite 8 / rolldown)

Vite 8 is rolldown-based. rolldown ships native bindings as `optionalDependencies` per platform. Two rules keep `package-lock.json` valid for `npm ci` across platforms — break either and CI fails:

1. **Never delete the lock before regenerating; reconcile in place.** Deleting `package-lock.json` then `npm install` rebuilds it for the *current* platform only, stripping every other platform's `@rolldown/binding-*` node — macOS/Linux `npm ci` then can't find its binding at build time (npm/cli#4828). Always run `npm install` *over* the existing complete lock so all platform binding nodes survive. After any regen, verify `npm ci` on a clean checkout (the lock must also contain the `@emnapi/core` / `@emnapi/runtime` / `@emnapi/wasi-threads` package nodes — a strict `npm ci` walks them; some npm minors prune them, producing a lock that fails elsewhere, so verify with a current npm, not just whatever happens to be local). **`npm audit fix` is one of those pruning paths** — it drops `@emnapi/core` and `@emnapi/runtime` while leaving every `@rolldown/binding-*` node intact, so the lock looks healthy at a glance. After any `npm audit fix`, grep the lock for all three `@emnapi/*` nodes and re-run `npm ci` before committing.
2. **`overrides`** (`package.json`), load-bearing — do not remove without re-verifying `npm ci` on a clean checkout:
   - **`@emnapi/core` / `@emnapi/runtime` / `@emnapi/wasi-threads`** pinned to one version. The `@rolldown/binding-wasm32-wasi` optional dep pins `@emnapi/*` *exactly* while its own `@napi-rs/wasm-runtime` floats them (`^1.7.1`); that conflict lives inside a wasm binding never installed on a real platform, so npm can't serialize a stable lock. Pinning collapses it to one version.
   - **`esbuild: "$esbuild"`** dedupes vite's nested esbuild to the top-level `^0.28.1`. Without it npm may resolve vite's `^0.28.0` to the vulnerable 0.28.0 (advisory fixed in 0.28.1).

## Packages

| Package | Path | Role | Build command |
|---|---|---|---|
| `@rockyhong/claudia` | `.` (root) | CLI entry + published artifact | `npm run build` |
| server | `packages/server` | Express + SSE + state machine | no build — shipped as source, or bundled via `npm run bundle:server` |
| web | `packages/web` | Svelte 5 dashboard (`private`, never published) | `npm run build --workspace=packages/web` |

## Architecture Rules

> Grows via doc-sync as patterns crystallize. Module boundaries, data flow direction, dependency philosophy, layering rules.

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

### Ownership

- Each package owns its dependencies
- Server↔Web contract = the SSE event protocol ([`docs/specs/sessions.md`](specs/sessions.md))
- Claude Code↔Claudia contract = the hook protocol ([`docs/specs/hooks.md`](specs/hooks.md))
- Platform-specific code lives exclusively in `focus.js` and `job-object.js`

### Visual design system

[`docs/design-system.html`](design-system.html) is canonical for UI components (element catalog, modal system, palette, spacing/radius scale). [`docs/product-mock.html`](product-mock.html) for assembled layout + immersive mode. Component-level enforcement fires via `.claude/rules/svelte.md` on component reads.

## Coding Patterns

> Grows via doc-sync as patterns crystallize — **descriptive reference**: how this code is actually written, read on demand, safe to be cold. A convention that binds — imperative, obeyed at every code touch — is recorded in [`CODING_STANDARDS.md`](../CODING_STANDARDS.md).

### Frontend

Component conventions bind path-scoped — `.claude/rules/svelte.md` fires on `packages/web/src/**/*.svelte` and carries them in full. Descriptive-only here:

- **Video**: HTML `<video>` with `loop` attribute for avatars
- **Audio**: Web Audio API for synth tones, `<audio>` for MP3 fallback

### Server

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

## Edit Discipline

Two edit-tool failure families: bulk replace corrupting on common identifiers (preference order + checklist below), and edits issued against stale file state (§ Stale-state edits).

`Edit replace_all: true` is naive whole-file string replace — no AST, no scope, no token boundaries. Running on common identifiers silently corrupts unrelated code (`state` → `swipe` rewrites `SwipeState` to `SwipeSwipe`, import paths, comments, CSS selectors). The trap is invisible until the next type-check.

**Preference order:**

1. **Per-occurrence Edit with unique surrounding context** — enumerate call sites first (LSP `findReferences` where a server is configured, Grep otherwise); each Edit's `old_string` includes enough context to be unique to that call.
2. **`sed` / scripted bulk replace** — only when term is **8+ chars and unique to the domain** (`Conversation`, `MerchandiseInventory`). Always case-preserving pair: `s/OldName/NewName/g; s/oldName/newName/g; s/OLD_NAME/NEW_NAME/g`. Run build/test cycle immediately.
3. **`Edit replace_all: true`** — only on unique long string literals (URLs, full sentences, hash IDs). Never on identifiers <8 chars. Never on common English words.

**Pre-flight checklist (any bulk replace):**

1. Grep the exact term. Look at count + sample matches.
2. If hits >5 OR length <8 OR common English word → switch to options 1–3.
3. Scan sample matches for false positives (substrings inside other identifiers, string literals, CSS classes overlapping HTML tags, comments).
4. Any doubt → per-occurrence Edit. Caution token cost ≪ silent-corruption debug cost.

**Banned terms for `replace_all`** (always per-occurrence):
`state`, `name`, `data`, `value`, `item`, `key`, `id`, `type`, `props`, `node`, `text`, `link`, `error`, `result`, `body`, `head`, `main`, `time`, `path`, `file`, `index`, `count`, `child`, `style`, `class`, `tag`, `event`, `target`, `source`, `from`, `to`, `next`, `prev`, `init`, `done`.

**Stale-state edits — Read before first Edit, re-Read after mutation:**

An Edit failing `"File has not been read yet"` or `"File has been modified since read"` is a state-tracking failure, not a content failure — retrying the same Edit against the same stale state cannot succeed. Read first; on those errors, re-Read:

- **Read before the first Edit of a file each session** — `Write` always requires a prior Read; `Edit`'s guard is relaxed for newer models (CC 2.1.208+) but reading first remains the discipline — an unread edit is a blind edit.
- **Re-Read after either error class above** before the next Edit of that file.
- **Re-Read after any save that lands behind your read-tracker** — formatter hook, linter-on-commit (prettier / lint-staged repos mutate on every commit), and any file-writing subagent that returned (a skill may have dispatched it): it wrote in its own context, invisible to yours.
- **`git diff` output is not a Read** — after reviewing another agent's edits via diff, Read the file itself before editing it.
- **Two consecutive same-file Edit failures = mandatory re-Read**, no exceptions — the loop is unwinnable without fresh state.

**When a `replace_all` slips through:**

1. `git diff` first — see damage scope.
2. If uncommitted, `git checkout` the file and redo with the right tool.
3. If committed, fix as a NEW commit (preserves mistake in history).
4. Run type-check / lint / test — usually points straight at corruption.

Always run build/test after bulk operations.
