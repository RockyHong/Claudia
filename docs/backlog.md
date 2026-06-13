# Backlog

New rows route through `/super-bootstrap:log` — one funnel for classification, the admission gate, dedup, and ID assignment. Feature ideas are not backlog rows; they go to `docs/overview.md` § Roadmap.

**Row deletion:** the resolving session — via `/super-bootstrap:commit` doc-sync, or manually on resolve. Direct `git commit` skips the sweep; clean up stale rows when noticed.

**Three categories** distinguished by ID prefix:

- **`BUG-###`** — broken behavior. Surface symptom may hide deeper cause.
- **`DEBT-###`** — working but rotting (test fixture rot, stale dep, cleanup owed).
- **`GAP-###`** — design gap, never properly specced.

No phase prescription per category — when an item rolls into a session, the harness phase-gate triage decides which superpowers phases run. Surface "clear fix" can become design work after evidence; pre-routing biases that judgment.

**ID high-water mark:** `BUG-001` · `DEBT-000` · `GAP-000` — last consumed ID per category. Next ID = max+1 from this line, bumped in the same write. Resolved rows are deleted but their IDs stay consumed (history = `git log --grep="<id>"`); never re-derive IDs from open rows.

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

*(seeded as items are surfaced during reviews, audits, or development)*

### BUG-001 — Glass/blur visual effect not rendering on web or Tauri desktop build

**Logged:** 2026-06-13 · **Source:** v0.5.0 session, confirmed by project owner (Windows 11)
**Problem:** CSS frosted-glass / backdrop-filter effect absent in both the web build and the Tauri desktop build (claudia.exe + MSI/NSIS installers). Initially suspected Tauri-specific; reporter confirmed web build is equally broken.
**Area:** `packages/web` UI components — likely CSS `backdrop-filter` usage or a missing background/layering condition the effect depends on
**Prior:** Effect may require an opaque or semi-transparent backing layer behind the blurred element; missing stacking context or background color could silently disable backdrop-filter in both runtimes
