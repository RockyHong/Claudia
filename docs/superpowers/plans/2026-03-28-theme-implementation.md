# Theme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the cold blue-gray default theme with the warm #c15f3c brand palette, new typography (Space Grotesk + DM Sans + JetBrains Mono), simplified card design, and updated animations across all Svelte components.

**Architecture:** The theme is defined as CSS custom properties in App.svelte's `:global(:root)`. All components already consume these variables, so the migration is mostly: update the root variables, swap the font stack, update the card HTML/CSS structure in SessionCard, and align all components to the new token names. No new files needed — this is a reskin of existing code.

**Tech Stack:** Svelte 5, CSS custom properties, Google Fonts

**Reference:** `docs/theme-demo.html` is the source of truth for all design decisions.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `packages/web/index.html` | Modify | Add Google Fonts preconnect + import |
| `packages/web/src/App.svelte` | Modify | Replace `:root` variables, font stack, immersive mode styles |
| `packages/web/src/lib/SessionCard.svelte` | Modify | New card layout, simplified HTML, new dot glow animation, pending tint |
| `packages/web/src/lib/StatusBar.svelte` | Modify | Align token names, gray disconnected dot |
| `packages/web/src/lib/SettingsModal.svelte` | Modify | Align to new tokens (--bg-raised, --border-active, --text-faint) |
| `packages/web/src/lib/SpawnPopover.svelte` | Modify | Align to new tokens |
| `packages/web/src/lib/SessionList.svelte` | Modify | Minor token alignment |
| `packages/web/src/lib/AvatarPanel.svelte` | Modify | Border-radius to 16px, align tokens |

---

### Task 1: Font Loading & Root Variables

**Files:**
- Modify: `packages/web/index.html`
- Modify: `packages/web/src/App.svelte:127-166` (the `<style>` block, `:root` and body)

- [ ] **Step 1: Add Google Fonts to index.html**

In `packages/web/index.html`, add preconnect links and the font import inside `<head>`, before `<title>`:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=DM+Sans:ital,wght@0,400;0,500;0,600;1,400&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
```

- [ ] **Step 2: Replace `:global(:root)` in App.svelte**

Replace the entire dark-mode `:root` block with:

```css
:global(:root) {
  /* Brand */
  --brand: #c15f3c;
  --brand-hover: #d97b56;

  /* Surfaces */
  --bg: #141110;
  --bg-card: #1c1816;
  --bg-raised: #252019;
  --border: #302922;
  --border-active: #3d332a;

  /* Text */
  --text: #ede6df;
  --text-muted: #948b82;
  --text-faint: #5c554e;

  /* Semantic */
  --green: #4aba6a;
  --blue: #5b8fd9;
  --amber: #e5a03a;
  --red: #d95555;
  --gray: #5c554e;

  /* Typography */
  --font-heading: 'Space Grotesk', sans-serif;
  --font-body: 'DM Sans', sans-serif;
  --font-mono: 'JetBrains Mono', monospace;

  /* Animation */
  --duration-fast: 100ms;
  --duration-normal: 150ms;
  --duration-slow: 300ms;
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);
}
```

- [ ] **Step 3: Replace light mode `:root` overrides**

Replace the `@media (prefers-color-scheme: light)` block with:

```css
@media (prefers-color-scheme: light) {
  :global(:root) {
    --bg: #faf7f5;
    --bg-card: #ffffff;
    --bg-raised: #f3eeea;
    --border: #e8e1da;
    --border-active: #d4cac0;
    --text: #1c1816;
    --text-muted: #6e655d;
    --text-faint: #a39a91;
    --brand: #a84e31;
    --brand-hover: #c15f3c;
    --green: #2d9a4e;
    --blue: #3a75c4;
    --amber: #c4880f;
    --red: #c43c3c;
    --gray: #a39a91;
  }
}
```

- [ ] **Step 4: Update body font stack**

Replace the `:global(body)` rule:

```css
:global(body) {
  font-family: var(--font-body);
  font-size: 0.9375rem;
  background: var(--bg);
  color: var(--text);
  line-height: 1.5;
  overflow-x: hidden;
}
```

- [ ] **Step 5: Verify the app loads**

Run: `npm run dev` from repo root, open browser. The page should load with warm dark backgrounds and the new fonts. Cards will look broken until Task 2 — that's expected.

- [ ] **Step 6: Commit**

```bash
git add packages/web/index.html packages/web/src/App.svelte
git commit -m "Replace root theme variables with warm #c15f3c palette and new typography"
```

---

### Task 2: SessionCard Redesign

**Files:**
- Modify: `packages/web/src/lib/SessionCard.svelte` (full rewrite of template + styles)

The card layout changes from the current stacked layout to a two-row design:
- Row 1: `[dot] name` left, `state · elapsed` right (state text is faint, not colored)
- Row 2: `[git-branch-icon] branch` in mono
- Pending cards get amber background tint
- Dot gets glow animation instead of opacity pulse
- No pending message line
- Disconnected state (gray dot, not red/orange)

- [ ] **Step 1: Update stateConfig and add disconnected state**

In the `<script>` block, replace `stateConfig`:

```javascript
const stateConfig = {
  idle: { dot: "dot-idle", label: "Idle" },
  busy: { dot: "dot-busy", label: "Working" },
  pending: { dot: "dot-pending", label: "Pending" },
  disconnected: { dot: "dot-disconnected", label: "Disconnected" },
};
```

- [ ] **Step 2: Replace the template**

Replace everything from `<!-- svelte-ignore` to the closing `</div>` before `<style>` with:

```svelte
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="card {session.state}"
  class:clickable={session.spawned}
  onclick={handleClick}
  onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), handleClick())}
  tabindex={session.spawned ? 0 : -1}
  role={session.spawned ? "button" : undefined}
