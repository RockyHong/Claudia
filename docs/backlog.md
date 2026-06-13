# Backlog

New rows route through `/super-bootstrap:log` — one funnel for classification, the admission gate, dedup, and ID assignment. Feature ideas are not backlog rows; they go to `docs/overview.md` § Roadmap.

**Row deletion:** the resolving session — via `/super-bootstrap:commit` doc-sync, or manually on resolve. Direct `git commit` skips the sweep; clean up stale rows when noticed.

**Three categories** distinguished by ID prefix:

- **`BUG-###`** — broken behavior. Surface symptom may hide deeper cause.
- **`DEBT-###`** — working but rotting (test fixture rot, stale dep, cleanup owed).
- **`GAP-###`** — design gap, never properly specced.

No phase prescription per category — when an item rolls into a session, the harness phase-gate triage decides which superpowers phases run. Surface "clear fix" can become design work after evidence; pre-routing biases that judgment.

**ID high-water mark:** `BUG-001` · `DEBT-001` · `GAP-000` — last consumed ID per category. Next ID = max+1 from this line, bumped in the same write. Resolved rows are deleted but their IDs stay consumed (history = `git log --grep="<id>"`); never re-derive IDs from open rows.

**Row shape** — stable ID + frozen claim, newest at top. When resolved, **delete the row** — git history is the archive.

```
### {BUG|DEBT|GAP}-### — {one-line summary}

**Logged:** {date} · **Source:** {where this surfaced}
**Problem:** {what's broken / rotting / missing}
**Area:** {files or module}
**Prior:** {one-line suspected cause or proposed fix — optional}
```

The claim is write-once — captured at the richest-context moment, read cold by later sessions. Sessions that pick a row up work from it; working history lives in specs/plans, not on the row.

---

## Open

### DEBT-001 — pre-commit hook blocks on all-dotfile-JSON staged sets

**Logged:** 2026-06-13 · **Source:** BUG-001 fix session — committing `.mcp.json` alone required `git commit --no-verify`
**Problem:** `.githooks/pre-commit` globs `*.json` to build the Biome staged-file list; Biome ignores dotfiles by default, so a staged set composed entirely of dotfile JSONs produces "No files were processed" and Biome exits non-zero, blocking the commit.
**Area:** `.githooks/pre-commit`
**Prior:** Exclude dotfile JSONs from the staged glob before passing to Biome, or filter the list through Biome's resolution so an all-ignored set passes cleanly instead of erroring.

*(seeded as items are surfaced during reviews, audits, or development)*
