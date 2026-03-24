import { exec, execFile } from "node:child_process";
import { platform } from "node:os";

const currentPlatform = platform();

const strategies = {
  win32: focusWindows,
  darwin: focusMac,
  linux: focusLinux,
};

const FLASH_COLORS = {
  navigate: { r: 100, g: 160, b: 255, hex: "#64A0FF" },
  alert: { r: 255, g: 180, b: 80, hex: "#FFB450" },
};

/**
 * Focus a terminal window by name (best-effort for orphan sessions)
 * or by window handle (reliable for spawned sessions, added in Phase 6).
 */
export function focusTerminal(displayName, intent = "navigate", windowHandle = null) {
  const strategy = strategies[currentPlatform] || focusFallback;
  const color = FLASH_COLORS[intent] || FLASH_COLORS.navigate;
  return strategy(sanitize(displayName), color, windowHandle);
}

function runExec(command) {
  return new Promise((resolve) => {
    exec(command, { timeout: 10000 }, (err) => {
      resolve(!err);
    });
  });
}

function runFile(cmd, args) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: 10000 }, (err) => {
      resolve(!err);
    });
  });
}

// C# helper shared by all Windows focus calls.
// Compiled once per PowerShell invocation.
const WIN_HELPER_CS = [
  "using System;",
  "using System.Runtime.InteropServices;",
  "public class WinHelper {",
  "  [DllImport(\"user32.dll\")] public static extern bool SetForegroundWindow(IntPtr hWnd);",
  "  [DllImport(\"user32.dll\")] public static extern bool IsIconic(IntPtr hWnd);",
  "  [DllImport(\"shcore.dll\")] public static extern int SetProcessDpiAwareness(int value);",
  "  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }",
  "  [DllImport(\"dwmapi.dll\")] public static extern int DwmGetWindowAttribute(IntPtr hwnd, int attr, out RECT rect, int cbSize);",
  "  public static RECT GetWindowBounds(IntPtr hwnd) { RECT r; DwmGetWindowAttribute(hwnd, 9, out r, Marshal.SizeOf(typeof(RECT))); return r; }",
  "  [StructLayout(LayoutKind.Sequential)] public struct FLASHWINFO { public uint cbSize; public IntPtr hwnd; public uint dwFlags; public uint uCount; public uint dwTimeout; }",
  "  [DllImport(\"user32.dll\")] public static extern bool FlashWindowEx(ref FLASHWINFO pfwi);",
  "  public static void Flash(IntPtr hwnd) { FLASHWINFO fi = new FLASHWINFO(); fi.cbSize = (uint)Marshal.SizeOf(typeof(FLASHWINFO)); fi.hwnd = hwnd; fi.dwFlags = 14; fi.uCount = 5; fi.dwTimeout = 0; FlashWindowEx(ref fi); }",
  "}",
].join("\n");

function buildWindowsFlashScript(color) {
  return [
    "  [WinHelper]::Flash($hwnd)",
    "  if (-not [WinHelper]::IsIconic($hwnd)) {",
    "    $rect = [WinHelper]::GetWindowBounds($hwnd)",
    "    $w = $rect.Right - $rect.Left",
    "    $h = $rect.Bottom - $rect.Top",
    "    if ($w -gt 0 -and $h -gt 0) {",
    "      $form = New-Object System.Windows.Forms.Form",
    "      $form.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::None",
    "      $form.BackColor = [System.Drawing.Color]::FromArgb(" + color.r + ", " + color.g + ", " + color.b + ")",
    "      $form.Opacity = 0.3",
    "      $form.TopMost = $true",
    "      $form.ShowInTaskbar = $false",
    "      $form.StartPosition = [System.Windows.Forms.FormStartPosition]::Manual",
    "      $form.Location = New-Object System.Drawing.Point($rect.Left, $rect.Top)",
    "      $form.Size = New-Object System.Drawing.Size($w, $h)",
    "      $form.Show()",
    "      Start-Sleep -Milliseconds 400",
    "      $form.Close()",
    "    }",
    "    [WinHelper]::SetForegroundWindow($hwnd) | Out-Null",
    "  }",
  ];
}

