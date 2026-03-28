# Settings Modal UX Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the settings modal into a two-tab layout (Config/Avatar) with a stacked Avatar Set Editor modal supporting drag & drop create/edit, and enforce all-3-videos-required constraint at the server level.

**Architecture:** The settings modal becomes a tab container. Config tab holds simple toggles/sliders. Avatar tab shows a set grid with hover actions. A separate stacked AvatarSetEditor modal handles create/edit with 3 DropZone components. Server gets an `updateSet()` function and corresponding PUT endpoint, plus stricter validation requiring all 3 videos on create.

**Tech Stack:** Svelte 5 (runes), Express 5, Vitest, ES modules

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `packages/server/src/avatar-storage.js` | Modify | Add `updateSet()`, enforce 3-file requirement in `createSet()` |
| `packages/server/src/avatar-storage.test.js` | Modify | Tests for `updateSet()` and 3-file requirement |
| `packages/server/src/routes-api.js` | Modify | Add `PUT /api/avatars/sets/:name` endpoint |
| `packages/server/src/routes-api.test.js` | Modify | Tests for PUT endpoint |
| `packages/web/src/lib/SettingsModal.svelte` | Rewrite | Tab container with Config/Avatar tabs |
| `packages/web/src/lib/ConfigTab.svelte` | Create | Night mode + SFX controls |
| `packages/web/src/lib/AvatarTab.svelte` | Create | Active preview, set grid, hover actions, add card |
| `packages/web/src/lib/AvatarSetEditor.svelte` | Create | Stacked modal for create/edit with 3 drop zones |
| `packages/web/src/lib/DropZone.svelte` | Create | Single video drag & drop / click-to-browse slot |

## UI System Reference

All new components MUST use the existing design system:

**CSS Variables** (from App.svelte):
- Surfaces: `--bg`, `--bg-card`, `--bg-raised`, `--border`, `--border-active`
- Text: `--text`, `--text-muted`, `--text-faint`
- Brand: `--brand`, `--brand-hover`
- Semantic: `--green`, `--blue`, `--amber`, `--red`, `--gray`
- Fonts: `--font-heading`, `--font-body`, `--font-mono`
- Timing: `--duration-fast` (100ms), `--duration-normal` (150ms), `--duration-slow` (300ms)
- Easing: `--ease-out`, `--ease-in-out`

**Component Patterns**:
- Section headings: `font-size: 12px; font-weight: 600; font-family: var(--font-heading); text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted)`
- Cards: `background: var(--bg-card); border: 1px solid var(--border); border-radius: 8px`
- Hover: `border-color: var(--border-active)` or `var(--text-muted)`
- Active/selected: `border-color: var(--brand); box-shadow: 0 0 0 1px rgba(193, 95, 60, 0.15)`
- Inputs: `background: var(--bg-card); border: 1px solid var(--border); border-radius: 6px; padding: 8px 10px; focus border: var(--blue)`
- Buttons: `background: var(--brand); color: white; border-radius: 6px; hover: var(--brand-hover); disabled: opacity 0.5`
- Dashed interactive: `border: 1px dashed var(--border); hover: border-color var(--brand), color var(--brand), background rgba(193, 95, 60, 0.06)`
- Error bars: `background: rgba(239, 68, 68, 0.12); border: 1px solid rgba(239, 68, 68, 0.3); color: #f87171`
- Transitions: `0.15s` or `var(--duration-normal)` with `ease` or `var(--ease-in-out)`

**Modal** (`Modal.svelte`): z-index 100, max-width 480px, max-height 80vh. Props: `title`, `onclose`, `children` (snippet). Stacked modals need z-index 110.

**Existing Components**: `ToggleSlider.svelte` (props: `checked`, `label`, `onchange`), `Modal.svelte`

---

### Task 1: Server — Enforce 3-file requirement on createSet

**Files:**
- Modify: `packages/server/src/avatar-storage.js:93-121` (createSet function)
- Modify: `packages/server/src/avatar-storage.test.js`

- [ ] **Step 1: Write failing test for 3-file requirement**

Add to `describe("createSet")` block in `packages/server/src/avatar-storage.test.js`:

```javascript
it("rejects sets with fewer than 3 state videos", async () => {
  await expect(
    storage.createSet("partial", [fakeFile("idle.webm"), fakeFile("busy.webm")])
  ).rejects.toThrow("All three videos required: idle, busy, pending");
});

it("rejects sets with only one video", async () => {
  await expect(
    storage.createSet("solo", [fakeFile("idle.webm")])
  ).rejects.toThrow("All three videos required: idle, busy, pending");
});

it("accepts sets with all 3 states in webm", async () => {
  await storage.createSet("full-webm", [
    fakeFile("idle.webm"),
    fakeFile("busy.webm"),
    fakeFile("pending.webm"),
  ]);
  const sets = await storage.listSets();
  expect(sets.find((s) => s.name === "full-webm")).toBeTruthy();
});

it("accepts sets with mixed formats across states", async () => {
  await storage.createSet("mixed", [
    fakeFile("idle.webm"),
    fakeFile("busy.mp4"),
    fakeFile("pending.webm"),
  ]);
  const sets = await storage.listSets();
  expect(sets.find((s) => s.name === "mixed")).toBeTruthy();
});
```

