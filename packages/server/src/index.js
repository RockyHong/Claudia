import { fileURLToPath } from "node:url";
import path from "node:path";
import express from "express";
import { createSessionTracker } from "./session-tracker.js";
import { getStatusMessage } from "./personality.js";
import { focusTerminal } from "./focus.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIST = path.resolve(__dirname, "../../web/dist");

const PORT = process.env.CLAUDIA_PORT || 7890;

const sseClients = new Set();

const tracker = createSessionTracker({
  onStateChange: (update) => {
    broadcast({ ...update, statusMessage: getStatusMessage(update.sessions) });
  },
});

function broadcast(update) {
  const data = JSON.stringify(update);
  for (const res of sseClients) {
    res.write(`data: ${data}\n\n`);
  }
}

const app = express();
app.use(express.json({ limit: "10kb" }));

const ALLOWED_ORIGINS = [
  `http://localhost:${PORT}`,
  "http://localhost:5173",
];

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.set("Access-Control-Allow-Origin", origin);
  }
  res.set({
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

const MAX_SESSIONS = 100;
const VALID_STATES = new Set(["working", "idle", "pending", "stopped"]);

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
    !tracker.getSessions().some((s) => s.id === event.session) &&
    tracker.getSessions().length >= MAX_SESSIONS
  ) {
    return res.status(429).json({ error: "Too many sessions" });
  }

  tracker.handleEvent(event);
  res.json({ ok: true });
});

// SSE stream for browser UI
app.get("/events", (req, res) => {
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

// Serve built web UI
app.use(express.static(WEB_DIST));

// Trigger terminal focus for a session
app.post("/focus/:sessionId", async (req, res) => {
  const session = tracker
    .getSessions()
    .find((s) => s.id === req.params.sessionId);
  if (!session) {
    return res.status(404).json({ error: "Session not found" });
  }
  const focused = await focusTerminal(session.displayName);
  res.json({ ok: true, focused });
});

export function startServer(port = PORT) {
  tracker.start();

  return new Promise((resolve) => {
    const server = app.listen(port, "127.0.0.1", () => {
      console.log(`Claudia listening on http://localhost:${port}`);
      resolve(server);
    });

    const shutdown = () => {
      tracker.stop();
      for (const client of sseClients) {
        client.end();
      }
      sseClients.clear();
      server.close();
    };

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
