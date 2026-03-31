# What Claudia Accesses

Claudia is a local-only tool. There is one opt-in network call and everything else stays on your machine.

## Files & Data

### `~/.claude/settings.json` (Read/Write)

Claudia registers her hooks in Claude Code's settings file so that running Claude Code sessions report their state to the local server. On install, she adds entries to the `hooks` object. On uninstall, she removes only the entries she added — entries containing `127.0.0.1:48901/hook`. Nothing else in the file is touched.

### `~/.claude/.credentials.json` (Read-only, opt-in)

If usage monitoring is enabled in Settings, Claudia reads your OAuth access token from this file to authenticate with the Anthropic usage API. The token is held in memory only for the duration of the request — it is never stored, logged, or sent anywhere other than `api.anthropic.com`.

### Anthropic Usage API — `api.anthropic.com/api/oauth/usage` (opt-in)

When usage monitoring is enabled, Claudia fetches your 5-hour and 7-day utilization from the Anthropic usage API. This is the only network call Claudia makes, and it is rate-limited to at most once every 10 minutes. It is disabled by default and can be turned off at any time from Settings.

### `~/.claudia/avatars/` (Read/Write)

Stores custom avatar video sets uploaded through the Settings modal. Supported formats are `.webm` and `.mp4`. Claudia reads these files to serve them to the dashboard and writes them when you upload a new set.

### `~/.claudia/projects.json` (Read/Write)

Maps session working directories to human-readable display names. Claudia reads this on startup and writes it when you rename a session.

### `~/.claudia/config.json` (Read/Write)

Stores your preferences: theme (dark/light/system), sound effects toggle, immersive mode toggle, and the usage monitoring toggle. Read on startup, written when you change a setting.

### `~/.claudia/shutdown-token` (Read/Write)

A random token written on startup and used to authenticate graceful instance replacement — for example, when a new `npx cldi` is run while one is already running. The old instance verifies the token before shutting down.

## System Access

### Terminal windows

To support the "click to focus" feature, Claudia enumerates open terminal windows and reads their titles. The mechanism is platform-specific:

- **Windows** — PowerShell via `Get-Process`
- **macOS** — AppleScript via `osascript`
- **Linux** — `xdotool`

Claudia reads window titles to match them to sessions and calls focus/flash APIs to bring the right terminal to the foreground when you click a session card.

### Window renaming

On Windows, Claudia uses Win32 `SetWindowText` to rename terminal windows of spawned sessions so they can be identified by title later. This only applies to sessions launched from the dashboard, not pre-existing terminals.

### Git status

For each active session, Claudia runs two git commands in the session's working directory:

- `git rev-parse --abbrev-ref HEAD` — reads the current branch name
- `git status --porcelain` — reads working tree state (modified, staged, untracked files)

These are display-only and read-only. No git state is ever modified.

### Process spawning

When you launch a new Claude Code session from the dashboard, Claudia uses Node's `execFile` to start the process. No background processes are kept beyond the spawned Claude Code session itself.

## Uninstall

```bash
npx cldi uninstall
```

This removes all hooks Claudia added to `~/.claude/settings.json` and deletes the `~/.claudia/` directory. Your other hooks and Claude Code settings are untouched.

### Manual removal

If you prefer to remove Claudia by hand:

**Delete the data directory:**

```bash
# macOS / Linux
rm -rf ~/.claudia/

# Windows (PowerShell)
Remove-Item -Recurse -Force "$env:USERPROFILE\.claudia"
```

**Remove hooks from `~/.claude/settings.json`:**

Open the file in any text editor and remove all hook entries whose command contains `127.0.0.1:48901/hook`. The file is standard JSON — the `hooks` object contains arrays of hook definitions, and you want to remove any object whose `command` field references that address.
