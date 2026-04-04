# Rename / Refactor Technique

Mechanical renames in this monorepo are token-expensive when done line-by-line. Use the right tool for the scope.

## Decision tree

1. **Is the rename term 6+ characters and unique to the domain?** (e.g. Conversation, Quest, Graduation, Scenario)
   - Yes: **sed without word boundaries**, case-preserving pair. Example: `sed -i 's/Conversation/Chat/g; s/conversation/chat/g'`. Fast, covers TS + JSON + comments + test descriptions in one pass. Rely on term uniqueness for safety, not regex boundaries.
   - No: go to step 2.

2. **Is the term short or a common English word?** (e.g. Word, Turn, Card, State)
   - **sed `\b` word boundaries will miss compound identifiers** (`\bWord\b` does NOT match `WordEvent` or `getWord` in camelCase — sed treats these as single words).
   - **sed without boundaries will corrupt unrelated identifiers** (`Word` inside `password`, `keyword`).
   - Use **ts-morph for TypeScript symbols** (types, variables, imports), then **sed for non-code** (JSON keys/values, comments, test descriptions, docs). This is the only case where the layered approach is justified.

3. **Is it a single symbol rename?** (function `calculateInterval` to `computeInterval`)
   - **VSCode F2** (interactive) or **ts-morph** (scripted). No sed needed.

## Tool reference

| Scope                             | Technique                                   | Example                                                                                                                                                 |
| --------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Concept rename, long unique term  | `sed` (no boundaries) + `git mv`            | `find apps packages -name '*.ts' -o -name '*.tsx' -o -name '*.json' \| xargs sed -i 's/Conversation/Chat/g; s/conversation/chat/g'` then `git mv` files |
| Concept rename, short/common term | `ts-morph` for symbols + `sed` for non-code | Write throwaway ts-morph script for TS, then `sed` for JSON/comments                                                                                    |
| Single symbol                     | VSCode F2 or `ts-morph`                     | One symbol, all references                                                                                                                              |
| File/directory rename             | `git mv` + `sed` for import paths           | `git mv old new && find . -name '*.ts' -exec sed -i 's/OldPath/NewPath/g' {} +`                                                                         |
| i18n key rename                   | `sed` on locale JSON files                  | Keys are plain strings in flat JSON                                                                                                                     |

## Rules

1. **Never use `\b` word boundaries for concept renames.** `\bConversation\b` does NOT match `ConversationHeader` or `conversationApi` — sed treats camelCase/PascalCase compounds as single words. For domain terms, drop the boundaries entirely and rely on term uniqueness.

2. **Always text-sweep i18n values, not just keys.** Renaming `quest.start.title` to `chat.start.title` fixes the key, but the translated _values_ ("Start Quest" in en) still contain the old concept. Sweep all locale files for the old term in every language.

3. **`sed` + `git mv` over line-by-line edits.** A single `sed` command replaces hundreds of occurrences in seconds. Line-by-line Edit calls are O(n) in token cost. For a rename touching 33 files, `sed` is 1 command; line-by-line is 60-80 tool calls.

4. **Always run `pnpm turbo build && pnpm turbo test` after bulk rename.** The build/test cycle is the safety net. Even if sed introduces a mistake, detecting and fixing it via 1-2 targeted edits is cheaper than the upfront cost of ts-morph scripting. Only reach for ts-morph when you know sed will produce false positives (short/common terms).

5. **Verify with `git diff` before committing.** After any bulk rename, scan the diff for false positives. Faster than re-reviewing after the fact.

6. **Case-preserving pairs.** Always handle both PascalCase and camelCase in one sed command: `'s/OldName/NewName/g; s/oldName/newName/g'`. For ALL_CAPS constants, add a third: `s/OLD_NAME/NEW_NAME/g`.
