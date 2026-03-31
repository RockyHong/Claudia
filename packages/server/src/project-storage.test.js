import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs/promises", () => ({
	default: {
		readFile: vi.fn(),
		writeFile: vi.fn(),
		mkdir: vi.fn(),
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

describe("listProjects", () => {
	beforeEach(() => {
		vi.resetAllMocks();
	});

	it("returns empty array when file does not exist (ENOENT)", async () => {
		const err = Object.assign(new Error("ENOENT"), { code: "ENOENT" });
		fs.readFile.mockRejectedValue(err);

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
});

describe("trackProject", () => {
	beforeEach(() => {
		vi.resetAllMocks();
		fs.mkdir.mockResolvedValue(undefined);
		fs.writeFile.mockResolvedValue(undefined);
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
});

describe("removeProject", () => {
	beforeEach(() => {
		vi.resetAllMocks();
		fs.mkdir.mockResolvedValue(undefined);
		fs.writeFile.mockResolvedValue(undefined);
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

	it("ignores null input", async () => {
		await removeProject(null);
		expect(fs.writeFile).not.toHaveBeenCalled();
	});

	it("ignores undefined input", async () => {
		await removeProject(undefined);
		expect(fs.writeFile).not.toHaveBeenCalled();
	});
});
