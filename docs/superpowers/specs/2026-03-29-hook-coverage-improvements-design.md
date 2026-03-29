# Hook Coverage Improvements

Status: implemented

Expand Claudia's hook coverage to include new Claude Code hooks (`SubagentStop`, `PreCompact`), fix a pending-state suppression bug, and make the CLI display string dynamic. Also consolidated hook registration to web UI only (removed `claudia init` CLI command) and added hook remove button with confirm dialogs.

## Background

Claudia installs 8 hooks into Claude Code's `~/.claude/settings.json`:
`SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PermissionRequest`, `Notification`, `Stop`, `SessionEnd`.

Claude Code now exposes two additional hooks that Claudia doesn't use:
- **`SubagentStop`** — fires when a subagent finishes
- **`PreCompact`** — fires before context compaction

Additionally, there's a pending-state suppression bug and a stale CLI display string.

## Changes

### 1. SubagentStop Hook

**Goal:** Surface subagent activity in the dashboard.

- **`hooks.js`**: Add `SubagentStop` entry to `CLAUDIA_HOOKS`.
- **`hook-transform.js`**: Transform to `{ state: "busy" }`. The parent session is still active — subagent completion doesn't change the parent's state.
- **`session-tracker.js`**: Add `subagentActivity` field to session (integer, starts at 0). Increment on each `SubagentStop` event. Reset to 0 on `Stop` (turn complete).
- **Dashboard**: Display subagent count when > 0 (e.g., badge or inline text like "3 subagents completed").

The stdin JSON shape for `SubagentStop` needs to be verified at implementation time — check for fields like `subagent_id` or `subagent_session_id`. At minimum we get `session_id` (the parent) and `cwd`.

### 2. PreCompact Hook

**Goal:** Indicate when a session's context has been compacted.

- **`hooks.js`**: Add `PreCompact` entry to `CLAUDIA_HOOKS`.
- **`hook-transform.js`**: Transform to `{ state: "busy" }`. Compaction doesn't change session state — Claude is still working.
- **`session-tracker.js`**: Add `compacted` field to session (boolean, starts `false`). Set to `true` on first `PreCompact`. Never reset — it's a lifetime flag for the session (once compacted, always compacted).
- **Dashboard**: Subtle indicator when `compacted` is true (e.g., a small icon or dimmed label). This tells the user "this session has hit context limits at least once."

### 3. Pending Suppression Fix

**Bug:** A `Notification` or `PermissionRequest` arriving right after `Stop` is silently dropped for known sessions.

**Current behavior** in `session-tracker.js`:
- Line 100: Unknown session + `pending` → ignored. This is correct — prevents ghost sessions from late notifications.
- Line 147: Known session + `idle` state + incoming `pending` → ignored via `if (prevState === State.IDLE) break;`. This is the bug.

**Fix:** Remove the `if (prevState === State.IDLE) break;` guard. The ghost-session guard on line 100 already prevents the actual problem (creating sessions from stale notifications). Known idle sessions should accept pending transitions — a real notification can legitimately arrive right after a turn completes.

**Risk:** Low. The only scenario this guard prevented for known sessions was a stale `Notification` arriving after `Stop`. But in practice, if the session exists and Claude sends a notification, the user should see it.

### 4. CLI Display String

**Bug:** Line 62 in `cli.js` hardcodes the hook list: `"SessionStart, PreToolUse, PostToolUse, Notification, Stop, SessionEnd"`. This is already wrong (misses `UserPromptSubmit` and `PermissionRequest`) and will fall further behind as hooks are added.

**Fix:** Replace with `Object.keys(CLAUDIA_HOOKS).join(", ")`. Import `CLAUDIA_HOOKS` if not already imported (it is — via `mergeHooks` from the same module).

Similarly, the teardown display on line 115 hardcodes `"PreToolUse, PostToolUse, Notification"` — update to derive dynamically.

## Session Object Changes

New fields added to the session object (returned by `getSessions()` and sent via SSE):

```javascript
{
  // ... existing fields ...
  subagentActivity: 0,  // number — subagent completions this turn
  compacted: false,      // boolean — context compacted at least once
}
```

No new SSE event types. These are additional fields on the existing session payload.

## Files Changed

| File | Change |
|------|--------|
| `packages/server/src/hooks.js` | Add `SubagentStop`, `PreCompact` to `CLAUDIA_HOOKS` |
| `packages/server/src/hook-transform.js` | Add transform entries for both new hooks |
| `packages/server/src/session-tracker.js` | Add `subagentActivity`, `compacted` fields; increment/set logic; remove idle→pending guard |
| `bin/cli.js` | Dynamic hook list display (init + teardown) |
| `packages/web/src/*` | Dashboard display for subagent count and compacted indicator |
| Tests | Update existing tests, add new cases for new hooks and pending fix |

## Out of Scope

- Subagent-level session tracking (treating each subagent as its own session) — too complex for this change, and the parent session is what the user cares about.
- PreCompact response handling (the hook can return instructions to Claude) — Claudia is read-only, it doesn't influence Claude's behavior.
- Any changes to the SSE protocol structure — fields are additive.
