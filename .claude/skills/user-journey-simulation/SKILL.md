---
name: user-journey-simulation
description: "Simulates a user's journey through a product flow from pure user perspective. Detects friction, cognitive overload, dead ends, and unmet expectations. Project-agnostic — caller provides ICP, pre-product path, user intent, and UI flow."
---

# User Journey Simulation

Pure-technique skill for projecting a user's experience through a product flow. Detects friction from the user's perspective — no product goals, no design rationale, no bias.

## Input Contract

The caller MUST provide all five inputs. If any are missing or vague, return questions instead of simulating.

| #   | Input                | Description                                                                                                                   |
| --- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 1   | **ICP / Persona**    | Who the user is — demographics, comfort level, tech savviness, expectations, fears                                            |
| 2   | **Pre-product path** | How they arrived — social ad, app store search, friend referral, organic discovery, etc. This shapes intent and expectations. |
| 3   | **User intent**      | "I want to \_\_\_" — what they're trying to accomplish right now                                                              |
| 4   | **Current UI flow**  | Screens/steps that exist — factual description only, no design rationale                                                      |
| 5   | **Platform**         | Mobile, web, or both                                                                                                          |

## Excluded from Input

Do NOT accept these — they create rationalization bias:

- Product goals / vision / mission
- Business metrics targets
- Design rationale ("we built it this way because...")
- Competitor comparisons

The product serves users, not the other way around. Only user perspective matters.

## Process

### 1. Validate Input Completeness

Check all 5 required inputs. If any are missing, vague, or insufficient:

- **STOP.** Do not simulate.
- Return specific questions for each gap.
- False testing has no value.

### 2. Construct User Mental Model

From ICP + pre-product path, derive:

- **Expectations:** what the user assumes the product does (shaped by how they found it)
- **Patience level:** how much friction they'll tolerate before abandoning
- **Mental state:** curious, skeptical, confused, motivated, rushed
- **Prior assumptions:** what conventions they expect (from similar apps they've used)

### 3. Walk the Flow Step by Step

For each step in the UI flow, document:

- **Screen/Step:** what it is
- **User sees:** factual description of what's presented
- **User expects:** what they think should happen next (from mental model)
- **User does:** what action they take
- **What happens:** the actual result
- **Friction:** any pattern detected (with severity), or "None"

### 4. Detect Friction

At each step, check against the friction pattern catalog below.

### 5. Output Structured Findings

Use the output contract format below.

## Friction Pattern Catalog

| Pattern                | Description                                                     |
| ---------------------- | --------------------------------------------------------------- |
| **Cognitive overload** | Too many options, too much text, unclear visual hierarchy       |
| **Unclear affordance** | User can't tell what's tappable, interactive, or actionable     |
| **Dead end**           | No clear next action available — user is stuck                  |
| **Excessive steps**    | Too many taps/clicks to reach the goal                          |
| **Context loss**       | User forgets why they're here after navigation or transition    |
| **Unmet expectations** | What user expected ≠ what they got (shaped by pre-product path) |
| **Error recovery gap** | Something fails and user has no way to recover or retry         |
| **False bottom**       | User thinks they're done but the flow isn't complete            |
| **Invisible state**    | Something changed in the system but user can't see it           |

## Severity Levels

| Level       | Meaning                                                         |
| ----------- | --------------------------------------------------------------- |
| **Blocker** | User cannot complete their intent                               |
| **Major**   | User can complete but with significant confusion or frustration |
| **Minor**   | Suboptimal experience but user figures it out                   |

## Output Contract

Return these sections in order:

### 1. User Mental Model

Summary of the user's expectations, patience, mental state, and prior assumptions — derived from ICP + pre-product path.

### 2. Step-by-Step Journey

For each step in the flow, the structured breakdown from Process step 3.

### 3. Friction Summary

Table of all friction points found, sorted by severity (blocker → major → minor):

| Step | Pattern | Severity | Description |
| ---- | ------- | -------- | ----------- |
| ...  | ...     | ...      | ...         |

### 4. Overall Assessment

One paragraph: can this user complete their intent through this flow? What's the dominant friction pattern? Where does the flow break down most?

### 5. Gaps / Questions

If context was insufficient at any point during the simulation, list what additional information would improve accuracy.

## What This Skill Does NOT Do

- **No recommendations.** This skill observes and reports friction. The caller decides what to do about it.
- **No product judgment.** It does not evaluate whether the product strategy is correct.
- **No design suggestions.** It does not propose UI alternatives — use `ui-ux-pro-max` for design implementation.
