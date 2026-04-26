import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { countPendingAgentInvocations } from "./transcript-scan.js";

let tmpFile;

function writeJsonl(records) {
	const content = records.map((r) => JSON.stringify(r)).join("\n");
	fs.writeFileSync(tmpFile, content);
}

function agentToolUse(id) {
	return {
		type: "assistant",
		message: {
			content: [{ type: "tool_use", name: "Agent", id, input: {} }],
		},
	};
}

function toolResult(toolUseId) {
	return {
		type: "user",
		message: {
			content: [{ type: "tool_result", tool_use_id: toolUseId, content: "" }],
		},
	};
}

beforeEach(() => {
	tmpFile = path.join(
		os.tmpdir(),
		`transcript-scan-${Date.now()}-${Math.random()}.jsonl`,
	);
});

afterEach(() => {
	try {
		fs.unlinkSync(tmpFile);
	} catch {}
});

describe("countPendingAgentInvocations", () => {
	it("returns 0 for missing path", () => {
		expect(countPendingAgentInvocations(null)).toBe(0);
		expect(countPendingAgentInvocations(undefined)).toBe(0);
		expect(countPendingAgentInvocations("")).toBe(0);
	});

	it("returns 0 for non-existent file", () => {
		expect(countPendingAgentInvocations("/no/such/file.jsonl")).toBe(0);
	});

	it("returns 0 for empty file", () => {
		fs.writeFileSync(tmpFile, "");
		expect(countPendingAgentInvocations(tmpFile)).toBe(0);
	});

	it("returns 0 when transcript has no Agent invocations", () => {
		writeJsonl([
			{ type: "user", message: { content: "hello" } },
			{
				type: "assistant",
				message: {
					content: [{ type: "tool_use", name: "Read", id: "toolu_1" }],
				},
			},
		]);
		expect(countPendingAgentInvocations(tmpFile)).toBe(0);
	});

	it("counts Agent tool_use without matching tool_result as pending", () => {
		writeJsonl([agentToolUse("toolu_a")]);
		expect(countPendingAgentInvocations(tmpFile)).toBe(1);
	});

	it("returns 0 when every Agent invocation has a tool_result", () => {
		writeJsonl([
			agentToolUse("toolu_a"),
			toolResult("toolu_a"),
			agentToolUse("toolu_b"),
			toolResult("toolu_b"),
		]);
		expect(countPendingAgentInvocations(tmpFile)).toBe(0);
	});

	it("counts only the unmatched ones", () => {
		writeJsonl([
			agentToolUse("toolu_a"),
			toolResult("toolu_a"),
			agentToolUse("toolu_b"),
			agentToolUse("toolu_c"),
		]);
		expect(countPendingAgentInvocations(tmpFile)).toBe(2);
	});

	it("ignores non-Agent tool_use entries", () => {
		writeJsonl([
			{
				type: "assistant",
				message: {
					content: [{ type: "tool_use", name: "Bash", id: "toolu_x" }],
				},
			},
			{
				type: "user",
				message: {
					content: [{ type: "tool_result", tool_use_id: "toolu_x" }],
				},
			},
		]);
		expect(countPendingAgentInvocations(tmpFile)).toBe(0);
	});

	it("ignores tool_result entries that don't match any Agent tool_use", () => {
		writeJsonl([toolResult("toolu_unknown"), agentToolUse("toolu_a")]);
		expect(countPendingAgentInvocations(tmpFile)).toBe(1);
	});

	it("survives malformed JSON lines", () => {
		const lines = [
			JSON.stringify(agentToolUse("toolu_a")),
			"not valid json",
			JSON.stringify(toolResult("toolu_a")),
		];
		fs.writeFileSync(tmpFile, lines.join("\n"));
		expect(countPendingAgentInvocations(tmpFile)).toBe(0);
	});

	it("handles multiple tool_use blocks in one assistant message", () => {
		writeJsonl([
			{
				type: "assistant",
				message: {
					content: [
						{ type: "tool_use", name: "Agent", id: "toolu_a", input: {} },
						{ type: "tool_use", name: "Agent", id: "toolu_b", input: {} },
					],
				},
			},
			toolResult("toolu_a"),
		]);
		expect(countPendingAgentInvocations(tmpFile)).toBe(1);
	});
});
