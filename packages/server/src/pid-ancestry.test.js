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

describe("pid-ancestry", () => {
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

	it("returns null for missing or invalid pid", async () => {
		const resolveTerminalWindow = await importModule("win32");
		expect(await resolveTerminalWindow(null)).toBeNull();
		expect(await resolveTerminalWindow(0)).toBeNull();
		expect(await resolveTerminalWindow(-1)).toBeNull();
		expect(mockExecFile).not.toHaveBeenCalled();
	});

	it("returns hwnd and title when terminal ancestor is found", async () => {
		const resolveTerminalWindow = await importModule("win32");
		mockExecFile.mockImplementation((_cmd, _args, opts, cb) => {
			if (typeof opts === "function") {
				cb = opts;
			}
			cb(null, "131072|Windows Terminal\n", "");
		});

		const result = await resolveTerminalWindow(5678);
		expect(result).toEqual({ hwnd: 131072, title: "Windows Terminal" });
		expect(mockExecFile).toHaveBeenCalledOnce();
		expect(mockExecFile.mock.calls[0][0]).toBe("powershell");
	});

	it("returns null when no terminal ancestor is found", async () => {
		const resolveTerminalWindow = await importModule("win32");
		mockExecFile.mockImplementation((_cmd, _args, opts, cb) => {
			if (typeof opts === "function") {
				cb = opts;
			}
			cb(null, "\n", "");
		});

		const result = await resolveTerminalWindow(5678);
		expect(result).toBeNull();
	});

	it("returns null when powershell errors", async () => {
		const resolveTerminalWindow = await importModule("win32");
		mockExecFile.mockImplementation((_cmd, _args, opts, cb) => {
			if (typeof opts === "function") {
				cb = opts;
			}
			cb(new Error("timeout"), "", "");
		});

		const result = await resolveTerminalWindow(5678);
		expect(result).toBeNull();
	});

	it("passes the pid into the powershell script", async () => {
		const resolveTerminalWindow = await importModule("win32");
		mockExecFile.mockImplementation((_cmd, _args, opts, cb) => {
			if (typeof opts === "function") {
				cb = opts;
			}
			cb(null, "", "");
		});

		await resolveTerminalWindow(9999);
		const psScript = mockExecFile.mock.calls[0][1][2];
		expect(psScript).toContain("9999");
	});
});
