---
paths:
  - "packages/web/src/**/*.svelte"
description: "Svelte 5 component & styling conventions for Claudia's web UI"
---

# Svelte Components

## Component Shape

- Svelte 5 runes only — `$state`, `$derived`, `$effect`. No legacy reactive (`$:`) syntax.
- One component, one concern — small, focused files. Split when a component outgrows readable scope.
- Props flow down, events flow up — components never reach into parents.

## Styling

- Hand-written CSS in component `<style>` blocks — scoped by default. No CSS framework.
- Author unprefixed CSS properties only (`backdrop-filter`, not `-webkit-backdrop-filter`) — the Vite build emits prefixes. Hand-writing both makes the minifier drop the standard property, leaving prefix-only CSS that Chromium/WebView2 ignore.
- `docs/design-system.html` is canonical: element catalog (buttons, inputs, toggles), modal system (shell, confirm, gate), color palette, spacing rhythm, border-radius scale, visual hierarchy. Every component follows it.
- `docs/product-mock.html` for assembled layout + immersive mode — composition decisions, not component rules.

## Tooltips

- Add only to icon-only elements whose meaning isn't obvious from context or interaction.
- Use `<Tooltip text="...">`, never HTML `title`.
- Text specific + concise (<30 chars) — name the target, not just the verb ("Open project folder", not "Open folder").
- If one icon in a group gets a tooltip, all siblings do too.

## Media

- Video: HTML `<video loop>` for avatars.
- Audio: Web Audio API for synth tones, `<audio>` for MP3 fallback.

## Reuse

- Shared primitives live in `packages/web/src/lib/` (`Modal`, `Tooltip`, `ToggleSlider`, `ConfirmDialog`). Reuse before authoring a new one.

---

> Grows via doc-sync as component patterns crystallize.
