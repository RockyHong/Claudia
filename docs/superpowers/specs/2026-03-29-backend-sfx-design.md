# Backend SFX & Unified Preferences

**Date:** 2026-03-29
**Status:** Approved

## Problem

Sound effects are played in the browser via Web Audio API. Browser autoplay policy blocks AudioContext until a user gesture occurs, causing sounds to silently fail unless the user interacts with the settings slider first. Since Claudia runs on localhost (or as a Tauri wrapper), browser restrictions are unnecessary overhead.

Additionally, the session state machine incorrectly shows "idle" when a parent session has dispatched a subagent and is waiting for it to return. This affects both UI state and sound triggers.

## Solution

Move sound playback to the backend using OS-native audio commands. Consolidate all user preferences (theme, immersive mode, SFX, active avatar set) into a single server-side `~/.claudia/config.json` file, replacing scattered localStorage usage. Fix the state machine to track active subagents so "idle" is accurate.

## 1. Unified Preferences

### Storage

`~/.claudia/config.json` (already exists for `activeSet`):

```json
{
  "activeSet": "default",
  "theme": "dark",
  "immersive": false,
  "sfx": { "muted": false, "volume": 0.5 }
}
```

### New Module: `packages/server/src/preferences.js`

- `getPreferences()` — reads config.json, returns full object with defaults merged
- `setPreferences(patch)` — deep-merges partial update, writes to config.json
- Defaults: `{ activeSet: "default", theme: "dark", immersive: false, sfx: { muted: false, volume: 0.5 } }`

### API Endpoints (in `routes-api.js`)

- `GET /api/preferences` — returns full preferences object
- `PATCH /api/preferences` — accepts partial JSON, merges into config.json, returns updated prefs

### Avatar Storage Migration

`avatar-storage.js` currently has its own `getConfig`/`setConfig` that reads/writes the same `config.json`. Refactor to use `preferences.js` for `activeSet` reads/writes, removing its direct file access.

### Frontend Migration

- `App.svelte` fetches `GET /api/preferences` on mount, uses response for theme, immersive, sfx state
- Settings changes call `PATCH /api/preferences`
- Remove all three localStorage keys: `claudia-theme`, `claudia-immersive`, `claudia-sfx`

## 2. Server-Side Sound Engine

### Three Sounds

| Sound | Meaning | Trigger |
|-------|---------|---------|
| **send** | User sent a message | `UserPromptSubmit` hook event (hook-event-based) |
| **pending** | Claude needs attention | State becomes `pending` (state-based) |
| **idle** | Claude finished its turn | State becomes `idle` (state-based) |

Hybrid trigger model: pending and idle are state-based (accurate thanks to subagent tracking in section 4), send is hook-event-based (`UserPromptSubmit` only, to avoid firing on every PreToolUse/PostToolUse).

Each sound fires per-session independently. If session A goes pending while session B is busy, the pending sound fires. If two sessions transition simultaneously, both sounds play.

### New Module: `packages/server/src/sfx.js`

Generates synth audio as PCM samples in Node.js and plays via OS commands.

#### Synth Generation

Port the Web Audio oscillator math to pure sample computation:

- **Send whoosh:** White noise through lowpass filter sweep (4000 Hz -> 500 Hz), quick fade-in, long fade-out (formerly "busy")
- **Pending chime:** Two sine oscillators (659.25 Hz + 880 Hz), staggered 150ms, with exponential decay
- **Idle tone:** Two sine oscillators (880 Hz + 659.25 Hz), reversed from pending, same envelope

Output: 44.1 kHz, 16-bit mono WAV buffer.

Volume is baked into the PCM samples (multiply by volume factor). No system volume manipulation.

#### Playback (platform-specific, mirrors `focus.js` pattern)

- **Windows:** `powershell -c "(New-Object Media.SoundPlayer 'path').Play()"` (non-blocking)
- **macOS:** `afplay path.wav`
- **Linux:** `aplay path.wav` or `paplay path.wav`

Uses `child_process.execFile` with timeout, same as `focus.js`.

WAV is written to a temp file per play (OS temp dir). Files are cleaned up after playback completes.

#### Exports

- `createSFX(getPreferences)` — factory that accepts a function to read current preferences. Returns `{ playSound, previewSound }`.
- `playSound(name)` — reads current sfx prefs via `getPreferences()`, generates WAV at that volume, plays via OS command. No-op if muted.
- `previewSound(name)` — same as `playSound` but ignores muted state (for settings slider testing).

### Preview Endpoint

- `POST /api/sfx/preview/:name` — calls `previewSound(name)`, returns `{ok: true}`
- `name` must be one of: `send`, `pending`, `idle`

### Integration in `index.js`

Sound triggers are wired in `index.js` using a hybrid approach:

**State-based (pending, idle):** A `previousStates` Map tracks the last-known state per session ID. On each `onStateChange`, compare current vs previous and play sound only on actual transitions per session.

**Hook-event-based (send):** The `UserPromptSubmit` hook handler in the `/hook/:type` route (or via a new callback) triggers `sfx.playSound("send")` directly.

Skip playing on first broadcast after server start (avoid sounds for initial state hydration).

## 3. Subagent-Aware State Machine

### Problem

When a parent session dispatches a subagent, a `Stop` hook fires for the parent. The state machine transitions to idle, but the user is still waiting for the subagent to finish. This produces a false idle state (wrong UI display) and would trigger a false idle sound.

### Fix

Track active subagent count per session in `session-tracker.js`:

- `PreToolUse` with tool name `Agent` → increment `activeSubagents` on that session
- `SubagentStop` hook → decrement `activeSubagents` on that session
- On `Stop` hook: only transition to `idle` if `activeSubagents === 0`. If `activeSubagents > 0`, stay `busy`.

This fixes both the visual state in the UI and the SFX trigger. The idle sound only plays when the session is genuinely idle — all subagents done, turn complete.

## 4. Cleanup

### Remove Entirely

| File | Reason |
|------|--------|
| `packages/web/src/lib/sfx.js` | Frontend Web Audio synth, AudioContext unlock — replaced by backend |
| `packages/server/src/sfx-preview.js` | Inline HTML preview page — no longer needed |
| `packages/server/src/sfx-preview.test.js` | Test for removed preview page |
| `/sfx` static route in `routes-api.js` | Served MP3 files that never existed |
| `packages/server/assets/sfx/` reference | Empty directory, no MP3s |

### Modify

| File | Changes |
|------|---------|
| `App.svelte` | Remove `createSFXController()`, `handleSessionTransitions()`, localStorage reads. Fetch prefs from API on mount. |
| `ConfigTab.svelte` | Volume slider calls `PATCH /api/preferences` + `POST /api/sfx/preview/send`. Remove `sfx` prop. |
| `SettingsModal.svelte` | Remove `sfx` prop passthrough. |
| `avatar-storage.js` | Use `preferences.js` for `activeSet` instead of direct config.json access. |
| `routes-api.js` | Remove `/sfx` static route, add preferences + preview endpoints. |
| `index.js` | Remove `registerSfxPreview` import/call, add SFX integration with hybrid trigger model. |
| `session-tracker.js` | Add `activeSubagents` counter, gate idle transition on it. |

## Non-Goals

- Custom sound files (MP3 upload) — removed, synth-only
- System-wide volume control — volume is baked into PCM samples
- Per-session sound preferences — one global volume for all sessions
- Debouncing simultaneous sounds — edge case, not worth the complexity
