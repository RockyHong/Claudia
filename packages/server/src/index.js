import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { ensureDefaults } from "./avatar-storage.js";
import { startStatusPolling, stopStatusPolling } from "./claude-status.js";
import { findDeadWindows, focusTerminal, renameTerminal } from "./focus.js";
import { getGitStatus } from "./git-status.js";
import { transformHookPayload, VALID_HOOK_TYPES } from "./hook-transform.js";
import { getStatusMessage } from "./personality.js";
import { getPreferences } from "./preferences.js";
import { trackProject } from "./project-storage.js";
import { registerApiRoutes } from "./routes-api.js";
import { createSessionTracker } from "./session-tracker.js";
import { createSFX } from "./sfx.js";
import { countPendingAgentInvocations } from "./transcript-scan.js";
import { createUsageClient } from "./usage.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIST =
	process.env.CLAUDIA_WEB_DIST || path.resolve(__dirname, "../../web/dist");

const PORT = process.env.CLAUDIA_PORT || 48901;
const SHUTDOWN_TOKEN_PATH = path.join(
	os.homedir(),
	".claudia",
	"shutdown-token",
);

const sseClients = new Set();
const heldPermissionResponses = new Map();

let usageClient = null;

const tracker = createSessionTracker({
	getGitStatus,
	onStateChange: (update) => {
		const sounds = sfx.getSoundsForUpdate(update.sessions);
		broadcast({
			...update,
			statusMessage: getStatusMessage(update.sessions),
			sfx: sounds.length > 0 ? sounds : undefined,
		});
	},
	onPendingAlert: async (session) => {
		const prefs = await getPreferences();
		if (prefs.autoFocus === false) return;
		focusTerminal(session.displayName, "alert", session.windowHandle);
	},
	onIdleAlert: async (session) => {
		const prefs = await getPreferences();
		if (prefs.autoFocus === false) return;
		focusTerminal(session.displayName, "navigate", session.windowHandle);
	},
});

function getPermissionQueue(sessionId) {
	let queue = heldPermissionResponses.get(sessionId);
	if (!queue) {
		queue = [];
		heldPermissionResponses.set(sessionId, queue);
	}
	return queue;
}

function syncPermissionHead(sessionId) {
	const queue = heldPermissionResponses.get(sessionId);
	const head = queue && queue.length > 0 ? queue[0] : null;
	tracker.setPermissionRequest(sessionId, head ? head.permissionRequest : null);
}

let permissionRequestSeq = 0;
function nextPermissionId() {
	permissionRequestSeq += 1;
	return `pr-${Date.now()}-${permissionRequestSeq}`;
}

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

const ALLOWED_ORIGINS = [`http://localhost:${PORT}`, "http://localhost:5173"];

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

	if (
		event.session.length > 100 ||
		(event.message && event.message.length > 2000)
	) {
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

	// Stop and SubagentStop are the points where idle gating decisions happen.
	// Derive pending Agent invocations from the transcript — authoritative,
	// survives dropped hooks and server downtime.
	if (type === "Stop" || type === "SubagentStop") {
		event.pendingAgents = countPendingAgentInvocations(
			req.body.transcript_path,
		);
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

	// Auto-link: SessionStart and UserPromptSubmit hooks resolve the terminal
	// HWND via inline PowerShell and send it as X-Hook-Window header.
	// SessionStart handles fresh sessions; UserPromptSubmit handles sessions
	// that pre-existed before Claudia started (server restart pickup).
	if (type === "SessionStart" || type === "UserPromptSubmit") {
		const session = tracker.getSession(event.session);
		const windowHeader = req.headers["x-hook-window"] || "";
		if (type === "SessionStart" || (windowHeader && !session?.windowHandle)) {
			console.log(
				`[auto-link] window="${windowHeader}" session=${session?.displayName || "null"} hwnd=${session?.windowHandle}`,
			);
		}
		if (session && !session.windowHandle && windowHeader) {
			const sep = windowHeader.indexOf("|");
			if (sep !== -1) {
				const hwnd = parseInt(windowHeader.slice(0, sep), 10);
				const windowTitle = windowHeader.slice(sep + 1);
				if (hwnd > 0) {
					const result = tracker.linkSessionById(
						event.session,
						hwnd,
						windowTitle,
					);
					if (result?.renamed) {
						renameTerminal(hwnd, result.displayName);
					}
					console.log(
						`[auto-link] linked session=${result?.displayName} hwnd=${hwnd} renamed=${result?.renamed}`,
					);
				}
			}
		}
	}

	// Release held permission responses when session is removed (stopped).
	// Drain the entire queue with plain {ok: true} — the session is gone and
	// Claude Code won't wait on us anymore.
	if (event.state === "stopped" && heldPermissionResponses.has(event.session)) {
		const queue = heldPermissionResponses.get(event.session);
		heldPermissionResponses.delete(event.session);
		for (const entry of queue) {
			entry.res.json({ ok: true });
		}
	}

	// Hold PermissionRequest responses in a FIFO queue per session.
	// The dashboard displays the head; the user decides one at a time.
	if (type === "PermissionRequest") {
		const queue = getPermissionQueue(event.session);
		const id = nextPermissionId();
		const entry = {
			id,
			res,
			permissionRequest: {
				...event.permissionRequest,
				id,
			},
		};
		queue.push(entry);

		// If this is now the head, push it to the tracker so the dashboard updates.
		// If the queue already had items, the head is unchanged — current view stays.
		if (queue[0] === entry) {
			syncPermissionHead(event.session);
		}

		// Remove this entry if the curl connection closes before a decision is made.
		res.on("close", () => {
			const q = heldPermissionResponses.get(event.session);
			if (!q) return;
			const idx = q.indexOf(entry);
			if (idx === -1) return;
			const wasHead = idx === 0;
			q.splice(idx, 1);
			if (q.length === 0) {
				heldPermissionResponses.delete(event.session);
			}
			if (wasHead) {
				syncPermissionHead(event.session);
			}
		});

		return; // Don't respond yet — held until decision or close
	}

	res.json({ ok: true });
});

