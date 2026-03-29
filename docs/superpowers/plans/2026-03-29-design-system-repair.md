# Design System Repair — All Non-Main-Page Components

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align every UI component to the design system defined in `docs/design-system.html` — tokens, spacing, radius, hierarchy, and structural patterns.

**Architecture:** Bottom-up repair. Fix the base Modal.svelte first, then fix each component. No new files — purely editing existing styles to use design system tokens. One structural refactor: AvatarSetEditor should use Modal.svelte instead of duplicating backdrop/shell CSS.

**Tech Stack:** Svelte 5, CSS custom properties

**Reference:** Open `docs/design-system.html` in browser for visual reference. All token names and values are defined there.

**Important context:**
- ConfirmDialog is intentionally NOT Modal.svelte — it's a compact dialog pattern per the design system
- HookGate and ConsentModal are gate screens — full-screen centered cards, not modals
- AvatarSetEditor IS a sub-modal and should use Modal.svelte with a back arrow
- No unit tests for CSS changes — verify visually by running `npm run dev`
- App.svelte `:root` already defines color, font, spacing, and animation tokens. It does NOT define `--radius-*` or `--text-*` size tokens — those exist only in design-system.html. Components should use the raw token values directly (e.g. `0.75rem` not `var(--text-xs)`) since the app doesn't define these as CSS vars yet.

**Update:** Since App.svelte doesn't define `--text-*` or `--radius-*` as CSS custom properties, we'll add them in Task 1 so all components can reference them consistently.

---

### Task 1: Add missing design tokens to App.svelte :root

**Files:**
- Modify: `packages/web/src/App.svelte` (`:root` block, lines 198-234)

- [ ] **Step 1: Add text size tokens after the Animation block**

In `packages/web/src/App.svelte`, inside the `:global(:root)` block, after the `--ease-in-out` line (~line 232), add:

```css
    /* Text sizes */
    --text-xs: 0.75rem;
    --text-sm: 0.8125rem;
    --text-base: 0.9375rem;
    --text-lg: 1.125rem;
    --text-xl: 1.5rem;
    --text-2xl: 2rem;

    /* Border radius */
    --radius-xs: 4px;
    --radius-sm: 6px;
    --radius-md: 8px;
    --radius-lg: 12px;
    --radius-xl: 16px;
```

- [ ] **Step 2: Verify the app still renders**

