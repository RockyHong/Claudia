# Bug: Permission Request Override / Dead Loop

## Problem

When Claude Code fires multiple `PermissionRequest` hooks in rapid succession (or a new one arrives before the user acts on the prior one), the **server and dashboard only track a single permission per session**. The new request overwrites the old one:

- **Server** (`index.js:218-221`): `heldPermissionResponses` is a `Map<sessionId, res>` — one slot per session. A new `PermissionRequest` silently resolves the previous held response with `{ ok: true }` (no decision payload), then takes its place.
- **Session tracker** (`session-tracker.js:187`): `session.permissionRequest` is a single scalar — overwritten on each pending event.
- **Dashboard** (`SessionCard.svelte`): renders `session.permissionRequest` — only ever shows the latest one.

### User-visible symptoms

1. Card shows permission B. User approves B. Permission A was already auto-resolved with no decision, but Claude Code may still be waiting or confused.
2. If Claude Code doesn't proceed after the auto-resolved permission, the session appears stuck in pending with no actionable UI — user must switch to the terminal to unblock.
3. Dead loop: session stays pending in the dashboard, card shows stale permission, no way to act.

## Open questions (discuss before implementing)

### 1. Should we queue permissions or just dismiss stale ones?

**Option A — Queue**: Store an array of held responses. Dashboard shows all pending permissions (or pages through them). User acts on each one.
- Pro: No lost permissions.
- Con: Complex UI, Claude Code may not actually need all of them queued (earlier ones may be moot once a later one is decided).

**Option B — Latest wins, but dismiss cleanly**: Keep current single-slot model. When a new `PermissionRequest` overrides the old one, the old held response gets resolved with a **deny** (or a specific "superseded" status) so Claude Code isn't left hanging. Dashboard only shows the latest.
- Pro: Simple. Matches current architecture.
- Con: User never sees the first permission. Could be surprising if the first one was important.

**Option C — Dismiss all on state change**: When the session transitions away from `pending` (to `busy` or `idle`), dismiss all permission UI. This handles the case where the user acted in the terminal.
- Pro: Already partially implemented (lines 232-241 release held response on non-pending state). Just need the frontend to also clear `decisionMade` / `permissionRequest` display.
- Con: "busy state change" might be too sloppy a signal — a `PreToolUse` during pending could falsely dismiss. Need to verify what hook sequence Claude Code actually fires.

**Likely answer**: Option B + C combined. Latest permission wins on the server (resolve prior with deny/superseded). Frontend dismisses permission UI on any transition away from pending state.

### 2. What happens to the auto-resolved permission on Claude Code's side?

When we resolve a held `PermissionRequest` response with `{ ok: true }` (no `hookSpecificOutput.decision`), what does Claude Code do? Does it:
- Treat missing decision as allow?
- Treat it as deny?
- Ignore the response and re-prompt?

This determines whether Option B's auto-resolve is safe or whether it causes the dead loop itself.

### 3. Frontend dismissal trigger

Currently `SessionCard.svelte` shows the permission UI when `session.permissionRequest && !decisionMade`. But `decisionMade` is local component state — it doesn't reset when the server clears `permissionRequest` due to a state change. Need to:
- Watch for `session.state` leaving `pending` and reset the card UI.
- Or watch for `session.permissionRequest` becoming `null` and reset.

## Files involved

| File | Role |
|------|------|
| `packages/server/src/index.js:216-228` | Holds/overrides permission responses |
| `packages/server/src/index.js:232-241` | Releases held response on state change |
| `packages/server/src/session-tracker.js:184-187` | Sets `permissionRequest` (single scalar) |
| `packages/server/src/session-tracker.js:158-161` | Clears `permissionRequest` on busy |
| `packages/web/src/lib/SessionCard.svelte` | Renders permission UI, local `decisionMade` state |

## Reproduction

1. Configure a Claude Code hook that triggers `PermissionRequest` frequently (or use a session that hits multiple tool permissions in quick succession).
2. Watch the dashboard — permission card flips between requests, previous one vanishes.
3. Accept the visible permission. Session may stay stuck in pending if an earlier permission was lost.
