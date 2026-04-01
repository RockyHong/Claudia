# Feature Specs

Source of truth for what Claudia does and why. Each spec covers product-level behavior — intent, user flows, cross-module interactions, and decisions not obvious from reading the code.

**These are not work orders.** Superpowers specs (`docs/superpowers/specs/`) describe what to build and get deleted after merge. These specs describe what exists and why — updated as features evolve.

**These are not code docs.** Implementation details, API tables, and module internals live in the code itself. Grep it. Specs focus on the "why" and the product logic that connects modules.

---

## Specs

| Spec | Covers |
|---|---|
| [sessions.md](sessions.md) | State machine, aggregate rule, subagent awareness, stale pruning, SSE contract |
| [hooks.md](hooks.md) | Integration protocol, hook types, installation flow, silent failure design |
| [dashboard.md](dashboard.md) | Layout, startup sequence, immersive mode, status indicators, sound, modals |
| [avatars.md](avatars.md) | Visual personality, avatar sets, fallback chain, import/export |
| [spawning.md](spawning.md) | Launch flow, focus strategies, terminal linking, platform differences |
