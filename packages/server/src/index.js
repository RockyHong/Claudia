import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import express from "express";
import { createSessionTracker } from "./session-tracker.js";
import { getStatusMessage } from "./personality.js";
import { focusTerminal, findDeadWindows } from "./focus.js";
import { getGitStatus } from "./git-status.js";
import { trackProject } from "./project-storage.js";
import { transformHookPayload, VALID_HOOK_TYPES } from "./hook-transform.js";
import { ensureDefaults } from "./avatar-storage.js";
import { registerApiRoutes } from "./routes-api.js";
import { createUsageClient } from "./usage.js";
import { createSFX } from "./sfx.js";
import { getPreferences } from "./preferences.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIST = process.env.CLAUDIA_WEB_DIST || path.resolve(__dirname, "../../web/dist");

const PORT = process.env.CLAUDIA_PORT || 48901;
const SHUTDOWN_TOKEN_PATH = path.join(os.homedir(), ".claudia", "shutdown-token");

const sseClients = new Set();

let usageClient = null;

const tracker = createSessionTracker({
  getGitStatus,
  onStateChange: (update) => {
    if (usageClient) usageClient.refreshUsage().catch(() => {});
    const sounds = sfx.getSoundsForUpdate(update.sessions);
    broadcast({
      ...update,
      statusMessage: getStatusMessage(update.sessions),
      usage: usageClient ? usageClient.getUsage() : null,
      sfx: sounds.length > 0 ? sounds : undefined,
    });
  },
  onPendingAlert: (session) => {
    focusTerminal(session.displayName, "alert", session.windowHandle);
  },
  onIdleAlert: (session) => {
    focusTerminal(session.displayName, "navigate", session.windowHandle);
  },
});

const sfx = createSFX();

function broadcast(update) {
  const data = JSON.stringify(update);
  for (const res of Array.from(sseClients)) {
    if (res.writableEnded || res.destroyed) {
      sseClients.delete(res);
      continue;
    }
    res.write(`data: ${data}\n\n`, (err) => {
      if (err) {
        sseClients.delete(res);
        res.end();
      }
    });
  }
}

function broadcastSfx(sound) {
  const data = JSON.stringify({ sfx: [sound] });
  for (const res of Array.from(sseClients)) {
    if (res.writableEnded || res.destroyed) {
      sseClients.delete(res);
      continue;
    }
    res.write(`data: ${data}\n\n`, (err) => {
      if (err) {
        sseClients.delete(res);
        res.end();
      }
    });
  }
}

const app = express();
app.use(express.json({ limit: "1mb" }));

const ALLOWED_ORIGINS = [
  `http://localhost:${PORT}`,
  "http://localhost:5173",
];

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.set({
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    if (req.method === "OPTIONS") return res.sendStatus(204);
  }
  next();
});

const MAX_SESSIONS = 100;
const MAX_SSE_CLIENTS = 50;
const VALID_STATES = new Set(["busy", "idle", "pending", "stopped"]);

// Receive hook events from Claude Code
app.post("/event", (req, res) => {
  const event = req.body;
  if (
    !event ||
    typeof event.session !== "string" ||
    typeof event.state !== "string"
  ) {
    return res.status(400).json({ error: "Missing or invalid session/state" });
  }

  if (!VALID_STATES.has(event.state)) {
    return res.status(400).json({ error: "Invalid state" });
  }

  if (event.session.length > 100 || (event.message && event.message.length > 2000)) {
    return res.status(400).json({ error: "Field too long" });
  }

  if (
    event.state !== "stopped" &&
    !tracker.getSession(event.session) &&
    tracker.getSessions().length >= MAX_SESSIONS
  ) {
    return res.status(429).json({ error: "Too many sessions" });
  }

  tracker.handleEvent(event);
  if (event.cwd) trackProject(event.cwd);
  res.json({ ok: true });
});

// Receive raw Claude Code stdin JSON — server-side transform, no node cold start
app.post("/hook/:type", (req, res) => {
  const { type } = req.params;
  if (!VALID_HOOK_TYPES.has(type)) {
    return res.status(400).json({ error: "Unknown hook type" });
  }

  const event = transformHookPayload(type, req.body);
  if (!event) {
    return res.status(400).json({ error: "Invalid payload" });
  }

  if (
    event.state !== "stopped" &&
    !tracker.getSession(event.session) &&
    tracker.getSessions().length >= MAX_SESSIONS
  ) {
    return res.status(429).json({ error: "Too many sessions" });
  }

  tracker.handleEvent(event);
  if (event.cwd) trackProject(event.cwd);
  if (type === "UserPromptSubmit") {
    broadcastSfx("send");
  }
  res.json({ ok: true });
});

