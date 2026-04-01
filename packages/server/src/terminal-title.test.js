import { describe, expect, it } from "vitest";
import { generateTerminalTitle } from "./terminal-title.js";

describe("generateTerminalTitle", () => {
	it("first spawn returns 'Claudia' with no suffix", () => {
		const title = generateTerminalTitle("/home/user/myproject");
		expect(title).toBe("Claudia");
	});

	it("ignores the cwd — always returns Claudia-based name", () => {
		const title = generateTerminalTitle("C:\\Users\\user\\winproject");
		expect(title).toMatch(/^Claudia( \d+)?$/);
	});

	it("subsequent spawns get incrementing suffix", () => {
		const t1 = generateTerminalTitle("/home/user/proj");
		const t2 = generateTerminalTitle("/home/user/proj");
		expect(t1).not.toBe(t2);
		expect(t2).toMatch(/^Claudia \d+$/);
	});

	it("works with empty cwd", () => {
		const title = generateTerminalTitle("");
		expect(title).toMatch(/^Claudia( \d+)?$/);
	});
});
