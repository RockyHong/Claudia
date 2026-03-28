import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// These mocks must be declared before any imports of the module under test.
// vi.mock() calls are hoisted to the top of the file by Vitest.
const mockSpawn = vi.fn();
const mockExecFile = vi.fn();
const mockPlatform = vi.fn();

vi.mock("node:child_process", () => ({
  spawn: mockSpawn,
  execFile: mockExecFile,
}));

vi.mock("node:os", () => ({
  platform: mockPlatform,
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockChild() {
  const listeners = {};
  return {
    unref: vi.fn(),
    on: vi.fn((event, cb) => {
      listeners[event] = cb;
    }),
    _listeners: listeners,
  };
}

/**
 * Build an execFile mock implementation for a given platform.
 *
 * win32 spawnSession makes two execFile calls:
 *   1. runPowerShell  — Start-Process wt (we just call cb with no error)
 *   2. findWindowByTitle — polls for HWND, returns a numeric string
 *
 * Everything else gets a simple success response.
 */
function makeExecFileMock({ hwnd = "12345", folderPath = "/some/folder", empty = false } = {}) {
  let callCount = 0;
  return vi.fn((cmd, args, opts, cb) => {
    // execFile(cmd, args, cb) — opts is optional
    if (typeof opts === "function") {
      cb = opts;
    }
    callCount++;
    if (typeof cb === "function") {
      if (empty) {
        cb(null, "", "");
      } else {
        // First call for win32 spawnSession = runPowerShell (no stdout needed)
        // Second call = findWindowByTitle (return hwnd)
        // browse calls = return folderPath
        const isHwndCall = callCount === 2 && hwnd !== undefined;
        const stdout = isHwndCall ? `${hwnd}\n` : `${folderPath}\n`;
        cb(null, stdout, "");
      }
    }
  });
}

// ---------------------------------------------------------------------------
// spawnSession — unsupported platform
// ---------------------------------------------------------------------------

describe("spawnSession — unsupported platform", () => {
  let spawnSession;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    mockPlatform.mockReturnValue("freebsd");
    const mod = await import("./spawner.js");
    spawnSession = mod.spawnSession;
  });

  it("throws an error mentioning the platform name", async () => {
    await expect(spawnSession("/some/path")).rejects.toThrow("Unsupported platform");
  });
});

// ---------------------------------------------------------------------------
// spawnSession — win32
// ---------------------------------------------------------------------------

describe("spawnSession — win32", () => {
  let spawnSession;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    mockPlatform.mockReturnValue("win32");
    mockExecFile.mockImplementation(makeExecFileMock({ hwnd: "12345" }));
    const mod = await import("./spawner.js");
    spawnSession = mod.spawnSession;
  });

  it("calls execFile with powershell for Start-Process wt", async () => {
    await spawnSession("C:\\Users\\user\\project");
    expect(mockExecFile).toHaveBeenCalled();
    const firstCall = mockExecFile.mock.calls[0];
    expect(firstCall[0]).toBe("powershell");
    expect(firstCall[1]).toContain("-Command");
    const command = firstCall[1].join(" ");
    expect(command).toMatch(/Start-Process wt/);
  });

  it("calls execFile a second time for findWindowByTitle", async () => {
    await spawnSession("C:\\Users\\user\\project");
    expect(mockExecFile).toHaveBeenCalledTimes(2);
    const secondCall = mockExecFile.mock.calls[1];
    expect(secondCall[0]).toBe("powershell");
  });

  it("returns terminalTitle and windowHandle", async () => {
    const result = await spawnSession("C:\\Users\\user\\myproject");
    expect(result).toHaveProperty("terminalTitle");
    expect(result).toHaveProperty("windowHandle");
    expect(typeof result.terminalTitle).toBe("string");
  });

  it("returns null windowHandle when findWindowByTitle returns empty", async () => {
    mockExecFile.mockImplementation(makeExecFileMock({ hwnd: "0" }));
    const result = await spawnSession("C:\\Users\\user\\myproject");
    expect(result.windowHandle).toBeNull();
  });

  it("returns numeric windowHandle when a valid HWND is found", async () => {
    mockExecFile.mockImplementation(makeExecFileMock({ hwnd: "99999" }));
    const result = await spawnSession("C:\\Users\\user\\myproject");
    expect(result.windowHandle).toBe(99999);
  });
});

