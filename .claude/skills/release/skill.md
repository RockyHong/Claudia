---
name: release
description: Use when preparing a version release - checks qualification (lint, tests, clean git, on main), bumps semver across all config files, commits and tags. User pushes manually to trigger CI.
---

# Release

Prepare a version release: qualify, bump, commit, tag. User pushes to trigger CI.

## Usage

```
/release              # patch bump (0.1.0 → 0.1.1)
/release minor        # minor bump (0.1.0 → 0.2.0)
/release major        # major bump (0.1.0 → 1.0.0)
/release 2.0.0        # explicit version
```

## Protocol

### 1. Qualify (parallel)

Run all checks. ALL must pass before proceeding:

- `git status` — working tree must be clean (no uncommitted changes)
- `git branch --show-current` — must be on `main` (or `master`)
- `npm run lint` — lint must pass
- `npm test` — tests must pass

If ANY check fails: report which failed, stop. Do not proceed.

### 2. Determine version

- Read current version from `package.json`
- If user provided an explicit arg (`patch`, `minor`, `major`, or `X.Y.Z`), use it
- Otherwise, **auto-detect** from conventional commits since last tag:
  - `git tag --sort=-v:refname` to find the latest `v*` tag (if no tags exist, use all commits)
  - `git log <last-tag>..HEAD --oneline` to get commits since last release
  - Scan commit prefixes to determine bump level:

    | Signal | Bump |
    |--------|------|
    | `BREAKING CHANGE:` in body, or `feat!:`, `fix!:`, etc. (exclamation mark) | **major** |
    | `feat:` | **minor** |
    | `fix:`, `refactor:`, `chore:`, `docs:`, `test:`, `style:`, `perf:` | **patch** |

  - Use the **highest** bump level found (major > minor > patch)
  - Default to `patch` if no conventional prefixes found
- Calculate new version using semver rules
- Show: `Current: 0.1.0 → New: 0.2.0 (auto: 3 feat, 2 fix since v0.1.0)` and confirm with user

### 3. Bump version in all files

Find and update version strings in these files (verify each exists first):

| File | Field |
|------|-------|
| `package.json` | `"version": "X.Y.Z"` |
| `src-tauri/tauri.conf.json` | `"version": "X.Y.Z"` |
| `src-tauri/Cargo.toml` | `version = "X.Y.Z"` |

Use the Edit tool for each. Only change the version field, nothing else.

If a file doesn't exist (e.g., no Tauri setup), skip it silently.

### 3b. Sync lockfiles

After bumping, regenerate any lockfiles that embed the version:

```bash
cargo generate-lockfile --manifest-path src-tauri/Cargo.toml
```

Skip if `src-tauri/Cargo.toml` doesn't exist.

### 4. Generate release notes

Using the commits from step 2, write a release notes summary. Format:

```
## What's New

- Brief description of feature A
- Brief description of feature B

## Fixes

- Brief description of fix A

## Other

- Brief description of chore/refactor
```

Rules:
- Group by: `What's New` (feat), `Fixes` (fix), `Other` (everything else)
- Omit empty sections
- One line per logical change — summarize terse commit messages into human-readable descriptions
- Don't include the `chore: release vX.Y.Z` commit itself

Show the release notes to the user for approval before proceeding.

### 5. Commit and tag

```bash
git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "chore: release vX.Y.Z"
git tag -a vX.Y.Z -m "<release notes from step 4>"
```

Use an annotated tag (`-a`) with the release notes as the tag message. Pass the message via HEREDOC to preserve formatting.

### 6. Report

```
Release vX.Y.Z prepared.

To publish:
  git push origin main --tags

This will trigger the GitHub Actions build & release workflow.
```

## Rules

- Never push. User pushes manually.
- Never skip qualification checks.
- Never proceed if working tree is dirty — the user must commit or stash first.
- If lint or tests fail, show the output so user can fix.
- Always confirm the version bump with user before writing files.
