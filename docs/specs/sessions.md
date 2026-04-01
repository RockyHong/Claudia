# Sessions

The core state machine — how Claudia knows what every Claude Code instance is doing.

## States

Three user-visible states, plus one terminal state:

| State | Meaning | Aggregate priority |
|---|---|---|
| `idle` | Waiting for user input | lowest |
| `busy` | Claude is working | — |
| `pending` | Needs user attention | highest |
| `stopped` | Session ended (removed) | — |

**Aggregate rule**: highest-priority state across all sessions wins. This drives the avatar, favicon, status message, and sound effects — one state for the whole dashboard.

**No debouncing** — transitions are immediate. A session stays `busy` from the first `PreToolUse` until `Stop`.

## Subagent Awareness

Sessions track active subagent count. Key behavior: **a session won't go idle while subagents are running**. `Stop` hook fires when the parent turn ends, but if `activeSubagents > 0`, the session stays `busy` until all `SubagentStop` hooks decrement the count to zero.

This prevents the dashboard from flashing idle/busy/idle as subagents finish one by one.

## Display Names

Last path segment of `cwd`. Duplicates get numeric suffix: `api-server`, `api-server (2)`. Names update if cwd changes mid-session.

## Lifecycle

- **Creation**: on first hook event for an unknown `session_id`
- **Ghost prevention**: late `PermissionRequest` for an ended session is ignored — no phantom session creation
- **Stale pruning**: no event for 10 minutes → removed. Pruned every 60s.
- **Git metadata**: fetched async on creation, cwd change, and idle transition. Non-blocking — card renders immediately, git info fills in when ready.

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