// ---------------------------------------------------------------------------
// spawnSession — darwin
// ---------------------------------------------------------------------------

describe("spawnSession — darwin", () => {
  let spawnSession;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    mockPlatform.mockReturnValue("darwin");
    mockSpawn.mockReturnValue(createMockChild());
    const mod = await import("./spawner.js");
    spawnSession = mod.spawnSession;
  });

  it("calls spawn with osascript", async () => {
    await spawnSession("/Users/user/project");
    expect(mockSpawn).toHaveBeenCalled();
    expect(mockSpawn.mock.calls[0][0]).toBe("osascript");
  });

  it("returns terminalTitle null and windowHandle null", async () => {
    const result = await spawnSession("/Users/user/project");
    expect(result).toEqual({ terminalTitle: null, windowHandle: null });
  });

  it("calls unref() on the spawned child", async () => {
    const child = createMockChild();
    mockSpawn.mockReturnValue(child);
    await spawnSession("/Users/user/project");
    expect(child.unref).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// spawnSession — linux
// ---------------------------------------------------------------------------

describe("spawnSession — linux", () => {
  let spawnSession;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockPlatform.mockReturnValue("linux");
    const mod = await import("./spawner.js");
    spawnSession = mod.spawnSession;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("calls spawn with a terminal emulator command", async () => {
    const child = createMockChild();
    mockSpawn.mockReturnValue(child);

    const promise = spawnSession("/home/user/project");
    // trySpawn resolves after 500ms setTimeout
    await vi.advanceTimersByTimeAsync(500);
    const result = await promise;

    expect(mockSpawn).toHaveBeenCalled();
    const cmd = mockSpawn.mock.calls[0][0];
    expect(["gnome-terminal", "xterm", "x-terminal-emulator"]).toContain(cmd);
  });

  it("returns terminalTitle null and windowHandle null", async () => {
    const child = createMockChild();
    mockSpawn.mockReturnValue(child);

    const promise = spawnSession("/home/user/project");
    await vi.advanceTimersByTimeAsync(500);
    const result = await promise;

    expect(result).toEqual({ terminalTitle: null, windowHandle: null });
  });

  it("falls back to the next terminal if the first emits an error", async () => {
    let callIndex = 0;
    mockSpawn.mockImplementation(() => {
      const child = createMockChild();
      const idx = callIndex++;
      // First terminal emulator: fire error synchronously so trySpawn resolves null
      // before the 500ms timeout. The second spawn succeeds after the timeout.
      if (idx === 0) {
        // Trigger error synchronously after on() is registered via Promise microtask
        Promise.resolve().then(() => {
          if (child._listeners.error) child._listeners.error(new Error("not found"));
        });
      }
      return child;
    });

    const promise = spawnSession("/home/user/project");
    // Let microtasks settle (error fires), then advance through the successful spawn's timeout
    await vi.advanceTimersByTimeAsync(500);
    await promise;

    // Should have tried at least two terminal emulators
    expect(mockSpawn.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("throws when no terminal emulator is found", async () => {
    mockSpawn.mockImplementation(() => {
      const child = createMockChild();
      // Fire error synchronously via microtask so trySpawn resolves null
      // without needing the 500ms timeout at all.
      Promise.resolve().then(() => {
        if (child._listeners.error) child._listeners.error(new Error("not found"));
      });
      return child;
    });

    // The errors fire via microtasks — no timer advancement needed.
    await expect(spawnSession("/home/user/project")).rejects.toThrow("No terminal emulator found");
  });
});

// ---------------------------------------------------------------------------
// generateTerminalTitle — tested indirectly via spawnSession on win32
// ---------------------------------------------------------------------------

describe("generateTerminalTitle", () => {
  // Use win32 so spawnSession returns the terminalTitle in its result.
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    mockPlatform.mockReturnValue("win32");
  });

  it("includes the last path segment as the project name", async () => {
    mockExecFile.mockImplementation(makeExecFileMock({ hwnd: "1" }));
    const { spawnSession } = await import("./spawner.js");
    const { terminalTitle } = await spawnSession("/home/user/myproject");
    expect(terminalTitle).toContain("myproject");
  });

  it("normalises Windows backslashes before extracting the name", async () => {
    mockExecFile.mockImplementation(makeExecFileMock({ hwnd: "1" }));
    const { spawnSession } = await import("./spawner.js");
    const { terminalTitle } = await spawnSession("C:\\Users\\user\\winproject");
    expect(terminalTitle).toContain("winproject");
  });

  it("produces different titles on consecutive calls (incrementing counter)", async () => {
    mockExecFile.mockImplementation(makeExecFileMock({ hwnd: "1" }));
    const { spawnSession } = await import("./spawner.js");
    const { terminalTitle: t1 } = await spawnSession("/home/user/proj");
    mockExecFile.mockImplementation(makeExecFileMock({ hwnd: "2" }));
    const { terminalTitle: t2 } = await spawnSession("/home/user/proj");
    expect(t1).not.toBe(t2);
  });

  it("title format is 'claudia · <name>-<uid>'", async () => {
    mockExecFile.mockImplementation(makeExecFileMock({ hwnd: "1" }));
    const { spawnSession } = await import("./spawner.js");
    const { terminalTitle } = await spawnSession("/home/user/myapp");
    // The middle dot character used in the source is U+00B7
    expect(terminalTitle).toMatch(/^claudia · .+-[0-9a-z]{2,}$/);
  });

  it("uses 'session' as name fallback when cwd is empty string", async () => {
    mockExecFile.mockImplementation(makeExecFileMock({ hwnd: "1" }));
    const { spawnSession } = await import("./spawner.js");
    const { terminalTitle } = await spawnSession("");
    expect(terminalTitle).toContain("session");
  });
});

// ---------------------------------------------------------------------------
// browseFolder — unsupported platform
// ---------------------------------------------------------------------------

describe("browseFolder — unsupported platform", () => {
  let browseFolder;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    mockPlatform.mockReturnValue("freebsd");
    const mod = await import("./spawner.js");
    browseFolder = mod.browseFolder;
  });

  it("throws an error mentioning the platform name", async () => {
    await expect(browseFolder()).rejects.toThrow("Unsupported platform");
  });
});

// ---------------------------------------------------------------------------
// browseFolder — win32
// ---------------------------------------------------------------------------

describe("browseFolder — win32", () => {
  let browseFolder;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    mockPlatform.mockReturnValue("win32");
    const mod = await import("./spawner.js");
    browseFolder = mod.browseFolder;
  });

  it("calls execFile with powershell", async () => {
    mockExecFile.mockImplementation((cmd, args, opts, cb) => {
      if (typeof opts === "function") cb = opts;
      cb(null, "C:\\Users\\user\\project\n", "");
    });
    await browseFolder();
    expect(mockExecFile).toHaveBeenCalled();
    expect(mockExecFile.mock.calls[0][0]).toBe("powershell");
  });

  it("returns the selected path when a folder is chosen", async () => {
    mockExecFile.mockImplementation((cmd, args, opts, cb) => {
      if (typeof opts === "function") cb = opts;
      cb(null, "C:\\Users\\user\\project\n", "");
    });
    const result = await browseFolder();
    expect(result).toBe("C:\\Users\\user\\project");
  });

  it("returns null when the dialog is cancelled (empty stdout)", async () => {
    mockExecFile.mockImplementation((cmd, args, opts, cb) => {
      if (typeof opts === "function") cb = opts;
      cb(null, "", "");
    });
    const result = await browseFolder();
    expect(result).toBeNull();
  });

  it("returns null when execFile errors", async () => {
    mockExecFile.mockImplementation((cmd, args, opts, cb) => {
      if (typeof opts === "function") cb = opts;
      cb(new Error("powershell not found"), "", "");
    });
    const result = await browseFolder();
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// browseFolder — darwin
// ---------------------------------------------------------------------------

describe("browseFolder — darwin", () => {
  let browseFolder;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    mockPlatform.mockReturnValue("darwin");
    const mod = await import("./spawner.js");
    browseFolder = mod.browseFolder;
  });

  it("calls execFile with osascript", async () => {
    mockExecFile.mockImplementation((cmd, args, opts, cb) => {
      if (typeof opts === "function") cb = opts;
      cb(null, "/Users/user/project\n", "");
    });
    await browseFolder();
    expect(mockExecFile.mock.calls[0][0]).toBe("osascript");
  });

  it("returns the selected path", async () => {
    mockExecFile.mockImplementation((cmd, args, opts, cb) => {
      if (typeof opts === "function") cb = opts;
      cb(null, "/Users/user/project\n", "");
    });
    const result = await browseFolder();
    expect(result).toBe("/Users/user/project");
  });

  it("returns null when the dialog is cancelled", async () => {
    mockExecFile.mockImplementation((cmd, args, opts, cb) => {
      if (typeof opts === "function") cb = opts;
      cb(null, "\n", "");
    });
    const result = await browseFolder();
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// browseFolder — linux
// ---------------------------------------------------------------------------

describe("browseFolder — linux", () => {
  let browseFolder;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    mockPlatform.mockReturnValue("linux");
    const mod = await import("./spawner.js");
    browseFolder = mod.browseFolder;
  });

  it("calls execFile with zenity", async () => {
    mockExecFile.mockImplementation((cmd, args, opts, cb) => {
      if (typeof opts === "function") cb = opts;
      cb(null, "/home/user/project\n", "");
    });
    await browseFolder();
    expect(mockExecFile.mock.calls[0][0]).toBe("zenity");
  });

  it("passes --file-selection and --directory flags", async () => {
    mockExecFile.mockImplementation((cmd, args, opts, cb) => {
      if (typeof opts === "function") cb = opts;
      cb(null, "/home/user/project\n", "");
    });
    await browseFolder();
    const args = mockExecFile.mock.calls[0][1];
    expect(args).toContain("--file-selection");
    expect(args).toContain("--directory");
  });

  it("returns the selected path", async () => {
    mockExecFile.mockImplementation((cmd, args, opts, cb) => {
      if (typeof opts === "function") cb = opts;
      cb(null, "/home/user/project\n", "");
    });
    const result = await browseFolder();
    expect(result).toBe("/home/user/project");
  });

  it("returns null when zenity is cancelled", async () => {
    mockExecFile.mockImplementation((cmd, args, opts, cb) => {
      if (typeof opts === "function") cb = opts;
      // zenity exits with code 1 when cancelled
      cb(new Error("exit code 1"), "", "");
    });
    const result = await browseFolder();
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// cancelBrowse
// ---------------------------------------------------------------------------

describe("cancelBrowse", () => {
  let browseFolder, cancelBrowse;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    mockPlatform.mockReturnValue("win32");
    const mod = await import("./spawner.js");
    browseFolder = mod.browseFolder;
    cancelBrowse = mod.cancelBrowse;
  });

  it("kills the active browse process", async () => {
    const mockKill = vi.fn();
    mockExecFile.mockImplementation((cmd, args, cb) => {
      // Don't call cb — simulate a hanging dialog
      return { kill: mockKill };
    });

    // Start browse but don't await (it will hang)
    const browsePromise = browseFolder();

    cancelBrowse();
    expect(mockKill).toHaveBeenCalled();

    // Clean up: the kill triggers the callback with an error
    const cb = mockExecFile.mock.calls[0][2];
    cb(new Error("killed"), "", "");
    await browsePromise;
  });

  it("does nothing when no browse is active", () => {
    // Should not throw
    cancelBrowse();
  });
});
