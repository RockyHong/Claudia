import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { ensureDefaults } from "./avatar-storage.js";
import { startStatusPolling, stopStatusPolling } from "./claude-status.js";
import { findDeadWindows, focusTerminal, isWindowsHost } from "./focus.js";
import { getGitStatus } from "./git-status.js";
import { transformHookPayload, VALID_HOOK_TYPES } from "./hook-transform.js";
import { getStatusMessage } from "./personality.js";
import { resolveTerminalWindow } from "./pid-ancestry.js";
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

// Parses the "hwnd|windowTitle" shape of the X-Hook-Window header.
// Returns null when absent, malformed, or the HWND isn't a positive int.
function parseWindowHeader(header) {
	const sep = header.indexOf("|");
	if (sep === -1) return null;
	const hwnd = parseInt(header.slice(0, sep), 10);
	if (!(hwnd > 0)) return null;
	return { hwnd, windowTitle: header.slice(sep + 1) };
}

// Parses the X-Hook-Nested header — the count of `claude` processes the hook's
// own ancestor walk crossed before reaching the first terminal-class process.
// Two or more means this session is nested inside another Claude session
// (dispatched / headless / SDK): its own claude process plus at least one
// ancestor's. Missing, empty, or non-numeric degrades to "not nested" rather
// than erroring.
function isNestedHeader(header) {
	const n = parseInt(header, 10);
	return Number.isFinite(n) && n >= 2;
}

// Both acquisition channels normalize to one { nested, link } signal, so
// admission and auto-link below never learn which one produced it.
//
// Legacy channel — an install predating the server-side resolver keeps sending
// the pre-resolved X-Hook-Window / X-Hook-Nested pair until its hooks are
// reinstalled (docs/work/GAP-001.md), so this path stays live and unchanged.
// It carries no pid, so a session linked this way falls back to window-death
// pruning (see pruneDeadLinkedSessions).
function windowSignalFromHeaders(req) {
	const link = parseWindowHeader(req.headers["x-hook-window"] || "");
	return {
		nested: isNestedHeader(req.headers["x-hook-nested"] || ""),
		link: link ? { ...link, claudePid: null } : null,
	};
}

// Current channel — the hook sends only its shell's Windows pid and the server
// walks it (pid-ancestry.js). A null resolution is the same degrade an empty
// X-Hook-Window carries: admitted, just unlinked.
function windowSignalFromResolution(resolved) {
	if (!resolved) return { nested: false, link: null };
	return {
		nested: resolved.claudeCount >= 2,
		link: {
			hwnd: resolved.hwnd,
			windowTitle: resolved.title,
			claudePid: resolved.claudePid ?? null,
		},
	};
}