Run: `npm run dev` (in project root)
Open browser, confirm the dashboard looks identical — adding tokens changes nothing visually.

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/App.svelte
git commit -m "feat: add text size and border radius tokens to :root"
```

---

### Task 2: Fix Modal.svelte (base component)

**Files:**
- Modify: `packages/web/src/lib/Modal.svelte`

All other modals inherit from this, so fix it first.

- [ ] **Step 1: Replace raw values with tokens**

Replace the `<style>` block in `packages/web/src/lib/Modal.svelte` with:

```css
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
    animation: fadeIn var(--duration-normal) ease;
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  .modal {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: var(--radius-xl);
    font-family: var(--font-body);
    width: 90%;
    max-width: 480px;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    animation: slideUp 0.2s ease;
    box-shadow: 0 24px 48px rgba(0, 0, 0, 0.4);
  }

  @keyframes slideUp {
    from { opacity: 0; transform: translateY(12px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-4) var(--space-5);
    border-bottom: 1px solid var(--border);
  }

  .modal-header h2 {
    font-size: var(--text-base);
    font-weight: 600;
    font-family: var(--font-heading);
  }

  .close-btn {
    background: none;
    border: none;
    color: var(--text-muted);
    font-size: 22px;
    cursor: pointer;
    padding: 0 var(--space-1);
    line-height: 1;
    transition: color var(--duration-normal);
  }

  .close-btn:hover {
    color: var(--text);
  }

  .modal-body {
    padding: var(--space-5);
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: var(--space-6);
  }
</style>
```

- [ ] **Step 2: Verify modals render correctly**

Run: `npm run dev`
Open Settings modal and Avatar modal — confirm they look correct with same spacing and radius.

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/lib/Modal.svelte
git commit -m "fix: align Modal.svelte to design system tokens"
```

---

### Task 3: Fix ConfirmDialog.svelte

**Files:**
- Modify: `packages/web/src/lib/ConfirmDialog.svelte`

This is a compact dialog — it does NOT use Modal.svelte. But it must use design system tokens.

- [ ] **Step 1: Replace the `<style>` block**

```css
<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 120;
    background: rgba(10, 8, 7, 0.7);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    animation: fadeIn var(--duration-normal) ease;
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  .dialog {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    font-family: var(--font-body);
    padding: var(--space-5);
    width: 90%;
    max-width: 320px;
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    animation: slideUp 0.2s ease;
    box-shadow: 0 24px 48px rgba(0, 0, 0, 0.4);
  }

  @keyframes slideUp {
    from { opacity: 0; transform: translateY(12px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .message {
    font-size: var(--text-sm);
    color: var(--text);
    margin: 0;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
  }

  .cancel-btn {
    font-family: var(--font-body);
    font-size: var(--text-xs);
    font-weight: 500;
    background: transparent;
    color: var(--text-muted);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: var(--space-1) var(--space-3);
    min-height: 28px;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    transition: all var(--duration-normal) var(--ease-in-out);
  }

  .cancel-btn:hover {
    background: var(--bg-raised);
    color: var(--text);
    border-color: var(--border-active);
  }

  .confirm-btn {
    font-family: var(--font-body);
    font-size: var(--text-xs);
    font-weight: 500;
    color: #fff;
    border: none;
    border-radius: var(--radius-sm);
    padding: var(--space-1) var(--space-3);
    min-height: 28px;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    transition: all var(--duration-normal) var(--ease-in-out);
  }

  .confirm-btn.danger {
    background: var(--red);
  }

  .confirm-btn.danger:hover {
    background: #c43c3c;
  }

  .confirm-btn.neutral {
    background: var(--brand);
  }

  .confirm-btn.neutral:hover {
    background: var(--brand-hover);
  }
</style>
```

- [ ] **Step 2: Verify**

Run: `npm run dev`
Open Settings > click "Remove" on hooks to trigger confirm dialog. Verify buttons are properly sized and colored.

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/lib/ConfirmDialog.svelte
git commit -m "fix: align ConfirmDialog to design system tokens"
```

---

### Task 4: Fix ToggleSlider.svelte

**Files:**
- Modify: `packages/web/src/lib/ToggleSlider.svelte`

- [ ] **Step 1: Replace the `<style>` block**

```css
<style>
  .toggle {
    display: flex;
    align-items: center;
    justify-content: space-between;
    cursor: pointer;
  }

  .toggle-label {
    font-size: var(--text-sm);
    color: var(--text);
  }

  .toggle-track {
    position: relative;
    width: 40px;
    height: 22px;
    border-radius: 11px;
    background: var(--border);
    border: none;
    cursor: pointer;
    transition: background 0.2s ease;
    padding: 0;
    flex-shrink: 0;
  }

  .toggle-track.on {
    background: var(--brand);
  }

  .toggle-thumb {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: #fff;
    transition: transform 0.2s ease;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
  }

  .toggle-track.on .toggle-thumb {
    transform: translateX(18px);
  }
</style>
```

Note: `0.875rem` changed to `var(--text-sm)`. Toggle track radius (11px) is intentional — it's half the height for a pill shape, not a design system radius stop. `#fff` for thumb is acceptable — it's always white regardless of theme.

- [ ] **Step 2: Commit**

```bash
git add packages/web/src/lib/ToggleSlider.svelte
git commit -m "fix: align ToggleSlider to design system tokens"
```

---

### Task 5: Fix ConfigTab.svelte

**Files:**
- Modify: `packages/web/src/lib/ConfigTab.svelte`

- [ ] **Step 1: Replace the `<style>` block**

```css
<style>
  section {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  section h3 {
    font-size: var(--text-xs);
    font-weight: 600;
    font-family: var(--font-heading);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-faint);
    margin-bottom: 0;
  }

  .sfx-row {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    cursor: pointer;
  }

  section :global(.toggle-label),
  .sfx-label {
    font-size: var(--text-sm);
    color: var(--text-muted);
  }

  .sfx-row input[type="range"] {
    flex: 1;
    accent-color: var(--brand);
    height: 4px;
  }

  .sfx-value {
    font-size: var(--text-xs);
    color: var(--text-muted);
    min-width: 32px;
    text-align: right;
  }

  .hooks-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .hooks-status {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .status-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .status-dot.installed { background: var(--green); }
  .status-dot.missing { background: var(--red); }
  .status-dot.unknown { background: var(--gray); }

  .status-label {
    font-size: var(--text-xs);
    color: var(--text-faint);
  }

  .hook-actions {
    display: flex;
    gap: var(--space-2);
  }

  .hook-btn {
    font-family: var(--font-body);
    font-size: var(--text-xs);
    font-weight: 500;
    background: transparent;
    color: var(--text-muted);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: var(--space-1) var(--space-3);
    min-height: 28px;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    transition: all var(--duration-normal) var(--ease-in-out);
  }

  .hook-btn:hover:not(:disabled) {
    background: var(--bg-raised);
    color: var(--text);
    border-color: var(--border-active);
  }

  .hook-btn.danger:hover:not(:disabled) {
    color: var(--red);
    border-color: var(--red);
  }

  .hook-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .hook-msg {
    font-size: var(--text-xs);
    margin-top: var(--space-2);
  }

  .hook-msg.success { color: var(--green); }
  .hook-msg.error { color: var(--red); }
</style>
```

Key changes: section h3 now uses `var(--text-xs)` (was `0.6875rem`), hook buttons follow btn-sm pattern, all spacing uses tokens.

- [ ] **Step 2: Verify**

Run: `npm run dev`
Open Settings modal. Verify section labels, toggle, slider, and hook buttons all look correct.

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/lib/ConfigTab.svelte
git commit -m "fix: align ConfigTab to design system tokens"
```

---

### Task 6: Fix ConsentModal.svelte (gate screen pattern)

**Files:**
- Modify: `packages/web/src/lib/ConsentModal.svelte`

This is a gate screen — centered card on backdrop. Uses the gate pattern from the design system.

- [ ] **Step 1: Replace the `<style>` block**

```css
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
    animation: fadeIn var(--duration-normal) ease;
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  .consent-card {
    text-align: center;
    max-width: 480px;
    width: 90%;
    padding: var(--space-10) var(--space-8);
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: var(--radius-xl);
    box-shadow: 0 24px 48px rgba(0, 0, 0, 0.4);
    animation: slideUp 0.2s ease;
  }

  @keyframes slideUp {
    from { opacity: 0; transform: translateY(12px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .icon {
    color: var(--brand);
    margin-bottom: var(--space-6);
  }

  h2 {
    font-family: var(--font-heading);
    font-size: var(--text-xl);
    font-weight: 700;
    margin-bottom: var(--space-3);
  }

  p {
    color: var(--text-muted);
    font-size: var(--text-sm);
    line-height: 1.6;
    margin-bottom: var(--space-4);
  }

  code {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    background: var(--bg-raised);
    padding: 2px 6px;
    border-radius: var(--radius-xs);
  }

  .actions {
    display: flex;
    gap: var(--space-3);
    justify-content: center;
    margin: var(--space-6) 0 var(--space-4);
  }

  .btn {
    font-family: var(--font-body);
    font-size: var(--text-base);
    font-weight: 500;
    border: none;
    border-radius: 10px;
    padding: var(--space-3) var(--space-6);
    min-height: 44px;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    transition: all var(--duration-normal) var(--ease-in-out);
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
    font-size: var(--text-xs);
    margin-bottom: 0;
  }
</style>
```

Key changes: All spacing uses tokens, font sizes use tokens, width/padding gives breathing room (`max-width: 480px`, `var(--space-10) var(--space-8)`), buttons follow btn-lg pattern.

- [ ] **Step 2: Verify**

Run: `npm run dev`
Toggle usage monitoring on in Settings to trigger consent modal. Verify it has proper breathing room and button sizing.

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/lib/ConsentModal.svelte
git commit -m "fix: align ConsentModal to design system gate pattern"
```

---

### Task 7: Fix HookGate.svelte (gate screen pattern)

**Files:**
- Modify: `packages/web/src/lib/HookGate.svelte`

Gate screen — full-screen solid background, centered card. NOT a modal.

- [ ] **Step 1: Replace the `<style>` block**

```css
<style>
  .hook-gate {
    position: fixed;
    inset: 0;
    z-index: 200;
    background: var(--bg);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .hook-gate-card {
    text-align: center;
    max-width: 480px;
    width: 90%;
    padding: var(--space-10) var(--space-8);
  }

  .icon {
    color: var(--brand);
    margin-bottom: var(--space-6);
  }

  h2 {
    font-family: var(--font-heading);
    font-size: var(--text-xl);
    font-weight: 700;
    margin-bottom: var(--space-3);
  }

  p {
    color: var(--text-muted);
    font-size: var(--text-sm);
    line-height: 1.6;
    margin-bottom: var(--space-6);
  }

  .error {
    color: var(--red);
    font-size: var(--text-sm);
    margin-bottom: var(--space-4);
  }

  .install-btn {
    font-family: var(--font-body);
    font-size: var(--text-base);
    font-weight: 500;
    background: var(--brand);
    color: #fff;
    border: none;
    border-radius: 10px;
    padding: var(--space-3) var(--space-6);
    min-height: 44px;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    transition: background var(--duration-normal) var(--ease-in-out);
  }

  .install-btn:hover:not(:disabled) {
    background: var(--brand-hover);
  }

  .install-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
```

Key changes: All spacing uses tokens, font sizes use tokens, card gets `max-width: 480px` + `width: 90%` for breathing room, button follows btn-lg pattern.

- [ ] **Step 2: Verify**

To test this, temporarily set hooks to not installed (or use browser DevTools to force render the gate). Verify centered layout with proper spacing.

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/lib/HookGate.svelte
git commit -m "fix: align HookGate to design system gate pattern"
```

---

### Task 8: Refactor AvatarSetEditor.svelte to use Modal.svelte

**Files:**
- Modify: `packages/web/src/lib/AvatarSetEditor.svelte`

This is the one structural refactor — AvatarSetEditor duplicates Modal's backdrop/shell. It should use Modal.svelte with a back arrow instead of close button.

- [ ] **Step 1: Update the script to import Modal**

At the top of the `<script>` block, add:

```js
import Modal from "./Modal.svelte";
```

- [ ] **Step 2: Replace the template**

Replace the entire template (from `<svelte:window>` through the closing `</div>`) with:

```svelte
<svelte:window onkeydown={handleKeydown} />

<Modal title={title} onclose={onclose}>
  {#snippet children()}
    {#if error}
      <div class="error-bar">{error}</div>
    {/if}

    <input
      class="name-input"
      type="text"
      bind:value={name}
      placeholder="Set name"
      maxlength="50"
    />

    <div class="drop-grid">
      <DropZone label="Idle" file={fileIdle} previewUrl={existingUrl("idle")} onfile={(f) => fileIdle = f} />
      <DropZone label="Busy" file={fileBusy} previewUrl={existingUrl("busy")} onfile={(f) => fileBusy = f} />
      <DropZone label="Pending" file={filePending} previewUrl={existingUrl("pending")} onfile={(f) => filePending = f} />
    </div>

    <div class="actions">
      <button class="cancel-btn" onclick={onclose}>Cancel</button>
      <button class="save-btn" onclick={handleSave} disabled={!canSave || saving}>
        {saving ? "Saving..." : mode === "create" ? "Create" : "Save"}
      </button>
    </div>
  {/snippet}
</Modal>
```

- [ ] **Step 3: Remove the handleBackdrop function**

Delete the `handleBackdrop` function from the script block (Modal handles backdrop clicks).

- [ ] **Step 4: Replace the `<style>` block**

Remove all backdrop, editor-modal, editor-header, editor-body, and back-btn styles. Keep only the content styles:

```css
<style>
  .error-bar {
    background: rgba(217, 85, 85, 0.12);
    border: 1px solid rgba(217, 85, 85, 0.3);
    color: var(--red);
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-sm);
    font-size: var(--text-sm);
  }

  .name-input {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    padding: var(--space-2) var(--space-3);
    color: var(--text);
    font-size: var(--text-sm);
    font-family: var(--font-body);
    outline: none;
    transition: border-color var(--duration-normal) var(--ease-in-out);
    width: 100%;
  }

  .name-input:focus {
    border-color: var(--brand);
  }

  .drop-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--space-3);
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
  }

  .cancel-btn {
    font-family: var(--font-body);
    font-size: var(--text-xs);
    font-weight: 500;
    background: transparent;
    color: var(--text-muted);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: var(--space-1) var(--space-3);
    min-height: 28px;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    transition: all var(--duration-normal) var(--ease-in-out);
  }

  .cancel-btn:hover {
    background: var(--bg-raised);
    color: var(--text);
    border-color: var(--border-active);
  }

  .save-btn {
    font-family: var(--font-body);
    font-size: var(--text-xs);
    font-weight: 500;
    background: var(--brand);
    color: #fff;
    border: none;
    border-radius: var(--radius-sm);
    padding: var(--space-1) var(--space-3);
    min-height: 28px;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    transition: all var(--duration-normal) var(--ease-in-out);
  }

  .save-btn:hover:not(:disabled) {
    background: var(--brand-hover);
  }

  .save-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
```

- [ ] **Step 5: Verify**

Run: `npm run dev`
Open Avatar modal > click "Add New" or edit an existing set. Verify the editor opens as a proper modal with the title in the header, content scrolls properly, and action buttons are correctly sized.

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/lib/AvatarSetEditor.svelte
git commit -m "refactor: use Modal.svelte in AvatarSetEditor, align to design system"
```

---

### Task 9: Fix AvatarTab.svelte

**Files:**
- Modify: `packages/web/src/lib/AvatarTab.svelte`

- [ ] **Step 1: Replace the `<style>` block**

```css
<style>
  section h3 {
    font-size: var(--text-xs);
    font-weight: 600;
    font-family: var(--font-heading);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-faint);
    margin-bottom: var(--space-3);
  }

  .muted {
    color: var(--text-muted);
    font-size: var(--text-sm);
  }

  .error-bar {
    background: rgba(217, 85, 85, 0.12);
    border: 1px solid rgba(217, 85, 85, 0.3);
    color: var(--red);
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-sm);
    font-size: var(--text-sm);
  }

  /* --- Set grid --- */

  .set-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
    gap: var(--space-2);
    max-height: 320px;
    overflow-y: auto;
  }

  .set-card {
    position: relative;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    padding: var(--space-2);
    cursor: pointer;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-1);
    transition: border-color var(--duration-normal), background var(--duration-normal);
    text-align: center;
  }

  .set-card:hover {
    border-color: var(--text-muted);
    background: var(--bg-card);
  }

  .set-card.active {
    border-color: var(--brand);
    box-shadow: 0 0 0 1px rgba(193, 95, 60, 0.15);
  }

  .set-thumb {
    width: 100%;
    aspect-ratio: 1;
    border-radius: var(--radius-xs);
    overflow: hidden;
    background: var(--border);
  }

  .set-thumb video {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .no-thumb {
    width: 100%;
    height: 100%;
    background: var(--border);
  }

  .set-name {
    font-size: var(--text-xs);
    font-weight: 500;
    color: var(--text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 100%;
  }

  .active-badge {
    font-size: 10px;
    font-weight: 600;
    color: var(--blue);
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  /* --- Add card --- */

  .add-card {
    border-style: dashed;
    justify-content: center;
    min-height: 100px;
  }

  .add-card:hover {
    border-color: var(--brand);
    color: var(--brand);
    background: rgba(193, 95, 60, 0.06);
  }

  .add-icon {
    font-size: 28px;
    color: var(--text-muted);
    line-height: 1;
  }

  .add-card:hover .add-icon {
    color: var(--brand);
  }

  /* --- Hover action buttons --- */

  .card-actions {
    position: absolute;
    top: var(--space-1);
    right: var(--space-1);
    display: flex;
    flex-direction: column;
    gap: 2px;
    opacity: 0;
    transition: opacity var(--duration-normal);
  }

  .set-card:hover .card-actions {
    opacity: 1;
  }

  .action-btn {
    background: rgba(0, 0, 0, 0.55);
    border: none;
    color: var(--text-muted);
    width: 22px;
    height: 22px;
    border-radius: var(--radius-xs);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: color var(--duration-normal), background var(--duration-normal);
  }

  .action-btn svg {
    width: 13px;
    height: 13px;
  }

  .delete-action:hover {
    color: var(--red);
    background: rgba(217, 85, 85, 0.25);
  }

  .edit-action:hover {
    color: var(--blue);
    background: rgba(91, 143, 217, 0.2);
  }
</style>
```

Key changes: Section label aligned (text-xs, 600, 0.08em, text-faint), error bar uses `var(--red)`, all spacing uses tokens, border-radius uses token names.

- [ ] **Step 2: Verify**

Run: `npm run dev`
Open Avatar modal. Verify grid layout, section label, card styling, hover actions all look correct.

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/lib/AvatarTab.svelte
git commit -m "fix: align AvatarTab to design system tokens"
```

---

### Task 10: Fix DropZone.svelte

**Files:**
- Modify: `packages/web/src/lib/DropZone.svelte`

- [ ] **Step 1: Replace the `<style>` block**

```css
<style>
  .dropzone {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
    border: 1px dashed var(--border);
    border-radius: var(--radius-md);
    padding: var(--space-2);
    cursor: pointer;
    transition: border-color var(--duration-normal) var(--ease-in-out),
                background var(--duration-normal) var(--ease-in-out);
    aspect-ratio: 1;
    overflow: hidden;
  }

  .dropzone:hover,
  .dropzone.dragging {
    border-color: var(--brand);
    background: rgba(193, 95, 60, 0.06);
  }

  .dropzone.filled {
    border-style: solid;
    border-color: var(--border);
  }

  .dropzone.filled:hover {
    border-color: var(--brand);
  }

  .file-input {
    display: none;
  }

  .preview {
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: var(--radius-xs);
    position: absolute;
    inset: 0;
  }

  .replace-hint {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.6);
    color: var(--text);
    font-size: var(--text-xs);
    font-weight: 500;
    border-radius: 7px;
    opacity: 0;
    transition: opacity var(--duration-normal) var(--ease-in-out);
  }

  .dropzone:hover .replace-hint {
    opacity: 1;
  }

  .empty {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .plus {
    font-size: 24px;
    color: var(--text-muted);
    line-height: 1;
  }

  .label {
    font-size: var(--text-xs);
    font-weight: 500;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.03em;
    position: relative;
    z-index: 1;
  }

  .dropzone.filled .label {
    position: absolute;
    bottom: var(--space-2);
    background: rgba(0, 0, 0, 0.6);
    padding: 2px var(--space-2);
    border-radius: var(--radius-xs);
  }
</style>
```

Key changes: gap `6px` -> `var(--space-2)`, padding `8px` -> `var(--space-2)`, font sizes use tokens, border-radius uses tokens, `3px` -> `var(--radius-xs)`.

- [ ] **Step 2: Commit**

```bash
git add packages/web/src/lib/DropZone.svelte
git commit -m "fix: align DropZone to design system tokens"
```

---

### Task 11: Fix SpawnPopover.svelte

**Files:**
- Modify: `packages/web/src/lib/SpawnPopover.svelte`

- [ ] **Step 1: Replace the `<style>` block**

```css
<style>
  .empty {
    text-align: center;
    font-size: var(--text-sm);
    color: var(--text-muted);
    padding: var(--space-2) 0;
  }

  .project-list {
    display: flex;
    flex-direction: column;
    margin: calc(-1 * var(--space-1)) calc(-1 * var(--space-2));
    max-height: 340px;
    overflow-y: auto;
  }

  .project-row {
    display: flex;
    align-items: center;
    border-radius: var(--radius-md);
    transition: background var(--duration-fast);
  }

  .project-row:hover {
    background: var(--bg-raised);
  }

  .project-item {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex: 1;
    min-width: 0;
    padding: var(--space-3);
    border: none;
    background: none;
    text-align: left;
    cursor: pointer;
    font-family: var(--font-body);
  }

  .project-item:disabled {
    opacity: 0.5;
    cursor: wait;
  }

  .remove-btn {
    flex-shrink: 0;
    border: none;
    background: none;
    color: var(--text-muted);
    font-size: var(--text-base);
    padding: var(--space-1) var(--space-3);
    cursor: pointer;
    opacity: 0;
    transition: opacity var(--duration-fast), color var(--duration-fast);
  }

  .project-row:hover .remove-btn {
    opacity: 1;
  }

  .remove-btn:hover {
    color: var(--amber);
  }

  .project-name {
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--text);
  }

  .project-path {
    font-size: var(--text-xs);
    font-family: var(--font-mono);
    color: var(--text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .browse-btn {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    padding: var(--space-3);
    border: 1px dashed var(--border);
    border-radius: var(--radius-md);
    background: none;
    font-family: var(--font-body);
    font-size: var(--text-sm);
    color: var(--text-muted);
    cursor: pointer;
    transition: all var(--duration-normal);
  }

  .browse-btn:hover {
    border-color: var(--brand);
    color: var(--brand);
    background: rgba(193, 95, 60, 0.06);
  }

  .browse-btn.cancel {
    border-color: var(--amber);
    color: var(--amber);
    border-style: solid;
  }

  .browse-btn.cancel:hover {
    background: rgba(245, 158, 11, 0.06);
  }
</style>
```

Key changes: All `13px`/`11px` -> proper tokens, padding/gap use space tokens, border-radius uses tokens.

- [ ] **Step 2: Commit**

```bash
git add packages/web/src/lib/SpawnPopover.svelte
git commit -m "fix: align SpawnPopover to design system tokens"
```

---

### Task 12: Fix SessionCard.svelte

**Files:**
- Modify: `packages/web/src/lib/SessionCard.svelte`

This file is large. Only the `<style>` block needs changes — replace raw values with tokens.

- [ ] **Step 1: Read the current style block and make targeted replacements**

The following replacements need to be made in the `<style>` block:

| Find | Replace |
|------|---------|
| `border-radius: 12px` (card) | `border-radius: var(--radius-lg)` |
| `padding: 12px 16px` | `padding: var(--space-3) var(--space-4)` |
| `margin-top: 4px` | `margin-top: var(--space-1)` |
| `font-size: 0.9375rem` | `font-size: var(--text-base)` |
| `font-size: 0.75rem` (all occurrences) | `font-size: var(--text-xs)` |
| `font-size: 0.6875rem` (all occurrences) | `font-size: var(--text-xs)` |
| `font-size: 12px` | `font-size: var(--text-xs)` |
| `border-radius: 6px` | `border-radius: var(--radius-sm)` |
| `border-radius: 8px` | `border-radius: var(--radius-md)` |
| `border-radius: 4px` | `border-radius: var(--radius-xs)` |
| `padding: 8px 12px` | `padding: var(--space-2) var(--space-3)` |
| `padding: 2px` | `padding: 2px` (keep — it's a micro inset for icon buttons) |
| `gap: 8px` (if any raw) | `gap: var(--space-2)` |

Apply each replacement in the style block. Do NOT change the template or script.

- [ ] **Step 2: Verify**

Run: `npm run dev`
Check session cards render correctly — state dots, titles, detail text, dropdown all look right.

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/lib/SessionCard.svelte
git commit -m "fix: align SessionCard to design system tokens"
```

---

### Task 13: Fix SessionList.svelte

**Files:**
- Modify: `packages/web/src/lib/SessionList.svelte`

- [ ] **Step 1: Make targeted replacements in the `<style>` block**

| Find | Replace |
|------|---------|
| `font-size: 0.75rem` | `font-size: var(--text-xs)` |
| `font-size: 0.625rem` | `font-size: var(--text-xs)` (smallest token — don't go below) |
| `gap: 8px` (raw) | `gap: var(--space-2)` |
| `border-radius: 12px` | `border-radius: var(--radius-lg)` |
| `border-radius: 6px` | `border-radius: var(--radius-sm)` |

- [ ] **Step 2: Commit**

```bash
git add packages/web/src/lib/SessionList.svelte
git commit -m "fix: align SessionList to design system tokens"
```

---

### Task 14: Fix UsageRings.svelte

**Files:**
- Modify: `packages/web/src/lib/UsageRings.svelte`

- [ ] **Step 1: Make targeted replacements in the `<style>` block**

| Find | Replace |
|------|---------|
| `gap: 14px` | `gap: var(--space-3)` |
| `gap: 5px` | `gap: var(--space-1)` |
| `font-size: 0.5625rem` | `font-size: 0.5625rem` (keep — this is intentionally tiny for ring labels inside SVG) |
| `font-size: 0.625rem` | `font-size: 0.625rem` (keep — same reason, ring captions) |

Note: UsageRings uses sub-token sizes for a reason — the ring labels need to fit inside small SVG circles. Only fix the spacing tokens.

- [ ] **Step 2: Commit**

```bash
git add packages/web/src/lib/UsageRings.svelte
git commit -m "fix: align UsageRings spacing to design system tokens"
```

---

### Task 15: Fix StatusBar.svelte

**Files:**
- Modify: `packages/web/src/lib/StatusBar.svelte`

- [ ] **Step 1: Make targeted replacements in the `<style>` block**

| Find | Replace |
|------|---------|
| `font-size: 0.8125rem` | `font-size: var(--text-sm)` |
| `font-size: 0.75rem` | `font-size: var(--text-xs)` |
| `padding: 10px 16px` | `padding: var(--space-3) var(--space-4)` |

- [ ] **Step 2: Commit**

```bash
git add packages/web/src/lib/StatusBar.svelte
git commit -m "fix: align StatusBar to design system tokens"
```

---

### Task 16: Final visual verification

- [ ] **Step 1: Run the app**

Run: `npm run dev`

- [ ] **Step 2: Check every screen**

Walk through each view and verify:
1. Dashboard (main page) — should be unchanged
2. Settings modal — section labels, toggles, slider, hook buttons
3. Avatar modal — grid, cards, add button, hover actions
4. Avatar editor (create/edit) — opens as proper Modal, input, dropzones, action buttons
5. Spawn popover (new session) — project list, browse button
6. Consent modal — gate layout, breathing room, button sizes
7. Confirm dialogs — trigger via hook remove, avatar delete
8. Hook gate — remove hooks, reload page to see gate screen
9. Session cards — all states (idle, busy, pending)
10. Status bar — text sizing, padding
11. Usage rings — if enabled, verify spacing

- [ ] **Step 3: Run lint**

Run: `npm run lint`
Fix any issues.

- [ ] **Step 4: Build**

Run: `npm run build`
Ensure no build errors.

- [ ] **Step 5: Final commit if any lint fixes were needed**

```bash
git add -A
git commit -m "fix: lint fixes after design system repair"
```
