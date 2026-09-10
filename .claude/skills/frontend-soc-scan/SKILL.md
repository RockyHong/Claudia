---
name: frontend-soc-scan
description: 'Scan frontend code for domain logic that violates Frontend=Intent, Backend=Logic. Dispatches the frontend-soc-scan agent; outputs structured violation report persisted to .review/. User invokes periodically.'
disable-model-invocation: true
tags: [audit, scan, frontend, architecture, report]
agents: [frontend-soc-scan]
---

# Frontend SoC Scan

Scan frontend codepaths for domain-logic leaks. Outputs a structured findings report. Read-only — remediation routes through the user's normal pipeline.

**The principle: Frontend = Intent, Backend = Logic.** If a decision affects product behavior, it belongs server-side; the client receives computed state and renders it. The full principle + scan protocol live in the `frontend-soc-scan` agent — this skill is the dispatch surface.

## When to Use

User invokes `/frontend-soc-scan` periodically:

- Before a milestone or release candidate
- After a batch of feature merges
- When a review rejection revealed SoC drift (scan for similar elsewhere)
- When onboarding a new contributor (baseline audit)

## Execution

1. Dispatch the `frontend-soc-scan` subagent (Agent tool, `subagent_type: "frontend-soc-scan"`).
2. Forward any user-supplied context (e.g., a subdirectory to focus on) as the prompt body.
3. The agent runs pre-flight (blocks if a prior unprocessed report exists), pattern build, grep pass, contextual triage, prioritization, tracker annotations, and persists the report to `.review/frontend-soc-{date}.md`.
4. The agent returns the rendered report + persisted path. Relay verbatim to the user — no editorial.
5. Triage of the report (fix / dismiss / track) is the user's separate pass, not part of this skill.

**Workflow fan-out (opt-in):** the single agent handles a focused scope inline (rung 1). Fan out per the contract in `.claude/skills/frontend-soc-scan/workflow-fanout.md` — its § Sizing pre-flight + § The escalation ladder own the rung choice (attention-fit across subdirs informed by cheap proxies, not surface size alone); the § Fan-out contract covers script authored in the invoking context, hard report-schema output, and tier pins. This skill's specifics: collectors `haiku` (pure grep, no judgment), triage agents `sonnet` with full tool access; the agent's Output Format is the binding report schema.

## Scope

- Flags placement, not correctness — product decisions stay the user's.
- Frontend source only; backend and test files are out of scan scope.
- Findings flow to the user's triage; remediation dispatches happen there.
