# Avatar Export/Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable users to export avatar sets as `.claudia` files and import them back, for easy sharing.

**Architecture:** Add `adm-zip` dependency to the server. New `exportSet` and `importSet` functions in `avatar-storage.js` handle zip creation/extraction with full validation. Two new API endpoints in `routes-api.js`. Frontend gets an export icon button per card and an import button next to "Add New" in `AvatarTab.svelte`.

**Tech Stack:** adm-zip (zip library), existing Express server, Svelte 5 frontend

---

### Task 1: Add adm-zip dependency

**Files:**
- Modify: `packages/server/package.json`

- [ ] **Step 1: Install adm-zip**

Run: `npm install adm-zip --save -w packages/server`

- [ ] **Step 2: Verify installation**

Run: `npm ls adm-zip`
Expected: `@claudia/server` lists `adm-zip` as a dependency

- [ ] **Step 3: Commit**

```bash
git add packages/server/package.json package-lock.json
git commit -m "chore: add adm-zip dependency for avatar export/import"
```

---

### Task 2: Implement `exportSet` in avatar-storage.js

**Files:**
- Modify: `packages/server/src/avatar-storage.js`
- Test: `packages/server/src/avatar-storage.test.js`

- [ ] **Step 1: Add AdmZip import and helper at the top of the test file**

At the top of `avatar-storage.test.js`, add this import after the existing imports:

```javascript
import AdmZip from "adm-zip";
```

And add this helper after the existing `fakeFile` function:

```javascript
function makeZipBuffer(files) {
  const zip = new AdmZip();
  for (const { name, data } of files) {
    zip.addFile(name, data);
  }
  return zip.toBuffer();
}
```

- [ ] **Step 2: Write the failing test for exportSet**

Add to `avatar-storage.test.js`:

```javascript
describe("exportSet", () => {
  it("returns a zip buffer containing the set's video files", async () => {
    await storage.createSet("export-me", [
      fakeFile("idle.webm"),
      fakeFile("busy.webm"),
      fakeFile("pending.webm"),
    ]);

    const zipBuffer = await storage.exportSet("export-me");
    expect(zipBuffer).toBeInstanceOf(Buffer);

    const zip = new AdmZip(zipBuffer);
    const entries = zip.getEntries().map((e) => e.entryName);
    expect(entries).toHaveLength(3);
    expect(entries).toContain("idle.webm");
    expect(entries).toContain("busy.webm");
    expect(entries).toContain("pending.webm");
  });

  it("exports mixed format sets correctly", async () => {
    await storage.createSet("mixed-export", [
      fakeFile("idle.webm"),
      fakeFile("busy.mp4"),
      fakeFile("pending.webm"),
    ]);

    const zipBuffer = await storage.exportSet("mixed-export");
    const zip = new AdmZip(zipBuffer);
    const entries = zip.getEntries().map((e) => e.entryName);
    expect(entries).toContain("idle.webm");
    expect(entries).toContain("busy.mp4");
    expect(entries).toContain("pending.webm");
  });

  it("throws for non-existent set", async () => {
    await expect(storage.exportSet("ghost")).rejects.toThrow("Set not found");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w packages/server -- --run -t "exportSet"`
Expected: FAIL — `storage.exportSet is not a function`

- [ ] **Step 3: Implement exportSet**

In `avatar-storage.js`, add the import at the top:

```javascript
import AdmZip from "adm-zip";
```

Add the `exportSet` function inside `createAvatarStorage`, before the `return` block:

```javascript
async function exportSet(name) {
  const setPath = getSetPath(name);
  try {
    await fs.access(setPath);
  } catch {
    throw new Error("Set not found");
  }

  const files = await fs.readdir(setPath);
  const validFiles = files.filter((f) => VALID_FILENAMES.has(f));

  const zip = new AdmZip();
  for (const file of validFiles) {
    const data = await fs.readFile(path.join(setPath, file));
    zip.addFile(file, data);
  }

  return zip.toBuffer();
}
```

Add `exportSet` to the return object:

```javascript
return {
  // ...existing exports...
  exportSet,
};
```

Add `exportSet` to the destructured default singleton export at the bottom:

```javascript
export const {
  // ...existing exports...
  exportSet,
} = defaultStorage;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -w packages/server -- --run -t "exportSet"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/avatar-storage.js packages/server/src/avatar-storage.test.js
git commit -m "feat: add exportSet to avatar storage"
```

---

