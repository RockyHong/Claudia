# Pipeline Bootstrap Plan

**Goal:** Final adaptive seeding + cleanup for Claudia

**Context:** Harness re-synced to the super-bootstrap card substrate on 2026-09-10 (`docs/backlog.md` + `docs/superpowers/` retired → `docs/work/`; prior bootstrap `54753b1`, 2026-06-13). Task 1 dropped — `docs/specs/` already carries 5 specs. CLAUDE.md is live; `docs/techstack.md` and `docs/overview.md` are substantive and were rewritten to the skeleton section shape this run. The core plugin pin (super-bootstrap) sits in `.claude/settings.json`; stack-matched skill / MCP / hook curation runs as gated tier-2 via `/super-bootstrap` once the seed docs are substantive.

These tasks complete optional adaptive seeding (only the ones whose docs the runway scaffolded) and final bootstrap cleanup.

---

### Task 2: Seed Cards

Walk the project once and seed any obvious deferred items already visible in code or recent history.

- [ ] **Scan for `TODO` / `FIXME` / `XXX` / `HACK` markers** in source — each is a candidate `DEBT-###` or `BUG-###`
- [ ] **Review test output** — failing or skipped tests with no recent fix attempt → `BUG-###` or `DEBT-###`
- [ ] **Note design gaps surfaced during the scan** — areas where behavior is hand-waved or unbuilt → `GAP-###`
- [ ] **Cap at ~5 items** — the work substrate is a queue, not a dump. If more candidates exist, list them but seed only the highest-signal ones
- [ ] **Present to user for review** — user prunes/approves
- [ ] **Commit**: `docs: seed initial cards`

If no obvious items exist, nothing to commit — the substrate is ready when the first `/super-bootstrap:log` capture lands. The card set grows organically as reviews surface things.

### Task 3: Cleanup

- [ ] **Delete this file** (`.claude/bootstrap.md`) and `.claude/bootstrap-sync-report.md` if present — bootstrap is complete
- [ ] **Verify `/super-bootstrap:todo` shows no active work** (unless the user has started real project work)
- [ ] **Commit**: `chore: complete pipeline bootstrap`

---

**Note on re-runs:** if `/super-bootstrap:harness-bootstrap` is run again later, this file gets regenerated. If `docs/specs/` is already populated (Task 1) or card files are already present in `docs/work/` (Task 2), those tasks are dropped — only Task 3 (cleanup) remains. Most refresh value on re-runs comes from gated tier-2 curation (skill/MCP picks against live sources, run by `/super-bootstrap` once seed docs are substantive), not from this plan. (Re-runs come via `/super-bootstrap`, which always dispatches the runway, or via `/super-bootstrap:harness-bootstrap` directly for a runway-only sync.)
