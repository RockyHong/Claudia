# Claudia

A personal receptionist app that monitors all active Claude Code sessions, displays their states, and notifies you when attention is needed.

## Project Structure

```
claudia/
  bin/cli.js                     CLI entry point (npx claudia, claudia init)
  packages/
    server/src/                  Express event server, session tracking, hooks
    web/src/                     Svelte 5 browser dashboard
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

Ask "why" before "how." Don't add a library because it's popular — add it because the platform doesn't provide what we need. SSE over WebSocket is a first-principles decision: the data flow is unidirectional, so use the unidirectional primitive. Apply this reasoning everywhere.

### Separation of Concerns

Each module owns one responsibility. The boundaries are:

- **Transport** (`server/src/index.js`) — HTTP routing, SSE connections, request parsing. Knows nothing about session logic.
- **State** (`server/src/session-tracker.js`) — Session registry, state transitions, debouncing. Knows nothing about HTTP.
- **Presentation** (`server/src/personality.js`) — Status message templates. Knows nothing about state internals, only receives state transition events.
- **OS Integration** (`server/src/focus.js`) — Terminal focus. Knows nothing about sessions, only receives a target identifier.
- **CLI Integration** (`server/src/hooks.js`) — Hook config management. Knows nothing about the server.
- **UI** (`packages/web/`) — Renders state. Knows nothing about how state is produced.

If you find yourself importing across these boundaries in unexpected directions, the design is wrong. Fix the boundary, don't bridge it.

### Atomic, Small Units

- Functions do one thing. If a function needs a comment explaining what "the second half" does, split it.
- Files stay focused. When a file grows beyond ~200 lines, it likely has two concerns — find and extract them.
- Commits are atomic. One logical change per commit.

### Self-Explanatory Naming

Names are documentation. If you need a comment to explain what a variable or function does, rename it instead.

- `getSessionDisplayName(cwd)` not `getName(s)`
- `STALE_SESSION_TIMEOUT_MS` not `TIMEOUT`
- `handleHookEvent(event)` not `process(e)`
- `isPending(session)` not `check(s)`

Boolean variables and functions read as natural language: `isStale`, `hasActiveSession`, `shouldPruneSession`.

### Ownership and Boundaries

- Each package owns its dependencies. `@claudia/server` does not reach into `@claudia/web`'s internals and vice versa.
- The contract between server and web is the SSE event protocol defined in `overview.md` (Event Protocol section). Changes to this protocol require updating both sides.
- The contract between Claude Code and Claudia is the HTTP POST to `/event`. Changes here require updating the hook configuration.
- Platform-specific code lives exclusively in `focus.js` behind a single exported function. The rest of the codebase is platform-agnostic.

### Test-Driven Iteration

- Write the test first when the behavior is well-defined (state transitions, debouncing, session pruning).
- Write the code first when exploring (UI layout, personality messages), then add tests to lock the behavior.
- Tests live next to the code they test: `session-tracker.js` / `session-tracker.test.js`.
- Test behavior, not implementation. Assert on outputs and side effects, not internal state.
- No mocks unless the real dependency is expensive or non-deterministic (timers, OS calls). Prefer fakes over mocks.

## Coding Standards

### JavaScript / Node.js

- ES modules only. `import`/`export`, never `require`.
- Use `const` by default. `let` only when reassignment is necessary. Never `var`.
- Async/await over raw promises. No `.then()` chains.
- No classes unless there's a clear reason for instance state. Prefer plain functions and objects.
- Error handling at boundaries (HTTP handlers, CLI entry), not deep in logic. Let errors propagate.

### Svelte

- Svelte 5 runes syntax (`$state`, `$derived`, `$effect`).
- Components are small and focused. One component, one concern.
- Props flow down, events flow up. No stores for local component state.

### File Organization

- One export per file when the export is substantial (a class, a large function, a component).
- Related small helpers can share a file, but only if they serve the same concern.
- Index files re-export, they don't contain logic.

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

SSE stream at `GET /events` pushes state updates to the browser.

See `overview.md` for the full protocol specification.

## Planning

- `roadmap.md` — Phase-by-phase plan with checkboxes (source of truth for what's done/TODO)
- `overview.md` — Full architecture, event protocol, and design decisions
- `techstack.md` — Technology choices with rationale

## Skills

Invoke these installed skills to reinforce quality and consistency:

- **`frontend-design:frontend-design`** — When building or modifying UI components, pages, or layouts in `packages/web/`.
- **`ui-ux-pro-max:ui-ux-pro-max`** — When making design decisions: color, typography, spacing, accessibility, animation, or interaction states.
- **`fullstack-dev-skills:javascript-pro`** — When writing or refactoring JavaScript in either package.
- **`fullstack-dev-skills:fullstack-guardian`** — When a change spans both `packages/server` and `packages/web` (e.g., event protocol changes).
- **`fullstack-dev-skills:cli-developer`** — When modifying `bin/cli.js` or adding CLI commands.
- **`fullstack-dev-skills:api-designer`** — When changing the HTTP or SSE event protocol.
- **`fullstack-dev-skills:test-master`** — When writing or designing test strategies.
- **`fullstack-dev-skills:debugging-wizard`** — When investigating errors or unexpected behavior.
- **`fullstack-dev-skills:code-reviewer`** — When reviewing PRs or auditing code quality.
- **`fullstack-dev-skills:architecture-designer`** — When making structural or architectural decisions.
- **`fullstack-dev-skills:secure-code-guardian`** — When touching authentication, input validation, or anything security-sensitive.

After every implementation task, run `/simplify` to review changed code for reuse, quality, and efficiency.
