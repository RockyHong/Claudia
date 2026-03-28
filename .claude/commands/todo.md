Read `todo.md` and show all unchecked items. One line per task, no descriptions.

Then scan `docs/superpowers/` recursively for open work:
- For each file with a `Status:` line: show filename and status. If status is not "done" or "implemented", it's open.
- For each file with checkboxes: count unchecked (`- [ ]`) vs checked (`- [x]`). Show filename and "X/Y steps done". Skip if all checked.

End with total count across all sources.