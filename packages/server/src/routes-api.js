// API routes: projects, avatars, focus, launch, browse

import fs from "node:fs/promises";

import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import {
	createSet,
	deleteSet,
	exportSet,
	getActiveSet,
	getActiveSetPath,
	getAvatarsDir,
	getSetPath,
	importSet,
	isValidSetName,
	listSets,
	setActiveSet,
	updateSet,
	VALID_FILENAMES,
} from "./avatar-storage.js";
import { getCachedStatus } from "./claude-status.js";
import { focusTerminal } from "./focus.js";
import {
	hasClaudiaHooks,
	mergeHooks,
	readSettings,
	removeHooks,
	writeSettings,
} from "./hooks.js";
import { buildMdTree, readMdFile } from "./md-files.js";
import { parseMultipart } from "./multipart.js";
import { getPreferences, setPreferences } from "./preferences.js";
import {
	listProjects,
	removeProject,
	trackProject,
} from "./project-storage.js";
import {
	browseFolder,
	cancelBrowse,
	openFolder,
	openTerminal,
	openUrl,
	spawnSession,
} from "./spawner.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function registerApiRoutes(app, tracker, options = {}) {
	const { heldPermissionResponses } = options;
	const services = options;
	// --- Projects API ---

	app.get("/api/projects", async (_req, res) => {
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

	app.post("/api/browse", async (_req, res) => {
		try {
			const selected = await browseFolder();
			if (!selected) return res.json({ cancelled: true });
			res.json({ path: selected });
		} catch (err) {
			res.status(500).json({ error: err.message });
		}
	});

	app.post("/api/browse/cancel", (_req, res) => {
		cancelBrowse();
		res.json({ ok: true });
	});

	app.get("/api/usage", async (_req, res) => {
		const client = services.getUsageClient();
		if (!client) return res.status(204).end();
		const usage = await client.refreshUsage();
		if (!usage) return res.status(204).end();
		res.json(usage);
	});

	// --- Hooks API ---

	app.get("/api/hooks/status", async (_req, res) => {
		try {
			const settings = await readSettings();
			const installed = hasClaudiaHooks(settings);
			res.json({ installed });
		} catch (err) {
			res.status(500).json({ error: err.message });
		}
	});

	app.post("/api/hooks/install", async (_req, res) => {
		try {
			const settings = await readSettings();
			const merged = mergeHooks(settings);
			await writeSettings(merged);
			res.json({ success: true });
		} catch (err) {
			res.json({ success: false, error: err.message });
		}
	});

	app.post("/api/hooks/remove", async (_req, res) => {
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

	app.get("/api/preferences", async (_req, res) => {
		const prefs = await getPreferences();
		res.json(prefs);
	});

	app.patch("/api/preferences", async (req, res) => {
		if (!req.body || typeof req.body !== "object") {
			return res.status(400).json({ error: "Invalid body" });
		}
		const prefs = await setPreferences(req.body);
		if ("usageMonitoring" in req.body && services.onUsageMonitoringChange) {
			services.onUsageMonitoringChange(prefs.usageMonitoring);
		}
		res.json(prefs);
	});

	app.post("/api/open-url", (req, res) => {
		const { url } = req.body;
		if (!url || typeof url !== "string") {
			return res.status(400).json({ error: "Missing url" });
		}
		try {
			openUrl(url);
			res.status(204).end();
		} catch (err) {
			res.status(500).json({ error: err.message });
		}
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
			console.log(
				`[spawn] cwd=${cwd} title=${terminalTitle} hwnd=${windowHandle}`,
			);
			tracker.storeSpawnedInfo(cwd, terminalTitle, windowHandle);
			await trackProject(cwd);

			res.json({ ok: true });
		} catch (err) {
			res.status(500).json({ error: err.message });
		}
	});

	// --- Avatar set API ---

	app.get("/api/avatars/sets", async (_req, res) => {
		const sets = await listSets();
		res.json({ sets });
	});

	app.get("/api/avatars/active", async (_req, res) => {
		const activeSet = await getActiveSet();
		res.json({ activeSet });
	});

	app.get("/api/avatars/formats", async (_req, res) => {
		const setPath = await getActiveSetPath();
		const results = {};
		try {
			const files = await fs.readdir(setPath);
			for (const file of files) {
				if (!VALID_FILENAMES.has(file)) continue;
				const [state, ext] = file.split(".");
				if (!results[state]) results[state] = { webm: false, mp4: false };
				results[state][ext] = true;
			}
		} catch {
			// Set directory missing — no avatars available
		}
		res.json(results);
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
			const status = err.message.includes("not found")
				? 404
				: err.message.includes("already exists")
					? 409
					: 400;
			res.status(status).json({ error: err.message });
		}
	});

	app.delete("/api/avatars/sets/:name", async (req, res) => {
		const { name } = req.params;
		if (!isValidSetName(name))
			return res.status(400).json({ error: "Invalid set name" });
		try {
			await deleteSet(name);
			res.json({ ok: true });
		} catch (err) {
			const status = err.message.includes("default") ? 400 : 404;
			res.status(status).json({ error: err.message });
		}
	});

	app.get("/api/avatars/sets/:name/export", async (req, res) => {
		const { name } = req.params;
		if (!isValidSetName(name))
			return res.status(400).json({ error: "Invalid set name" });

		try {
			const zipBuffer = await exportSet(name);
			res.set({
				"Content-Type": "application/zip",
				"Content-Disposition": `attachment; filename="${name}.claudia"`,
				"Content-Length": zipBuffer.length,
			});
			res.send(zipBuffer);
		} catch (err) {
			const status = err.message.includes("not found") ? 404 : 500;
			res.status(status).json({ error: err.message });
		}
	});

	app.post("/api/avatars/import", async (req, res) => {
		const chunks = [];
		let totalSize = 0;
		const MAX_IMPORT_SIZE = 20 * 1024 * 1024;

		req.on("data", (chunk) => {
			totalSize += chunk.length;
			if (totalSize > MAX_IMPORT_SIZE) {
				req.destroy();
				return;
			}
			chunks.push(chunk);
		});

		req.on("end", async () => {
			if (totalSize > MAX_IMPORT_SIZE) {
				return res.status(400).json({ error: "File is too large" });
			}

			const zipBuffer = Buffer.concat(chunks);

			// Derive set name from the filename query param
			const filename = req.query.name || "imported";
			const setName = filename.replace(/\.claudia$/i, "");

			try {
				const result = await importSet(setName, zipBuffer);
				res.json({ ok: true, name: result.name });
			} catch (err) {
				res.status(400).json({ error: err.message });
			}
		});

		req.on("error", () => {
			if (!res.headersSent) {
				res.status(500).json({ error: "Upload failed" });
			}
		});
	});

	app.post("/api/avatars/open-folder", (_req, res) => {
		try {
			openFolder(getAvatarsDir());
			res.status(204).end();
		} catch (err) {
			res.status(500).json({ error: err.message });
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

	// --- Markdown viewer API ---

	app.get("/api/md/tree", async (req, res) => {
		const { cwd } = req.query;
		if (!cwd || typeof cwd !== "string") {
			return res.status(400).json({ error: "Missing cwd" });
		}
		try {
			const tree = await buildMdTree(cwd);
			res.json({ tree });
		} catch (err) {
			res.status(500).json({ error: err.message });
		}
	});

	app.get("/api/md/file", async (req, res) => {
		const { cwd, path: filePath } = req.query;
		if (!cwd || !filePath) {
			return res.status(400).json({ error: "Missing cwd or path" });
		}
		try {
			const result = await readMdFile(cwd, filePath);
			res.json(result);
		} catch (err) {
			if (err.code === "ENOENT") {
				return res.status(404).json({ error: "File not found" });
			}
			res.status(400).json({ error: err.message });
		}
	});

	// --- Claude platform status ---

	app.get("/api/claude-status", (_req, res) => {
		const status = getCachedStatus();
		if (!status) return res.status(204).end();
		res.json(status);
	});

	// Trigger terminal focus for a session
	app.post("/focus/:sessionId", async (req, res) => {
		const session = tracker.getSession(req.params.sessionId);
		if (!session) {
			return res.status(404).json({ error: "Session not found" });
		}
		console.log(
			`[focus] session=${session.displayName} spawned=${session.spawned} hwnd=${session.windowHandle}`,
		);
		const focused = await focusTerminal(
			session.displayName,
			"navigate",
			session.windowHandle,
		);
		res.json({ ok: true, focused });
	});
}
