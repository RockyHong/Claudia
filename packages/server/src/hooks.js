// Claude Code hook config read/write/merge for ~/.claude/settings.json

import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const SETTINGS_PATH = path.join(os.homedir(), ".claude", "settings.json");
const CLAUDIA_MARKER = "port:7890,path:'/event'";

// Hook commands read session context from stdin (JSON piped by Claude Code).
// Stdin includes session_id, tool_name, cwd, etc.
function hookCommand(fields) {
  return `node -e "let b='';process.stdin.on('data',c=>b+=c);process.stdin.on('end',()=>{try{const i=JSON.parse(b),h=require('http'),d=JSON.stringify({session:i.session_id,${fields},cwd:i.cwd,ts:Math.floor(Date.now()/1e3)});const r=h.request({hostname:'localhost',port:7890,path:'/event',method:'POST',headers:{'Content-Type':'application/json'}},()=>{});r.on('error',()=>{});r.end(d)}catch(e){}})"`;
}

const CLAUDIA_HOOKS = {
  SessionStart: [
    {
      matcher: ".*",
      hooks: [
        {
          type: "command",
          command: hookCommand("state:'idle'"),
        },
      ],
    },
  ],
  PreToolUse: [
    {
      matcher: ".*",
      hooks: [
        {
          type: "command",
          command: hookCommand("state:'busy',tool:i.tool_name"),
        },
      ],
    },
  ],
  PostToolUse: [
    {
      matcher: ".*",
      hooks: [
        {
          type: "command",
          command: hookCommand("state:'busy',tool:i.tool_name"),
        },
      ],
    },
  ],
  Notification: [
    {
      matcher: "permission_prompt",
      hooks: [
        {
          type: "command",
          command: hookCommand("state:'pending',message:i.notification||''"),
        },
      ],
    },
  ],
  Stop: [
    {
      matcher: ".*",
      hooks: [
        {
          type: "command",
          command: hookCommand("state:'idle'"),
        },
      ],
    },
  ],
  SessionEnd: [
    {
      matcher: ".*",
      hooks: [
        {
          type: "command",
          command: hookCommand("state:'stopped'"),
        },
      ],
    },
  ],
};

function isClaudiaHook(hook) {
  if (!hook) return false;
  // Match new nested format: { matcher, hooks: [{ type, command }] }
  if (Array.isArray(hook.hooks)) {
    return hook.hooks.some(
      (h) => typeof h.command === "string" && h.command.includes(CLAUDIA_MARKER),
    );
  }
  // Match old bare format: { command }
  return typeof hook.command === "string" && hook.command.includes(CLAUDIA_MARKER);
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
