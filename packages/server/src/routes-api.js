// API routes: projects, avatars, focus, launch, browse

import fs from "node:fs/promises";
import path from "node:path";
import { platform } from "node:os";
import express from "express";
import { fileURLToPath } from "node:url";
import { focusTerminal, listTerminalWindows, renameTerminal } from "./focus.js";
import { generateTerminalTitle } from "./terminal-title.js";
import { trackProject, listProjects, removeProject } from "./project-storage.js";
import { spawnSession, browseFolder, cancelBrowse, openFolder, openTerminal } from "./spawner.js";
import { parseMultipart } from "./multipart.js";
import {
  getActiveSetPath,
  listSets,
  getActiveSet,
  createSet,
  updateSet,
  deleteSet,
  setActiveSet,
  isValidSetName,
  getSetPath,
  VALID_FILENAMES,
} from "./avatar-storage.js";
import { readSettings, hasClaudiaHooks, mergeHooks, removeHooks, writeSettings } from "./hooks.js";
import { getPreferences, setPreferences } from "./preferences.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function registerApiRoutes(app, tracker, usageClient) {
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

  app.post("/api/browse/cancel", (req, res) => {
    cancelBrowse();
    res.json({ ok: true });
  });

  app.get("/api/usage", (req, res) => {
    const usage = usageClient ? usageClient.getUsage() : null;
    if (!usage) return res.status(204).end();
    res.json(usage);
  });

  // --- Hooks API ---

  app.get("/api/hooks/status", async (req, res) => {
    try {
      const settings = await readSettings();
      const installed = hasClaudiaHooks(settings);
      res.json({ installed });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/hooks/install", async (req, res) => {
    try {
      const settings = await readSettings();
      const merged = mergeHooks(settings);
      await writeSettings(merged);
      res.json({ success: true });
    } catch (err) {
      res.json({ success: false, error: err.message });
    }
  });

  app.post("/api/hooks/remove", async (req, res) => {
    try {
      const settings = await readSettings();
      const cleaned = removeHooks(settings);
      await writeSettings(cleaned);
      res.json({ success: true });
    } catch (err) {
      res.json({ success: false, error: err.message });
    }
  });

  // --- Preferences API ---

  app.get("/api/preferences", async (req, res) => {
    const prefs = await getPreferences();
    res.json(prefs);
  });

  app.patch("/api/preferences", async (req, res) => {
    if (!req.body || typeof req.body !== "object") {
      return res.status(400).json({ error: "Invalid body" });
    }
    const prefs = await setPreferences(req.body);
    res.json(prefs);
  });

  app.post("/api/open-folder", (req, res) => {
    const { cwd } = req.body;
    if (!cwd || typeof cwd !== "string") {
      return res.status(400).json({ error: "Missing cwd" });
    }
    try {
      openFolder(cwd);
      res.status(204).end();
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/open-terminal", (req, res) => {
    const { cwd } = req.body;
    if (!cwd || typeof cwd !== "string") {
      return res.status(400).json({ error: "Missing cwd" });
    }
    try {
      openTerminal(cwd);
      res.status(204).end();
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

  app.put("/api/avatars/sets/:name", async (req, res) => {
    const { name } = req.params;
    if (!isValidSetName(name)) {
      return res.status(400).json({ error: "Invalid set name" });
    }

    const contentType = req.headers["content-type"] || "";
    let files = [];
    let rename;

    if (contentType.startsWith("multipart/form-data")) {
      const parsed = await parseMultipart(req);
      files = parsed.filter((f) => VALID_FILENAMES.has(f.name));
      // Extract rename from text fields if present
      const renameField = parsed.find((f) => f.name === "rename");
      if (renameField) rename = renameField.data.toString().trim();
    } else {
      // JSON body for rename-only
      rename = req.body?.rename;
    }

    if (!rename && files.length === 0) {
      return res.status(400).json({ error: "No changes provided" });
    }

    try {
      await updateSet(name, { rename, files });
      res.json({ ok: true, name: rename || name });
    } catch (err) {
      const status = err.message.includes("not found") ? 404
        : err.message.includes("already exists") ? 409
        : 400;
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
      const status = err.message.includes("default") ? 400 : 404;
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

  // --- Terminal linking API ---

  app.get("/api/terminals", async (req, res) => {
    const supported = platform() === "win32";
    if (!supported) {
      return res.json({ terminals: [], supported: false });
    }
    const excludeHandles = tracker.getLinkedHandles();
    const terminals = await listTerminalWindows(excludeHandles);
    res.json({ terminals, supported: true });
  });

  app.post("/api/link/:sessionId", async (req, res) => {
    const session = tracker.getSession(req.params.sessionId);
    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }
    if (session.spawned) {
      return res.status(400).json({ error: "Session already linked" });
    }
    const { windowHandle } = req.body;
    if (!windowHandle || typeof windowHandle !== "number") {
      return res.status(400).json({ error: "Missing windowHandle" });
    }

    const terminalTitle = generateTerminalTitle(session.cwd);
    await renameTerminal(windowHandle, terminalTitle);
    tracker.linkSessionById(req.params.sessionId, terminalTitle, windowHandle);

    // Flash the terminal to confirm the link visually (fire-and-forget)
    focusTerminal(terminalTitle, "navigate", windowHandle);

    console.log(`[link] session=${session.displayName} title=${terminalTitle} hwnd=${windowHandle}`);
    res.json({ ok: true, terminalTitle });
  });

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
}
