# Claudia

Local session monitor for Claude Code — hook-driven per-session state, live dashboard for 2+ concurrent sessions.

## Development Workflow

Every session runs under the superpowers frame. Routing = **which phases this work needs**, judged on evidence — not file count. Triage phases, propose route, **user confirms** before work starts.

### Phase Gates

| Phase | Run when | Skip when |
|---|---|---|
| **Brainstorm** | Intent fuzzy, design space unexplored, multiple viable shapes | Intent + approach obvious from repo context or user direction |
| **Spec** | Persistent design surface — behavior worth pinning for future sessions | One-time tactical change, no behavior contract |
| **Plan** | Multi-step, ordering matters, half-done risk | Single atomic edit obvious from context |
| **Execute (TDD + verify)** | Touching code | Always-on when code changes — never skip discipline |
| **Doc sync** | Pre-commit | Always-on — never skip |
| **Commit (`/super-bootstrap:commit`)** | Work done | Always-on — terminal step |

### Triage output

Propose phase composition + justify each skip with repo-grounded evidence:

```
Phases: brainstorm → plan → execute → doc-sync → commit
Skipped: spec (no persistent design surface — internal helper, no behavior contract)
Evidence: BUG-001 has clean repro, fix touches CSS layering in one component
OK to proceed?
```

If the user pushes back → re-evaluate the gate that triggered the disagreement, not the whole route. User can add or drop phases — **user instructions override Superpowers defaults.**

Spec/plan locations: `docs/superpowers/specs/` + `docs/superpowers/plans/` (temporal). Persistent feature specs (kept after merge) → `docs/specs/`.

## Doc Sync (non-negotiable)

Named pipeline step — every route includes it between user review and commit.

Before every commit, scan `docs/` for files describing behavior touched by the diff (specs, overview, techstack, building, backlog). If any doc looks stale:

1. Report it — doc path, what looks outdated, relevant diff context
2. Resolve together — update or acknowledge it's still accurate
3. Never silently fix. Never silently skip. Stale docs are worse than missing ones.

**Temporal cleanup:** work completing a feature branch deletes its spec + plan from `docs/superpowers/`. Once merged, they're noise.
**Roadmap cleanup:** work shipping a feature in `docs/overview.md` § Roadmap removes that line — it now belongs to the product narrative.
**Backlog cleanup:** work resolving a `BUG-###` / `DEBT-###` / `GAP-###` deletes that row from `docs/backlog.md`. Git history is the archive.

## Coding Principles

Before writing, reviewing, or refactoring code, invoke the `karpathy-guidelines` skill (think-before-coding, simplicity-first, surgical-changes, goal-driven-execution). Skill body is upstream — don't paraphrase. Pin: `.claude/settings.json` → `andrej-karpathy-skills@karpathy-skills`.

## Edit Discipline — Renames & Replace-All

Rename preference order: LSP rename → per-occurrence Edit → `sed` (unique 8+ char literals) → `replace_all` (long unique literals only).