// Decision endpoint — resolves the head of the session's permission queue
app.post("/api/permission/:sessionId", (req, res) => {
	const { decision } = req.body || {};
	if (decision !== "allow" && decision !== "deny") {
		return res
			.status(400)
			.json({ error: "Invalid decision, must be 'allow' or 'deny'" });
	}

	const queue = heldPermissionResponses.get(req.params.sessionId);
	if (!queue || queue.length === 0) {
		return res
			.status(404)
			.json({ error: "No pending permission request for this session" });
	}

	const entry = queue.shift();
	if (queue.length === 0) {
		heldPermissionResponses.delete(req.params.sessionId);
	}

	const hookOutput = {
		hookSpecificOutput: {
			hookEventName: "PermissionRequest",
			decision:
				decision === "allow"
					? { behavior: "allow" }
					: { behavior: "deny", message: "Denied from Claudia dashboard" },
		},
	};

	entry.res.json(hookOutput);

	// If there's a next permission waiting, surface it to the dashboard.
	// Otherwise clear the field and transition session to busy so state reflects
	// the decision (mirrors the prior single-slot behavior).
	const remaining = heldPermissionResponses.get(req.params.sessionId);
	if (remaining && remaining.length > 0) {
		syncPermissionHead(req.params.sessionId);
	} else {
		tracker.setPermissionRequest(req.params.sessionId, null);
		tracker.handleEvent({ session: req.params.sessionId, state: "busy" });
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
	});
	res.write(`data: ${initial}\n\n`);

	sseClients.add(res);
	req.on("close", () => sseClients.delete(res));
});

// REST endpoint for initial state load
app.get("/api/sessions", (_req, res) => {
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
		} else {
			usageClient = null;
		}
	},
	heldPermissionResponses,
});

// Serve built web UI
app.use(express.static(WEB_DIST));

// --- Window pruning & server lifecycle ---

const WINDOW_CHECK_INTERVAL_MS = 5_000;
let windowCheckRunning = false;

async function pruneDeadLinkedSessions() {
	if (windowCheckRunning) return;
	windowCheckRunning = true;
	try {
		const linked = tracker.getSessions().filter((s) => s.windowHandle);
		if (linked.length === 0) return;

		const dead = await findDeadWindows(linked.map((s) => s.windowHandle));
		for (const session of linked) {
			if (dead.has(session.windowHandle)) {
				console.log(
					`[prune] window closed for "${session.displayName}" (hwnd=${session.windowHandle})`,
				);
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
	const windowCheckInterval = setInterval(
		pruneDeadLinkedSessions,
		WINDOW_CHECK_INTERVAL_MS,
	);
	startStatusPolling();

	const shutdownToken = randomUUID();
	await fs.writeFile(SHUTDOWN_TOKEN_PATH, shutdownToken, { mode: 0o600 });

	return new Promise((resolve) => {
		const server = app.listen(port, "127.0.0.1", () => {
			console.log(`Claudia listening on http://localhost:${port}`);
			resolve(server);
		});

		const shutdown = () => {
			clearInterval(windowCheckInterval);
			stopStatusPolling();
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
