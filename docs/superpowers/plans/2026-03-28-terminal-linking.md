# Terminal Linking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users link orphan (auto-detected) sessions to terminal windows, making them behave identically to Claudia-spawned sessions.

**Architecture:** Two new functions in `focus.js` (window enumeration + rename), two new API routes in `routes-api.js` (list terminals + link), one new getter in `session-tracker.js`, and a clickable dropdown in `SessionCard.svelte`. After linking, the existing spawn-link protocol handles everything downstream.

**Tech Stack:** Node.js, Express 5, PowerShell (Windows), Svelte 5

---

### Task 1: Add `listTerminalWindows` to focus.js

**Files:**
- Modify: `packages/server/src/focus.js:227-253`
- Test: `packages/server/src/focus.test.js`

- [ ] **Step 1: Write the failing test for listTerminalWindows on win32**

In `packages/server/src/focus.test.js`, inside the `describe("win32 platform", ...)` block, after the `findDeadWindows` tests (after line 178), add:

```javascript
  // ── listTerminalWindows ──────────────────────────────────────────────────

  it("returns terminal windows from powershell stdout", async () => {
    mockExecFile.mockImplementation((cmd, args, opts, cb) => {
      if (typeof opts === "function") { cb = opts; }
      cb(null, "12345|Windows Terminal\n67890|cmd.exe - prompt\n", "");
    });
    const result = await listTerminalWindows(new Set());
    expect(mockExecFile).toHaveBeenCalledOnce();
    expect(mockExecFile.mock.calls[0][0]).toBe("powershell");
    expect(result).toEqual([
      { hwnd: 12345, title: "Windows Terminal" },
      { hwnd: 67890, title: "cmd.exe - prompt" },
    ]);
  });

  it("excludes handles in the exclude set", async () => {
    mockExecFile.mockImplementation((cmd, args, opts, cb) => {
      if (typeof opts === "function") { cb = opts; }
      cb(null, "12345|Windows Terminal\n67890|cmd.exe\n", "");
    });
    const result = await listTerminalWindows(new Set([12345]));
    expect(result).toEqual([{ hwnd: 67890, title: "cmd.exe" }]);
  });

  it("returns empty array when powershell fails", async () => {
    failExecFile();
    const result = await listTerminalWindows(new Set());
    expect(result).toEqual([]);
  });

  it("returns empty array when stdout is empty", async () => {
    mockExecFile.mockImplementation((cmd, args, opts, cb) => {
      if (typeof opts === "function") { cb = opts; }
      cb(null, "  \n", "");
    });
    const result = await listTerminalWindows(new Set());
    expect(result).toEqual([]);
  });
```

Also update the `importFocus` helper (around line 47) to also import `listTerminalWindows`:

```javascript
async function importFocus(platformName) {
  mockPlatform.mockReturnValue(platformName);
  const mod = await import("./focus.js");
  return { focusTerminal: mod.focusTerminal, findDeadWindows: mod.findDeadWindows, listTerminalWindows: mod.listTerminalWindows };
}
```

And destructure it in the `describe("win32 platform", ...)` block:

```javascript
  let listTerminalWindows;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    ({ focusTerminal, findDeadWindows, listTerminalWindows } = await importFocus("win32"));
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --reporter verbose -- packages/server/src/focus.test.js`
Expected: FAIL — `listTerminalWindows is not a function`

- [ ] **Step 3: Implement listTerminalWindows in focus.js**

At the bottom of `packages/server/src/focus.js`, before the `sanitize` function, add:

