# Trust & Transparency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add usage monitoring consent (opt-in with onboarding), replace `teardown` with `uninstall`, and add privacy documentation.

**Architecture:** A single `usageMonitoring` flag in preferences gates the usage client at the server level. The frontend shows a forced-choice onboarding modal when the flag is absent. The CLI gains an `uninstall` command that removes hooks and deletes `~/.claudia/`. Documentation covers what Claudia accesses and how to reverse it.

**Tech Stack:** Node.js, Express, Svelte 5, Vitest

**Spec:** `docs/superpowers/specs/2026-03-29-trust-transparency-design.md`

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `packages/server/src/preferences.js` | Keep `usageMonitoring` out of DEFAULTS |
| Modify | `packages/server/src/preferences.test.js` | Test that `usageMonitoring` is absent by default |
| Modify | `packages/server/src/index.js` | Gate `createUsageClient()` on preference, react to changes |
| Modify | `packages/server/src/routes-api.js` | Wire up dynamic `usageClient` reference |
| Modify | `packages/server/src/index.test.js` | Test usage client gating |
| Create | `packages/web/src/lib/ConsentModal.svelte` | Onboarding modal for usage monitoring consent |
| Modify | `packages/web/src/App.svelte` | Show ConsentModal when `usageMonitoring` is undefined |
| Modify | `packages/web/src/lib/ConfigTab.svelte` | Add usage monitoring toggle |
| Modify | `bin/cli.js` | Add `uninstall` command, alias `teardown` |
| Create | `docs/privacy.md` | Detailed privacy doc with manual reversal steps |
| Modify | `README.md` | Add access summary table, link to privacy.md |
| Modify | `todo.md` | Remove completed items |

---

### Task 1: Preferences — keep `usageMonitoring` absent by default

**Files:**
- Modify: `packages/server/src/preferences.js`
- Modify: `packages/server/src/preferences.test.js`

- [ ] **Step 1: Write the failing test**

Add to `packages/server/src/preferences.test.js` inside the existing `describe("preferences", ...)` block:

```javascript
it("does not include usageMonitoring in defaults", async () => {
  const p = await prefs.get();
  expect(p.usageMonitoring).toBeUndefined();
});

it("persists usageMonitoring when set to true", async () => {
  const p = await prefs.set({ usageMonitoring: true });
  expect(p.usageMonitoring).toBe(true);
});

it("persists usageMonitoring when set to false", async () => {
  const p = await prefs.set({ usageMonitoring: false });
  expect(p.usageMonitoring).toBe(false);
});
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `npx vitest run packages/server/src/preferences.test.js`

These should already pass because `usageMonitoring` is not in DEFAULTS and `set()` uses `Object.assign`. Confirm all three pass. If any fail, the next step will fix them.

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/preferences.test.js
git commit -m "test: verify usageMonitoring absent from preference defaults"
```

---

### Task 2: Server-side usage client gating

**Files:**
- Modify: `packages/server/src/index.js`
- Modify: `packages/server/src/routes-api.js`

- [ ] **Step 1: Update `index.js` to gate usage client on preferences**

In `packages/server/src/index.js`, add the preferences import and change the usage client initialization:

Add import at the top (after existing imports):
```javascript
import { getPreferences } from "./preferences.js";
```

Replace this block (around lines 26-48):
```javascript
let usageClient;

const tracker = createSessionTracker({
  getGitStatus,
  onStateChange: (update) => {
    usageClient.refreshUsage().catch(() => {});
    const sounds = sfx.getSoundsForUpdate(update.sessions);
    broadcast({
      ...update,
      statusMessage: getStatusMessage(update.sessions),
      usage: usageClient.getUsage(),
      sfx: sounds.length > 0 ? sounds : undefined,
    });
  },
  onPendingAlert: (session) => {
    focusTerminal(session.displayName, "alert", session.windowHandle);
  },
  onIdleAlert: (session) => {
    focusTerminal(session.displayName, "navigate", session.windowHandle);
  },
});

usageClient = createUsageClient();
```

