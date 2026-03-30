# Usage Pace Indicator

Visual hint on the usage rings that tells the user whether they're consuming usage faster than the window is expiring, and whether they're running low.

## Problem

The current rings show utilization % and time until reset, but the user has to do mental math to answer "will I run out before the window resets?" By the time they notice high usage and start calculating, it's usually too late to adjust.

## Solution

Two independent conditions evaluated per ring (both 5h and 7d), producing three visual responses that layer naturally.

### Conditions

- **Condition A (outpacing):** `usage% > timeElapsed%` AND `usage% >= 50%`
- **Condition B (low fuel):** `usage% >= 75%`

Time elapsed is derived from existing data: `timeElapsed% = (1 - msUntilReset / windowDuration) * 100`, where window duration is 18,000,000ms (5h) or 604,800,000ms (7d).

### Visual Responses

| State | Ring stroke | Animation | Tooltip |
|-------|-----------|-----------|---------|
| Normal | `--gray` | none | `62% used` |
| A only (outpacing) | `--gray` | opacity breathe | `62% used` + hint line |
| B only (low fuel) | `--amber` | none | `75% used` |
| A + B | `--amber` | opacity breathe | `78% used` + hint line |

**Ring background** (`ring-bg` class) stays `--bg-raised`, unchanged.

### Breathe Animation

Sine-wave opacity pulse on the ring fill stroke: `0.5 → 1 → 0.5`, approximately 3-4 second cycle. CSS `@keyframes` with `ease-in-out` to approximate sine. Activates when Condition A is met, deactivates smoothly when it's not.

### Tooltip Content

Always present (first line):
```
62% used
```

Added when Condition A is active (second line):
```
May run out before reset at current pace
```

Two lines, clear separation of fact (how much) from hint (pace warning).

### Color Changes

The ring fill stroke changes from `--text-faint` to `--gray` as the new default. This is a semantic color alignment — the ring represents a quantity, not text.

At >= 75% utilization, the stroke shifts to `--amber` ("needs attention" in the app's semantic palette).

### Scope

Both the 5h and 7d rings get identical treatment. The indicator is factual — it shows the signal, the user decides the action. The 7d ring may trigger outpacing on heavy days; that's expected and honest.

## Design System Update

Section 7 "Color Palette" has been added to `docs/design-system.html` with swatches for all CSS custom properties: text tiers, surfaces, borders, brand, and semantic colors. This was a gap — no visual reference existed for the color system.

## Non-Goals

- No historical burn rate tracking or velocity calculation
- No projected time-to-exhaustion numbers
- No per-session usage breakdown
- No new data from the API — everything uses existing `utilization` and `resetsAt`
