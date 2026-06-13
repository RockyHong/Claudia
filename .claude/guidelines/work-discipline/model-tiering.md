# Model Tiering

In a multi-agent fan-out, an `agent()` call without a `model` override inherits the
main-loop model — typically the most expensive tier. The cost of leaving a call
unspecified scales with fan-out width: one mis-tiered agent is a rounding error;
the same omission across a 100-agent sweep multiplies it by the fleet and can kill
the run on usage limits mid-flight.

Token cost is downstream of attention cost — match each container's model tier
to the attention its step actually needs.

## Pre-launch audit

Before any dispatch — a multi-agent workflow's `agent()` calls or a single
subagent — assign each call a tier by work shape. The audit always fires.
Inheritance stays legitimate for steps that genuinely need main-loop-grade
reasoning — name the reason per inherited call.

| Tier | Work shape | Examples |
|---|---|---|
| Small (`haiku`) | Mechanical retrieval + schema-shaped extraction — search, fetch, format conversion, rule-driven structured output | search-result ranking, fetch + claim extraction, file scanning |
| Mid (`sonnet`) | Bounded judgment — adversarial verification, scoring, synthesis, organization | refute-vote panels, report synthesis, single-dimension review |
| Top (`opus`) | Steps needing main-loop-grade reasoning | open-ended design decisions, cross-domain trade-off calls |

Small retrieves, mid judges, top thinks. Inherit is the dispatcher's model, not a
tier — designate when the tier must hold regardless of what the main loop runs.

## Centrality amplifier

The table tiers by the step's own reasoning shape. A second axis multiplies it:
how many downstream stages consume the step's verdict. A direction-setting step —
diagnosis, scope/spec authoring, planning, a pre-merge review gate — can look
bounded in its own shape while every later stage inherits its verdict; a
misjudgment there poisons the chain, and the rework cost dwarfs the tier saving
at dispatch.

Direction-setting steps tier to top; the step's own bounded shape does not pull
the verdict lower. The selection target is verdict quality; token economy governs
fan-out width, never the step the fan-out depends on.

When escalation criteria can't be evaluated deterministically at dispatch, assign
the direction-setting phase a flat top tier.

## Width axis

Tier pins govern unit price; fan-out width constants govern volume. A fully
tiered run still dies on usage limits when width multiplies — verification
votes × claim count, fetch caps, finder rounds compound into the token bill.
The dispatch audit carries two lines: every agent() call carries a tier, and
every fan-out width constant is sized against the budget the run actually
has. Size width at dispatch — a width constant discovered at the usage limit
has already spent the budget.

## Named-launch corollary

A workflow launched by name resolves its script at launch — there is nothing
to inspect pre-flight, and the fan-out starts at the dispatcher's tier the
moment the launch returns. Post-launch audit pays latency × fan-out width at
top-tier price, so route around the name branch when possible and stop first
when not:

- **Local tiered copy exists** (`.claude/workflows/<name>.js`) — launch via
  `scriptPath` pointing at it. The scriptPath branch audits pre-flight; the
  name branch never does, even when name resolution would pick the local
  copy.
- **No local copy yet** (first use of a built-in) — TaskStop FIRST when the
  launch returns, then read the persisted script, pin tiers on the phases
  still ahead (resume corollary below), and resume with the run id. Stopping
  first costs seconds; reading first leaves the fan-out burning at top tier
  for the whole audit.
- **After tiering** — save the tiered script to `.claude/workflows/<name>.js`;
  the next launch takes the scriptPath route.

## Resume corollary

In the current workflow runtime, `model` is part of an agent call's resume cache
key — changing it invalidates that call's journaled result. When adding overrides
to a partially-completed run, leave completed calls untouched and tier only
the phases still ahead.

## Boundary

Applies to: any subagent dispatch surface with per-call model selection
(workflow scripts, single-agent dispatch, batch pipelines). Designate a tier on
every dispatch — silent inheritance routes mechanical work to the dispatcher's
model, paying both tokens and latency. Single-agent dispatch carries no fleet
multiplier, but the tier decision is the same: designate, and name the reason when
the call inherits or runs at top. Consumer skills that need the tier shapes cite
this file by path — the table lives here only.
