# Account Usage Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show Anthropic account utilization as inline fill rings next to the "Active Sessions" header, fetched from the OAuth usage API with smart caching and backoff.

**Architecture:** New `usage.js` server module handles credentials, API fetch, caching, and cooldown. Session tracker triggers refresh on aggregate state changes. Usage data flows through the existing SSE broadcast to a new `UsageRings.svelte` component.

**Tech Stack:** Node.js (fs, fetch), Express, Svelte 5, SVG rings

---

### Task 1: Server — usage.js module (credentials + fetch + cache + backoff)

**Files:**
- Create: `packages/server/src/usage.js`
- Create: `packages/server/src/usage.test.js`

- [ ] **Step 1: Write failing tests for the usage module**

Create `packages/server/src/usage.test.js`:

```javascript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

vi.mock("node:fs/promises", () => ({ default: { readFile: vi.fn() } }));

// Must import after mock
const { createUsageClient } = await import("./usage.js");

const VALID_CREDENTIALS = JSON.stringify({
  claudeAiOauth: {
    accessToken: "sk-ant-oat01-test-token",
  },
});

const VALID_RESPONSE = {
  five_hour: { utilization: 42.0, resets_at: "2026-03-28T14:59:59Z" },
  seven_day: { utilization: 68.0, resets_at: "2026-03-31T03:59:59Z" },
};

describe("createUsageClient", () => {
  let client;
  let fetchMock;

  beforeEach(() => {
    vi.useFakeTimers();
    fs.readFile.mockResolvedValue(VALID_CREDENTIALS);
    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(VALID_RESPONSE),
    });
    vi.stubGlobal("fetch", fetchMock);
    client = createUsageClient();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("returns null when no data has been fetched", () => {
    expect(client.getUsage()).toBe(null);
  });

  it("fetches and caches usage data", async () => {
    const result = await client.refreshUsage();

    expect(result).toEqual({
      fiveHour: { utilization: 42.0, resetsAt: "2026-03-28T14:59:59Z" },
      sevenDay: { utilization: 68.0, resetsAt: "2026-03-31T03:59:59Z" },
      fetchedAt: expect.any(Number),
    });
    expect(client.getUsage()).toEqual(result);
  });

  it("respects 10-minute cooldown", async () => {
    await client.refreshUsage();
    fetchMock.mockClear();

    await client.refreshUsage();
    expect(fetchMock).not.toHaveBeenCalled();

    vi.advanceTimersByTime(10 * 60 * 1000 + 1);
    await client.refreshUsage();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("applies exponential backoff on 429", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 429 });

    await client.refreshUsage();
    fetchMock.mockClear();

    // Should not fetch again within backoff (10min * 2 = 20min)
    vi.advanceTimersByTime(10 * 60 * 1000 + 1);
    await client.refreshUsage();
    expect(fetchMock).not.toHaveBeenCalled();

    // Should fetch after 20min backoff
    vi.advanceTimersByTime(10 * 60 * 1000);
    await client.refreshUsage();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("resets backoff on success after 429", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 429 });
    await client.refreshUsage();

    // Wait out the 20min backoff
    vi.advanceTimersByTime(20 * 60 * 1000 + 1);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(VALID_RESPONSE),
    });
    await client.refreshUsage();

    // Back to normal 10min cooldown
    fetchMock.mockClear();
    vi.advanceTimersByTime(10 * 60 * 1000 + 1);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(VALID_RESPONSE),
    });
    await client.refreshUsage();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns null when credentials are missing", async () => {
    fs.readFile.mockRejectedValue(new Error("ENOENT"));
    client = createUsageClient();

    const result = await client.refreshUsage();
    expect(result).toBe(null);
  });

  it("returns cached data when fetch fails", async () => {
    await client.refreshUsage();
    const cached = client.getUsage();

    vi.advanceTimersByTime(10 * 60 * 1000 + 1);
    fetchMock.mockRejectedValue(new Error("network"));
    const result = await client.refreshUsage();
    expect(result).toEqual(cached);
  });

  it("caps backoff at 60 minutes", async () => {
    // Trigger 429 four times: 10m -> 20m -> 40m -> 60m (capped)
    for (let i = 0; i < 4; i++) {
      fetchMock.mockResolvedValueOnce({ ok: false, status: 429 });
      const waitMs = i === 0 ? 0 : (Math.min(10 * 60 * 1000 * Math.pow(2, i), 60 * 60 * 1000)) + 1;
      vi.advanceTimersByTime(waitMs);
      await client.refreshUsage();
    }

    fetchMock.mockClear();
    // After 4th 429, backoff should be capped at 60min, not 80min
    vi.advanceTimersByTime(60 * 60 * 1000 + 1);
    fetchMock.mockResolvedValueOnce({ ok: false, status: 429 });
    await client.refreshUsage();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --reporter=verbose packages/server/src/usage.test.js`
