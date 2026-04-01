# What Claudia Accesses

Claudia is a local-only tool. This page explains exactly what it touches on your machine and what leaves it.

> **Want to undo everything Claudia touched?** See [Cleaning up](#cleaning-up).

## Network

### Claude Platform Status (always on)

Anonymous GET to `status.claude.com/api/v2/summary.json` once per minute — checks whether Claude Code and the Claude API are up or degraded. No authentication, no user data, no tracking.

### Anthropic Usage API (opt-in)

When you enable usage monitoring in Settings, Claudia reads your OAuth token from `~/.claude/.credentials.json` and calls `api.anthropic.com/api/oauth/usage` to fetch your 5-hour and 7-day utilization. The token is held in memory for the duration of the request only — never stored, logged, or sent anywhere else. Rate-limited to once every 10 minutes. Disabled by default.

### Nothing else

These are the only two outbound calls. Everything else stays on localhost.

## Files Read

| File | When | Why |
|------|------|-----|
| `~/.claude/settings.json` | Always | Claudia registers its hooks here so running Claude Code sessions report their state to the local server. On install it adds entries to `hooks`; on uninstall it removes only entries containing `127.0.0.1:48901/hook`. |
| `~/.claude/.credentials.json` | Opt-in (usage monitoring) | See Usage API above. |
| Markdown files in your projects | Always | Lists and reads `.md` files from each session's working directory (`git ls-files` + `fs.readFile`) to display project docs on the dashboard. Only `.md` files — nothing else. If your markdown contains sensitive content, be aware it's served over localhost. |

## Files Written

All stored under `~/.claudia/`. Nothing is written outside this directory (except the hooks in `settings.json` above).

| File | Purpose |
|------|---------|
| `config.json` | Your preferences: theme, sound effects, immersive mode, usage monitoring, auto-focus. |
| `projects.json` | Maps session working directories to display names you set. |
| `avatars/` | Custom avatar video sets (`.webm`, `.mp4`) uploaded through Settings. |
| `shutdown-token` | Random token for graceful instance replacement when a new `npx cldi` starts. |

## System Access

### Local server on port 48901

Express server on `127.0.0.1:48901`. Claude Code hooks POST session events to it; the dashboard connects via SSE. Localhost only — not reachable from other machines.

### Terminal windows

To support click-to-focus, Claudia needs to find which terminal window belongs to which session and bring it to the foreground. This requires process-level access that goes beyond just reading window titles:

- **Windows** — `Get-Process` to list running processes, `Get-CimInstance Win32_Process` to walk the process tree (parent→child) and match a Claude Code session to its terminal window. This gives Claudia visibility into your full process tree, not just terminals. `SetWindowText` renames terminal windows of sessions launched from the dashboard so they can be identified later.
- **macOS** — AppleScript (`osascript`) to find and focus Terminal/iTerm windows.
- **Linux** — `xdotool` to search window titles and activate the match.

### Git (read-only)

For each active session, two commands in the session's working directory:

- `git rev-parse --abbrev-ref HEAD` — current branch name
- `git status --porcelain` — working tree state

No git state is ever modified.

### Process spawning

When you launch a session or open a folder from the dashboard, Claudia uses Node's `spawn` / `execFile`. No background processes persist beyond the spawned session itself.

## Cleaning Up

Claudia touches two places outside its own data folder. Here's how to remove them.

| What | Where | How to remove |
|------|-------|---------------|
| Hook entries | `~/.claude/settings.json` | **Settings > Remove hooks** in the dashboard, or manually delete any hook whose `command` contains `127.0.0.1:48901/hook` |
| Data folder | `~/.claudia/` (config, project names, avatars) | Delete the directory: `rm -rf ~/.claudia/` (macOS/Linux) or `Remove-Item -Recurse -Force "$env:USERPROFILE\.claudia"` (PowerShell) |

Both are also handled by `npx cldi uninstall`, which walks you through it interactively.
