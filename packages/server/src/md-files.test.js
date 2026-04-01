import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", () => ({
	execFile: vi.fn(),
}));
vi.mock("node:fs/promises", () => ({
	default: {
		readFile: vi.fn(),
		stat: vi.fn(),
		readdir: vi.fn(),
	},
}));

import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import { buildMdTree, readMdFile } from "./md-files.js";

describe("buildMdTree", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns nested tree from git ls-files output", async () => {
		execFile.mockImplementation((_cmd, _args, _opts, cb) => {
			cb(null, {
				stdout: "README.md\ndocs/overview.md\ndocs/building.md\n",
			});
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
		execFile.mockImplementation((_cmd, _args, _opts, cb) => {
			cb(null, { stdout: "z.md\na.md\nlib/c.md\nlib/a.md\n" });
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

	it("falls back to recursive scan when git fails", async () => {
		execFile.mockImplementation((_cmd, _args, _opts, cb) => {
			cb(new Error("not a git repo"));
		});

		fs.readdir.mockImplementation(async (dir, _opts) => {
			if (dir === "/projects/nogit") {
				return [
					{ name: "README.md", isDirectory: () => false, isFile: () => true },
					{
						name: "node_modules",
						isDirectory: () => true,
						isFile: () => false,
					},
					{ name: "docs", isDirectory: () => true, isFile: () => false },
				];
			}
			if (dir.endsWith("docs")) {
				return [
					{ name: "guide.md", isDirectory: () => false, isFile: () => true },
				];
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