### Task 3: Implement `importSet` in avatar-storage.js

**Files:**
- Modify: `packages/server/src/avatar-storage.js`
- Test: `packages/server/src/avatar-storage.test.js`

- [ ] **Step 1: Write the failing tests for importSet**

Add to `avatar-storage.test.js`:

```javascript
describe("importSet", () => {
  it("imports a valid .claudia zip and creates the set", async () => {
    const zipBuf = makeZipBuffer([
      fakeFile("idle.webm"),
      fakeFile("busy.webm"),
      fakeFile("pending.webm"),
    ]);

    const result = await storage.importSet("my-avatar", zipBuf);
    expect(result.name).toBe("my-avatar");

    const sets = await storage.listSets();
    expect(sets.find((s) => s.name === "my-avatar")).toBeTruthy();
  });

  it("auto-suffixes on name conflict", async () => {
    await storage.createSet("conflict", [
      fakeFile("idle.webm"),
      fakeFile("busy.webm"),
      fakeFile("pending.webm"),
    ]);

    const zipBuf = makeZipBuffer([
      fakeFile("idle.webm"),
      fakeFile("busy.webm"),
      fakeFile("pending.webm"),
    ]);

    const result = await storage.importSet("conflict", zipBuf);
    expect(result.name).toBe("conflict (2)");

    const sets = await storage.listSets();
    expect(sets.find((s) => s.name === "conflict (2)")).toBeTruthy();
  });

  it("auto-suffixes incrementally", async () => {
    await storage.createSet("dupe", [
      fakeFile("idle.webm"),
      fakeFile("busy.webm"),
      fakeFile("pending.webm"),
    ]);
    // Create "dupe (2)" manually
    await storage.createSet("dupe (2)", [
      fakeFile("idle.webm"),
      fakeFile("busy.webm"),
      fakeFile("pending.webm"),
    ]);

    const zipBuf = makeZipBuffer([
      fakeFile("idle.webm"),
      fakeFile("busy.webm"),
      fakeFile("pending.webm"),
    ]);

    const result = await storage.importSet("dupe", zipBuf);
    expect(result.name).toBe("dupe (3)");
  });

  it("rejects zip with wrong file count", async () => {
    const zipBuf = makeZipBuffer([
      fakeFile("idle.webm"),
      fakeFile("busy.webm"),
    ]);

    await expect(storage.importSet("bad", zipBuf)).rejects.toThrow(
      "Avatar pack must contain exactly 3 files: idle, busy, and pending"
    );
  });

  it("rejects zip with duplicate state", async () => {
    const zipBuf = makeZipBuffer([
      fakeFile("idle.webm"),
      fakeFile("idle.mp4"),
      fakeFile("busy.webm"),
      fakeFile("pending.webm"),
    ]);

    await expect(storage.importSet("dup-state", zipBuf)).rejects.toThrow(
      "Avatar pack must contain exactly 3 files: idle, busy, and pending"
    );
  });

  it("rejects zip with invalid filenames", async () => {
    const zip = new AdmZip();
    zip.addFile("idle.webm", fakeFile("idle.webm").data);
    zip.addFile("busy.webm", fakeFile("busy.webm").data);
    zip.addFile("malware.exe", Buffer.alloc(100));

    await expect(storage.importSet("bad-files", zip.toBuffer())).rejects.toThrow(
      "Avatar pack must contain exactly 3 files: idle, busy, and pending"
    );
  });

  it("rejects file exceeding 5MB", async () => {
    const bigFile = fakeFile("pending.webm", 6 * 1024 * 1024);
    const zipBuf = makeZipBuffer([
      fakeFile("idle.webm"),
      fakeFile("busy.webm"),
      bigFile,
    ]);

    await expect(storage.importSet("too-big", zipBuf)).rejects.toThrow(
      "One or more files exceed the 5MB limit"
    );
  });

  it("rejects file with bad magic bytes", async () => {
    const zip = new AdmZip();
    zip.addFile("idle.webm", fakeFile("idle.webm").data);
    zip.addFile("busy.webm", fakeFile("busy.webm").data);
    zip.addFile("pending.webm", Buffer.alloc(100, 0x00));

    await expect(storage.importSet("bad-magic", zip.toBuffer())).rejects.toThrow(
      "One or more files aren't valid video files"
    );
  });

  it("imports mixed format sets", async () => {
    const zipBuf = makeZipBuffer([
      fakeFile("idle.webm"),
      fakeFile("busy.mp4"),
      fakeFile("pending.webm"),
    ]);

    const result = await storage.importSet("mixed", zipBuf);
    expect(result.name).toBe("mixed");

    const sets = await storage.listSets();
    const set = sets.find((s) => s.name === "mixed");
    expect(set.files).toContain("idle.webm");
    expect(set.files).toContain("busy.mp4");
    expect(set.files).toContain("pending.webm");
  });

  it("strips directory paths from zip entries", async () => {
    const zip = new AdmZip();
    zip.addFile("subfolder/idle.webm", fakeFile("idle.webm").data);
    zip.addFile("subfolder/busy.webm", fakeFile("busy.webm").data);
    zip.addFile("subfolder/pending.webm", fakeFile("pending.webm").data);

    await expect(storage.importSet("paths", zip.toBuffer())).rejects.toThrow(
      "Avatar pack must contain exactly 3 files: idle, busy, and pending"
    );
  });

  it("rejects invalid set name derived from filename", async () => {
    const zipBuf = makeZipBuffer([
      fakeFile("idle.webm"),
      fakeFile("busy.webm"),
      fakeFile("pending.webm"),
    ]);

    await expect(storage.importSet("../escape", zipBuf)).rejects.toThrow(
      "Filename isn't a valid avatar set name"
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -w packages/server -- --run -t "importSet"`
Expected: FAIL — `storage.importSet is not a function`