- [ ] **Step 2: Run tests to verify new tests fail**

Run: `npm test -- --reporter=verbose packages/server/src/avatar-storage.test.js`
Expected: "rejects sets with fewer than 3 state videos" and "rejects sets with only one video" FAIL. The "accepts" tests should PASS.

- [ ] **Step 3: Implement 3-file validation in createSet**

In `packages/server/src/avatar-storage.js`, add validation at the start of `createSet()`, after the name validation:

```javascript
async function createSet(name, files) {
  if (!isValidSetName(name)) {
    throw new Error("Invalid set name");
  }

  // Require all three avatar states
  const states = new Set(files.map((f) => f.name.split(".")[0]));
  if (!states.has("idle") || !states.has("busy") || !states.has("pending")) {
    throw new Error("All three videos required: idle, busy, pending");
  }

  const setPath = getSetPath(name);
  // ... rest unchanged
```

- [ ] **Step 4: Fix existing tests that create sets with fewer than 3 files**

Several existing tests in `avatar-storage.test.js` create sets with 1-2 files for convenience. Update them to always provide 3 files. Search for calls like `storage.createSet("name", [fakeFile("idle.webm")])` and add the missing files:

```javascript
// In listSets tests:
await storage.createSet("one", [fakeFile("idle.webm"), fakeFile("busy.webm"), fakeFile("pending.webm")]);
await storage.createSet("two", [fakeFile("idle.mp4"), fakeFile("busy.mp4"), fakeFile("pending.mp4")]);

// In deleteSet tests:
await storage.createSet("to-delete", [fakeFile("idle.webm"), fakeFile("busy.webm"), fakeFile("pending.webm")]);
await storage.createSet("keeper", [fakeFile("idle.webm"), fakeFile("busy.webm"), fakeFile("pending.webm")]);

// In setActiveSet tests:
await storage.createSet("a", [fakeFile("idle.webm"), fakeFile("busy.webm"), fakeFile("pending.webm")]);
await storage.createSet("b", [fakeFile("idle.webm"), fakeFile("busy.webm"), fakeFile("pending.webm")]);

// In ensureDefaults tests:
await storage.createSet("existing", [fakeFile("idle.webm"), fakeFile("busy.webm"), fakeFile("pending.webm")]);
```

- [ ] **Step 5: Run all tests to verify they pass**

