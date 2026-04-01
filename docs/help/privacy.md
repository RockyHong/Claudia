# What Claudia Accesses

Claudia is a local-only tool built to make managing Claude Code sessions easier. This page explains exactly what it touches on your machine and what leaves it.

## Network Calls

Claudia makes two network calls. One is always on, one is opt-in. Neither sends personal data.

### Claude Platform Status (always on)

Claudia checks `status.claude.com/api/v2/summary.json` once per minute to show whether Claude Code and the Claude API are up or degraded. This is an anonymous GET request to a public status page — no authentication, no user data sent, no tracking.

### Anthropic Usage API (opt-in)

When usage monitoring is enabled in Settings, Claudia reads your OAuth token from `~/.claude/.credentials.json` and calls `api.anthropic.com/api/oauth/usage` to fetch your 5-hour and 7-day utilization. The token is held in memory for the duration of the request only — never stored, logged, or sent anywhere else. Rate-limited to at most once every 10 minutes. Disabled by default.

## Files Claudia Reads

### `~/.claude/settings.json`

Claudia registers its hooks here so running Claude Code sessions report their state to the local server. On install it adds entries to the `hooks` object; on uninstall it removes only entries containing `127.0.0.1:48901/hook`. Nothing else in the file is touched.

### `~/.claude/.credentials.json` (opt-in)

Only read when usage monitoring is enabled. See the Usage API section above.

### Markdown files in your projects

Claudia lists and reads `.md` files from each session's working directory to display project documentation on the dashboard. This uses `git ls-files` (tracked and untracked) and `fs.readFile`. Only `.md` files are read — no other file types. If your markdown files contain sensitive content, be aware they are served to the dashboard over localhost.

## Files Claudia Writes

All stored under `~/.claudia/`. Nothing is written outside this directory (except the hooks in `settings.json` above).

| File | Purpose |
|------|---------|
| `config.json` | Your preferences: theme, sound effects, immersive mode, usage monitoring, auto-focus. |
| `projects.json` | Maps session working directories to display names you set. |
| `avatars/` | Custom avatar video sets (`.webm`, `.mp4`) uploaded through Settings. |
| `shutdown-token` | Random token for graceful instance replacement when a new `npx cldi` starts. |

## System Access

### Local server on port 48901

Claudia runs an Express server on `127.0.0.1:48901`. Claude Code hooks POST session events to it; the dashboard connects via SSE to receive updates. The server only listens on localhost — it is not reachable from other machines.

### Terminal windows

To support click-to-focus, Claudia reads terminal window titles and brings the right one to the foreground:

- **Windows** — PowerShell (`Get-Process`, process tree walking via `Get-CimInstance`)
- **macOS** — AppleScript (`osascript`)
- **Linux** — `xdotool`

On Windows, Claudia also renames terminal windows of sessions it launches (via `SetWindowText`) so they can be identified later. This only applies to sessions started from the dashboard.

### Git status

For each active session, Claudia runs two read-only git commands in the session's working directory:

- `git rev-parse --abbrev-ref HEAD` — current branch name
- `git status --porcelain` — working tree state (modified, staged files)

No git state is ever modified.

### Process spawning

When you launch a session or open a folder from the dashboard, Claudia uses Node's `spawn` / `execFile`. No background processes persist beyond the spawned session itself.

## Removal

Three ways to remove Claudia, depending on what you want to undo.

### Full uninstall (hooks + data)

```bash
npx cldi uninstall
```

Interactive — shows what will be removed and asks for confirmation. Removes hooks from `~/.claude/settings.json` (only Claudia entries) and deletes `~/.claudia/`.

### Remove hooks only (keep data)

Open the dashboard and go to **Settings > Remove hooks**. Removes all Claudia hook entries from `settings.json` but leaves `~/.claudia/` intact — avatars, project names, and preferences are preserved. You can reinstall hooks later from the same Settings tab.

### Manual removal

If Claudia isn't running:

```bash
# Delete data directory
# macOS / Linux
rm -rf ~/.claudia/

# Windows (PowerShell)
Remove-Item -Recurse -Force "$env:USERPROFILE\.claudia"
```

To remove hooks manually, open `~/.claude/settings.json` and delete any hook entry whose `command` contains `127.0.0.1:48901/hook`. If a hook type array becomes empty after removal, you can delete the entire key.
