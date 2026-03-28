# Terminal Detection Fix — EnumWindows Migration

**Date:** 2026-03-29
**Status:** Investigation complete, ready for implementation

## Problem

The "link terminal" dropdown in Claudia shows incomplete results. On Windows, `listTerminalWindows()` in `focus.js` uses `Get-Process` to enumerate terminals. `Get-Process` returns **one row per process**, but Windows Terminal uses a single process for all its windows. Result: only 1 window appears in the dropdown regardless of how many WT windows are open.

### Evidence

On a machine with 3 separate WT windows (no tabs):

- `Get-Process` returned **1** entry (HWND=458878, the "main" window)
- `EnumWindows` returned **3** entries, each with unique HWND and title

### What doesn't work

- **PID ancestry** (walking process tree from Claude Code up to WT): Conpty breaks parent-child chains. OpenConsole processes show no children via WMI, and intermediate parent PIDs die (npm exits after spawning node). Not viable.

### Tabs

Individual tabs within a WT window are not top-level windows — they share one HWND. EnumWindows won't see them individually. This is acceptable; tabs are a WT-internal concept. Each *window* gets detected, which is the fix needed.

## Solution

Replace `Get-Process` with Win32 `EnumWindows` via P/Invoke in the PowerShell command within `listTerminalWindows()` (`packages/server/src/focus.js`, lines 288-318).

### Current approach (broken)

```powershell
Get-Process | Where-Object {
  $names -contains $_.ProcessName
  -and $_.MainWindowHandle -ne 0
  -and $_.MainWindowTitle -ne ''
}
```

Returns 1 row per process. Misses multiple windows under the same process.

### New approach (EnumWindows)

Use C# P/Invoke via `Add-Type` to call:
- `EnumWindows` — iterate all top-level windows
- `IsWindowVisible` — filter to visible windows
- `GetWindowText` — get title
- `GetWindowThreadProcessId` — get owning PID

Then resolve PID → process name via `Get-Process -Id`, filter against `TERMINAL_PROCESS_NAMES` whitelist.

Output format stays the same: `{HWND}|{TITLE}` lines, parsed identically by the JS callback.

### Proven PowerShell snippet

```powershell
Add-Type @"
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
public class WinEnum {
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
    [DllImport("user32.dll")]
    public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
    [DllImport("user32.dll")]
    public static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
    [DllImport("user32.dll")]
    public static extern int GetWindowTextLength(IntPtr hWnd);
    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
    public static List<string> GetVisibleWindows() {
        var result = new List<string>();
        EnumWindows((hWnd, lParam) => {
            if (IsWindowVisible(hWnd)) {
                int len = GetWindowTextLength(hWnd);
                if (len > 0) {
                    var sb = new StringBuilder(len + 1);
                    GetWindowText(hWnd, sb, sb.Capacity);
                    uint procId;
                    GetWindowThreadProcessId(hWnd, out procId);
                    result.Add(hWnd.ToInt64() + "|" + procId + "|" + sb.ToString());
                }
            }
            return true;
        }, IntPtr.Zero);
        return result;
    }
}
"@
```

This was tested live and returned all 3 WT windows correctly.

## Scope

- **One file changed:** `packages/server/src/focus.js` — `listTerminalWindows()` function only
- **No API changes:** Output shape `[{ hwnd, title }]` stays identical
- **No frontend changes:** Dropdown consumes the same data
- **Process name filtering stays:** Same `TERMINAL_PROCESS_NAMES` whitelist, applied after EnumWindows via PID → process name lookup

## Risks

- **PowerShell `Add-Type` compilation:** First invocation compiles the C# snippet, adding ~200-500ms latency. Subsequent calls in the same PS session don't recompile, but since we spawn a new `powershell` process each time, this cost is paid every call. Acceptable — the current `Get-Process` approach already has similar overhead.
- **PID → process name resolution:** `Get-Process -Id` for each window adds per-window overhead. Mitigated by only resolving visible windows with titles (typically <20 on any machine).