```javascript
/**
 * Known terminal process names for window enumeration.
 * Used to filter visible windows to terminal-like applications only.
 */
const TERMINAL_PROCESS_NAMES = [
  "WindowsTerminal",
  "cmd",
  "powershell",
  "pwsh",
  "ConEmuC64",
  "ConEmuC",
  "mintty",
  "Alacritty",
  "kitty",
  "Hyper",
  "Tabby",
  "WezTerm",
];

/**
 * Enumerate visible terminal windows on the current platform.
 * Returns [{ hwnd, title }], excluding any handles in the provided Set.
 * Windows-only — returns [] on other platforms.
 */
export function listTerminalWindows(excludeHandles = new Set()) {
  if (currentPlatform !== "win32") {
    return Promise.resolve([]);
  }

  const nameFilter = TERMINAL_PROCESS_NAMES.map((n) => `'${n}'`).join(",");
  const ps = [
    `$names = @(${nameFilter})`,
    "Get-Process | Where-Object { $names -contains $_.ProcessName -and $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle -ne '' } | ForEach-Object { \"$($_.MainWindowHandle)|$($_.MainWindowTitle)\" }",
  ].join("\n");

  return new Promise((resolve) => {
    execFile("powershell", ["-NoProfile", "-Command", ps], { timeout: 10000 }, (err, stdout) => {
      if (err) return resolve([]);
      const windows = stdout
        .trim()
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => {
          const sep = line.indexOf("|");
          if (sep === -1) return null;
          const hwnd = parseInt(line.slice(0, sep), 10);
          const title = line.slice(sep + 1);
          if (!hwnd || hwnd <= 0) return null;
          return { hwnd, title };
        })
        .filter((w) => w !== null && !excludeHandles.has(w.hwnd));
      resolve(windows);
    });
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --reporter verbose -- packages/server/src/focus.test.js`
Expected: All tests PASS

- [ ] **Step 5: Add test for non-win32 platform**

In `packages/server/src/focus.test.js`, inside `describe("unknown platform (fallback)", ...)`, after the existing `findDeadWindows` test, add:

```javascript
  it("listTerminalWindows returns empty array on non-win32 platform", async () => {
    const result = await listTerminalWindows(new Set());
    expect(result).toEqual([]);
    expect(mockExecFile).not.toHaveBeenCalled();
  });
```

Also destructure `listTerminalWindows` in that block's `beforeEach`:

```javascript
  let listTerminalWindows;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    ({ focusTerminal, findDeadWindows, listTerminalWindows } = await importFocus("freebsd"));
  });
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test -- --reporter verbose -- packages/server/src/focus.test.js`
Expected: All tests PASS

- [ ] **Step 7: Commit**

```bash
git add packages/server/src/focus.js packages/server/src/focus.test.js
git commit -m "feat: add listTerminalWindows to focus.js"
```

---

### Task 2: Add `renameTerminal` to focus.js

**Files:**
- Modify: `packages/server/src/focus.js`
- Test: `packages/server/src/focus.test.js`

- [ ] **Step 1: Write the failing test for renameTerminal on win32**

In `packages/server/src/focus.test.js`, inside `describe("win32 platform", ...)`, add:

```javascript
  // ── renameTerminal ──────────────────────────────────────────────────────

  it("calls SetWindowText via powershell with the new title", async () => {
    succeedExecFile();
    const result = await renameTerminal(12345, "claudia · myproject-01");
    expect(mockExecFile).toHaveBeenCalledOnce();
    expect(mockExecFile.mock.calls[0][0]).toBe("powershell");
    const psScript = mockExecFile.mock.calls[0][1][2];
    expect(psScript).toContain("[IntPtr]12345");
    expect(psScript).toContain("claudia · myproject-01");
    expect(psScript).toContain("SetWindowText");
    expect(result).toBe(true);
  });

  it("returns false when powershell fails", async () => {
    failExecFile();
    const result = await renameTerminal(12345, "claudia · test");
    expect(result).toBe(false);
  });
```

Update the `importFocus` helper to also import `renameTerminal`:

```javascript
async function importFocus(platformName) {
  mockPlatform.mockReturnValue(platformName);
  const mod = await import("./focus.js");
  return {
    focusTerminal: mod.focusTerminal,
    findDeadWindows: mod.findDeadWindows,
    listTerminalWindows: mod.listTerminalWindows,
    renameTerminal: mod.renameTerminal,
  };
}
```

