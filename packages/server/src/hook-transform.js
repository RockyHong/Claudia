// Transforms raw Claude Code hook stdin JSON into Claudia's internal event format.
// The hook type (SessionStart, PreToolUse, etc.) determines which state and fields to extract.

function truncate(str, max = 100) {
	return typeof str === "string" ? str.slice(0, max) : str;
}

const HOOK_TYPE_MAP = {
	SessionStart: (input) => ({ state: "idle" }),
	UserPromptSubmit: (input) => ({ state: "busy" }),
	PreToolUse: (input) => ({ state: "busy", tool: truncate(input.tool_name) }),
	PostToolUse: (input) => ({ state: "busy", tool: truncate(input.tool_name) }),
	PermissionRequest: (input) => ({ state: "pending", tool: truncate(input.tool_name) }),
	Notification: (input) => ({ state: "pending", message: input.notification || "" }),
	Stop: (input) => ({ state: "idle" }),
	SessionEnd: (input) => ({ state: "stopped" }),
};

export function transformHookPayload(hookType, stdinPayload) {
	const mapper = HOOK_TYPE_MAP[hookType];
	if (!mapper) return null;

	if (!stdinPayload || typeof stdinPayload.session_id !== "string") return null;

	const fields = mapper(stdinPayload);

	return {
		session: stdinPayload.session_id,
		...fields,
		cwd: stdinPayload.cwd,
		ts: Math.floor(Date.now() / 1e3),
	};
}

export const VALID_HOOK_TYPES = new Set(Object.keys(HOOK_TYPE_MAP));
