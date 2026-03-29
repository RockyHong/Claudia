# Trust & Transparency Design

**Date:** 2026-03-29
**Scope:** Usage monitoring consent, uninstall command, privacy documentation

---

## 1. Usage Monitoring Consent

### Preference flag

Add `usageMonitoring` to `~/.claudia/config.json`:

- `undefined` (absent) — user has never chosen; triggers onboarding modal
- `true` — opted in; usage client runs, dashboard shows usage rings
- `false` — declined; usage client never created, `/api/usage` returns 204

The field is NOT in `DEFAULTS` — `get()` returns `undefined` for new users, which the frontend interprets as "show onboarding."

### Server-side gating

In `index.js`:

- On startup, read `usageMonitoring` from preferences. Only call `createUsageClient()` if `true`.
- When `PATCH /api/preferences` changes `usageMonitoring` to `true`: create the client, start fetching.
- When changed to `false`: discard the client, clear cached data, set `usageClient = null`.
- `/api/usage` already returns 204 when `usageClient` is null — no frontend changes needed for the empty state.

### Onboarding modal

New component: `ConsentModal.svelte`.

- **Trigger:** Shown on first load when `usageMonitoring` is `undefined` in the preferences response.
- **No escape:** No close button, no backdrop dismiss. Two buttons only: "Enable" / "No thanks".
- **Content:** Explains that Claudia reads `~/.claude/.credentials.json` to fetch usage limits from Anthropic's API. Token is used in-memory only, never stored or sent elsewhere.
- **Action:** Persists choice via `PATCH /api/preferences { usageMonitoring: true|false }`.

### Settings toggle

In `ConfigTab.svelte`, add a "Usage Monitoring" section:

- Toggle reflects current `usageMonitoring` state.
- Toggling ON opens `ConsentModal` so user sees the same consent info and explicitly re-confirms.
- Toggling OFF is immediate, no confirmation needed.

---

## 2. Uninstall Command

### `claudia uninstall` replaces `claudia teardown`

- `teardown` becomes a silent alias (same function, no deprecation noise).
- `uninstall` performs three steps:
  1. Remove Claudia hooks from `~/.claude/settings.json` (calls existing `removeHooks` — single source of truth, same logic the Settings UI uses).
  2. Delete `~/.claudia/` entirely (avatars, projects, preferences, shutdown token).
  3. Print a summary of what was removed.

### Interactive confirmation

- Lists what will be removed before prompting.
- Single `y/N` prompt. No partial uninstall options.

### No OS-level app removal

Tauri/SEA binary removal is the OS's job. The NSIS/MSI uninstaller does not run custom cleanup, so `~/.claudia/` and hooks survive OS-level uninstall. The README and `docs/privacy.md` instruct users to run `npx claudia uninstall` before uninstalling the app, with manual fallback steps below.

---

## 3. Privacy Documentation

### README table

Add a "What Claudia accesses" section after "How it works" with two sub-tables:

**Files & data:**

| What | Path | Access | Purpose |
|------|------|--------|---------|
| Hook settings | `~/.claude/settings.json` | Read/Write | Register/remove Claudia hooks in Claude Code |
| OAuth token | `~/.claude/.credentials.json` | Read-only | Fetch usage limits from Anthropic API (opt-in) |
| Anthropic usage API | `api.anthropic.com/api/oauth/usage` | HTTP with token | Show 5hr/7day utilization on dashboard (opt-in) |
| Avatars | `~/.claudia/avatars/` | Read/Write | Store custom avatar image sets |
| Projects | `~/.claudia/projects.json` | Read/Write | Map session working directories to display names |
| Preferences | `~/.claudia/config.json` | Read/Write | Theme, sound, usage monitoring toggle |
| Shutdown token | `~/.claudia/shutdown-token` | Read/Write | Authenticate shutdown requests between Claudia instances |

**System access:**

| What | How | Purpose |
|------|-----|---------|
| Terminal windows | PowerShell (Win), AppleScript (Mac), xdotool (Linux) | Enumerate windows, read titles, focus/flash on navigation |
| Window rename | Win32 `SetWindowText` | Set terminal titles for session identification |
| Git status | `git rev-parse`, `git status` in session dirs | Show branch and working tree state on dashboard |
| Process spawning | `execFile` for terminal emulators | Launch new Claude Code sessions from dashboard |

All system access is local. The only network call is the opt-in Anthropic usage API.

Link to `docs/privacy.md` for full details.

### `docs/privacy.md`

Detailed version of the above:

- What each file/access does and why, in plain language.
- Credential access section: opt-in, what it reads, where data goes, what happens if you decline.
- Uninstall instructions: `npx claudia uninstall` as the recommended path.
- Manual reversal steps: delete `~/.claudia/`, open `~/.claude/settings.json`, remove any hook entries containing `127.0.0.1:48901/hook`.

---

## 4. Todo cleanup

Remove these completed/replaced items from `todo.md`:

- "Add 'What Claudia accesses' section to README" — covered by this spec
- "Usage feature: make credential access opt-in" — covered by this spec
- "Add `claudia uninstall` command" — covered by this spec
- "Document how to manually reverse hook installation" — covered by this spec
