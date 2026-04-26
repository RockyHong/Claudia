// Derive subagent activity from Claude Code's transcript JSONL.
//
// Each Agent (subagent) invocation is recorded in the parent session's
// transcript as an assistant message containing a tool_use block with
// name="Agent" and a unique tool_use_id. Completion is the matching
// user message containing a tool_result block with the same tool_use_id.
//
// Pending subagents = count of Agent tool_use ids without a matching tool_result.
// This is authoritative — Claude Code writes the transcript regardless of
// whether hook delivery succeeded, so it survives server downtime, dropped
// curl POSTs, and out-of-order hook arrivals.

import fs from "node:fs";

export function countPendingAgentInvocations(transcriptPath) {
	if (!transcriptPath) return 0;

	let raw;
	try {
		raw = fs.readFileSync(transcriptPath, "utf8");
	} catch {
		return 0;
	}

	const pending = new Set();
	for (const line of raw.split("\n")) {
		if (!line) continue;
		let obj;
		try {
			obj = JSON.parse(line);
		} catch {
			continue;
		}
		const content = obj?.message?.content;
		if (!Array.isArray(content)) continue;
		for (const block of content) {
			if (block.type === "tool_use" && block.name === "Agent" && block.id) {
				pending.add(block.id);
			} else if (block.type === "tool_result" && block.tool_use_id) {
				pending.delete(block.tool_use_id);
			}
		}
	}
	return pending.size;
}
