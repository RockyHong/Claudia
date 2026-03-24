import { spawn, execFile } from "node:child_process";
import { platform } from "node:os";

const currentPlatform = platform();

/**
 * Spawn a terminal running `claude` in the given directory.
 * Returns { windowHandle } — lifecycle is managed by Claude Code hooks.
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
  const child = spawn("cmd", ["/k", "claude"], {
    detached: true,
    stdio: "ignore",
    cwd,
  });
  child.unref();

  await sleep(1000);
  const windowHandle = await getWindowHandleByPid(child.pid);

  return { windowHandle };
}

async function spawnMac(cwd) {
  const escapedCwd = cwd.replace(/'/g, "'\\''");
  const script = `tell application "Terminal"
    activate
    do script "cd '${escapeAppleScript(escapedCwd)}' && claude"
  end tell`;

  spawn("osascript", ["-e", script], {
    detached: true,
    stdio: "ignore",
  }).unref();

  return { windowHandle: null };
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
    setTimeout(() => {
      child.unref();
      resolve({ windowHandle: null });
    }, 500);
  });
}

function getWindowHandleByPid(pid) {
  return new Promise((resolve) => {
    const ps = "$p = Get-Process -Id " + pid + " -ErrorAction SilentlyContinue; if ($p) { $p.MainWindowHandle } else { 0 }";

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
