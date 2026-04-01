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

One format everywhere — dashboard cards and terminal title bars use the same scheme:

```
{last-path-segment}           → api-server
{last-path-segment} {n}       → api-server 2
```

Suffix is space + number, only when disambiguating. Shell-safe (in the focus sanitize allowlist: `a-z A-Z 0-9 - _ . space`), human-readable in both contexts.

- **Display names** add the suffix at session registration (collision with existing sessions)
- **Terminal titles** add the suffix at spawn time (global counter per server lifetime)

Display names update if cwd changes mid-session.

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
