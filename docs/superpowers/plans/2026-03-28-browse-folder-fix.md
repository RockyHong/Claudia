# Browse Folder Dialog Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the Windows folder picker opening behind the browser, harden COM cleanup, add a cancel button, and remove artificial timeouts.

**Architecture:** Server-side changes to `spawner.js` (C# HWND fix, process tracking, cancel export) and `routes-api.js` (cancel endpoint). Frontend changes to `SpawnPopover.svelte` (AbortController + cancel button). All platforms lose timeouts; only Windows gets the HWND and COM fixes.

**Tech Stack:** Node.js, Express, Svelte 5, PowerShell/C# COM interop (Windows)

---

### Task 1: Add `cancelBrowse` export and track active process in `spawner.js`

**Files:**
- Modify: `packages/server/src/spawner.js:187-200` (browseWindows function + module-level state)
- Modify: `packages/server/src/spawner.js:129-133` (browseFolder export)
- Test: `packages/server/src/spawner.test.js`

- [ ] **Step 1: Write the failing test for `cancelBrowse` killing the active process**

Add a new describe block after the existing `browseFolder — win32` block in `packages/server/src/spawner.test.js`:

```javascript
// ---------------------------------------------------------------------------
// cancelBrowse
// ---------------------------------------------------------------------------

describe("cancelBrowse", () => {
  let browseFolder, cancelBrowse;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    mockPlatform.mockReturnValue("win32");
    const mod = await import("./spawner.js");
    browseFolder = mod.browseFolder;
    cancelBrowse = mod.cancelBrowse;
  });

  it("kills the active browse process", async () => {
    const mockKill = vi.fn();
    mockExecFile.mockImplementation((cmd, args, opts, cb) => {
      // Don't call cb — simulate a hanging dialog
      return { kill: mockKill };
    });

    // Start browse but don't await (it will hang)
    const browsePromise = browseFolder();

    cancelBrowse();
    expect(mockKill).toHaveBeenCalled();

    // Clean up: the kill triggers the callback with an error
    const cb = mockExecFile.mock.calls[0][3];
    cb(new Error("killed"), "", "");
    await browsePromise;
  });

  it("does nothing when no browse is active", () => {
    // Should not throw
    cancelBrowse();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --prefix packages/server -- --run spawner.test.js`
Expected: FAIL — `cancelBrowse` is not exported from `spawner.js`

- [ ] **Step 3: Implement `cancelBrowse` and process tracking**

In `packages/server/src/spawner.js`, add module-level state and the export. Near the top after the `currentPlatform` line (line 4), add:

```javascript
let activeBrowseProcess = null;
```

Modify the `browseWindows` function (lines 187-200) to track the child process and clear it on completion:

```javascript
function browseWindows() {
  return new Promise((resolve) => {
    const child = execFile("powershell", ["-NoProfile", "-STA", "-Command", [
      'Add-Type -Language CSharp @"\n' + FOLDER_PICKER_CS + '\n"@',
      "[FolderPicker]::Pick()",
    ].join("; ")], (err, stdout) => {
      activeBrowseProcess = null;
      if (err) return resolve(null);
      const selected = stdout.trim();
      resolve(selected || null);
    });
    activeBrowseProcess = child;
  });
}
```

Also update `browseMac` (lines 202-211) and `browseLinux` (lines 213-221) with the same process tracking pattern. For `browseMac`:

```javascript
function browseMac() {
  return new Promise((resolve) => {
    const script = 'try\nset f to POSIX path of (choose folder with prompt "Select project folder")\nf\non error\n""\nend try';
    const child = execFile("osascript", ["-e", script], (err, stdout) => {
      activeBrowseProcess = null;
      if (err) return resolve(null);
      const selected = stdout.trim();
      resolve(selected || null);
    });
    activeBrowseProcess = child;
  });
}
```

For `browseLinux`:

```javascript
function browseLinux() {
  return new Promise((resolve) => {
    const child = execFile("zenity", ["--file-selection", "--directory", "--title=Select project folder"], (err, stdout) => {
      activeBrowseProcess = null;
      if (err) return resolve(null);
      const selected = stdout.trim();
      resolve(selected || null);
    });
    activeBrowseProcess = child;
  });
}
```

Add the `cancelBrowse` export at the bottom of the file, next to the existing `browseFolder` export:

```javascript
export function cancelBrowse() {
  if (activeBrowseProcess) {
    activeBrowseProcess.kill();
    activeBrowseProcess = null;
  }
}
```

Note: The timeout option `{ timeout: 60000 }` is removed from all three platform functions in this step.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --prefix packages/server -- --run spawner.test.js`
Expected: ALL PASS (including existing browse tests — the mock pattern `(cmd, args, opts, cb)` still works since `execFile` without the opts object passes callback as 3rd arg, but our mocks handle both signatures)

- [ ] **Step 5: Verify existing tests still pass**

Run: `npm test --prefix packages/server -- --run`
Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/spawner.js packages/server/src/spawner.test.js
git commit -m "feat: add cancelBrowse, track active process, remove timeouts"
```

---

### Task 2: Fix Windows HWND and harden C# COM cleanup

**Files:**
- Modify: `packages/server/src/spawner.js:141-185` (FOLDER_PICKER_CS constant)
- Test: `packages/server/src/spawner.test.js`

- [ ] **Step 1: Write the failing test for GetForegroundWindow in the PowerShell command**

Add this test inside the existing `browseFolder — win32` describe block in `packages/server/src/spawner.test.js`:

```javascript
it("passes GetForegroundWindow as owner HWND in the C# code", async () => {
  mockExecFile.mockImplementation((cmd, args, opts, cb) => {
    if (typeof opts === "function") cb = opts;
    cb(null, "C:\\project\n", "");
  });
  await browseFolder();
  const psCommand = mockExecFile.mock.calls[0][1];
  const commandStr = Array.isArray(psCommand) ? psCommand.join(" ") : String(psCommand);
  expect(commandStr).toContain("GetForegroundWindow");
});

it("uses try/finally for COM cleanup in the C# code", async () => {
  mockExecFile.mockImplementation((cmd, args, opts, cb) => {
    if (typeof opts === "function") cb = opts;
    cb(null, "C:\\project\n", "");
  });
  await browseFolder();
  const psCommand = mockExecFile.mock.calls[0][1];
  const commandStr = Array.isArray(psCommand) ? psCommand.join(" ") : String(psCommand);
  expect(commandStr).toContain("finally");
  expect(commandStr).toContain("ReleaseComObject");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --prefix packages/server -- --run spawner.test.js`
Expected: FAIL — the C# code doesn't contain `GetForegroundWindow` or `finally`

- [ ] **Step 3: Update the `FOLDER_PICKER_CS` constant**

Replace the entire `FOLDER_PICKER_CS` constant (lines 141-185) in `packages/server/src/spawner.js` with:

```javascript
const FOLDER_PICKER_CS = [
  "using System;",
  "using System.Runtime.InteropServices;",
  "[ComImport, Guid(\"DC1C5A9C-E88A-4DDE-A5A1-60F82A20AEF7\")] class FileOpenDialogRCW {}",
  "[ComImport, Guid(\"42F85136-DB7E-439C-85F1-E4075D135FC8\"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]",
  "interface IFileOpenDialog {",
  "  [PreserveSig] int Show(IntPtr hwnd);",
  "  void SetFileTypes(uint c, IntPtr f);",
  "  void SetFileTypeIndex(uint i);",
  "  void GetFileTypeIndex(out uint i);",
  "  void Advise(IntPtr p, out uint c);",
  "  void Unadvise(uint c);",
  "  void SetOptions(uint o);",
  "  void GetOptions(out uint o);",
  "  void SetDefaultFolder(IShellItem s);",
  "  void SetFolder(IShellItem s);",
  "  void GetFolder(out IShellItem s);",
  "  void GetCurrentSelection(out IShellItem s);",
  "  void SetFileName([MarshalAs(UnmanagedType.LPWStr)] string n);",
  "  void GetFileName([MarshalAs(UnmanagedType.LPWStr)] out string n);",
  "  void SetTitle([MarshalAs(UnmanagedType.LPWStr)] string t);",
  "  void SetOkButtonLabel([MarshalAs(UnmanagedType.LPWStr)] string t);",
  "  void SetFileNameLabel([MarshalAs(UnmanagedType.LPWStr)] string t);",
  "  void GetResult(out IShellItem s);",
  "}",
  "[ComImport, Guid(\"43826D1E-E718-42EE-BC55-A1E261C37BFE\"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]",
  "interface IShellItem {",
  "  void BindToHandler(IntPtr p, ref Guid b, ref Guid r, out IntPtr o);",
  "  void GetParent(out IShellItem p);",
  "  void GetDisplayName(uint t, [MarshalAs(UnmanagedType.LPWStr)] out string n);",
  "  void GetAttributes(uint m, out uint a);",
  "  void Compare(IShellItem o, uint h, out int r);",
  "}",
  "public class FolderPicker {",
  "  [DllImport(\"user32.dll\")] static extern IntPtr GetForegroundWindow();",
  "  public static string Pick() {",
  "    IFileOpenDialog d = null;",
  "    IShellItem item = null;",
  "    try {",
  "      d = (IFileOpenDialog)new FileOpenDialogRCW();",
  "      d.SetOptions(0x20 | 0x800 | 0x1000);",
  "      d.SetTitle(\"Select project folder\");",
  "      if (d.Show(GetForegroundWindow()) != 0) return \"\";",
  "      d.GetResult(out item);",
  "      string path; item.GetDisplayName(0x80058000, out path);",
  "      return path;",
  "    } catch {",
  "      return \"\";",
  "    } finally {",
  "      if (item != null) Marshal.ReleaseComObject(item);",
  "      if (d != null) Marshal.ReleaseComObject(d);",
  "    }",
  "  }",
  "}",
].join("\n");
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --prefix packages/server -- --run spawner.test.js`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/spawner.js packages/server/src/spawner.test.js
git commit -m "fix: use GetForegroundWindow as dialog owner, harden COM cleanup"
```

---

### Task 3: Add `POST /api/browse/cancel` endpoint

**Files:**
- Modify: `packages/server/src/routes-api.js:42-50` (add cancel route, update import)
- Test: `packages/server/src/routes-api.test.js`

- [ ] **Step 1: Write the failing test for the cancel endpoint**

In `packages/server/src/routes-api.test.js`, update the mock for `spawner.js` to include `cancelBrowse`:

Find this line:
```javascript
vi.mock("./spawner.js", () => ({
  spawnSession: vi.fn(),
  browseFolder: vi.fn(),
}));
```

Replace with:
```javascript
vi.mock("./spawner.js", () => ({
  spawnSession: vi.fn(),
  browseFolder: vi.fn(),
  cancelBrowse: vi.fn(),
}));
```

Update the import line too:
```javascript
import { spawnSession, cancelBrowse } from "./spawner.js";
```

Then add a new describe block for the cancel endpoint (place it near the existing browse/launch tests):

```javascript
describe("POST /api/browse/cancel", () => {
  it("calls cancelBrowse and returns ok", async () => {
    const { status, body } = await request(server, "POST", "/api/browse/cancel");
    expect(status).toBe(200);
    expect(body).toEqual({ ok: true });
    expect(cancelBrowse).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --prefix packages/server -- --run routes-api.test.js`
Expected: FAIL — 404 on `/api/browse/cancel`

- [ ] **Step 3: Add the cancel endpoint to `routes-api.js`**

In `packages/server/src/routes-api.js`, update the import from `spawner.js` to include `cancelBrowse`:

Find:
```javascript
import { spawnSession, browseFolder } from "./spawner.js";
```

Replace with:
```javascript
import { spawnSession, browseFolder, cancelBrowse } from "./spawner.js";
```

Then add the cancel route right after the existing `POST /api/browse` handler (after line 50):

```javascript
app.post("/api/browse/cancel", (req, res) => {
  cancelBrowse();
  res.json({ ok: true });
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --prefix packages/server -- --run routes-api.test.js`
Expected: ALL PASS

- [ ] **Step 5: Run full test suite**

Run: `npm test --prefix packages/server -- --run`
Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/routes-api.js packages/server/src/routes-api.test.js
git commit -m "feat: add POST /api/browse/cancel endpoint"
```

---

### Task 4: Frontend cancel button in `SpawnPopover.svelte`

**Files:**
- Modify: `packages/web/src/lib/SpawnPopover.svelte`

- [ ] **Step 1: Update the `browse()` function to use AbortController**

In `packages/web/src/lib/SpawnPopover.svelte`, replace the `browse` function and add `cancelBrowse`:

Find (lines 25 and 58-70):
```javascript
let browsing = $state(false);
```

and:
```javascript
async function browse() {
    browsing = true;
    try {
      const res = await fetch("/api/browse", { method: "POST" });
      const data = await res.json();
      if (data.path) {
        await launch(data.path);
      }
    } catch {
      // cancelled or error
    }
    browsing = false;
  }
```

Replace with:
```javascript
let browsing = $state(false);
  let browseController = null;
```

and:
```javascript
async function browse() {
    browsing = true;
    browseController = new AbortController();
    try {
      const res = await fetch("/api/browse", {
        method: "POST",
        signal: browseController.signal,
      });
      const data = await res.json();
      if (data.path) {
        await launch(data.path);
      }
    } catch {
      // cancelled, aborted, or error
    }
    browseController = null;
    browsing = false;
  }

  function cancelBrowse() {
    if (browseController) browseController.abort();
    fetch("/api/browse/cancel", { method: "POST" });
  }
```

- [ ] **Step 2: Replace the disabled button with a conditional cancel button**

Find the button markup (lines 101-104):
```svelte
<button class="browse-btn" disabled={browsing} onclick={browse}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
      {browsing ? "Waiting for selection..." : "Browse folder..."}
    </button>
```

Replace with:
```svelte
{#if browsing}
      <button class="browse-btn cancel" onclick={cancelBrowse}>
        Cancel
      </button>
    {:else}
      <button class="browse-btn" onclick={browse}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
        Browse folder...
      </button>
    {/if}
```

- [ ] **Step 3: Add cancel button styling**

Find the `.browse-btn:disabled` rule (lines 212-215):
```css
.browse-btn:disabled {
    opacity: 0.5;
    cursor: wait;
  }
```

Replace with:
```css
.browse-btn.cancel {
    border-color: var(--amber);
    color: var(--amber);
    border-style: solid;
  }

  .browse-btn.cancel:hover {
    background: rgba(245, 158, 11, 0.06);
  }
```

- [ ] **Step 4: Build the frontend to verify no compile errors**

Run: `npm run build --prefix packages/web`
Expected: Build succeeds with no errors

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/lib/SpawnPopover.svelte
git commit -m "feat: replace browse waiting state with cancel button"
```

---

### Task 5: Update known bugs in roadmap

**Files:**
- Modify: `roadmap.md:302`

- [ ] **Step 1: Mark the bug as fixed in `roadmap.md`**

Find:
```markdown
- [ ] **Browse folder dialog opens behind browser (Windows)** — `browseWindows()` in `spawner.js` calls COM `IFileOpenDialog.Show(IntPtr.Zero)` with no parent HWND, so the native picker has no owner window and often opens behind the browser. Additionally, if the user closes the dialog without selecting a folder, the "Waiting for selection..." button state can get stuck (PowerShell process may hang or timeout after 60s).
```

Replace with:
```markdown
- [x] **Browse folder dialog opens behind browser (Windows)** — Fixed: `GetForegroundWindow()` passed as owner HWND, COM cleanup hardened with try/finally, cancel button replaces stuck "Waiting..." state, timeouts removed.
```

- [ ] **Step 2: Commit**

```bash
git add roadmap.md
git commit -m "docs: mark browse folder dialog bug as fixed"
```
