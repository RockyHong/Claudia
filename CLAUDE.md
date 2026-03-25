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

- **Transport** (`server/src/index.js`) — HTTP routing, SSE connections, request parsing
- **State** (`server/src/session-tracker.js`) — Session registry, state transitions
- **Presentation** (`server/src/personality.js`) — Status message templates
- **OS Integration** (`server/src/focus.js`) — Terminal focus
- **CLI Integration** (`server/src/hooks.js`) — Hook config management
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
- Claude Code↔Claudia contract is `POST /event`
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

Hook POST to `localhost:7890/event`:
```json
{
  "session": "abc123",
  "state": "busy | idle | pending",
  "tool": "Edit",
  "cwd": "/path/to/project",
  "message": "optional, for pending state",
  "ts": 1711100000
}
```

SSE stream at `GET /events` pushes state updates to the browser. See `overview.md` for the full protocol.

## Planning

- `roadmap.md` — Phase-by-phase plan with checkboxes (source of truth for what's done/TODO)
- `overview.md` — Full architecture, event protocol, and design decisions
- `techstack.md` — Technology choices with rationale
- `docs/superpowers/specs/` — Design specs from brainstorming sessions
- `docs/superpowers/plans/` — Implementation plans for execution
