import { exec, execFile } from "node:child_process";
import { platform } from "node:os";

const currentPlatform = platform();

const strategies = {
  win32: focusWindows,
  darwin: focusMac,
  linux: focusLinux,
};

export function focusTerminal(displayName) {
  const strategy = strategies[currentPlatform] || focusFallback;
  return strategy(sanitize(displayName));
}

function runExec(command) {
  return new Promise((resolve) => {
    exec(command, { timeout: 5000 }, (err) => {
      resolve(!err);
    });
  });
}

function runFile(cmd, args) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: 5000 }, (err) => {
      resolve(!err);
    });
  });
}

function focusWindows(name) {
  const ps = `
    Add-Type -Name Win -Namespace Native -MemberDefinition '
      [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    '
    $procs = Get-Process | Where-Object { $_.MainWindowTitle -match '${name}' }
    if ($procs) {
      [Native.Win]::SetForegroundWindow($procs[0].MainWindowHandle)
    } else {
      $terms = Get-Process -Name WindowsTerminal,cmd,powershell -ErrorAction SilentlyContinue
      if ($terms) { [Native.Win]::SetForegroundWindow($terms[0].MainWindowHandle) }
    }
  `.trim();
  return runFile("powershell", ["-NoProfile", "-Command", ps]);
}

function focusMac(name) {
  const script = `
    tell application "System Events"
      set termApps to {"Terminal", "iTerm2", "Alacritty", "kitty", "Warp"}
      repeat with appName in termApps
        if (exists process appName) then
          set appProc to process appName
          repeat with w in windows of appProc
            if name of w contains "${name}" then
              set frontmost of appProc to true
              perform action "AXRaise" of w
              return
            end if
          end repeat
        end if
      end repeat
      repeat with appName in termApps
        if (exists process appName) then
          set frontmost of process appName to true
          return
        end if
      end repeat
    end tell
  `.trim();
  return runFile("osascript", ["-e", script]);
}

async function focusLinux(name) {
  if (await runFile("wmctrl", ["-a", name])) return true;
  if (await runFile("xdotool", ["search", "--name", name, "windowactivate"])) return true;
  return runExec(`wmctrl -a Terminal || xdotool search --class terminal windowactivate`);
}

function focusFallback() {
  return Promise.resolve(false);
}

// Allowlist: only keep characters safe for window title matching
function sanitize(str) {
  return str.replace(/[^a-zA-Z0-9\-_. ]/g, "");
}
