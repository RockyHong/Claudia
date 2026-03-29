import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createPreferences } from "./preferences.js";

let tmpDir;
let prefs;

beforeEach(async () => {
  tmpDir = path.join(os.tmpdir(), `claudia-prefs-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await fs.mkdir(tmpDir, { recursive: true });
  prefs = createPreferences(tmpDir);
});

afterEach(async () => {
  if (tmpDir) await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("preferences", () => {
  it("returns defaults when no config exists", async () => {
    const p = await prefs.get();
    expect(p.activeSet).toBe("default");
    expect(p.theme).toBe("dark");
    expect(p.immersive).toBe(false);
    expect(p.sfx).toEqual({ muted: false, volume: 0.5 });
  });

  it("merges partial update into defaults", async () => {
    const p = await prefs.set({ theme: "light" });
    expect(p.theme).toBe("light");
    expect(p.sfx).toEqual({ muted: false, volume: 0.5 });
  });

  it("deep-merges sfx sub-object", async () => {
    const p = await prefs.set({ sfx: { volume: 0.8 } });
    expect(p.sfx.volume).toBe(0.8);
    expect(p.sfx.muted).toBe(false);
  });

  it("persists to disk", async () => {
    await prefs.set({ theme: "light" });
    const raw = JSON.parse(await fs.readFile(path.join(tmpDir, "config.json"), "utf-8"));
    expect(raw.theme).toBe("light");
  });

  it("preserves unknown keys from existing config", async () => {
    await fs.writeFile(path.join(tmpDir, "config.json"), JSON.stringify({ customKey: 42 }));
    const p = await prefs.set({ theme: "light" });
    expect(p.customKey).toBe(42);
    expect(p.theme).toBe("light");
  });

  it("get() reads from current file state", async () => {
    await prefs.set({ immersive: true });
    const p = await prefs.get();
    expect(p.immersive).toBe(true);
  });
});
