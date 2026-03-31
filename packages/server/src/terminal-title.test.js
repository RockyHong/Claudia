import { describe, expect, it } from "vitest";
import { generateTerminalTitle } from "./terminal-title.js";

describe("generateTerminalTitle", () => {
	it("generates title from cwd", () => {
		const title = generateTerminalTitle("/home/user/myproject");
		expect(title).toMatch(/^myproject-[0-9a-z]{2,}$/);
	});

	it("extracts last path segment from Windows-style paths", () => {
		const title = generateTerminalTitle("C:\\Users\\user\\winproject");
		expect(title).toContain("winproject");
	});

	it("generates unique titles for same cwd", () => {
		const t1 = generateTerminalTitle("/home/user/proj");
		const t2 = generateTerminalTitle("/home/user/proj");
		expect(t1).not.toBe(t2);
	});

	it("falls back to 'session' for empty cwd", () => {
		const title = generateTerminalTitle("");
		expect(title).toContain("session");
	});
});
