Scan `docs/superpowers/` for all specs and plans. For each file found:

1. Read the file and determine its state:
   - **Cycle stage**: brainstorming, planning, executing, reviewing, or done
   - **Progress**: count checked vs unchecked checkboxes if any
   - **Blocker**: is it waiting on the user (approval, decision, feedback) or can Claude proceed autonomously?

2. Present a flat summary table:
   ```
   File                          | Stage      | Progress | Blocker
   specs/foo.md                  | executing  | 3/7      | none
   plans/bar.md                  | planning   | —        | user (needs approval)
   ```

3. Below the table, suggest **what to tackle next** — prioritize by:
   - Unblocked work first (things Claude can do now)
   - Dependencies (if plan X depends on spec Y being done, do Y first)
   - Nearest to completion (finish what's almost done before starting new)

If `docs/superpowers/` is empty or missing, say: "No active work. Start something with /brainstorm or give me a task."
