let spawnCounter = 0;

export function generateTerminalTitle(cwd) {
	const name =
		cwd.replace(/\\/g, "/").split("/").filter(Boolean).pop() || "session";
	const uid = (++spawnCounter).toString(36).padStart(2, "0");
	return `${name}-${uid}`;
}