function focusWindows(name, color, windowHandle) {
  // If we have a stored window handle (spawned session), use it directly.
  // Otherwise fall back to title matching (orphan sessions, best-effort).
  const findWindow = windowHandle
    ? ["$hwnd = [IntPtr]" + windowHandle]
    : [
        "$hwnd = [IntPtr]::Zero",
        "$procs = Get-Process | Where-Object { $_.MainWindowTitle -match '" + name + "' }",
        "if (-not $procs) { $procs = Get-Process -Name WindowsTerminal,cmd,powershell -ErrorAction SilentlyContinue }",
        "if ($procs) { $hwnd = $procs[0].MainWindowHandle }",
      ];

  const ps = [
    "Add-Type -AssemblyName System.Windows.Forms",
    'Add-Type -Language CSharp @"\n' + WIN_HELPER_CS + '\n"@',
    "[WinHelper]::SetProcessDpiAwareness(2) | Out-Null",
    ...findWindow,
    "if ($hwnd -ne [IntPtr]::Zero) {",
    ...buildWindowsFlashScript(color),
    "}",
  ].join("\n");
  return runFile("powershell", ["-NoProfile", "-Command", ps]);
}

function focusMac(name, color, _windowHandle) {
  const script = `
    use framework "AppKit"
    use scripting additions

    on flashOverWindow(wx, wy, ww, wh)
      set screenH to current application's NSScreen's mainScreen()'s frame()'s |size|()'s height
      set flippedY to screenH - wy - wh
      set overlay to current application's NSWindow's alloc()'s initWithContentRect:{|x|:wx, y:flippedY, width:ww, height:wh} styleMask:0 backing:2 defer:false
      overlay's setLevel:999
      overlay's setOpaque:false
      overlay's setBackgroundColor:(current application's NSColor's colorWithRed:${(color.r / 255).toFixed(2)} green:${(color.g / 255).toFixed(2)} blue:${(color.b / 255).toFixed(2)} alpha:0.3)
      overlay's setIgnoresMouseEvents:true
      overlay's makeKeyAndOrderFront:missing value
      delay 0.4
      overlay's orderOut:missing value
    end flashOverWindow

    on bounceDock(appName)
      tell application appName to activate
    end bounceDock

    tell application "System Events"
      set termApps to {"Terminal", "iTerm2", "Alacritty", "kitty", "Warp"}
      repeat with appName in termApps
        if (exists process appName) then
          set appProc to process appName
          repeat with w in windows of appProc
            if name of w contains "${name}" then
              my bounceDock(appName as text)
              if not miniaturized of w then
                set {px, py} to position of w
                set {sx, sy} to size of w
                my flashOverWindow(px, py, sx, sy)
                set frontmost of appProc to true
                perform action "AXRaise" of w
              end if
              return
            end if
          end repeat
        end if
      end repeat
      repeat with appName in termApps
        if (exists process appName) then
          set appProc to process appName
          set w to front window of appProc
          set {px, py} to position of w
          set {sx, sy} to size of w
          my flashOverWindow(px, py, sx, sy)
          set frontmost of appProc to true
          return
        end if
      end repeat
    end tell
  `.trim();
  return runFile("osascript", ["-e", script]);
}

async function focusLinux(name, color, _windowHandle) {
  const flashAndFocus = `
    WID=$(xdotool search --name '${name}' 2>/dev/null | head -1)
    if [ -z "$WID" ]; then
      WID=$(xdotool search --class terminal 2>/dev/null | head -1)
    fi
    if [ -n "$WID" ]; then
      xdotool set_window --urgency 1 "$WID" 2>/dev/null
      STATE=$(xprop -id "$WID" WM_STATE 2>/dev/null | grep -c "Iconic")
      if [ "$STATE" -eq 0 ]; then
        eval $(xdotool getwindowgeometry --shell "$WID")
        if command -v python3 >/dev/null 2>&1; then
          python3 -c "
import tkinter as tk
root = tk.Tk()
root.overrideredirect(True)
root.attributes('-topmost', True)
root.attributes('-alpha', 0.3)
root.configure(bg='${color.hex}')
root.geometry(f'$WIDTH' + 'x' + '$HEIGHT' + '+' + '$X' + '+' + '$Y')
root.update()
root.after(400, root.destroy)
root.mainloop()
" &
        fi
        xdotool windowactivate "$WID"
      fi
    fi
  `;
  return runExec(flashAndFocus);
}

function focusFallback() {
  return Promise.resolve(false);
}

// Allowlist: only keep characters safe for window title matching
function sanitize(str) {
  return str.replace(/[^a-zA-Z0-9\-_. ]/g, "");
}
