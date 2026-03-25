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
import { trackProject, listProjects, removeProject } from "./project-storage.js";
import { spawnSession, browseFolder } from "./spawner.js";
import { transformHookPayload, VALID_HOOK_TYPES } from "./hook-transform.js";
import {
  getActiveSetPath,
  listSets,
  getActiveSet,
  createSet,
  deleteSet,
  setActiveSet,
  ensureDefaults,
  isValidSetName,
  getSetPath,
  VALID_FILENAMES,
} from "./avatar-storage.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIST = path.resolve(__dirname, "../../web/dist");

const PORT = process.env.CLAUDIA_PORT || 7890;
const SHUTDOWN_TOKEN_PATH = path.join(os.homedir(), ".claudia", "shutdown-token");

const sseClients = new Set();

const tracker = createSessionTracker({
  getGitStatus,
  onStateChange: (update) => {
    broadcast({ ...update, statusMessage: getStatusMessage(update.sessions) });
  },
  onPendingAlert: (session) => {
    focusTerminal(session.displayName, "alert", session.windowHandle);
  },
  onIdleAlert: (session) => {
    focusTerminal(session.displayName, "navigate", session.windowHandle);
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
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  if (req.method === "OPTIONS") return res.sendStatus(204);
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

  if (type === "Notification" || type === "Stop" || type === "SessionEnd") {
    console.log(`[hook] ${type} stdin:`, JSON.stringify(req.body));
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

// --- Projects API ---

app.get("/api/projects", async (req, res) => {
  const projects = await listProjects();
  res.json({ projects });
});

app.delete("/api/projects", async (req, res) => {
  const { path: projectPath } = req.body;
  if (!projectPath || typeof projectPath !== "string") {
    return res.status(400).json({ error: "Missing path" });
  }
  await removeProject(projectPath);
  res.json({ ok: true });
});

app.post("/api/browse", async (req, res) => {
  try {
    const selected = await browseFolder();
    if (!selected) return res.json({ cancelled: true });
    res.json({ path: selected });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/launch", async (req, res) => {
  const { cwd } = req.body;
  if (!cwd || typeof cwd !== "string") {
    return res.status(400).json({ error: "Missing cwd" });
  }

  try {
    await fs.access(cwd);
  } catch {
    return res.status(400).json({ error: "Directory not found" });
  }

  try {
    const { terminalTitle, windowHandle } = await spawnSession(cwd);
    console.log(`[spawn] cwd=${cwd} title=${terminalTitle} hwnd=${windowHandle}`);
    tracker.storeSpawnedInfo(cwd, terminalTitle, windowHandle);
    await trackProject(cwd);

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Avatar set API ---

app.get("/api/avatars/sets", async (req, res) => {
  const sets = await listSets();
  res.json({ sets });
});

app.get("/api/avatars/active", async (req, res) => {
  const activeSet = await getActiveSet();
  res.json({ activeSet });
});

app.put("/api/avatars/active", async (req, res) => {
  const { set } = req.body;
  if (!set || typeof set !== "string") {
    return res.status(400).json({ error: "Missing set name" });
  }
  try {
    await setActiveSet(set);
    res.json({ ok: true, activeSet: set });
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

app.post("/api/avatars/sets/:name", async (req, res) => {
  const { name } = req.params;
  if (!isValidSetName(name)) {
    return res.status(400).json({ error: "Invalid set name" });
  }

  const contentType = req.headers["content-type"] || "";
  if (!contentType.startsWith("multipart/form-data")) {
    return res.status(400).json({ error: "Expected multipart/form-data" });
  }

  try {
    const files = await parseMultipart(req);
    if (files.length === 0) {
      return res.status(400).json({ error: "No files uploaded" });
    }
    await createSet(name, files);
    res.json({ ok: true, name });
  } catch (err) {
    const status = err.message.includes("already exists") ? 409 : 400;
    res.status(status).json({ error: err.message });
  }
});

app.delete("/api/avatars/sets/:name", async (req, res) => {
  const { name } = req.params;
  if (!isValidSetName(name)) return res.status(400).json({ error: "Invalid set name" });
  try {
    await deleteSet(name);
    res.json({ ok: true });
  } catch (err) {
    const status = err.message.includes("active") ? 400 : 404;
    res.status(status).json({ error: err.message });
  }
});

// Serve a specific file from any avatar set (for thumbnails)
app.get("/api/avatars/sets/:name/file/:filename", (req, res) => {
  const { name, filename } = req.params;
  if (!isValidSetName(name)) return res.sendStatus(400);
  if (!VALID_FILENAMES.has(filename)) return res.sendStatus(400);
  res.sendFile(filename, { root: getSetPath(name) }, (err) => {
    if (err && !res.headersSent) res.sendStatus(404);
  });
});

// Serve avatar files from the active set in ~/.claudia/avatars/
let cachedAvatarStatic = null;
let cachedAvatarDir = null;

async function getAvatarMiddleware() {
  const dir = await getActiveSetPath();
  if (dir !== cachedAvatarDir) {
    cachedAvatarDir = dir;
    cachedAvatarStatic = express.static(dir);
  }
  return cachedAvatarStatic;
}

app.use("/avatar", async (req, res, next) => {
  try {
    const middleware = await getAvatarMiddleware();
    middleware(req, res, next);
  } catch {
    next();
  }
});

// Serve sound effects from assets/sfx/
const SFX_DIR = path.resolve(__dirname, "../assets/sfx");
app.use("/sfx", express.static(SFX_DIR));

// Temporary SFX preview page
app.get("/sfx-preview", (req, res) => {
  res.type("html").send(/* html */ `<!DOCTYPE html>
<html><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>Claudia SFX Preview</title>
<style>
  * { margin: 0; box-sizing: border-box; }
  body { font-family: system-ui, sans-serif; background: #0f1117; color: #e1e4ed; padding: 40px 20px; }
  h1 { font-size: 20px; margin-bottom: 24px; }
  .grid { display: flex; flex-direction: column; gap: 16px; max-width: 400px; }
  .row { display: flex; align-items: center; gap: 12px; }
  .label { width: 80px; font-size: 14px; color: #8b8fa3; }
  button { background: #1a1d27; border: 1px solid #2a2d3a; border-radius: 8px; padding: 10px 20px;
    color: #e1e4ed; font-size: 14px; cursor: pointer; transition: all 0.15s; }
  button:hover { background: #2a2d3a; }
  button:active { transform: scale(0.97); }
  .synth { border-color: #3b82f6; }
  .file { border-color: #22c55e; }
  .note { margin-top: 24px; font-size: 12px; color: #6b7280; }
  .volume { display: flex; align-items: center; gap: 8px; margin-bottom: 20px; font-size: 13px; color: #8b8fa3; }
  input[type=range] { width: 150px; }
</style>
</head><body>
<h1>SFX Preview</h1>
<div class="volume">Volume: <input type="range" id="vol" min="0" max="1" step="0.05" value="0.5"> <span id="vol-label">0.5</span></div>
<div class="grid">
  <div class="row"><span class="label">Pending</span>
    <button class="synth" onclick="synthPending()">Synth</button>
    <button class="file" onclick="playFile('pending')">MP3</button></div>
  <div class="row"><span class="label">Busy</span>
    <button class="synth" onclick="synthBusy()">Synth</button>
    <button class="file" onclick="playFile('busy')">MP3</button></div>
  <div class="row"><span class="label">Idle</span>
    <button class="synth" onclick="synthIdle()">Synth</button>
    <button class="file" onclick="playFile('idle')">MP3</button></div>
</div>
<p class="note">Synth = Web Audio fallback. MP3 = file from /sfx/ (may 404 if not uploaded yet).</p>
<script>
const volEl = document.getElementById('vol');
const volLabel = document.getElementById('vol-label');
volEl.oninput = () => { volLabel.textContent = volEl.value; };
function vol() { return parseFloat(volEl.value); }

let ctx;
function getCtx() {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function synthPending() {
  const c = getCtx(), now = c.currentTime, v = vol();
  const g1 = c.createGain(); g1.connect(c.destination);
  g1.gain.setValueAtTime(v*0.8, now); g1.gain.exponentialRampToValueAtTime(0.001, now+0.6);
  const o1 = c.createOscillator(); o1.type='sine'; o1.frequency.setValueAtTime(659.25, now);
  o1.connect(g1); o1.start(now); o1.stop(now+0.3);
  const g2 = c.createGain(); g2.connect(c.destination);
  g2.gain.setValueAtTime(0.001, now); g2.gain.setValueAtTime(v*0.8, now+0.15);
  g2.gain.exponentialRampToValueAtTime(0.001, now+0.6);
  const o2 = c.createOscillator(); o2.type='sine'; o2.frequency.setValueAtTime(880, now+0.15);
  o2.connect(g2); o2.start(now+0.15); o2.stop(now+0.6);
}

function synthBusy() {
  const c = getCtx(), now = c.currentTime, v = vol(), dur = 0.6;
  const bufSz = Math.ceil(c.sampleRate*dur), buf = c.createBuffer(1, bufSz, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i=0; i<bufSz; i++) d[i] = Math.random()*2-1;
  const n = c.createBufferSource(); n.buffer = buf;
  const f = c.createBiquadFilter(); f.type='lowpass';
  f.frequency.setValueAtTime(4000,now); f.frequency.setTargetAtTime(500,now,dur*0.3); f.Q.setValueAtTime(0.7,now);
  const g = c.createGain(); g.gain.setValueAtTime(0.001,now);
  g.gain.linearRampToValueAtTime(v*0.5,now+0.08); g.gain.exponentialRampToValueAtTime(0.001,now+dur);
  n.connect(f); f.connect(g); g.connect(c.destination); n.start(now); n.stop(now+dur);
}

function synthIdle() {
  const c = getCtx(), now = c.currentTime, v = vol();
  const g1 = c.createGain(); g1.connect(c.destination);
  g1.gain.setValueAtTime(v*0.8, now); g1.gain.exponentialRampToValueAtTime(0.001, now+0.6);
  const o1 = c.createOscillator(); o1.type='sine'; o1.frequency.setValueAtTime(880, now);
  o1.connect(g1); o1.start(now); o1.stop(now+0.3);
  const g2 = c.createGain(); g2.connect(c.destination);
  g2.gain.setValueAtTime(0.001, now); g2.gain.setValueAtTime(v*0.8, now+0.15);
  g2.gain.exponentialRampToValueAtTime(0.001, now+0.6);
  const o2 = c.createOscillator(); o2.type='sine'; o2.frequency.setValueAtTime(659.25, now+0.15);
  o2.connect(g2); o2.start(now+0.15); o2.stop(now+0.6);
}

function playFile(name) {
  const a = new Audio('/sfx/' + name + '.mp3');
  a.volume = vol();
  a.play().catch(e => alert('No MP3 file found for ' + name));
}
</script>
</body></html>`);
});

// Serve built web UI
app.use(express.static(WEB_DIST));

// Trigger terminal focus for a session
app.post("/focus/:sessionId", async (req, res) => {
  const session = tracker.getSession(req.params.sessionId);
  if (!session) {
    return res.status(404).json({ error: "Session not found" });
  }
  console.log(`[focus] session=${session.displayName} spawned=${session.spawned} hwnd=${session.windowHandle}`);
  const focused = await focusTerminal(
    session.displayName,
    "navigate",
    session.windowHandle,
  );
  res.json({ ok: true, focused });
});

// Minimal multipart/form-data parser (no dependencies)

function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const contentType = req.headers["content-type"] || "";
    const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^\s;]+))/);
    if (!boundaryMatch) return reject(new Error("No boundary found"));
    const boundary = boundaryMatch[1] || boundaryMatch[2];

    const chunks = [];
    let totalSize = 0;
    const maxTotal = 20 * 1024 * 1024;

    req.on("data", (chunk) => {
      totalSize += chunk.length;
      if (totalSize > maxTotal) {
        req.destroy();
        return reject(new Error("Upload too large"));
      }
      chunks.push(chunk);
    });

    req.on("end", () => {
      try {
        const files = extractParts(Buffer.concat(chunks), boundary);
        resolve(files);
      } catch (err) {
        reject(err);
      }
    });

    req.on("error", reject);
  });
}

function extractParts(body, boundary) {
  const sep = Buffer.from(`--${boundary}`);
  const files = [];
  let start = 0;

  while (true) {
    const sepIdx = body.indexOf(sep, start);
    if (sepIdx === -1) break;

    const partStart = sepIdx + sep.length;
    // Check for closing boundary (--)
    if (body[partStart] === 0x2d && body[partStart + 1] === 0x2d) break;

    const nextSep = body.indexOf(sep, partStart);
    if (nextSep === -1) break;

    const part = body.subarray(partStart, nextSep);
    const headerEnd = part.indexOf("\r\n\r\n");
    if (headerEnd === -1) { start = nextSep; continue; }

    const headerStr = part.subarray(0, headerEnd).toString("utf-8");
    // Extract filename from Content-Disposition
    const filenameMatch = headerStr.match(/filename="([^"]+)"/);
    if (!filenameMatch) { start = nextSep; continue; }

    const filename = filenameMatch[1];
    if (!VALID_FILENAMES.has(filename)) { start = nextSep; continue; }

    // Data starts after \r\n\r\n, strip trailing \r\n before boundary
    let data = part.subarray(headerEnd + 4);
    if (data.length >= 2 && data[data.length - 2] === 0x0d && data[data.length - 1] === 0x0a) {
      data = data.subarray(0, data.length - 2);
    }

    files.push({ name: filename, data });
    start = nextSep;
  }

  return files;
}

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

export async function startServer(port = PORT) {
  await ensureDefaults();
  tracker.start();
  const windowCheckInterval = setInterval(pruneDeadSpawnedSessions, WINDOW_CHECK_INTERVAL_MS);

  const shutdownToken = randomUUID();
  await fs.writeFile(SHUTDOWN_TOKEN_PATH, shutdownToken);

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
      // Force exit after response flushes — closes terminal on Windows
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
