---
name: sp-bootstrap
description: "Bootstrap or mid-adopt the superpowers development pipeline in any repo. Scaffolds fixed macro docs (overview, techstack, superpowers/) and adaptive persistent docs (specs/, building, help/) based on project needs. Bakes in doc-sync discipline — docs travel with code. Solo dev workflow. Use `health` arg to check pipeline drift in already-bootstrapped repos."
---

# SP Bootstrap — Superpowers Pipeline for Any Repo

Set up (or retrofit) the superpowers-driven development pipeline in a project. The pipeline bootstraps itself — scaffold first, then use the pipeline to complete its own setup across sessions.

Designed for a solo developer working across multiple Claude Code sessions and cloud Claude Code.

<HARD-GATE>
This skill is scoped to **solo developer** workflows. Before proceeding, check contributor count (`git shortlog -sn --all | head -5`). If >1 active contributor, warn:
> "This repo has multiple contributors. The pipeline assumes solo dev — simple branching, no PRs for self-review, no merge conflicts. Proceed anyway?"
</HARD-GATE>

## Mode Routing

This skill has two modes based on arguments:

- **No args** (`/sp-bootstrap`) → Full bootstrap (Phases 1–4 below)
- **`health`** (`/sp-bootstrap health`) → Health check only (jump to [Health Check Mode](#health-check-mode))

If running health check, skip everything below and go directly to the Health Check Mode section.

---

## Core Technique: Docs Travel With Code

The pipeline's real power isn't brainstorm→plan→execute. It's that **documentation and implementation stay in sync — always.** Two mechanisms make this work:

### Fixed Macro Docs (every project gets these)

```
docs/
  overview.md          ← product context, data flow, module index
  techstack.md         ← tech choices, architecture rules, coding patterns
  superpowers/
    specs/             ← design specs from brainstorming (temporal — deleted after merge)
    plans/             ← implementation plans (temporal — deleted after merge)
```

These are non-negotiable. `overview.md` and `techstack.md` are living documents — they evolve with the code.

### Adaptive Persistent Docs (project-specific, discovered during Q&A)

Some projects need more structure. Examples:

- `docs/specs/` + `index.md` — persistent feature specs (what each feature does and why). For multi-feature products.
- `docs/building.md` — build/distribution instructions. For projects with non-trivial builds.
- `docs/help/` — user-facing guides. For products with end users.

What goes here is discovered during Q&A (Phase 2). A 3-file CLI? No specs folder needed. A multi-module product? Scaffold `docs/specs/` with an index and seed entries.

### The Sync Discipline (baked into CLAUDE.md, non-negotiable)

**Before every commit**, the pipeline requires:
1. Scan `docs/` for files that describe behavior touched by the diff
2. If any doc is potentially stale → report to user with doc path, what looks outdated, and relevant diff context
3. Resolve together — don't silently fix, don't silently skip
4. Stale docs are worse than missing ones

This isn't a nice-to-have. This is what makes the docs trustworthy. Without it, docs rot within a week.

### Two Kinds of Specs

| | Temporal (superpowers) | Persistent (project) |
|---|---|---|
| **Location** | `docs/superpowers/specs/` | `docs/specs/` (or project-specific path) |
| **Purpose** | Work orders — design exploration before implementation | Source of truth — what exists and why |
| **Lifecycle** | Deleted after merge | Updated as features evolve |
| **Created by** | Brainstorming skill | Bootstrap seeding, then maintained during development |
| **Content** | Options, trade-offs, decisions | Product-level behavior, user flows, design decisions |

---

## How It Works

The chicken-and-egg problem: you need the pipeline to track work, but setting up the pipeline IS work. Solution: **scaffold the pipeline cold, then use it to finish its own bootstrap.**

```
Session 1 (/sp-bootstrap):
  Quick scan → Q&A alignment → scaffold pipeline → write bootstrap plan → commit
  Pipeline is now LIVE. /todo works. Deep analysis is tracked as tasks.

Session 2+ (/todo → pick a task):
  - [ ] Deep techstack analysis → docs/techstack.md
  - [ ] Product overview distillation → docs/overview.md
  - [ ] Enhance CLAUDE.md with coding standards, commands
  - [ ] Seed persistent specs (if applicable)
  - [ ] Run /resolve-skills
```

Each task is session-sized. Context window stays clean. User runs `/todo` to see what's next.

---

## Phase 1: Quick Scan (lightweight, parallel reads)

Gather just enough to scaffold. Do NOT deep-analyze yet.

### Manifest Detection

Check which of these exist (don't read fully — just detect presence and skim):

| File | Stack signal |
|---|---|
| `package.json` | Node.js — skim `scripts`, `type` field, top-level deps |
| `tsconfig.json` | TypeScript |
| `Cargo.toml` | Rust |
| `pyproject.toml` / `requirements.txt` | Python |
| `go.mod` | Go |
| `Gemfile` | Ruby |
| `pom.xml` / `build.gradle` | Java/Kotlin |
| `composer.json` | PHP |
| `pubspec.yaml` | Dart/Flutter |
| `CMakeLists.txt` / `Makefile` | C/C++ |
| `.csproj` / `*.sln` | C#/.NET |

### Quick Structure

- `ls` root directory
- Check for: `docs/`, `README.md`, `CLAUDE.md`, `.claude/`, monorepo indicators
- Note existing doc structure (don't read docs deeply yet)

### Git State

- `git log --oneline -10` — commit style, recent activity
- `git shortlog -sn --all | head -5` — contributor count
- Current branch

### Existing CLAUDE.md

If it exists, read it. This is mid-adoption — note what's already there.

**Output of Phase 1:** A mental model of "what kind of project is this" — stack name, structure shape, maturity level. NOT a deep analysis.

---

## Phase 2: Q&A Alignment

Before writing anything, confirm your understanding with the user. Ask these **one at a time**, serial:

### Required Questions

1. **"What does this project do?"** — Even if README exists, ask. The user's answer reveals what they think matters vs what the docs say. Compare with README if it exists; flag discrepancies.

2. **"Who uses it?"** — End users? Developers? Internal tool? Library consumers? This shapes how `overview.md` will be written later.

3. **"What's the current state?"** — Greenfield? Active development? Maintenance mode? Mid-rewrite? This determines how aggressive the bootstrap should be.

### Conditional Questions

4. **If monorepo detected:** "What are the packages/apps and how do they relate?"

5. **If existing CLAUDE.md:** "Anything in the current CLAUDE.md that's wrong or outdated? Anything you want to keep as-is?"

6. **If existing docs/:** "Are these docs current, or should I treat them as potentially stale?"

7. **If multi-feature product (not a tiny CLI or single-purpose lib):** "Do you want persistent feature specs? These are living docs that describe what each feature does and why — updated as the product evolves. They'd live in `docs/specs/` with an index. Worth it for your project, or overkill?"

8. **If non-trivial build/distribution:** "Do you need build docs (`docs/building.md`)? For things like multiple distribution targets, platform-specific steps, CI setup."

9. **If user-facing product:** "Do you want a `docs/help/` folder for user-facing guides (troubleshooting, privacy, FAQ)?"

### Alignment Confirmation

After questions, present a short summary:

```
Here's what I understand:
- Project: {name} — {one-line description}
- Stack: {runtime} + {framework} + {key tools}
- State: {greenfield/active/maintenance}
- User: {who uses it}
- Structure: {monorepo/single package/other}
{- Existing CLAUDE.md: {keep/enhance/replace}}

Doc structure I'll scaffold:
  docs/
    overview.md              ← always
    techstack.md             ← always
    superpowers/specs/       ← always (temporal)
    superpowers/plans/       ← always (temporal)
    {specs/ + index.md       ← if confirmed}
    {building.md             ← if confirmed}
    {help/                   ← if confirmed}

Sound right?
```

Wait for confirmation before proceeding. If anything is off, correct and re-confirm.

---

## Phase 3: Cold Scaffold

With alignment confirmed, scaffold the pipeline. This is the minimum viable setup — enough for `/todo` and the workflow to function.

### 3a: Create Folder Structure

**Always created (fixed macro):**
```
docs/
  superpowers/
    specs/       ← design specs from brainstorming (temporal)
    plans/       ← implementation plans (temporal)
```

**Created if confirmed during Q&A (adaptive):**
```
docs/
  specs/
    index.md     ← catalog of persistent feature specs
  building.md    ← build/distribution instructions
  help/          ← user-facing guides
```

Add `.gitkeep` in each empty folder. If `docs/` already exists, nest alongside.

If `docs/specs/` is scaffolded, create `index.md` with:

````markdown
# Feature Specs

Source of truth for what {project} does and why. Each spec covers product-level behavior — intent, user flows, cross-module interactions, and design decisions.

**Permanent source of truth.** Superpowers specs (`docs/superpowers/specs/`) are work orders deleted after merge. These specs describe what exists and why — updated as features evolve.

**Product-level, code-light.** Implementation details and module internals live in the code. Specs focus on the "why" and the product logic that connects modules.

---

## Specs

| Spec | Covers |
|---|---|
| *(seeded during bootstrap Task 5 or as features land)* | |
````

### 3b: Write Skeleton CLAUDE.md

If no CLAUDE.md exists, create one. If one exists, enhance it (add missing sections, preserve existing content).

The skeleton contains the **workflow engine** — enough for any Claude session to know the rules — but leaves techstack and coding standards as stubs pointing to the bootstrap plan.

```markdown
# {Project Name}

## Development Workflow

Before starting any work, **assess the task size and propose a route for the user to confirm.** Present it like:

\```
This looks [small/medium/large] because [reason].
Route: [steps]
Impact: [what changes, how many files, risk level]
OK to proceed?
\```

### Routes

**Small** — Single file, clear intent, no design decisions
→ Just do it → review → `/commit`

**Medium** — Multi-file, some design choices, completable in one session
→ Brainstorm (quick, inline) → implement → review → `/commit`

**Large** — Multi-session, architectural, unclear scope
→ Full pipeline: brainstorm → spec → plan → execute → review → cleanup → finish
→ Specs go to `docs/superpowers/specs/`, plans to `docs/superpowers/plans/`
→ These are temporal artifacts — delete the spec and plan files before the final merge commit

The user always picks the route.

**User instructions override Superpowers defaults.**

### Doc Sync (non-negotiable)

**Before every commit**, scan `docs/` for files that describe behavior touched by the diff (specs, overview, techstack, building, help). If any doc is potentially stale:

1. Report it to the user — doc path, what looks outdated, relevant diff context
2. Resolve together — update the doc or acknowledge it's still accurate
3. Never silently fix. Never silently skip. Stale docs are worse than missing ones.

This is the pipeline's core discipline. Implementation without doc sync is incomplete.

## Solo Dev Assumptions

This project is operated by a single developer across multiple Claude Code sessions.

- **No PR self-review** — commit directly to working branch
- **Simple branching** — `main` + feature branches, no rebasing
- **No force push** — every commit is sacred, no rewriting history
- **Session isolation** — each Claude session commits only its own changes
- **No merge conflicts expected** — if one occurs, stop and ask the user

## Project Structure

\```
{detected tree — top-level only, brief annotations}
\```

## Tech Stack

- **Runtime**: {detected, e.g., Node.js 20+, ESM}
- **Framework**: {detected, e.g., Next.js 14}
{...other detected layers, one bullet each}

> Full techstack analysis pending — see `docs/superpowers/plans/bootstrap.md` task list.

## Commands

\```bash
{detected from scripts/Makefile/Cargo — only what exists right now}
\```

## Git Notes

- **Only commit current session's changes** — if unrelated uncommitted changes exist from prior work, leave them alone
- **Atomic commits** — one logical change per commit
- **Conventional commits** — `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`

## Planning

- `docs/overview.md` — Product context, data flow, module index (once written)
- `docs/techstack.md` — Tech choices and architecture rules (once written)
{- `docs/specs/` — **Persistent feature specs** — source of truth per feature ([index](docs/specs/index.md))}
{- `docs/building.md` — Build/distribution instructions}
{- `docs/help/` — User-facing guides}
- `docs/superpowers/specs/` — Design specs from brainstorming (temporal — deleted after merge)
- `docs/superpowers/plans/` — Implementation plans (temporal — deleted after merge)

{plus any existing docs references}

> **Two kinds of specs:** `docs/specs/` = permanent source of truth (updated as features evolve). `docs/superpowers/specs/` = temporal work orders (deleted after merge).
```

### Adaptation Notes

- Only include sections relevant to the detected stack
- If CLAUDE.md already exists with good content (commands, structure, etc.), preserve it and layer workflow on top
- Shell notes, design system refs, protocol refs — only if the project has them
- The `> pending` markers tell future sessions that deep analysis hasn't happened yet

### 3c: Write Bootstrap Plan

Write to `docs/superpowers/plans/bootstrap.md`:

````markdown
# Pipeline Bootstrap Plan

> **For agentic workers:** Use `/todo` to see current progress. Each task is independent and session-sized.

**Goal:** Complete the superpowers pipeline setup for {project name}

**Context:** Pipeline scaffolded on {date}. Skeleton CLAUDE.md is live with workflow rules. These tasks complete the deep analysis and finalize the setup.

---

### Task 1: Techstack Analysis

Deep-dive into the project's technical stack and write `docs/techstack.md`.

**Input:** Read manifest files, config files, sample 3-5 source files, test files.

- [ ] **Read manifest files fully** — `package.json` (all fields), `tsconfig.json`, linter config, build config, CI config
- [ ] **Sample source files** — read main entry point, one typical module, one test file, one utility. Note: import style, error handling, naming conventions, class vs function, type usage
- [ ] **Identify architecture patterns** — data flow direction, module boundaries, file organization, dependency philosophy
- [ ] **Draft techstack.md** — stack table, dependency philosophy, architecture rules, coding patterns, build & distribution, rejected alternatives (if discoverable)
- [ ] **Present to user for review**
- [ ] **Write `docs/techstack.md`**
- [ ] **Commit**: `docs: add techstack analysis`

### Task 2: Product Overview

Distill the product context and write `docs/overview.md`.

**Input:** README, existing docs, code structure, git history, Q&A answers from bootstrap.

- [ ] **Read README and existing docs fully**
- [ ] **Trace data flow** — find entry points, follow the path through the code, identify inputs/transforms/outputs
- [ ] **Build module index** — scan all significant files/directories, one-line description each
- [ ] **Identify key boundaries** — API contracts, internal interfaces, external dependencies
- [ ] **Draft overview.md** — problem, solution, user, user flow, data flow, module index, key boundaries
- [ ] **Present to user for review**
- [ ] **Write `docs/overview.md`**
- [ ] **Commit**: `docs: add product overview`

### Task 3: Enhance CLAUDE.md

Replace stub sections with full content derived from techstack and overview analysis.

**Depends on:** Task 1 and Task 2 (needs their output)

- [ ] **Write Coding Standards section** — derived from techstack.md patterns (import style, error handling, naming, etc.)
- [ ] **Update Tech Stack section** — remove "pending" marker, add reference to `docs/techstack.md`
- [ ] **Update Planning section** — add references to `docs/overview.md` and `docs/techstack.md`. If `docs/specs/` exists, include the spec index reference with a note like: `docs/specs/` — **Feature specs** — source of truth per feature ([index](docs/specs/index.md))
- [ ] **Verify doc staleness check wording** — the CLAUDE.md should prominently instruct: before every commit, scan `docs/` for files touched by the diff, report stale docs to user, resolve together. This is non-negotiable pipeline behavior.
- [ ] **Add any project-specific sections** — ownership boundaries, protocol references, design system refs — only if the project has them
- [ ] **Present changes to user**
- [ ] **Update CLAUDE.md**
- [ ] **Commit**: `docs: finalize CLAUDE.md with full analysis`

### Task 4: Skill Resolution

Match the project's techstack to available skills.

**Depends on:** Task 1 (needs detected stack)

- [ ] **Run `/resolve-skills`** — let it scan and propose skills
- [ ] **Review and approve skill selections**
- [ ] **Commit if skills were added**

### Task 5: Seed Feature Specs *(only if `docs/specs/` was scaffolded)*

Write initial persistent specs for the project's existing features.

**Depends on:** Task 2 (needs product overview to identify features)

- [ ] **Identify 3-5 major features** from overview.md module index and code structure
- [ ] **For each feature, write a spec** — product-level: intent, user flow, cross-module interactions, design decisions. Code-light — no API tables or implementation details.
- [ ] **Update `docs/specs/index.md`** — add each spec to the table with a one-liner describing what it covers
- [ ] **Present to user for review**
- [ ] **Commit**: `docs: seed persistent feature specs`

### Task 6: Cleanup

- [ ] **Delete this file** (`docs/superpowers/plans/bootstrap.md`) — bootstrap is complete
- [ ] **Verify `/todo` shows no active work** (unless the user has started real project work)
- [ ] **Commit**: `chore: complete pipeline bootstrap`
````

Adapt the plan to what the project actually needs:
- If `docs/techstack.md` already exists and is good, skip Task 1 or reduce it to a review
- If `docs/overview.md` already exists, same
- If CLAUDE.md is already comprehensive, Task 3 becomes a light touch-up
- Add tasks for any project-specific needs discovered during Q&A

### 3d: Commit the Scaffold

Use `/commit` to stage and commit:
- `CLAUDE.md` (new or modified)
- `docs/superpowers/specs/.gitkeep`
- `docs/superpowers/plans/.gitkeep`
- `docs/superpowers/plans/bootstrap.md`
- `docs/specs/index.md` (if scaffolded)
- `docs/specs/.gitkeep` (if scaffolded)
- Any other adaptive doc files/folders created

Commit message: `chore: scaffold superpowers pipeline`

---

## Phase 4: Handoff

After committing, tell the user:

> **Pipeline is live.** Skeleton CLAUDE.md is driving workflow. Tasks remain to complete the bootstrap:
>
> 1. Techstack analysis → `docs/techstack.md`
> 2. Product overview → `docs/overview.md`
> 3. Enhance CLAUDE.md with full standards
> 4. Skill resolution
> {5. Seed feature specs → `docs/specs/` (if scaffolded)}
>
> Run `/todo` in any session to see what's next. Each task is session-sized — you can knock them out one at a time or batch them.
>
> Want to start Task 1 now, or pick this up later?

If the user wants to continue, proceed with Task 1 from the bootstrap plan in the current session.

---

## Health Check Mode

**Trigger:** `/sp-bootstrap health` — or when the user asks to check if their pipeline is current.

This mode is for repos that already have the pipeline. No Q&A, no scaffolding — just detect drift and report.

### What to Check

Run these checks in parallel where possible:

#### 1. CLAUDE.md Pipeline Sections

Read the project's CLAUDE.md and check for **pipeline-owned sections**. These are the sections sp-bootstrap writes — they should stay current with the template.

| Section | Check for |
|---|---|
| **Development Workflow** | Route sizing pattern (small/medium/large), route steps match current template |
| **Doc Sync** | "non-negotiable" wording, 3-step protocol (report → resolve → never silently skip) |
| **Solo Dev Assumptions** | 5 bullet points (no PR self-review, simple branching, no force push, session isolation, no merge conflicts) |
| **Git Notes** | Atomic commits, session isolation, conventional commits |
| **Planning** | References to `docs/overview.md`, `docs/techstack.md`, temporal vs persistent spec distinction |

**Do NOT check or suggest changes to project-owned sections:** Project Structure, Tech Stack, Commands, Coding Standards, or any custom sections the project added.

#### 2. Doc Structure

Check that expected directories and files exist:

```
docs/
  overview.md              ← should exist (may be stub if bootstrap incomplete)
  techstack.md             ← should exist (may be stub if bootstrap incomplete)
  superpowers/
    specs/                 ← must exist
    plans/                 ← must exist
```

Also check for adaptive docs that were scaffolded (detect from CLAUDE.md Planning section or `docs/specs/index.md` existence).

#### 3. Leftover Temporal Artifacts

Check `docs/superpowers/plans/` and `docs/superpowers/specs/` for files that look like they belong to completed work (merged branches). These should have been deleted before merge.

- `bootstrap.md` in plans/ — is the bootstrap actually done? If all tasks are complete but the file remains, flag it.
- Any other spec/plan files — check if their branch was merged. If so, flag as cleanup needed.

#### 4. Served Skills Freshness

Check `.claude/skills/` for `.served` marker files. If present, note that `/resolve-skills` can update them. Don't duplicate resolve-skills logic — just flag staleness if `.served` files are old (>30 days by mtime).

### Report Format

Present findings as a drift report:

```
## Pipeline Health — {project name}

| Area | Status | Detail |
|---|---|---|
| CLAUDE.md: Workflow | ✓ current | — |
| CLAUDE.md: Doc Sync | ⚠ drift | Missing "never silently skip" language |
| CLAUDE.md: Solo Dev | ✓ current | — |
| CLAUDE.md: Git Notes | ✓ current | — |
| CLAUDE.md: Planning | ⚠ drift | Missing persistent vs temporal spec distinction |
| Doc structure | ✓ current | — |
| Temporal cleanup | ⚠ stale | `docs/superpowers/plans/bootstrap.md` — bootstrap complete but file remains |
| Served skills | ✓ current | Last updated 5 days ago |

### Recommended fixes:
1. Update Doc Sync section in CLAUDE.md — add "never silently skip" protocol step
2. Update Planning section — add two-kinds-of-specs note
3. Delete `docs/superpowers/plans/bootstrap.md`

Apply these fixes? (I'll show you the diff for each before writing)
```

### Applying Fixes

If the user approves:
1. Show the diff for each CLAUDE.md section change — old vs new
2. Wait for approval on each change (or batch approval)
3. Apply changes
4. If temporal cleanup needed, delete the stale files
5. If skills are stale, suggest running `/resolve-skills`
6. Commit: `chore: sync pipeline with current sp-bootstrap template`

### What Health Check Does NOT Do

- Re-ask Q&A questions — the project context is already established
- Re-scaffold directories — if something is missing, it flags it, doesn't silently create
- Touch project-specific content — commands, standards, structure, tech stack details
- Run resolve-skills — it flags staleness but lets the user invoke it separately
- Deep-analyze code — this is a structural/template check only

---

## Mid-Adoption Specifics

When bootstrapping an existing project with history:

1. **Respect existing conventions** — if they use tabs, don't mandate spaces. If they have a linter config, reference it rather than prescribing rules.
2. **Reference existing docs** — enhance or link, don't duplicate.
3. **Don't reorganize** — add pipeline structure alongside existing structure.
4. **Detect existing patterns** — conventional commits, Makefile targets, etc.
5. **Preserve what works** — existing CLAUDE.md content that's accurate stays.
6. **Scale the bootstrap plan** — if docs already exist, tasks become review/enhance instead of create from scratch.

## Principles

- **Scaffold first, analyze later** — get the pipeline running before doing deep work
- **The pipeline bootstraps itself** — deep analysis is tracked as pipeline tasks, provable by `/todo`
- **Session-sized tasks** — each task fits in one Claude session without blowing context
- **Pre-distillation Q&A** — confirm understanding before writing anything permanent
- **Detect, don't assume** — every section grounded in what was found in the repo
- **Solo dev first** — no team workflows, no complex branching
- **Docs travel with code** — every commit checks for stale docs. Implementation without doc sync is incomplete. This is the pipeline's real power.
- **Fixed macro, adaptive micro** — `overview.md`, `techstack.md`, `superpowers/` are always scaffolded. `specs/`, `building.md`, `help/` are scaffolded only when the project warrants them.
- **Two kinds of specs** — temporal (superpowers) = work orders, deleted after merge. Persistent (project) = source of truth, evolve with the product. Never confuse them.
- **Clear doc ownership** — `techstack.md` owns tech, `overview.md` owns product, `CLAUDE.md` owns workflow, `specs/` owns feature behavior. No duplication across docs.
- **Enhance, don't replace** — mid-adoption preserves existing work
- **User approves everything** — present drafts, get approval, then write
