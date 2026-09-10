import { execFile } from "node:child_process";
import { platform } from "node:os";

const currentPlatform = platform();

const WALK_TIMEOUT_MS = 5000;
const MAX_HOPS = 24;
const TITLE_BUFFER = 512;

// Fields are emitted in a fixed order with the free-form one LAST, so no title
// content can break the parse: hwnd, claudeCount and claudePid are read off the
// first three separators and everything after the third one is the title
// verbatim.
const FIELD_SEP = "|";

// Resolution mechanism (measured — see docs/work/BUG-003.md):
//   - P/Invoke through Reflection.Emit `DefinePInvokeMethod`, not `Add-Type`:
//     no C# compile, ~65 ms over the PowerShell startup floor vs ~149 ms.
//   - ONE `Win32_Process` snapshot into a hashtable (~120 ms) instead of a
//     per-hop `-Filter "ProcessId = $cur"` query (~700 ms for the same walk).
//   - The terminal window is found through the *owned* `PseudoConsoleWindow`
//     of whichever ancestor has one, never through `MainWindowHandle`: that
//     property is per-process, and one `WindowsTerminal.exe` hosts every
//     window on the machine, so it returns whichever window is foreground.
//     Anchoring is by window ownership, never by process name — a session
//     started without a `cmd.exe` wrapper resolves the same way.
function buildScript(seed) {
	return [
		// Emit UTF-8 so a non-ASCII window title survives the console codepage.
		"[Console]::OutputEncoding = [System.Text.Encoding]::UTF8",
		'$an = New-Object System.Reflection.AssemblyName("ClaudiaWin32")',
		"$ab = [System.AppDomain]::CurrentDomain.DefineDynamicAssembly($an, [System.Reflection.Emit.AssemblyBuilderAccess]::Run)",
		'$mb = $ab.DefineDynamicModule("M")',
		'$tb = $mb.DefineType("W", "Public, Class")',
		"function DP($name,$dll,$ret,$pars) {",
		'  $m = $tb.DefinePInvokeMethod($name,$dll,"Public, Static","Standard",$ret,$pars,[System.Runtime.InteropServices.CallingConvention]::Winapi,[System.Runtime.InteropServices.CharSet]::Unicode)',
		"  $m.SetImplementationFlags($m.GetMethodImplementationFlags() -bor [System.Reflection.MethodImplAttributes]::PreserveSig)",
		"}",
		'DP "FindWindowExW" "user32.dll" ([IntPtr]) @([IntPtr],[IntPtr],[string],[string])',
		'DP "GetParent" "user32.dll" ([IntPtr]) @([IntPtr])',
		'DP "GetWindowThreadProcessId" "user32.dll" ([uint32]) @([IntPtr],[uint32].MakeByRefType())',
		'DP "GetWindowTextW" "user32.dll" ([int]) @([IntPtr],[System.Text.StringBuilder],[int])',
		"$t = $tb.CreateType()",
		// pid -> owned pseudo-console window, enumerated once.
		"$owned = @{}",
		"$h = [IntPtr]::Zero",
		"while ($true) {",
		'  $h = $t::FindWindowExW([IntPtr]::Zero, $h, "PseudoConsoleWindow", $null)',
		"  if ($h -eq [IntPtr]::Zero) { break }",
		"  $wp = 0",
		"  [void]$t::GetWindowThreadProcessId($h, [ref]$wp)",
		"  if (-not $owned.ContainsKey([int]$wp)) { $owned[[int]$wp] = $h }",
		"}",
		// pid -> (name, parent pid), one snapshot.
		"$tree = @{}",
		"foreach ($p in (Get-CimInstance -ClassName Win32_Process -Property ProcessId,ParentProcessId,Name)) {",
		"  $tree[[int]$p.ProcessId] = @($p.Name, [int]$p.ParentProcessId)",
		"}",
		`$cur = ${seed}`,
		"$claudeCount = 0",
		// The walk runs seed -> ancestors, so the FIRST claude.exe it crosses is
		// this session's own process; any later one is a session this session is
		// nested inside. Liveness is read off that first pid.
		"$claudePid = 0",
		"$win = [IntPtr]::Zero",
		`for ($hops = 0; $hops -lt ${MAX_HOPS}; $hops++) {`,
		"  if ($cur -eq 0 -or -not $tree.ContainsKey($cur)) { break }",
		"  $e = $tree[$cur]",
		'  if ($e[0] -eq "claude.exe") {',
		"    $claudeCount++",
		"    if ($claudePid -eq 0) { $claudePid = $cur }",
		"  }",
		"  if ($owned.ContainsKey($cur)) { $win = $t::GetParent($owned[$cur]); break }",
		"  $cur = $e[1]",
		"}",
		"if ($win -ne [IntPtr]::Zero) {",
		`  $sb = New-Object System.Text.StringBuilder ${TITLE_BUFFER}`,
		`  [void]$t::GetWindowTextW($win, $sb, ${TITLE_BUFFER})`,
		`  "" + $win.ToInt64() + "${FIELD_SEP}" + $claudeCount + "${FIELD_SEP}" + $claudePid + "${FIELD_SEP}" + $sb.ToString()`,
		"}",
	].join("\n");
}

