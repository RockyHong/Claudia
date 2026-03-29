# Backend SFX & Unified Preferences

**Date:** 2026-03-29
**Status:** Approved

## Problem

Sound effects are played in the browser via Web Audio API. Browser autoplay policy blocks AudioContext until a user gesture occurs, causing sounds to silently fail unless the user interacts with the settings slider first. Since Claudia runs on localhost (or as a Tauri wrapper), browser restrictions are unnecessary overhead.

## Solution

Move sound playback to the backend using OS-native audio commands. Consolidate all user preferences (theme, immersive mode, SFX, active avatar set) into a single server-side `~/.claudia/config.json` file, replacing scattered localStorage usage.

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

### New Module: `packages/server/src/sfx.js`

Generates synth audio as PCM samples in Node.js and plays via OS commands. Same three sounds as the current frontend implementation, same frequencies and envelopes.

#### Synth Generation

Port the Web Audio oscillator math to pure sample computation:

- **Pending chime:** Two sine oscillators (659.25 Hz + 880 Hz), staggered 150ms, with exponential decay
- **Busy whoosh:** White noise through lowpass filter sweep (4000 Hz -> 500 Hz), quick fade-in, long fade-out
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
- `name` must be one of: `pending`, `busy`, `idle`

### Integration in `index.js`

The `onStateChange` callback already fires on every state transition. Add sound triggers there:

```
onStateChange: (update) => {
  // existing: broadcast SSE, refresh usage
  // new: play sound for state transitions
  for each session in update.sessions:
    if session.state changed from previous:
      sfx.playSound(session.state)
}
```

A `previousStates` Map in `index.js` tracks the last-known state per session ID (same pattern as frontend's `handleSessionTransitions`). On each `onStateChange`, compare current vs previous and play sound only on actual transitions.

Skip playing on first SSE broadcast after server start (avoid sounds for initial state hydration).

## 3. Cleanup

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
| `ConfigTab.svelte` | Volume slider calls `PATCH /api/preferences` + `POST /api/sfx/preview/pending`. Remove `sfx` prop. |
| `SettingsModal.svelte` | Remove `sfx` prop passthrough. |
| `avatar-storage.js` | Use `preferences.js` for `activeSet` instead of direct config.json access. |
| `routes-api.js` | Remove `/sfx` static route, add preferences + preview endpoints. |
| `index.js` | Remove `registerSfxPreview` import/call, add SFX integration to onStateChange. |

## Non-Goals

- Custom sound files (MP3 upload) — removed, synth-only
- System-wide volume control — volume is baked into PCM samples
- Per-session sound preferences — one global volume for all sessions
