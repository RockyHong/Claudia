#!/usr/bin/env node

// Remove all build output so the next build starts fresh.
// Only touches files inside the project directory.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const buildDirs = [
	"dist",
	"packages/web/dist",
	"packages/web/.svelte-kit",
	"src-tauri/target",
];

for (const dir of buildDirs) {
	const full = path.join(root, dir);
	try {
		fs.rmSync(full, { recursive: true, force: true });
		console.log(`removed ${dir}`);
	} catch (err) {
		console.warn(`skipped ${dir} (${err.code})`);
	}
}

// Clean sidecar binaries but keep .gitkeep
const binDir = path.join(root, "src-tauri/binaries");
try {
	for (const f of fs.readdirSync(binDir)) {
		if (f === ".gitkeep") continue;
		fs.rmSync(path.join(binDir, f), { force: true });
		console.log(`removed src-tauri/binaries/${f}`);
	}
} catch {
	// binaries dir may not exist
}
