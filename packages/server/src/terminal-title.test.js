import { describe, expect, it } from "vitest";
import { generateTerminalTitle } from "./terminal-title.js";

describe("generateTerminalTitle", () => {
	it("generates title from cwd — first spawn has no suffix", () => {
		const title = generateTerminalTitle("/home/user/myproject");
		expect(title).toBe("myproject");
	});

	it("extracts last path segment from Windows-style paths", () => {
		const title = generateTerminalTitle("C:\\Users\\user\\winproject");
		expect(title).toMatch(/^winproject( \d+)?$/);
	});

	it("generates unique titles for same cwd with number suffix", () => {
		const t1 = generateTerminalTitle("/home/user/proj");
		const t2 = generateTerminalTitle("/home/user/proj");
		expect(t1).not.toBe(t2);
		expect(t2).toMatch(/^proj \d+$/);
	});

	it("falls back to 'session' for empty cwd", () => {
		const title = generateTerminalTitle("");
		expect(title).toMatch(/^session( \d+)?$/);
	});
});
