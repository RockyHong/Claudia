import { describe, expect, it } from "vitest";
import { transformHookPayload, VALID_HOOK_TYPES } from "./hook-transform.js";

const BASE_INPUT = {
	session_id: "sess-123",
	tool_name: "Edit",
	cwd: "/home/user/project",
	notification: "Approve this action?",
};

describe("transformHookPayload", () => {
	it("maps SessionStart to idle", () => {
		const result = transformHookPayload("SessionStart", BASE_INPUT);
		expect(result.session).toBe("sess-123");
		expect(result.state).toBe("idle");
		expect(result.cwd).toBe("/home/user/project");
		expect(typeof result.ts).toBe("number");
	});

	it("maps PreToolUse to busy with tool", () => {
		const result = transformHookPayload("PreToolUse", BASE_INPUT);
		expect(result.state).toBe("busy");
		expect(result.tool).toBe("Edit");
	});

	it("maps PostToolUse to busy with tool", () => {
		const result = transformHookPayload("PostToolUse", BASE_INPUT);
		expect(result.state).toBe("busy");
		expect(result.tool).toBe("Edit");
	});

	it("maps PermissionRequest to pending with permissionRequest data", () => {
		const input = {
			session_id: "sess-123",
			tool_name: "Bash",
			tool_input: { command: "npm run test -- --coverage" },
			cwd: "/home/user/project",
		};
		const result = transformHookPayload("PermissionRequest", input);
		expect(result.state).toBe("pending");
		expect(result.tool).toBe("Bash");
		expect(result.permissionRequest).toEqual({
			toolName: "Bash",
			toolInput: '{"command":"npm run test -- --coverage"}',
		});
	});

	it("truncates long toolInput in permissionRequest to 500 chars", () => {
		const input = {
			session_id: "sess-123",
			tool_name: "Edit",
			tool_input: { content: "x".repeat(1000) },
			cwd: "/home/user/project",
		};
		const result = transformHookPayload("PermissionRequest", input);
		expect(result.permissionRequest.toolInput.length).toBeLessThanOrEqual(500);
	});

	it("handles missing tool_input in PermissionRequest", () => {
		const input = {
			session_id: "sess-123",
			tool_name: "Bash",
			cwd: "/home/user/project",
		};
		const result = transformHookPayload("PermissionRequest", input);
		expect(result.permissionRequest).toEqual({
			toolName: "Bash",
			toolInput: null,
		});
	});

	it("maps Stop to idle", () => {
		const result = transformHookPayload("Stop", BASE_INPUT);
		expect(result.state).toBe("idle");
	});

	it("maps SessionEnd to stopped", () => {
		const result = transformHookPayload("SessionEnd", BASE_INPUT);
		expect(result.state).toBe("stopped");
	});

	it("maps SubagentStop to busy", () => {
		const result = transformHookPayload("SubagentStop", BASE_INPUT);
		expect(result.state).toBe("busy");
	});

	it("maps PreCompact to busy", () => {
		const result = transformHookPayload("PreCompact", BASE_INPUT);
		expect(result.state).toBe("busy");
	});

	it("includes hookType in every transform result", () => {
		for (const hookType of [
			"SessionStart",
			"UserPromptSubmit",
			"PreToolUse",
			"PostToolUse",
			"PermissionRequest",
			"Stop",
			"SessionEnd",
			"SubagentStop",
			"PreCompact",
		]) {
			const result = transformHookPayload(hookType, BASE_INPUT);
			expect(result.hookType).toBe(hookType);
		}
	});

	it("returns null for unknown hook type", () => {
		expect(transformHookPayload("Unknown", BASE_INPUT)).toBeNull();
	});

	it("returns null for null payload", () => {
		expect(transformHookPayload("PreToolUse", null)).toBeNull();
	});

	it("returns null for missing session_id", () => {
		expect(transformHookPayload("PreToolUse", { cwd: "/tmp" })).toBeNull();
	});

	it("returns null for non-string session_id", () => {
		expect(transformHookPayload("PreToolUse", { session_id: 123 })).toBeNull();
	});
});

describe("VALID_HOOK_TYPES", () => {
	it("contains all 9 hook types", () => {
		expect(VALID_HOOK_TYPES.size).toBe(9);
		for (const type of [
			"SessionStart",
			"UserPromptSubmit",
			"PreToolUse",
			"PostToolUse",
			"PermissionRequest",
			"Stop",
			"SessionEnd",
			"SubagentStop",
			"PreCompact",
		]) {
			expect(VALID_HOOK_TYPES.has(type)).toBe(true);
		}
	});
});
