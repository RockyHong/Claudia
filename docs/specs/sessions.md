# Sessions

The core state machine — how Claudia knows what every Claude Code instance is doing.

## States

Three user-visible states, ordered by attention urgency (how much the user can/should act):

| State | Meaning | User can... | Aggregate priority |
|---|---|---|---|
| `pending` | Needs user decision | Must act now | highest |
| `idle` | Waiting for user input | Can assign work | — |
| `busy` | Claude is working | Just wait | lowest |

`stopped` is a lifecycle event, handled by the tracker (session removed from registry, card disappears).

**Aggregate rule**: highest-urgency state across all sessions wins. This drives the avatar, favicon, status message, and sound effects — one state for the whole dashboard.

**Immediate transitions** — a session stays `busy` from the first `PreToolUse` until `Stop`.

## Subagent Awareness

Sessions track active subagent count. Key behavior: **a session stays busy while subagents are running**. `Stop` hook fires when the parent turn ends, but if `activeSubagents > 0`, the session stays `busy` until all `SubagentStop` hooks decrement the count to zero.

This prevents the dashboard from flashing idle/busy/idle as subagents finish one by one.

## Naming

Session cards always show `{displayName} · {terminalName}`.

- **displayName** — project folder name from `cwd`, deduped at session registration (`my-app`, `my-app 2`). Updates if cwd changes mid-session.
- **terminalName** — identifies the terminal window. Set by auto-link or spawn, deduped for "Unknown" values.

### Terminal names by source

| Source | terminalName | How |
|---|---|---|
| Spawned by Claudia | `Claudia`, `Claudia 2` | Set at spawn time (global counter) |
| Auto-linked (standalone terminal) | Window title (e.g. `Windows PowerShell`) | PID walk via `X-Hook-PID` header on SessionStart |
| Unlinked (VS Code, macOS, etc.) | `Unknown`, `Unknown 2` | Default, deduped |

### Auto-link flow

On `SessionStart`, the hook shell PID is passed via `X-Hook-PID: $$` HTTP header. The server walks the process tree (Windows-only, via `Win32_Process`) to find a known terminal process with a visible window. If found, the session is linked to that window handle. If not (VS Code, non-Windows), the session stays unlinked as "Unknown".

### Alert gating

Notifications (`onPendingAlert`, `onIdleAlert`) only fire for linked sessions — those where `terminalName` does not start with "Unknown". This prevents alerts for sessions where we can't focus a terminal window.

## Lifecycle

- **Creation**: on first hook event for an unknown `session_id`
- **Ghost prevention**: late `PermissionRequest` for an ended session is dropped — only live sessions accept events
- **Stale pruning**: sessions inactive for 10 minutes are removed. Pruned every 60s.
- **Git metadata**: fetched async on creation, cwd change, and idle transition. Card renders immediately, git info fills in when ready.

## SSE Contract

Every state change broadcasts to all connected dashboards:

```json
{
  "type": "state_update",
  "sessions": [{ "id", "state", "displayName", "cwd", "lastTool", "lastEvent", "stateChangedAt", "git", "spawned", ... }],
  "aggregateState": "pending",
  "statusMessage": "1 awaiting your response."
}
```

Full session shape is the source of truth for what the frontend can render.
