---
name: user-journey-simulation
description: "Simulates a user's journey through a product flow by spawning an isolated subagent AS the ICP. Zero project awareness — the subagent only knows who they are, what they want, and what they see. Detects friction, cognitive overload, dead ends, and unmet expectations."
---

# User Journey Simulation

Two-phase skill: gateway designs the test, subagent IS the user.

The subagent runs in an **isolated context window** with zero project knowledge — it can't rationalize friction because it doesn't know why anything was built. Context isolation is the mechanism that makes the simulation honest.

### Output Location

All subagent reports are written to `docs/user-journeys/` in the **project directory** (not the skills repo). Structure:

```
docs/user-journeys/
  {flow}_{YYYYMMDD-HHmm}/          ← batch folder, created once per trigger moment
    {persona}_{scenario}.md         ← one file per subagent run
```

- **Batch folder** — the gateway creates this once and reuses it for all subagents dispatched from the same trigger. Named by the flow being tested + timestamp (e.g., `onboarding_20260406-1430`).
- **Report file** — kebab-case persona + scenario slug (e.g., `tech-savvy-dev_organic-search.md`).
- **Temporal files** — these are consumable artifacts. The user deletes them when done. Add `docs/user-journeys/` to the project's `.gitignore` to prevent accidental commits.

## Phase 1: Test Design (Gateway)

The gateway gathers inputs and constructs the subagent prompt. This phase runs in the main conversation.

### Input Contract

Gather these inputs from the caller. Format is flexible — paragraphs, bullets, structured blocks all work. What matters is hitting the **minimum bar** for each.

| # | Input | What it needs | Minimum bar | Required? |
|---|-------|--------------|-------------|-----------|
| 1 | **Persona** | Background, domain knowledge, tech comfort, behavioral tendencies, fears/expectations | Role + comfort level + one behavioral trait (e.g., "skeptical of new tools") | Required |
| 2 | **Pre-context** | How they arrived + their mindset/bias entering the product. Ad click = skeptical + hurried. Friend referral = trusting + curious. This shapes the first 10 seconds. | Channel + emotional state | Required |
| 3 | **Intent** | "I want to \_\_\_" — the success criteria the persona judges against | Must be specific and completable within the flow | Required |
| 4 | **The room** | What they can see and do — screens, features, buttons, docs. The boundaries of the test. Ordered steps with what's visible at each. No design rationale. | At least 2 steps with visible elements described | Required |
| 5 | **Platform** | Web, mobile, CLI, desktop | — | Optional (defaults to web) |

**Quality gradient:** "a developer" → garbage simulation. "A 35-year-old backend dev who's used to Stripe's API docs, skeptical of AI tools, found this via a HN comment" → honest simulation. More specificity in persona and pre-context = more useful friction detection.

### Excluded from Input

Do NOT pass these to the subagent — they create rationalization bias:

- Product goals / vision / mission
- Business metrics targets
- Design rationale ("we built it this way because...")
- Competitor comparisons
- Codebase knowledge, file paths, component names
- Any context from the current conversation beyond the inputs above

### Validate Before Dispatch

Check all required inputs. If any are missing or below minimum bar:

- **STOP.** Do not spawn the subagent.
- Return specific questions for each gap, with an example of what good input looks like.
- False testing has no value.

## Phase 2: Dispatch ICP Subagent

Spawn a subagent using the `Agent` tool with the prompt below. Fill in the `{placeholders}` from the gathered inputs.

The subagent has NO tools that read the codebase. It works purely from the UI flow description provided in its prompt.

### Confirmation Checkpoint

Before dispatching, show the user what you're about to send:

```
Dispatching {N} subagent(s):

1. **{persona-slug}** — {one-line persona summary}
   Pre-context: {channel + mindset}
   Intent: {goal}
   Flow: {step count} steps ({first step} → ... → {last step})

{repeat for each subagent}

Output: docs/user-journeys/{batch-folder}/
Go?
```

Wait for confirmation. This prevents token waste on misparsed inputs.

### Batch Folder Setup (Gateway)

Before dispatching the first subagent in a batch:

1. Generate the batch folder path: `docs/user-journeys/{flow}_{YYYYMMDD-HHmm}/` in the **project directory** (use the current working directory, not the skills repo).
2. Create the folder with `mkdir -p`.
3. Reuse the **same batch folder** for all subagents dispatched from the same trigger moment.
4. For each subagent, compute the report filename: `{persona-slug}_{scenario-slug}.md` (kebab-case, no spaces).
5. Pass the full output path to the subagent via `{output_file_path}` in the prompt.

### Subagent Prompt Template

```
You are not an AI assistant. You are a real person about to use a product for the first time.

## Who You Are

{icp_persona}

## How You Got Here

{pre_product_path}

## What You Want

Your goal: {user_intent}

You have no idea how this product works internally. You've never seen documentation, pitch decks, or design specs. You only know what's on your screen right now.

## Your Platform

{platform}

## What You See

Walk through each screen below. For EACH step, report exactly what's in your head:

{ui_flow_steps}

## For Each Step, Report

Use this exact structure:

### Step N: [screen name]

**I see:** Describe what's visually presented to you.
**I expect:** Based on what you know so far, what do you think should happen next or what are you looking for?
**I do:** What action do you take? (tap, scroll, type, wait, give up)
**What happens:** What actually occurs after your action?
**How I feel:** Your honest emotional state (confident, confused, frustrated, delighted, anxious, bored, lost)
**Friction:** If something felt wrong, name the pattern:
  - Cognitive overload (too many options, too much text)
  - Unclear affordance (can't tell what's tappable or interactive)
  - Dead end (stuck, no clear next action)
  - Excessive steps (this is taking too many taps)
  - Context loss (forgot why I'm here)
  - Unmet expectations (this isn't what I expected)
  - Error recovery gap (something broke and I can't fix it)
  - False bottom (thought I was done but I'm not)
  - Invisible state (something changed but I can't see it)
  - None
**Severity:** Blocker (can't continue) / Major (confused but pushing through) / Minor (annoying but fine) / None

## After Walking All Steps

### Friction Summary

Table of all friction points, sorted by severity (blocker first):

| Step | Pattern | Severity | What happened |
| ---- | ------- | -------- | ------------- |

### Did I Accomplish My Goal?

One paragraph: did you get what you came for? Where did you almost give up? What was the single worst moment? Would you come back tomorrow?

### What I Wish I Could Tell The Developers

From your perspective as this person — not as an AI, not as a designer — what would you say to the people who built this? Keep it raw and honest.

## Save Your Report

Write your ENTIRE walkthrough above to this file using the Write tool:

{output_file_path}

This is mandatory. The file is how your walkthrough gets preserved.
```

## Phase 3: Relay Results (Gateway)

When the subagent returns:

1. **Verify the report file exists** — read the output path to confirm the subagent wrote it. If missing, write the subagent's returned text to the file yourself.
2. **Report the file path** to the user so they can access it directly.
3. **Show the Friction Summary table and the "Did I Accomplish My Goal?" section** inline — these are the actionable parts. The full walkthrough lives in the file.

Do not editorialize, soften, or add project context. The raw perspective is the value.

If the user wants recommendations or design fixes, that's a separate conversation — this skill only observes.

## What This Skill Does NOT Do

- **No recommendations.** Observes and reports friction. The caller decides what to do.
- **No product judgment.** Does not evaluate product strategy.
- **No design suggestions.** Does not propose UI alternatives.
- **No codebase access for the subagent.** The ICP doesn't read source code. They see screens.
