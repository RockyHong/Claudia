import { describe, expect, it } from "vitest";
import { generateTerminalTitle } from "./terminal-title.js";

describe("generateTerminalTitle", () => {
	it("includes project name and claudia with number", () => {
		const title = generateTerminalTitle("/home/user/myproject");
		expect(title).toBe("myproject claudia 1");
	});

	it("extracts last segment from Windows paths", () => {
		const title = generateTerminalTitle("C:\\Users\\user\\winproject");
		expect(title).toMatch(/^winproject claudia \d+$/);
	});

	it("increments counter on each call", () => {
		const t1 = generateTerminalTitle("/home/user/proj");
		const t2 = generateTerminalTitle("/home/user/proj");
		expect(t1).not.toBe(t2);
		// Both should have "proj claudia N" format with different N
		expect(t1).toMatch(/^proj claudia \d+$/);
		expect(t2).toMatch(/^proj claudia \d+$/);
	});

	it("sanitizes special characters from project name", () => {
		const title = generateTerminalTitle("/home/user/my<project>!@#");
		expect(title).toMatch(/^myproject claudia \d+$/);
	});

	it("falls back to 'session' for empty cwd", () => {
		const title = generateTerminalTitle("");
		expect(title).toMatch(/^session claudia \d+$/);
	});

	it("preserves safe characters: dash, underscore, dot, space", () => {
		const title = generateTerminalTitle("/home/user/my-project_1.0 test");
		expect(title).toMatch(/^my-project_1\.0 test claudia \d+$/);
	});
});
