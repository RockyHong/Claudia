# Claudia

A personal receptionist app that monitors all active Claude Code sessions, displays their states, and notifies you when attention is needed.

## Development Workflow

**Superpowers is the default workflow for all development work.** Every feature, bugfix, or refactor follows this pipeline:

1. **Brainstorm** — `superpowers:brainstorming` before any creative/implementation work
2. **Plan** — `superpowers:writing-plans` to create bite-sized implementation plans
3. **Execute** — `superpowers:subagent-driven-development` (preferred) or `superpowers:executing-plans`
4. **Review** — `superpowers:requesting-code-review` between tasks and at completion
5. **Finish** — `superpowers:finishing-a-development-branch` to merge/PR

Specs go to `docs/superpowers/specs/`, plans go to `docs/superpowers/plans/`.

**User instructions override Superpowers defaults** — if something below contradicts a skill, follow what's written here.

## Project Structure

```
claudia/
  bin/cli.js                     CLI entry point (npx claudia, claudia init)
  packages/
    server/src/                  Express event server, session tracking, hooks
    web/src/                     Svelte 5 browser dashboard
  docs/
    superpowers/
      specs/                     Design specs (from brainstorming)
      plans/                     Implementation plans
```

Monorepo using npm workspaces. `packages/server` is the backend, `packages/web` is the frontend. They are independent packages with a clear boundary — the server serves the built web assets and exposes an SSE stream. The web app consumes that stream. No shared code between them beyond the event protocol.

## Tech Stack

- **Runtime**: Node.js 18+, ES modules (`"type": "module"`)
- **Server**: Express 5, SSE (no WebSocket)
- **Frontend**: Svelte 5, Vite
- **Testing**: Vitest
- **Linting**: Biome
- **Package manager**: npm (no pnpm/yarn)

Production has one dependency: `express`. This is intentional — hand-roll before reaching for a library.

See `techstack.md` for full reasoning behind each choice.

## Design Principles

These are non-negotiable. Every line of code should reflect them.

### First Principles Thinking

Ask "why" before "how." Don't add a library because it's popular — add it because the platform doesn't provide what we need. SSE over WebSocket is a first-principles decision: the data flow is unidirectional, so use the unidirectional primitive.

### Separation of Concerns

Each module owns one responsibility:

- **Transport** (`server/src/index.js`) — SSE, event/hook endpoints, server lifecycle
- **API Routes** (`server/src/routes-api.js`) — Projects, avatars, focus, launch
- **State** (`server/src/session-tracker.js`) — Session registry, state transitions
- **Presentation** (`server/src/personality.js`) — Status message templates
- **OS Integration** (`server/src/focus.js`) — Terminal focus
- **CLI Integration** (`server/src/hooks.js`) — Hook config management
- **Upload Parsing** (`server/src/multipart.js`) — Multipart form-data parser
- **UI** (`packages/web/`) — Renders state

If you find yourself importing across these boundaries in unexpected directions, the design is wrong. Fix the boundary, don't bridge it.

### Atomic, Small Units

- Functions do one thing
- Files stay focused (~200 line ceiling)
- Commits are atomic — one logical change per commit

### Self-Explanatory Naming

Names are documentation. `getSessionDisplayName(cwd)` not `getName(s)`. Booleans read as natural language: `isStale`, `hasActiveSession`.

### Ownership and Boundaries

- Each package owns its dependencies — no reaching into internals
- Server↔Web contract is the SSE event protocol (see `overview.md`)
- Claude Code↔Claudia contract is `POST /hook/:type` (primary) and `POST /event` (legacy)
- Platform-specific code lives exclusively in `focus.js`

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

Hook types: `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PermissionRequest`, `Notification`, `Stop`, `SessionEnd`

SSE stream at `GET /events` pushes state updates to the browser. See `overview.md` for the full protocol.

## Shell Notes

- **Never use `cd`** — The cd-guard hook blocks `cd` commands. Use `git -C <path>` for git commands, and absolute paths for everything else. Never `cd D:/Git/Claudia && ...`.
- **Always use dedicated tools** — `Glob` for file search, `Grep` for content search, `Read` for reading files. Never use `find`, `ls`, `grep`, `rg`, `cat`, `head`, or `tail` via Bash.

## Git Notes

- **Only commit current session's changes** — When committing, only stage files changed in this session. If unrelated uncommitted changes exist from prior work, leave them alone. Separation of concerns applies to commits too.
- **No Git LFS** — This repo does not use LFS. However, the dev machine has LFS installed globally, which can cause push failures (`This repository exceeded its LFS budget`). If this happens, disable the LFS filter locally:
  ```bash
  git config --local filter.lfs.required false
  git config --local filter.lfs.clean ""
  git config --local filter.lfs.smudge ""
  git config --local filter.lfs.process ""
  git config --local lfs.repositoryformatversion ""
  ```
  This was applied on 2026-03-25. If you reinstall Git or clone fresh, you may need to reapply.

## Planning

- `todo.md` — Actionable work items (source of truth for what's left)
- `overview.md` — Product context, data flow, event protocol, module index
- `techstack.md` — Tech choices, architecture rules, coding patterns, storage locations
- `docs/building.md` — Build instructions for all 3 distributions (npx, Tauri, WE)
- `docs/superpowers/specs/` — Design specs from brainstorming sessions
- `docs/superpowers/plans/` — Implementation plans for execution
