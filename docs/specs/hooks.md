# Hooks

The integration contract between Claude Code and Claudia.

## Protocol

Claude Code's hook system runs shell commands at lifecycle points. Claudia installs `curl` commands that POST stdin JSON to the server:

```
Claude Code → stdin JSON → curl POST /hook/:type → hook-transform.js → session-tracker
```

**Critical detail**: data comes via **stdin JSON** (the `--data @-` flag pipes stdin to the POST body).

`SessionStart` and `UserPromptSubmit` carry one extra header, `X-Hook-Pid` — the hook shell's own Windows pid, read from `/proc/$$/winpid`. The hook computes nothing else: the server walks that pid to find the session's terminal window and its nesting depth ([Sessions § Window linking](sessions.md#window-linking)), which keeps the resolution logic out of the user's `settings.json`, where it could only be updated by reinstalling hooks.

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
2. **Merge strategy** — `mergeHooks()` adds Claudia's hooks to `~/.claude/settings.json`, preserving other tools' hooks. Each hook type gets its own array entry.
3. **Removal** — `removeHooks()` strips only Claudia entries. `npx @rockyhong/claudia uninstall` does full cleanup.
4. **Silent failure** — hooks are fire-and-forget. `curl` exits cleanly whether the server is up or down, so Claude Code always keeps working.

## Design Decisions

- **Hardcoded port 48901** — no discovery needed, hooks are static strings; the only shell work a hook does is reading its own pid
- **Unidirectional by design** — hooks push to server, server pushes to browser via SSE. Two one-way pipes.
- **Legacy `/event` endpoint** — accepts pre-formatted events for backwards compatibility; all hooks use `/hook/:type`
