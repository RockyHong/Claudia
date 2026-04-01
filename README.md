# Claudia

**Your Claude keeper.**

*Claude + día — Claude Code every day?*

```
  ┌──────────────────────────────────┐
  │  Claudia              localhost  │
  │                                  │
  │  ● api-server          Busy  3s │
  │  ◉ frontend      Needs you  12s │
  │  ○ pipeline           Idle  2m  │
  │                                  │
  │  "The frontend team needs your   │
  │   sign-off."                     │
  └──────────────────────────────────┘
```

## Why

Claude Code had me running — different monitors, different terminals, different projects. I kept tab-switching: *is it done? Is it blocked? Which terminal was that?*

So here comes Claudia — built with Claude, under Claudia's watch?! It watches them all in one tab and dings when something needs me.

And honestly, who doesn't like some company? ...sometimes I think it's watching me too.

## Quick Start

```bash
npx cldi         # Start the CLauDIa!
```

First run prompts you to install hooks. That's it — run your Claude sessions and Claudia picks them up.

> Already-running sessions won't see the hooks. Restart them after installing.

### Desktop App

Prefer a standalone window? Grab the latest from [Releases](https://github.com/RockyHong/Claudia/releases) — no Node.js required.

- **Windows** — `Claudia-Windows.zip` (extract and run)
- **macOS** — `Claudia.dmg` (drag to Applications)

## How It Works

```
Terminal 1 (claude code)  ──┐
Terminal 2 (claude code)  ──┤ hooks (curl POST)
Terminal 3 (claude code)  ──┘
                            ▼
              Claudia server (localhost:48901)
                            │
                            │ SSE stream
                            ▼
                    Browser dashboard
```

Claude Code [hooks](https://docs.anthropic.com/en/docs/claude-code/hooks) fire on session events, sending a small JSON payload to Claudia's local server. She tracks state transitions and pushes updates to your browser via Server-Sent Events.

All localhost. Nothing leaves your machine.

## Features

- **Live session tracking** — see every active session at a glance
- **State detection** — Idle (○ green), Busy (● blue, pulsing), Pending (◉ orange, pulsing)
- **Terminal focus** — click a session to jump to the right terminal
- **Personality** — Claudia is your keeper, not a dashboard. She talks like one.
- **Dynamic favicon** — tab icon changes color by state, visible even when minimized
- **Sound cues** — synthesized tones on state changes (send, pending, idle)
- **Dark/light mode** — follows your system preference
- **Custom avatars** — upload video sets per state through Settings
- **Zero footprint** — if Claudia isn't running, hooks fail silently. Your CLI stays untouched.

## Privacy

All access is local. The only network call is the opt-in Anthropic usage API.

See [docs/help/privacy.md](docs/help/privacy.md) for exactly what Claudia reads, and how to remove every trace.

## Uninstall

```bash
npx cldi uninstall   # remove hooks + delete all Claudia data
```

For partial removal options, see [docs/help/privacy.md](docs/help/privacy.md).

## Contributing

```bash
git clone https://github.com/RockyHong/Claudia.git
cd Claudia
npm install
npm run dev     # start server in watch mode
npm run build   # build the web UI
npm test        # run tests
npm run lint    # check with Biome
```

See [CLAUDE.md](CLAUDE.md) for design principles and coding standards.

## Requirements

- Node.js 18+
- Claude Code (with hooks support)

## License

MIT