Expected: FAIL — `./usage.js` does not exist

- [ ] **Step 3: Implement usage.js**

Create `packages/server/src/usage.js`:

```javascript
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const CREDENTIALS_PATH = path.join(os.homedir(), ".claude", ".credentials.json");
const API_URL = "https://api.anthropic.com/api/oauth/usage";
const COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes
const MAX_BACKOFF_MS = 60 * 60 * 1000; // 60 minutes

async function readToken() {
  try {
    const raw = await fs.readFile(CREDENTIALS_PATH, "utf-8");
    const creds = JSON.parse(raw);
    return creds?.claudeAiOauth?.accessToken || null;
  } catch {
    return null;
  }
}

async function fetchUsage(token) {
  const res = await fetch(API_URL, {
    headers: {
      Authorization: `Bearer ${token}`,
      "anthropic-beta": "oauth-2025-04-20",
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    return { error: true, status: res.status };
  }

  const data = await res.json();
  return {
    error: false,
    fiveHour: {
      utilization: data.five_hour?.utilization ?? 0,
      resetsAt: data.five_hour?.resets_at ?? null,
    },
    sevenDay: {
      utilization: data.seven_day?.utilization ?? 0,
      resetsAt: data.seven_day?.resets_at ?? null,
    },
  };
}

export function createUsageClient() {
  let cached = null;
  let lastFetchAt = 0;
  let backoffMs = COOLDOWN_MS;
  let inFlight = false;

  function getUsage() {
    return cached;
  }

  async function refreshUsage() {
    const now = Date.now();
    if (now - lastFetchAt < backoffMs) return cached;
    if (inFlight) return cached;

    const token = await readToken();
    if (!token) return null;

    inFlight = true;
    lastFetchAt = now;

    try {
      const result = await fetchUsage(token);

      if (result.error) {
        if (result.status === 429) {
          backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
        }
        return cached;
      }

      backoffMs = COOLDOWN_MS;
      cached = {
        fiveHour: result.fiveHour,
        sevenDay: result.sevenDay,
        fetchedAt: Date.now(),
      };
      return cached;
    } catch {
      return cached;
    } finally {
      inFlight = false;
    }
  }

  return { getUsage, refreshUsage };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --reporter=verbose packages/server/src/usage.test.js`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/usage.js packages/server/src/usage.test.js
git commit -m "feat: add usage API client with caching and backoff"
```

---

### Task 2: Server — wire usage into SSE broadcast

**Files:**
- Modify: `packages/server/src/index.js`
- Modify: `packages/server/src/routes-api.js`

- [ ] **Step 1: Add usage client to index.js and include in broadcast**

In `packages/server/src/index.js`, add the import at the top with the other imports:

```javascript
import { createUsageClient } from "./usage.js";
```

After the `tracker` creation (around line 36), create the usage client:

```javascript
const usageClient = createUsageClient();
```

Modify the `onStateChange` callback in the `createSessionTracker` call. Replace the current callback:

```javascript
  onStateChange: (update) => {
    broadcast({ ...update, statusMessage: getStatusMessage(update.sessions) });
  },
