# Claudia

A personal receptionist for all your Claude Code agents.

```
  ┌──────────────────────────────────┐
  │  Claudia              localhost  │
  │                                  │
  │  ● api-server       Working  3s │
  │  ◉ frontend      Needs you  12s │
  │  ○ pipeline           Idle  2m  │
  │                                  │
  │  "The frontend team needs your   │
  │   sign-off."                     │
  └──────────────────────────────────┘
```

When you run multiple Claude Code sessions across different terminals, you constantly tab-switch to check: *Is it done? Does it need me? Which terminal was that?*

Claudia watches all your sessions in one browser tab. She tells you when and where to look — so you don't have to.

## Quick Start

```bash
npx claudia init    # configure Claude Code hooks (one-time)
npx claudia         # start the dashboard
```

> **Note:** Already-running Claude Code sessions won't pick up the hooks. Restart them after running `claudia init`.

That's it. Open the dashboard, run your Claude sessions, and Claudia will show you what's happening.

## Features

- **Live session tracking** — see all active Claude Code sessions at a glance
- **State detection** — Idle, Working, Pending (needs you), Thinking
- **Browser notifications** — get notified the moment a session needs your attention
- **Terminal focus** — click to jump to the right terminal (Windows, macOS, Linux)
- **Personality** — Claudia is a receptionist, not a dashboard. She talks like one.
- **Dynamic favicon** — tab icon changes color by state, so you can spot it even when minimized
- **Dark/light mode** — follows your system preference
- **Zero dependencies on Claude Code** — if Claudia isn't running, hooks fail silently. Nothing changes about your CLI experience.

## How It Works

```
Terminal 1 (claude code)  ──┐
Terminal 2 (claude code)  ──┤ hooks (curl POST)
Terminal 3 (claude code)  ──┘
                            ▼
              Claudia server (localhost:7890)
                            │
                            │ SSE stream
                            ▼
                    Browser dashboard
```

Claude Code [hooks](https://docs.anthropic.com/en/docs/claude-code/hooks) fire on every tool use and notification, sending a small JSON payload to Claudia's local server. Claudia tracks session state, detects idle/working/pending/thinking transitions, and pushes updates to your browser via Server-Sent Events.

All localhost. Nothing leaves your machine.

## States

| State | Meaning | Visual |
|---|---|---|
| **Idle** | Waiting for input or between tasks | ○ gray |
| **Working** | Running tools, writing code | ● blue (pulsing) |
| **Pending** | Needs your approval or input | ◉ orange (pulsing) + notification |
| **Thinking** | No output for >5s after working | ◐ purple (pulsing) |

## Commands

```bash
npx claudia init       # Add hooks to ~/.claude/settings.json
npx claudia            # Start the server + open dashboard
npx claudia teardown   # Remove Claudia hooks (keeps your other hooks)
```

## Requirements

- Node.js 18+
- Claude Code (with hooks support)

## Uninstall

```bash
npx claudia teardown
```

This removes only the hooks Claudia added. Your other hooks are untouched. Claude Code is completely unaffected.

## Contributing

```bash
git clone https://github.com/RockyHong/Claudia.git
cd claudia
npm install
npm run dev     # start server in watch mode
npm run build   # build the web UI
npm test        # run tests
npm run lint    # check with Biome
```

See [CLAUDE.md](CLAUDE.md) for design principles and coding standards.

## License

MIT
