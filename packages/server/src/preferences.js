import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const DEFAULTS = {
  activeSet: "default",
  theme: "dark",
  immersive: false,
  autoFocus: true,
  typingAmbience: false,
  sfx: { muted: false, volume: 0.5 },
};

export function createPreferences(baseDir) {
  const configPath = path.join(baseDir, "config.json");

  async function readRaw() {
    try {
      const raw = await fs.readFile(configPath, "utf-8");
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }

  async function get() {
    const raw = await readRaw();
    return {
      ...DEFAULTS,
      ...raw,
      sfx: { ...DEFAULTS.sfx, ...raw.sfx },
    };
  }

  async function set(patch) {
    const current = await readRaw();
    if (patch.sfx) {
      current.sfx = { ...current.sfx, ...patch.sfx };
      delete patch.sfx;
    }
    Object.assign(current, patch);
    await fs.writeFile(configPath, JSON.stringify(current, null, 2) + "\n");
    return get();
  }

  return { get, set };
}

// Default singleton for production use
const DEFAULT_DIR = path.join(os.homedir(), ".claudia");
const defaultPrefs = createPreferences(DEFAULT_DIR);

export const getPreferences = defaultPrefs.get;
export const setPreferences = defaultPrefs.set;
