# Terminal Linking — Adopt Orphan Sessions

## Problem

Sessions auto-detected via hooks (not spawned by Claudia) arrive with `spawned: false`, no `windowHandle`, no `terminalTitle`. They show an "ext" pill and can't be reliably focused. Users have no way to connect these orphan sessions to their actual terminal windows.

## Solution

Let users link an orphan session to a terminal window via a dropdown picker. After linking, the session becomes indistinguishable from a spawned one — same focus, same alerts, same dead window pruning.

## Backend

### Window Enumeration — `focus.js`

New function: `listTerminalWindows(excludeHandles)`

- PowerShell enumerates visible windows via `Get-Process` or `EnumWindows`
- Filters to known terminal process names: `WindowsTerminal`, `cmd`, `powershell`, `pwsh`, `ConEmu`, `mintty`
- Excludes HWNDs already linked to sessions (passed as `excludeHandles` Set)
- Returns `[{ hwnd, title }]`
- Windows-only implementation. Other platforms return empty array.

### Terminal Rename — `focus.js`

New function: `renameTerminal(windowHandle, newTitle)`

- Calls `SetWindowText` via PowerShell to change the window title
- Uses the same `claudia · <name>-<uid>` naming scheme as `generateTerminalTitle` in `spawner.js`
- Windows-only. No-op on other platforms.

### API Routes — `routes-api.js`

**`GET /api/terminals`**

- Calls `tracker.getLinkedHandles()` to get HWNDs already in use
- Calls `listTerminalWindows(excludeHandles)` to get available terminals
- Returns `[{ hwnd, title }]`

**`POST /api/link/:sessionId`**

- Receives `{ windowHandle }` in body
- Generates a `claudia ·` title via `generateTerminalTitle` (extracted from `spawner.js` to a shared location, or imported directly — whichever fits the module boundaries better)
- Calls `renameTerminal(windowHandle, newTitle)` to rename the actual terminal window
- Calls `tracker.storeSpawnedInfo(cwd, newTitle, windowHandle)` — reuses the existing spawn-link protocol
- Session becomes `spawned: true` with `windowHandle` and `terminalTitle` populated
- SSE broadcast fires automatically via `onStateChange`

### Session Tracker — `session-tracker.js`

**No changes needed.** `storeSpawnedInfo` already handles late-linking (session exists before spawn info arrives). After linking:

- `spawned: true` — focus works
- `windowHandle` populated — dead window pruning works
- `terminalTitle` set — alerts work
- Identical to a spawned session from this point forward

New getter: `getLinkedHandles()` — returns Set of all HWNDs currently stored on sessions, used by the terminals endpoint to filter the list.

## Frontend

### "Unlinked" Pill — `SessionCard.svelte`

- Rename "ext" badge text from `ext` to `unlinked`
- Make it clickable — on click, fetch `GET /api/terminals`
- Show inline dropdown anchored below the pill

### Dropdown

- Lists terminal windows by their title
- On selection, `POST /api/link/:sessionId` with the chosen HWND
- Dropdown closes on selection or click-outside
- SSE update arrives with `spawned: true` — pill disappears automatically

### Empty State

- If no unlinked terminals found, dropdown shows "No terminals found"

### Post-Link

- No "linked" badge — session card is identical to a spawned one
- No unlink button — user closes the terminal, dead window pruning handles cleanup

## Platform Scope

**Windows-only for now.** The linking UI appears on all platforms, but:

- **Windows**: Fully functional — enumerate, pick, rename, link
- **macOS**: Pill visible but clicking shows "Linking not supported on this platform yet"
  - Future: AppleScript `tell application "Terminal"` for enumeration, `AXTitle` for rename
- **Linux**: Same as macOS
  - Future: `wmctrl -l` for enumeration (X11 only), `xdotool set-window --name` for rename. Wayland is a gap.

## Non-Goals

- Linking to non-terminal windows (explicitly forbidden)
- Unlink button (close the terminal instead)
- Cross-platform support beyond Windows in this iteration
- Persisting links across server restarts (sessions are in-memory)