With:
```javascript
let usageClient = null;

const tracker = createSessionTracker({
  getGitStatus,
  onStateChange: (update) => {
    if (usageClient) usageClient.refreshUsage().catch(() => {});
    const sounds = sfx.getSoundsForUpdate(update.sessions);
    broadcast({
      ...update,
      statusMessage: getStatusMessage(update.sessions),
      usage: usageClient ? usageClient.getUsage() : null,
      sfx: sounds.length > 0 ? sounds : undefined,
    });
  },
  onPendingAlert: (session) => {
    focusTerminal(session.displayName, "alert", session.windowHandle);
  },
  onIdleAlert: (session) => {
    focusTerminal(session.displayName, "navigate", session.windowHandle);
  },
});
```

In the `startServer` function, replace the line:
```javascript
  usageClient.refreshUsage().catch(() => {});
```

With:
```javascript
  const prefs = await getPreferences();
  if (prefs.usageMonitoring === true) {
    usageClient = createUsageClient();
    usageClient.refreshUsage().catch(() => {});
  }
```

- [ ] **Step 2: Add preference change handler for usageMonitoring**

In `packages/server/src/routes-api.js`, update the `PATCH /api/preferences` handler to accept a callback. Instead, we'll handle this in `index.js` by wrapping the route registration.

In `packages/server/src/index.js`, after the `registerApiRoutes(app, tracker, usageClient)` line, add a handler that watches for preference changes. Replace:

```javascript
registerApiRoutes(app, tracker, usageClient);
```

With:
```javascript
registerApiRoutes(app, tracker, {
  getUsageClient: () => usageClient,
});
```

In `packages/server/src/routes-api.js`, update the function signature. Replace:
```javascript
export function registerApiRoutes(app, tracker, usageClient) {
```

With:
```javascript
export function registerApiRoutes(app, tracker, services) {
```

Update the `/api/usage` endpoint. Replace:
```javascript
  app.get("/api/usage", (req, res) => {
    const usage = usageClient ? usageClient.getUsage() : null;
    if (!usage) return res.status(204).end();
    res.json(usage);
  });
```

With:
```javascript
  app.get("/api/usage", (req, res) => {
    const client = services.getUsageClient();
    const usage = client ? client.getUsage() : null;
    if (!usage) return res.status(204).end();
    res.json(usage);
  });
```

- [ ] **Step 3: Handle usageMonitoring toggle in PATCH /api/preferences**

In `packages/server/src/routes-api.js`, update the `PATCH /api/preferences` handler. Replace:

```javascript
  app.patch("/api/preferences", async (req, res) => {
    if (!req.body || typeof req.body !== "object") {
      return res.status(400).json({ error: "Invalid body" });
    }
    const prefs = await setPreferences(req.body);
    res.json(prefs);
  });
```

With:
```javascript
  app.patch("/api/preferences", async (req, res) => {
    if (!req.body || typeof req.body !== "object") {
      return res.status(400).json({ error: "Invalid body" });
    }
    const prefs = await setPreferences(req.body);
    if ("usageMonitoring" in req.body && services.onUsageMonitoringChange) {
      services.onUsageMonitoringChange(prefs.usageMonitoring);
    }
    res.json(prefs);
  });
```

Back in `packages/server/src/index.js`, update the services object to include the callback. Replace:
```javascript
registerApiRoutes(app, tracker, {
  getUsageClient: () => usageClient,
});
```

With:
```javascript
registerApiRoutes(app, tracker, {
  getUsageClient: () => usageClient,
  onUsageMonitoringChange: (enabled) => {
    if (enabled) {
      usageClient = createUsageClient();
      usageClient.refreshUsage().catch(() => {});
    } else {
      usageClient = null;
    }
  },
});
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run packages/server/src/index.test.js packages/server/src/routes-api.test.js`

Fix any failures caused by the changed `registerApiRoutes` signature. The test file `routes-api.test.js` likely passes `usageClient` directly — update it to pass the new `services` object shape instead. Find the call to `registerApiRoutes` in the test and replace the third argument:

Where it currently passes something like `usageClient` or a mock, change to:
```javascript
{ getUsageClient: () => mockUsageClient }
```

If `index.test.js` references `usageClient` directly, update similarly.

- [ ] **Step 5: Run full test suite**

Run: `npx vitest run`

