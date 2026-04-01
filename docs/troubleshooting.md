# Troubleshooting

Pick how you're running Claudia, then follow the steps.

| How you run it | Jump to |
|---|---|
| `npx cldi` | [npx](#npx) |
| Desktop app (Claudia.exe / Claudia.app) | [Standalone](#standalone) |
| Cloned the repo / developing | [Dev](#dev) |

---

## npx

### Server disconnected

The terminal running `npx cldi` was closed or crashed. Restart it:

```bash
npx cldi
```

If it fails to start, check if something else is using the port:

```bash
# macOS / Linux
lsof -i :48901

# Windows
netstat -ano | findstr 48901
```

Kill the conflicting process, then try again.

### Sessions not appearing

Hooks may need reinstalling. The dashboard prompts you automatically, but you can verify manually:

```bash
claude config list hooks
```

Look for entries pointing to `localhost:48901/hook/`. If missing, stop and restart `npx cldi` — it re-registers hooks on startup.

---

## Standalone

### Server disconnected

Close the app completely and reopen it. If the window is stuck:

```bash
# Windows
taskkill /f /im Claudia.exe

# macOS
pkill -f Claudia
```

Then relaunch normally.

### Port conflict

Same check as npx — something else may be on port 48901:

```bash
# macOS / Linux
lsof -i :48901

# Windows
netstat -ano | findstr 48901
```

### Sessions not appearing

Same as npx — verify hooks are installed:

```bash
claude config list hooks
```

Look for entries pointing to `localhost:48901/hook/`.

---

## Dev

### Server disconnected

If you're running from the repo, restart the dev server:

```bash
npm run dev
```

### Build errors

**Bundle fails with import errors**
Run `npm install` first — esbuild needs to be installed.

**SEA build fails with "postject" errors**
Requires Node 22+. On Windows, run from an elevated terminal if signature removal fails.

**Tauri build fails**
- Install Rust: `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`
- Windows: install [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) with "Desktop development with C++".

### Port conflict / sessions not appearing

Same as the sections above — check port 48901 and verify hooks with `claude config list hooks`.

---

## Still stuck?

**Firewall or antivirus** — Some security software blocks localhost connections on non-standard ports. Whitelist port 48901.

**File an issue** — [github.com/RockyHong/Claudia/issues](https://github.com/RockyHong/Claudia/issues)
