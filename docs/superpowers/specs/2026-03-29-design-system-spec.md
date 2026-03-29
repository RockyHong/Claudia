# Design System Spec — Element Catalog, Modal System & Layout Principles

**Date**: 2026-03-29
**Anchor**: `docs/design-system.html` (the canonical design system reference)

## Problem

The theme demo defines tokens (colors, fonts, spacing, animation) and dashboard-level components (cards, status bar, buttons), but has zero coverage for modals, form elements, button sizes, section patterns, or layout principles. Every component author filled these gaps ad-hoc, producing visual inconsistency across modals and sub-modals.

## Solution

Created `docs/design-system.html` as a standalone visual reference — element catalog, modal system, and layout principles. All components should follow its patterns.

---

## 1. Element Catalog

### 1.1 Button Scale

Three sizes. All share: `font-family: var(--font-body)`, `font-weight: 500`, `border: none`, `cursor: pointer`, `display: inline-flex`, `align-items: center`, `transition: all var(--duration-normal) var(--ease-in-out)`.

| Size | Class | Font | Padding | Min-height | Border-radius | Use case |
|------|-------|------|---------|------------|---------------|----------|
| `sm` | `.btn-sm` | `var(--text-xs)` (0.75rem) | `var(--space-1) var(--space-3)` (4px 12px) | 28px | 6px | Modal action rows, inline controls, card actions |
| `md` | `.btn` (default) | `var(--text-sm)` (0.8125rem) | `var(--space-2) var(--space-4)` (8px 16px) | 36px | 8px | Header buttons, primary actions, most buttons |
| `lg` | `.btn-lg` | `var(--text-base)` (0.9375rem) | `var(--space-3) var(--space-6)` (12px 24px) | 44px | 10px | Full-width CTAs, gate screens (HookGate, ConsentModal) |

#### Button Variants (apply to any size)

| Variant | Class | Style |
|---------|-------|-------|
| Primary | `.btn-primary` | `background: var(--brand)`, `color: #fff`, hover: `var(--brand-hover)` |
| Ghost | `.btn-ghost` | `background: transparent`, `color: var(--text-muted)`, `border: 1px solid var(--border)`, hover: `var(--bg-raised)` + `var(--text)` |
| Danger | `.btn-danger` | `background: var(--red)`, `color: #fff`, hover: darken 10% |
| Disabled | `:disabled` | `opacity: 0.5`, `cursor: not-allowed` |

### 1.2 Text Inputs

```
background: var(--bg);
border: 1px solid var(--border);
border-radius: 8px;
padding: var(--space-2) var(--space-3);
color: var(--text);
font-size: var(--text-sm);
font-family: var(--font-body);
transition: border-color var(--duration-normal) var(--ease-in-out);

:focus → border-color: var(--brand);
```

### 1.3 Range Slider

```
accent-color: var(--brand);
height: 4px;
```

Label left (`var(--text-sm)`, `var(--text-muted)`), value right (`var(--text-xs)`, `var(--text-muted)`, `min-width: 32px`, `text-align: right`).

### 1.4 Toggle Switch

Dimensions: `40px x 22px` track, `18px` thumb. Track border-radius: `11px`.

- Off: `background: var(--border)`
- On: `background: var(--brand)`
- Thumb: `#fff`, `2px` inset, `box-shadow: 0 1px 3px rgba(0,0,0,0.2)`

### 1.5 Section Labels

```
font-family: var(--font-heading);
font-size: var(--text-xs);
font-weight: 600;
text-transform: uppercase;
letter-spacing: 0.08em;
color: var(--text-faint);
```

This is the ONE pattern. No variations. Used in ConfigTab sections, AvatarTab headings, SessionList labels.

### 1.6 Status Dots

Two sizes:

| Size | Diameter | Use |
|------|----------|-----|
| Standard | `8px` | Session cards (primary state indicator) |
| Small | `6px` | Inline status (hooks status, status bar connected dot) |

Always `border-radius: 50%`, `flex-shrink: 0`. Colors via semantic vars: `--green`, `--blue`, `--amber`, `--red`, `--gray`.

### 1.7 Error Bar

```
background: rgba(var(--red-rgb, 217, 85, 85), 0.12);
border: 1px solid rgba(var(--red-rgb), 0.3);
color: var(--red);
padding: var(--space-2) var(--space-3);
border-radius: 6px;
font-size: var(--text-sm);
```

Note: Currently uses hardcoded `#ef4444` / `#f87171`. Must switch to `var(--red)` with alpha.

---

## 2. Modal System

### 2.1 Shared Backdrop

All modals, dialogs, and overlays share:

```
position: fixed;
inset: 0;
background: rgba(10, 8, 7, 0.7);
backdrop-filter: blur(4px);
display: flex;
align-items: center;
justify-content: center;
animation: fadeIn 0.15s ease;
```

Z-index layers: `100` (modals), `110` (sub-modals / editors), `120` (confirm dialogs), `200` (gates).

### 2.2 Modal Shell (Modal.svelte)

The standard modal container. Used by Settings, Avatar, Spawn, any future modal.

```
background: var(--bg-card);
border: 1px solid var(--border);
border-radius: 16px;
width: 90%;
max-width: 480px;
max-height: 80vh;
box-shadow: 0 24px 48px rgba(0, 0, 0, 0.4);
animation: slideUp 0.2s ease;
```

**Header**: `padding: var(--space-4) var(--space-5)` (16px 20px), `border-bottom: 1px solid var(--border)`. Title: `var(--text-base)` (not `16px`), `font-weight: 600`, `var(--font-heading)`. Close button: `var(--text-muted)`, `22px` font-size, hover `var(--text)`.

**Body**: `padding: var(--space-5)` (20px), `overflow-y: auto`, `display: flex; flex-direction: column; gap: var(--space-6)` (24px between sections).