Destructure in the win32 block:

```javascript
  let renameTerminal;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    ({ focusTerminal, findDeadWindows, listTerminalWindows, renameTerminal } = await importFocus("win32"));
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --reporter verbose -- packages/server/src/focus.test.js`
Expected: FAIL — `renameTerminal is not a function`

- [ ] **Step 3: Implement renameTerminal in focus.js**

In `packages/server/src/focus.js`, after the `listTerminalWindows` function, add:

```javascript
/**
 * Rename a terminal window by setting its title via SetWindowText.
 * Windows-only — returns false on other platforms.
 */
export function renameTerminal(windowHandle, newTitle) {
  if (currentPlatform !== "win32") {
    return Promise.resolve(false);
  }

  const escaped = newTitle.replace(/'/g, "''");
  const ps = [
    'Add-Type -Language CSharp @"\nusing System; using System.Runtime.InteropServices;\npublic class WinTitle { [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern bool SetWindowText(IntPtr hWnd, string lpString); }\n"@',
    `[WinTitle]::SetWindowText([IntPtr]${windowHandle}, '${escaped}')`,
  ].join("\n");

  return runFile("powershell", ["-NoProfile", "-Command", ps]);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --reporter verbose -- packages/server/src/focus.test.js`
Expected: All tests PASS

- [ ] **Step 5: Add fallback test for non-win32**

In `describe("unknown platform (fallback)", ...)`, add:

```javascript
  it("renameTerminal returns false on non-win32 platform", async () => {
    const result = await renameTerminal(12345, "claudia · test");
    expect(result).toBe(false);
    expect(mockExecFile).not.toHaveBeenCalled();
  });
```

Destructure `renameTerminal` in that block too:

```javascript
  ({ focusTerminal, findDeadWindows, listTerminalWindows, renameTerminal } = await importFocus("freebsd"));
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test -- --reporter verbose -- packages/server/src/focus.test.js`
Expected: All tests PASS

- [ ] **Step 7: Commit**

```bash
git add packages/server/src/focus.js packages/server/src/focus.test.js
git commit -m "feat: add renameTerminal to focus.js"
```

---

### Task 3: Add `getLinkedHandles` to session-tracker.js

**Files:**
- Modify: `packages/server/src/session-tracker.js:260-271`
- Test: `packages/server/src/session-tracker.test.js`

- [ ] **Step 1: Write the failing test**

In `packages/server/src/session-tracker.test.js`, at the end of the `describe("session-tracker", ...)` block, add a new describe:

```javascript
  describe("getLinkedHandles", () => {
    it("returns empty set when no sessions have window handles", () => {
      tracker.handleEvent({ session: "s1", state: "idle", cwd: "/proj-a" });
      tracker.handleEvent({ session: "s2", state: "idle", cwd: "/proj-b" });

      const handles = tracker.getLinkedHandles();
      expect(handles).toEqual(new Set());
    });

    it("returns set of all non-null window handles", () => {
      tracker.handleEvent({ session: "s1", state: "idle", cwd: "/proj-a" });
      tracker.storeSpawnedInfo("/proj-a", "claudia · proj-a-01", 111);

      tracker.handleEvent({ session: "s2", state: "idle", cwd: "/proj-b" });
      // s2 remains unlinked

      tracker.handleEvent({ session: "s3", state: "idle", cwd: "/proj-c" });
      tracker.storeSpawnedInfo("/proj-c", "claudia · proj-c-01", 222);

      const handles = tracker.getLinkedHandles();
      expect(handles).toEqual(new Set([111, 222]));
    });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --reporter verbose -- packages/server/src/session-tracker.test.js`
Expected: FAIL — `tracker.getLinkedHandles is not a function`

- [ ] **Step 3: Implement getLinkedHandles**

In `packages/server/src/session-tracker.js`, add a new function inside `createSessionTracker`, before the `return` statement (before line 260):

