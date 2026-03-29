# Trust & Transparency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add usage monitoring consent (opt-in with onboarding), replace `teardown` with `uninstall`, and add privacy documentation.

**Architecture:** A single `usageMonitoring` flag in preferences gates the usage client at the server level. The frontend shows a "Track usage" button in the session list header where usage rings would normally appear; clicking it opens a consent modal. The CLI gains an `uninstall` command that removes hooks and deletes `~/.claudia/`. Documentation covers what Claudia accesses and how to reverse it.

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
| Create | `packages/web/src/lib/ConsentModal.svelte` | Consent modal for usage monitoring (reused by SessionList and ConfigTab) |
| Modify | `packages/web/src/lib/SessionList.svelte` | Show "Track usage" button or usage rings based on consent |
| Modify | `packages/web/src/App.svelte` | Pass `usageMonitoring` state to SessionList and SettingsModal |
| Modify | `packages/web/src/lib/ConfigTab.svelte` | Add usage monitoring toggle |
| Modify | `packages/web/src/lib/SettingsModal.svelte` | Pass through usage monitoring props |
| Modify | `bin/cli.js` | Add `uninstall` command, alias `teardown` |
| Create | `docs/privacy.md` | Detailed privacy doc with manual reversal steps |
| Modify | `README.md` | Add access summary table, link to privacy.md |
| Modify | `todo.md` | Remove completed items |

---

### Task 1: Preferences — keep `usageMonitoring` absent by default

**Files:**
- Modify: `packages/server/src/preferences.test.js`

- [ ] **Step 1: Write the tests**

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

These should already pass because `usageMonitoring` is not in DEFAULTS and `set()` uses `Object.assign`. Confirm all three pass. If any fail, fix `preferences.js` accordingly.

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
- Modify: `packages/server/src/index.test.js`
- Modify: `packages/server/src/routes-api.test.js`

- [ ] **Step 1: Update `index.js` to gate usage client on preferences**

In `packages/server/src/index.js`, add the preferences import at the top (after existing imports):
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

- [ ] **Step 2: Update `registerApiRoutes` to use services object**

