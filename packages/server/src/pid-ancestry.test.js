import { beforeEach, describe, expect, it, vi } from "vitest";

const mockExecFile = vi.fn();
const mockPlatform = vi.fn();

vi.mock("node:child_process", () => ({
	execFile: mockExecFile,
}));

vi.mock("node:os", () => ({
	platform: mockPlatform,
}));

async function importModule(platformName) {
	mockPlatform.mockReturnValue(platformName);
	const mod = await import("./pid-ancestry.js");
	return mod.resolveTerminalWindow;
}

function stubOutput(stdout) {
	mockExecFile.mockImplementation((_cmd, _args, opts, cb) => {
		const done = typeof opts === "function" ? opts : cb;
		done(null, stdout, "");
	});
}

function psScript() {
	return mockExecFile.mock.calls[0][1][2];
}

describe("resolveTerminalWindow", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.resetModules();
	});

	it("returns null immediately on non-win32 platforms", async () => {
		const resolveTerminalWindow = await importModule("linux");
		const result = await resolveTerminalWindow(1234);
		expect(result).toBeNull();
		expect(mockExecFile).not.toHaveBeenCalled();
	});

	it("returns null for a missing or invalid pid", async () => {
		const resolveTerminalWindow = await importModule("win32");
		expect(await resolveTerminalWindow(undefined)).toBeNull();
		expect(await resolveTerminalWindow(null)).toBeNull();
		expect(await resolveTerminalWindow(0)).toBeNull();
		expect(await resolveTerminalWindow(-1)).toBeNull();
		expect(await resolveTerminalWindow("not-a-pid")).toBeNull();
		expect(await resolveTerminalWindow(Number.NaN)).toBeNull();
		expect(mockExecFile).not.toHaveBeenCalled();
	});

	it("resolves hwnd, title, claudeCount and claudePid from a well-formed line", async () => {
		const resolveTerminalWindow = await importModule("win32");
		stubOutput("199972|1|8842|Claudia b3ab\r\n");

		const result = await resolveTerminalWindow(5678);

		expect(result).toEqual({
			hwnd: 199972,
			title: "Claudia b3ab",
			claudeCount: 1,
			claudePid: 8842,
		});
		expect(typeof result.hwnd).toBe("number");
		expect(typeof result.title).toBe("string");
		expect(typeof result.claudeCount).toBe("number");
		expect(typeof result.claudePid).toBe("number");
		expect(mockExecFile).toHaveBeenCalledOnce();
		expect(mockExecFile.mock.calls[0][0]).toBe("powershell");
	});

	it("reports a nested session through claudeCount", async () => {
		const resolveTerminalWindow = await importModule("win32");
		stubOutput("199972|3|8842|Claudia b3ab\n");

		const result = await resolveTerminalWindow(5678);

		expect(result.claudeCount).toBe(3);
	});

	it("reports claudePid null when the walk crossed no claude process", async () => {
		const resolveTerminalWindow = await importModule("win32");
		stubOutput("199972|0|0|Claudia b3ab\n");

		const result = await resolveTerminalWindow(5678);

		expect(result.claudeCount).toBe(0);
		expect(result.claudePid).toBeNull();
	});

	it("captures the FIRST claude.exe crossed, not the outermost", async () => {
		const resolveTerminalWindow = await importModule("win32");
		stubOutput("");

		await resolveTerminalWindow(9999);
		const script = psScript();

		// The walk goes seed -> ancestors, so the first claude.exe it crosses is
		// the session's own; later ones are the sessions it is nested inside.
		expect(script).toMatch(
			/if \(\$claudePid -eq 0\) \{ \$claudePid = \$cur \}/,
		);
	});

	it("keeps a title containing separator characters intact", async () => {
		const resolveTerminalWindow = await importModule("win32");
		stubOutput("199972|1|8842|weird @@ title | with pipes @@ and more\n");

		const result = await resolveTerminalWindow(5678);

		expect(result).toEqual({
			hwnd: 199972,
			claudeCount: 1,
			claudePid: 8842,
			title: "weird @@ title | with pipes @@ and more",
		});
	});

	it("accepts a window with an empty title", async () => {
		const resolveTerminalWindow = await importModule("win32");
		stubOutput("199972|1|8842|\n");

		const result = await resolveTerminalWindow(5678);

		expect(result).toEqual({
			hwnd: 199972,
			claudeCount: 1,
			claudePid: 8842,
			title: "",
		});
	});

	it("returns null when powershell prints nothing", async () => {
		const resolveTerminalWindow = await importModule("win32");
		stubOutput("\n");

		expect(await resolveTerminalWindow(5678)).toBeNull();
	});

	it("returns null on malformed output", async () => {
		const resolveTerminalWindow = await importModule("win32");
		const malformed = [
			"no separators at all",
			"199972|Claudia b3ab",
			"199972|1|Claudia b3ab",
			"|1|8842|Claudia b3ab",
			"abc|1|8842|Claudia b3ab",
			"199972|abc|8842|Claudia b3ab",
			"199972|1|abc|Claudia b3ab",
			"0|1|8842|Claudia b3ab",
			"-5|1|8842|Claudia b3ab",
			"199972|-1|8842|Claudia b3ab",
			"199972|1|-3|Claudia b3ab",
		];

		for (const output of malformed) {
			vi.clearAllMocks();
			stubOutput(`${output}\n`);
			expect(await resolveTerminalWindow(5678)).toBeNull();
		}
	});

	it("returns null when powershell fails or times out", async () => {
		const resolveTerminalWindow = await importModule("win32");
		mockExecFile.mockImplementation((_cmd, _args, opts, cb) => {
			const done = typeof opts === "function" ? opts : cb;
			done(new Error("timeout"), "", "");
		});

		expect(await resolveTerminalWindow(5678)).toBeNull();
	});

	it("never throws on an unexpected callback shape", async () => {
		const resolveTerminalWindow = await importModule("win32");
		mockExecFile.mockImplementation((_cmd, _args, opts, cb) => {
			const done = typeof opts === "function" ? opts : cb;
			done(null, undefined, "");
		});

		expect(await resolveTerminalWindow(5678)).toBeNull();
	});

	it("seeds the powershell walk with the supplied pid and a timeout", async () => {
		const resolveTerminalWindow = await importModule("win32");
		stubOutput("");

		await resolveTerminalWindow(9999);

		expect(psScript()).toContain("9999");
		expect(mockExecFile.mock.calls[0][2].timeout).toBeGreaterThan(0);
	});

	it("uses the measured acquisition mechanism, not the falsified one", async () => {
		const resolveTerminalWindow = await importModule("win32");
		stubOutput("");

		await resolveTerminalWindow(9999);
		const script = psScript();

		// Reflection.Emit P/Invoke — Add-Type costs a C# compile per call.
		expect(script).toContain("DefinePInvokeMethod");
		expect(script).not.toContain("Add-Type");
		// Owned pseudo-console window, not the per-process MainWindowHandle.
		expect(script).toContain("PseudoConsoleWindow");
		expect(script).not.toContain("MainWindowHandle");
		// One Win32_Process snapshot, not a per-hop CIM query.
		expect(script.match(/Get-CimInstance/g)).toHaveLength(1);
		expect(script).not.toContain("ProcessId = $cur");
		// Anchor on whichever ancestor owns a pseudo-console window.
		expect(script).not.toContain("cmd.exe");
	});
});