```javascript
  function getLinkedHandles() {
    const handles = new Set();
    for (const session of sessions.values()) {
      if (session.windowHandle != null) {
        handles.add(session.windowHandle);
      }
    }
    return handles;
  }
```

Add `getLinkedHandles` to the return object:

```javascript
  return {
    handleEvent,
    getSessions,
    getSession,
    getAggregateState,
    getSessionDisplayName,
    storeSpawnedInfo,
    getLinkedHandles,
    pruneStale,
    start,
    stop,
  };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --reporter verbose -- packages/server/src/session-tracker.test.js`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/session-tracker.js packages/server/src/session-tracker.test.js
git commit -m "feat: add getLinkedHandles to session tracker"
```

---

### Task 4: Extract `generateTerminalTitle` for shared use

**Files:**
- Modify: `packages/server/src/spawner.js:19-25`
- Create: `packages/server/src/terminal-title.js`
- Test: `packages/server/src/terminal-title.test.js`
- Modify: `packages/server/src/spawner.test.js`

The `generateTerminalTitle` function in `spawner.js` generates `claudia · <name>-<uid>` titles. The link endpoint needs this same logic. Extract it to a shared module.

- [ ] **Step 1: Create the shared module with tests**

Create `packages/server/src/terminal-title.test.js`:

```javascript
import { describe, it, expect } from "vitest";
import { generateTerminalTitle } from "./terminal-title.js";

