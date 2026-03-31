import { describe, expect, it } from "vitest";
import {
	CLAUDIA_MARKER,
	hasClaudiaHooks,
	mergeHooks,
	removeHooks,
} from "./hooks.js";

describe("hasClaudiaHooks", () => {
	it("returns false for empty settings", () => {
		expect(hasClaudiaHooks({})).toBe(false);
	});

	it("returns false when no Claudia hooks present", () => {
		const settings = {
			hooks: {
				PreToolUse: [
					{ matcher: "", hooks: [{ type: "command", command: "echo hello" }] },
				],
			},
		};
		expect(hasClaudiaHooks(settings)).toBe(false);
	});

	it("returns true when Claudia hooks are present (nested format)", () => {
		const settings = {
			hooks: {
				PreToolUse: [
					{
						matcher: "",
						hooks: [
							{
								type: "command",
								command: `node -e "http://${CLAUDIA_MARKER}"`,
							},
						],
					},
				],
			},
		};
		expect(hasClaudiaHooks(settings)).toBe(true);
	});

	it("returns true when old bare-format Claudia hooks are present", () => {
		const settings = {
			hooks: {
				PreToolUse: [{ command: `curl -s http://${CLAUDIA_MARKER}` }],
			},
		};
		expect(hasClaudiaHooks(settings)).toBe(true);
	});
});

describe("mergeHooks", () => {
	it("adds hooks to empty settings", () => {
		const result = mergeHooks({});
		expect(result.hooks.PreToolUse).toHaveLength(1);
		expect(result.hooks.PostToolUse).toHaveLength(1);
		expect(result.hooks.Stop).toHaveLength(1);
		expect(result.hooks.SubagentStop).toHaveLength(1);
		expect(result.hooks.PreCompact).toHaveLength(1);
		const hook = result.hooks.PreToolUse[0];
		expect(hook.matcher).toBe(".*");
		expect(hook.hooks).toHaveLength(1);
		expect(hook.hooks[0].type).toBe("command");
		expect(hook.hooks[0].command).toContain(CLAUDIA_MARKER);
	});

	it("includes SubagentStop and PreCompact hooks", () => {
		const result = mergeHooks({});
		const subagentHook = result.hooks.SubagentStop[0];
		expect(subagentHook.matcher).toBe(".*");
		expect(subagentHook.hooks[0].command).toContain("/hook/SubagentStop");
		const precompactHook = result.hooks.PreCompact[0];
		expect(precompactHook.matcher).toBe(".*");
		expect(precompactHook.hooks[0].command).toContain("/hook/PreCompact");
	});

	it("generates curl-based hook commands", () => {
		const result = mergeHooks({});
		const cmd = result.hooks.PreToolUse[0].hooks[0].command;
		expect(cmd).toContain("curl");
		expect(cmd).toContain("/hook/PreToolUse");
		expect(cmd).toContain("-d @-");
	});

	it("preserves existing user hooks", () => {
		const settings = {
			hooks: {
				PreToolUse: [
					{
						matcher: "",
						hooks: [{ type: "command", command: "echo user-hook" }],
					},
				],
			},
		};
		const result = mergeHooks(settings);
		expect(result.hooks.PreToolUse).toHaveLength(2);
		expect(result.hooks.PreToolUse[0].hooks[0].command).toBe("echo user-hook");
		expect(result.hooks.PreToolUse[1].hooks[0].command).toContain(
			CLAUDIA_MARKER,
		);
	});

	it("replaces existing Claudia hooks (idempotent)", () => {
		const settings = {
			hooks: {
				PreToolUse: [
					{
						matcher: "",
						hooks: [{ type: "command", command: "echo user-hook" }],
					},
					{
						matcher: "",
						hooks: [
							{
								type: "command",
								command: `node -e "http://${CLAUDIA_MARKER} old"`,
							},
						],
					},
				],
			},
		};
		const result = mergeHooks(settings);
		expect(result.hooks.PreToolUse).toHaveLength(2);
		expect(result.hooks.PreToolUse[0].hooks[0].command).toBe("echo user-hook");
		expect(result.hooks.PreToolUse[1].hooks[0].command).toContain(
			CLAUDIA_MARKER,
		);
	});

	it("replaces old bare-format Claudia hooks", () => {
		const settings = {
			hooks: {
				PreToolUse: [{ command: `curl -s http://${CLAUDIA_MARKER} -d old` }],
			},
		};
		const result = mergeHooks(settings);
		expect(result.hooks.PreToolUse).toHaveLength(1);
		expect(result.hooks.PreToolUse[0].matcher).toBe(".*");
		expect(result.hooks.PreToolUse[0].hooks[0].command).toContain(
			CLAUDIA_MARKER,
		);
	});

	it("does not mutate the original settings", () => {
		const settings = {
			hooks: {
				PreToolUse: [
					{ matcher: "", hooks: [{ type: "command", command: "echo hi" }] },
				],
			},
		};
		const original = JSON.parse(JSON.stringify(settings));
		mergeHooks(settings);
		expect(settings).toEqual(original);
	});

	it("preserves non-hook settings", () => {
		const settings = { theme: "dark", permissions: { allow: ["Read"] } };
		const result = mergeHooks(settings);
		expect(result.theme).toBe("dark");
		expect(result.permissions).toEqual({ allow: ["Read"] });
	});
});

