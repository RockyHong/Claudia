# Claudia

## Development Workflow

Before starting any work, **assess the task size and propose a route for the user to confirm.** Present it like:

```
This looks [small/medium/large] because [reason].
Route: [steps]
Impact: [what changes, how many files, risk level]
OK to proceed?
```

### Routes

**Small** — Single file, clear intent, no design decisions (typo fix, config tweak, style adjustment)
→ Just do it → `/commit`

**Medium** — Multi-file, some design choices, completable in one session (new component, bug fix with investigation, refactor)
→ Brainstorm (quick, inline — no spec file) → implement → `/commit`

**Large** — Multi-session, architectural, unclear scope, or user explicitly requests it
→ Full superpowers pipeline: brainstorm → spec → plan → execute → review → finish
→ Specs go to `docs/superpowers/specs/`, plans to `docs/superpowers/plans/` (temporal — delete after merge)

The user always picks the route. If they say "just do it" on something you sized as large, do it. If they want the full pipeline for something small, run it.

**Spec maintenance** — if a commit changes feature behavior, update the relevant spec in `docs/specs/` before committing. Specs are the source of truth for product logic; stale specs are worse than missing ones.

**User instructions override Superpowers defaults** — if something below contradicts a skill, follow what's written here.

## Project Structure

```
claudia/
  bin/cli.js                     CLI entry point (npx cldi, cldi uninstall)
  packages/
    server/src/                  Express event server, session tracking, hooks
    web/src/                     Svelte 5 browser dashboard
  docs/
    overview.md                  Product context, data flow, module index
    techstack.md                 Tech choices, architecture rules
    design-system.html           Component catalog + design rules
    product-mock.html            Assembled dashboard + immersive mode
    building.md                  Build instructions (npx, Tauri)
    help/                        User-facing guides
      privacy.md                 What Claudia accesses, removal options
      troubleshooting.md         Common issues + fixes by distribution
    specs/                       Feature specs — source of truth per feature
    superpowers/
      specs/                     Design specs (from brainstorming, temporal)
      plans/                     Implementation plans (temporal)
```

Monorepo using npm workspaces. `packages/server` is the backend, `packages/web` is the frontend. They are independent packages with a clear boundary — the server serves the built web assets and exposes an SSE stream. The web app consumes that stream. No shared code between them beyond the event protocol.

## Tech Stack

- **Runtime**: Node.js 18+, ES modules (`"type": "module"`)
- **Server**: Express 5, SSE (no WebSocket)
- **Frontend**: Svelte 5, Vite
- **Testing**: Vitest
- **Linting**: Biome
- **Package manager**: npm (no pnpm/yarn)

Production has two dependencies: `express` and `adm-zip`. This is intentional — hand-roll before reaching for a library.

See `docs/techstack.md` for full reasoning behind each choice.

## Design Principles

These are non-negotiable. Every line of code should reflect them.

### Visual Design System

`docs/design-system.html` is the canonical reference for UI components — element catalog (buttons, inputs, toggles), modal system (shell, confirm, gate), color palette, and layout principles (spacing rhythm, border-radius scale, visual hierarchy). Every UI component must follow its patterns. `docs/product-mock.html` shows the assembled dashboard layout and immersive mode — use it for composition and product-level decisions, not component rules.

**Tooltips:** Add only to icon-only elements whose meaning isn't obvious from context or interaction. Use `<Tooltip text="...">` (not HTML `title`). Text is specific and concise (<30 chars) — name the target, not just the verb ("Open project folder" not "Open folder"). If one icon in a group gets a tooltip, all siblings should too.

### First Principles Thinking

Ask "why" before "how." Don't add a library because it's popular — add it because the platform doesn't provide what we need. SSE over WebSocket is a first-principles decision: the data flow is unidirectional, so use the unidirectional primitive.

### Separation of Concerns

Each module owns one responsibility. See `docs/overview.md` → Module Index for the full list, `docs/techstack.md` for key boundaries.

If you find yourself importing across boundaries in unexpected directions, the design is wrong. Fix the boundary.

### Atomic, Small Units

- Functions do one thing
- Files stay focused (~200 line ceiling)
- Commits are atomic — one logical change per commit

### Self-Explanatory Naming

Names are documentation. `getSessionDisplayName(cwd)` not `getName(s)`. Booleans read as natural language: `isStale`, `hasActiveSession`.

### Ownership and Boundaries

- Each package owns its dependencies
- Server↔Web contract is the SSE event protocol (see `docs/specs/sessions.md`)
- Claude Code↔Claudia contract is the hook protocol (see `docs/specs/hooks.md`)
- Platform-specific code lives exclusively in `focus.js` and `job-object.js`

## Coding Standards

### JavaScript / Node.js

- ES modules only (`import`/`export`, never `require`)
- `const` by default, `let` only when reassignment is necessary, never `var`
- Async/await over raw promises
- No classes unless there's a clear reason for instance state
- Error handling at boundaries, not deep in logic

### Svelte

- Svelte 5 runes syntax (`$state`, `$derived`, `$effect`)
- Components are small and focused — one component, one concern
- Props flow down, events flow up

### File Organization

- One export per file when the export is substantial
- Related small helpers can share a file if they serve the same concern
- Index files re-export, they don't contain logic

## Commands

```bash
npm run dev          # Start server in watch mode
npm run build        # Build web UI for production
npm test             # Run all tests
npm run lint         # Check with Biome
npm run lint:fix     # Auto-fix lint issues
```

## Event Protocol (Quick Reference)

Hooks pipe raw Claude Code stdin JSON to the server, which transforms it:

```
POST /hook/:type    (primary — used by hooks, raw stdin JSON, server transforms via hook-transform.js)
POST /event         (legacy — pre-formatted {session, state, tool, cwd, message, ts})
```

Hook types: `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PermissionRequest`, `Stop`, `SessionEnd`, `SubagentStop`, `PreCompact`

SSE stream at `GET /events` pushes state updates to the browser. See `docs/overview.md` for the full protocol.

## Shell Notes

- **Never use `cd`** — The cd-guard hook blocks `cd` commands. Use `git -C <path>` for git commands, and absolute paths for everything else. Never `cd D:/Git/Claudia && ...`.
- **Always use dedicated tools** — `Glob` for file search, `Grep` for content search, `Read` for reading files. Never use `find`, `ls`, `grep`, `rg`, `cat`, `head`, or `tail` via Bash.

## Git Notes

- **Only commit current session's changes** — When committing, only stage files changed in this session. If unrelated uncommitted changes exist from prior work, leave them alone. Separation of concerns applies to commits too.
- **No Git LFS** — This repo does not use LFS.

## Planning

- `docs/overview.md` — Product context, data flow, module index
- `docs/techstack.md` — Tech choices, architecture rules, coding patterns, storage locations
- `docs/specs/` — **Feature specs** — source of truth for what each feature does and why
- `docs/building.md` — Build instructions for both distributions (npx, Tauri)
- `docs/superpowers/specs/` — Design specs from brainstorming sessions (temporal — deleted after merge)
- `docs/superpowers/plans/` — Implementation plans for execution (temporal — deleted after merge)
