// Claude Code hook config read/write/merge for ~/.claude/settings.json

import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const SETTINGS_PATH = path.join(os.homedir(), ".claude", "settings.json");
const CLAUDIA_MARKER = "port:7890,path:'/event'";

// Hook commands use node instead of curl to avoid shell injection.
// JSON.stringify safely escapes all env var content (quotes, metacharacters).
function hookCommand(fields) {
  const payload = `{session:process.env.CLAUDE_SESSION_ID,${fields},cwd:process.cwd(),ts:Math.floor(Date.now()/1e3)}`;
  return `node -e "const h=require('http'),d=JSON.stringify(${payload});const r=h.request({hostname:'localhost',port:7890,path:'/event',method:'POST',headers:{'Content-Type':'application/json'}},()=>{});r.on('error',()=>{});r.end(d)"`;
}

const CLAUDIA_HOOKS = {
  PreToolUse: [
    {
      command: hookCommand("state:'working',tool:process.env.CLAUDE_TOOL_NAME"),
    },
  ],
  PostToolUse: [
    {
      command: hookCommand("state:'idle'"),
    },
  ],
  Notification: [
    {
      command: hookCommand("state:'pending',message:process.env.CLAUDE_NOTIFICATION"),
    },
  ],
  Stop: [
    {
      command: hookCommand("state:'stopped'"),
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