>
  <div class="card-row">
    <div class="card-left">
      <span class="dot {config.dot}"></span>
      <span class="name">
        {session.terminalTitle || session.displayName}
        {#if !session.spawned}<span class="orphan-badge" title="External session — focus is best-effort">ext</span>{/if}
      </span>
    </div>
    <span class="card-state">
      {config.label}
      {#if session.state === 'busy' || session.state === 'pending'}
        &middot; {elapsed}
      {/if}
    </span>
  </div>

  {#if session.git?.isGit}
    <div class="card-row card-row-detail">
      <span class="card-detail">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/></svg>
        {session.git.branch}{session.git.dirty ? " *" : ""}
      </span>
    </div>
  {/if}
</div>
```

- [ ] **Step 3: Replace the entire `<style>` block**

```css
<style>
  .card {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 12px 16px;
    transition: all var(--duration-normal, 150ms) var(--ease-in-out, ease);
    user-select: none;
  }

  .card.clickable { cursor: pointer; }
  .card.clickable:hover { border-color: var(--border-active, var(--border)); }
  .card.clickable:active { opacity: 0.85; }

  .card.pending {
    background: rgba(229, 160, 58, 0.14);
    border-color: rgba(229, 160, 58, 0.35);
    box-shadow: 0 0 16px rgba(229, 160, 58, 0.1);
  }

  .card-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .card-row-detail {
    margin-top: 4px;
  }

  .card-left {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
  }

  .name {
    font-family: var(--font-heading, sans-serif);
    font-weight: 600;
    font-size: 0.9375rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .card-state {
    font-size: 0.75rem;
    font-weight: 400;
    color: var(--text-faint, #5c554e);
    flex-shrink: 0;
    margin-left: 12px;
  }

  .card-detail {
    font-family: var(--font-mono, monospace);
    font-size: 0.75rem;
    color: var(--text-faint, #5c554e);
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }

  .card-detail svg {
    width: 12px;
    height: 12px;
    stroke: var(--text-faint, #5c554e);
    flex-shrink: 0;
  }

  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .dot-idle { background: var(--green); }
  .dot-busy {
    background: var(--blue);
    box-shadow: 0 0 6px var(--blue);
    animation: glow-dot 2.5s ease-in-out infinite;
  }
  .dot-pending {
    background: var(--amber, var(--orange));
    box-shadow: 0 0 6px var(--amber, var(--orange));
    animation: glow-dot 1.8s ease-in-out infinite;
  }
  .dot-disconnected {
    background: var(--text-faint, var(--gray));
  }

  @keyframes glow-dot {
    0%, 100% { box-shadow: 0 0 6px currentColor; opacity: 1; }
    50% { box-shadow: 0 0 2px currentColor; opacity: 0.5; }
  }

  .orphan-badge {
    font-size: 9px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--text-muted);
    background: var(--border);
    padding: 1px 5px;
    border-radius: 3px;
    margin-left: 6px;
    vertical-align: middle;
  }

  @media (prefers-reduced-motion: reduce) {
    .dot-busy, .dot-pending {
      animation: none;
      box-shadow: none;
    }
  }
</style>
```

- [ ] **Step 4: Verify cards render correctly**

Open browser. Verify:
- Busy card: blue glowing dot, "Working · Xm" in faint text, branch with icon
- Pending card: amber tinted background, glowing amber dot, "Pending · Xm"
- Idle card: green dot, "Idle", no elapsed time
- If a session has no git info, the branch row should not appear

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/lib/SessionCard.svelte
git commit -m "Redesign session cards with simplified layout, glow dots, and pending tint"
```

---

### Task 3: App.svelte Header & Immersive Mode

**Files:**
- Modify: `packages/web/src/App.svelte` (header styles, button styles, immersive mode styles)

Update the header buttons to use brand color for primary action, ghost style for secondary. Update immersive mode glass styles to match the new warm palette.

- [ ] **Step 1: Update header button styles**

Replace the existing `.header-btn` styles in App.svelte's `<style>` block with:

```css
.header-btn {
  font-family: var(--font-body);
  font-size: 0.8125rem;
  font-weight: 500;
  background: transparent;
  color: var(--text-muted);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px 16px;
  cursor: pointer;
  transition: all var(--duration-normal, 150ms) var(--ease-in-out, ease);
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 36px;
}

.header-btn:hover {
  background: var(--bg-raised);
  color: var(--text);
  border-color: var(--border-active);
}

.header-btn.active {
  background: var(--brand);
  color: #fff;
  border-color: var(--brand);
}

.header-btn.active:hover {
  background: var(--brand-hover);
  border-color: var(--brand-hover);
}
```

- [ ] **Step 2: Update the "Claudia" title font**

Find the `header h1` or title style in App.svelte and ensure it uses:

```css
font-family: var(--font-heading);
letter-spacing: -0.02em;
```

And the title text color uses `var(--brand)` for the name.

- [ ] **Step 3: Update immersive mode glass styles**

Replace the immersive mode card/status-bar overrides (`.app.bg-mode :global(.card)` etc.) with:

```css
.app.bg-mode :global(.card) {
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border-color: rgba(255, 255, 255, 0.08);
}

.app.bg-mode :global(.card):hover {
  background: rgba(0, 0, 0, 0.55);
  border-color: rgba(255, 255, 255, 0.15);
}

.app.bg-mode :global(.card.pending) {
  background: rgba(229, 160, 58, 0.15);
  border-color: rgba(229, 160, 58, 0.25);
  box-shadow: none;
}

.app.bg-mode :global(.card .name) {
  color: #fff;
}

.app.bg-mode :global(.card .card-state) {
  color: rgba(255, 255, 255, 0.35);
}

.app.bg-mode :global(.card .card-detail) {
  color: rgba(255, 255, 255, 0.25);
}

.app.bg-mode :global(.card .card-detail svg) {
  stroke: rgba(255, 255, 255, 0.25);
}

.app.bg-mode :global(.status-bar) {
  position: relative;
  z-index: 2;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border-top-color: rgba(255, 255, 255, 0.08);
}
```

- [ ] **Step 4: Update immersive header button styles**

Replace `.app.bg-mode .header-btn` styles with:

```css
.app.bg-mode .header-btn {
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-color: rgba(255, 255, 255, 0.12);
  color: rgba(255, 255, 255, 0.85);
}

.app.bg-mode .header-btn:hover {
  background: rgba(255, 255, 255, 0.18);
  border-color: rgba(255, 255, 255, 0.2);
}

.app.bg-mode .header-btn.active {
  background: rgba(193, 95, 60, 0.3);
  border-color: rgba(193, 95, 60, 0.4);
  color: #fff;
}
```

- [ ] **Step 5: Verify both modes**

Check normal mode: header buttons styled correctly, title uses Space Grotesk.
Toggle immersive: glass cards, glass buttons, pending tint shows through blur.

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/App.svelte
git commit -m "Update header buttons, title font, and immersive glass styles for new theme"
```

---

### Task 4: StatusBar Alignment

**Files:**
- Modify: `packages/web/src/lib/StatusBar.svelte`

Align tokens and make disconnected dot gray (not pulsing orange/red).

- [ ] **Step 1: Replace the `<style>` block**

```css
<style>
  .status-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 16px;
    font-size: 0.8125rem;
    color: var(--text-muted);
    border-top: 1px solid var(--border);
  }

  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .dot-idle { background: var(--green); }
  .dot-busy { background: var(--blue); }
  .dot-pending { background: var(--amber, var(--orange)); }
  .dot-disconnected {
    background: var(--gray);
    animation: pulse 2s infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.3; }
  }

  @media (prefers-reduced-motion: reduce) {
    .dot-disconnected { animation: none; }
  }

  .message { flex: 1; }

  .count {
    font-size: 0.75rem;
    opacity: 0.7;
  }
</style>
```

- [ ] **Step 2: Verify status bar**

Check connected state (green dot), check when no sessions (gray pulsing dot for disconnected).

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/lib/StatusBar.svelte
git commit -m "Align StatusBar to new theme tokens and gray disconnected state"
```

---

### Task 5: SettingsModal Token Alignment

**Files:**
- Modify: `packages/web/src/lib/SettingsModal.svelte`

The modal uses `var(--card-bg)` which is now `var(--bg-card)`. It also uses hardcoded reds and blues that should use the theme's `--red` and `--blue`. Update border-radius to 12-16px to match the softer card aesthetic.

- [ ] **Step 1: Find and replace CSS variable references**

In the `<style>` block of SettingsModal.svelte:

- Replace `var(--card-bg)` → `var(--bg-card)` (if present)
- Replace any `background: var(--bg)` for the modal body → `var(--bg-raised)` for the modal panel itself
- Replace `border-radius: 12px` on the `.modal` → `border-radius: 16px`
- Replace the `.close:hover` color to use `var(--text)` instead of any hardcoded value
- Replace `.set-card.active` border-color from `var(--blue)` → `var(--brand)`
- Replace `.set-card.active` box-shadow from blue → `rgba(193, 95, 60, 0.15)`
- Replace `.sfx-volume input[type="range"]` accent-color from `var(--blue)` → `var(--brand)`
- Replace `.upload-btn` background from `var(--blue)` → `var(--brand)` and hover from blue → `var(--brand-hover)`
- Add `font-family: var(--font-body)` to `.modal`
- Add `font-family: var(--font-heading)` to `.modal h2` and `.section-title`

- [ ] **Step 2: Verify settings modal**

Open settings. Check: modal uses warm background, active avatar set highlighted in brand orange, upload button is brand-colored, slider accent is brand-colored.

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/lib/SettingsModal.svelte
git commit -m "Align SettingsModal to new theme tokens and brand color"
```

---

### Task 6: SpawnPopover & SessionList Alignment

**Files:**
- Modify: `packages/web/src/lib/SpawnPopover.svelte`
- Modify: `packages/web/src/lib/SessionList.svelte`

- [ ] **Step 1: Update SpawnPopover**

In SpawnPopover.svelte `<style>`:
- Replace any `var(--card-bg)` → `var(--bg-card)`
- Update `.popover` border-radius to `12px`
- Replace any blue accent colors with `var(--brand)` / `var(--brand-hover)`
- Add `font-family: var(--font-body)` to `.popover`

- [ ] **Step 2: Update SessionList**

In SessionList.svelte `<style>`:
- Ensure empty state text uses `var(--text-muted)` and `var(--text-faint)`
- Add `font-family: var(--font-heading)` to `.empty-title` if there is one

- [ ] **Step 3: Update AvatarPanel**

In AvatarPanel.svelte `<style>`:
- Update `.avatar-panel` border-radius from `12px` to `16px` (if not already)
- Ensure it uses `var(--bg-card)` and `var(--border)`

- [ ] **Step 4: Verify all components**

Navigate through the app. Open spawn popover, check it uses warm colors. Check empty state with no sessions. Check avatar panel border-radius.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/lib/SpawnPopover.svelte packages/web/src/lib/SessionList.svelte packages/web/src/lib/AvatarPanel.svelte
git commit -m "Align remaining components to new theme tokens"
```

---

### Task 7: Remove Legacy Token References & Cleanup

**Files:**
- Modify: `packages/web/src/App.svelte` (remove old `--card-bg` if still referenced)

- [ ] **Step 1: Search for any remaining old token references**

Grep across `packages/web/src/` for:
- `--card-bg` (old name, should be `--bg-card`)
- `--orange` (should be `--amber`)
- `font-family:.*system` or `font-family:.*apple` (old system font stack in components)
- Any hardcoded colors that should use tokens

Fix any found.

- [ ] **Step 2: Verify light mode**

If the system is set to light mode (or use browser devtools to emulate), verify:
- Background is warm off-white `#faf7f5`
- Cards are white with warm borders
- Brand color is darker `#a84e31`
- Text has sufficient contrast

- [ ] **Step 3: Final visual check**

Both modes (normal + immersive), both themes (dark + light). All states visible (idle, busy, pending). Settings modal. Spawn popover.

- [ ] **Step 4: Commit**

```bash
git add -A packages/web/src/
git commit -m "Clean up legacy token references and verify theme consistency"
```
