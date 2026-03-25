# Documentation Audit Fixes

Checklist of doc issues found in the 2026-03-25 audit. Code is source of truth — docs get updated to match.

---

## README.md

- [x]**States table: remove "Thinking" row.** Code has 3 states (idle, busy, pending). No thinking detection exists. Remove line 69 entirely.

- [x]**States table: rename "Working" to "Busy".** Code uses `"busy"` everywhere. Change line 67 from "Working" to "Busy".

- [x]**States table: fix visual colors.** Current table says idle=gray, working=blue. Actual SessionCard CSS: idle=green, busy=blue (pulsing), pending=orange (pulsing). Update to match code.

- [x]**Feature list line 36: remove "Thinking".** Change `"Idle, Working, Pending (needs you), Thinking"` to `"Idle, Busy, Pending (needs you)"`.

- [x]**Line 58: remove "thinking" from transition list.** Change `"idle/working/pending/thinking transitions"` to `"idle/busy/pending transitions"`.

- [x]**ASCII art (lines 9-11): "Working" to "Busy".** The decorative terminal mockup says "Working" — change to "Busy" for consistency.

---

## CLAUDE.md

- [x]**Event protocol section (lines 118-132): document both endpoints.** The actual protocol is:
  - `POST /hook/:type` — current hooks pipe raw Claude Code stdin JSON; server transforms via `hook-transform.js`
  - `POST /event` — legacy/direct endpoint accepting pre-formatted `{session, state, tool, cwd, message, ts}`
  - Both are live. Hooks use `/hook/:type`. Document both, mark `/hook/:type` as primary.

- [x]**Line 83: update contract reference.** Says `"Claude Code↔Claudia contract is POST /event"` — update to `POST /hook/:type` (primary) with `/event` as legacy fallback.

---

## overview.md

- [x]**Line 331: update endpoint.** Says `"HTTP POST to localhost:7890/event"` — should say `/hook/:type` (primary), with `/event` as legacy.

- [x]**Hook events table (lines 349-357): add missing hook types.** Code handles 8 types but table shows 5. Missing from table:
  - `UserPromptSubmit` → `busy` (user submitted prompt, Claude is working)
  - `PermissionRequest` → `pending` (separate from Notification)
  - `SessionEnd` → `stopped`

- [x]**Hook events table: clarify Notification vs PermissionRequest.** Table says `Notification` has `"matcher: permission_prompt"` — but code treats them as two separate hook types that both map to `pending`. `PermissionRequest` handles tool permission, `Notification` handles notification text. Remove the matcher note.

---

## roadmap.md

- [x]**Line 13: remove "Thinking" from state enum.** Change `"Idle, Working, Pending, Thinking"` to `"Idle, Busy, Pending"`.

- [x]**Lines 16, 20: remove completed Thinking/debounce items or mark as "eliminated by design".** These items were checked off but the features were later removed. Either delete them or add a note: `"[x] ~~Implement Thinking detection~~ — eliminated: no debounce needed (see overview.md)"`.

- [x]**Line 58: "thinking" in color list.** Remove purple/thinking from the color reference.

- [x]**Line 118: avatar state list mentions "thinking".** Change `"idle/working/pending/thinking"` to `"idle/busy/pending"`.

---

## StatusBar.svelte color mismatch (code fix, not doc)

- [x]**StatusBar dot colors are wrong.** StatusBar: idle=blue, busy=gray. Should be: idle=green, busy=blue, pending=orange (matching SessionCard).

---

## Notes

- `.webm` avatar files in `packages/server/assets/avatar/` — **by design**, skip
- SFX file naming (`idle-.mp3`, `pending-.mp3`, missing `busy.mp3`) — **intentional**, skip
- Empty `docs/superpowers/specs/` and `docs/superpowers/plans/` — fine, they're placeholders for future use
