# Usage Pace Indicator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add visual pace and low-fuel indicators to the usage rings so users can tell at a glance whether they'll run out before the window resets.

**Architecture:** Pure frontend change. Add condition logic and derived state to `UsageRings.svelte`, update Tooltip to support two-line content, add CSS breathe animation and color classes. Update bg-mode overrides in `App.svelte`.

**Tech Stack:** Svelte 5 (runes), CSS animations

---

### Task 1: Update Tooltip to support multiline text

The Tooltip currently renders a single `text` string with `white-space: nowrap`. The pace indicator needs a two-line tooltip. Add support for `\n` in the text prop by switching to `white-space: pre-line`.

**Files:**
- Modify: `packages/web/src/lib/Tooltip.svelte`

- [ ] **Step 1: Update Tooltip's white-space CSS**

In `packages/web/src/lib/Tooltip.svelte`, change the `.tooltip-bubble` style from `white-space: nowrap` to `white-space: pre-line`. This allows `\n` characters in the `text` prop to render as line breaks, while still collapsing other whitespace normally.

```svelte
  .tooltip-bubble {
    position: absolute;
    bottom: calc(100% + 6px);
    left: 50%;
    transform: translateX(-50%) scale(0.9);
    white-space: pre-line;
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    color: var(--text);
    background: var(--bg-raised);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 2px 8px;
    pointer-events: none;
    opacity: 0;
    transition: opacity var(--duration-normal) var(--ease-out),
                transform var(--duration-normal) var(--ease-out);
  }
```

- [ ] **Step 2: Verify tooltip still works**

Run `npm run dev` from the repo root. Open the dashboard, hover over a usage ring. The existing single-line percentage tooltip should render identically — `pre-line` only changes behavior when `\n` is present.

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/lib/Tooltip.svelte
git commit -m "feat: support multiline text in Tooltip via pre-line"
```

---

### Task 2: Add pace logic and derived state to UsageRings

Add the two condition checks (outpacing, low fuel) as derived state for each ring. This is pure logic — no visual changes yet.

**Files:**
- Modify: `packages/web/src/lib/UsageRings.svelte`

- [ ] **Step 1: Add window duration constants and condition helpers**

At the top of the `<script>` block in `packages/web/src/lib/UsageRings.svelte`, after the existing `STALE_MS` constant, add:

```js
const WINDOW_5H = 5 * 60 * 60 * 1000;   // 18,000,000ms
const WINDOW_7D = 7 * 24 * 60 * 60 * 1000; // 604,800,000ms

function timeElapsedPct(resetsAt, windowMs) {
  if (!resetsAt) return 0;
  const msLeft = Math.max(0, new Date(resetsAt).getTime() - Date.now());
  return (1 - msLeft / windowMs) * 100;
}

function isOutpacing(utilization, resetsAt, windowMs) {
  if (!utilization || utilization < 50) return false;
  return utilization > timeElapsedPct(resetsAt, windowMs);
}

function isLowFuel(utilization) {
  return (utilization ?? 0) >= 75;
}
```

- [ ] **Step 2: Add derived state for each ring's conditions**

After the existing `stale` state declaration, add derived state that recalculates when `usage` changes or the countdown timer ticks. Replace the existing `refreshCountdowns` function and `$effect` with a version that also computes conditions:

```js
let fiveHourOutpacing = $state(false);
let fiveHourLowFuel = $state(false);
let sevenDayOutpacing = $state(false);
let sevenDayLowFuel = $state(false);

function refreshState() {
  if (!usage) return;
  countdownText5h = formatCountdown(usage.fiveHour?.resetsAt);
  countdownText7d = formatCountdown(usage.sevenDay?.resetsAt);
  stale = usage.fetchedAt && (Date.now() - usage.fetchedAt > STALE_MS);
  fiveHourOutpacing = isOutpacing(usage.fiveHour?.utilization, usage.fiveHour?.resetsAt, WINDOW_5H);
  fiveHourLowFuel = isLowFuel(usage.fiveHour?.utilization);
  sevenDayOutpacing = isOutpacing(usage.sevenDay?.utilization, usage.sevenDay?.resetsAt, WINDOW_7D);
  sevenDayLowFuel = isLowFuel(usage.sevenDay?.utilization);
}

$effect(() => {
  usage;
  refreshState();
  const interval = setInterval(refreshState, 60_000);
  return () => clearInterval(interval);
});
```

This replaces the old `refreshCountdowns` function and the old `$effect` block entirely.

- [ ] **Step 3: Verify no regressions**

Run `npm run dev`. The rings should display exactly as before — no visual changes in this task. Check the browser console for errors.

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/lib/UsageRings.svelte
git commit -m "feat: add outpacing and low-fuel condition logic to UsageRings"
```

