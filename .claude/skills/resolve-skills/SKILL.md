---
name: resolve-skills
description: Scan project context and manage skill inventory — proposes adds, updates, and removals, then calls serve.sh to sync.
---

# Resolve Skills

Manage the project's skill inventory. Scans project context, compares against must-haves and available skills, proposes changes, serves on approval.

## Protocol

1. **Scan project context** (parallel reads):
   - `CLAUDE.md` and `.claude/agents/*.md` — role definitions, skill references, tech stack clues
   - `package.json`, `requirements.txt`, `Cargo.toml`, `go.mod`, `Gemfile`, `pom.xml`, `build.gradle` — tech stack detection
   - `.claude/skills/` — currently installed skills (check for `.served` marker vs project-native)

2. **Read catalogs:**
   - **Must-have:** `~/.claude/skills/must-have.txt` — skills every project gets
   - **Available:** Run `bash ~/.claude/skills/serve.sh --list` to see the full buffet
   - **Project catalog:** `.claude/skills/.catalog` (if exists) — previous choices with rationale

3. **Diff installed vs needed:**
   - Must-haves: always include, no rationale needed
   - Stack picks: match tech stack to available skills (e.g., Next.js project → `nextjs-developer`, `react-expert`, `typescript-pro`)
   - Stale: served skills whose source has changed (checksum mismatch)
   - Orphaned: served skills no longer relevant to the project stack

4. **Propose changes to user:**
   Format as a clear table:
   ```
   Action  | Skill              | Reason
   --------|--------------------|--------------------------
   ADD     | nestjs-expert      | NestJS backend detected
   ADD     | react-expert       | React in dependencies
   UPDATE  | commit             | Source changed (stale)
   REMOVE  | django-expert      | Not in tech stack
   KEEP    | typescript-pro     | Still relevant
   ```

5. **On user approval — serve immediately (don't wait):**
   - Build the full skill list (must-haves + approved picks)
   - Run: `bash ~/.claude/skills/serve.sh --no-update .claude/skills <skill1> <skill2> ...`
   - Update `.claude/skills/.catalog` with the new inventory and rationale

6. **Plugin freshness check (after serving):**
   - Check `~/.claude/skills/.last-plugin-update` — if missing or >7 days old, inform the user:
     ```
     ⚠ Plugins are Xd stale. Warm now or skip?
     → warm: runs `bash ~/.claude/skills/serve.sh .claude/skills <skills...>` (with update)
     → skip: already served with current local copies — update next time
     ```
   - Do NOT block on this. Skills are already served. This is a lazy-warm offer.
   - If user says "warm" or "update": re-run serve.sh **without** `--no-update` to trigger the background plugin update, then re-serve to pick up any changes.
   - If user says "skip": no action needed, move on.

7. **Report:** Summary of what changed. Remind user to commit if skills were added/updated.

## .catalog Format

The catalog lives at `.claude/skills/.catalog`. It records what was served and why, so future runs can diff intelligently.

```
# .claude/skills/.catalog
# Managed by /resolve-skills. Records served skills + rationale.
# Do not edit manually — run /resolve-skills to update.

## Must-have (auto-included)
resolve-skills
commit
merge
release
rename-refactor
user-journey-simulation

## Project picks
react-expert          # Next.js web app
nestjs-expert         # NestJS backend
react-native-expert   # Expo mobile app
typescript-pro        # monorepo-wide TS
```

## Rules

- Never serve a skill that already exists as project-native (no `.served` marker).
- Never remove project-native skills — only manage served skills.
- Silent no-op if `~/.claude/skills/serve.sh` doesn't exist (cloud environment — skills are committed snapshots).
- Stack detection is best-effort. When uncertain, propose with a `?` flag and let the user decide.
- Keep the catalog concise — one line per skill with a short rationale comment.
