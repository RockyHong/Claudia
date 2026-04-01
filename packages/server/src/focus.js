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
 * Focus a terminal window by HWND (spawned sessions)
 * or by display name (best-effort for orphan sessions).
 */
export function focusTerminal(
	displayName,
	intent = "navigate",
	windowHandle = null,
) {
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
	'  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);',
	'  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);',
	'  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);',
	'  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();',
	'  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, IntPtr lpdwProcessId);',
	'  [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();',
	'  [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);',
	'  [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr hWnd);',
	'  [DllImport("shcore.dll")] public static extern int SetProcessDpiAwareness(int value);',
	"  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }",
	'  [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr hwnd, int attr, out RECT rect, int cbSize);',
	"  public static RECT GetWindowBounds(IntPtr hwnd) { RECT r; DwmGetWindowAttribute(hwnd, 9, out r, Marshal.SizeOf(typeof(RECT))); return r; }",
	"  [StructLayout(LayoutKind.Sequential)] public struct FLASHWINFO { public uint cbSize; public IntPtr hwnd; public uint dwFlags; public uint uCount; public uint dwTimeout; }",
	'  [DllImport("user32.dll")] public static extern bool FlashWindowEx(ref FLASHWINFO pfwi);',
	"  public static void Flash(IntPtr hwnd) { FLASHWINFO fi = new FLASHWINFO(); fi.cbSize = (uint)Marshal.SizeOf(typeof(FLASHWINFO)); fi.hwnd = hwnd; fi.dwFlags = 14; fi.uCount = 5; fi.dwTimeout = 0; FlashWindowEx(ref fi); }",
	"  public static void ForceForeground(IntPtr hwnd) {",
	"    if (IsIconic(hwnd)) ShowWindow(hwnd, 9);",
	"    IntPtr fg = GetForegroundWindow();",
	"    uint fgThread = GetWindowThreadProcessId(fg, IntPtr.Zero);",
	"    uint curThread = GetCurrentThreadId();",
	"    if (fgThread != curThread) {",
	"      AttachThreadInput(curThread, fgThread, true);",
	"      BringWindowToTop(hwnd);",
	"      SetForegroundWindow(hwnd);",
	"      AttachThreadInput(curThread, fgThread, false);",
	"    } else { SetForegroundWindow(hwnd); }",
	"  }",
	"}",
].join("\n");

function buildWindowsFlashScript(color) {
	return [
		"  [WinHelper]::Flash($hwnd)",
		"  [WinHelper]::ForceForeground($hwnd)",
		"  Start-Sleep -Milliseconds 50",
		"  if (-not [WinHelper]::IsIconic($hwnd)) {",
		"    $rect = [WinHelper]::GetWindowBounds($hwnd)",
		"    $w = $rect.Right - $rect.Left",
		"    $h = $rect.Bottom - $rect.Top",
		"    if ($w -gt 0 -and $h -gt 0) {",
		"      $form = New-Object System.Windows.Forms.Form",
		"      $form.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::None",
		"      $form.BackColor = [System.Drawing.Color]::FromArgb(" +
			color.r +
			", " +
			color.g +
			", " +
			color.b +
			")",
		"      $form.Opacity = 0.3",
		"      $form.TopMost = $true",
		"      $form.ShowInTaskbar = $false",
		"      $form.StartPosition = [System.Windows.Forms.FormStartPosition]::Manual",
		"      $form.Location = New-Object System.Drawing.Point($rect.Left, $rect.Top)",
		"      $form.Size = New-Object System.Drawing.Size($w, $h)",
		"      $form.Show()",
		"      Start-Sleep -Milliseconds 200",
		"      for ($i = 6; $i -ge 0; $i--) {",
		"        $form.Opacity = $i * 0.05",
		"        $form.Refresh()",
		"        Start-Sleep -Milliseconds 30",
		"      }",
		"      $form.Close()",
		"    }",
		"  }",
	];
}

function focusWindows(name, color, windowHandle) {
	// Use stored HWND (spawned) or fall back to title matching (orphan, best-effort).
	const findWindow = windowHandle
		? [`$hwnd = [IntPtr]${windowHandle}`]
		: [
				"$hwnd = [IntPtr]::Zero",
				"$p = Get-Process | Where-Object { $_.MainWindowTitle -match [regex]::Escape('" +
					name.replace(/'/g, "''") +
					"') -and $_.MainWindowHandle -ne 0 } | Select-Object -First 1",
				"if ($p) { $hwnd = $p.MainWindowHandle }",
			];

	const ps = [
		"Add-Type -AssemblyName System.Windows.Forms",
		`Add-Type -Language CSharp @"\n${WIN_HELPER_CS}\n"@`,
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
      delay 0.2
      repeat with i from 6 to 0 by -1
        overlay's setAlphaValue:(i * 0.05)
        delay 0.03
      end repeat
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
import time
time.sleep(0.2)
for i in range(6, -1, -1):
    root.attributes('-alpha', i * 0.05)
    root.update()
    time.sleep(0.03)
root.destroy()
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

/**
 * Check which window handles from the given array are no longer valid.
 * Returns a Set of handles whose windows have been closed.
 * Only works on win32 — returns empty set on other platforms.
 */
export function findDeadWindows(handles) {
	if (currentPlatform !== "win32" || handles.length === 0) {
		return Promise.resolve(new Set());
	}

	const handleList = handles.join(",");
	const ps = [
		'Add-Type -Language CSharp @"\nusing System; using System.Runtime.InteropServices;\npublic class WinCheck { [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr hWnd); }\n"@',
		`$handles = @(${handleList})`,
		"$handles | ForEach-Object { if (-not [WinCheck]::IsWindow([IntPtr]$_)) { $_ } }",
	].join("\n");

	return new Promise((resolve) => {
		execFile(
			"powershell",
			["-NoProfile", "-Command", ps],
			{ timeout: 10000 },
			(err, stdout) => {
				if (err) return resolve(new Set());
				const dead = new Set(
					stdout
						.trim()
						.split(/\r?\n/)
						.filter(Boolean)
						.map(Number)
						.filter((n) => n > 0),
				);
				resolve(dead);
			},
		);
	});
}

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
		`[WinTitle]::SetWindowText([IntPtr]${Math.trunc(Number(windowHandle))}, '${escaped}')`,
	].join("\n");

	return runFile("powershell", ["-NoProfile", "-Command", ps]);
}

// Allowlist: only keep characters safe for window title matching
function sanitize(str) {
	return str.replace(/[^a-zA-Z0-9\-_. ]/g, "");
}
