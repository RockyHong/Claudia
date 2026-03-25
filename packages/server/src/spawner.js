import { spawn, execFile } from "node:child_process";
import { platform } from "node:os";

const currentPlatform = platform();

/**
 * Spawn a terminal running `claude` in the given directory.
 * Returns { terminalTitle, windowHandle } — a unique title set on the terminal
 * window for display, and the HWND found by polling for that title.
 */
export async function spawnSession(cwd) {
  const strategy = strategies[currentPlatform];
  if (!strategy) throw new Error(`Unsupported platform: ${currentPlatform}`);
  return strategy(cwd);
}

let spawnCounter = 0;

function generateTerminalTitle(cwd) {
  const name = cwd.replace(/\\/g, "/").split("/").filter(Boolean).pop() || "session";
  const uid = (++spawnCounter).toString(36).padStart(2, "0");
  return `claudia · ${name}-${uid}`;
}

const strategies = {
  win32: spawnWindows,
  darwin: spawnMac,
  linux: spawnLinux,
};

async function spawnWindows(cwd) {
  const terminalTitle = generateTerminalTitle(cwd);
  const fwdCwd = cwd.replace(/\\/g, "/");

  // Launch in a dedicated WT window via PowerShell (resolves Store app alias).
  // --suppressApplicationTitle keeps our title even after Claude starts.
  const wtArgs = ["-w", "new", "--title", terminalTitle, "--suppressApplicationTitle", "-d", fwdCwd, "cmd", "/k", "claude"];
  const psList = wtArgs.map((a) => '"' + a.replace(/"/g, '`"') + '"').join(",");
  const ps = `Start-Process wt -ArgumentList @(${psList})`;

  await runPowerShell(ps);

  // Poll for the window by its unique title, then store the HWND for focus.
  const windowHandle = await findWindowByTitle(terminalTitle);

  return { terminalTitle, windowHandle };
}

function runPowerShell(command) {
  return new Promise((resolve) => {
    execFile("powershell", ["-NoProfile", "-Command", command], { timeout: 10000 }, (err) => {
      resolve(!err);
    });
  });
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

  return { terminalTitle: null, windowHandle: null };
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
      resolve({ terminalTitle: null, windowHandle: null });
    }, 500);
  });
}

function findWindowByTitle(title) {
  const escaped = title.replace(/'/g, "''");
  const ps = [
    "$hwnd = 0",
    "for ($i = 0; $i -lt 10; $i++) {",
    "  $p = Get-Process | Where-Object { $_.MainWindowTitle -eq '" + escaped + "' -and $_.MainWindowHandle -ne 0 } | Select-Object -First 1",
    "  if ($p) { $hwnd = $p.MainWindowHandle; break }",
    "  Start-Sleep -Milliseconds 500",
    "}",
    "$hwnd",
  ].join("\n");

  return new Promise((resolve) => {
    execFile("powershell", ["-NoProfile", "-Command", ps], { timeout: 10000 }, (err, stdout) => {
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
