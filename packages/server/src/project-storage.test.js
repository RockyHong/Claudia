import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs/promises", () => ({
	default: {
		readFile: vi.fn(),
		writeFile: vi.fn(),
		mkdir: vi.fn(),
		rename: vi.fn(),
		stat: vi.fn(),
		unlink: vi.fn(),
	},
}));

vi.mock("./session-tracker.js", () => ({
	extractDisplayName: (cwd) =>
		cwd.split("/").pop() || cwd.split("\\").pop() || cwd,
}));

import fs from "node:fs/promises";
import {
	listProjects,
	removeProject,
	trackProject,
} from "./project-storage.js";

const enoent = () => Object.assign(new Error("ENOENT"), { code: "ENOENT" });

// Shared in-memory file system: reads see prior writes and renames, so
// concurrent read-modify-write interleavings show up as lost entries.
function useMemoryFs(initial = {}) {
	const files = new Map(Object.entries(initial));
	const isProjectsFile = (p) => String(p).endsWith("projects.json");
	files.set("__projects__", files.get("__projects__") ?? undefined);
	fs.mkdir.mockResolvedValue(undefined);
	fs.unlink.mockResolvedValue(undefined);
	fs.readFile.mockImplementation(async (p) => {
		await Promise.resolve();
		const key = isProjectsFile(p) ? "__projects__" : String(p);
		const content = files.get(key);
		if (content === undefined) throw enoent();
		return content;
	});
	fs.writeFile.mockImplementation(async (p, data) => {
		await Promise.resolve();
		files.set(isProjectsFile(p) ? "__projects__" : String(p), data);
	});
	fs.rename.mockImplementation(async (from, to) => {
		await Promise.resolve();
		files.set(
			isProjectsFile(to) ? "__projects__" : String(to),
			files.get(String(from)),
		);
		files.delete(String(from));
	});
	fs.stat.mockImplementation(async (p) => {
		const key = String(p).replace(/\\/g, "/");
		const entry = files.get(key);
		if (entry === undefined) throw enoent();
		return {
			isFile: () => entry !== "<dir>",
			isDirectory: () => entry === "<dir>",
		};
	});
	return files;
}

const stored = (files) => JSON.parse(files.get("__projects__"));

describe("listProjects", () => {
	beforeEach(() => {
		vi.resetAllMocks();
	});

	it("returns empty array when file does not exist (ENOENT)", async () => {
		fs.readFile.mockRejectedValue(enoent());

		const result = await listProjects();
		expect(result).toEqual([]);
	});

	it("returns empty array on corrupt JSON (SyntaxError)", async () => {
		fs.readFile.mockResolvedValue("{ not valid json }}}");

		const result = await listProjects();
		expect(result).toEqual([]);
	});

	it("returns parsed projects from valid JSON", async () => {
		const projects = [
			{ path: "/home/user/project-a", name: "project-a", lastSeen: 1000 },
			{ path: "/home/user/project-b", name: "project-b", lastSeen: 900 },
		];
		fs.readFile.mockResolvedValue(JSON.stringify(projects));

		const result = await listProjects();
		expect(result).toEqual(projects);
	});

	it("filters out entries under a .claude/worktrees/ folder", async () => {
		const projects = [
			{ path: "/home/user/real", name: "real", lastSeen: 2 },
			{
				path: "C:/repo/.claude/worktrees/feat-x",
				name: "feat-x",
				lastSeen: 1,
			},
		];
		useMemoryFs({ __projects__: JSON.stringify(projects) });

		const result = await listProjects();
		expect(result.map((p) => p.path)).toEqual(["/home/user/real"]);
	});

	it("filters out linked git worktrees but keeps submodules and normal repos", async () => {
		const projects = [
			{ path: "/w/linked-list", name: "linked-list", lastSeen: 4 },
			{ path: "/w/sub-list", name: "sub-list", lastSeen: 3 },
			{ path: "/w/normal-list", name: "normal-list", lastSeen: 2 },
			{ path: "/w/linked-list-nested/deep", name: "deep", lastSeen: 1 },
		];
		useMemoryFs({
			__projects__: JSON.stringify(projects),
			"/w/linked-list/.git": "gitdir: /main/.git/worktrees/linked-list\n",
			"/w/sub-list/.git": "gitdir: ../.git/modules/sub-list\n",
			"/w/normal-list/.git": "<dir>",
			"/w/linked-list-nested/.git": "gitdir: /main/.git/worktrees/nested\n",
		});

		const result = await listProjects();
		expect(result.map((p) => p.path)).toEqual([
			"/w/sub-list",
			"/w/normal-list",
		]);
	});
});

