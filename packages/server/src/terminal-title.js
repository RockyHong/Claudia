import { randomBytes } from "node:crypto";

/**
 * Generate a terminal title for a spawned session.
 * Format: "{projectName} {4-char hex}" — e.g. "Claudia 7f3a"
 * Used as both the Windows Terminal tab title and the session displayName.
 */
export function generateTerminalTitle(cwd) {
	const name = extractName(cwd);
	const hex = randomBytes(2).toString("hex");
	return `${name} ${hex}`;
}

function extractName(cwd) {
	if (!cwd) return "session";
	const normalized = cwd.replace(/\\/g, "/");
	return normalized.split("/").filter(Boolean).pop() || "session";
}
