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

| Source | terminalName | Card display | How |
|---|---|---|---|
| Spawned by Claudia | `my-app claudia 1` | `my-app · claudia 1` | Set at spawn time (global counter) |
| Auto-linked (standalone terminal) | Window title (e.g. `Windows PowerShell`) | `my-app · Windows PowerShell` | Inline PowerShell walk on SessionStart |
| Unlinked (VS Code, macOS, etc.) | `Unknown`, `Unknown 2` | `my-app · Unknown` | Default, deduped |

Card display uses `terminalLabel` — a frontend derived that strips the `displayName` prefix from `terminalName` to avoid redundancy (e.g. `my-app claudia 1` → `claudia 1`).

### Auto-link flow

On `SessionStart`, the hook command runs an inline PowerShell process tree walk (synchronously, before curl) to resolve the terminal HWND and title. The result is sent via `X-Hook-Window: HWND|title` header. The server parses this and links the session. Windows-only; other platforms send an empty header and stay unlinked as "Unknown".

### Alert gating

Notifications (`onPendingAlert`, `onIdleAlert`) only fire for linked sessions — those where `terminalName` does not start with "Unknown". This prevents alerts for sessions where we can't focus a terminal window.

## Lifecycle

- **Creation**: on first hook event for an unknown `session_id`
- **Ghost prevention**: late `PermissionRequest` for an ended session is dropped — only live sessions accept events
- **Stale pruning**: sessions inactive for 10 minutes are removed. Pruned every 60s.
- **Window pruning**: linked sessions (any with `windowHandle`) are checked every 5s. If the terminal window is closed, the session is removed. Unlinked sessions are excluded.
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
