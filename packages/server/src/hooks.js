// Claude Code hook config read/write/merge for ~/.claude/settings.json

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const SETTINGS_PATH = path.join(os.homedir(), ".claude", "settings.json");
const CLAUDIA_MARKER = "127.0.0.1:48901/hook";

// Hook commands pipe raw stdin JSON to the server via curl.
// The server does the field mapping (session_id → session, etc.) — no node cold start.
function hookCommand(hookType, extraHeaders = "") {
	return `curl -sfS -X POST -H "Content-Type: application/json"${extraHeaders} -d @- http://127.0.0.1:48901/hook/${hookType} 2>/dev/null || true`;
}

// Non-blocking variant: reads stdin eagerly, then POSTs in background.
// Used for hooks where Claude Code shouldn't wait (Stop, SessionEnd).
function hookCommandAsync(hookType) {
	return `input=$(cat); (curl -sfS -X POST -H "Content-Type: application/json" -d "$input" http://127.0.0.1:48901/hook/${hookType} 2>/dev/null &) ; true`;
}

function hookEntry(
	hookType,
	matcher = ".*",
	background = false,
	extraHeaders = "",
) {
	return {
		matcher,
		hooks: [
			{
				type: "command",
				command: background
					? hookCommandAsync(hookType)
					: hookCommand(hookType, extraHeaders),
			},
		],
	};
}

// The hook resolves nothing: it hands the server the Windows pid of the shell
// running it, and the server walks that pid to the terminal window
// (`resolveTerminalWindow` in pid-ancestry.js). Shared by SessionStart and
// UserPromptSubmit — the two auto-linking hooks (SessionStart for fresh
// sessions, UserPromptSubmit for sessions that pre-existed the server).
//
// `$$` is load-bearing: `/proc/self/winpid` names the forked `cat`, whose pid
// is dead before the server reads it. Off MSYS (or off Windows) `/proc` is
// absent, the substitution is empty, and the header goes out empty — the
// intended degrade, handled server-side as "no pid, use the legacy headers".
const PID_HEADER = ' -H "X-Hook-Pid: $(cat /proc/$$/winpid 2>/dev/null)"';

const CLAUDIA_HOOKS = {
	SessionStart: [hookEntry("SessionStart", ".*", false, PID_HEADER)],
	UserPromptSubmit: [hookEntry("UserPromptSubmit", ".*", false, PID_HEADER)],
	PreToolUse: [hookEntry("PreToolUse")],
	PostToolUse: [hookEntry("PostToolUse")],
	PermissionRequest: [hookEntry("PermissionRequest")],
	Stop: [hookEntry("Stop", ".*", true)],
	SessionEnd: [hookEntry("SessionEnd", ".*", true)],
	SubagentStop: [hookEntry("SubagentStop")],
	PreCompact: [hookEntry("PreCompact")],
};

function commandIsClaudia(cmd) {
	return typeof cmd === "string" && cmd.includes(CLAUDIA_MARKER);
}

function isClaudiaHook(hook) {
	if (!hook) return false;
	if (Array.isArray(hook.hooks)) {
		return hook.hooks.some((h) => commandIsClaudia(h.command));
	}
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
	await fs.writeFile(SETTINGS_PATH, `${JSON.stringify(settings, null, 2)}\n`);
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
		const existing = Array.isArray(merged.hooks[event])
			? merged.hooks[event]
			: [];
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
		cleaned.hooks[event] = cleaned.hooks[event].filter(
			(h) => !isClaudiaHook(h),
		);
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