**Footer** (when needed): `padding: var(--space-4) var(--space-5)`, `border-top: 1px solid var(--border)`, `display: flex; justify-content: flex-end; gap: var(--space-2)`.

### 2.3 Confirm Dialog

Compact variant for yes/no decisions. Does NOT use Modal.svelte — it's its own minimal component.

```
max-width: 320px;
border-radius: 12px;
padding: var(--space-5);
gap: var(--space-4);
```

Message: `var(--text-sm)`, `var(--text)`. Actions: `flex`, `justify-content: flex-end`, `gap: var(--space-2)`. Uses `btn-sm` size buttons.

### 2.4 Gate Screen (HookGate, ConsentModal)

Full-screen centered card for onboarding/consent flows. NOT a modal — no backdrop blur, uses solid `var(--bg)` background.

```
text-align: center;
max-width: 400px;
padding: var(--space-10) var(--space-8);  /* 48px 32px — generous for emphasis */
```

Icon: `var(--brand)`, `margin-bottom: var(--space-6)`. Title: `var(--text-xl)`, `var(--font-heading)`, `font-weight: 700`. Body: `var(--text-sm)`, `var(--text-muted)`, `line-height: 1.6`. CTA: Uses `btn-lg` size.

### 2.5 Sub-Modal (AvatarSetEditor)

Opens on top of an existing modal. Should use Modal.svelte with a back arrow instead of close X. Z-index `110`.

**Must reuse Modal.svelte** instead of duplicating backdrop/animation/shell CSS. The only difference is the header shows a back arrow (`<-`) instead of `x`.

---

## 3. Layout Principles

### 3.1 Spacing Rhythm

Use `--space-{n}` tokens exclusively. No raw pixel values in component styles.

| Token | Value | Use |
|-------|-------|-----|
| `--space-1` | 4px | Micro gaps (between dot and label, card-row margin-top) |
| `--space-2` | 8px | Standard element gap (buttons in a row, items in a list) |
| `--space-3` | 12px | Card internal padding, input padding |
| `--space-4` | 16px | Modal header/footer padding, section spacing |
| `--space-5` | 20px | Modal body padding |
| `--space-6` | 24px | Between modal sections, after icon in gates |
| `--space-8` | 32px | Page-level spacing, gate horizontal padding |
| `--space-10` | 40px | Gate vertical padding |

### 3.2 Border Radius Scale

Five stops. Nothing else.

| Radius | Use |
|--------|-----|
| `4px` | Inline code, thumbnails, small overlays |
| `6px` | Small controls (sm buttons, inputs in tight spaces, error bars, status badges) |
| `8px` | Buttons (md), inputs, cards (compact), dropzones |
| `12px` | Session cards, confirm dialogs |
| `16px` | Modals, avatar panel, large containers |

### 3.3 Visual Hierarchy Through Color

Differentiate importance through **color weight**, not font-size inflation.

| Level | Color | Font weight | Example |
|-------|-------|-------------|---------|
| Primary | `var(--text)` | 600 | Card title, modal title, active labels |
| Secondary | `var(--text-muted)` | 400-500 | Body text, button labels, descriptions |
| Tertiary | `var(--text-faint)` | 400-500 | Section labels, timestamps, hints, state labels |

Only scale font-size when the semantic role changes (heading vs body vs caption). Within the same role, use color to distinguish.

### 3.4 Font Size Usage

| Token | Value | Role |
|-------|-------|------|
| `--text-2xl` | 2rem | App title only |
| `--text-xl` | 1.5rem | Gate screen titles |
| `--text-lg` | 1.125rem | Not used in modals — reserved for page-level subheadings |
| `--text-base` | 0.9375rem | Modal titles, primary body text |
| `--text-sm` | 0.8125rem | Buttons (md), input text, descriptions, body text in modals |
| `--text-xs` | 0.75rem | Section labels, captions, badges, buttons (sm), detail text |

### 3.5 Action Row Placement

- Actions align **right** (`justify-content: flex-end`)
- Primary button **rightmost**, secondary to its left
- Gap: `var(--space-2)` (8px)
- Confirm dialogs and modal footers follow the same rule

### 3.6 Units

- **rem** for font sizes (via tokens)
- **px** for spacing, border-radius, dimensions (via tokens)
- **Never mix** raw `px` and raw `rem` for the same property type
- Always use token vars. Direct values only in the token definitions themselves.

---

## 4. CLAUDE.md Update

Add to the Design Principles section:

```
### Visual Design System

`docs/theme-demo.html` is the canonical design system reference. It defines tokens (colors, typography, spacing, animation), element catalog (buttons, inputs, toggles), modal system (shell, confirm, gate), and layout principles (spacing rhythm, radius scale, visual hierarchy). Every UI component must follow its patterns — when in doubt, open the demo.
```

---

## 5. Deliverables

1. **Extend `docs/theme-demo.html`** with:
   - Button scale demo (sm, md, lg x primary, ghost, danger)
   - Form elements demo (text input, range slider, toggle)
   - Modal anatomy demo (standard modal, confirm dialog, gate screen)
   - Section label demo
   - Layout principles reference panel (spacing, radius, hierarchy rules)

2. **Add missing `--space-*` tokens** to App.svelte `:root` (currently only defined in theme-demo, not in the app)

3. **Add `--text-*` tokens** to App.svelte `:root` (currently only in theme-demo)

4. **Update CLAUDE.md** with design system anchor reference

5. **Fix all components** to use tokens instead of raw values (separate execution phase)

## 6. Out of Scope

- Actually fixing the components to match (that's the execution phase after planning)
- Light mode refinements (tokens already exist, principles apply equally)
- Immersive/glass mode element catalog (follows same principles, different surface)
