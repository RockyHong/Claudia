import { fileURLToPath } from "node:url";
import path from "node:path";
import express from "express";
import { createSessionTracker } from "./session-tracker.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIST = path.resolve(__dirname, "../../web/dist");

const PORT = process.env.CLAUDIA_PORT || 7890;

const sseClients = new Set();

const tracker = createSessionTracker({
  onStateChange: (update) => broadcast(update),
});

function broadcast(update) {
  const data = JSON.stringify(update);
  for (const res of sseClients) {
    res.write(`data: ${data}\n\n`);
  }
}

const app = express();
app.use(express.json());

// CORS for local Vite dev server
app.use((req, res, next) => {
  res.set({
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// Receive hook events from Claude Code
app.post("/event", (req, res) => {
  const event = req.body;
  if (!event || !event.session || !event.state) {
    return res.status(400).json({ error: "Missing session or state" });
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
  const initial = JSON.stringify({
    sessions: tracker.getSessions(),
    aggregateState: tracker.getAggregateState(),
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
app.post("/focus/:sessionId", (req, res) => {
  const session = tracker
    .getSessions()
    .find((s) => s.id === req.params.sessionId);
  if (!session) {
    return res.status(404).json({ error: "Session not found" });
  }
  // TODO: call focus.js strategy
  res.json({ ok: true, message: "Focus not yet implemented" });
});

export function startServer(port = PORT) {
  tracker.start();

  return new Promise((resolve) => {
    const server = app.listen(port, () => {
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
