import { describe, it, expect, beforeEach, vi } from "vitest";

const mockExecFile = vi.fn();
vi.mock("node:child_process", () => ({
	execFile: mockExecFile,
}));

const { getGitStatus } = await import("./git-status.js");

describe("getGitStatus", () => {
	beforeEach(() => {
		mockExecFile.mockReset();
	});

	it("returns { isGit: false } when cwd is null", async () => {
		const result = await getGitStatus(null);
		expect(result).toEqual({ isGit: false });
		expect(mockExecFile).not.toHaveBeenCalled();
	});

	it("returns { isGit: false } when cwd is undefined", async () => {
		const result = await getGitStatus(undefined);
		expect(result).toEqual({ isGit: false });
		expect(mockExecFile).not.toHaveBeenCalled();
	});

	it("returns { isGit: false } when cwd is empty string", async () => {
		const result = await getGitStatus("");
		expect(result).toEqual({ isGit: false });
		expect(mockExecFile).not.toHaveBeenCalled();
	});

	it("returns branch name and dirty: false for a clean repo", async () => {
		mockExecFile.mockImplementation((cmd, args, opts, cb) => {
			if (args.includes("rev-parse")) {
				cb(null, { stdout: "main\n", stderr: "" });
			} else if (args.includes("status")) {
				cb(null, { stdout: "", stderr: "" });
			}
		});

		const result = await getGitStatus("/some/project");
		expect(result).toEqual({ isGit: true, branch: "main", dirty: false });
	});

	it("returns branch name and dirty: true when porcelain output is non-empty", async () => {
		mockExecFile.mockImplementation((cmd, args, opts, cb) => {
			if (args.includes("rev-parse")) {
				cb(null, { stdout: "feature/my-branch\n", stderr: "" });
			} else if (args.includes("status")) {
				cb(null, { stdout: " M src/index.js\n", stderr: "" });
			}
		});

		const result = await getGitStatus("/some/project");
		expect(result).toEqual({ isGit: true, branch: "feature/my-branch", dirty: true });
	});

	it("returns { isGit: false } when git commands fail (non-git directory)", async () => {
		mockExecFile.mockImplementation((cmd, args, opts, cb) => {
			cb(new Error("not a git repository"));
		});

		const result = await getGitStatus("/not/a/git/repo");
		expect(result).toEqual({ isGit: false });
	});

	it("trims branch name whitespace", async () => {
		mockExecFile.mockImplementation((cmd, args, opts, cb) => {
			if (args.includes("rev-parse")) {
				cb(null, { stdout: "  main  \n", stderr: "" });
			} else if (args.includes("status")) {
				cb(null, { stdout: "", stderr: "" });
			}
		});

		const result = await getGitStatus("/some/project");
		expect(result.isGit).toBe(true);
		expect(result.branch).toBe("main");
	});
});
