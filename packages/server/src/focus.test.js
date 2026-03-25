import { describe, it, expect, vi, beforeEach } from "vitest";

// These mock factories are defined once and reused across all describe blocks.
// vi.mock hoisting means the factory runs before any imports, so we capture
// the spy references here and mutate them in beforeEach.
const mockExec = vi.fn();
const mockExecFile = vi.fn();
const mockPlatform = vi.fn();

vi.mock("node:child_process", () => ({
  exec: mockExec,
  execFile: mockExecFile,
}));

vi.mock("node:os", () => ({
  platform: mockPlatform,
}));

// Helper: make execFile call its callback with success
function succeedExecFile() {
  mockExecFile.mockImplementation((cmd, args, opts, cb) => {
    if (typeof opts === "function") { cb = opts; }
    cb(null, "", "");
  });
}

// Helper: make exec call its callback with success
function succeedExec() {
  mockExec.mockImplementation((cmd, opts, cb) => {
    if (typeof opts === "function") { cb = opts; }
    cb(null, "", "");
  });
}

// Helper: make execFile call its callback with an error
function failExecFile() {
  mockExecFile.mockImplementation((cmd, args, opts, cb) => {
    if (typeof opts === "function") { cb = opts; }
    cb(new Error("failed"), "", "");
  });
}

// Re-import the module under the given platform string.
// Must be called after vi.resetModules() so currentPlatform is re-evaluated.
async function importFocus(platformName) {
  mockPlatform.mockReturnValue(platformName);
  const mod = await import("./focus.js");
  return { focusTerminal: mod.focusTerminal, findDeadWindows: mod.findDeadWindows };
}

