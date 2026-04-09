import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs/promises", () => ({
	default: {
		readFile: vi.fn(),
		stat: vi.fn(),
		readdir: vi.fn(),
	},
}));

import fs from "node:fs/promises";
import { buildMdTree, readMdFile } from "./md-files.js";

function dirent(name, isDir) {
	return {
		name,
		isDirectory: () => isDir,
		isFile: () => !isDir,
	};
}

describe("buildMdTree", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns nested tree from recursive scan", async () => {
		fs.readdir.mockImplementation(async (dir) => {
			if (dir === "/projects/claudia") {
				return [dirent("README.md", false), dirent("docs", true)];
			}
			if (dir.endsWith("docs")) {
				return [dirent("overview.md", false), dirent("building.md", false)];
			}
			return [];
		});

		const tree = await buildMdTree("/projects/claudia");

		expect(tree).toEqual([
			{
				name: "docs",
				children: [
					{ name: "building.md", path: "docs/building.md" },
					{ name: "overview.md", path: "docs/overview.md" },
				],
			},
			{ name: "README.md", path: "README.md" },
		]);
	});

	it("sorts folders before files, alphabetically within each", async () => {
		fs.readdir.mockImplementation(async (dir) => {
			if (dir === "/projects/test") {
				return [
					dirent("z.md", false),
					dirent("a.md", false),
					dirent("lib", true),
				];
			}
			if (dir.endsWith("lib")) {
				return [dirent("c.md", false), dirent("a.md", false)];
			}
			return [];
		});

		const tree = await buildMdTree("/projects/test");

		expect(tree).toEqual([
			{
				name: "lib",
				children: [
					{ name: "a.md", path: "lib/a.md" },
					{ name: "c.md", path: "lib/c.md" },
				],
			},
			{ name: "a.md", path: "a.md" },
			{ name: "z.md", path: "z.md" },
		]);
	});

	it("skips ignored directories like node_modules", async () => {
		fs.readdir.mockImplementation(async (dir) => {
			if (dir === "/projects/nogit") {
				return [
					dirent("README.md", false),
					dirent("node_modules", true),
					dirent("docs", true),
				];
			}
			if (dir.endsWith("docs")) {
				return [dirent("guide.md", false)];
			}
			return [];
		});

		const tree = await buildMdTree("/projects/nogit");

		expect(tree).toEqual([
			{
				name: "docs",
				children: [{ name: "guide.md", path: "docs/guide.md" }],
			},
			{ name: "README.md", path: "README.md" },
		]);
	});
});

describe("readMdFile", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("reads a valid .md file and returns content + mtime", async () => {
		fs.stat.mockResolvedValue({ mtimeMs: 1700000000000 });
		fs.readFile.mockResolvedValue("# Hello\n\nWorld");

		const result = await readMdFile("/projects/claudia", "docs/overview.md");

		expect(result).toEqual({
			content: "# Hello\n\nWorld",
			mtime: 1700000000000,
		});
	});

	it("rejects paths that escape cwd via ../", async () => {
		await expect(
			readMdFile("/projects/claudia", "../../../etc/passwd"),
		).rejects.toThrow("Invalid path");
	});

	it("rejects non-.md files", async () => {
		await expect(
			readMdFile("/projects/claudia", "src/index.js"),
		).rejects.toThrow("Invalid path");
	});

	it("rejects absolute paths", async () => {
		await expect(
			readMdFile("/projects/claudia", "/etc/passwd"),
		).rejects.toThrow("Invalid path");
	});
});
