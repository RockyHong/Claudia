import { execFile } from "node:child_process";
import { platform } from "node:os";

const currentPlatform = platform();

const TERMINAL_PROCESS_NAMES = new Set([
	"WindowsTerminal",
	"cmd",
	"powershell",
	"pwsh",
	"ConEmuC64",
	"ConEmuC",
	"mintty",
	"Alacritty",
	"kitty",
	"Hyper",
	"Tabby",
	"WezTerm",
]);

/**
 * Walk the process tree from a given PID up to find a known terminal process
 * with a visible window. Returns { hwnd, title } or null.
 * Windows-only — returns null immediately on other platforms.
 */
export function resolveTerminalWindow(pid) {
	if (currentPlatform !== "win32") return Promise.resolve(null);
	if (!pid || pid <= 0) return Promise.resolve(null);

	const nameList = Array.from(TERMINAL_PROCESS_NAMES)
		.map((n) => `'${n}'`)
		.join(",");

	const ps = [
		`$names = @(${nameList})`,
		`$cur = ${Math.trunc(Number(pid))}`,
		"for ($i = 0; $i -lt 20; $i++) {",
		'  $proc = Get-CimInstance Win32_Process -Filter "ProcessId = $cur" -ErrorAction SilentlyContinue',
		"  if (-not $proc) { break }",
		"  $pname = $proc.Name -replace '\\.exe$',''",
		"  if ($names -contains $pname) {",
		"    $gp = Get-Process -Id $cur -ErrorAction SilentlyContinue",
		"    if ($gp -and $gp.MainWindowHandle -ne 0) {",
		'      "$($gp.MainWindowHandle)|$($gp.MainWindowTitle)"',
		"      exit",
		"    }",
		"  }",
		"  $cur = $proc.ParentProcessId",
		"  if ($cur -eq 0) { break }",
		"}",
	].join("\n");

	return new Promise((resolve) => {
		execFile(
			"powershell",
			["-NoProfile", "-Command", ps],
			{ timeout: 5000 },
			(err, stdout) => {
				if (err) return resolve(null);
				const output = stdout.trim();
				if (!output) return resolve(null);
				const sep = output.indexOf("|");
				if (sep === -1) return resolve(null);
				const hwnd = parseInt(output.slice(0, sep), 10);
				const title = output.slice(sep + 1);
				if (!hwnd || hwnd <= 0) return resolve(null);
				resolve({ hwnd, title });
			},
		);
	});
}