describe("trackProject", () => {
	beforeEach(() => {
		vi.resetAllMocks();
		fs.mkdir.mockResolvedValue(undefined);
		fs.writeFile.mockResolvedValue(undefined);
		fs.rename.mockResolvedValue(undefined);
	});

	it("adds a new project and writes to disk", async () => {
		fs.readFile.mockResolvedValue("[]");

		await trackProject("/home/user/brand-new-project");

		expect(fs.writeFile).toHaveBeenCalledOnce();
		const written = JSON.parse(fs.writeFile.mock.calls[0][1]);
		expect(written).toHaveLength(1);
		expect(written[0].path).toBe("/home/user/brand-new-project");
		expect(written[0].name).toBe("brand-new-project");
		expect(typeof written[0].lastSeen).toBe("number");
	});

	it("updates lastSeen for an existing project", async () => {
		// Use a path that won't be in the module-level knownPaths cache from prior tests.
		// We need two calls: first populates the cache, so we use a fresh path and
		// simulate the project already existing in the stored JSON on the second read.
		const oldTs = Date.now() - 10000;
		const storedProjects = [
			{
				path: "/home/user/existing-dedup-project",
				name: "existing-dedup-project",
				lastSeen: oldTs,
			},
		];

		// First call — path not in cache yet, reads existing project from disk
		fs.readFile.mockResolvedValueOnce(JSON.stringify(storedProjects));
		await trackProject("/home/user/existing-dedup-project");

		const firstWrite = JSON.parse(fs.writeFile.mock.calls[0][1]);
		expect(firstWrite[0].lastSeen).toBeGreaterThanOrEqual(oldTs);

		// Second call with same path is short-circuited by the knownPaths cache,
		// so we verify no second write occurred.
		vi.resetAllMocks();
		fs.mkdir.mockResolvedValue(undefined);
		fs.writeFile.mockResolvedValue(undefined);
		fs.rename.mockResolvedValue(undefined);

		await trackProject("/home/user/existing-dedup-project");
		expect(fs.writeFile).not.toHaveBeenCalled();
	});

	it("normalizes backslashes to forward slashes", async () => {
		fs.readFile.mockResolvedValue("[]");

		await trackProject("C:\\Users\\user\\my-windows-project");

		expect(fs.writeFile).toHaveBeenCalledOnce();
		const written = JSON.parse(fs.writeFile.mock.calls[0][1]);
		expect(written[0].path).toBe("C:/Users/user/my-windows-project");
	});

	it("ignores null input", async () => {
		await trackProject(null);
		expect(fs.writeFile).not.toHaveBeenCalled();
	});

	it("ignores undefined input", async () => {
		await trackProject(undefined);
		expect(fs.writeFile).not.toHaveBeenCalled();
	});

	it("ignores non-string input", async () => {
		await trackProject(42);
		expect(fs.writeFile).not.toHaveBeenCalled();
	});

	it("sorts by lastSeen descending", async () => {
		const older = {
			path: "/home/user/sort-older-project",
			name: "sort-older-project",
			lastSeen: 500,
		};
		const newer = {
			path: "/home/user/sort-newer-project",
			name: "sort-newer-project",
			lastSeen: 1500,
		};
		// Provide them in ascending order to confirm sorting reverses them
		fs.readFile.mockResolvedValue(JSON.stringify([older, newer]));

		await trackProject("/home/user/sort-added-project");

		const written = JSON.parse(fs.writeFile.mock.calls[0][1]);
		// The newly added project gets a fresh Date.now() timestamp, so it will be first.
		// The remaining two should be newer (1500) then older (500).
		expect(written[0].path).toBe("/home/user/sort-added-project");
		expect(written[1].path).toBe("/home/user/sort-newer-project");
		expect(written[2].path).toBe("/home/user/sort-older-project");
	});

	it("keeps every entry when calls for different paths run concurrently", async () => {
		const files = useMemoryFs({ __projects__: "[]" });
		const paths = ["a", "b", "c", "d", "e"].map((n) => `/conc/${n}-project`);

		await Promise.all(paths.map((p) => trackProject(p)));

		expect(
			stored(files)
				.map((p) => p.path)
				.sort(),
		).toEqual([...paths].sort());
	});

	it("writes to a temp file in the same dir, then renames over the target", async () => {
		useMemoryFs({ __projects__: "[]" });

		await trackProject("/atomic/write-project");

		const tmpPath = fs.writeFile.mock.calls[0][0];
		expect(tmpPath).toMatch(/projects\.json\..+\.tmp$/);
		expect(fs.rename).toHaveBeenCalledOnce();
		const [from, to] = fs.rename.mock.calls[0];
		expect(from).toBe(tmpPath);
		expect(to).toMatch(/projects\.json$/);
	});

	it("aborts without writing when the stored file is corrupt", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const files = useMemoryFs({ __projects__: "{ truncated" });

		await trackProject("/corrupt/abort-project");

		expect(fs.writeFile).not.toHaveBeenCalled();
		expect(fs.rename).not.toHaveBeenCalled();
		expect(files.get("__projects__")).toBe("{ truncated");
		expect(warn).toHaveBeenCalled();
		warn.mockRestore();
	});

	it("does not suppress later tracking of a path whose write was aborted", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const files = useMemoryFs({ __projects__: "{ truncated" });
		await trackProject("/retry/after-abort");
		warn.mockRestore();

		files.set("__projects__", "[]");
		await trackProject("/retry/after-abort");

		expect(stored(files).map((p) => p.path)).toEqual(["/retry/after-abort"]);
	});

	it("a failed mutation does not break the queue for later ones", async () => {
		const files = useMemoryFs({ __projects__: "[]" });
		fs.writeFile.mockRejectedValueOnce(new Error("disk full"));

		await expect(trackProject("/queue/fails-first")).rejects.toThrow(
			"disk full",
		);
		await trackProject("/queue/works-after");

		expect(stored(files).map((p) => p.path)).toEqual(["/queue/works-after"]);
	});

	it("does not track a .claude/worktrees/ path", async () => {
		useMemoryFs({ __projects__: "[]" });

		await trackProject("C:\\repo\\.claude\\worktrees\\feat-y");

		expect(fs.writeFile).not.toHaveBeenCalled();
	});

	it("does not track a linked git worktree", async () => {
		useMemoryFs({
			__projects__: "[]",
			"/lw/tree/.git": "gitdir: /main/.git/worktrees/tree\n",
		});

		await trackProject("/lw/tree/src");

		expect(fs.writeFile).not.toHaveBeenCalled();
	});

	it("tracks a submodule folder", async () => {
		const files = useMemoryFs({
			__projects__: "[]",
			"/sm/mod/.git": "gitdir: ../.git/modules/mod\n",
		});

		await trackProject("/sm/mod");

		expect(stored(files).map((p) => p.path)).toEqual(["/sm/mod"]);
	});
});

