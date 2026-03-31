# Troubleshooting

## Server Disconnected

The Claudia dashboard shows "Server disconnected" when it can't reach the backend. It retries automatically every few seconds.

### Common causes

**Server process died**
- npx: The terminal running `npx claudia` was closed or the process crashed.
- Standalone: The sidecar server crashed while the Tauri window stayed open.

**Port conflict**
- Another process is using port 48901. Check with:
  ```bash
  # Windows
  netstat -ano | findstr 48901

  # macOS / Linux
  lsof -i :48901
  ```

**Firewall or antivirus**
- Some security software blocks localhost connections on non-standard ports.

### How to restart

**npx (terminal)**
```bash
npx claudia
```

**Standalone (desktop app)**
Close the app completely and reopen it. If the window is stuck, kill the process:
```bash
# Windows
taskkill /f /im Claudia.exe

# macOS
pkill -f Claudia
```

### Hooks still installed?

After restarting, Claudia should reconnect and resume tracking. If sessions don't appear, hooks may need reinstalling — the dashboard will prompt you automatically.

You can verify manually:
```bash
claude config list hooks
```

Look for entries pointing to `localhost:48901/hook/`.