// SSE stream for browser UI
app.get("/events", (req, res) => {
  if (sseClients.size >= MAX_SSE_CLIENTS) {
    return res.status(503).json({ error: "Too many connections" });
  }
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.flushHeaders();

  // Send current state immediately on connect
  const sessions = tracker.getSessions();
  const initial = JSON.stringify({
    sessions,
    aggregateState: tracker.getAggregateState(),
    statusMessage: getStatusMessage(sessions),
    usage: usageClient ? usageClient.getUsage() : null,
  });
  res.write(`data: ${initial}\n\n`);

  sseClients.add(res);
  req.on("close", () => sseClients.delete(res));
});

// REST endpoint for initial state load
app.get("/api/sessions", (req, res) => {
  res.json({
    sessions: tracker.getSessions(),
    aggregateState: tracker.getAggregateState(),
  });
});

// Register API routes (projects, avatars, focus, launch)
registerApiRoutes(app, tracker, {
  getUsageClient: () => usageClient,
  onUsageMonitoringChange: (enabled) => {
    if (enabled) {
      usageClient = createUsageClient();
      usageClient.refreshUsage().catch(() => {});
    } else {
      usageClient = null;
    }
  },
});

// Serve built web UI
app.use(express.static(WEB_DIST));

// --- Window pruning & server lifecycle ---

const WINDOW_CHECK_INTERVAL_MS = 5_000;
let windowCheckRunning = false;

async function pruneDeadSpawnedSessions() {
  if (windowCheckRunning) return;
  windowCheckRunning = true;
  try {
    const spawned = tracker.getSessions().filter((s) => s.spawned && s.windowHandle);
    if (spawned.length === 0) return;

    const dead = await findDeadWindows(spawned.map((s) => s.windowHandle));
    for (const session of spawned) {
      if (dead.has(session.windowHandle)) {
        console.log(`[prune] window closed for "${session.displayName}" (hwnd=${session.windowHandle})`);
        tracker.handleEvent({ session: session.id, state: "stopped" });
      }
    }
  } finally {
    windowCheckRunning = false;
  }
}

export async function startServer(port = PORT, options = {}) {
  const { managed = false } = options;

  if (managed) {
    const { setManaged } = await import("./spawner.js");
    const { createJobObject } = await import("./job-object.js");
    const { setJobHandle } = await import("./lifecycle.js");

    setManaged(true);
    const handle = createJobObject();
    if (handle && handle !== "0") {
      setJobHandle(handle);
      console.log(`[lifecycle] Job Object created (handle=${handle})`);
    }
  }

  await ensureDefaults();
  tracker.start();
  const prefs = await getPreferences();
  if (prefs.usageMonitoring === true) {
    usageClient = createUsageClient();
    usageClient.refreshUsage().catch(() => {});
  }
  const windowCheckInterval = setInterval(pruneDeadSpawnedSessions, WINDOW_CHECK_INTERVAL_MS);

  const shutdownToken = randomUUID();
  await fs.writeFile(SHUTDOWN_TOKEN_PATH, shutdownToken, { mode: 0o600 });

  return new Promise((resolve) => {
    const server = app.listen(port, "127.0.0.1", () => {
      console.log(`Claudia listening on http://localhost:${port}`);
      resolve(server);
    });

    const shutdown = () => {
      clearInterval(windowCheckInterval);
      tracker.stop();
      for (const client of sseClients) {
        client.end();
      }
      sseClients.clear();
      server.close(() => process.exit(0));
    };

    // Remote shutdown — lets a new instance replace this one
    app.post("/api/shutdown", (req, res) => {
      if (!req.body || req.body.token !== shutdownToken) {
        return res.status(401).json({ error: "Invalid token" });
      }
      res.json({ ok: true });
      setTimeout(() => process.exit(0), 100);
    });

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  });
}

// Run directly if this is the entry point
const isDirectRun =
  process.argv[1] &&
  import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/"));
if (isDirectRun) {
  startServer();
}

export { app, tracker };
