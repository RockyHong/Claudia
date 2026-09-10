# Coding Standards

> Repo-declared **binding** conventions — imperative, read at every code touch via `CLAUDE.md` § Coding Principles. Record one by hand when a review or commit settles it; this file sits outside the doc-sync surface, so it grows by decision, not by sync proposal. A filled section governs its concern; empty sections — this whole unfilled scaffold included — leave it to default judgment. Route the other two kinds onward: a convention that binds only inside a path glob → `.claude/rules/<scope>.md`; a descriptive pattern (how the code is written, observed rather than mandated) → `docs/techstack.md` § Coding Patterns.

## Naming

Names are documentation. `getSessionDisplayName(cwd)` not `getName(s)`. Booleans read as natural language: `isStale`, `hasActiveSession`.

## Structure & Boundaries

Ask "why" before "how." Add a library because the platform lacks it, not because it's popular.

- **ES modules only** — `import` / `export`, never `require`.
- `const` by default, `let` only for reassignment, never `var`.
- No classes unless instance state is clearly needed.
- Functions do one thing. Files stay focused (~200 line ceiling).
- **File org** — one substantial export per file; related small helpers may share a file; index files re-export, no logic.

Svelte component specifics are path-scoped: `.claude/rules/svelte.md`.

## Error Handling

Async/await over raw promises. Handle errors at boundaries, not deep in logic.

## Testing
