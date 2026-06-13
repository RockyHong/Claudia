#!/bin/bash
# PreToolUse hook (matcher: Agent) — model-designation guard.
# Hard-blocks subagent dispatch without an explicit model param. Inheriting
# the session model silently routes simple lookups to the dispatcher's model — token
# and latency waste. Designating is the dispatch-moment decision.
#
# Stdin schema (PreToolUse):
#   { ..., "tool_name": "Agent",
#     "tool_input": { "description": "...", "prompt": "...",
#                     "subagent_type": "...", "model": "..." } }
#
# Lore: .claude/guidelines/work-discipline/model-tiering.md

set +e
command -v jq >/dev/null 2>&1 || exit 0

PAYLOAD="$(cat)"

MODEL="$(jq -r '.tool_input.model // empty' <<< "$PAYLOAD")"
[ -n "$MODEL" ] && exit 0

REASON="Model-designation guard: Agent dispatch without a model param. Designate a tier — small retrieves, mid judges, top thinks: haiku for mechanical lookup / retrieval / extraction; sonnet for bounded judgment (search-and-conclude, review, synthesis); top tier only for main-loop-grade reasoning — this guard requires an explicit choice, so pass the session's model tier rather than leaving it unset. If the agent type's frontmatter pins a model, restate that tier explicitly. Re-send with model set. Ref: .claude/guidelines/work-discipline/model-tiering.md"

jq -n --arg r "$REASON" \
    '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: $r}}'
exit 0
