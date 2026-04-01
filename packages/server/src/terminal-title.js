let spawnCounter = 0;

export function generateTerminalTitle(_cwd) {
	const n = ++spawnCounter;
	return n === 1 ? "Claudia" : `Claudia ${n}`;
}
