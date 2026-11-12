import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { extractDisplayName } from "./session-tracker.js";

const PROJECTS_PATH = path.join(os.homedir(), ".claudia", "projects.json");
const MAX_PROJECTS = 50;

// In-memory cache of known paths to avoid redundant disk I/O
const knownPaths = new Set();

// Worktree verdicts per normalized path (the answer for a folder does not change
// during a server run, and listProjects would otherwise stat every entry per call)
const worktreeVerdicts = new Map();

// Thrown by a mutation's read when the file exists but cannot be parsed: writing
// back a list derived from "nothing" would erase the user's real entries.
class CorruptProjectsError extends Error {}

async function readProjectsStrict() {
	let raw;
	try {
		raw = await fs.readFile(PROJECTS_PATH, "utf-8");
	} catch (err) {
		if (err.code === "ENOENT") return [];
		throw err;
	}
	let parsed;
	try {
		parsed = JSON.parse(raw);
	} catch {
		throw new CorruptProjectsError("projects.json is not valid JSON");
	}
	if (!Array.isArray(parsed)) {
		throw new CorruptProjectsError("projects.json is not an array");
	}
	return parsed;
}

async function readProjects() {
	try {
		return await readProjectsStrict();
	} catch (err) {
		if (err instanceof CorruptProjectsError) return [];
		throw err;
	}
}

// Write to a sibling temp file, then rename over the target: a reader sees
// either the old complete file or the new one, never a truncated one.
async function writeProjects(projects) {
	const dir = path.dirname(PROJECTS_PATH);
	await fs.mkdir(dir, { recursive: true });
	const tmpPath = `${PROJECTS_PATH}.${process.pid}.tmp`;
	await fs.writeFile(tmpPath, `${JSON.stringify(projects, null, 2)}\n`);
	try {
		await fs.rename(tmpPath, PROJECTS_PATH);
	} catch (err) {
		try {
			await fs.unlink(tmpPath);
		} catch {
			// best-effort cleanup
		}
		throw err;
	}
}

// Every read-modify-write runs through this chain, so two mutations never
// interleave. A failed mutation rejects to its own caller only.
let mutationChain = Promise.resolve();

function enqueueMutation(task) {
	const run = mutationChain.then(task);
	mutationChain = run.catch(() => {});
	return run;
}

// Runs `mutate(projects)` -> new list under the mutex. Returns true when written,
// false when aborted because the stored file is corrupt.
function mutateProjects(mutate) {
	return enqueueMutation(async () => {
		let projects;
		try {
			projects = await readProjectsStrict();
		} catch (err) {
			if (err instanceof CorruptProjectsError) {
				console.warn(
					`[project-storage] ${err.message}; leaving it untouched, mutation skipped`,
				);
				return false;
			}
			throw err;
		}
		await writeProjects(mutate(projects));
		return true;
	});
}

async function detectWorktree(normalized) {
	if (normalized.includes("/.claude/worktrees/")) return true;

	let dir = normalized;
	while (dir && dir !== ".") {
		const gitPath = `${dir}/.git`;
		try {
			const st = await fs.stat(gitPath);
			if (st.isDirectory()) return false;
			if (st.isFile()) {
				const content = await fs.readFile(gitPath, "utf-8");
				const match = /^gitdir:\s*(.+)/m.exec(content);
				if (!match) return false;
				return match[1].trim().replace(/\\/g, "/").includes("/worktrees/");
			}
			return false;
		} catch (err) {
			if (err?.code !== "ENOENT") return false;
		}
		const parent = path.posix.dirname(dir);
		if (parent === dir) break;
		dir = parent;
	}
	return false;
}

// A linked git worktree (or anything under .claude/worktrees/) is never a folder
// the user works in directly. Submodules also carry a `.git` file but point into
// `.git/modules/`, so they pass. Any fs error means "not a worktree".
async function isWorktreePath(normalized) {
	if (!worktreeVerdicts.has(normalized)) {
		if (worktreeVerdicts.size >= MAX_PROJECTS * 4) worktreeVerdicts.clear();
		worktreeVerdicts.set(normalized, await detectWorktree(normalized));
	}
	return worktreeVerdicts.get(normalized);
}

export async function trackProject(cwd) {
	if (!cwd || typeof cwd !== "string") return;

	const normalized = cwd.replace(/\\/g, "/");

	// Skip disk I/O if this path was already seen this server run
	if (knownPaths.has(normalized)) return;
	if (await isWorktreePath(normalized)) return;
	if (knownPaths.has(normalized)) return;
	if (knownPaths.size >= MAX_PROJECTS * 2) knownPaths.clear();
	knownPaths.add(normalized);

	let written = false;
	try {
		written = await mutateProjects((projects) => {
			const existing = projects.find((p) => p.path === normalized);
			if (existing) {
				existing.lastSeen = Date.now();
			} else {
				projects.push({
					path: normalized,
					name: extractDisplayName(cwd),
					lastSeen: Date.now(),
				});
			}
			projects.sort((a, b) => b.lastSeen - a.lastSeen);
			return projects.slice(0, MAX_PROJECTS);
		});
	} finally {
		// A failed or aborted write must not suppress later tracking of this path
		if (!written) knownPaths.delete(normalized);
	}
}

export async function removeProject(projectPath) {
	if (!projectPath || typeof projectPath !== "string") return;

	const normalized = projectPath.replace(/\\/g, "/");
	knownPaths.delete(normalized);

	await mutateProjects((projects) =>
		projects.filter((p) => p.path !== normalized),
	);
}

export async function listProjects() {
	const projects = await readProjects();
	const verdicts = await Promise.all(
		projects.map((p) =>
			typeof p?.path === "string" ? isWorktreePath(p.path) : false,
		),
	);
	return projects.filter((_, i) => !verdicts[i]);
}