---

### Task 3: Add breathe animation and color classes (CSS)

Add the CSS keyframes for the breathe animation and the color modifier classes. No markup changes yet — just the styles.

**Files:**
- Modify: `packages/web/src/lib/UsageRings.svelte`

- [ ] **Step 1: Add breathe keyframes and modifier classes**

In the `<style>` block of `packages/web/src/lib/UsageRings.svelte`, change the existing `.ring-fill` rule to use `--gray` instead of `--text-faint`, and add the new classes after it:

Replace the existing `.ring-fill` block:

```css
  .ring-fill {
    fill: none;
    stroke: var(--gray);
    stroke-width: 2.5;
    stroke-linecap: round;
    transition: stroke-dashoffset 0.6s cubic-bezier(0.16, 1, 0.3, 1),
                stroke 0.3s ease,
                opacity 0.3s ease;
  }

  .ring-fill.low-fuel {
    stroke: var(--amber);
  }

  .ring-fill.outpacing {
    animation: breathe 3.5s ease-in-out infinite;
  }

  @keyframes breathe {
    0%, 100% { opacity: 0.5; }
    50% { opacity: 1; }
  }
```

Note: the `transition` on `.ring-fill` gains `stroke 0.3s ease` and `opacity 0.3s ease` so the color shift and animation entry are smooth. The `stroke` transition handles the `--gray` → `--amber` change. The `opacity` transition ensures the breathe animation starts/stops gracefully.

- [ ] **Step 2: Verify CSS parses**