describe("removeHooks", () => {
	it("removes only Claudia hooks (nested format)", () => {
		const settings = {
			hooks: {
				PreToolUse: [
					{
						matcher: "",
						hooks: [{ type: "command", command: "echo user-hook" }],
					},
					{
						matcher: "",
						hooks: [
							{
								type: "command",
								command: `node -e "http://${CLAUDIA_MARKER}"`,
							},
						],
					},
				],
			},
		};
		const result = removeHooks(settings);
		expect(result.hooks.PreToolUse).toHaveLength(1);
		expect(result.hooks.PreToolUse[0].hooks[0].command).toBe("echo user-hook");
	});

	it("removes old bare-format Claudia hooks", () => {
		const settings = {
			hooks: {
				PreToolUse: [
					{ command: "echo user-hook" },
					{ command: `curl -s http://${CLAUDIA_MARKER}` },
				],
			},
		};
		const result = removeHooks(settings);
		expect(result.hooks.PreToolUse).toHaveLength(1);
		expect(result.hooks.PreToolUse[0].command).toBe("echo user-hook");
	});

	it("removes empty hook arrays and hooks object", () => {
		const settings = {
			hooks: {
				PreToolUse: [
					{
						matcher: "",
						hooks: [
							{
								type: "command",
								command: `node -e "http://${CLAUDIA_MARKER}"`,
							},
						],
					},
				],
			},
		};
		const result = removeHooks(settings);
		expect(result.hooks).toBeUndefined();
	});

	it("is a no-op when no Claudia hooks exist", () => {
		const settings = {
			hooks: {
				PreToolUse: [
					{
						matcher: "",
						hooks: [{ type: "command", command: "echo user-hook" }],
					},
				],
			},
		};
		const result = removeHooks(settings);
		expect(result.hooks.PreToolUse).toHaveLength(1);
	});

	it("does not mutate the original settings", () => {
		const settings = {
			hooks: {
				PreToolUse: [
					{
						matcher: "",
						hooks: [
							{
								type: "command",
								command: `node -e "http://${CLAUDIA_MARKER}"`,
							},
						],
					},
				],
			},
		};
		const original = JSON.parse(JSON.stringify(settings));
		removeHooks(settings);
		expect(settings).toEqual(original);
	});

	it("preserves non-hook settings", () => {
		const settings = {
			theme: "dark",
			hooks: {
				PreToolUse: [
					{
						matcher: "",
						hooks: [
							{
								type: "command",
								command: `node -e "http://${CLAUDIA_MARKER}"`,
							},
						],
					},
				],
			},
		};
		const result = removeHooks(settings);
		expect(result.theme).toBe("dark");
	});
});
