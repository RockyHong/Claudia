let spawnCounter = 0;

function sanitize(str) {
	return str.replace(/[^a-zA-Z0-9\-_. ]/g, "").trim() || "session";
}

export function generateTerminalTitle(cwd) {
	const name = sanitize(
		cwd.replace(/\\/g, "/").split("/").filter(Boolean).pop() || "",
	);
	const n = ++spawnCounter;
	return `${name} claudia ${n}`;
}