// Everything downstream of window acquisition: admission, tracker update,
// auto-link, permission queueing. Called synchronously for hook types that need
// no resolution, and from the resolver's continuation for the two that do.
function completeHookEvent(res, type, event, windowSignal) {
	// Nesting-only admission, Windows only: a registry entry is created for a
	// SessionStart/UserPromptSubmit hook unless the window signal carries
	// positive evidence of nesting (>= 2 claude processes crossed). A signal
	// with no window is NOT refusal grounds — acquisition can come back empty
	// for reasons unrelated to nesting, and failing closed on that would erase
	// a live interactive session's card with no diagnostic. Failing open
	// instead costs at most the ~10-minute unlinked residency pruneStale
	// already reaches (docs/work/BUG-002.md Amendment — pre-commit live
	// verification). Every other hook type updates an existing session only —
	// it never creates one, so a refused id simply never appears and its
	// later PreToolUse/Stop events find nothing to create. Off-Windows,
	// admission stays unconditional — window resolution is Windows-only.
	let allowCreate = true;
	let refusalReason = null;
	if (isWindowsHost()) {
		if (type === "SessionStart" || type === "UserPromptSubmit") {
			allowCreate = !windowSignal.nested;
			if (!allowCreate) refusalReason = "nested";
		} else {
			allowCreate = false;
			refusalReason = "non-header hook type";
		}
		if (!allowCreate && !tracker.getSession(event.session)) {
			console.log(
				`[admission] refused type=${type} session=${event.session} cwd=${event.cwd || "null"} reason=${refusalReason}`,
			);
		}
	}

	tracker.handleEvent(event, { allowCreate });
	if (event.cwd) trackProject(event.cwd);
	if (type === "UserPromptSubmit") {
		broadcastSfx("send");
	}

	// Auto-link: SessionStart and UserPromptSubmit are the two hooks that carry
	// a window signal. SessionStart handles fresh sessions; UserPromptSubmit
	// handles sessions that pre-existed before Claudia started (server restart
	// pickup).
	if (type === "SessionStart" || type === "UserPromptSubmit") {
		const session = tracker.getSession(event.session);
		const { link } = windowSignal;
		if (type === "SessionStart" || (link && !session?.windowHandle)) {
			console.log(
				`[auto-link] window="${link ? `${link.hwnd}|${link.windowTitle}` : ""}" session=${session?.displayName || "null"} hwnd=${session?.windowHandle}`,
			);
		}
		if (session && !session.windowHandle && link) {
			// Link only — the terminal title is never rewritten here. A handle
			// names a window that may host other sessions' tabs, so renaming it
			// would retitle theirs (docs/work/BUG-003.md). The dashboard card
			// carries the generated name instead.
			const result = tracker.linkSessionById(
				event.session,
				link.hwnd,
				link.windowTitle,
				link.claudePid,
			);
			console.log(
				`[auto-link] linked session=${result?.displayName} hwnd=${link.hwnd} claudePid=${link.claudePid ?? "none"}`,
			);
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
}

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

	// Window acquisition, when the hook sent a pid to walk from. It has to
	// finish BEFORE admission: the walk's claudeCount decides whether a nested
	// session gets a card at all, so admitting first would flash a card the
	// nesting verdict then takes away. Every other hook type keeps the plain
	// synchronous path. A session already holding a handle skips the walk
	// entirely — that is the point of the move: UserPromptSubmit on a linked
	// session costs nothing.
	const hookPid = String(req.headers["x-hook-pid"] || "").trim();
	if ((type === "SessionStart" || type === "UserPromptSubmit") && hookPid) {
		if (tracker.getSession(event.session)?.windowHandle) {
			completeHookEvent(res, type, event, windowSignalFromResolution(null));
			return;
		}
		resolveTerminalWindow(hookPid)
			.then((resolved) =>
				completeHookEvent(
					res,
					type,
					event,
					windowSignalFromResolution(resolved),
				),
			)
			// resolveTerminalWindow never rejects; if it ever did, the request is
			// still answered — unlinked — rather than left hanging.
			.catch(() =>
				completeHookEvent(res, type, event, windowSignalFromResolution(null)),
			);
		return;
	}

	completeHookEvent(res, type, event, windowSignalFromHeaders(req));
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

// Liveness probe for a session's own `claude.exe`. Signal 0 delivers nothing —
// it only asks whether the pid exists. ESRCH is the single "gone" answer;
// EPERM means the process is there and merely out of reach, which is alive, and
// any other failure is treated the same way so a probe fault never removes a
// live session's card.
function isProcessAlive(pid) {
	try {
		process.kill(pid, 0);
		return true;
	} catch (err) {
		return err?.code !== "ESRCH";
	}
}

// Two liveness sources, one sweep. A session that carries its own claude pid is
// judged on that process — exact, where "window alive" was only a proxy: a
// window handle names a window that outlives any one of the sessions sharing it
// (docs/work/BUG-003.md). A session linked through the legacy pre-resolved
// header carries no pid (docs/work/GAP-001.md) and keeps the window-death
// check. Both kinds can be present at once.
export async function pruneDeadLinkedSessions() {
	if (windowCheckRunning) return;
	windowCheckRunning = true;
	try {
		const linked = tracker.getSessions().filter((s) => s.windowHandle);
		if (linked.length === 0) return;

		const byProcess = linked.filter((s) => s.claudePid != null);
		const byWindow = linked.filter((s) => s.claudePid == null);

		for (const session of byProcess) {
			if (isProcessAlive(session.claudePid)) continue;
			console.log(
				`[prune] claude process gone for "${session.displayName}" (pid=${session.claudePid})`,
			);
			tracker.handleEvent({ session: session.id, state: "stopped" });
		}

		if (byWindow.length === 0) return;
		const dead = await findDeadWindows(byWindow.map((s) => s.windowHandle));
		for (const session of byWindow) {
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
