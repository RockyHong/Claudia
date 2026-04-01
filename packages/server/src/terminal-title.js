let spawnCounter = 0;

export function generateTerminalTitle(cwd) {
	const name =
		cwd.replace(/\\/g, "/").split("/").filter(Boolean).pop() || "session";
	const n = ++spawnCounter;
	return n === 1 ? name : `${name} ${n}`;
}