Ensure nothing else broke.

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/index.js packages/server/src/routes-api.js packages/server/src/index.test.js packages/server/src/routes-api.test.js
git commit -m "feat: gate usage client on usageMonitoring preference"
```

---

### Task 3: ConsentModal component

**Files:**
- Create: `packages/web/src/lib/ConsentModal.svelte`

- [ ] **Step 1: Create ConsentModal.svelte**

Create `packages/web/src/lib/ConsentModal.svelte`:

```svelte
<script>
  let { onchoice } = $props();

  let saving = $state(false);

  async function choose(enabled) {
    saving = true;
    try {
      await fetch("/api/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usageMonitoring: enabled }),
      });
      onchoice(enabled);
    } catch {
      saving = false;
    }
  }
</script>

<div class="consent-gate">
  <div class="consent-card">
    <div class="icon">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 20V10" />
        <path d="M18 20V4" />
        <path d="M6 20v-4" />
      </svg>
    </div>
    <h2>Usage Monitoring</h2>
    <p>
      Claudia can show your Claude usage limits (5-hour and 7-day) on the dashboard.
    </p>
    <p>
      To do this, she reads your token from <code>~/.claude/.credentials.json</code> and
      calls the Anthropic API to check your current utilization. The token is used in memory
      only — it is never stored or sent anywhere else.
    </p>
    <div class="actions">
      <button class="btn primary" onclick={() => choose(true)} disabled={saving}>
        Enable
      </button>
      <button class="btn secondary" onclick={() => choose(false)} disabled={saving}>
        No thanks
      </button>
    </div>
    <p class="hint">You can change this later in Settings.</p>
  </div>
</div>