describe("generateTerminalTitle", () => {
  it("generates title from cwd with claudia prefix", () => {
    const title = generateTerminalTitle("/home/user/myproject");
    expect(title).toMatch(/^claudia · myproject-[0-9a-z]{2,}$/);
  });

  it("extracts last path segment from Windows-style paths", () => {
    const title = generateTerminalTitle("C:\\Users\\user\\winproject");
    expect(title).toContain("winproject");
  });

  it("generates unique titles for same cwd", () => {
    const t1 = generateTerminalTitle("/home/user/proj");
    const t2 = generateTerminalTitle("/home/user/proj");
    expect(t1).not.toBe(t2);
  });

  it("falls back to 'session' for empty cwd", () => {
    const title = generateTerminalTitle("");
    expect(title).toContain("session");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --reporter verbose -- packages/server/src/terminal-title.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Create the shared module**

Create `packages/server/src/terminal-title.js`:

```javascript
let spawnCounter = 0;

export function generateTerminalTitle(cwd) {
  const name = cwd.replace(/\\/g, "/").split("/").filter(Boolean).pop() || "session";
  const uid = (++spawnCounter).toString(36).padStart(2, "0");
  return `claudia · ${name}-${uid}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --reporter verbose -- packages/server/src/terminal-title.test.js`
Expected: All tests PASS

- [ ] **Step 5: Update spawner.js to import from the shared module**

In `packages/server/src/spawner.js`, remove lines 19-25 (the `spawnCounter` variable and `generateTerminalTitle` function) and replace with an import. At the top of the file, add:

```javascript
import { generateTerminalTitle } from "./terminal-title.js";
```

Remove:
```javascript
let spawnCounter = 0;

function generateTerminalTitle(cwd) {
  const name = cwd.replace(/\\/g, "/").split("/").filter(Boolean).pop() || "session";
  const uid = (++spawnCounter).toString(36).padStart(2, "0");
  return `claudia · ${name}-${uid}`;
}
```

- [ ] **Step 6: Run all spawner tests to verify nothing broke**

Run: `npm test -- --reporter verbose -- packages/server/src/spawner.test.js`
Expected: All tests PASS

- [ ] **Step 7: Commit**

```bash
git add packages/server/src/terminal-title.js packages/server/src/terminal-title.test.js packages/server/src/spawner.js
git commit -m "refactor: extract generateTerminalTitle to shared module"
```

---

### Task 5: Add API routes — `GET /api/terminals` and `POST /api/link/:sessionId`

**Files:**
- Modify: `packages/server/src/routes-api.js`
- Modify: `packages/server/src/routes-api.test.js`

- [ ] **Step 1: Write failing tests for GET /api/terminals**

In `packages/server/src/routes-api.test.js`, add the mock for `listTerminalWindows` and `renameTerminal`. Update the `vi.mock("./focus.js", ...)` at the top:

```javascript
vi.mock("./focus.js", () => ({
  focusTerminal: vi.fn(),
  listTerminalWindows: vi.fn(),
  renameTerminal: vi.fn(),
}));
```

Add to the imports:

```javascript
import { focusTerminal, listTerminalWindows, renameTerminal } from "./focus.js";
```

Add `getLinkedHandles` to the `mockTracker`:

```javascript
const mockTracker = {
  getSession: vi.fn(),
  storeSpawnedInfo: vi.fn(),
  getLinkedHandles: vi.fn(),
};
```

Add test at the bottom of the file:

```javascript
describe("GET /api/terminals", () => {
  it("returns filtered terminal window list", async () => {
    mockTracker.getLinkedHandles.mockReturnValue(new Set([111]));
    listTerminalWindows.mockResolvedValue([
      { hwnd: 222, title: "cmd.exe" },
      { hwnd: 333, title: "PowerShell" },
    ]);

    const res = await request(server, "GET", "/api/terminals");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      terminals: [
        { hwnd: 222, title: "cmd.exe" },
        { hwnd: 333, title: "PowerShell" },
      ],
    });
    expect(mockTracker.getLinkedHandles).toHaveBeenCalled();
    expect(listTerminalWindows).toHaveBeenCalledWith(new Set([111]));
  });

  it("returns empty array when no terminals found", async () => {
    mockTracker.getLinkedHandles.mockReturnValue(new Set());
    listTerminalWindows.mockResolvedValue([]);

    const res = await request(server, "GET", "/api/terminals");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ terminals: [] });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --reporter verbose -- packages/server/src/routes-api.test.js`
Expected: FAIL — 404 (route not registered)

- [ ] **Step 3: Write failing tests for POST /api/link/:sessionId**

Add to `packages/server/src/routes-api.test.js`:

```javascript
describe("POST /api/link/:sessionId", () => {
  it("returns 404 for unknown session", async () => {
    mockTracker.getSession.mockReturnValue(null);

    const res = await request(server, "POST", "/api/link/unknown-id", { windowHandle: 123 });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Session not found" });
  });

  it("returns 400 if session is already spawned", async () => {
    mockTracker.getSession.mockReturnValue({
      id: "s1",
      spawned: true,
      displayName: "proj",
      cwd: "/proj",
    });

    const res = await request(server, "POST", "/api/link/s1", { windowHandle: 123 });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Session already linked" });
  });

  it("returns 400 if windowHandle is missing", async () => {
    mockTracker.getSession.mockReturnValue({
      id: "s1",
      spawned: false,
      displayName: "proj",
      cwd: "/proj",
    });

    const res = await request(server, "POST", "/api/link/s1", {});

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Missing windowHandle" });
  });

  it("links session successfully", async () => {
    mockTracker.getSession.mockReturnValue({
      id: "s1",
      spawned: false,
      displayName: "proj",
      cwd: "/proj",
    });
    renameTerminal.mockResolvedValue(true);

    const res = await request(server, "POST", "/api/link/s1", { windowHandle: 456 });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.terminalTitle).toMatch(/^claudia · proj-[0-9a-z]{2,}$/);
    expect(renameTerminal).toHaveBeenCalledWith(456, res.body.terminalTitle);
    expect(mockTracker.storeSpawnedInfo).toHaveBeenCalledWith("/proj", res.body.terminalTitle, 456);
  });
});
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `npm test -- --reporter verbose -- packages/server/src/routes-api.test.js`
Expected: FAIL — routes not registered

- [ ] **Step 5: Implement the routes in routes-api.js**

In `packages/server/src/routes-api.js`, add the import for `listTerminalWindows`, `renameTerminal`, and `generateTerminalTitle` at the top:

```javascript
import { focusTerminal, listTerminalWindows, renameTerminal } from "./focus.js";
import { generateTerminalTitle } from "./terminal-title.js";
```

(Remove the old single import of `focusTerminal` from `./focus.js`.)

Inside `registerApiRoutes`, before the `// Trigger terminal focus` comment block, add:

```javascript
  // --- Terminal linking API ---

  app.get("/api/terminals", async (req, res) => {
    const excludeHandles = tracker.getLinkedHandles();
    const terminals = await listTerminalWindows(excludeHandles);
    res.json({ terminals });
  });

  app.post("/api/link/:sessionId", async (req, res) => {
    const session = tracker.getSession(req.params.sessionId);
    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }
    if (session.spawned) {
      return res.status(400).json({ error: "Session already linked" });
    }
    const { windowHandle } = req.body;
    if (!windowHandle || typeof windowHandle !== "number") {
      return res.status(400).json({ error: "Missing windowHandle" });
    }

    const terminalTitle = generateTerminalTitle(session.cwd);
    await renameTerminal(windowHandle, terminalTitle);
    tracker.storeSpawnedInfo(session.cwd, terminalTitle, windowHandle);

    console.log(`[link] session=${session.displayName} title=${terminalTitle} hwnd=${windowHandle}`);
    res.json({ ok: true, terminalTitle });
  });
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test -- --reporter verbose -- packages/server/src/routes-api.test.js`
Expected: All tests PASS

- [ ] **Step 7: Run all server tests to verify nothing is broken**

Run: `npm test -- --reporter verbose -- packages/server`
Expected: All tests PASS

- [ ] **Step 8: Commit**

```bash
git add packages/server/src/routes-api.js packages/server/src/routes-api.test.js
git commit -m "feat: add terminal listing and linking API routes"
```

---

### Task 6: Update SessionCard.svelte — "unlinked" pill with dropdown

**Files:**
- Modify: `packages/web/src/lib/SessionCard.svelte`

- [ ] **Step 1: Rename "ext" to "unlinked" and make it clickable**

In `packages/web/src/lib/SessionCard.svelte`, replace the orphan badge span (line 69):

Old:
```svelte
{#if !session.spawned}<span class="orphan-badge" title="External session — focus is best-effort">ext</span>{/if}
```

New:
```svelte
{#if !session.spawned}
  <span class="orphan-badge" title="Click to link a terminal" role="button" tabindex="0" onclick={openLinkDropdown} onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), openLinkDropdown(e))}>unlinked</span>
{/if}
```

- [ ] **Step 2: Add dropdown state and fetch logic**

In the `<script>` section, add after the existing `let elapsed = $state("")`:

```javascript
  let showLinkDropdown = $state(false);
  let terminalList = $state([]);
  let linkLoading = $state(false);
  let linkError = $state("");

  async function openLinkDropdown(e) {
    e.stopPropagation();
    if (showLinkDropdown) {
      showLinkDropdown = false;
      return;
    }
    linkLoading = true;
    linkError = "";
    showLinkDropdown = true;
    try {
      const res = await fetch("/api/terminals");
      const data = await res.json();
      terminalList = data.terminals || [];
    } catch {
      terminalList = [];
      linkError = "Failed to load terminals";
    } finally {
      linkLoading = false;
    }
  }

  async function linkTerminal(hwnd) {
    try {
      await fetch(`/api/link/${session.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ windowHandle: hwnd }),
      });
    } catch {
      // best-effort
    }
    showLinkDropdown = false;
  }

  function closeLinkDropdown(e) {
    // Close if click is outside the dropdown
    if (showLinkDropdown) {
      showLinkDropdown = false;
    }
  }
