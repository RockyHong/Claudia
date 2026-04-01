import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const IGNORED_DIRS = new Set([
	"node_modules",
	".git",
	"dist",
	"build",
	".next",
	"vendor",
	".svelte-kit",
	"coverage",
	".superpowers",
]);

export async function buildMdTree(cwd) {
	let files;
	try {
		const [tracked, untracked] = await Promise.all([
			execFileAsync("git", ["ls-files", "*.md"], { cwd, timeout: 5000 }),
			execFileAsync(
				"git",
				["ls-files", "--others", "--exclude-standard", "*.md"],
				{ cwd, timeout: 5000 },
			),
		]);
		const all = `${tracked.stdout}\n${untracked.stdout}`;
		files = [...new Set(all.trim().split("\n").filter(Boolean))];
	} catch {
		files = await scanMdFiles(cwd, "");
	}
	return filesToTree(files);
}

async function scanMdFiles(base, rel) {
	const dir = rel ? path.join(base, rel) : base;
	const results = [];
	let entries;
	try {
		entries = await fs.readdir(dir, { withFileTypes: true });
	} catch {
		return results;
	}
	for (const entry of entries) {
		if (entry.isDirectory() && !IGNORED_DIRS.has(entry.name)) {
			const sub = rel ? `${rel}/${entry.name}` : entry.name;
			results.push(...(await scanMdFiles(base, sub)));
		} else if (entry.isFile() && entry.name.endsWith(".md")) {
			results.push(rel ? `${rel}/${entry.name}` : entry.name);
		}
	}
	return results;
}

function filesToTree(files) {
	const root = {};
	for (const file of files) {
		const parts = file.split("/");
		let node = root;
		for (let i = 0; i < parts.length - 1; i++) {
			if (!node[parts[i]]) node[parts[i]] = {};
			node = node[parts[i]];
		}
		node[parts[parts.length - 1]] = file;
	}
	return nodeToArray(root);
}

function nodeToArray(node) {
	const folders = [];
	const files = [];
	for (const [name, value] of Object.entries(node)) {
		if (typeof value === "string") {
			files.push({ name, path: value });
		} else {
			folders.push({ name, children: nodeToArray(value) });
		}
	}
	folders.sort((a, b) => a.name.localeCompare(b.name));
	files.sort((a, b) => a.name.localeCompare(b.name));
	return [...folders, ...files];
}

export async function readMdFile(cwd, filePath) {
	if (!filePath.endsWith(".md")) {
		throw new Error("Invalid path");
	}
	if (path.isAbsolute(filePath)) {
		throw new Error("Invalid path");
	}
	const resolved = path.resolve(cwd, filePath);
	if (!resolved.startsWith(path.resolve(cwd))) {
		throw new Error("Invalid path");
	}

	const stat = await fs.stat(resolved);
	const content = await fs.readFile(resolved, "utf-8");
	return { content, mtime: stat.mtimeMs };
}
