import { describe, it, expect } from "vitest";
import { mergeHooks, removeHooks, hasClaudiaHooks, CLAUDIA_MARKER } from "./hooks.js";

describe("hasClaudiaHooks", () => {
  it("returns false for empty settings", () => {
    expect(hasClaudiaHooks({})).toBe(false);
  });

  it("returns false when no Claudia hooks present", () => {
    const settings = {
      hooks: {
        PreToolUse: [{ command: "echo hello" }],
      },
    };
    expect(hasClaudiaHooks(settings)).toBe(false);
  });

  it("returns true when Claudia hooks are present", () => {
    const settings = {
      hooks: {
        PreToolUse: [{ command: `curl -s http://${CLAUDIA_MARKER}` }],
      },
    };
    expect(hasClaudiaHooks(settings)).toBe(true);
  });
});

describe("mergeHooks", () => {
  it("adds hooks to empty settings", () => {
    const result = mergeHooks({});
    expect(result.hooks.PreToolUse).toHaveLength(1);
    expect(result.hooks.PostToolUse).toHaveLength(1);
    expect(result.hooks.Notification).toHaveLength(1);
    expect(result.hooks.PreToolUse[0].command).toContain(CLAUDIA_MARKER);
  });

  it("preserves existing user hooks", () => {
    const settings = {
      hooks: {
        PreToolUse: [{ command: "echo user-hook" }],
      },
    };
    const result = mergeHooks(settings);
    expect(result.hooks.PreToolUse).toHaveLength(2);
    expect(result.hooks.PreToolUse[0].command).toBe("echo user-hook");
    expect(result.hooks.PreToolUse[1].command).toContain(CLAUDIA_MARKER);
  });

  it("replaces existing Claudia hooks (idempotent)", () => {
    const settings = {
      hooks: {
        PreToolUse: [
          { command: "echo user-hook" },
          { command: `curl -s http://${CLAUDIA_MARKER} -d old` },
        ],
      },
    };
    const result = mergeHooks(settings);
    expect(result.hooks.PreToolUse).toHaveLength(2);
    expect(result.hooks.PreToolUse[0].command).toBe("echo user-hook");
    expect(result.hooks.PreToolUse[1].command).toContain(CLAUDIA_MARKER);
  });

  it("does not mutate the original settings", () => {
    const settings = { hooks: { PreToolUse: [{ command: "echo hi" }] } };
    const original = JSON.parse(JSON.stringify(settings));
    mergeHooks(settings);
    expect(settings).toEqual(original);
  });

  it("preserves non-hook settings", () => {
    const settings = { theme: "dark", permissions: { allow: ["Read"] } };
    const result = mergeHooks(settings);
    expect(result.theme).toBe("dark");
    expect(result.permissions).toEqual({ allow: ["Read"] });
  });
});

describe("removeHooks", () => {
  it("removes only Claudia hooks", () => {
    const settings = {
      hooks: {
        PreToolUse: [
          { command: "echo user-hook" },
          { command: `curl -s http://${CLAUDIA_MARKER} -d something` },
        ],
      },
    };
    const result = removeHooks(settings);
    expect(result.hooks.PreToolUse).toHaveLength(1);
    expect(result.hooks.PreToolUse[0].command).toBe("echo user-hook");
  });

  it("removes empty hook arrays and hooks object", () => {
    const settings = {
      hooks: {
        PreToolUse: [{ command: `curl -s http://${CLAUDIA_MARKER}` }],
      },
    };
    const result = removeHooks(settings);
    expect(result.hooks).toBeUndefined();
  });

  it("is a no-op when no Claudia hooks exist", () => {
    const settings = {
      hooks: {
        PreToolUse: [{ command: "echo user-hook" }],
      },
    };
    const result = removeHooks(settings);
    expect(result.hooks.PreToolUse).toHaveLength(1);
  });

  it("does not mutate the original settings", () => {
    const settings = {
      hooks: {
        PreToolUse: [{ command: `curl -s http://${CLAUDIA_MARKER}` }],
      },
    };
    const original = JSON.parse(JSON.stringify(settings));
    removeHooks(settings);
    expect(settings).toEqual(original);
  });

  it("preserves non-hook settings", () => {
    const settings = {
      theme: "dark",
      hooks: {
        PreToolUse: [{ command: `curl -s http://${CLAUDIA_MARKER}` }],
      },
    };
    const result = removeHooks(settings);
    expect(result.theme).toBe("dark");
  });
});