```

- [ ] **Step 3: Add dropdown markup**

In the template, right after the closing `</span>` of the name span (after the orphan badge `{/if}`), add:

```svelte
{#if showLinkDropdown}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="link-dropdown" onclick={(e) => e.stopPropagation()}>
    {#if linkLoading}
      <div class="link-dropdown-item link-dropdown-empty">Loading...</div>
    {:else if linkError}
      <div class="link-dropdown-item link-dropdown-empty">{linkError}</div>
    {:else if terminalList.length === 0}
      <div class="link-dropdown-item link-dropdown-empty">No terminals found</div>
    {:else}
      {#each terminalList as terminal}
        <button class="link-dropdown-item" onclick={() => linkTerminal(terminal.hwnd)}>
          {terminal.title}
        </button>
      {/each}
    {/if}
  </div>
{/if}
```

Also add a click-outside handler. At the top of the `<script>` section, add:

```javascript
  import { onMount } from "svelte";

  onMount(() => {
    const handler = (e) => {
      if (showLinkDropdown) showLinkDropdown = false;
    };
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  });
```

- [ ] **Step 4: Add dropdown styles**

In the `<style>` section, update the `.orphan-badge` style to make it clickable, and add new dropdown styles:

```css
  .orphan-badge {
    font-size: 9px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--text-faint);
    background: var(--bg-raised);
    padding: 2px 6px;
    border-radius: 6px;
    margin-left: 6px;
    vertical-align: middle;
    cursor: pointer;
    transition: color var(--duration-normal, 150ms) var(--ease-in-out, ease),
                background var(--duration-normal, 150ms) var(--ease-in-out, ease);
  }

  .orphan-badge:hover {
    color: var(--text-muted);
    background: var(--bg-hover, var(--bg-raised));
  }

  .link-dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    margin-top: 4px;
    min-width: 240px;
    max-width: 360px;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    z-index: 100;
    overflow: hidden;
  }

  .link-dropdown-item {
    all: unset;
    display: block;
    width: 100%;
    padding: 8px 12px;
    font-family: var(--font-mono, monospace);
    font-size: 0.75rem;
    color: var(--text-muted);
    cursor: pointer;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    box-sizing: border-box;
  }

  .link-dropdown-item:hover {
    background: var(--bg-hover, var(--bg-raised));
    color: var(--text-primary, var(--text));
  }

  .link-dropdown-empty {
    color: var(--text-faint);
    cursor: default;
    font-family: var(--font-body, sans-serif);
  }

  .link-dropdown-empty:hover {
    background: none;
    color: var(--text-faint);
  }
```

- [ ] **Step 5: Make the card-left position relative for dropdown positioning**

Update `.card-left` style to add `position: relative`:

```css
  .card-left {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
    position: relative;
  }
```

- [ ] **Step 6: Build and verify**

Run: `npm run build`
Expected: Build succeeds with no errors

- [ ] **Step 7: Commit**

```bash
git add packages/web/src/lib/SessionCard.svelte
git commit -m "feat: add terminal linking dropdown to session card"
```

---

### Task 7: Manual integration test

**Files:** None (verification only)

- [ ] **Step 1: Run full test suite**

Run: `npm test`
Expected: All tests PASS

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: No errors (warnings acceptable)

- [ ] **Step 3: Start dev server and verify visually**

Run: `npm run dev`

Verify:
1. Open a Claude Code session in a standalone terminal (not spawned by Claudia)
2. The session card should show "unlinked" pill instead of "ext"
3. Click the "unlinked" pill — dropdown appears with terminal windows
4. Select the correct terminal — pill disappears, session becomes clickable
5. Click the session card — terminal focuses with blue flash
6. Close the terminal — session card disappears after dead window pruning

- [ ] **Step 4: Fix any lint issues**

Run: `npm run lint:fix`

- [ ] **Step 5: Final commit if lint fixes were needed**

```bash
git add -A
git commit -m "fix: lint fixes for terminal linking"
```