Banned-terms list + pre-flight checklist + recovery protocol: [`docs/techstack.md` § Edit Discipline](docs/techstack.md#edit-discipline).

## Context Hygiene

When context heavy: subagent first (clean window), compact while warm, clear on topic shift. Park mid-implementation state to docs before `/clear`.

## Finding Triage — Log vs Fix Now

Decide on two axes: **context budget** (window heavy?) and **topic distance** (on-goal, or far blast radius?).

- Context heavy **OR** off-topic / far blast → **log** via `/super-bootstrap:log`.
- On-topic **AND** context clean **AND** fix small + safe → **fix now**.

Real fork → surface as MCQ, recommended path badged. No real fork → act and mention.

## Design Principles

Non-negotiable. Every line of code reflects them.

### First Principles Thinking

Ask "why" before "how." Add a library because the platform lacks it, not because it's popular. SSE over WebSocket: the data flow is unidirectional, so use the unidirectional primitive.

### Separation of Concerns

Each module owns one responsibility. See `docs/overview.md` → Module Index, `docs/techstack.md` for key boundaries. Importing across boundaries in unexpected directions means the design is wrong — fix the boundary.

### Atomic, Small Units

Functions do one thing. Files stay focused (~200 line ceiling). Commits atomic — one logical change.

### Self-Explanatory Naming

Names are documentation. `getSessionDisplayName(cwd)` not `getName(s)`. Booleans read as natural language: `isStale`, `hasActiveSession`.

### Ownership and Boundaries

- Each package owns its dependencies
- Server↔Web contract = the SSE event protocol (`docs/specs/sessions.md`)
- Claude Code↔Claudia contract = the hook protocol (`docs/specs/hooks.md`)
- Platform-specific code lives exclusively in `focus.js` and `job-object.js`

### Visual Design System

`docs/design-system.html` is canonical for UI components (element catalog, modal system, palette, spacing/radius scale). `docs/product-mock.html` for assembled layout + immersive mode. Component-level enforcement fires via `.claude/rules/svelte.md` on component reads.

## Rules (auto-load on file match)

`.claude/rules/*.md` attach to file reads via `paths:` frontmatter — full body fires at the decision moment, zero ambient cost otherwise.

- **`rules/svelte.md`** — fires on `packages/web/src/**/*.svelte`
  • Svelte 5 runes only; props down, events up; one component, one concern
  • Hand-written scoped CSS per `design-system.html`; `<Tooltip>` not `title`

## Coding Standards

- **ES modules only** — `import`/`export`, never `require`
- `const` by default, `let` only for reassignment, never `var`
- Async/await over raw promises; error handling at boundaries, not deep in logic
- No classes unless instance state is clearly needed
- **File org** — one substantial export per file; related small helpers may share a file; index files re-export, no logic

Svelte component specifics: `.claude/rules/svelte.md`. Stack patterns: `docs/techstack.md`.

## Shell Notes

- **Never use `cd`** — `git -C <path>` for git; absolute paths everywhere else.
- **Always use dedicated tools** — `Glob` / `Grep` / `Read`, never `find` / `ls` / `grep` / `cat` / `head` / `tail` via Bash.

## Solo Dev Assumptions

Single developer across multiple Claude Code sessions.

- No PR self-review — commit directly to working branch
- Simple branching — `main` + feature branches, no rebasing
- No force push — every commit is sacred, no rewriting history
- Session isolation — each session commits only its own changes
- Merge conflict → stop and ask

## Git Notes

- Only commit current session's changes — leave unrelated uncommitted work alone
- Atomic commits — one logical change
- Conventional commits — `feat:` `fix:` `refactor:` `docs:` `test:` `chore:`
- No Git LFS

## Commands

```bash
npm run dev          # Start server in watch mode
npm run build        # Build web UI for production
npm test             # Run all tests
npm run lint         # Check with Biome
npm run lint:fix     # Auto-fix lint issues
npm run format       # Auto-format with Biome
```

## Planning

- [`docs/overview.md`](docs/overview.md) — product context, data flow, module index, `## Roadmap` (forward feature list, read by `/super-bootstrap:todo`)
- [`docs/techstack.md`](docs/techstack.md) — stack, architecture rules, coding patterns, storage, Edit Discipline
- [`docs/specs/`](docs/specs/) — permanent feature specs, one `.md` per feature (filename + heading is the catalog)
- [`docs/backlog.md`](docs/backlog.md) — deferred items (`BUG-###` / `DEBT-###` / `GAP-###`), deleted on resolve
- [`docs/building.md`](docs/building.md) — build instructions (npx, Tauri)
- `docs/superpowers/specs/` + `docs/superpowers/plans/` — temporal design specs + plans (deleted after merge)
- `.claude/rules/` — path-scoped rules, full-body fires on file match

> **Two kinds of specs:** `docs/specs/` = permanent source of truth. `docs/superpowers/specs/` = temporal work orders.
