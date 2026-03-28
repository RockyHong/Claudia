# Browse Folder Dialog Fix (Windows)

## Problem

Two bugs with the native folder picker dialog on Windows:

1. **Dialog opens behind the browser.** `IFileOpenDialog.Show(IntPtr.Zero)` passes no owner HWND, so Windows has no z-order anchor. The dialog often appears behind the focused browser window.

2. **"Waiting for selection..." can get stuck.** If the PowerShell process hangs (COM init failure, unusual dismissal path, process killed externally), the frontend has no way to recover — the button stays disabled until the 60-second `execFile` timeout fires.

Mac and Linux are unaffected — AppleScript's `choose folder` and Zenity are modal by default.

## Fix

Four changes, all Windows-scoped except the frontend cancel button (which benefits all platforms as a safety net).

### 1. Owner HWND for dialog z-order

In the C# `FolderPicker.Pick()` method, call `GetForegroundWindow()` and pass the result to `IFileOpenDialog.Show()`. This makes the dialog owned by the browser window, guaranteeing it appears on top.

**Before:**
```csharp
if (d.Show(IntPtr.Zero) != 0) return "";
```

**After:**
```csharp
[DllImport("user32.dll")]
static extern IntPtr GetForegroundWindow();

// in Pick():
if (d.Show(GetForegroundWindow()) != 0) return "";
```

### 2. Harden C# exit paths

Wrap COM calls in try/finally to ensure cleanup on every dismissal path (Cancel, X, Alt+F4, COM initialization failure). Explicitly release COM objects via `Marshal.ReleaseComObject`.

```csharp
public static string Pick() {
    IFileOpenDialog d = null;
    IShellItem item = null;
    try {
        d = (IFileOpenDialog)new FileOpenDialogRCW();
        d.SetOptions(0x20 | 0x800 | 0x1000);
        d.SetTitle("Select project folder");
        if (d.Show(GetForegroundWindow()) != 0) return "";
        d.GetResult(out item);
        string path;
        item.GetDisplayName(0x80058000, out path);
        return path;
    } catch {
        return "";
    } finally {
        if (item != null) Marshal.ReleaseComObject(item);
        if (d != null) Marshal.ReleaseComObject(d);
    }
}
```

### 3. Cancel button on frontend

Replace the disabled "Waiting for selection..." text with a clickable cancel button. On click:

1. Abort the `fetch` via `AbortController` — immediately resets the button.
2. Hit `POST /api/browse/cancel` — server kills the PowerShell child process, closing the orphaned dialog.

**Frontend changes (`SpawnPopover.svelte`):**

```javascript
let browseController = null;

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

**Button markup:**

```svelte
{#if browsing}
    <button class="browse-btn cancel" onclick={cancelBrowse}>
        Cancel
    </button>
{:else}
    <button class="browse-btn" onclick={browse}>
        <svg .../>
        Browse folder...
    </button>
{/if}
```

Style the cancel state with a distinct visual treatment (e.g., text color change to amber/warning) so it reads as an active action, not a disabled state.

**Server changes (`spawner.js` + `routes-api.js`):**

Track the active browse child process in module state:

```javascript
// spawner.js
let activeBrowseProcess = null;

function browseWindows() {
    return new Promise((resolve) => {
        const child = execFile("powershell", [...], (err, stdout) => {
            activeBrowseProcess = null;
            if (err) return resolve(null);
            resolve(stdout.trim() || null);
        });
        activeBrowseProcess = child;
    });
}

export function cancelBrowse() {
    if (activeBrowseProcess) {
        activeBrowseProcess.kill();
        activeBrowseProcess = null;
    }
}
```

```javascript
// routes-api.js
app.post("/api/browse/cancel", (req, res) => {
    cancelBrowse();
    res.json({ ok: true });
});
```

### 4. Remove timeout

Remove `{ timeout: 60000 }` from the Windows `execFile` call. The user controls lifecycle via the cancel button — no artificial cutoff. Mac and Linux timeouts are also removed for consistency (their dialogs are well-behaved and the cancel button serves as the universal escape hatch).

## Files Changed

| File | Change |
|------|--------|
| `packages/server/src/spawner.js` | HWND fix in C# code, try/finally cleanup, track active process, export `cancelBrowse()`, remove timeouts |
| `packages/server/src/routes-api.js` | Add `POST /api/browse/cancel` endpoint |
| `packages/web/src/lib/SpawnPopover.svelte` | AbortController, cancel button, cancel styling |

## Not Changed

- Mac/Linux browse implementations (no z-order fix needed, only timeout removal)
- No new dependencies
- No protocol changes (SSE events unaffected)

## Testing

- **Manual (Windows):** Open spawn modal, click Browse, verify dialog appears in front of browser. Click Cancel in web UI, verify dialog closes and button resets. Close dialog via X/Cancel/Alt+F4, verify button resets.
- **Unit:** `spawner.test.js` — mock `execFile`, verify `cancelBrowse()` kills the child process, verify null return on cancel.
- **Route:** `routes-api.test.js` — test `POST /api/browse/cancel` returns `{ ok: true }`.
