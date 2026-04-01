# Auto-Link: Automatic Terminal Window Linking

When a Claude Code session starts via hook, automatically identify which terminal window it's running in and link the session to that window — no manual intervention needed.

## Problem

Sessions spawned by Claudia auto-link because Claudia creates the terminal and knows the window handle. Sessions started manually (user opens a terminal, runs `claude`) appear as "unlinked" and require manual linking via a dropdown. This dropdown is clunky, and for VS Code sessions it doesn't help at all.

## Approach

Pass the hook shell's PID to the server via HTTP header. The server walks the process tree up to find a known terminal process and its window handle.

## Hook Command Change

Only `SessionStart` gets the PID header. Other hooks stay unchanged.

```bash
# Before
curl -sfS -X POST -H "Content-Type: application/json" -d @- http://127.0.0.1:48901/hook/SessionStart 2>/dev/null || true

# After
curl -sfS -X POST -H "Content-Type: application/json" -H "X-Hook-PID: $$" -d @- http://127.0.0.1:48901/hook/SessionStart 2>/dev/null || true
```

`$$` is the shell PID. Users need one hook reinstall (existing install button handles this).

## PID-to-HWND Resolution

New module `pid-ancestry.js`. Single function: `resolveTerminalWindow(pid)` returns `{ hwnd, title }` or `null`.

Process tree walk via PowerShell:
1. Start at the hook shell PID
2. Walk `ParentProcessId` up via `Win32_Process`
3. At each ancestor, check if process name is in the known terminal list
4. If found and `MainWindowHandle !== 0`, return HWND + window title
5. If we hit PID 0 or a non-terminal app (e.g. `Code.exe`), return null

Known terminal processes (from existing `focus.js` list): `WindowsTerminal`, `cmd`, `powershell`, `pwsh`, `ConEmuC64`, `ConEmuC`, `mintty`, `Alacritty`, `kitty`, `Hyper`, `Tabby`, `WezTerm`.

Timeout: 5 seconds. Failure = unlinked. Windows-only; other platforms return null immediately.

### Platform Coverage

| Source | PID walk result | Outcome |
|---|---|---|
| Windows Terminal | Finds `WindowsTerminal.exe` HWND | Auto-linked |
| Standalone cmd | Finds `cmd.exe` HWND | Auto-linked |
| Standalone PowerShell | Finds `powershell.exe` HWND | Auto-linked |
| VS Code terminal | Walks up to `Code.exe` — not in terminal list | Unknown |
| VS Code extension | No terminal at all | Unknown |
| macOS / Linux | No PID header / no Windows API | Unknown |

## Auto-Link Flow

In `index.js`, after `tracker.handleEvent(event)` for `SessionStart`:

1. If session already linked (spawned by Claudia) — skip
2. Read `X-Hook-PID` header — if missing, skip
3. Call `resolveTerminalWindow(pid)` async, fire-and-forget (don't block hook response)
4. If HWND found — `tracker.linkSessionById(sessionId, windowTitle, hwnd)`
5. If null — session stays unlinked, displays as `Unknown`

The hook response returns immediately. The PowerShell lookup runs in the background.

## Session Display

Always: `{displayName} · {terminalName}`

- `displayName` — project folder name from `cwd`, deduped (`my-app`, `my-app 2`)
- `terminalName` — terminal window title (linked) or `Unknown` / `Unknown 2` (unlinked), deduped in session-tracker same as displayName

Examples:
```
my-app · Claudia                — spawned by Claudia
my-app · Claudia 2              — second spawn
my-app · Windows PowerShell     — auto-linked standalone
my-app · Command Prompt         — auto-linked cmd
my-app · Unknown                — unlinked (VS Code, macOS, etc.)
my-app · Unknown 2              — second unlinked
```

No visual distinction between linked and unlinked — the name speaks for itself.

## Spawn Naming Change

`terminal-title.js` changes from generating folder-based names to `Claudia`, `Claudia 2`, `Claudia 3`. The project name is already shown as `displayName`.

No renaming on link — neither auto-link nor manual link ever renames the terminal window. Spawned sessions get named once at spawn time only. This avoids the `--suppressApplicationTitle` conflict where relinking after server restart fails to rename.

## Alert Gating

Notifications (`onPendingAlert`, `onIdleAlert`) currently gate on `spawned` boolean. Replace with linked status: fire alerts for any session where `terminalName !== "Unknown"` (i.e. we know which window to flash/focus).

## Removals

### Server endpoints
- `GET /api/terminals` — listed windows for manual link dropdown
- `POST /api/link/:sessionId` — manual link action
- `POST /api/flash/:hwnd` — hover preview flash for link dropdown

### Server code (`focus.js`)
- `listTerminalWindows()` and `WIN_ENUM_CS` helper — enumeration no longer needed
- `flashWindow()` — only used by removed link dropdown hover
- `TERMINAL_PROCESS_NAMES` — moves to `pid-ancestry.js`

### Frontend (`SessionCard.svelte`)
- `showLinkDropdown`, `terminalList`, `linkLoading`, `linkError` state
- `openLinkDropdown()`, `linkTerminal()`, `flashTerminal()` functions
- Orphan badge element, link dropdown markup, all `.link-dropdown*` CSS

### What stays
- `focusTerminal()` — session card click-to-focus
- `findDeadWindows()` — prune dead sessions
- `renameTerminal()` — used at spawn time
- `storeSpawnedInfo()` — spawned session flow unchanged

## Files Changed

| File | Change |
|---|---|
| `hooks.js` | SessionStart command gets `X-Hook-PID: $$` header |
| `pid-ancestry.js` | **New** — `resolveTerminalWindow(pid)` |
| `index.js` | Async auto-link after SessionStart handleEvent |
| `session-tracker.js` | Add `terminalName` field, dedup `Unknown`/`Unknown 2`, gate alerts on linked status |
| `terminal-title.js` | `Claudia`, `Claudia 2` instead of folder name |
| `SessionCard.svelte` | Always `{displayName} · {terminalName}`, remove dropdown/badge/flash |
| `routes-api.js` | Remove three endpoints |
| `focus.js` | Remove `listTerminalWindows`, `WIN_ENUM_CS`, `flashWindow`, `TERMINAL_PROCESS_NAMES` |