<style>
  .consent-gate {
    position: fixed;
    inset: 0;
    z-index: 200;
    background: var(--bg);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .consent-card {
    text-align: center;
    max-width: 400px;
    padding: 48px 32px;
  }

  .icon {
    color: var(--brand);
    margin-bottom: 24px;
  }

  h2 {
    font-family: var(--font-heading);
    font-size: 1.5rem;
    font-weight: 700;
    margin-bottom: 12px;
  }

  p {
    color: var(--text-muted);
    font-size: 0.875rem;
    line-height: 1.6;
    margin-bottom: 16px;
  }

  code {
    font-family: var(--font-mono);
    font-size: 0.8125rem;
    background: var(--bg-raised);
    padding: 2px 6px;
    border-radius: 4px;
  }

  .actions {
    display: flex;
    gap: 12px;
    justify-content: center;
    margin: 24px 0 16px;
  }

  .btn {
    font-family: var(--font-body);
    font-size: 0.9375rem;
    font-weight: 600;
    border: none;
    border-radius: 10px;
    padding: 12px 32px;
    cursor: pointer;
    transition: background var(--duration-normal) var(--ease-in-out);
  }

  .btn.primary {
    background: var(--brand);
    color: #fff;
  }

  .btn.primary:hover:not(:disabled) {
    background: var(--brand-hover);
  }

  .btn.secondary {
    background: var(--bg-raised);
    color: var(--text-muted);
    border: 1px solid var(--border);
  }

  .btn.secondary:hover:not(:disabled) {
    background: var(--bg-card);
    color: var(--text);
    border-color: var(--border-active);
  }

  .btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .hint {
    color: var(--text-faint);
    font-size: 0.75rem;
    margin-bottom: 0;
  }
</style>
```

- [ ] **Step 2: Verify the file was created**

Run: `ls packages/web/src/lib/ConsentModal.svelte`

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/lib/ConsentModal.svelte
git commit -m "feat: add ConsentModal component for usage monitoring consent"
```

---

### Task 4: Wire ConsentModal into App.svelte

**Files:**
- Modify: `packages/web/src/App.svelte`

- [ ] **Step 1: Add ConsentModal import and state**

In `packages/web/src/App.svelte`, add the import after the existing imports:

```javascript
import ConsentModal from "./lib/ConsentModal.svelte";
```

Add state variable after the existing state declarations (after `let nightMode = $state(true);`):

```javascript
let usageMonitoringConsent = $state("unknown"); // "unknown" | true | false | "pending"
```

- [ ] **Step 2: Read usageMonitoring from preferences**

In the `loadPreferences` function, add reading `usageMonitoring` after the existing preference reads. Replace:

```javascript
  async function loadPreferences() {
    try {
      const res = await fetch("/api/preferences");
      const prefs = await res.json();
      nightMode = prefs.theme !== "light";
      bgMode = prefs.immersive;
      sfx.muted = prefs.sfx.muted;
      sfx.volume = prefs.sfx.volume;
      applyTheme(nightMode, false);
    } catch {
      // Fallback defaults already set
    }
  }
```

With:

```javascript
  async function loadPreferences() {
    try {
      const res = await fetch("/api/preferences");
      const prefs = await res.json();
      nightMode = prefs.theme !== "light";
      bgMode = prefs.immersive;
      sfx.muted = prefs.sfx.muted;
      sfx.volume = prefs.sfx.volume;
      applyTheme(nightMode, false);
      usageMonitoringConsent = prefs.usageMonitoring === undefined ? "pending" : prefs.usageMonitoring;
    } catch {
      // Fallback defaults already set
    }
  }
```

- [ ] **Step 3: Add ConsentModal to the template**

In the template, add the ConsentModal after the HookGate block. After:

```svelte
{#if !hooksPassed}
  <HookGate oninstalled={() => hooksPassed = true} />
{/if}
```

Add:

```svelte
{#if hooksPassed && usageMonitoringConsent === "pending"}
  <ConsentModal onchoice={(v) => usageMonitoringConsent = v} />
{/if}
```

This ensures the consent modal only shows after hooks are installed (so the user goes through onboarding in order: hooks first, then usage consent).

- [ ] **Step 4: Build to verify**

Run: `npm run build --prefix packages/web`

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/App.svelte
git commit -m "feat: show usage monitoring consent modal on first launch"
```

---

### Task 5: Settings toggle for usage monitoring

**Files:**
- Modify: `packages/web/src/lib/ConfigTab.svelte`

- [ ] **Step 1: Add usage monitoring props and state**

In `packages/web/src/lib/ConfigTab.svelte`, update the props to receive usage monitoring state:

Replace:
```javascript
let { nightMode = true, onnightmodechange, sfx } = $props();
```

With:
```javascript
let { nightMode = true, onnightmodechange, sfx, usageMonitoring = false, onusagemonitoringchange } = $props();
```

Add state for showing the consent info:
```javascript
let showConsentInfo = $state(false);
```

- [ ] **Step 2: Add the Usage Monitoring section to the template**

Add a new section after the "Sound Effects" section and before the "Hooks" section. After the closing `</section>` of Sound Effects, add:

```svelte
<section>
  <h3>Usage Monitoring</h3>
  <ToggleSlider
    label="Show usage limits on dashboard"
    checked={usageMonitoring}
    onchange={(v) => {
      if (v) {
        showConsentInfo = true;
      } else {
        onusagemonitoringchange?.(false);
      }
    }}
  />
  <p class="usage-hint">
    Reads your token from <code>~/.claude/.credentials.json</code> to fetch usage limits from the Anthropic API.
  </p>
</section>

{#if showConsentInfo}
  <ConfirmDialog
    message="Claudia will read your token from ~/.claude/.credentials.json and call the Anthropic API to check your usage limits. The token is used in memory only — never stored or sent elsewhere."
    confirmLabel="Enable"
    variant="neutral"
    onconfirm={() => { showConsentInfo = false; onusagemonitoringchange?.(true); }}
    oncancel={() => showConsentInfo = false}
  />
{/if}
```

- [ ] **Step 3: Add styles for the usage section**

Add to the `<style>` block:

```css
.usage-hint {
  font-size: 11px;
  color: var(--text-faint);
  margin-top: 8px;
  line-height: 1.5;
}

.usage-hint code {
  font-family: var(--font-mono);
  font-size: 10px;
  background: var(--bg-raised);
  padding: 1px 4px;
  border-radius: 3px;
}
```

- [ ] **Step 4: Pass props from App.svelte through SettingsModal**

In `packages/web/src/lib/SettingsModal.svelte`, read the file first — it wraps ConfigTab in a Modal. Update it to pass through the new props.

Read `packages/web/src/lib/SettingsModal.svelte` and add `usageMonitoring` and `onusagemonitoringchange` to both its props and the ConfigTab usage.

In `packages/web/src/App.svelte`, update the SettingsModal usage. Replace:

```svelte
    <SettingsModal
      onclose={() => showSettings = false}
      {sfx}
      {nightMode}
      onnightmodechange={(v) => { nightMode = v; applyTheme(v); }}
    />
```

With:

```svelte
    <SettingsModal
      onclose={() => showSettings = false}
      {sfx}
      {nightMode}
      onnightmodechange={(v) => { nightMode = v; applyTheme(v); }}
      usageMonitoring={usageMonitoringConsent === true}
      onusagemonitoringchange={(v) => {
        usageMonitoringConsent = v;
        fetch("/api/preferences", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ usageMonitoring: v }),
        }).catch(() => {});
      }}
    />