- [ ] **Step 3: Implement importSet**

Add the `importSet` function inside `createAvatarStorage`, after `exportSet`:

```javascript
const MAX_ZIP_SIZE = 20 * 1024 * 1024;
const REQUIRED_STATES = ["idle", "busy", "pending"];
```

(Put these constants at the top of the file, after `MAX_FILE_SIZE`.)

```javascript
async function importSet(name, zipBuffer) {
  if (!isValidSetName(name)) {
    throw new Error("Filename isn't a valid avatar set name");
  }
  if (zipBuffer.length > MAX_ZIP_SIZE) {
    throw new Error("File is too large");
  }

  let zip;
  try {
    zip = new AdmZip(zipBuffer);
  } catch {
    throw new Error("This file doesn't look like a valid .claudia avatar pack");
  }

  const entries = zip.getEntries();

  // Filter to only valid filenames (no directories, no invalid names)
  const validEntries = entries.filter(
    (e) => !e.isDirectory && VALID_FILENAMES.has(e.entryName)
  );

  // Check exactly 3 valid files, one per state
  const states = new Set(validEntries.map((e) => e.entryName.split(".")[0]));
  if (validEntries.length !== 3 || states.size !== 3 ||
      !REQUIRED_STATES.every((s) => states.has(s))) {
    throw new Error(
      "Avatar pack must contain exactly 3 files: idle, busy, and pending"
    );
  }

  // Validate each file
  const files = [];
  for (const entry of validEntries) {
    const data = entry.getData();
    if (data.length > MAX_FILE_SIZE) {
      throw new Error("One or more files exceed the 5MB limit");
    }
    if (!hasValidMagicBytes(data, entry.entryName)) {
      throw new Error("One or more files aren't valid video files");
    }
    files.push({ name: entry.entryName, data });
  }

  // Resolve name conflicts
  let finalName = name;
  let suffix = 1;
  while (true) {
    try {
      await fs.access(getSetPath(finalName));
      suffix++;
      finalName = `${name} (${suffix})`;
    } catch {
      break;
    }
  }

  // Create the set directory and write files
  const setPath = getSetPath(finalName);
  await fs.mkdir(setPath, { recursive: true });
  for (const file of files) {
    await fs.writeFile(path.join(setPath, file.name), file.data);
  }

  return { name: finalName };
}
```

Note: `hasValidMagicBytes` is currently a module-level function (not inside `createAvatarStorage`), so it's accessible. Add `importSet` to the return object and the destructured default export, same pattern as `exportSet`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -w packages/server -- --run -t "importSet"`
Expected: PASS

- [ ] **Step 5: Run all avatar-storage tests**