```

With:

```javascript
  onStateChange: async (update) => {
    usageClient.refreshUsage().catch(() => {});
    broadcast({
      ...update,
      statusMessage: getStatusMessage(update.sessions),
      usage: usageClient.getUsage(),
    });
  },
```

Also update the SSE initial state payload in the `GET /events` handler. Replace:

```javascript
  const initial = JSON.stringify({
    sessions,
    aggregateState: tracker.getAggregateState(),
    statusMessage: getStatusMessage(sessions),
  });
```

With:

```javascript
  const initial = JSON.stringify({
    sessions,
    aggregateState: tracker.getAggregateState(),
    statusMessage: getStatusMessage(sessions),
    usage: usageClient.getUsage(),
  });
```

- [ ] **Step 2: Add GET /api/usage route**

In `packages/server/src/routes-api.js`, update `registerApiRoutes` signature and add the route.

Change the function signature from:

```javascript
export function registerApiRoutes(app, tracker) {
```

To:

```javascript
export function registerApiRoutes(app, tracker, usageClient) {
```

Add this route after the browse/cancel route (around line 55):

```javascript
  app.get("/api/usage", (req, res) => {
    const usage = usageClient ? usageClient.getUsage() : null;
    if (!usage) return res.status(204).end();
    res.json(usage);
  });
```

Back in `packages/server/src/index.js`, update the `registerApiRoutes` call from:

```javascript
registerApiRoutes(app, tracker);
```

To:

```javascript
registerApiRoutes(app, tracker, usageClient);
```

- [ ] **Step 3: Run all tests to verify nothing broke**

Run: `npm test -- --reporter=verbose`
Expected: All existing tests PASS (routes-api tests may need the mock updated — see next step)

- [ ] **Step 4: Fix routes-api test if needed**

If `routes-api.test.js` fails because `registerApiRoutes` now expects 3 args, update the test setup. In the `beforeAll` block, change:

```javascript
    registerApiRoutes(app, mockTracker);
```

To:

```javascript
    registerApiRoutes(app, mockTracker, null);
```

- [ ] **Step 5: Add route test for GET /api/usage**

Add to `packages/server/src/routes-api.test.js`, in a new describe block at the end (before the closing of the test file):

```javascript
describe("GET /api/usage", () => {
  it("returns 204 when no usage data", async () => {
    const res = await request(server, "GET", "/api/usage");
    expect(res.status).toBe(204);
  });
});
```

Note: Since we passed `null` as usageClient, it returns 204. Testing with actual usage data is covered by the usage.test.js unit tests.

- [ ] **Step 6: Run all tests**

Run: `npm test -- --reporter=verbose`
Expected: All PASS

- [ ] **Step 7: Commit**

```bash
git add packages/server/src/index.js packages/server/src/routes-api.js packages/server/src/routes-api.test.js
git commit -m "feat: wire usage data into SSE broadcast and add GET /api/usage"
```

---

### Task 3: Frontend — UsageRings.svelte component

**Files:**
- Create: `packages/web/src/lib/UsageRings.svelte`

- [ ] **Step 1: Create the UsageRings component**

Create `packages/web/src/lib/UsageRings.svelte`:

```svelte
<script>
  let { usage = null } = $props();

  const CIRCUMFERENCE = 2 * Math.PI * 9; // r=9 in a 24x24 viewBox
  const STALE_MS = 30 * 60 * 1000; // 30 minutes

  let countdownText5h = $state("");
  let countdownText7d = $state("");
  let stale = $state(false);

  function dashOffset(utilization) {
    return CIRCUMFERENCE * (1 - (utilization || 0) / 100);
  }

  function formatCountdown(resetsAt) {
    if (!resetsAt) return "";
    const ms = new Date(resetsAt).getTime() - Date.now();
    if (ms <= 0) return "";
    const totalMin = Math.floor(ms / 60000);
    if (totalMin < 60) return `${totalMin}m`;
    const hours = Math.floor(totalMin / 60);
    const mins = totalMin % 60;
    if (hours < 24) return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
    const days = Math.floor(hours / 24);
    const remHours = hours % 24;
    return remHours > 0 ? `${days}d ${remHours}h` : `${days}d`;
  }

  function refreshCountdowns() {
    if (!usage) return;
    countdownText5h = formatCountdown(usage.fiveHour?.resetsAt);
    countdownText7d = formatCountdown(usage.sevenDay?.resetsAt);
    stale = usage.fetchedAt && (Date.now() - usage.fetchedAt > STALE_MS);
  }

  $effect(() => {
    usage; // track reactivity
    refreshCountdowns();
    const interval = setInterval(refreshCountdowns, 60_000);
    return () => clearInterval(interval);
  });
</script>

{#if usage}
  <div class="usage-rings" class:stale>
    <div class="ring-item">
      <div class="ring-wrap">
        <svg viewBox="0 0 24 24">
          <circle class="ring-bg" cx="12" cy="12" r="9"/>
          <circle class="ring-fill" cx="12" cy="12" r="9"
            stroke-dasharray={CIRCUMFERENCE}
            stroke-dashoffset={dashOffset(usage.fiveHour?.utilization)}
          />
        </svg>
      </div>
      <span class="ring-label">5h</span>
      {#if countdownText5h}
        <span class="ring-reset">{countdownText5h}</span>
      {/if}
    </div>
    <div class="ring-item">
      <div class="ring-wrap">
        <svg viewBox="0 0 24 24">
          <circle class="ring-bg" cx="12" cy="12" r="9"/>
          <circle class="ring-fill" cx="12" cy="12" r="9"
            stroke-dasharray={CIRCUMFERENCE}
            stroke-dashoffset={dashOffset(usage.sevenDay?.utilization)}
          />
        </svg>
      </div>
      <span class="ring-label">7d</span>
      {#if countdownText7d}
        <span class="ring-reset">{countdownText7d}</span>
      {/if}
    </div>
  </div>
{/if}

<style>
  .usage-rings {
    display: flex;
    align-items: center;
    gap: 14px;
    transition: opacity 0.3s ease;
  }

  .usage-rings.stale {
    opacity: 0.5;
  }

  .ring-item {
    display: flex;
    align-items: center;
    gap: 5px;
    font-family: var(--font-mono);
    font-size: 0.625rem;
    color: var(--text-faint);
  }

  .ring-wrap {
    width: 24px;
    height: 24px;
  }

  .ring-wrap svg {
    transform: rotate(-90deg);
    width: 24px;
    height: 24px;
  }

  .ring-bg {
    fill: none;
    stroke: var(--bg-raised);
    stroke-width: 2.5;
  }

  .ring-fill {
    fill: none;
    stroke: var(--text-faint);
    stroke-width: 2.5;
    stroke-linecap: round;
    transition: stroke-dashoffset 0.6s cubic-bezier(0.16, 1, 0.3, 1);
  }

  .ring-reset {
    opacity: 0.7;
  }
</style>
```

- [ ] **Step 2: Commit**

```bash
git add packages/web/src/lib/UsageRings.svelte
git commit -m "feat: add UsageRings component"
```

---

### Task 4: Frontend — wire UsageRings into SessionList and App

**Files:**
- Modify: `packages/web/src/lib/SessionList.svelte`
- Modify: `packages/web/src/App.svelte`

- [ ] **Step 1: Add usage prop to SessionList and render UsageRings**

In `packages/web/src/lib/SessionList.svelte`, add the import and prop.

Add to the imports at the top:

```javascript
  import UsageRings from "./UsageRings.svelte";
```

Add `usage` to the destructured props:

```javascript
  let { sessions = [], showSpawn = false, immersive = false, usage = null, ontogglespawn, onclosespawn } = $props();
```

Replace the existing section label block:

```svelte
{#if sessions.length > 0}
  <div class="section-label">Active Sessions</div>
{/if}
```

With:

```svelte
{#if sessions.length > 0}
  <div class="section-header">
    <span class="section-label">Active Sessions</span>
    <UsageRings {usage} />
  </div>
{/if}
```

Add the `.section-header` style to the `<style>` block:

```css
  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;
  }
```

And update the existing `.section-label` style — remove its `margin-bottom: 12px` since the parent `.section-header` now handles it:

```css
  .section-label {
    font-family: var(--font-heading);
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-faint);
  }
```

- [ ] **Step 2: Pass usage from App.svelte to SessionList**

In `packages/web/src/App.svelte`, add a new state variable after the existing ones (around line 17):

```javascript
  let usage = $state(null);
```

In the SSE callback (inside `createSSEClient`), add `usage` parsing. Update the callback from:

```javascript
  const sseClient = createSSEClient("/events", (update) => {
    sessions = update.sessions;
    aggregateState = update.aggregateState;
    statusMessage = update.statusMessage || "";
    handleSessionTransitions(update.sessions);
    updateDocumentTitle(update.aggregateState, update.sessions);
  }, (connected) => {
```

To:

```javascript
  const sseClient = createSSEClient("/events", (update) => {
    sessions = update.sessions;
    aggregateState = update.aggregateState;
    statusMessage = update.statusMessage || "";
    usage = update.usage || null;
    handleSessionTransitions(update.sessions);
    updateDocumentTitle(update.aggregateState, update.sessions);
  }, (connected) => {
```

Pass `usage` to `SessionList` in the template. Update:

```svelte
    <SessionList {sessions} {showSpawn} immersive={bgMode} ontogglespawn={() => showSpawn = !showSpawn} onclosespawn={() => showSpawn = false} />
```

To:

```svelte
    <SessionList {sessions} {showSpawn} {usage} immersive={bgMode} ontogglespawn={() => showSpawn = !showSpawn} onclosespawn={() => showSpawn = false} />
```

- [ ] **Step 3: Build and verify**

Run: `npm run build`
Expected: Build succeeds with no errors

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/lib/SessionList.svelte packages/web/src/App.svelte
git commit -m "feat: wire usage rings into session list header"
```

---

### Task 5: Immersive mode styling

**Files:**
- Modify: `packages/web/src/App.svelte`

- [ ] **Step 1: Add immersive mode overrides for usage rings**

In `packages/web/src/App.svelte`, add these styles to the existing `<style>` block, alongside the other `.app.bg-mode` rules (around line 360):

```css
  .app.bg-mode :global(.usage-rings .ring-bg) {
    stroke: rgba(255, 255, 255, 0.08);
  }

  .app.bg-mode :global(.usage-rings .ring-fill) {
    stroke: rgba(255, 255, 255, 0.25);
  }

  .app.bg-mode :global(.usage-rings .ring-item) {
    color: rgba(255, 255, 255, 0.25);
  }
```

- [ ] **Step 2: Build and verify**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/App.svelte
git commit -m "feat: add immersive mode styling for usage rings"
```

---

### Task 6: Manual testing and cleanup

- [ ] **Step 1: Run the full test suite**

Run: `npm test -- --reporter=verbose`
Expected: All tests PASS

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: No errors (run `npm run lint:fix` if needed)

- [ ] **Step 3: Start server and verify visually**

Run: `npm run dev`

Verify:
- Usage rings appear next to "Active Sessions" when at least one session is active
- Rings use muted theme color, no traffic-light coloring
- Reset countdowns display and update
- Rings are hidden when no usage data exists
- Immersive mode: rings use translucent white styling

- [ ] **Step 4: Clean up demo file**

Delete the demo file that was used for design exploration:

```bash
git rm demo-usage.html
git commit -m "chore: remove usage display demo page"
```
