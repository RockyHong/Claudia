# Account Usage Display — Design Spec

## Summary

Show Anthropic account utilization (5-hour and 7-day windows) as subtle fill rings inline with the "Active Sessions" section header. Passive, theme-blended, glanceable.

## Data Source

**Endpoint:** `GET https://api.anthropic.com/api/oauth/usage`

**Headers:**
- `Authorization: Bearer <accessToken>` (from `~/.claude/.credentials.json` → `claudeAiOauth.accessToken`)
- `anthropic-beta: oauth-2025-04-20`

**Response:**
```json
{
  "five_hour": { "utilization": 42.0, "resets_at": "2026-03-28T14:59:59Z" },
  "seven_day": { "utilization": 68.0, "resets_at": "2026-03-31T03:59:59Z" }
}
```

- `utilization` — 0–100 float (percentage of window consumed)
- `resets_at` — ISO 8601 timestamp, nullable

## Fetch Strategy

The usage API is aggressively rate-limited (~5 requests per access token before permanent 429).

- **Trigger:** Fetch on aggregate state transitions (idle↔busy↔pending), not on a polling interval
- **Minimum cooldown:** 10 minutes between successful fetches
- **Backoff on 429:** 10m → 20m → 40m, cap at 60m. Reset backoff on next success.
- **Always show cached data** — never show "no data." If the API is 429'd, keep displaying the last successful response. Subtly dim the rings (lower opacity) to indicate staleness after 30 minutes without a fresh fetch.
- **No token refresh tricks** — too risky, can break Claude Code's own auth
- **Credentials path:** Read `~/.claude/.credentials.json`, extract `claudeAiOauth.accessToken`

## UI — Inline Rings

**Placement:** Right side of the "Active Sessions" section header row, same line as the label.

**Layout:**
```
Active Sessions            ◎ 5h 2h 14m   ◎ 7d 3d 8h
```

Two ring groups, each containing:
1. A 24×24px SVG ring (r=9, stroke-width 2.5)
2. Window label (`5h` / `7d`)
3. Reset countdown (`2h 14m` / `3d 8h`)

**Visual rules:**
- Single color: `var(--text-faint)` for the fill stroke — no traffic-light coloring
- Track (background): `var(--bg-raised)`
- All text: `var(--font-mono)`, `0.625rem`, `var(--text-faint)`
- Ring rotated -90deg so fill starts from 12 o'clock
- `stroke-linecap: round` for soft ends
- Fill transition: `stroke-dashoffset 0.6s cubic-bezier(0.16, 1, 0.3, 1)`
- Stale indicator: after 30min without fresh data, rings drop to `opacity: 0.5`

**Reset countdown format:**
- Under 1 hour: `42m`
- Under 24 hours: `2h 14m`
- 1 day or more: `3d 8h`
- If `resets_at` is null: hide the reset text

**Immersive mode:** Rings use `rgba(255, 255, 255, 0.25)` for fill and track uses `rgba(255, 255, 255, 0.08)`, matching the existing immersive card styling.

**No usage data yet:** If no cached data exists (first load, credentials missing), hide the rings entirely. No skeleton, no placeholder.

**Countdown updates:** Recalculate the reset countdown text every 60 seconds (not every second — it's not urgent).

## Server

### New module: `usage.js`

Responsibilities:
- Read OAuth token from `~/.claude/.credentials.json`
- Fetch usage API with proper headers
- Cache last successful response in memory
- Enforce cooldown and backoff logic
- Expose `getUsage()` → returns cached data (or null)
- Expose `refreshUsage()` → attempts fetch if cooldown allows, returns cached data

### New route: `GET /api/usage`

Returns the cached usage data to the frontend:
```json
{
  "fiveHour": { "utilization": 42.0, "resetsAt": "2026-03-28T14:59:59Z" },
  "sevenDay": { "utilization": 68.0, "resetsAt": "2026-03-31T03:59:59Z" },
  "fetchedAt": 1711641600000
}
```

Returns `204` if no data is available (no credentials, never fetched successfully).

### Integration with state transitions

In `session-tracker.js`, when aggregate state changes, call `refreshUsage()`. Include the usage data in the SSE broadcast so the frontend gets it alongside session updates — no separate polling from the browser.

### SSE event extension

Add `usage` field to the existing state update event:
```json
{
  "sessions": [...],
  "aggregateState": "busy",
  "statusMessage": "...",
  "usage": {
    "fiveHour": { "utilization": 42.0, "resetsAt": "2026-03-28T14:59:59Z" },
    "sevenDay": { "utilization": 68.0, "resetsAt": "2026-03-31T03:59:59Z" },
    "fetchedAt": 1711641600000
  }
}
```

`usage` is `null` when no data is available.

## Frontend

### New component: `UsageRings.svelte`

Props:
- `usage` — the usage object from SSE (or null)

Renders the two ring groups. Handles:
- Computing ring stroke-dashoffset from utilization percentage
- Formatting reset countdown from `resetsAt` timestamps
- 60-second countdown refresh interval
- Staleness detection (compare `fetchedAt` to now, dim at 30min)
- Hiding entirely when `usage` is null

### Integration

In `SessionList.svelte`, add `UsageRings` to the right side of the section header row. Pass `usage` prop down from `App.svelte` via the SSE state.

## Files to Change

| File | Change |
|------|--------|
| `packages/server/src/usage.js` | **New** — credentials reader, API client, cache, cooldown/backoff |
| `packages/server/src/routes-api.js` | Add `GET /api/usage` route |
| `packages/server/src/session-tracker.js` | Call `refreshUsage()` on aggregate state change |
| `packages/server/src/index.js` | Include `usage` in SSE broadcast payload |
| `packages/web/src/lib/UsageRings.svelte` | **New** — ring component |
| `packages/web/src/lib/SessionList.svelte` | Add section header row with UsageRings |
| `packages/web/src/App.svelte` | Pass usage data through from SSE |
| `packages/web/src/lib/sse.js` | Parse `usage` field from SSE events |
| `packages/server/src/usage.test.js` | **New** — cooldown logic, backoff, cache behavior |

## Not Changed

- No new npm dependencies
- No changes to the hook protocol
- No changes to the SSE event structure beyond adding the `usage` field
- No localStorage persistence of usage data (server cache is sufficient)

## Testing

- **Unit (`usage.test.js`):** Mock `fs.readFile` for credentials, mock `fetch` for API. Test: successful fetch caches data, cooldown prevents re-fetch within 10min, 429 triggers backoff, backoff resets on success, missing credentials returns null.
- **Route:** Test `GET /api/usage` returns cached data or 204.
- **Manual:** Start Claudia, verify rings appear after first state transition, drag slider in demo to verify visual, verify staleness dimming after 30min.
