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

Sessions stay busy while subagents are running. `Stop` hook fires when the parent turn ends, but if any Agent invocations remain pending, the session stays `busy` until the next `SubagentStop` confirms all are done.

The pending count is derived from the parent's transcript JSONL on every `Stop` and `SubagentStop` hook (`packages/server/src/transcript-scan.js`) — it counts Agent `tool_use` entries that have no matching `tool_result`. The transcript is Claude Code's own ground truth, so this count is immune to dropped hook deliveries (server downtime, killed subagents, curl failures) that would otherwise leave a hook-counted integer stuck above zero.

This prevents the dashboard from flashing idle/busy/idle as subagents finish one by one, and prevents the prior bug where a missed `SubagentStop` left a session permanently busy.

## Naming

Session cards show `{displayName}`:

- **Linked sessions** — `{projectName} {4-char hex}` (e.g. `Claudia 7f3a`). A spawned session's terminal title matches, locked via `--suppressApplicationTitle`; an auto-linked session's terminal keeps whatever title it already had, since the [handle names a window rather than a session](#window-linking).
- **Unlinked sessions** — project folder name from `cwd`, deduped (`my-app`, `my-app 2`).

### Window linking

Sessions can be linked to a terminal window via `windowHandle` (HWND). Two paths:

- **Spawned by Claudia** — terminal title is set to `{projectName} {hex}` at spawn time. HWND discovered by polling for that title. Both HWND and displayName are stored.
- **Auto-linked** — the hook sends only its shell's Windows pid (`X-Hook-Pid`, read from `/proc/$$/winpid`); the server walks it in `pid-ancestry.js` and resolves the window itself, before it answers the hook. The server stores the HWND and generates a `{projectName} {hex}` displayName. It does **not** rename the terminal — the handle names a window, and a window can host several sessions. Windows-only; other platforms send an empty header.

Resolution never reads a process's `MainWindowHandle`: that property is per-process, and one `WindowsTerminal.exe` hosts every window on the machine, so it returns whichever window is frontmost. Instead the walk anchors on the ancestor that owns a `PseudoConsoleWindow` — the console window belonging to this session's own terminal tab — and takes that window's parent. A handle may still legitimately be shared by several sessions, since one window can host several tabs, so linking never treats a handle as exclusive.

The same walk counts the `claude` processes it crosses; two or more gates admission (see Lifecycle below), and the first one found is the session's own process, stored as `claudePid` for liveness. An install whose hooks predate server-side resolution keeps sending the pre-resolved `X-Hook-Window` / `X-Hook-Nested` pair, which the server still accepts; those sessions carry no `claudePid`.

### Alert gating

Notifications (`onPendingAlert`, `onIdleAlert`) only fire for linked sessions — those with a non-null `windowHandle`. This prevents alerts for sessions where we can't focus a terminal window.

## Lifecycle

- **Creation**: on first hook event for an unknown `session_id`. On Windows the event must also come from one of the two window-carrying hooks (`SessionStart` / `UserPromptSubmit`) and must not be nested — a claude-process count of 2 or more means the session runs inside another Claude session (dispatched, headless, SDK), and it gets no card. The count is resolved before the hook is answered, so a nested session never flashes a card the verdict then takes away. Refusal needs that positive evidence: resolution can come back empty for reasons unrelated to nesting, so an empty result still admits, leaving the session unlinked and reachable by stale pruning. A refused `session_id` never appears, since no other hook type creates one.
- **Ghost prevention**: late `PermissionRequest` for an ended session is dropped — only live sessions accept events
- **Permission queue**: multiple `PermissionRequest` hooks per session are queued FIFO on the server. The card displays the head one at a time; when the user decides, the server resolves that held hook response and the next queued permission becomes the new head. Held responses are released with plain `{ok: true}` only when the session ends — never silently overwritten, since Claude Code treats a missing decision as "hook abstained" and falls back to its terminal prompt.
- **Stale pruning**: sessions inactive for 10 minutes are removed. Pruned every 60s.
- **Liveness pruning**: linked sessions (any with `windowHandle`) are checked every 5s. A session carrying a `claudePid` is judged on that process — gone means removed — since a live window is not evidence of a live session. One without a pid falls back to the window check: window closed means removed. Unlinked sessions are excluded from both, and stale pruning reaches them instead.
- **Git metadata**: fetched async on creation, cwd change, and idle transition. Card renders immediately, git info fills in when ready.

## SSE Contract

Every state change broadcasts to all connected dashboards:

```json
{
  "type": "state_update",
  "sessions": [{ "id", "state", "displayName", "cwd", "lastTool", "lastEvent", "stateChangedAt", "windowHandle", "git", ... }],
  "aggregateState": "pending",
  "statusMessage": "1 awaiting your response."
}
```

Full session shape is the source of truth for what the frontend can render.