In `packages/server/src/index.js`, replace:
```javascript
registerApiRoutes(app, tracker, usageClient);
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

- [ ] **Step 4: Fix tests**

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

This is a reusable modal opened by the "Track usage" button in SessionList and the toggle in ConfigTab. It does NOT persist the choice — the caller handles that via the `onchoice` callback.

Create `packages/web/src/lib/ConsentModal.svelte`:

```svelte
<script>
  let { onchoice } = $props();
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div class="backdrop" onkeydown={() => {}} role="dialog" aria-modal="true" aria-label="Usage Monitoring">
  <div class="consent-card">
    <div class="icon">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
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
      <button class="btn primary" onclick={() => onchoice(true)}>
        Enable
      </button>
      <button class="btn secondary" onclick={() => onchoice(false)}>
        No thanks
      </button>
    </div>
    <p class="hint">You can change this later in Settings.</p>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 100;
    background: rgba(10, 8, 7, 0.7);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    animation: fadeIn 0.15s ease;
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  .consent-card {
    text-align: center;
    max-width: 400px;
    padding: 48px 32px;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 16px;
    box-shadow: 0 24px 48px rgba(0, 0, 0, 0.4);
    animation: slideUp 0.2s ease;
  }

  @keyframes slideUp {
    from { opacity: 0; transform: translateY(12px); }
    to { opacity: 1; transform: translateY(0); }
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

  .btn.primary:hover {
    background: var(--brand-hover);
  }

  .btn.secondary {
    background: var(--bg-raised);
    color: var(--text-muted);
    border: 1px solid var(--border);
  }

  .btn.secondary:hover {
    background: var(--bg-card);
    color: var(--text);
    border-color: var(--border-active);
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

### Task 4: "Track usage" button in SessionList + App.svelte wiring

**Files:**
- Modify: `packages/web/src/lib/SessionList.svelte`
- Modify: `packages/web/src/App.svelte`

- [ ] **Step 1: Add consent props and state to SessionList**

In `packages/web/src/lib/SessionList.svelte`, add the import:

```javascript
import ConsentModal from "./ConsentModal.svelte";
```

Update the props. Replace:

```javascript
let { sessions = [], showSpawn = false, immersive = false, usage = null, ontogglespawn, onclosespawn } = $props();
```

With:

```javascript
let { sessions = [], showSpawn = false, immersive = false, usage = null, usageMonitoring = false, onusagemonitoringchange, ontogglespawn, onclosespawn } = $props();
```

Add state for showing the consent modal:

```javascript
let showConsent = $state(false);
```

- [ ] **Step 2: Replace UsageRings with conditional rendering**

In the template, replace:

```svelte
  <div class="section-header">
    <span class="section-label">Active Sessions</span>
    <UsageRings {usage} />
  </div>
```

With:

```svelte
  <div class="section-header">
    <span class="section-label">Active Sessions</span>
    {#if usageMonitoring}
      <UsageRings {usage} />
    {:else}
      <button class="track-usage-btn" onclick={() => showConsent = true}>Track usage</button>
    {/if}
  </div>
```

- [ ] **Step 3: Add the ConsentModal render block**

At the end of the component template (after the closing `</div>` of the list), add:

```svelte
{#if showConsent}
  <ConsentModal onchoice={(v) => {
    showConsent = false;
    if (v) onusagemonitoringchange?.(true);
  }} />
{/if}
```

- [ ] **Step 4: Add styles for the track-usage button**

Add to the `<style>` block in `SessionList.svelte`:

```css
.track-usage-btn {
  font-family: var(--font-mono);
  font-size: 0.625rem;
  color: var(--text-faint);
  background: none;
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 4px 10px;
  cursor: pointer;
  transition: all var(--duration-normal) var(--ease-in-out);
}

.track-usage-btn:hover {
  color: var(--text-muted);
  border-color: var(--border-active);
  background: var(--bg-raised);
}
```

- [ ] **Step 5: Wire usageMonitoring state in App.svelte**

In `packages/web/src/App.svelte`, add state after the existing state declarations (after `let nightMode = $state(true);`):

```javascript
let usageMonitoring = $state(false);
```

In the `loadPreferences` function, add after `applyTheme(nightMode, false);`:

```javascript
usageMonitoring = prefs.usageMonitoring === true;
```

Create a helper function after `loadPreferences`:

```javascript
function setUsageMonitoring(enabled) {
  usageMonitoring = enabled;
  fetch("/api/preferences", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ usageMonitoring: enabled }),
  }).catch(() => {});
}
```

Update the SessionList usage in the template. Replace:

```svelte
    <SessionList {sessions} {showSpawn} {usage} immersive={bgMode} ontogglespawn={() => showSpawn = !showSpawn} onclosespawn={() => showSpawn = false} />
```

With:

```svelte
    <SessionList {sessions} {showSpawn} {usage} {usageMonitoring} immersive={bgMode} onusagemonitoringchange={setUsageMonitoring} ontogglespawn={() => showSpawn = !showSpawn} onclosespawn={() => showSpawn = false} />
```

- [ ] **Step 6: Build to verify**

Run: `npm run build --prefix packages/web`

- [ ] **Step 7: Commit**

```bash
git add packages/web/src/lib/SessionList.svelte packages/web/src/App.svelte
git commit -m "feat: show Track usage button in session list, open consent modal on click"
```

---

### Task 5: Settings toggle for usage monitoring

**Files:**
- Modify: `packages/web/src/lib/ConfigTab.svelte`
- Modify: `packages/web/src/lib/SettingsModal.svelte`
- Modify: `packages/web/src/App.svelte`

- [ ] **Step 1: Add usage monitoring props and state to ConfigTab**

In `packages/web/src/lib/ConfigTab.svelte`, add the import:

```javascript
import ConsentModal from "./ConsentModal.svelte";
```

Update the props. Replace:

```javascript
let { nightMode = true, onnightmodechange, sfx } = $props();
```

With:

```javascript
let { nightMode = true, onnightmodechange, sfx, usageMonitoring = false, onusagemonitoringchange } = $props();
```

Add state:

```javascript
let showConsent = $state(false);
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
        showConsent = true;
      } else {
        onusagemonitoringchange?.(false);
      }
    }}
  />
  <p class="usage-hint">
    Reads your token from <code>~/.claude/.credentials.json</code> to fetch usage limits from the Anthropic API.
  </p>
</section>

{#if showConsent}
  <ConsentModal onchoice={(v) => {
    showConsent = false;
    if (v) onusagemonitoringchange?.(true);
  }} />
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

- [ ] **Step 4: Update SettingsModal to pass through props**

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

- [ ] **Step 5: Pass props from App.svelte to SettingsModal**

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
      {usageMonitoring}
      onusagemonitoringchange={setUsageMonitoring}
    />
```

- [ ] **Step 6: Build to verify**

Run: `npm run build --prefix packages/web`

- [ ] **Step 7: Commit**

```bash
git add packages/web/src/lib/ConfigTab.svelte packages/web/src/lib/SettingsModal.svelte packages/web/src/App.svelte
git commit -m "feat: add usage monitoring toggle in settings with consent modal"
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

Replace the entire `runTeardown` function (and its `// --- teardown ---` comment) with:

```javascript
// --- uninstall (also handles legacy "teardown") ---

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

- [ ] **Step 3: Update fs import**

`bin/cli.js` currently imports `readFile` from `node:fs/promises`, but `runUninstall` needs `fs.access` and `fs.rm`. Replace:

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

Create `docs/privacy.md` with the following content:

A markdown document titled "What Claudia Accesses" covering:

**Files & Data** — one subsection per file/path:
- `~/.claude/settings.json` (Read/Write) — hook registration
- `~/.claude/.credentials.json` (Read-only, opt-in) — OAuth token for usage API
- Anthropic Usage API `api.anthropic.com/api/oauth/usage` (opt-in) — 5h/7d utilization, only network call, max once per 10min
- `~/.claudia/avatars/` (Read/Write) — custom avatar video sets
- `~/.claudia/projects.json` (Read/Write) — session display names
- `~/.claudia/config.json` (Read/Write) — theme, sound, immersive, usage monitoring
- `~/.claudia/shutdown-token` (Read/Write) — graceful instance replacement token

**System Access** — one subsection each:
- Terminal windows — enumerate via PowerShell/AppleScript/xdotool, read titles, focus/flash
- Window renaming — Win32 `SetWindowText` for spawned sessions
- Git status — `git rev-parse` and `git status` in session working dirs
- Process spawning — `execFile` for launching new Claude Code sessions

**Uninstall** section:
- `npx claudia uninstall` — removes hooks and `~/.claudia/`
- Manual removal subsection: delete `~/.claudia/`, edit `~/.claude/settings.json` to remove entries containing `127.0.0.1:48901/hook`

- [ ] **Step 2: Update README.md — add access summary**

In `README.md`, add a "What Claudia Accesses" section after "How It Works" (after the paragraph ending "All localhost. Nothing leaves your machine."):

Two tables — one for files (columns: What, Path, Purpose) covering hook settings, OAuth token, avatars, projects, preferences, shutdown token. One for system access (columns: What, Purpose) covering terminal windows, git, process spawning.

End with: "All access is local. The only network call is the opt-in Anthropic usage API. See [docs/privacy.md](docs/privacy.md) for full details."

- [ ] **Step 3: Update README.md — update Uninstall and Commands sections**

In the "Uninstall" section, replace `npx claudia teardown` with `npx claudia uninstall`. Update the description to mention it removes hooks AND deletes `~/.claudia/`. Add a note about using Settings > Remove Hooks to remove hooks only. Link to `docs/privacy.md` for manual removal steps.

In the "Commands" section, replace `npx claudia teardown   # Remove Claudia hooks (keeps your other hooks)` with `npx claudia uninstall  # Remove hooks + delete ~/.claudia/ data`.

- [ ] **Step 4: Commit**

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

1. Open the dashboard — "Track usage" button should appear next to "Active Sessions" (if `usageMonitoring` is not set in `~/.claudia/config.json`)
2. Click "Track usage" — ConsentModal appears
3. Choose "Enable" — modal dismisses, usage rings appear
4. Open Settings — Usage Monitoring toggle is ON
5. Toggle OFF — rings disappear, "Track usage" button returns
6. Toggle ON in Settings — ConsentModal appears again for re-confirmation
7. Run `node bin/cli.js uninstall` and press `n` to verify the prompt

- [ ] **Step 5: Commit any lint fixes**

```bash
git add -A
git commit -m "fix: lint fixes for trust & transparency"
```