```

- [ ] **Step 5: Update SettingsModal to pass through props**

In `packages/web/src/lib/SettingsModal.svelte`, replace:

```javascript
let { onclose, sfx, nightMode = true, onnightmodechange } = $props();
```

With:

```javascript
let { onclose, sfx, nightMode = true, onnightmodechange, usageMonitoring = false, onusagemonitoringchange } = $props();
```

And replace:

```svelte
<ConfigTab {nightMode} {onnightmodechange} {sfx} />
```

With:

```svelte
<ConfigTab {nightMode} {onnightmodechange} {sfx} {usageMonitoring} {onusagemonitoringchange} />
```

- [ ] **Step 6: Build to verify**

Run: `npm run build --prefix packages/web`

- [ ] **Step 7: Commit**

```bash
git add packages/web/src/lib/ConfigTab.svelte packages/web/src/lib/SettingsModal.svelte packages/web/src/App.svelte
git commit -m "feat: add usage monitoring toggle in settings"
```

---

### Task 6: Uninstall CLI command

**Files:**
- Modify: `bin/cli.js`

- [ ] **Step 1: Add the uninstall command**

In `bin/cli.js`, update the switch statement. Replace:

```javascript
switch (command) {
  case "teardown":
    await runTeardown();
    break;
  case "shutdown":
    await runShutdown();
    break;
  default:
    await runStart();
    break;
}
```

With:

```javascript
switch (command) {
  case "uninstall":
  case "teardown":
    await runUninstall();
    break;
  case "shutdown":
    await runShutdown();
    break;
  default:
    await runStart();
    break;
}
```

- [ ] **Step 2: Replace `runTeardown` with `runUninstall`**

Replace the entire `runTeardown` function with:

```javascript
async function runUninstall() {
  const claudiaDir = path.join(homedir(), ".claudia");

  let settings;
  try {
    settings = await readSettings();
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }

  const hasHooks = hasClaudiaHooks(settings);
  let hasData = false;
  try {
    await fs.access(claudiaDir);
    hasData = true;
  } catch {}

  if (!hasHooks && !hasData) {
    console.log("Nothing to remove. Claudia is not installed.");
    return;
  }

  console.log("This will remove:");
  if (hasHooks) {
    console.log(`  Hooks from ${getSettingsPath()}`);
    console.log(`    ${Object.keys(CLAUDIA_HOOKS).join(", ")}`);
  }
  if (hasData) {
    console.log(`  Data directory: ${claudiaDir}`);
    console.log("    (avatars, projects, preferences, shutdown token)");
  }

  const ok = await confirm("\nProceed with uninstall?");
  if (!ok) {
    console.log("Aborted.");
    return;
  }

  if (hasHooks) {
    const cleaned = removeHooks(settings);
    try {
      await writeSettings(cleaned);
      console.log("Hooks removed.");
    } catch (err) {
      console.error(`Error removing hooks: ${err.message}`);
    }
  }

  if (hasData) {
    try {
      await fs.rm(claudiaDir, { recursive: true, force: true });
      console.log("Data directory removed.");
    } catch (err) {
      console.error(`Error removing data: ${err.message}`);
    }
  }

  console.log("\nClaudia has been uninstalled.");
}
```

- [ ] **Step 3: Add missing import**

`bin/cli.js` already imports `readFile` from `node:fs/promises`, but `runUninstall` needs `fs.access` and `fs.rm`. Update the import at the top. Replace:

```javascript
import { readFile } from "node:fs/promises";
```

With:

```javascript
import fs from "node:fs/promises";
```

Then update the `killExistingInstance` function which uses `readFile` — change `await readFile(tokenPath, "utf-8")` to `await fs.readFile(tokenPath, "utf-8")`.

- [ ] **Step 4: Test manually**

Run: `node bin/cli.js uninstall`

Verify it shows the correct removal summary and prompts for confirmation. Press `n` to abort (don't actually uninstall).

- [ ] **Step 5: Commit**

```bash
git add bin/cli.js
git commit -m "feat: add claudia uninstall command, alias teardown"
```

---

### Task 7: Privacy documentation

**Files:**
- Create: `docs/privacy.md`
- Modify: `README.md`

- [ ] **Step 1: Create docs/privacy.md**

Create `docs/privacy.md`:

```markdown
# What Claudia Accesses