Run `npm run dev`. Rings should still render — the only visible change is the stroke color moving from `--text-faint` to `--gray` (which are visually similar but semantically different). No animation should be visible yet since the classes aren't applied in markup.

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/lib/UsageRings.svelte
git commit -m "feat: add breathe animation and color modifier CSS for usage rings"
```

---

### Task 4: Wire conditions to markup (visual + tooltip)

Connect the derived condition state to the SVG classes and tooltip text.

**Files:**
- Modify: `packages/web/src/lib/UsageRings.svelte`

- [ ] **Step 1: Add tooltip text helper**

In the `<script>` block, after the condition helper functions, add:

```js
function tooltipText(utilization, outpacing) {
  const pct = `${Math.round(utilization ?? 0)}% used`;
  if (outpacing) return `${pct}\nMay run out before reset at current pace`;
  return pct;
}
```

- [ ] **Step 2: Update the 5h ring markup**

Replace the existing 5h `<div class="ring-item">` block with:

```svelte
  <div class="ring-item">
    <Tooltip text={usage ? tooltipText(usage.fiveHour?.utilization, fiveHourOutpacing) : ""}>
      <div class="ring-wrap">
        <svg viewBox="0 0 24 24">
          <circle class="ring-bg" cx="12" cy="12" r="9"/>
          {#if usage}
            <circle class="ring-fill" cx="12" cy="12" r="9"
              class:low-fuel={fiveHourLowFuel}
              class:outpacing={fiveHourOutpacing}
              stroke-dasharray={CIRCUMFERENCE}
              stroke-dashoffset={dashOffset(usage.fiveHour?.utilization)}
            />
          {/if}
        </svg>
      </div>
    </Tooltip>
    <span class="ring-label">5h</span>
    {#if countdownText5h}
      <span class="ring-reset">{countdownText5h}</span>
    {/if}
  </div>
```

The key changes: `class:low-fuel` and `class:outpacing` on the ring-fill circle, and the tooltip uses `tooltipText()` instead of the inline template.

- [ ] **Step 3: Update the 7d ring markup**

Replace the existing 7d `<div class="ring-item">` block with:

```svelte
  <div class="ring-item">
    <Tooltip text={usage ? tooltipText(usage.sevenDay?.utilization, sevenDayOutpacing) : ""}>
      <div class="ring-wrap">
        <svg viewBox="0 0 24 24">
          <circle class="ring-bg" cx="12" cy="12" r="9"/>
          {#if usage}
            <circle class="ring-fill" cx="12" cy="12" r="9"
              class:low-fuel={sevenDayLowFuel}
              class:outpacing={sevenDayOutpacing}
              stroke-dasharray={CIRCUMFERENCE}
              stroke-dashoffset={dashOffset(usage.sevenDay?.utilization)}
            />
          {/if}
        </svg>
      </div>
    </Tooltip>
    <span class="ring-label">7d</span>
    {#if countdownText7d}
      <span class="ring-reset">{countdownText7d}</span>
    {/if}
  </div>
```

- [ ] **Step 4: Verify all four states**

Run `npm run dev`. Test visually:

1. **Normal** (usage < 50%): Ring is `--gray`, no animation, tooltip shows `N% used`
2. **Outpacing only** (usage >= 50%, usage% > time%): Ring is `--gray`, breathes, tooltip shows two lines
3. **Low fuel only** (usage >= 75%, but time% > usage%): Ring is `--amber`, no animation, tooltip shows `N% used`
4. **Both** (usage >= 75%, usage% > time%): Ring is `--amber`, breathes, tooltip shows two lines

To test without waiting for real usage, temporarily hardcode values in `refreshState`:
```js
// TEMP: force conditions for testing
// fiveHourOutpacing = true;
// fiveHourLowFuel = true;
```

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/lib/UsageRings.svelte
git commit -m "feat: wire pace and low-fuel indicators to usage ring markup"
```

---

### Task 5: Update bg-mode overrides in App.svelte

The bg-mode (background/immersive mode) overrides ring colors with `rgba(255, 255, 255, ...)` values. These need to account for the new `.low-fuel` and `.outpacing` classes so the amber color and breathe animation work in immersive mode too.

**Files:**
- Modify: `packages/web/src/App.svelte`

- [ ] **Step 1: Add bg-mode overrides for new ring states**

In `packages/web/src/App.svelte`, find the existing bg-mode usage-rings overrides (around line 473-483). After the existing `.ring-fill` override, add overrides for the new classes:

```css
  .app.bg-mode :global(.usage-rings .ring-fill.low-fuel) {
    stroke: var(--amber);
  }

  .app.bg-mode :global(.usage-rings .ring-fill.outpacing) {
    animation: breathe 3.5s ease-in-out infinite;
  }
```

The `.low-fuel` override ensures `--amber` wins over the bg-mode `rgba(255, 255, 255, 0.25)`. The `.outpacing` override ensures the breathe animation applies in bg-mode (since the base bg-mode rule might reset it).

Note: The `@keyframes breathe` is defined in `UsageRings.svelte`'s scoped styles. Svelte scopes keyframe names, so the animation reference in App.svelte's `:global()` needs to use the same animation. Since the animation is applied via the `.outpacing` class which is defined in UsageRings, and App.svelte just needs to not override it, the simplest approach is to just make sure the bg-mode `.ring-fill` rule doesn't set a conflicting `opacity` or `animation`. Check the existing rule — if it doesn't set those, no additional override is needed for `.outpacing`.

If the existing `.ring-fill` bg-mode rule only sets `stroke`, then only the `.low-fuel` override is needed:

```css
  .app.bg-mode :global(.usage-rings .ring-fill.low-fuel) {
    stroke: var(--amber);
  }
```

The existing bg-mode `.ring-fill` rule is:
```css
  .app.bg-mode :global(.usage-rings .ring-fill) {
    stroke: rgba(255, 255, 255, 0.25);
  }
```

It only sets `stroke`, so the breathe animation from the scoped `.outpacing` class will work without interference. Only the `.low-fuel` override is needed.

- [ ] **Step 2: Verify in bg-mode**

Run `npm run dev`. Enable background mode. Check that:
- Normal rings show `rgba(255, 255, 255, 0.25)` stroke (unchanged)
- Low-fuel rings show `--amber` stroke
- Outpacing rings breathe

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/App.svelte
git commit -m "feat: add bg-mode override for low-fuel ring color"
```

---

### Task 6: Lint check and final verification

**Files:**
- None (verification only)

- [ ] **Step 1: Run linter**

```bash
npm run lint
```

Fix any issues reported by Biome.

- [ ] **Step 2: Run tests**

```bash
npm test
```

Ensure no server-side tests broke (there are no web tests, but server tests should still pass).

- [ ] **Step 3: Full visual QA**

Run `npm run dev` and verify:
- Both rings (5h and 7d) show `--gray` stroke by default
- Tooltip shows `N% used` on hover
- At >= 50% usage outpacing time: ring breathes, tooltip adds second line
- At >= 75% usage: ring turns `--amber`
- Both conditions stack: amber + breathe
- Background mode: all states work correctly
- Stale state (>30min old data): rings dim to 0.5 opacity as before

- [ ] **Step 4: Commit any lint fixes**

```bash
git add -A
git commit -m "chore: lint fixes for usage pace indicator"
```

Only run this step if Step 1 found issues. Skip if lint was clean.