Run: `npm test -- --reporter=verbose packages/server/src/avatar-storage.test.js`
Expected: ALL tests PASS

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/avatar-storage.js packages/server/src/avatar-storage.test.js
git commit -m "feat: enforce all 3 videos required on avatar set creation"
```

---

### Task 2: Server — Add updateSet function

**Files:**
- Modify: `packages/server/src/avatar-storage.js`
- Modify: `packages/server/src/avatar-storage.test.js`

- [ ] **Step 1: Write failing tests for updateSet**

Add a new `describe("updateSet")` block in `packages/server/src/avatar-storage.test.js`:

```javascript
describe("updateSet", () => {
  it("replaces a single file in an existing set", async () => {
    await storage.createSet("updatable", [
      fakeFile("idle.webm"),
      fakeFile("busy.webm"),
      fakeFile("pending.webm"),
    ]);

    const newIdle = fakeFile("idle.webm", 200);
    await storage.updateSet("updatable", { files: [newIdle] });

    const setPath = storage.getSetPath("updatable");
    const stat = await fs.stat(path.join(setPath, "idle.webm"));
    expect(stat.size).toBe(200);
  });

  it("renames a set", async () => {
    await storage.createSet("old-name", [
      fakeFile("idle.webm"),
      fakeFile("busy.webm"),
      fakeFile("pending.webm"),
    ]);

    await storage.updateSet("old-name", { rename: "new-name" });

    const sets = await storage.listSets();
    expect(sets.find((s) => s.name === "old-name")).toBeUndefined();
    expect(sets.find((s) => s.name === "new-name")).toBeTruthy();
  });

  it("renames and replaces files simultaneously", async () => {
    await storage.createSet("combo", [
      fakeFile("idle.webm"),
      fakeFile("busy.webm"),
      fakeFile("pending.webm"),
    ]);

    await storage.updateSet("combo", {
      rename: "combo-v2",
      files: [fakeFile("busy.mp4", 300)],
    });

    const sets = await storage.listSets();
    const set = sets.find((s) => s.name === "combo-v2");
    expect(set).toBeTruthy();
    expect(set.files).toContain("busy.mp4");
  });

  it("throws for non-existent set", async () => {
    await expect(
      storage.updateSet("ghost", { files: [fakeFile("idle.webm")] })
    ).rejects.toThrow("Set not found");
  });

  it("throws for invalid rename target", async () => {
    await storage.createSet("valid", [
      fakeFile("idle.webm"),
      fakeFile("busy.webm"),
      fakeFile("pending.webm"),
    ]);

    await expect(
      storage.updateSet("valid", { rename: "../escape" })
    ).rejects.toThrow("Invalid set name");
  });

  it("throws if rename target already exists", async () => {
    await storage.createSet("src", [
      fakeFile("idle.webm"),
      fakeFile("busy.webm"),
      fakeFile("pending.webm"),
    ]);
    await storage.createSet("dst", [
      fakeFile("idle.webm"),
      fakeFile("busy.webm"),
      fakeFile("pending.webm"),
    ]);

    await expect(
      storage.updateSet("src", { rename: "dst" })
    ).rejects.toThrow("Set already exists");
  });

  it("updates active set config when renaming the active set", async () => {
    await storage.createSet("active-rename", [
      fakeFile("idle.webm"),
      fakeFile("busy.webm"),
      fakeFile("pending.webm"),
    ]);
    await storage.setActiveSet("active-rename");

    await storage.updateSet("active-rename", { rename: "renamed-active" });

    expect(await storage.getActiveSet()).toBe("renamed-active");
  });

  it("validates replacement files (magic bytes, size)", async () => {
    await storage.createSet("validate-me", [
      fakeFile("idle.webm"),
      fakeFile("busy.webm"),
      fakeFile("pending.webm"),
    ]);

    const badContent = { name: "idle.webm", data: Buffer.alloc(100, 0x00) };
    await expect(
      storage.updateSet("validate-me", { files: [badContent] })
    ).rejects.toThrow("Invalid file content");
  });

  it("removes old format file when replacing with different format", async () => {
    await storage.createSet("format-swap", [
      fakeFile("idle.webm"),
      fakeFile("busy.webm"),
      fakeFile("pending.webm"),
    ]);

    await storage.updateSet("format-swap", { files: [fakeFile("idle.mp4", 150)] });

    const setPath = storage.getSetPath("format-swap");
    const files = await fs.readdir(setPath);
    expect(files).toContain("idle.mp4");
    expect(files).not.toContain("idle.webm");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --reporter=verbose packages/server/src/avatar-storage.test.js`
Expected: All `updateSet` tests FAIL with "storage.updateSet is not a function"

- [ ] **Step 3: Implement updateSet**

Add to `packages/server/src/avatar-storage.js`, before the `return` statement in `createAvatarStorage()`:

```javascript
async function updateSet(name, { files = [], rename } = {}) {
  const setPath = getSetPath(name);

  try {
    await fs.access(setPath);
  } catch {
    throw new Error("Set not found");
  }

  // Validate and write replacement files
  for (const file of files) {
    if (!VALID_FILENAMES.has(file.name)) {
      throw new Error(`Invalid filename: ${file.name}`);
    }
    if (file.data.length > MAX_FILE_SIZE) {
      throw new Error(`File too large: ${file.name}`);
    }
    if (!hasValidMagicBytes(file.data, file.name)) {
      throw new Error(`Invalid file content: ${file.name}`);
    }

    // Remove opposite format if swapping (e.g., idle.webm -> idle.mp4)
    const state = file.name.split(".")[0];
    const otherExt = file.name.endsWith(".webm") ? ".mp4" : ".webm";
    const otherFile = path.join(setPath, `${state}${otherExt}`);
    await fs.rm(otherFile, { force: true });

    await fs.writeFile(path.join(setPath, file.name), file.data);
  }

  // Handle rename
  if (rename) {
    if (!isValidSetName(rename)) {
      throw new Error("Invalid set name");
    }
    if (rename !== name) {
      const newPath = getSetPath(rename);
      try {
        await fs.access(newPath);
        throw new Error("Set already exists");
      } catch (err) {
        if (err.message === "Set already exists") throw err;
      }
      await fs.rename(setPath, newPath);

      // Update active set config if this was the active set
      const activeSet = await getActiveSet();
      if (activeSet === name) {
        await setConfig({ activeSet: rename });
      }
    }
  }
}
```

Add `updateSet` to the return object:

```javascript
return {
  getConfig,
  setConfig,
  getActiveSet,
  getActiveSetPath,
  listSets,
  getSetPath,
  createSet,
  updateSet,
  deleteSet,
  setActiveSet,
  ensureDefaults,
  ensureDirs,
};
```

And to the default singleton exports at the bottom:

```javascript
export const {
  getConfig,
  setConfig,
  getActiveSet,
  getActiveSetPath,
  listSets,
  getSetPath,
  createSet,
  updateSet,
  deleteSet,
  setActiveSet,
  ensureDefaults,
  ensureDirs,
} = defaultStorage;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --reporter=verbose packages/server/src/avatar-storage.test.js`
Expected: ALL tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/avatar-storage.js packages/server/src/avatar-storage.test.js
git commit -m "feat: add updateSet for replacing files and renaming avatar sets"
```

---

### Task 3: Server — Add PUT endpoint for updating sets

**Files:**
- Modify: `packages/server/src/routes-api.js`
- Modify: `packages/server/src/routes-api.test.js`

- [ ] **Step 1: Write failing tests for PUT endpoint**

Add to `packages/server/src/routes-api.test.js`. First, add `updateSet` to the mock and import:

In the `vi.mock("./avatar-storage.js")` block, add `updateSet: vi.fn()`:

```javascript
vi.mock("./avatar-storage.js", () => ({
  getActiveSetPath: vi.fn().mockResolvedValue("/tmp/avatars"),
  listSets: vi.fn(),
  getActiveSet: vi.fn(),
  createSet: vi.fn(),
  updateSet: vi.fn(),
  deleteSet: vi.fn(),
  setActiveSet: vi.fn(),
  isValidSetName: vi.fn((n) => /^[a-z0-9-]+$/.test(n)),
  getSetPath: vi.fn((n) => `/tmp/avatars/${n}`),
  VALID_FILENAMES: new Set(["idle.webm", "idle.mp4", "busy.webm", "busy.mp4", "pending.webm", "pending.mp4"]),
}));
```

Add `updateSet` to the import:

```javascript
import { listSets, getActiveSet, setActiveSet, deleteSet, updateSet } from "./avatar-storage.js";
```

Then add the test block:

```javascript
describe("PUT /api/avatars/sets/:name", () => {
  it("returns 400 for invalid set name", async () => {
    const res = await request(server, "PUT", "/api/avatars/sets/INVALID_NAME!");
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Invalid set name" });
  });

  it("returns 400 if no fields provided", async () => {
    const res = await request(server, "PUT", "/api/avatars/sets/test-set", {});
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "No changes provided" });
  });

  it("renames set via JSON body", async () => {
    updateSet.mockResolvedValue(undefined);

    const res = await request(server, "PUT", "/api/avatars/sets/old-name", {
      rename: "new-name",
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, name: "new-name" });
    expect(updateSet).toHaveBeenCalledWith("old-name", { rename: "new-name", files: [] });
  });

  it("returns error status on updateSet failure", async () => {
    updateSet.mockRejectedValue(new Error("Set not found"));

    const res = await request(server, "PUT", "/api/avatars/sets/ghost", {
      rename: "new-name",
    });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Set not found" });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --reporter=verbose packages/server/src/routes-api.test.js`
Expected: PUT tests FAIL with 404 (no route matched)

- [ ] **Step 3: Implement PUT endpoint**

In `packages/server/src/routes-api.js`, add `updateSet` to the import:

```javascript
import {
  getActiveSetPath,
  listSets,
  getActiveSet,
  createSet,
  updateSet,
  deleteSet,
  setActiveSet,
  isValidSetName,
  getSetPath,
  VALID_FILENAMES,
} from "./avatar-storage.js";
```

Add the PUT route after the POST route for `/api/avatars/sets/:name`:

```javascript
app.put("/api/avatars/sets/:name", async (req, res) => {
  const { name } = req.params;
  if (!isValidSetName(name)) {
    return res.status(400).json({ error: "Invalid set name" });
  }

  const contentType = req.headers["content-type"] || "";
  let files = [];
  let rename;

  if (contentType.startsWith("multipart/form-data")) {
    const parsed = await parseMultipart(req);
    files = parsed.filter((f) => VALID_FILENAMES.has(f.name));
    // Extract rename from text fields if present
    const renameField = parsed.find((f) => f.name === "rename");
    if (renameField) rename = renameField.data.toString().trim();
  } else {
    // JSON body for rename-only
    rename = req.body?.rename;
  }

  if (!rename && files.length === 0) {
    return res.status(400).json({ error: "No changes provided" });
  }

  try {
    await updateSet(name, { rename, files });
    res.json({ ok: true, name: rename || name });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --reporter=verbose packages/server/src/routes-api.test.js`
Expected: ALL tests PASS

- [ ] **Step 5: Run full test suite**

Run: `npm test`
Expected: ALL tests PASS

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/routes-api.js packages/server/src/routes-api.test.js
git commit -m "feat: add PUT /api/avatars/sets/:name for updating and renaming sets"
```

---

### Task 4: Frontend — DropZone component

**Files:**
- Create: `packages/web/src/lib/DropZone.svelte`

- [ ] **Step 1: Create DropZone component**

This component handles a single video slot with drag & drop and click-to-browse.

Create `packages/web/src/lib/DropZone.svelte`:

```svelte
<script>
  let { label, file = null, previewUrl = null, onfile } = $props();

  let dragging = $state(false);
  let inputEl;

  function handleDrop(e) {
    e.preventDefault();
    dragging = false;
    const dropped = e.dataTransfer?.files[0];
    if (dropped && isVideoFile(dropped)) onfile?.(dropped);
  }

  function handleDragOver(e) {
    e.preventDefault();
    dragging = true;
  }

  function handleDragLeave() {
    dragging = false;
  }

  function handleFileInput(e) {
    const selected = e.target.files[0];
    if (selected) onfile?.(selected);
    e.target.value = "";
  }

  function isVideoFile(f) {
    return f.name.endsWith(".webm") || f.name.endsWith(".mp4");
  }

  function handleClick() {
    inputEl?.click();
  }

  let displayUrl = $derived(file ? URL.createObjectURL(file) : previewUrl);
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="dropzone"
  class:dragging
  class:filled={!!displayUrl}
  ondrop={handleDrop}
  ondragover={handleDragOver}
  ondragleave={handleDragLeave}
  onclick={handleClick}
  onkeydown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleClick(); } }}
  role="button"
  tabindex="0"
>
  <input
    bind:this={inputEl}
    type="file"
    accept=".webm,.mp4"
    onchange={handleFileInput}
    class="file-input"
  />

  {#if displayUrl}
    <!-- svelte-ignore a11y_media_has_caption -->
    <video
      src={displayUrl}
      preload="auto"
      muted
      playsinline
      onloadeddata={(e) => { e.target.currentTime = 0.1; e.target.pause(); }}
      class="preview"
    ></video>
    <span class="replace-hint">Replace</span>
  {:else}
    <div class="empty">
      <span class="plus">+</span>
    </div>
  {/if}

  <span class="label">{label}</span>
</div>

<style>
  .dropzone {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    border: 1px dashed var(--border);
    border-radius: 8px;
    padding: 8px;
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
    border-radius: 4px;
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
    font-size: 12px;
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
    font-size: 11px;
    font-weight: 500;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.03em;
    position: relative;
    z-index: 1;
  }

  .dropzone.filled .label {
    position: absolute;
    bottom: 6px;
    background: rgba(0, 0, 0, 0.6);
    padding: 2px 6px;
    border-radius: 3px;
  }
</style>
```

- [ ] **Step 2: Verify it builds**

Run: `npm run build`
Expected: Build succeeds with no errors

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/lib/DropZone.svelte
git commit -m "feat: add DropZone component for video drag & drop"
```

---

### Task 5: Frontend — AvatarSetEditor modal

**Files:**
- Create: `packages/web/src/lib/AvatarSetEditor.svelte`

- [ ] **Step 1: Create AvatarSetEditor component**

Create `packages/web/src/lib/AvatarSetEditor.svelte`:

```svelte
<script>
  import DropZone from "./DropZone.svelte";

  let { mode = "create", set = null, onclose, onsave } = $props();

  let name = $state(mode === "edit" ? set?.name ?? "" : "");
  let fileIdle = $state(null);
  let fileBusy = $state(null);
  let filePending = $state(null);
  let error = $state("");
  let saving = $state(false);

  // In edit mode, build preview URLs from existing set files
  function existingUrl(state) {
    if (mode !== "edit" || !set) return null;
    const file = set.files.find((f) => f.startsWith(state));
    if (!file) return null;
    return `/api/avatars/sets/${encodeURIComponent(set.name)}/file/${file}`;
  }

  let canSave = $derived(
    mode === "create"
      ? name.trim() && fileIdle && fileBusy && filePending
      : name.trim() && (
          name.trim() !== set?.name ||
          fileIdle || fileBusy || filePending
        )
  );

  let title = $derived(mode === "edit" ? `Edit "${set?.name}"` : "New Avatar Set");

  async function handleSave() {
    if (!canSave || saving) return;
    saving = true;
    error = "";

    try {
      if (mode === "create") {
        const form = new FormData();
        form.append("idle", fileIdle, `idle${ext(fileIdle)}`);
        form.append("busy", fileBusy, `busy${ext(fileBusy)}`);
        form.append("pending", filePending, `pending${ext(filePending)}`);

        const res = await fetch(`/api/avatars/sets/${encodeURIComponent(name.trim())}`, {
          method: "POST",
          body: form,
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Upload failed");
        }
      } else {
        // Edit mode — send only changes
        const hasFiles = fileIdle || fileBusy || filePending;
        const renamed = name.trim() !== set.name;

        if (hasFiles) {
          const form = new FormData();
          if (fileIdle) form.append("idle", fileIdle, `idle${ext(fileIdle)}`);
          if (fileBusy) form.append("busy", fileBusy, `busy${ext(fileBusy)}`);
          if (filePending) form.append("pending", filePending, `pending${ext(filePending)}`);
          if (renamed) form.append("rename", name.trim());

          const res = await fetch(`/api/avatars/sets/${encodeURIComponent(set.name)}`, {
            method: "PUT",
            body: form,
          });
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.error || "Update failed");
          }
        } else if (renamed) {
          const res = await fetch(`/api/avatars/sets/${encodeURIComponent(set.name)}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ rename: name.trim() }),
          });
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.error || "Rename failed");
          }
        }
      }

      onsave?.();
    } catch (err) {
      error = err.message;
    }
    saving = false;
  }

  function ext(file) {
    return file.name.endsWith(".mp4") ? ".mp4" : ".webm";
  }

  function handleBackdrop(e) {
    if (e.target === e.currentTarget) onclose();
  }

  function handleKeydown(e) {
    if (e.key === "Escape") {
      e.stopPropagation();
      onclose();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<!-- svelte-ignore a11y_interactive_supports_focus -->
<div class="backdrop" onclick={handleBackdrop} onkeydown={() => {}} role="dialog" aria-modal="true" aria-label={title}>
  <div class="editor-modal">
    <div class="editor-header">
      <button class="back-btn" onclick={onclose} aria-label="Back">&larr;</button>
      <h2>{title}</h2>
    </div>

    <div class="editor-body">
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
    </div>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 110;
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

  .editor-modal {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 16px;
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

  .editor-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 16px 20px;
    border-bottom: 1px solid var(--border);
  }

  .editor-header h2 {
    font-size: 16px;
    font-weight: 600;
    font-family: var(--font-heading);
  }

  .back-btn {
    background: none;
    border: none;
    color: var(--text-muted);
    font-size: 18px;
    cursor: pointer;
    padding: 0 4px;
    line-height: 1;
    transition: color 0.15s;
  }

  .back-btn:hover {
    color: var(--text);
  }

  .editor-body {
    padding: 20px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .error-bar {
    background: rgba(239, 68, 68, 0.12);
    border: 1px solid rgba(239, 68, 68, 0.3);
    color: #f87171;
    padding: 8px 12px;
    border-radius: 6px;
    font-size: 13px;
  }

  .name-input {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 8px 10px;
    color: var(--text);
    font-size: 13px;
    font-family: var(--font-body);
    outline: none;
    transition: border-color 0.15s;
  }

  .name-input:focus {
    border-color: var(--blue);
  }

  .drop-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }

  .cancel-btn {
    background: none;
    color: var(--text-muted);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 7px 16px;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: color 0.15s, border-color 0.15s;
  }

  .cancel-btn:hover {
    color: var(--text);
    border-color: var(--border-active);
  }

  .save-btn {
    background: var(--brand);
    color: white;
    border: none;
    border-radius: 6px;
    padding: 7px 16px;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.15s;
  }

  .save-btn:hover {
    background: var(--brand-hover);
  }

  .save-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
```

- [ ] **Step 2: Verify it builds**

Run: `npm run build`
Expected: Build succeeds with no errors

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/lib/AvatarSetEditor.svelte
git commit -m "feat: add AvatarSetEditor modal for create and edit flows"
```

---

### Task 6: Frontend — ConfigTab component

**Files:**
- Create: `packages/web/src/lib/ConfigTab.svelte`

- [ ] **Step 1: Create ConfigTab component**

Extract the appearance and SFX sections from the current `SettingsModal.svelte` into their own component.

Create `packages/web/src/lib/ConfigTab.svelte`:

```svelte
<script>
  import ToggleSlider from "./ToggleSlider.svelte";

  let { nightMode = true, onnightmodechange, sfx } = $props();

  let sfxVolume = $state(0.5);

  $effect(() => {
    if (sfx) {
      sfxVolume = sfx.muted ? 0 : sfx.volume;
    }
  });
</script>

<section>
  <h3>Appearance</h3>
  <ToggleSlider label="Night mode" checked={nightMode} onchange={onnightmodechange} />
</section>

<section>
  <h3>Sound Effects</h3>
  <div class="sfx-controls">
    <label class="sfx-volume">
      <span>{sfxVolume === 0 ? "Off" : `${Math.round(sfxVolume * 100)}%`}</span>
      <input
        type="range"
        min="0"
        max="1"
        step="0.05"
        value={sfxVolume}
        oninput={(e) => {
          sfxVolume = +e.target.value;
        }}
        onchange={(e) => {
          sfxVolume = +e.target.value;
          sfx.volume = sfxVolume || 0.01;
          sfx.muted = sfxVolume === 0;
          if (sfxVolume > 0) sfx.preview("pending");
        }}
      />
    </label>
  </div>
</section>

<style>
  section h3 {
    font-size: 12px;
    font-weight: 600;
    font-family: var(--font-heading);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-muted);
    margin-bottom: 12px;
  }

  .sfx-controls {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .sfx-volume {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 12px;
    color: var(--text-muted);
  }

  .sfx-volume span {
    min-width: 32px;
    text-align: right;
  }

  .sfx-volume input[type="range"] {
    flex: 1;
    accent-color: var(--brand);
    height: 4px;
  }
</style>
```

- [ ] **Step 2: Verify it builds**

Run: `npm run build`
Expected: Build succeeds with no errors

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/lib/ConfigTab.svelte
git commit -m "feat: add ConfigTab component for appearance and SFX settings"
```

---

### Task 7: Frontend — AvatarTab component

**Files:**
- Create: `packages/web/src/lib/AvatarTab.svelte`

- [ ] **Step 1: Create AvatarTab component**

This is the main avatar management view with active preview, set grid, hover actions, and add card.

Create `packages/web/src/lib/AvatarTab.svelte`:

```svelte
<script>
  import AvatarSetEditor from "./AvatarSetEditor.svelte";

  let { onavatarchange } = $props();

  let sets = $state([]);
  let loading = $state(true);
  let error = $state("");
  let confirmDelete = $state(null);
  let editorMode = $state(null);
  let editorSet = $state(null);

  $effect(() => {
    fetchSets();
  });

  async function fetchSets() {
    loading = true;
    error = "";
    try {
      const res = await fetch("/api/avatars/sets");
      const data = await res.json();
      sets = data.sets;
    } catch {
      error = "Failed to load avatar sets";
    }
    loading = false;
  }

  async function switchSet(name) {
    try {
      const res = await fetch("/api/avatars/active", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ set: name }),
      });
      if (!res.ok) throw new Error("Failed to switch");
      sets = sets.map((s) => ({ ...s, active: s.name === name }));
      onavatarchange?.();
    } catch {
      error = "Failed to switch avatar set";
    }
  }

  async function confirmDeleteSet() {
    const name = confirmDelete;
    confirmDelete = null;
    try {
      const res = await fetch(`/api/avatars/sets/${encodeURIComponent(name)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete");
      sets = sets.filter((s) => s.name !== name);
    } catch {
      error = "Failed to delete set";
    }
  }

  function thumbnailUrl(set) {
    const idleFile = set.files.find((f) => f.startsWith("idle"));
    if (!idleFile) return null;
    return `/api/avatars/sets/${encodeURIComponent(set.name)}/file/${idleFile}`;
  }

  function openEditor(mode, set = null) {
    editorMode = mode;
    editorSet = set;
  }

  function closeEditor() {
    editorMode = null;
    editorSet = null;
  }

  async function handleEditorSave() {
    closeEditor();
    await fetchSets();
    onavatarchange?.();
  }

  let activeSet = $derived(sets.find((s) => s.active));
  let activeThumb = $derived(activeSet ? thumbnailUrl(activeSet) : null);
</script>

{#if error}
  <div class="error-bar">{error}</div>
{/if}

{#if confirmDelete}
  <div class="confirm-bar">
    <span>Delete "{confirmDelete}"?</span>
    <div class="confirm-actions">
      <button class="confirm-yes" onclick={confirmDeleteSet}>Delete</button>
      <button class="confirm-no" onclick={() => confirmDelete = null}>Cancel</button>
    </div>
  </div>
{/if}

{#if activeSet}
  <section class="active-preview">
    <h3>Active</h3>
    <div class="active-card">
      <div class="active-thumb">
        {#if activeThumb}
          <!-- svelte-ignore a11y_media_has_caption -->
          <video
            src={activeThumb}
            preload="auto"
            muted
            playsinline
            onloadeddata={(e) => { e.target.currentTime = 0.1; e.target.pause(); }}
          ></video>
        {/if}
      </div>
      <span class="active-name">{activeSet.name}</span>
    </div>
  </section>
{/if}

<section>
  <h3>All Sets</h3>

  {#if loading}
    <p class="muted">Loading...</p>
  {:else}
    <div class="set-grid">
      <div
        class="set-card add-card"
        onclick={() => openEditor("create")}
        onkeydown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openEditor("create"); } }}
        role="button"
        tabindex="0"
      >
        <div class="add-icon">+</div>
        <span class="set-name">Add New</span>
      </div>

      {#each sets as set (set.name)}
        {@const thumb = thumbnailUrl(set)}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="set-card"
          class:active={set.active}
          onclick={() => switchSet(set.name)}
          onkeydown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); switchSet(set.name); } }}
          role="button"
          tabindex="0"
        >
          <div class="set-thumb">
            {#if thumb}
              <!-- svelte-ignore a11y_media_has_caption -->
              <video
                src={thumb}
                preload="auto"
                muted
                playsinline
                onloadeddata={(e) => { e.target.currentTime = 0.1; e.target.pause(); }}
              ></video>
            {:else}
              <div class="no-thumb"></div>
            {/if}
          </div>
          <span class="set-name">{set.name}</span>
          {#if set.active}
            <span class="active-badge">Active</span>
          {/if}

          <div class="card-actions">
            {#if !set.active}
              <button
                class="action-btn delete-action"
                onclick={(e) => { e.stopPropagation(); confirmDelete = set.name; }}
                aria-label="Delete {set.name}"
              >&times;</button>
            {/if}
            <button
              class="action-btn edit-action"
              onclick={(e) => { e.stopPropagation(); openEditor("edit", set); }}
              aria-label="Edit {set.name}"
            >&#9998;</button>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</section>

{#if editorMode}
  <AvatarSetEditor
    mode={editorMode}
    set={editorSet}
    onclose={closeEditor}
    onsave={handleEditorSave}
  />
{/if}

<style>
  section h3 {
    font-size: 12px;
    font-weight: 600;
    font-family: var(--font-heading);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-muted);
    margin-bottom: 12px;
  }

  .muted {
    color: var(--text-muted);
    font-size: 13px;
  }

  .error-bar {
    background: rgba(239, 68, 68, 0.12);
    border: 1px solid rgba(239, 68, 68, 0.3);
    color: #f87171;
    padding: 8px 12px;
    border-radius: 6px;
    font-size: 13px;
  }

  .confirm-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: rgba(239, 68, 68, 0.08);
    border: 1px solid rgba(239, 68, 68, 0.25);
    border-radius: 6px;
    padding: 8px 12px;
    font-size: 13px;
  }

  .confirm-actions {
    display: flex;
    gap: 6px;
  }

  .confirm-yes {
    background: #ef4444;
    color: white;
    border: none;
    border-radius: 4px;
    padding: 4px 10px;
    font-size: 12px;
    cursor: pointer;
  }

  .confirm-yes:hover {
    background: #dc2626;
  }

  .confirm-no {
    background: none;
    color: var(--text-muted);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 4px 10px;
    font-size: 12px;
    cursor: pointer;
  }

  .confirm-no:hover {
    color: var(--text);
  }

  /* --- Active preview --- */

  .active-preview {
    margin-bottom: 4px;
  }

  .active-card {
    display: flex;
    align-items: center;
    gap: 12px;
    background: var(--bg);
    border: 1px solid var(--brand);
    border-radius: 8px;
    padding: 10px;
    box-shadow: 0 0 0 1px rgba(193, 95, 60, 0.15);
  }

  .active-thumb {
    width: 56px;
    height: 56px;
    border-radius: 6px;
    overflow: hidden;
    background: var(--border);
    flex-shrink: 0;
  }

  .active-thumb video {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .active-name {
    font-size: 14px;
    font-weight: 500;
    color: var(--text);
  }

  /* --- Set grid --- */

  .set-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
    gap: 8px;
    max-height: 320px;
    overflow-y: auto;
  }

  .set-card {
    position: relative;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 6px;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    transition: border-color 0.15s, background 0.15s;
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
    border-radius: 4px;
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
    font-size: 11px;
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
    top: 4px;
    right: 4px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    opacity: 0;
    transition: opacity 0.15s;
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
    border-radius: 4px;
    font-size: 13px;
    line-height: 1;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: color 0.15s, background 0.15s;
  }

  .delete-action:hover {
    color: #f87171;
    background: rgba(239, 68, 68, 0.25);
  }

  .edit-action:hover {
    color: var(--blue);
    background: rgba(91, 143, 217, 0.2);
  }
</style>
```

- [ ] **Step 2: Verify it builds**

Run: `npm run build`
Expected: Build succeeds with no errors

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/lib/AvatarTab.svelte
git commit -m "feat: add AvatarTab with set grid, hover actions, and editor integration"
```

---

### Task 8: Frontend — Rewrite SettingsModal with tabs

**Files:**
- Modify: `packages/web/src/lib/SettingsModal.svelte`

- [ ] **Step 1: Rewrite SettingsModal as tab container**

Replace the entire contents of `packages/web/src/lib/SettingsModal.svelte`:

```svelte
<script>
  import Modal from "./Modal.svelte";
  import ConfigTab from "./ConfigTab.svelte";
  import AvatarTab from "./AvatarTab.svelte";

  let { onclose, onavatarchange, sfx, nightMode = true, onnightmodechange } = $props();

  let activeTab = $state("config");
</script>

<Modal title="Settings" {onclose}>
  <div class="tabs">
    <button
      class="tab"
      class:active={activeTab === "config"}
      onclick={() => activeTab = "config"}
    >Config</button>
    <button
      class="tab"
      class:active={activeTab === "avatar"}
      onclick={() => activeTab = "avatar"}
    >Avatar</button>
  </div>

  {#if activeTab === "config"}
    <ConfigTab {nightMode} {onnightmodechange} {sfx} />
  {:else}
    <AvatarTab {onavatarchange} />
  {/if}
</Modal>

<style>
  .tabs {
    display: flex;
    gap: 0;
    border-bottom: 1px solid var(--border);
    margin: -20px -20px 0;
    padding: 0 20px;
  }

  .tab {
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    color: var(--text-muted);
    font-size: 13px;
    font-weight: 500;
    font-family: var(--font-body);
    padding: 10px 16px;
    cursor: pointer;
    transition: color 0.15s, border-color 0.15s;
  }

  .tab:hover {
    color: var(--text);
  }

  .tab.active {
    color: var(--text);
    border-bottom-color: var(--brand);
  }
</style>
```

- [ ] **Step 2: Verify it builds**

Run: `npm run build`
Expected: Build succeeds with no errors

- [ ] **Step 3: Run lint**

Run: `npm run lint`
Expected: No errors (warnings are acceptable)

- [ ] **Step 4: Manual smoke test**

Run: `npm run dev`

Verify in the browser:
1. Settings modal opens with two tabs (Config, Avatar)
2. Config tab shows night mode toggle and SFX slider — both functional
3. Avatar tab shows active set preview, set grid with "+" add card
4. Clicking a set activates it
5. Hovering a set shows delete (top-right) and edit (bottom-right) icons
6. Clicking "+" opens the AvatarSetEditor in create mode
7. Clicking edit icon opens AvatarSetEditor in edit mode with pre-filled videos
8. Drag & drop works on DropZone components
9. Delete confirmation dialog works
10. Create requires all 3 videos + name before enabling button

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/lib/SettingsModal.svelte
git commit -m "feat: rewrite SettingsModal with Config/Avatar tabs"
```

---

### Task 9: Cleanup and final verification

**Files:**
- None — verification only

- [ ] **Step 1: Run full test suite**

Run: `npm test`
Expected: ALL tests PASS

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: No errors

- [ ] **Step 3: Build for production**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 4: Commit any remaining fixes**

If any fixes were needed, commit them:

```bash
git add -A
git commit -m "fix: address lint and test issues from settings modal redesign"
```