Run: `npm test -w packages/server -- --run avatar-storage`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/avatar-storage.js packages/server/src/avatar-storage.test.js
git commit -m "feat: add importSet to avatar storage with full validation"
```

---

### Task 4: Add export and import API endpoints

**Files:**
- Modify: `packages/server/src/routes-api.js`
- Modify: `packages/server/src/routes-api.test.js`

- [ ] **Step 1: Write the failing tests for export endpoint**

Add to `routes-api.test.js`, inside the existing test structure. First update the mock at the top of the file to include `exportSet` and `importSet`:

In the `vi.mock("./avatar-storage.js", ...)` block, add:

```javascript
exportSet: vi.fn(),
importSet: vi.fn(),
```

Add the import:

```javascript
import { exportSet, importSet } from "./avatar-storage.js";
```

Then add the test:

```javascript
describe("GET /api/avatars/sets/:name/export", () => {
  it("returns a zip download with correct headers", async () => {
    const fakeZip = Buffer.from("PK\x03\x04fake-zip-content");
    exportSet.mockResolvedValue(fakeZip);

    const res = await request(server, "GET", "/api/avatars/sets/my-set/export");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/application\/zip/);
    expect(res.headers["content-disposition"]).toBe(
      'attachment; filename="my-set.claudia"'
    );
  });

  it("returns 404 for non-existent set", async () => {
    exportSet.mockRejectedValue(new Error("Set not found"));

    const res = await request(server, "GET", "/api/avatars/sets/ghost/export");
    expect(res.status).toBe(404);
  });

  it("returns 400 for invalid set name", async () => {
    const res = await request(server, "GET", "/api/avatars/sets/../bad/export");
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Write the failing tests for import endpoint**

```javascript
describe("POST /api/avatars/import", () => {
  it("imports a .claudia file and returns the set name", async () => {
    importSet.mockResolvedValue({ name: "my-avatar" });

    const res = await requestRaw(server, "POST", "/api/avatars/import",
      Buffer.from("PK\x03\x04fake-zip"),
      { "content-type": "application/zip" }
    );
    expect(res.status).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(true);
    expect(body.name).toBe("my-avatar");
  });

  it("returns 400 when import validation fails", async () => {
    importSet.mockRejectedValue(
      new Error("Avatar pack must contain exactly 3 files: idle, busy, and pending")
    );

    const res = await requestRaw(server, "POST", "/api/avatars/import",
      Buffer.from("PK\x03\x04bad-zip"),
      { "content-type": "application/zip" }
    );
    expect(res.status).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toContain("exactly 3 files");
  });
});
```

Note: The existing `request` helper sends JSON bodies. You'll need a `requestRaw` helper that sends raw buffers with custom headers. Add it next to the existing `request` helper:

```javascript
function requestRaw(server, method, urlPath, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, `http://localhost:${server.address().port}`);
    const opts = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: {
        ...headers,
        "content-length": body ? body.length : 0,
      },
    };

    const req = http.request(opts, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: Buffer.concat(chunks).toString(),
        });
      });
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test -w packages/server -- --run -t "export|import"`
Expected: FAIL — routes not defined

- [ ] **Step 4: Implement the export endpoint**

In `routes-api.js`, add `exportSet` and `importSet` to the import from `./avatar-storage.js`:

```javascript
import {
  // ...existing imports...
  exportSet,
  importSet,
} from "./avatar-storage.js";
```

Add the export route after the existing `DELETE /api/avatars/sets/:name` handler (around line 235):

```javascript
app.get("/api/avatars/sets/:name/export", async (req, res) => {
  const { name } = req.params;
  if (!isValidSetName(name)) return res.status(400).json({ error: "Invalid set name" });

  try {
    const zipBuffer = await exportSet(name);
    res.set({
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${name}.claudia"`,
      "Content-Length": zipBuffer.length,
    });
    res.send(zipBuffer);
  } catch (err) {
    const status = err.message.includes("not found") ? 404 : 500;
    res.status(status).json({ error: err.message });
  }
});
```

- [ ] **Step 5: Implement the import endpoint**

Add the import route right after the export route:

```javascript
app.post("/api/avatars/import", async (req, res) => {
  const chunks = [];
  let totalSize = 0;
  const MAX_IMPORT_SIZE = 20 * 1024 * 1024;

  req.on("data", (chunk) => {
    totalSize += chunk.length;
    if (totalSize > MAX_IMPORT_SIZE) {
      req.destroy();
      return;
    }
    chunks.push(chunk);
  });

  req.on("end", async () => {
    if (totalSize > MAX_IMPORT_SIZE) {
      return res.status(400).json({ error: "File is too large" });
    }

    const zipBuffer = Buffer.concat(chunks);

    // Derive set name from the filename query param
    const filename = req.query.name || "imported";
    const setName = filename.replace(/\.claudia$/i, "");

    try {
      const result = await importSet(setName, zipBuffer);
      res.json({ ok: true, name: result.name });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  req.on("error", () => {
    if (!res.headersSent) {
      res.status(500).json({ error: "Upload failed" });
    }
  });
});
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test -w packages/server -- --run routes-api`
Expected: All PASS

- [ ] **Step 7: Commit**

```bash
git add packages/server/src/routes-api.js packages/server/src/routes-api.test.js
git commit -m "feat: add export and import API endpoints for avatar sets"
```

---

### Task 5: Add export button to AvatarTab UI

**Files:**
- Modify: `packages/web/src/lib/AvatarTab.svelte`

- [ ] **Step 1: Add the export handler function**

In the `<script>` section of `AvatarTab.svelte`, add after the `thumbnailUrl` function:

```javascript
function exportSet(name) {
  const url = `/api/avatars/sets/${encodeURIComponent(name)}/export`;
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name}.claudia`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
```

- [ ] **Step 2: Add the export icon button to each non-default card**

Inside the `{#if !isDefault}` block, after the existing edit button, add an export button:

```svelte
<button
  class="action-btn export-action"
  onclick={(e) => { e.stopPropagation(); exportSet(set.name); }}
  aria-label="Export {set.name}"
><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 2v8m0 0L5 7m3 3 3-3M3 12v1a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-1"/></svg></button>
```

Add it between the delete and edit buttons, so the order from top to bottom is: delete, export, edit.

- [ ] **Step 3: Add the export button hover style**

In the `<style>` section, after the `.edit-action:hover` rule:

```css
.export-action:hover {
  color: var(--brand);
  background: rgba(193, 95, 60, 0.2);
}
```

- [ ] **Step 4: Verify visually**

Run: `npm run dev`
Open the dashboard, go to avatar modal. Hover over a non-default card — should see 3 action buttons (delete, export, edit). Click export — browser should download a `.claudia` file.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/lib/AvatarTab.svelte
git commit -m "feat: add export button to avatar set cards"
```

---

### Task 6: Add import button and handler to AvatarTab UI

**Files:**
- Modify: `packages/web/src/lib/AvatarTab.svelte`

- [ ] **Step 1: Add import state and handler**

In the `<script>` section of `AvatarTab.svelte`, add the import handler:

```javascript
let importing = $state(false);

async function handleImport() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".claudia";

  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;

    importing = true;
    error = "";

    try {
      const setName = file.name.replace(/\.claudia$/i, "");
      const res = await fetch(`/api/avatars/import?name=${encodeURIComponent(setName)}`, {
        method: "POST",
        headers: { "Content-Type": "application/zip" },
        body: file,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Import failed");
      await fetchSets();
      onavatarchange?.();
    } catch (err) {
      error = err.message;
    }
    importing = false;
  };

  input.click();
}
```

- [ ] **Step 2: Add the import button to the UI**

In the template, add an import card right after the "Add New" card (before the `{#each}` loop):

```svelte
<div
  class="set-card add-card"
  onclick={handleImport}
  onkeydown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleImport(); } }}
  role="button"
  tabindex="0"
>
  <div class="add-icon">
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" width="24" height="24"><path d="M8 10V2m0 0L5 5m3-3 3 3M3 12v1a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-1"/></svg>
  </div>
  <span class="set-name">{importing ? "Importing..." : "Import"}</span>
</div>
```

- [ ] **Step 3: Verify visually**

Run: `npm run dev`
Open the avatar modal. Should see "Add New" and "Import" cards side by side. Click Import — file picker opens, filtered to `.claudia`. Select a valid `.claudia` file — new set appears in the grid. Select an invalid file — error toast shows.

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/lib/AvatarTab.svelte
git commit -m "feat: add import button to avatar tab"
```

---

### Task 7: Run full test suite and lint

**Files:**
- None (verification only)

- [ ] **Step 1: Run all server tests**

Run: `npm test -w packages/server`
Expected: All PASS

- [ ] **Step 2: Run linter**

Run: `npm run lint`
Expected: No errors (warnings OK)

- [ ] **Step 3: Fix any lint issues**

Run: `npm run lint:fix` if needed.

- [ ] **Step 4: Build the web UI**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 5: Commit any lint fixes**

```bash
git add -A
git commit -m "chore: lint fixes for avatar export/import"
```

(Skip if no changes.)
