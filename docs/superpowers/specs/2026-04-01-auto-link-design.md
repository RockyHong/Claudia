# Auto-Link: Automatic Terminal Window Linking

When a Claude Code session starts via hook, automatically identify which terminal window it's running in and link the session to that window — no manual intervention needed.

## Problem

Sessions spawned by Claudia auto-link because Claudia creates the terminal and knows the window handle. Sessions started manually (user opens a terminal, runs `claude`) appear as "unlinked" and require manual linking via a dropdown. This dropdown is clunky, and for VS Code sessions it doesn't help at all.

## Approach

The SessionStart hook resolves the terminal HWND inline (synchronously, via PowerShell process tree walk) and sends it to the server as an HTTP header. The server parses the HWND and title, then links the session.

## Hook Command Change

Only `SessionStart` gets the inline resolution. Other hooks stay unchanged.

```bash
# Before
curl -sfS -X POST -H "Content-Type: application/json" -d @- http://127.0.0.1:48901/hook/SessionStart 2>/dev/null || true

# After
HWND_INFO=$(powershell -NoProfile -Command '...process tree walk...'); curl -sfS -X POST -H "Content-Type: application/json" -H "X-Hook-Window: $HWND_INFO" -d @- http://127.0.0.1:48901/hook/SessionStart 2>/dev/null || true
```

The PowerShell walk runs **synchronously before curl** so the process tree is still alive. The result is `HWND|WindowTitle` or empty. Users need one hook reinstall (existing install button handles this).

### Why inline, not async

Early attempts passed the shell PID (`$$` or `$PPID`) via header and resolved asynchronously on the server. Both failed:
- `$$` — the hook shell exits before the async PowerShell walk starts, so the PID is dead
- `$PPID` — returns `1` (init) on Windows/Git Bash, not the Claude Code process

Inline resolution avoids both issues: the walk runs while the shell and all its ancestors are alive.

### PowerShell details

The walk uses `$PID` (PowerShell's own automatic variable) as the starting point, then `Get-CimInstance Win32_Process` to traverse `ParentProcessId`. Uses `$cur` as the loop variable — `$pid` is read-only in PowerShell (alias for `$PID`).

## HWND Resolution

Process tree walk via PowerShell (inline in hook command, also available as standalone `pid-ancestry.js`):

1. Start at the PowerShell process's own PID
2. Walk `ParentProcessId` up via `Win32_Process`
3. At each ancestor, check if process name is in the known terminal list
4. If found and `MainWindowHandle !== 0`, output `HWND|title`
5. If we hit PID 0 or exhaust 20 iterations, output nothing

Known terminal processes: `WindowsTerminal`, `cmd`, `powershell`, `pwsh`, `ConEmuC64`, `ConEmuC`, `mintty`, `Alacritty`, `kitty`, `Hyper`, `Tabby`, `WezTerm`.

Windows-only; other platforms produce no header (empty `HWND_INFO`).

### Platform Coverage

| Source | Walk result | Outcome |
|---|---|---|
| Windows Terminal | Finds `WindowsTerminal.exe` HWND | Auto-linked |
| Standalone cmd | Finds `cmd.exe` HWND | Auto-linked |
| Standalone PowerShell | Finds `powershell.exe` HWND | Auto-linked |
| VS Code terminal | Walks up to `Code.exe` — not in terminal list | Unknown |
| VS Code extension | No terminal at all | Unknown |
| macOS / Linux | No PowerShell / no Windows API | Unknown |

## Auto-Link Flow

In `index.js`, after `tracker.handleEvent(event)` for `SessionStart`:

1. If session already linked (spawned by Claudia) — skip
2. Read `X-Hook-Window` header — if missing or empty, skip
3. Parse `HWND|title` — if invalid, skip
4. `tracker.linkSessionById(sessionId, title, hwnd)`

No async work — the header already contains the resolved HWND and title.

## Session Display

Always: `{displayName} · {terminalLabel}`

- `displayName` — project folder name from `cwd`, deduped (`my-app`, `my-app 2`)
- `terminalName` — full terminal identifier stored in session (e.g. `my-app claudia 1`, `Windows PowerShell`, `Unknown`)
- `terminalLabel` — frontend derived: strips `displayName` prefix from `terminalName` to avoid redundancy

Examples:
```
my-app · claudia 1              — spawned by Claudia (terminal title: "my-app claudia 1")
my-app · claudia 2              — second spawn
my-app · Windows PowerShell     — auto-linked standalone
my-app · Command Prompt         — auto-linked cmd
my-app · Unknown                — unlinked (VS Code, macOS, etc.)
my-app · Unknown 2              — second unlinked
```

No visual distinction between linked and unlinked — the name speaks for itself.

## Spawn Naming Change

`terminal-title.js` generates `{project} claudia {n}` (always numbered, sanitized). The terminal window title includes the project name for OS-level identification (taskbar, alt-tab). The session card strips the redundant project prefix via `terminalLabel`.

No renaming on link — neither auto-link nor manual link ever renames the terminal window. Spawned sessions get named once at spawn time only. This avoids the `--suppressApplicationTitle` conflict where relinking after server restart fails to rename.

## Alert Gating

Notifications (`onPendingAlert`, `onIdleAlert`) fire for any session where `terminalName` does not start with `"Unknown"` (i.e. we know which window to flash/focus).

## Window Pruning

Dead window pruning (every 5s) checks all sessions with a `windowHandle` — both spawned and auto-linked. Unlinked sessions (`windowHandle: null`) are excluded. When a linked terminal window closes, the session card is removed.

## Removals

### Server endpoints
- `GET /api/terminals` — listed windows for manual link dropdown
- `POST /api/link/:sessionId` — manual link action
- `POST /api/flash/:hwnd` — hover preview flash for link dropdown

### Server code (`focus.js`)
- `listTerminalWindows()` and `WIN_ENUM_CS` helper — enumeration no longer needed
- `flashWindow()` — only used by removed link dropdown hover
- `TERMINAL_PROCESS_NAMES` — moved to `pid-ancestry.js` and inline in hook command

### Frontend (`SessionCard.svelte`)
- `showLinkDropdown`, `terminalList`, `linkLoading`, `linkError` state
- `openLinkDropdown()`, `linkTerminal()`, `flashTerminal()` functions
- Orphan badge element, link dropdown markup, all `.link-dropdown*` CSS

### What stays
- `focusTerminal()` — session card click-to-focus (now works for auto-linked too)
- `findDeadWindows()` — prune dead sessions (now covers all linked sessions)
- `renameTerminal()` — used at spawn time
- `storeSpawnedInfo()` — spawned session flow unchanged

## Files Changed

| File | Change |
|---|---|
| `hooks.js` | SessionStart command: inline PowerShell HWND resolution, `X-Hook-Window` header |
| `pid-ancestry.js` | **New** — standalone `resolveTerminalWindow(pid)` (kept for potential future use) |
| `index.js` | Parse `X-Hook-Window` header on SessionStart, link session; prune all linked windows |
| `session-tracker.js` | Add `terminalName` field, dedup `Unknown`/`Unknown 2`, gate alerts on linked status |
| `terminal-title.js` | `{project} claudia {n}` format, sanitized |
| `SessionCard.svelte` | `{displayName} · {terminalLabel}` with prefix stripping, remove dropdown/badge/flash |
| `routes-api.js` | Remove three endpoints, unused imports |
| `focus.js` | Remove `listTerminalWindows`, `WIN_ENUM_CS`, `flashWindow`, `TERMINAL_PROCESS_NAMES` |
