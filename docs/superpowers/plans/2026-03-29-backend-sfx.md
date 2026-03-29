# Backend SFX & Unified Preferences — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move sound playback from browser to server, consolidate preferences into `~/.claudia/config.json`, and fix subagent-aware idle state.

**Architecture:** New `preferences.js` module owns all config read/write. New `sfx.js` generates WAV audio in Node.js and plays via OS commands. Session tracker gains `activeSubagents` counter to gate idle transitions. Frontend removes Web Audio, reads prefs from API.

**Tech Stack:** Node.js (Buffer, child_process, fs, os, path), Express, Svelte 5, Vitest

---

### Task 1: Preferences Module

**Files:**
- Create: `packages/server/src/preferences.js`
- Create: `packages/server/src/preferences.test.js`

- [ ] **Step 1: Write the failing tests**

```js
// packages/server/src/preferences.test.js
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createPreferences } from "./preferences.js";

let tmpDir;
let prefs;

beforeEach(async () => {
  tmpDir = path.join(os.tmpdir(), `claudia-prefs-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await fs.mkdir(tmpDir, { recursive: true });
  prefs = createPreferences(tmpDir);
});

afterEach(async () => {
  if (tmpDir) await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("preferences", () => {
  it("returns defaults when no config exists", async () => {
    const p = await prefs.get();
    expect(p.activeSet).toBe("default");
    expect(p.theme).toBe("dark");
    expect(p.immersive).toBe(false);
    expect(p.sfx).toEqual({ muted: false, volume: 0.5 });
  });

  it("merges partial update into defaults", async () => {
    const p = await prefs.set({ theme: "light" });
    expect(p.theme).toBe("light");
    expect(p.sfx).toEqual({ muted: false, volume: 0.5 });
  });

  it("deep-merges sfx sub-object", async () => {
    const p = await prefs.set({ sfx: { volume: 0.8 } });
    expect(p.sfx.volume).toBe(0.8);
    expect(p.sfx.muted).toBe(false);
  });

  it("persists to disk", async () => {
    await prefs.set({ theme: "light" });
    const raw = JSON.parse(await fs.readFile(path.join(tmpDir, "config.json"), "utf-8"));
    expect(raw.theme).toBe("light");
  });

  it("preserves unknown keys from existing config", async () => {
    await fs.writeFile(path.join(tmpDir, "config.json"), JSON.stringify({ customKey: 42 }));
    const p = await prefs.set({ theme: "light" });
    expect(p.customKey).toBe(42);
    expect(p.theme).toBe("light");
  });

  it("get() reads from current file state", async () => {
    await prefs.set({ immersive: true });
    const p = await prefs.get();
    expect(p.immersive).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/server/src/preferences.test.js`
Expected: FAIL — module `./preferences.js` not found

- [ ] **Step 3: Write implementation**

```js
// packages/server/src/preferences.js
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const DEFAULTS = {
  activeSet: "default",
  theme: "dark",
  immersive: false,
  sfx: { muted: false, volume: 0.5 },
};

export function createPreferences(baseDir) {
  const configPath = path.join(baseDir, "config.json");

  async function readRaw() {
    try {
      const raw = await fs.readFile(configPath, "utf-8");
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }

  async function get() {
    const raw = await readRaw();
    return {
      ...DEFAULTS,
      ...raw,
      sfx: { ...DEFAULTS.sfx, ...raw.sfx },
    };
  }

  async function set(patch) {
    const current = await readRaw();
    if (patch.sfx) {
      current.sfx = { ...current.sfx, ...patch.sfx };
      delete patch.sfx;
    }
    Object.assign(current, patch);
    await fs.writeFile(configPath, JSON.stringify(current, null, 2) + "\n");
    return get();
  }

  return { get, set };
}

// Default singleton for production use
const DEFAULT_DIR = path.join(os.homedir(), ".claudia");
const defaultPrefs = createPreferences(DEFAULT_DIR);

export const getPreferences = defaultPrefs.get;
export const setPreferences = defaultPrefs.set;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/server/src/preferences.test.js`
Expected: All 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/preferences.js packages/server/src/preferences.test.js
git commit -m "feat: add unified preferences module with tests"
```

---

### Task 2: Preferences API Endpoints

**Files:**
- Modify: `packages/server/src/routes-api.js` (add endpoints, import preferences)
- Modify: `packages/server/src/routes-api.test.js` (add route tests)
- Modify: `packages/server/src/index.js` (pass preferences to registerApiRoutes)

- [ ] **Step 1: Write the failing tests**

Add to the end of `packages/server/src/routes-api.test.js` (study the existing test patterns in that file first — it may use supertest or direct handler calls):

```js
describe("preferences API", () => {
  it("GET /api/preferences returns defaults", async () => {
    const res = await request(app).get("/api/preferences");
    expect(res.status).toBe(200);
    expect(res.body.theme).toBe("dark");
    expect(res.body.sfx).toEqual({ muted: false, volume: 0.5 });
  });

  it("PATCH /api/preferences merges partial update", async () => {
    const res = await request(app).patch("/api/preferences").send({ theme: "light" });
    expect(res.status).toBe(200);
    expect(res.body.theme).toBe("light");
    expect(res.body.sfx).toEqual({ muted: false, volume: 0.5 });
  });

  it("PATCH /api/preferences deep-merges sfx", async () => {
    const res = await request(app).patch("/api/preferences").send({ sfx: { volume: 0.8 } });
    expect(res.status).toBe(200);
    expect(res.body.sfx.volume).toBe(0.8);
    expect(res.body.sfx.muted).toBe(false);
  });
});
```

Note: Adapt test setup to match existing patterns in `routes-api.test.js`. The tests may need a temp dir for preferences, similar to how avatar tests use temp dirs.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/server/src/routes-api.test.js`
Expected: FAIL — routes not defined

- [ ] **Step 3: Add endpoints to routes-api.js**

At top of `packages/server/src/routes-api.js`, add import:

```js
import { getPreferences, setPreferences } from "./preferences.js";
```

Inside `registerApiRoutes`, add after the hooks section (before avatar routes):

```js
  // --- Preferences API ---

  app.get("/api/preferences", async (req, res) => {
    const prefs = await getPreferences();
    res.json(prefs);
  });

  app.patch("/api/preferences", async (req, res) => {
    if (!req.body || typeof req.body !== "object") {
      return res.status(400).json({ error: "Invalid body" });
    }
    const prefs = await setPreferences(req.body);
    res.json(prefs);
  });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/server/src/routes-api.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/routes-api.js packages/server/src/routes-api.test.js
git commit -m "feat: add GET/PATCH /api/preferences endpoints"
```

---

### Task 3: Migrate Avatar Storage to Use Preferences

**Files:**
- Modify: `packages/server/src/avatar-storage.js` (remove getConfig/setConfig, use preferences)
- Modify: `packages/server/src/avatar-storage.test.js` (update tests)
- Modify: `packages/server/src/routes-api.js` (remove getActiveSet import if unused)

- [ ] **Step 1: Update avatar-storage.js**

Replace the internal `getConfig`/`setConfig` with imports from preferences. In `createAvatarStorage(baseDir)`:

1. Accept a preferences instance or import from preferences.js
2. Replace `getConfig()` → `readRaw()` from preferences (or just read the same config.json)
3. Replace `setConfig(patch)` → delegate to preferences `set()`

Since `createAvatarStorage` takes a `baseDir` parameter (used in tests with temp dirs), the cleanest approach is:

In `avatar-storage.js`, replace the internal `getConfig`/`setConfig` with a `createPreferences` import:

```js
import { createPreferences } from "./preferences.js";
```

Inside `createAvatarStorage(baseDir)`:

```js
  const prefs = createPreferences(baseDir);

  // Replace getConfig/setConfig references:
  // getConfig() → prefs.get()  (but only read raw for activeSet)
  // setConfig(patch) → prefs.set(patch)
```

Replace all internal calls:
- `getConfig()` calls that read `activeSet` → use `prefs.get()` then read `.activeSet`
- `setConfig({ activeSet: ... })` → `prefs.set({ activeSet: ... })`

Remove the old `getConfig`, `setConfig` functions and their fs/path imports that are no longer needed.

Remove `getConfig` and `setConfig` from the factory return object and the default singleton exports.

- [ ] **Step 2: Update routes-api.js**

In `packages/server/src/routes-api.js`, the avatar routes use `getActiveSet`, `setActiveSet` etc. from avatar-storage. These should still work since they internally now use preferences. No changes needed to route handlers.

However, `PUT /api/avatars/active` calls `setActiveSet(set)` which internally calls `prefs.set({ activeSet: name })`. This writes to the same `config.json` that the preferences API uses — they'll coexist correctly.

- [ ] **Step 3: Run existing avatar-storage tests**

Run: `npx vitest run packages/server/src/avatar-storage.test.js`
Expected: PASS — the test uses `createAvatarStorage(tmpDir)` which now creates its own preferences instance.

Any tests that directly call `storage.getConfig()` or `storage.setConfig()` will fail and need to be updated to call the preferences module directly or to read `config.json` via fs.

- [ ] **Step 4: Run full test suite**

Run: `npx vitest run`
Expected: All pass

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/avatar-storage.js packages/server/src/avatar-storage.test.js packages/server/src/routes-api.js
git commit -m "refactor: migrate avatar-storage to use preferences module"
```

---

### Task 4: Subagent-Aware State Machine

**Files:**
- Modify: `packages/server/src/session-tracker.js`
- Modify: `packages/server/src/session-tracker.test.js`

- [ ] **Step 1: Write failing tests**

Add to `packages/server/src/session-tracker.test.js` inside the `handleEvent` describe block:

```js
    it("tracks activeSubagents — increments on PreToolUse with Agent tool", () => {
      tracker.handleEvent({ session: "s1", state: "busy", cwd: "/proj", tool: "Agent", hookType: "PreToolUse" });
      expect(tracker.getSessions()[0].activeSubagents).toBe(1);

      tracker.handleEvent({ session: "s1", state: "busy", tool: "Agent", hookType: "PreToolUse" });
      expect(tracker.getSessions()[0].activeSubagents).toBe(2);
    });

    it("decrements activeSubagents on SubagentStop", () => {
      tracker.handleEvent({ session: "s1", state: "busy", cwd: "/proj", tool: "Agent", hookType: "PreToolUse" });
      tracker.handleEvent({ session: "s1", state: "busy", hookType: "SubagentStop" });
      expect(tracker.getSessions()[0].activeSubagents).toBe(0);
    });

    it("does not decrement activeSubagents below zero", () => {
      tracker.handleEvent({ session: "s1", state: "busy", cwd: "/proj" });
      tracker.handleEvent({ session: "s1", state: "busy", hookType: "SubagentStop" });
      expect(tracker.getSessions()[0].activeSubagents).toBe(0);
    });

    it("stays busy on idle event when activeSubagents > 0", () => {
      tracker.handleEvent({ session: "s1", state: "busy", cwd: "/proj", tool: "Agent", hookType: "PreToolUse" });
      tracker.handleEvent({ session: "s1", state: "idle" });

      expect(tracker.getSessions()[0].state).toBe(State.BUSY);
      expect(tracker.getSessions()[0].activeSubagents).toBe(1);
    });

    it("transitions to idle when last subagent completes then Stop fires", () => {
      tracker.handleEvent({ session: "s1", state: "busy", cwd: "/proj", tool: "Agent", hookType: "PreToolUse" });
      tracker.handleEvent({ session: "s1", state: "busy", hookType: "SubagentStop" });
      tracker.handleEvent({ session: "s1", state: "idle" });

      expect(tracker.getSessions()[0].state).toBe(State.IDLE);
      expect(tracker.getSessions()[0].activeSubagents).toBe(0);
    });

    it("resets activeSubagents to 0 when session goes idle", () => {
      tracker.handleEvent({ session: "s1", state: "busy", cwd: "/proj", tool: "Agent", hookType: "PreToolUse" });
      tracker.handleEvent({ session: "s1", state: "busy", hookType: "SubagentStop" });
      tracker.handleEvent({ session: "s1", state: "idle" });
      expect(tracker.getSessions()[0].activeSubagents).toBe(0);
    });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/server/src/session-tracker.test.js`
Expected: FAIL — `activeSubagents` not tracked, idle transition not gated

- [ ] **Step 3: Implement in session-tracker.js**

In `createSession()` (line 22), add `activeSubagents: 0` to the session object.

In `handleEvent()`, before the switch statement (after line 128), add subagent tracking:

```js
    // Track active subagents
    if (hookType === "PreToolUse" && (tool === "Agent" || event.tool === "Agent")) {
      session.activeSubagents = (session.activeSubagents || 0) + 1;
    }
    if (hookType === "SubagentStop") {
      session.activeSubagents = Math.max(0, (session.activeSubagents || 0) - 1);
    }
```

In the `case "idle"` block (line 138-145), gate the transition:

```js
      case "idle":
        // Don't transition to idle if subagents are still running
        if (session.activeSubagents > 0) {
          break;
        }
        session.state = State.IDLE;
        session.lastTool = null;
        session.pendingMessage = null;
        session.subagentActivity = 0;
        session.activeSubagents = 0;
        if (prevState !== State.IDLE && session.terminalTitle && onIdleAlert) {
          onIdleAlert(session);
        }
        break;
```

In `getSessions()` and `getSession()`, add `activeSubagents: s.activeSubagents` to the returned objects.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/server/src/session-tracker.test.js`
Expected: All PASS

- [ ] **Step 5: Run full test suite**

Run: `npx vitest run`
Expected: All pass (existing `subagentActivity` tests still work — they fire `SubagentStop` which decrements `activeSubagents` but `subagentActivity` still increments independently)

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/session-tracker.js packages/server/src/session-tracker.test.js
git commit -m "feat: gate idle transition on activeSubagents count"
```

---

### Task 5: Server-Side SFX Engine

**Files:**
- Create: `packages/server/src/sfx.js`
- Create: `packages/server/src/sfx.test.js`

- [ ] **Step 1: Write the failing tests**

```js
// packages/server/src/sfx.test.js
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { generateWav, createSFX } from "./sfx.js";

describe("generateWav", () => {
  it("returns a Buffer starting with RIFF header", () => {
    const buf = generateWav("pending", 0.5);
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.toString("ascii", 0, 4)).toBe("RIFF");
    expect(buf.toString("ascii", 8, 12)).toBe("WAVE");
  });

  it("generates different buffers for each sound", () => {
    const pending = generateWav("pending", 0.5);
    const send = generateWav("send", 0.5);
    const idle = generateWav("idle", 0.5);
    expect(pending.equals(send)).toBe(false);
    expect(pending.equals(idle)).toBe(false);
  });

  it("generates silent buffer at volume 0", () => {
    const buf = generateWav("pending", 0);
    // PCM data should be all zeros (silence) after 44-byte WAV header
    const pcm = buf.subarray(44);
    const allZero = pcm.every((b, i) => {
      // 16-bit samples, check pairs
      return i % 2 === 0 ? (pcm.readInt16LE(i) === 0) : true;
    });
    expect(allZero).toBe(true);
  });

  it("returns null for unknown sound name", () => {
    expect(generateWav("unknown", 0.5)).toBeNull();
  });
});

describe("createSFX", () => {
  let sfx;
  let mockPrefs;

  beforeEach(() => {
    mockPrefs = { sfx: { muted: false, volume: 0.5 } };
    sfx = createSFX(() => Promise.resolve(mockPrefs));
  });

  it("playSound is a no-op when muted", async () => {
    mockPrefs.sfx.muted = true;
    // Should not throw or spawn any process
    await sfx.playSound("pending");
  });

  it("previewSound plays even when muted", async () => {
    mockPrefs.sfx.muted = true;
    // Should not throw — it generates and attempts playback
    // (playback itself may fail in test env without audio device, that's OK)
    await sfx.previewSound("pending");
  });

  it("playSound ignores unknown sound names", async () => {
    await sfx.playSound("unknown");
    // No error thrown
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/server/src/sfx.test.js`
Expected: FAIL — module `./sfx.js` not found

- [ ] **Step 3: Write the WAV generation and synth implementation**

```js
// packages/server/src/sfx.js
import { execFile } from "node:child_process";
import { writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { platform } from "node:os";
import { randomBytes } from "node:crypto";

const SAMPLE_RATE = 44100;
const DURATION = 0.6;
const NUM_SAMPLES = Math.ceil(SAMPLE_RATE * DURATION);

// --- Synth generators (return Float64Array of samples, -1 to 1) ---

function synthSend() {
  // White noise through lowpass filter sweep (4000 Hz → 500 Hz)
  const samples = new Float64Array(NUM_SAMPLES);

  // Generate white noise
  // Use deterministic seed for consistent output
  let seed = 12345;
  function nextRandom() {
    seed = (seed * 16807 + 0) % 2147483647;
    return (seed / 2147483647) * 2 - 1;
  }

  // Simple one-pole lowpass filter
  const startFreq = 4000;
  const endFreq = 500;
  const tau = DURATION * 0.3;
  let filterState = 0;

  for (let i = 0; i < NUM_SAMPLES; i++) {
    const t = i / SAMPLE_RATE;
    const noise = nextRandom();

    // Exponential frequency sweep
    const freq = endFreq + (startFreq - endFreq) * Math.exp(-t / tau);
    const rc = 1 / (2 * Math.PI * freq);
    const alpha = 1 / (1 + rc * SAMPLE_RATE);
    filterState += alpha * (noise - filterState);

    // Envelope: quick fade-in, long fade-out
    let env;
    if (t < 0.08) {
      env = t / 0.08; // linear ramp in
    } else {
      env = 0.5 * Math.pow(0.001 / 0.5, (t - 0.08) / (DURATION - 0.08)); // exponential decay
    }

    samples[i] = filterState * env;
  }
  return samples;
}

function synthPending() {
  // Two sine oscillators (659.25 Hz + 880 Hz), staggered 150ms
  const samples = new Float64Array(NUM_SAMPLES);
  const stagger = 0.15;

  for (let i = 0; i < NUM_SAMPLES; i++) {
    const t = i / SAMPLE_RATE;
    let val = 0;

    // Oscillator 1: 659.25 Hz, starts at t=0, decays over 0.6s
    if (t < 0.3) {
      const env1 = 0.8 * Math.pow(0.001 / 0.8, t / 0.6);
      val += Math.sin(2 * Math.PI * 659.25 * t) * env1;
    }

    // Oscillator 2: 880 Hz, starts at t=0.15, decays over 0.45s
    if (t >= stagger) {
      const t2 = t - stagger;
      const env2 = 0.8 * Math.pow(0.001 / 0.8, t2 / 0.45);
      val += Math.sin(2 * Math.PI * 880 * t2) * env2;
    }

    samples[i] = val;
  }
  return samples;
}

function synthIdle() {
  // Two sine oscillators (880 Hz + 659.25 Hz) — reversed from pending
  const samples = new Float64Array(NUM_SAMPLES);
  const stagger = 0.15;

  for (let i = 0; i < NUM_SAMPLES; i++) {
    const t = i / SAMPLE_RATE;
    let val = 0;

    // Oscillator 1: 880 Hz
    if (t < 0.3) {
      const env1 = 0.8 * Math.pow(0.001 / 0.8, t / 0.6);
      val += Math.sin(2 * Math.PI * 880 * t) * env1;
    }

    // Oscillator 2: 659.25 Hz, starts at 150ms
    if (t >= stagger) {
      const t2 = t - stagger;
      const env2 = 0.8 * Math.pow(0.001 / 0.8, t2 / 0.45);
      val += Math.sin(2 * Math.PI * 659.25 * t2) * env2;
    }

    samples[i] = val;
  }
  return samples;
}

const SYNTHS = { send: synthSend, pending: synthPending, idle: synthIdle };

// --- WAV encoding ---

export function generateWav(name, volume) {
  const synth = SYNTHS[name];
  if (!synth) return null;

  const samples = synth();
  const numSamples = samples.length;
  const bytesPerSample = 2; // 16-bit
  const dataSize = numSamples * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataSize);

  // WAV header
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);        // chunk size
  buffer.writeUInt16LE(1, 20);         // PCM
  buffer.writeUInt16LE(1, 22);         // mono
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(SAMPLE_RATE * bytesPerSample, 28); // byte rate
  buffer.writeUInt16LE(bytesPerSample, 32);  // block align
  buffer.writeUInt16LE(16, 34);        // bits per sample
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);

  // PCM data with volume applied
  for (let i = 0; i < numSamples; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i] * volume));
    const int16 = Math.round(clamped * 32767);
    buffer.writeInt16LE(int16, 44 + i * 2);
  }

  return buffer;
}

// --- Platform playback ---

const currentPlatform = platform();

function playWavFile(filePath) {
  return new Promise((resolve) => {
    let cmd, args;
    if (currentPlatform === "win32") {
      const ps = `$p = New-Object Media.SoundPlayer '${filePath.replace(/'/g, "''")}'; $p.PlaySync()`;
      cmd = "powershell";
      args = ["-NoProfile", "-Command", ps];
    } else if (currentPlatform === "darwin") {
      cmd = "afplay";
      args = [filePath];
    } else {
      cmd = "aplay";
      args = ["-q", filePath];
    }
    execFile(cmd, args, { timeout: 10000 }, () => {
      unlink(filePath).catch(() => {});
      resolve();
    });
  });
}

// --- Public API ---

export function createSFX(getPreferences) {
  async function playSound(name) {
    const prefs = await getPreferences();
    if (prefs.sfx.muted) return;
    const wav = generateWav(name, prefs.sfx.volume);
    if (!wav) return;
    const filePath = join(tmpdir(), `claudia-sfx-${randomBytes(4).toString("hex")}.wav`);
    await writeFile(filePath, wav);
    playWavFile(filePath); // fire-and-forget
  }

  async function previewSound(name) {
    const prefs = await getPreferences();
    const wav = generateWav(name, prefs.sfx.volume);
    if (!wav) return;
    const filePath = join(tmpdir(), `claudia-sfx-${randomBytes(4).toString("hex")}.wav`);
    await writeFile(filePath, wav);
    playWavFile(filePath); // fire-and-forget
  }

  return { playSound, previewSound };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/server/src/sfx.test.js`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/sfx.js packages/server/src/sfx.test.js
git commit -m "feat: add server-side SFX engine with WAV synth and OS playback"
```

---

### Task 6: Wire SFX Into Server + Preview Endpoint

**Files:**
- Modify: `packages/server/src/index.js` (add SFX triggers, remove sfx-preview)
- Modify: `packages/server/src/routes-api.js` (add preview endpoint, remove /sfx static)

- [ ] **Step 1: Add SFX integration to index.js**

In `packages/server/src/index.js`:

1. Add imports:
```js
import { createSFX } from "./sfx.js";
import { getPreferences } from "./preferences.js";
```

2. Remove import:
```js
// DELETE: import { registerSfxPreview } from "./sfx-preview.js";
```

3. Create SFX instance and state tracking (after the `tracker` declaration):
```js
const sfx = createSFX(getPreferences);
const previousStates = new Map();
let firstBroadcast = true;
```

4. In the `onStateChange` callback, add sound triggers after the existing `broadcast()` call:
```js
  onStateChange: (update) => {
    usageClient.refreshUsage().catch(() => {});
    broadcast({
      ...update,
      statusMessage: getStatusMessage(update.sessions),
      usage: usageClient.getUsage(),
    });

    // Play sounds on state transitions (skip first broadcast after server start)
    if (firstBroadcast) {
      firstBroadcast = false;
      for (const s of update.sessions) {
        previousStates.set(s.id, s.state);
      }
      return;
    }
    for (const s of update.sessions) {
      const prev = previousStates.get(s.id);
      previousStates.set(s.id, s.state);
      if (prev === s.state) continue;
      if (s.state === "pending") sfx.playSound("pending");
      else if (s.state === "idle" && prev) sfx.playSound("idle");
    }
    // Clean up removed sessions
    const currentIds = new Set(update.sessions.map((s) => s.id));
    for (const id of previousStates.keys()) {
      if (!currentIds.has(id)) previousStates.delete(id);
    }
  },
```

5. In the `/hook/:type` route handler (around line 122), add send sound trigger after `tracker.handleEvent(event)`:
```js
  // After tracker.handleEvent(event):
  if (type === "UserPromptSubmit") {
    sfx.playSound("send");
  }
```

6. Remove the sfx-preview registration:
```js
// DELETE: registerSfxPreview(app);
```

7. Pass sfx to `registerApiRoutes`:
```js
registerApiRoutes(app, tracker, usageClient, sfx);
```

- [ ] **Step 2: Add preview endpoint and remove /sfx static in routes-api.js**

In `packages/server/src/routes-api.js`:

1. Update function signature:
```js
export function registerApiRoutes(app, tracker, usageClient, sfx) {
```

2. Add preview endpoint (after the preferences endpoints):
```js
  // --- SFX preview ---

  const VALID_SFX_NAMES = new Set(["send", "pending", "idle"]);

  app.post("/api/sfx/preview/:name", async (req, res) => {
    const { name } = req.params;
    if (!VALID_SFX_NAMES.has(name)) {
      return res.status(400).json({ error: "Unknown sound" });
    }
    await sfx.previewSound(name);
    res.json({ ok: true });
  });
```

3. Remove the `/sfx` static route (lines 280-282):
```js
// DELETE these lines:
//   const SFX_DIR = path.resolve(__dirname, "../assets/sfx");
//   app.use("/sfx", express.static(SFX_DIR));
```

- [ ] **Step 3: Run full test suite**

Run: `npx vitest run`
Expected: All pass. The `sfx-preview.test.js` tests will fail since we haven't deleted that file yet — that's fine, we'll clean up in Task 8.

- [ ] **Step 4: Commit**

```bash
git add packages/server/src/index.js packages/server/src/routes-api.js
git commit -m "feat: wire SFX triggers into server with hybrid model"
```

---

### Task 7: Frontend Migration — Preferences from API

**Files:**
- Modify: `packages/web/src/App.svelte`
- Modify: `packages/web/src/lib/SettingsModal.svelte`
- Modify: `packages/web/src/lib/ConfigTab.svelte`

- [ ] **Step 1: Update App.svelte**

Remove:
- `import { createSFXController } from "./lib/sfx.js";` (line 3)
- `const sfx = createSFXController();` (line 32)
- The entire `handleSessionTransitions()` function (lines 45-64)
- The `handleSessionTransitions(update.sessions);` call in the SSE callback (line 39)
- `let previousStates = $state(new Map());` (line 14)
- localStorage reads for theme and immersive

Add:
- Preferences state and API fetch on mount
- Pass individual preference values instead of sfx object

```js
  let preferences = $state(null);
  let nightMode = $state(true);
  let bgMode = $state(false);

  // Fetch preferences from server
  async function loadPreferences() {
    try {
      const res = await fetch("/api/preferences");
      const prefs = await res.json();
      preferences = prefs;
      nightMode = prefs.theme !== "light";
      bgMode = prefs.immersive;
      applyTheme(nightMode);
    } catch {
      // Fallback defaults already set
    }
  }

  loadPreferences();
```

Update `applyTheme` to also persist to server:
```js
  function applyTheme(dark) {
    document.documentElement.classList.toggle("light", !dark);
    fetch("/api/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ theme: dark ? "dark" : "light" }),
    }).catch(() => {});
  }
```

Update immersive toggle to persist to server:
```js
  onclick={() => {
    bgMode = !bgMode;
    fetch("/api/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ immersive: bgMode }),
    }).catch(() => {});
  }}
```

Remove `{sfx}` from `SettingsModal`:
```svelte
  <SettingsModal
    onclose={() => showSettings = false}
    {nightMode}
    onnightmodechange={(v) => { nightMode = v; applyTheme(v); }}
  />
```

- [ ] **Step 2: Update SettingsModal.svelte**

Remove `sfx` from props:
```js
  let { onclose, nightMode = true, onnightmodechange } = $props();
```

Remove `{sfx}` from ConfigTab:
```svelte
  <ConfigTab {nightMode} {onnightmodechange} />
```

- [ ] **Step 3: Update ConfigTab.svelte**

Remove `sfx` from props:
```js
  let { nightMode = true, onnightmodechange } = $props();
```

Replace the sfx volume state and effect with API-backed state:

```js
  let sfxVolume = $state(0.5);
  let sfxLoaded = $state(false);

  async function loadSfxPrefs() {
    try {
      const res = await fetch("/api/preferences");
      const prefs = await res.json();
      sfxVolume = prefs.sfx.muted ? 0 : prefs.sfx.volume;
      sfxLoaded = true;
    } catch {
      sfxLoaded = true;
    }
  }

  loadSfxPrefs();
```

Remove the `$effect` block that reads from the `sfx` object.

Update the volume slider `onchange` handler:
```js
  onchange={(e) => {
    sfxVolume = +e.target.value;
    const muted = sfxVolume === 0;
    const volume = sfxVolume || 0.01;
    fetch("/api/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sfx: { muted, volume } }),
    }).catch(() => {});
    if (!muted) {
      fetch("/api/sfx/preview/send", { method: "POST" }).catch(() => {});
    }
  }}
```

- [ ] **Step 4: Verify the app builds**

Run: `npm run build --prefix D:/Git/Claudia`
Expected: Build succeeds with no errors

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/App.svelte packages/web/src/lib/SettingsModal.svelte packages/web/src/lib/ConfigTab.svelte
git commit -m "feat: migrate frontend to server-side preferences and SFX"
```

---

### Task 8: Cleanup — Remove Dead Code

**Files:**
- Delete: `packages/web/src/lib/sfx.js`
- Delete: `packages/server/src/sfx-preview.js`
- Delete: `packages/server/src/sfx-preview.test.js`
- Modify: `packages/server/src/index.js` (remove sfx-preview import if not already done)

- [ ] **Step 1: Delete files**

```bash
rm packages/web/src/lib/sfx.js
rm packages/server/src/sfx-preview.js
rm packages/server/src/sfx-preview.test.js
```

- [ ] **Step 2: Verify no remaining imports**

Search for any remaining references to the deleted files:

```bash
grep -r "sfx-preview" packages/server/src/
grep -r "lib/sfx" packages/web/src/
```

Expected: No matches (import was already removed in Task 6 and Task 7)

- [ ] **Step 3: Run full test suite**

Run: `npx vitest run`
Expected: All PASS

- [ ] **Step 4: Build and lint**

Run: `npm run build --prefix D:/Git/Claudia && npm run lint --prefix D:/Git/Claudia`
Expected: Clean build, no lint errors

- [ ] **Step 5: Commit**

```bash
git add -u packages/web/src/lib/sfx.js packages/server/src/sfx-preview.js packages/server/src/sfx-preview.test.js
git commit -m "chore: remove frontend Web Audio sfx and sfx-preview page"
```

---

### Task 9: Manual Smoke Test

No code changes — verify the integrated system works end-to-end.

- [ ] **Step 1: Start the dev server**

Run: `npm run dev --prefix D:/Git/Claudia`

- [ ] **Step 2: Open the browser dashboard**

Navigate to `http://localhost:48901`. Verify:
- Theme loads correctly (not flash of wrong theme)
- Immersive mode state persists from server
- Settings modal opens, volume slider shows current value

- [ ] **Step 3: Test volume slider**

In Settings, move the volume slider. Verify:
- A sound plays from the OS (not the browser) when you change volume
- The volume setting persists after closing and reopening settings

- [ ] **Step 4: Test session sounds**

Start a Claude Code session. Verify:
- Send sound plays when you submit a prompt (UserPromptSubmit)
- No false idle sound when a subagent is dispatched
- Idle sound plays when the session genuinely finishes its turn
- Pending sound plays when permission is requested

- [ ] **Step 5: Test mute**

Drag volume to 0. Verify no sounds play on state transitions. Then restore volume — sounds should return.
