# TODO

Actionable work items. Bug-by-bug, feature-by-feature.

---

## Frontend Tests

- [ ] Set up Svelte component testing (vitest + @testing-library/svelte)
- [ ] `SessionCard.svelte` — renders state dot, name, time, git info
- [ ] `SessionList.svelte` — ordering, empty state, card transitions
- [ ] `sse.js` — EventSource connection, reconnect, state parsing
- [ ] Settings modal — mute toggle, volume slider, avatar set switching

## Distribution Polish

- [ ] Generate/replace Tauri placeholder icons with real Claudia icons
- [ ] Test full SEA build end-to-end (requires Windows CI runner)
- [ ] Test Tauri build end-to-end
- [ ] Steam Workshop submission for WE package
- [ ] Real `preview.jpg` for WE Workshop listing

## Blocked

- [ ] Quick actions (approve/deny from Claudia) — blocked by lack of Claude Code approval API