Claudia runs entirely on your local machine. This document explains what she reads, writes, and why.

## Files & Data

### `~/.claude/settings.json` — Read/Write

Claudia registers hooks in Claude Code's settings file so that sessions report their state. When you install hooks (on first launch or from Settings), Claudia adds entries to the `hooks` object. When you remove hooks or uninstall, she removes only her own entries — your other hooks are never touched.

### `~/.claude/.credentials.json` — Read-only (opt-in)

If you enable usage monitoring, Claudia reads the OAuth access token from this file. The token is held in memory for the duration of the API call and is never written to disk, logged, or sent to any service other than the official Anthropic API.

### Anthropic Usage API — `api.anthropic.com/api/oauth/usage` (opt-in)

When usage monitoring is enabled, Claudia calls this endpoint with your token to fetch your 5-hour and 7-day utilization percentages. This is the only network call Claudia makes. It runs at most once every 10 minutes.

### `~/.claudia/avatars/` — Read/Write

Custom avatar video sets (`.webm`, `.mp4` files) for the dashboard.

### `~/.claudia/projects.json` — Read/Write

Maps session working directories to display names so the dashboard can label sessions meaningfully.

### `~/.claudia/config.json` — Read/Write

Your preferences: theme, sound settings, immersive mode, usage monitoring toggle.

### `~/.claudia/shutdown-token` — Read/Write

A random token written on each startup. When a new Claudia instance starts and finds the port occupied, it reads this token and sends it to the existing instance to request a graceful shutdown. This prevents unauthorized processes from killing Claudia.

## System Access

### Terminal windows

Claudia enumerates terminal windows to detect which ones are running Claude Code sessions. On Windows this uses PowerShell to call Win32 APIs; on macOS it uses AppleScript; on Linux it uses xdotool.

She reads window titles to match sessions to terminals, and can focus (bring to front) and flash a colored overlay on a terminal window when you click a session in the dashboard.

### Window renaming

On Windows, Claudia can set terminal window titles using the Win32 `SetWindowText` API. This is used to label spawned sessions so they can be identified later.

### Git status

Claudia runs `git rev-parse --abbrev-ref HEAD` and `git status --porcelain` in each session's working directory to show branch name and working tree state on the dashboard.

### Process spawning

When you launch a new Claude Code session from the dashboard, Claudia spawns a terminal process (`execFile`) in the chosen directory.

## Uninstall

To remove all Claudia data and hooks:

```bash
npx claudia uninstall
```

This removes:
- All Claudia hook entries from `~/.claude/settings.json` (your other hooks are untouched)
- The `~/.claudia/` directory (avatars, projects, preferences, shutdown token)

### Manual removal

If you prefer to clean up manually, or if you no longer have Node.js installed:

1. **Delete the data directory:**
   - Windows: `rmdir /s /q "%USERPROFILE%\.claudia"`
   - macOS/Linux: `rm -rf ~/.claudia`

2. **Remove hooks from Claude Code settings:**
   - Open `~/.claude/settings.json` in a text editor
   - In the `hooks` object, find and delete any entries whose command contains `127.0.0.1:48901/hook`
   - Save the file

