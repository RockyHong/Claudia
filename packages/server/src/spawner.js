import { spawn, execFile } from "node:child_process";
import { platform } from "node:os";

const currentPlatform = platform();

/**
 * Spawn a terminal running `claude` in the given directory.
 * Returns { pid, windowHandle } where windowHandle is available on Windows.
 *
 * The spawned terminal is detached — it survives if Claudia exits.
 */
export async function spawnSession(cwd) {
  const strategy = strategies[currentPlatform];
  if (!strategy) throw new Error(`Unsupported platform: ${currentPlatform}`);
  return strategy(cwd);
}

const strategies = {
  win32: spawnWindows,
  darwin: spawnMac,
  linux: spawnLinux,
};

async function spawnWindows(cwd) {
  // Spawn Windows Terminal (or cmd as fallback) running claude.
  // Use `start` via cmd to get a detached window, then grab the handle.
  const child = spawn("cmd", ["/c", "start", "wt", "-d", cwd, "cmd", "/k", "claude"], {
    detached: true,
    stdio: "ignore",
    cwd,
  });
  child.unref();

  // Give the terminal time to create its window
  await sleep(1500);

  // Find the most recently created Windows Terminal window
  const windowHandle = await getNewestWindowHandle();

  return { pid: child.pid, windowHandle };
}

async function spawnMac(cwd) {
  const escapedCwd = cwd.replace(/'/g, "'\\''");
  const script = `tell application "Terminal"
    activate
    do script "cd '${escapeAppleScript(escapedCwd)}' && claude"
  end tell`;

  const child = spawn("osascript", ["-e", script], {
    detached: true,
    stdio: "ignore",
  });
  child.unref();

  return { pid: child.pid, windowHandle: null };
}

async function spawnLinux(cwd) {
  const escapedCwd = cwd.replace(/'/g, "'\\''");
  const terminals = [
    { cmd: "gnome-terminal", args: ["--", "bash", "-c", `cd '${escapedCwd}' && claude; exec bash`] },
    { cmd: "xterm", args: ["-e", `cd '${escapedCwd}' && claude; exec bash`] },
    { cmd: "x-terminal-emulator", args: ["-e", `cd '${escapedCwd}' && claude; exec bash`] },
  ];

  for (const { cmd, args } of terminals) {
    const result = await trySpawn(cmd, args, cwd);
    if (result) return result;
  }

  throw new Error("No terminal emulator found");
}

function trySpawn(cmd, args, cwd) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      detached: true,
      stdio: "ignore",
      cwd,
    });
    child.on("error", () => resolve(null));
    // If no error within 500ms, assume success
    setTimeout(() => {
      child.unref();
      resolve({ pid: child.pid, windowHandle: null });
    }, 500);
  });
}

function getNewestWindowHandle() {
  return new Promise((resolve) => {
    const ps = [
      "$p = Get-Process -Name WindowsTerminal,cmd,powershell -ErrorAction SilentlyContinue",
      "| Where-Object { $_.MainWindowHandle -ne 0 }",
      "| Sort-Object StartTime -Descending",
      "| Select-Object -First 1",
      "if ($p) { $p.MainWindowHandle } else { 0 }",
    ].join(" ");

    execFile("powershell", ["-NoProfile", "-Command", ps], { timeout: 5000 }, (err, stdout) => {
      if (err) return resolve(null);
      const handle = parseInt(stdout.trim(), 10);
      resolve(handle && handle !== 0 ? handle : null);
    });
  });
}

/**
 * Open a native folder picker dialog. Returns the selected path or null if cancelled.
 */
export async function browseFolder() {
  const strategy = browseStrategies[currentPlatform];
  if (!strategy) throw new Error(`Unsupported platform: ${currentPlatform}`);
  return strategy();
}

const browseStrategies = {
  win32: browseWindows,
  darwin: browseMac,
  linux: browseLinux,
};

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
  "  public static string Pick() {",
  "    var d = (IFileOpenDialog)new FileOpenDialogRCW();",
  "    d.SetOptions(0x20 | 0x800 | 0x1000);",
  "    d.SetTitle(\"Select project folder\");",
  "    if (d.Show(IntPtr.Zero) != 0) return \"\";",
  "    IShellItem item; d.GetResult(out item);",
  "    string path; item.GetDisplayName(0x80058000, out path);",
  "    return path;",
  "  }",
  "}",
].join("\n");

function browseWindows() {
  return new Promise((resolve) => {
    const ps = [
      'Add-Type -Language CSharp @"\n' + FOLDER_PICKER_CS + '\n"@',
      "[FolderPicker]::Pick()",
    ].join("; ");

    execFile("powershell", ["-NoProfile", "-STA", "-Command", ps], { timeout: 60000 }, (err, stdout) => {
      if (err) return resolve(null);
      const selected = stdout.trim();
      resolve(selected || null);
    });
  });
}

function browseMac() {
  return new Promise((resolve) => {
    const script = 'try\nset f to POSIX path of (choose folder with prompt "Select project folder")\nf\non error\n""\nend try';
    execFile("osascript", ["-e", script], { timeout: 60000 }, (err, stdout) => {
      if (err) return resolve(null);
      const selected = stdout.trim();
      resolve(selected || null);
    });
  });
}

function browseLinux() {
  return new Promise((resolve) => {
    execFile("zenity", ["--file-selection", "--directory", "--title=Select project folder"], { timeout: 60000 }, (err, stdout) => {
      if (err) return resolve(null);
      const selected = stdout.trim();
      resolve(selected || null);
    });
  });
}

function escapeAppleScript(str) {
  return str.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
