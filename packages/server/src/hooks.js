// Claude Code hook config read/write/merge for ~/.claude/settings.json

import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const SETTINGS_PATH = path.join(os.homedir(), ".claude", "settings.json");
const CLAUDIA_MARKER = "localhost:7890/event";

const CLAUDIA_HOOKS = {
  PreToolUse: [
    {
      command: `curl -s -X POST http://localhost:7890/event -H 'Content-Type: application/json' -d '{"session": "'"$CLAUDE_SESSION_ID"'", "state": "working", "tool": "'"$CLAUDE_TOOL_NAME"'", "cwd": "'"$(pwd)"'", "ts": '$(date +%s)'}'`,
    },
  ],
  PostToolUse: [
    {
      command: `curl -s -X POST http://localhost:7890/event -H 'Content-Type: application/json' -d '{"session": "'"$CLAUDE_SESSION_ID"'", "state": "idle", "cwd": "'"$(pwd)"'", "ts": '$(date +%s)'}'`,
    },
  ],
  Notification: [
    {
      command: `curl -s -X POST http://localhost:7890/event -H 'Content-Type: application/json' -d '{"session": "'"$CLAUDE_SESSION_ID"'", "state": "pending", "message": "'"$CLAUDE_NOTIFICATION"'", "cwd": "'"$(pwd)"'", "ts": '$(date +%s)'}'`,
    },
  ],
  Stop: [
    {
      command: `curl -s -X POST http://localhost:7890/event -H 'Content-Type: application/json' -d '{"session": "'"$CLAUDE_SESSION_ID"'", "state": "stopped", "cwd": "'"$(pwd)"'", "ts": '$(date +%s)'}'`,
    },
  ],
};

function isClaudiaHook(hook) {
  return hook && typeof hook.command === "string" && hook.command.includes(CLAUDIA_MARKER);
}

export async function readSettings() {
  try {
    const content = await fs.readFile(SETTINGS_PATH, "utf-8");
    return JSON.parse(content);
  } catch (err) {
    if (err.code === "ENOENT") return {};
    if (err instanceof SyntaxError) {
      throw new Error(`Malformed JSON in ${SETTINGS_PATH}: ${err.message}`);
    }
    throw err;
  }
}

export async function writeSettings(settings) {
  const dir = path.dirname(SETTINGS_PATH);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(SETTINGS_PATH, JSON.stringify(settings, null, 2) + "\n");
}

export function hasClaudiaHooks(settings) {
  const hooks = settings.hooks;
  if (!hooks) return false;
  return Object.values(hooks).some(
    (hookList) => Array.isArray(hookList) && hookList.some(isClaudiaHook),
  );
}

export function mergeHooks(settings) {
  const merged = { ...settings };
  merged.hooks = { ...merged.hooks };

  for (const [event, claudiaHooks] of Object.entries(CLAUDIA_HOOKS)) {
    const existing = Array.isArray(merged.hooks[event]) ? merged.hooks[event] : [];
    const withoutCloudia = existing.filter((h) => !isClaudiaHook(h));
    merged.hooks[event] = [...withoutCloudia, ...claudiaHooks];
  }

  return merged;
}

export function removeHooks(settings) {
  const cleaned = { ...settings };
  cleaned.hooks = { ...cleaned.hooks };

  for (const event of Object.keys(cleaned.hooks)) {
    if (!Array.isArray(cleaned.hooks[event])) continue;
    cleaned.hooks[event] = cleaned.hooks[event].filter((h) => !isClaudiaHook(h));
    if (cleaned.hooks[event].length === 0) {
      delete cleaned.hooks[event];
    }
  }

  if (Object.keys(cleaned.hooks).length === 0) {
    delete cleaned.hooks;
  }

  return cleaned;
}

export function getSettingsPath() {
  return SETTINGS_PATH;
}

export { CLAUDIA_HOOKS, CLAUDIA_MARKER };