function parseOutput(stdout) {
	if (typeof stdout !== "string") return null;
	const line = stdout.split("\n", 1)[0].replace(/\r$/, "");
	if (!line) return null;

	const first = line.indexOf(FIELD_SEP);
	if (first === -1) return null;
	const second = line.indexOf(FIELD_SEP, first + 1);
	if (second === -1) return null;
	const third = line.indexOf(FIELD_SEP, second + 1);
	if (third === -1) return null;

	const hwnd = Number(line.slice(0, first));
	const claudeCount = Number(line.slice(first + 1, second));
	const rawClaudePid = Number(line.slice(second + 1, third));
	if (!Number.isInteger(hwnd) || hwnd <= 0) return null;
	if (!Number.isInteger(claudeCount) || claudeCount < 0) return null;
	if (!Number.isInteger(rawClaudePid) || rawClaudePid < 0) return null;

	return {
		hwnd,
		title: line.slice(third + 1),
		claudeCount,
		// 0 is the script's "crossed no claude.exe" sentinel — no pid to probe.
		claudePid: rawClaudePid > 0 ? rawClaudePid : null,
	};
}

/**
 * Resolve the terminal window a session is running in, from a Windows pid
 * seeded by the caller (the hook supplies its shell's `/proc/$$/winpid`).
 *
 * Walks the process tree upward from the seed and anchors on the first
 * ancestor that owns a `PseudoConsoleWindow`; that window's parent is the
 * session's own terminal window. `claudeCount` is the number of `claude.exe`
 * processes crossed on the way — 1 for a top-level session, >= 2 for a session
 * nested inside another Claude session. `claudePid` is the pid of the FIRST of
 * those crossed — this session's own `claude.exe` — or `null` if the walk
 * crossed none; it is the liveness signal a window handle cannot carry, since
 * one window hosts many sessions (docs/work/BUG-003.md).
 *
 * Windows-only. Resolves to `{ hwnd, title, claudeCount, claudePid }`, or
 * `null` on any failure (other platform, bad pid, PowerShell error, timeout,
 * no window). Never rejects.
 */
export function resolveTerminalWindow(winpid) {
	if (currentPlatform !== "win32") return Promise.resolve(null);

	const seed = Math.trunc(Number(winpid));
	if (!Number.isFinite(seed) || seed <= 0) return Promise.resolve(null);

	return new Promise((resolve) => {
		try {
			execFile(
				"powershell",
				["-NoProfile", "-Command", buildScript(seed)],
				{ timeout: WALK_TIMEOUT_MS },
				(err, stdout) => {
					if (err) return resolve(null);
					resolve(parseOutput(stdout));
				},
			);
		} catch {
			resolve(null);
		}
	});
}