describe("removeProject", () => {
	beforeEach(() => {
		vi.resetAllMocks();
		fs.mkdir.mockResolvedValue(undefined);
		fs.writeFile.mockResolvedValue(undefined);
		fs.rename.mockResolvedValue(undefined);
	});

	it("filters out the specified path", async () => {
		const projects = [
			{ path: "/home/user/keep-project", name: "keep-project", lastSeen: 2000 },
			{
				path: "/home/user/remove-project",
				name: "remove-project",
				lastSeen: 1000,
			},
		];
		fs.readFile.mockResolvedValue(JSON.stringify(projects));

		await removeProject("/home/user/remove-project");

		expect(fs.writeFile).toHaveBeenCalledOnce();
		const written = JSON.parse(fs.writeFile.mock.calls[0][1]);
		expect(written).toHaveLength(1);
		expect(written[0].path).toBe("/home/user/keep-project");
	});

	it("aborts without writing when the stored file is corrupt", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		useMemoryFs({ __projects__: "oops{" });

		await removeProject("/home/user/whatever");

		expect(fs.writeFile).not.toHaveBeenCalled();
		warn.mockRestore();
	});

	it("ignores null input", async () => {
		await removeProject(null);
		expect(fs.writeFile).not.toHaveBeenCalled();
	});

	it("ignores undefined input", async () => {
		await removeProject(undefined);
		expect(fs.writeFile).not.toHaveBeenCalled();
	});
});