That's it. Claude Code will continue to work normally without the hooks.
```

- [ ] **Step 2: Update README.md**

In `README.md`, add a new section after "How It Works" (after the SSE diagram paragraph ending with "All localhost. Nothing leaves your machine."). Add:

```markdown
## What Claudia Accesses

**Files:**

| What | Path | Purpose |
|------|------|---------|
| Hook settings | `~/.claude/settings.json` | Register/remove hooks in Claude Code |
| OAuth token | `~/.claude/.credentials.json` | Fetch usage limits (opt-in) |
| Avatars | `~/.claudia/avatars/` | Custom avatar video sets |
| Projects | `~/.claudia/projects.json` | Session display names |
| Preferences | `~/.claudia/config.json` | Theme, sound, usage monitoring |
| Shutdown token | `~/.claudia/shutdown-token` | Graceful instance replacement |

**System:**

| What | Purpose |
|------|---------|
| Terminal windows | Enumerate, read titles, focus/flash for navigation |
| Git | Read branch and working tree state per session |
| Process spawning | Launch new Claude Code sessions from dashboard |

All access is local. The only network call is the opt-in Anthropic usage API. See [docs/privacy.md](docs/privacy.md) for full details.
```

Update the "Uninstall" section. Replace:

```markdown
## Uninstall

```bash
npx claudia teardown
```

This removes only the hooks Claudia added. Your other hooks are untouched. Claude Code is completely unaffected.
```

With:

```markdown
## Uninstall

```bash
npx claudia uninstall
```

Removes all Claudia hooks from `~/.claude/settings.json` and deletes `~/.claudia/` (avatars, projects, preferences). Your other hooks are untouched. Claude Code is completely unaffected.

To remove hooks only (keep your data), use Settings > Remove Hooks in the dashboard.

See [docs/privacy.md](docs/privacy.md) for manual removal steps.
```

Also update the Commands section — replace `npx claudia teardown` with `npx claudia uninstall`:

Replace:
```markdown
```bash
npx claudia            # Start the server + open dashboard (installs hooks on first run)
npx claudia teardown   # Remove Claudia hooks (keeps your other hooks)
```
```

With:
```markdown
```bash
npx claudia            # Start the server + open dashboard (installs hooks on first run)
npx claudia uninstall  # Remove hooks + delete ~/.claudia/ data
```
```

- [ ] **Step 3: Commit**

```bash
git add docs/privacy.md README.md
git commit -m "docs: add privacy documentation and access summary to README"
```

---

### Task 8: Clean up todo.md

**Files:**
- Modify: `todo.md`

- [ ] **Step 1: Remove completed items from todo.md**

Remove these four lines from `todo.md`:

```
- [ ] Add "What Claudia accesses" section to README — files read/written, processes spawned, network calls
- [ ] Usage feature: make credential access opt-in (toggle off by default, explain what it reads)
- [ ] Add `claudia uninstall` command — removes `~/.claudia/` (avatars, projects, config, shutdown token), removes hooks from `~/.claude/settings.json`
- [ ] Document how to manually reverse hook installation
```

- [ ] **Step 2: Commit**

```bash
git add todo.md
git commit -m "chore: remove completed trust & transparency items from todo"
```

---

### Task 9: Final verification

- [ ] **Step 1: Run full test suite**

Run: `npx vitest run`

All tests must pass.

- [ ] **Step 2: Run linter**

Run: `npm run lint`

Fix any issues.

- [ ] **Step 3: Build web UI**

Run: `npm run build --prefix packages/web`

Must succeed.

- [ ] **Step 4: Manual smoke test**

Start the dev server: `npm run dev`

1. Open the dashboard — ConsentModal should appear (if `usageMonitoring` is not yet set in `~/.claudia/config.json`)
2. Choose "Enable" or "No thanks" — modal dismisses, choice persists
3. Open Settings — Usage Monitoring toggle reflects the choice
4. Toggle it — confirm dialog appears when enabling, immediate when disabling
5. Run `node bin/cli.js uninstall` and press `n` to verify the prompt

- [ ] **Step 5: Commit any lint fixes**

```bash
git add -A
git commit -m "fix: lint fixes for trust & transparency"
```
