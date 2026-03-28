# TODO

Actionable work items. Bug-by-bug, feature-by-feature.

---

## Distribution Polish

- [ ] Generate/replace Tauri placeholder icons with real Claudia icons
- [ ] Test full SEA build end-to-end (requires Windows CI runner)
- [ ] Test Tauri build end-to-end
- [ ] Steam Workshop submission for WE package
- [ ] Real `preview.jpg` for WE Workshop listing

## User Trust & Transparency

- [ ] Add "What Claudia accesses" section to README — files read/written, processes spawned, network calls
- [ ] Usage feature: make credential access opt-in (toggle off by default, explain what it reads)
- [ ] Add `claudia uninstall` command — removes `~/.claudia/` (avatars, projects, config, shutdown token), removes hooks from `~/.claude/settings.json`
- [ ] Document how to manually reverse hook installation

## Blocked

- [ ] Quick actions (approve/deny from Claudia) — blocked by lack of Claude Code approval API
