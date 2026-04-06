---
name: resolve-claude-config
description: "Scan project context and manage skill inventory, MCP servers, and Claude config — dispatches to the skills repo via ~/.claude/.repo-path"
---

# Resolve Claude Config

Manage a project's Claude Code configuration. Scans project context, resolves skills from the shared repo, proposes and applies changes.

This is a **bridge skill** — it lives at `~/.claude/skills/` (device-wide) and dispatches to the actual repo scripts via a pointer file.

## Protocol

### 1. Locate repo

Read `~/.claude/.repo-path` to get `REPO_ROOT`.

If the file is missing or empty:
> "Repo not registered. Run `bash /path/to/claude-skills/setup.sh` first."

Stop here.

If the path doesn't exist on disk:
> "Repo path in `~/.claude/.repo-path` points to `{path}` which doesn't exist. Did you move the repo? Re-run `setup.sh` from the new location."

Stop here.

### 2. Determine mode

Based on user request:

| Request | Mode | Action |
|---------|------|--------|
| `/resolve-claude-config` (default) | skills | Resolve and serve project skills |
| `/resolve-claude-config skills` | skills | Same as default |

Future modes (not yet implemented): `mcp`, `config`, `all`

### 3. Dispatch — skills mode

This mode is identical to the old `/resolve-skills` behavior. Execute the full resolve-skills protocol:

1. **Scan project context** (parallel reads):
   - `CLAUDE.md` and `.claude/agents/*.md` — role definitions, skill references, tech stack clues
   - `package.json`, `requirements.txt`, `Cargo.toml`, `go.mod`, `Gemfile`, `pom.xml`, `build.gradle` — tech stack detection
   - `.claude/skills/` — currently installed skills (check for `.served` marker vs project-native)

2. **Read catalogs:**
   - **Must-have:** `$REPO_ROOT/must-have.txt` — skills every project gets
   - **Available (human):** Run `bash $REPO_ROOT/serve.sh --list` to see the full buffet
   - **Available (machine):** Run `bash $REPO_ROOT/serve.sh --list-names` for programmatic use
   - **Project catalog:** `.claude/skills/.catalog` (if exists)
   - **Currently disabled:** `.claude/settings.json` → `disabledSkills` array

3. **Diff installed vs needed:**
   - Must-haves: always include, no rationale needed
   - Stack picks: match tech stack to available skills
   - Stale: served skills whose source has changed (checksum mismatch)
   - Orphaned: served skills no longer relevant to project stack
   - **Disable candidates:** remaining available plugin skills not selected

4. **Propose changes to user:**
   ```
   === Serve ===
   Action  | Skill              | Reason
   --------|--------------------|--------------------------
   ADD     | nestjs-expert      | NestJS backend detected
   UPDATE  | commit             | Source changed (stale)
   REMOVE  | django-expert      | Not in tech stack
   KEEP    | typescript-pro     | Still relevant

   === Disable (not relevant to this project) ===
   flutter-expert, swift-expert, rails-expert, ...
   (N skills — will be added to .claude/settings.json disabledSkills)
   ```

5. **On user approval — serve and disable:**
   - Run: `bash $REPO_ROOT/serve.sh --no-update .claude/skills <skill1> <skill2> ...`
   - Write disabled skills to `.claude/settings.json` under `disabledSkills`
   - Update `.claude/skills/.catalog`

6. **Plugin freshness check** (after serving):
   - Check `$REPO_ROOT/.last-plugin-update` — if >7 days old, offer lazy warm

7. **Report:** Summary of what changed.

## Rules

- Never serve a skill that already exists as project-native (no `.served` marker)
- Never remove project-native skills
- Silent no-op if `~/.claude/.repo-path` missing (cloud environment — skills are committed snapshots)
- Stack detection is best-effort — when uncertain, propose with `?` flag
- Never disable stack-agnostic skills (process/workflow, design/review, infrastructure, meta)
- Only disable language/framework-specific skills not matching project tech stack
- Keep catalog concise — one line per skill with short rationale
