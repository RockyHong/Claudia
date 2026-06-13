#!/bin/bash
# PostToolUse hook (matcher: Workflow) — model-tiering self-heal.
# Fires right after a Workflow launch returns (task id + persisted script path).
# Reads the resolved script, counts agent() calls vs model: designations, and on
# shortfall surfaces a TaskStop/retier/resume recipe via additionalContext.
# PostToolUse cannot block or auto-interrupt — this is an early-interrupt prompt
# to the main loop while the fan-out is still spawning.
#
# Stdin schema (PostToolUse), tool_response verified against a real payload (CC 2.1.169):
#   { ..., "tool_name": "Workflow", "tool_input": {...},
#     "tool_response": { "status": "async_launched", "runId": "wf_...",
#                        "scriptPath": "<persisted script>", "taskId", "transcriptDir", ... } }
#   Launch is async — PostToolUse fires right after spawn (duration_ms ~2), while the
#   fan-out is still running, so the persisted script is on disk to inspect.
#
# Lore: .claude/guidelines/work-discipline/model-tiering.md
#       .claude/guidelines/claude-shape/workflow-tool-response.md (tool_response shape)
#       .claude/guidelines/claude-shape/hook-feedback-channels.md (additionalContext)

set +e
command -v jq >/dev/null 2>&1 || exit 0
PAYLOAD="$(cat)"

# Persisted-script path — exact field, verified against a real PostToolUse(Workflow)
# payload: tool_response.scriptPath. Git Bash cats the Windows backslash path
# directly; Linux paths are native forward-slash. Absent / unreadable -> silent pass.
SCRIPT_PATH="$(jq -r '.tool_response.scriptPath // empty' <<< "$PAYLOAD")"
[ -n "$SCRIPT_PATH" ] && [ -f "$SCRIPT_PATH" ] || exit 0
SCRIPT="$(cat "$SCRIPT_PATH")"

# Same crude count as workflow-model-pretool.sh — KEEP CONSISTENT with it.
AGENT_CALLS="$(printf '%s' "$SCRIPT" | grep -oE '(^|[^A-Za-z0-9_])agent\(' | wc -l | tr -d '[:space:]')"
MODEL_MARKS="$(printf '%s' "$SCRIPT" | grep -oE 'model[[:space:]]*:' | wc -l | tr -d '[:space:]')"
AGENT_CALLS="${AGENT_CALLS:-0}"; MODEL_MARKS="${MODEL_MARKS:-0}"   # guard empty-string arithmetic
[ "$AGENT_CALLS" -le "$MODEL_MARKS" ] 2>/dev/null && exit 0

# Run-id + workflow name for the TaskStop/resume recipe — verified tool_response fields.
RUN_ID="$(jq -r '.tool_response.runId // empty' <<< "$PAYLOAD")"
WF_NAME="$(jq -r '.tool_response.workflowName // empty' <<< "$PAYLOAD")"
CTX="Model-tiering self-heal: the launched workflow has ${AGENT_CALLS} agent() call(s) but only ${MODEL_MARKS} model designation(s) — untiered calls inherit the main-loop model across the fan-out. The launch already returned; agents are spawning now. To retier before the bulk spawns: (1) TaskStop the run${RUN_ID:+ ($RUN_ID)}; (2) edit the persisted script ${SCRIPT_PATH} — add model: to each untiered agent() (small='haiku' retrieve, mid='sonnet' judge; inherit only for main-loop-grade reasoning, annotated // model: inherit — <why>); (3) resume with resumeFromRunId; (4) save the tiered script to .claude/workflows/${WF_NAME:-<name>}.js so future launches go via scriptPath and audit pre-flight. Ref: .claude/guidelines/work-discipline/model-tiering.md"

jq -n --arg c "$CTX" \
  '{hookSpecificOutput: {hookEventName: "PostToolUse", additionalContext: $c}}'
exit 0
