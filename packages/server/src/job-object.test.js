import { describe, it, expect, vi, beforeEach } from "vitest";
import { platform } from "node:os";

vi.mock("node:child_process", () => ({
  execFileSync: vi.fn(),
}));

import { createJobObject, assignToJob, closeJobObject, isSupported } from "./job-object.js";
import { execFileSync } from "node:child_process";

describe("job-object", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("isSupported", () => {
    it("is a boolean", () => {
      expect(typeof isSupported).toBe("boolean");
    });
  });

  describe("createJobObject", () => {
    it("returns null on non-Windows", () => {
      if (platform() === "win32") return;
      expect(createJobObject()).toBeNull();
    });

    it("calls PowerShell and returns the handle string on Windows", () => {
      if (platform() !== "win32") return;
      execFileSync.mockReturnValue("12345\n");
      const handle = createJobObject();
      expect(handle).toBe("12345");
      expect(execFileSync).toHaveBeenCalledWith(
        "powershell",
        expect.arrayContaining(["-NoProfile", "-Command"]),
        expect.any(Object),
      );
    });
  });

  describe("assignToJob", () => {
    it("does nothing on non-Windows", () => {
      if (platform() === "win32") return;
      assignToJob("123", 456);
      expect(execFileSync).not.toHaveBeenCalled();
    });

    it("does nothing with null handle", () => {
      assignToJob(null, 456);
      expect(execFileSync).not.toHaveBeenCalled();
    });

    it("calls PowerShell on Windows with valid handle", () => {
      if (platform() !== "win32") return;
      execFileSync.mockReturnValue("");
      assignToJob("12345", 9999);
      expect(execFileSync).toHaveBeenCalledWith(
        "powershell",
        expect.arrayContaining(["-NoProfile", "-Command"]),
        expect.any(Object),
      );
    });
  });

  describe("closeJobObject", () => {
    it("does nothing on non-Windows", () => {
      if (platform() === "win32") return;
      closeJobObject("123");
      expect(execFileSync).not.toHaveBeenCalled();
    });

    it("does nothing with null handle", () => {
      closeJobObject(null);
      expect(execFileSync).not.toHaveBeenCalled();
    });
  });
});
