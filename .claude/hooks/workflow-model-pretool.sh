#!/bin/bash
# PreToolUse hook (matcher: Workflow) — model-tiering guard.
# Hard-blocks Workflow launches whose script contains agent() calls without
# model designations. Each agent() call must carry `model:` in opts, or a
# deliberate-inherit annotation (`// model: inherit — <why>`); both count as
# a model mark (crude textual count, not a parse).
#
# Stdin schema (PreToolUse):
#   { ..., "tool_name": "Workflow",
#     "tool_input": { "script": "...", "scriptPath": "...", "name": "...",
#                     "resumeFromRunId": "..." } }
#
# Pass-through cases:
#   - resumeFromRunId present — model is part of the resume cache key;
#     forcing retiers on a resume busts journaled results (lore: resume
#     corollary).
#
# Name-only launch (script resolves at launch, nothing to inspect pre-flight):
#   - local copy exists at .claude/workflows/<name>.js (project, then
#     personal) — deny + redirect to scriptPath: the inspectable branch
#     audits tiers pre-flight; resolution precedence (project > personal >
#     built-in) never substitutes for inspection (verified CC 2.1.175).
#   - no local copy — defer + stop-first nudge: TaskStop on launch return,
#     pin tiers, resume, save tiered copy to .claude/workflows/.
#
# Lore: .claude/guidelines/work-discipline/model-tiering.md

set +e
command -v jq >/dev/null 2>&1 || exit 0

PAYLOAD="$(cat)"

RESUME="$(jq -r '.tool_input.resumeFromRunId // empty' <<< "$PAYLOAD")"
[ -n "$RESUME" ] && exit 0

SCRIPT="$(jq -r '.tool_input.script // empty' <<< "$PAYLOAD")"
if [ -z "$SCRIPT" ]; then
    SCRIPT_PATH="$(jq -r '.tool_input.scriptPath // empty' <<< "$PAYLOAD")"
    [ -n "$SCRIPT_PATH" ] && [ -f "$SCRIPT_PATH" ] && SCRIPT="$(cat "$SCRIPT_PATH")"
fi
if [ -z "$SCRIPT" ]; then
    NAME="$(jq -r '.tool_input.name // empty' <<< "$PAYLOAD")"
    if [ -n "$NAME" ]; then
        for LOCAL_WF in "${CLAUDE_PROJECT_DIR:-.}/.claude/workflows/${NAME}.js" "$HOME/.claude/workflows/${NAME}.js"; do
            if [ -f "$LOCAL_WF" ]; then
                REASON="Model-tiering guard: workflow '${NAME}' has a local copy at ${LOCAL_WF}. Re-send the launch as scriptPath: \"${LOCAL_WF}\" — the scriptPath branch audits tiers pre-flight; a name launch resolves at runtime and cannot be inspected. Ref: .claude/guidelines/work-discipline/model-tiering.md"
                jq -n --arg r "$REASON" \
                    '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: $r}}'
                exit 0
            fi
        done
        NUDGE="Model-tiering guard: named workflow '${NAME}' resolves its script at launch — agent() calls without model: pins inherit the main-loop model across the whole fan-out. The moment the launch returns: (1) TaskStop FIRST (stopping costs seconds; the fan-out burns at top tier while you read); (2) read the persisted script (path in the tool result) and pin tiers on the phases still ahead; (3) resume with resumeFromRunId; (4) save the tiered script to .claude/workflows/${NAME}.js so future launches go via scriptPath and audit pre-flight. Ref: .claude/guidelines/work-discipline/model-tiering.md"
        jq -n --arg c "$NUDGE" \
            '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "defer", additionalContext: $c}}'
    fi
    exit 0
fi

# agent( preceded by non-identifier char — excludes subagent(, myagent(.
AGENT_CALLS="$(printf '%s' "$SCRIPT" | grep -oE '(^|[^A-Za-z0-9_])agent\(' | wc -l | tr -d '[:space:]')"
MODEL_MARKS="$(printf '%s' "$SCRIPT" | grep -oE 'model[[:space:]]*:' | wc -l | tr -d '[:space:]')"

[ "$AGENT_CALLS" -le "$MODEL_MARKS" ] 2>/dev/null && exit 0

REASON="Model-tiering guard: ${AGENT_CALLS} agent() call(s) but only ${MODEL_MARKS} model designation(s). Every agent() call needs a tier — small retrieves, mid judges, top thinks: model: 'haiku' for mechanical retrieval / extraction / schema-shaped output; model: 'sonnet' for bounded judgment (verify, score, synthesize, review); inherit (omit) only for main-loop-grade reasoning, annotated // model: inherit — <why> (the annotation satisfies this guard). Re-send the Workflow call with every agent() tiered. Ref: .claude/guidelines/work-discipline/model-tiering.md"

jq -n --arg r "$REASON" \
    '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: $r}}'
exit 0
