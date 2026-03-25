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

# Code Fixes

Issues found in the 2026-03-25 audit. Ordered by effort (quick wins first).

## Quick Fixes

- [x] **Dead code: unused `sleep()` in spawner.js:227-229.** Defined but never called. Delete it.

- [x] ~~**SpawnPopover browse race condition**~~ — false positive: `browsing = false` is already outside try/catch on line 67.

- [x]**CSS duplicate `.set-name-input` in SettingsModal.svelte:558-577.** Two rule blocks for the same selector — first is fully overwritten by second. Remove the dead first block.

- [x]**AudioContext.resume() not awaited in sfx.js:48-52.** `resume()` returns a promise but isn't awaited. First SFX can fail silently on Safari/Chrome when context is suspended. Await it or chain playback after resume.

## Security Fixes

- [x]**Command injection in cli.js openBrowser() (line 232-243).** URL interpolated into `exec()` shell command. Use `execFile()` with args array instead of `exec()` with string interpolation.

- [x]**PowerShell injection in focus.js orphan name matching (line 112).** Display name interpolated into PowerShell string with single quotes. A name containing `'` breaks the quoting. Apply `name.replace(/'/g, "''")` for PS escaping (spawner.js already does this — focus.js doesn't).

- [x]**Shutdown token file permissions (index.js:542).** Written without restrictive mode. Add `{ mode: 0o600 }` to `fs.writeFile` so other local users can't read it.

- [x]**Verbose logging of hook stdin (index.js:120).** Notification/Stop/SessionEnd bodies logged to stdout. Could contain sensitive user prompts. Remove or redact in production.

- [x]**CORS headers leak on non-matching origins (index.js:68-71).** `Access-Control-Allow-Methods` and `Access-Control-Allow-Headers` are set on ALL responses regardless of origin match. Move these inside the `if (ALLOWED_ORIGINS.includes(origin))` block.

- [x]**No file magic byte validation in multipart upload (index.js:473-512).** Files are validated by filename only (`VALID_FILENAMES`), not content. A file named `idle.webm` containing executable code would pass. Add a basic magic byte check (webm starts with `0x1A45DFA3`, mp4 with `ftyp` at offset 4).

## Robustness Fixes

- [x]**SSE broadcast doesn't handle write errors (index.js:48-52).** `res.write()` to a dead socket fails silently; dead client never removed from `sseClients`. Check `res.writableEnded` before writing, remove client on error.

- [x]**SSE broadcast should snapshot clients (index.js:50).** Iterating `sseClients` while `req.on("close")` can delete from it mid-iteration. Use `Array.from(sseClients)` before the loop.

- [x]**windowCheckRunning not reset on early return (index.js:522).** `if (spawned.length === 0) return` exits before `finally` — actually wait, `finally` does run on return. ~~This is fine.~~ Verified: `finally` runs, no bug.

- [x]**Unhandled rejection: refreshGit().then(notify) (session-tracker.js:167).** If `getGitStatus` rejects in a way the catch doesn't cover, the `.then(notify)` chain rejects unhandled. Add `.catch(() => {})` to the chain.

- [x]**project-storage.js knownPaths cache unbounded.** Grows indefinitely over long server lifetime. Add MAX_CACHE or periodic pruning.

## Medium Fixes

- [x]**A11y: Space key not handled on button-role elements.** `SessionCard.svelte:46` and `SettingsModal.svelte:154-160` only handle Enter, not Space. Elements with `role="button"` should respond to both. Also `SpawnPopover.svelte:82` backdrop has no role/aria attributes.

- [x]**No SSE disconnect indicator (sse.js).** When the server is down, the UI shows stale data with no visual hint. Add a connection status signal so the UI can show a "disconnected" state.

- [x]**Truncate tool_name from hooks (hook-transform.js:7-9).** `input.tool_name` stored without length limit. Add `.slice(0, 100)`.

## Larger Refactors

- [x]**index.js is 583 lines (~3x the ~200 line ceiling).** Mixes routing, multipart parsing, SFX preview HTML, avatar middleware caching, and shutdown logic. Split into focused modules (e.g. `routes/`, `multipart-parser.js`). This is the biggest CLAUDE.md principle violation in the codebase.

## Test Coverage

Server tests are strong for core modules (session-tracker 93%, hooks 97%, hook-transform 100%, avatar-storage 98%). Major gaps:

- [x]**index.js routes: 0% coverage.** HTTP validation (400/429 responses), SSE broadcast, multipart parser — all untested. This is the highest-value test target.

- [x]**focus.js, spawner.js: 0% coverage.** Platform-specific code. Hard to test (needs mocked exec), but `sanitize()`, `generateTerminalTitle()`, and argument escaping are testable pure functions.

- [x]**git-status.js, project-storage.js, personality.js: 0% coverage.** Easy wins — small files, pure logic, no mocking needed for most paths.

- [x]**Web layer: 0% coverage.** No Svelte component tests exist. sse.js and sfx.js are testable JS modules.

---

## Notes

- `.webm` avatar files in `packages/server/assets/avatar/` — **by design**, skip
- SFX file naming (`idle-.mp3`, `pending-.mp3`, missing `busy.mp3`) — **intentional**, skip
- Empty `docs/superpowers/specs/` and `docs/superpowers/plans/` — fine, they're placeholders for future use
