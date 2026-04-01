# Spawning & Focus

Launching sessions and finding the right terminal window — the receptionist's core job.

## Spawn Flow

1. User picks a project folder (from known list or native folder picker)
2. Server launches a terminal with `claude` in that directory
3. A unique terminal title is generated for window identification
4. On Windows: polls for the HWND by title (up to 5 seconds)
5. Spawn info stored in session tracker, matched to the session when its `SessionStart` hook fires

The spawn → hook matching handles both orderings: if the hook arrives before the spawn returns (race), the tracker retroactively links the newest unlinked session with that cwd.

## Focus

Click a session card → Claudia raises that terminal window with a colored overlay flash.

**Two intents**: `navigate` (blue, user-initiated click) and `alert` (orange, pending auto-focus).

**Two strategies**:
- **Spawned sessions** (have HWND) — direct window handle focus, reliable
- **Orphan sessions** (no HWND) — title matching against terminal process windows, best-effort

The flash overlay fades out over ~200ms. Platform-specific: WinForms overlay on Windows, NSWindow on macOS, tkinter on Linux.

## Linking

If automatic spawn matching fails, users can manually link a session to a terminal window. The link dropdown lists visible terminal windows (Windows only); hovering flashes the window for identification while keeping current focus.

## Platform Reality

| Capability | Windows | macOS | Linux |
|---|---|---|---|
| Spawn terminal | Windows Terminal | Terminal.app | gnome-terminal / xterm |
| HWND capture | Yes (poll by title) | No | No |
| Focus by handle | Yes | N/A | N/A |
| Focus by title | Fallback | Primary | Primary |
| Window flash | WinForms overlay | NSWindow overlay | tkinter overlay |
| Terminal enumeration | Yes (Win32 API) | No | No |
| Window rename | Yes (SetWindowText) | No | No |

Windows gets the most reliable experience because of HWND access. macOS and Linux fall back to title matching, which is best-effort.

## Managed Mode

In standalone (Tauri) distribution, spawned terminals are assigned to a Windows Job Object so they're cleaned up when Claudia exits. This prevents orphaned terminal windows.

## Design Decisions

- **`--suppressApplicationTitle`** on Windows Terminal — keeps Claudia's unique title even after Claude sets its own
- **Unique titles via `terminal-title.js`** — avoids ambiguity when multiple sessions share a project name
- **Flash + focus** — the overlay confirms which window was targeted, reducing "did that work?" uncertainty
- **Folder picker is cancellable** — `cancelBrowse()` kills the dialog process if the user navigates away
