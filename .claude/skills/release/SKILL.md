---
name: release
description: Prepare a version release — bump version files, commit, and tag. Just run /release with no arguments.
---

# Release

Prepare a version release. No arguments — reads git state and decides what to do.

## Usage

```
/release
```

## Project Config

- **Type:** tauri
- **Version files:**
  - `package.json` → `version` (current: 0.4.1)
  - `src-tauri/tauri.conf.json` → `version` (current: 0.4.1)
  - `src-tauri/Cargo.toml` → `version` (current: 0.4.1)
- **Platforms:** none (single-platform)
- **Main branch:** main

## Protocol

### 1. Qualify

Run in parallel:
- `git status` — working tree must be clean. If dirty, stop: "Commit or stash changes first."
- `git branch --show-current` — must be on `main`. If not, warn and ask to continue.

### 2. Read state

```bash
# Latest version tag
git tag -l "v*" --sort=-v:refname | head -1

# Commits since last version tag
git log <latest-tag>..HEAD --oneline

# Check if current commit == tagged commit
git rev-parse HEAD
git rev-parse <latest-tag>^{commit}  # (skip if no tags)
```

### 3. Decide

Based on the state, determine which flow to run:

**STATE A — No version tag exists:**
→ Go to "Full Release Flow"

**STATE D — Version tagged, different commit (single-platform project):**
→ Go to "Full Release Flow"

**STATE E — Version tagged, same commit:**
→ "v{latest} fully released. Nothing to do."

### Full Release Flow

**Step 1 — Detect bump level** from conventional commits since last tag:

| Signal | Bump |
|---|---|
| `BREAKING CHANGE:` in body, or `!:` suffix | major |
| `feat:` | minor |
| `fix:`, `refactor:`, `chore:`, `docs:`, `test:`, `perf:` | patch |
| No conventional prefixes | patch (default) |

Use the highest level found. If no previous tag exists, ask user for the version.

**Step 2 — Propose:**

> Current: {current_version} → New: {new_version} (auto: N feat, N fix since v{current})
> OK?

Wait for confirmation. User can override the version.

**Step 3 — Bump version files:**

Edit `package.json`: change `"version": "{current_version}"` → `"version": "{new_version}"`
Edit `src-tauri/tauri.conf.json`: change `"version": "{current_version}"` → `"version": "{new_version}"`
Edit `src-tauri/Cargo.toml`: change `version = "{current_version}"` → `version = "{new_version}"`

Use the Edit tool for each file. Only change version fields.

Then sync `src-tauri/Cargo.lock`'s `claudia` self-version entry (it does not track `Cargo.toml` automatically):

```bash
cargo update -p claudia --manifest-path src-tauri/Cargo.toml
```

This rewrites only the `claudia` package version in the lock — no other deps move. If `cargo` is unavailable, note that the lock reconciles at the next build and stage it then.

**Step 4 — Generate release notes** from commits since last tag:

```
## What's New
- description (from feat: commits)

## Fixes
- description (from fix: commits)

## Other
- description (from everything else)
```

Omit empty sections. Show to user for approval.

**Step 5 — Commit and tag:**

```bash
git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "chore: release v{version}"
git tag -a v{version} -m "<release notes>"
```

`Cargo.lock` is staged alongside the manifests so the release commit carries the synced self-version — without it the working tree stays dirty after the next build.

Use annotated tag. Pass message via HEREDOC.

**Step 6 — Report + offer push:**

> Release v{version} prepared (commit + tag v{version}).
> Push to publish? Runs `git push origin main --tags`. (y / skip)

Push only on explicit yes. Skip by default if the user is silent. Never force push.

## Rules

- Push only on explicit confirmation — offer after commit/tag, run `git push ... --tags` on yes, never force, never unannounced.
- Working tree must be clean before proceeding — step 1 enforces this.
- Never delete or move existing tags.
- All tags are annotated (`git tag -a`).
- Run `/release` with no arguments — the skill auto-detects state.
