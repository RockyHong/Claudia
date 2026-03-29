# Terminal Detection Fix — EnumWindows Migration

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `Get-Process` with `EnumWindows` in `listTerminalWindows()` so multiple Windows Terminal windows are detected.

**Architecture:** Single function replacement in `focus.js`. The PowerShell command inside `listTerminalWindows()` switches from `Get-Process` (one row per process) to a C# P/Invoke `EnumWindows` approach (one row per visible window). Output format stays `{HWND}|{TITLE}`, parsed identically.

**Tech Stack:** Node.js, PowerShell, C# P/Invoke (Win32 user32.dll)

---

### Task 1: Update the listTerminalWindows PowerShell command

**Files:**
- Modify: `packages/server/src/focus.js:288-318`

- [ ] **Step 1: Replace the PowerShell command in listTerminalWindows**

Replace lines 294-297 of `focus.js` (the `nameFilter` and `ps` construction) with the EnumWindows approach. The new PowerShell script:

1. Defines a C# class `WinEnum` with P/Invoke signatures for `EnumWindows`, `IsWindowVisible`, `GetWindowText`, `GetWindowTextLength`, `GetWindowThreadProcessId`
2. Calls `WinEnum.GetVisibleWindows()` to get all visible titled windows as `"HWND|PID|TITLE"` lines
3. For each line, resolves PID → process name via `Get-Process -Id`
4. Filters against the `TERMINAL_PROCESS_NAMES` whitelist
5. Outputs `"HWND|TITLE"` lines (same format the JS parser expects)

Replace this code in `listTerminalWindows()`:

```javascript
  const nameFilter = TERMINAL_PROCESS_NAMES.map((n) => `'${n}'`).join(",");
  const ps = [
    `$names = @(${nameFilter})`,
    "Get-Process | Where-Object { $names -contains $_.ProcessName -and $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle -ne '' } | ForEach-Object { \"$($_.MainWindowHandle)|$($_.MainWindowTitle)\" }",
  ].join("\n");
```

With:

```javascript
  const nameFilter = TERMINAL_PROCESS_NAMES.map((n) => `'${n}'`).join(",");
  const enumCs = [
    "using System; using System.Collections.Generic; using System.Runtime.InteropServices; using System.Text;",
    "public class WinEnum {",
    "  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);",
    '  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);',
    '  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);',
    '  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);',
    '  [DllImport("user32.dll")] public static extern int GetWindowTextLength(IntPtr hWnd);',
    '  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);',
    "  public static List<string> GetVisibleWindows() {",
    "    var result = new List<string>();",
    "    EnumWindows((hWnd, lParam) => {",
    "      if (IsWindowVisible(hWnd)) {",
    "        int len = GetWindowTextLength(hWnd);",
    "        if (len > 0) {",
    "          var sb = new StringBuilder(len + 1);",
    "          GetWindowText(hWnd, sb, sb.Capacity);",
    "          uint procId;",
    "          GetWindowThreadProcessId(hWnd, out procId);",
    '          result.Add(hWnd.ToInt64() + "|" + procId + "|" + sb.ToString());',
    "        }",
    "      }",
    "      return true;",
    "    }, IntPtr.Zero);",
    "    return result;",
    "  }",
    "}",
  ].join("\n");
  const ps = [
    `$names = @(${nameFilter})`,
    'Add-Type -Language CSharp @"\n' + enumCs + '\n"@',
    "[WinEnum]::GetVisibleWindows() | ForEach-Object {",
    "  $parts = $_ -split '\\|', 3",
    "  $hwnd = $parts[0]",
    "  $pid = [int]$parts[1]",
    "  $title = $parts[2]",
    "  try {",
    "    $proc = Get-Process -Id $pid -ErrorAction Stop",
    "    if ($names -contains $proc.ProcessName) {",
    '      "$hwnd|$title"',
    "    }",
    "  } catch {}",
    "}",
  ].join("\n");
```

The JS parsing callback (lines 303-316) remains completely unchanged — it already parses `HWND|TITLE` lines.

- [ ] **Step 2: Run tests to verify nothing broke**

Run: `npm test --prefix packages/server -- --run focus.test`

Expected: All existing tests pass. The tests mock `execFile` so they don't execute real PowerShell — they verify call structure and output parsing, which haven't changed.

- [ ] **Step 3: Verify the PowerShell script content in the test**

The existing test at line 189 (`"returns terminal windows from powershell stdout"`) tests the **output parsing**, not the PS command itself. It feeds `"12345|Windows Terminal\n67890|cmd.exe - prompt\n"` as stdout and asserts the parsed result. This test still passes as-is because the output format is unchanged.

Check that the test at line 124 (`"uses Get-Process title matching when windowHandle is null"`) does NOT break. This test is for `focusTerminal` (the focus function), not `listTerminalWindows`. It tests the fallback title search in `focusWindows()`, which still uses `Get-Process`. This is a separate code path — no changes needed.

Run: `npm test --prefix packages/server -- --run focus.test`

Expected: All 24 tests pass.

- [ ] **Step 4: Manual smoke test**

Open 2+ separate Windows Terminal windows. Run the Claudia server and check the "link terminal" dropdown in the web UI. All WT windows should appear as separate entries.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/focus.js
git commit -m "fix: use EnumWindows for terminal detection to find multiple WT windows"
```
