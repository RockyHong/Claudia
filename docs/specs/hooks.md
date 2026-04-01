# Hooks

The integration contract between Claude Code and Claudia.

## Protocol

Claude Code's hook system runs shell commands at lifecycle points. Claudia installs `curl` commands that POST stdin JSON to the server:

```
Claude Code → stdin JSON → curl POST /hook/:type → hook-transform.js → session-tracker
```

**Critical detail**: data comes via **stdin JSON**, not environment variables. The `--data @-` flag pipes stdin to the POST body.

## Hook Types

| Hook | State | Purpose |
|---|---|---|
| `SessionStart` | idle | New session |
| `UserPromptSubmit` | busy | User sent a prompt |
| `PreToolUse` | busy | Tool about to run |
| `PostToolUse` | busy | Tool finished |
| `PermissionRequest` | pending | Needs approval |
| `Stop` | idle | Turn complete |
| `SessionEnd` | stopped | Session closed |
| `SubagentStop` | busy | Subagent finished |
| `PreCompact` | busy | Context compaction |

## Installation Flow

1. **First run** — HookGate overlay blocks the dashboard until hooks are installed. One button, one action.
2. **Merge strategy** — `mergeHooks()` adds Claudia's hooks to `~/.claude/settings.json` without touching other tools' hooks. Each hook type gets its own array entry.
3. **Removal** — `removeHooks()` strips only Claudia entries. `npx cldi uninstall` does full cleanup.
4. **Silent failure** — if Claudia server is down, `curl` fails and Claude Code continues unaffected. This is by design — hooks must never block the user's work.

## Design Decisions

- **Hardcoded port 48901** — no discovery needed, hooks are static strings
- **No bidirectional channel** — hooks push to server, that's it. Server pushes to browser via SSE. Two unidirectional pipes, not one bidirectional one.
- **Legacy `/event` endpoint** — accepts pre-formatted events for backwards compatibility, but all hooks use `/hook/:type`
