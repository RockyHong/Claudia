# Rules Index

> **Cold-load caveat:** rule fires on file *read*, not on intent. Read the rule directly when planning: `Read .claude/rules/<name>.md`.
>
> Use `paths:` in frontmatter — not `globs:` (Cursor key, ignored by Claude Code).

## Active rules

- `svelte.md` — `packages/web/src/**/*.svelte` — Svelte 5 component, styling, tooltip conventions

## Adding a new rule

1. New file `<topic>.md` with frontmatter:
   ```yaml
   ---
   paths:
     - "packages/<scope>/**/*.js"
   description: "When this rule applies and why"
   ---
   ```
2. Body uses the same imperative, full-detail style as `docs/techstack.md` § Edit Discipline — rules are loaded with full ammo.
3. Add a one-line summary bullet to `CLAUDE.md` § Rules so the orchestrator knows it exists.
4. Add an entry to this index.
