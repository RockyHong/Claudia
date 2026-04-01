# Dashboard

The single screen — everything the user sees and interacts with.

## Layout

```
┌─────────────────────────────────────┐
│  [Avatar]  [Spawn] [Settings]       │  Header
├─────────────────────────────────────┤
│  Session cards                      │  SessionList
│  ...                                │
├─────────────────────────────────────┤
│  Status bar  |  Usage  |  Claude    │  Footer
└─────────────────────────────────────┘
```

Single page. Modals and popovers overlay this layout.

## Startup Sequence

1. Load preferences → apply theme, sound settings
2. Connect SSE → start receiving state updates
3. Check hooks → show HookGate if hooks are missing (blocks everything else)
4. Initialize SFX + ambience controllers
5. Initialize Tauri bridge (standalone mode only)

## Immersive Mode

Avatar video becomes the full-page background. Session cards get glass-morphism styling, text goes light-on-dark. Toggle via double-click on avatar or settings.

## Reactive Indicators

Three things update automatically from aggregate state:

- **Favicon** — green/blue/orange SVG data URI, changes with state
- **Document title** — `"Claudia — 3 sessions (1 pending)"` format
- **Status message** — template-based personality text from `personality.js`. Deterministic: same state always produces same message.

## Platform Status

Small "Claude" label + colored dot in the footer. Polls `status.claude.com` every 60s server-side, cached. Shows worst-of Claude Code + Claude API status. Hidden until first successful fetch. Links to status page on click.

## Connection Handling

SSE client auto-reconnects on disconnect. If down for more than a few seconds, a full-screen disconnect overlay appears with status. Dismisses on reconnect. Full state snapshot sent on each reconnect — no delta sync.

## Modal Layers

| Modal | Trigger | Purpose |
|---|---|---|
| HookGate | First run (no hooks) | Blocks until hooks installed |
| ConsentModal | First usage ring render | Usage monitoring opt-in |
| SettingsModal | Settings button | Config + avatar tabs |
| AvatarModal | Avatar click | Browse/select avatar sets |
| SpawnPopover | Spawn button | Project picker for launching sessions |
| ConfirmDialog | Destructive actions | Generic confirmation |

## Sound

Aggregate state changes trigger synth tones via Web Audio API — defaults are generated in real-time. Custom MP3s can be placed in avatar set directories. Ambience layer plays subtle typing sounds while sessions are busy (opt-in via preferences). Browser autoplay policy handled gracefully — sounds activate after first user interaction.
