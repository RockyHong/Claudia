import { describe, expect, it } from "vitest";
import { generateTerminalTitle } from "./terminal-title.js";

describe("generateTerminalTitle", () => {
	it("returns projectName + space + 4-char hex", () => {
		const title = generateTerminalTitle("/home/user/myproject");
		expect(title).toMatch(/^myproject [0-9a-f]{4}$/);
	});

	it("extracts last segment from Windows paths", () => {
		const title = generateTerminalTitle("C:\\Users\\user\\Claudia");
		expect(title).toMatch(/^Claudia [0-9a-f]{4}$/);
	});

	it("generates unique titles on each call", () => {
		const titles = new Set();
		for (let i = 0; i < 20; i++) {
			titles.add(generateTerminalTitle("/home/user/proj"));
		}
		expect(titles.size).toBe(20);
	});

	it("falls back to 'session' for empty cwd", () => {
		const title = generateTerminalTitle("");
		expect(title).toMatch(/^session [0-9a-f]{4}$/);
	});
});