// ─────────────────────────────────────────────────────────────────────────────
// win32 platform
// ─────────────────────────────────────────────────────────────────────────────
describe("win32 platform", () => {
  let focusTerminal;
  let findDeadWindows;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    ({ focusTerminal, findDeadWindows } = await importFocus("win32"));
  });

  it("calls execFile with 'powershell' on win32", async () => {
    succeedExecFile();
    await focusTerminal("myproject", "navigate");
    expect(mockExecFile).toHaveBeenCalledOnce();
    expect(mockExecFile.mock.calls[0][0]).toBe("powershell");
  });

  it("returns true when the shell command succeeds", async () => {
    succeedExecFile();
    const result = await focusTerminal("myproject", "navigate");
    expect(result).toBe(true);
  });

  it("returns false when the shell command fails", async () => {
    failExecFile();
    const result = await focusTerminal("myproject", "navigate");
    expect(result).toBe(false);
  });

  // ── color mapping ──────────────────────────────────────────────────────────

  it("uses blue color (100,160,255) for intent 'navigate'", async () => {
    succeedExecFile();
    await focusTerminal("proj", "navigate");
    const psScript = mockExecFile.mock.calls[0][1][2]; // third arg in [cmd, args]
    expect(psScript).toContain("100, 160, 255");
  });

  it("uses orange color (255,180,80) for intent 'alert'", async () => {
    succeedExecFile();
    await focusTerminal("proj", "alert");
    const psScript = mockExecFile.mock.calls[0][1][2];
    expect(psScript).toContain("255, 180, 80");
  });

  it("defaults to navigate (blue) color for unknown intent", async () => {
    succeedExecFile();
    await focusTerminal("proj", "unknown_intent");
    const psScript = mockExecFile.mock.calls[0][1][2];
    expect(psScript).toContain("100, 160, 255");
  });

  // ── window handle ──────────────────────────────────────────────────────────

  it("uses [IntPtr]<handle> directly when windowHandle is provided", async () => {
    succeedExecFile();
    await focusTerminal("proj", "navigate", 12345);
    const psScript = mockExecFile.mock.calls[0][1][2];
    expect(psScript).toContain("[IntPtr]12345");
    // Should NOT fall back to Get-Process title search
    expect(psScript).not.toContain("Get-Process");
  });

  it("uses Get-Process title matching when windowHandle is null", async () => {
    succeedExecFile();
    await focusTerminal("proj", "navigate", null);
    const psScript = mockExecFile.mock.calls[0][1][2];
    expect(psScript).toContain("Get-Process");
  });

  // ── sanitize (tested through focusTerminal) ────────────────────────────────

  it("strips special characters from displayName", async () => {
    succeedExecFile();
    await focusTerminal("my<project>!@#", "navigate", null);
    const psScript = mockExecFile.mock.calls[0][1][2];
    // The sanitized name appears inside [regex]::Escape('...'). Extract just that portion.
    const match = psScript.match(/\[regex\]::Escape\('([^']*)'\)/);
    expect(match).not.toBeNull();
    const sanitizedName = match[1];
    expect(sanitizedName).not.toMatch(/[<>!@#]/);
    expect(sanitizedName).toBe("myproject");
  });

  it("preserves alphanumeric, dash, underscore, dot, and space in displayName", async () => {
    succeedExecFile();
    await focusTerminal("my-project_1.0 test", "navigate", null);
    const psScript = mockExecFile.mock.calls[0][1][2];
    expect(psScript).toContain("my-project_1.0 test");
  });

  // ── findDeadWindows ────────────────────────────────────────────────────────

  it("returns empty Set for empty handles array (win32)", async () => {
    const result = await findDeadWindows([]);
    expect(result).toEqual(new Set());
    expect(mockExecFile).not.toHaveBeenCalled();
  });

  it("calls powershell and parses dead handles from stdout", async () => {
    mockExecFile.mockImplementation((cmd, args, opts, cb) => {
      if (typeof opts === "function") { cb = opts; }
      // Simulate powershell reporting handles 111 and 222 as dead
      cb(null, "111\n222\n", "");
    });
    const result = await findDeadWindows([111, 222, 333]);
    expect(mockExecFile).toHaveBeenCalledOnce();
    expect(mockExecFile.mock.calls[0][0]).toBe("powershell");
    expect(result).toEqual(new Set([111, 222]));
  });

  it("returns empty Set when powershell exits with error (win32)", async () => {
    failExecFile();
    const result = await findDeadWindows([111]);
    expect(result).toEqual(new Set());
  });

  it("returns empty Set when stdout is empty (no dead windows)", async () => {
    mockExecFile.mockImplementation((cmd, args, opts, cb) => {
      if (typeof opts === "function") { cb = opts; }
      cb(null, "   \n", "");
    });
    const result = await findDeadWindows([111, 222]);
    expect(result).toEqual(new Set());
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// darwin platform
// ─────────────────────────────────────────────────────────────────────────────
describe("darwin platform", () => {
  let focusTerminal;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    ({ focusTerminal } = await importFocus("darwin"));
  });

  it("calls execFile with 'osascript' on darwin", async () => {
    succeedExecFile();
    await focusTerminal("myproject", "navigate");
    expect(mockExecFile).toHaveBeenCalledOnce();
    expect(mockExecFile.mock.calls[0][0]).toBe("osascript");
  });

  it("uses blue color for navigate intent", async () => {
    succeedExecFile();
    await focusTerminal("proj", "navigate");
    const script = mockExecFile.mock.calls[0][1][1]; // osascript -e <script>
    // Color values are embedded as normalized floats (100/255 ≈ 0.39)
    expect(script).toContain("0.39");
  });

  it("uses orange color for alert intent", async () => {
    succeedExecFile();
    await focusTerminal("proj", "alert");
    const script = mockExecFile.mock.calls[0][1][1];
    // 255/255 = 1.00
    expect(script).toContain("1.00");
  });

  it("strips special characters from displayName", async () => {
    succeedExecFile();
    await focusTerminal("my<project>!@#", "navigate");
    const script = mockExecFile.mock.calls[0][1][1];
    expect(script).not.toMatch(/[<>!@#]/);
    expect(script).toContain("myproject");
  });

  it("preserves alphanumeric, dash, underscore, dot, and space", async () => {
    succeedExecFile();
    await focusTerminal("my-project_1.0 test", "navigate");
    const script = mockExecFile.mock.calls[0][1][1];
    expect(script).toContain("my-project_1.0 test");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// linux platform
// ─────────────────────────────────────────────────────────────────────────────
describe("linux platform", () => {
  let focusTerminal;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    ({ focusTerminal } = await importFocus("linux"));
  });

  it("calls exec (not execFile) on linux", async () => {
    succeedExec();
    await focusTerminal("myproject", "navigate");
    expect(mockExec).toHaveBeenCalledOnce();
    expect(mockExecFile).not.toHaveBeenCalled();
  });

  it("embeds the hex color for alert intent in the shell command", async () => {
    succeedExec();
    await focusTerminal("proj", "alert");
    const cmd = mockExec.mock.calls[0][0];
    expect(cmd).toContain("#FFB450");
  });

  it("embeds the hex color for navigate intent in the shell command", async () => {
    succeedExec();
    await focusTerminal("proj", "navigate");
    const cmd = mockExec.mock.calls[0][0];
    expect(cmd).toContain("#64A0FF");
  });

  it("strips special characters from displayName", async () => {
    succeedExec();
    await focusTerminal("my<project>!@#", "navigate");
    const cmd = mockExec.mock.calls[0][0];
    // The sanitized name appears in the xdotool --name argument. Extract just that portion.
    const match = cmd.match(/xdotool search --name '([^']*)'/);
    expect(match).not.toBeNull();
    const sanitizedName = match[1];
    expect(sanitizedName).not.toMatch(/[<>!@#]/);
    expect(sanitizedName).toBe("myproject");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// unknown / fallback platform
// ─────────────────────────────────────────────────────────────────────────────
describe("unknown platform (fallback)", () => {
  let focusTerminal;
  let findDeadWindows;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    ({ focusTerminal, findDeadWindows } = await importFocus("freebsd"));
  });

  it("returns false without calling any shell command", async () => {
    const result = await focusTerminal("myproject", "navigate");
    expect(result).toBe(false);
    expect(mockExec).not.toHaveBeenCalled();
    expect(mockExecFile).not.toHaveBeenCalled();
  });

  it("findDeadWindows returns empty Set on non-win32 platform", async () => {
    const result = await findDeadWindows([111, 222]);
    expect(result).toEqual(new Set());
    expect(mockExecFile).not.toHaveBeenCalled();
  });
});
