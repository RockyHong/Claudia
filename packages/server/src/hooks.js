// Claude Code hook config read/write/merge for ~/.claude/settings.json

import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const SETTINGS_PATH = path.join(os.homedir(), ".claude", "settings.json");
const CLAUDIA_MARKER = "127.0.0.1:7890/hook";
const LEGACY_MARKER = "port:7890,path:'/event'";

// Hook commands pipe raw stdin JSON to the server via curl.
// The server does the field mapping (session_id → session, etc.) — no node cold start.
function hookCommand(hookType) {
  return `curl -sfS -X POST -H "Content-Type: application/json" -d @- http://127.0.0.1:7890/hook/${hookType} 2>/dev/null || true`;
}

// Legacy node one-liner for systems without curl
function legacyHookCommand(fields) {
  return `node -e "let b='';process.stdin.on('data',c=>b+=c);process.stdin.on('end',()=>{try{const i=JSON.parse(b),h=require('http'),d=JSON.stringify({session:i.session_id,${fields},cwd:i.cwd,ts:Math.floor(Date.now()/1e3)});const r=h.request({hostname:'localhost',port:7890,path:'/event',method:'POST',headers:{'Content-Type':'application/json'}},()=>{});r.on('error',()=>{});r.end(d)}catch(e){}})"`;
}

function hookEntry(hookType, matcher = ".*") {
  return {
    matcher,
    hooks: [{ type: "command", command: hookCommand(hookType) }],
  };
}

const CLAUDIA_HOOKS = {
  SessionStart: [hookEntry("SessionStart")],
  UserPromptSubmit: [hookEntry("UserPromptSubmit")],
  PreToolUse: [hookEntry("PreToolUse")],
  PostToolUse: [hookEntry("PostToolUse")],
  PermissionRequest: [hookEntry("PermissionRequest")],
  Notification: [hookEntry("Notification")],
  Stop: [hookEntry("Stop")],
  SessionEnd: [hookEntry("SessionEnd")],
};

function commandIsClaudia(cmd) {
  return typeof cmd === "string" && (cmd.includes(CLAUDIA_MARKER) || cmd.includes(LEGACY_MARKER));
}

function isClaudiaHook(hook) {
  if (!hook) return false;
  // Match nested format: { matcher, hooks: [{ type, command }] }
  if (Array.isArray(hook.hooks)) {
    return hook.hooks.some((h) => commandIsClaudia(h.command));
  }
  // Match old bare format: { command }
  return commandIsClaudia(hook.command);
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

export { CLAUDIA_HOOKS, CLAUDIA_MARKER, LEGACY_MARKER, legacyHookCommand };
