import { randomBytes } from "node:crypto";

/**
 * Session state machine.
 *
 * Three states from the user's perspective:
 *   Pending — Claude needs approval, user must act
 *   Busy    — Claude is working (tool running, thinking between tools)
 *   Idle    — Claude finished its turn, waiting for user input
 *
 * Busy spans from the first PreToolUse until Stop (turn complete).
 * PostToolUse also signals busy — Claude is still working between tools.
 * Only Stop and SessionStart produce idle.
 */

const State = Object.freeze({
	IDLE: "idle",
	BUSY: "busy",
	PENDING: "pending",
});

const STALE_SESSION_TIMEOUT_MS = 10 * 60 * 1000;

function createSession(id, cwd) {
	return {
		id,
		state: State.IDLE,
		cwd,
		displayName: extractDisplayName(cwd),
		lastTool: null,
		lastEvent: Date.now(),
		stateChangedAt: Date.now(),
		pendingMessage: null,
		permissionRequest: null,
		windowHandle: null,
		git: null,
		subagentActivity: 0,
		activeSubagents: 0,
		turnComplete: false,
	};
}

export function extractDisplayName(cwd) {
	if (!cwd) return "unknown";
	const normalized = cwd.replace(/\\/g, "/");
	return normalized.split("/").filter(Boolean).pop() || "unknown";
}

export function createSessionTracker({
	onStateChange,
	getGitStatus,
	onPendingAlert,
	onIdleAlert,
} = {}) {
	const sessions = new Map();
	const pendingLinks = new Map(); // cwd (normalized) → { windowHandle, displayName }
	let pruneInterval = null;

	function deduplicateDisplayName(baseName) {
		const existing = new Set(
			Array.from(sessions.values()).map((s) => s.displayName),
		);
		if (!existing.has(baseName)) return baseName;
		let n = 2;
		while (existing.has(`${baseName} ${n}`)) n++;
		return `${baseName} ${n}`;
	}

	function notify() {
		if (onStateChange) {
			onStateChange({
				sessions: getSessions(),
				aggregateState: getAggregateState(),
			});
		}
	}

	const gitRefreshing = new Set();

	async function refreshGit(session) {
		if (!getGitStatus || !session.cwd) return;
		if (gitRefreshing.has(session.id)) return;
		gitRefreshing.add(session.id);
		try {
			session.git = await getGitStatus(session.cwd);
		} catch {
			session.git = null;
		} finally {
			gitRefreshing.delete(session.id);
		}
	}

	function handleEvent(event) {
		const {
			session: sessionId,
			state,
			tool,
			cwd,
			message,
			ts,
			hookType,
			permissionRequest,
		} = event;

		if (!sessionId || !state) return;

		if (state === "stopped") {
			if (sessions.has(sessionId)) {
				sessions.delete(sessionId);
				notify();
			}
			return;
		}

		const isNew = !sessions.has(sessionId);

		// Don't create ghost sessions from late Notifications for ended sessions
		if (isNew && state === "pending") return;

		if (isNew) {
			const session = createSession(sessionId, cwd);
			// Attach window handle if this cwd was spawned by Claudia
			const normalizedCwd = cwd ? cwd.replace(/\\/g, "/") : null;
			if (normalizedCwd && pendingLinks.has(normalizedCwd)) {
				const link = pendingLinks.get(normalizedCwd);
				session.windowHandle = link.windowHandle;
				if (link.displayName) session.displayName = link.displayName;
				// Consume so next spawn of same cwd gets its own entry
				pendingLinks.delete(normalizedCwd);
			}
			session.displayName = deduplicateDisplayName(session.displayName);
			sessions.set(sessionId, session);
		}

		const session = sessions.get(sessionId);
		session.lastEvent = ts ? ts * 1000 : Date.now();

		const cwdChanged = cwd && cwd !== session.cwd;
		if (cwdChanged) {
			session.cwd = cwd;
			session.displayName = deduplicateDisplayName(extractDisplayName(cwd));
		}

		const prevState = session.state;

		// Track active subagents
		if (
			hookType === "PreToolUse" &&
			(tool === "Agent" || event.tool === "Agent")
		) {
			session.activeSubagents = (session.activeSubagents || 0) + 1;
		}
		if (hookType === "SubagentStop") {
			session.activeSubagents = Math.max(0, (session.activeSubagents || 0) - 1);
		}

		switch (state) {
			case "busy":
				session.state = State.BUSY;
				session.lastTool = tool || session.lastTool;
				session.pendingMessage = null;
				session.permissionRequest = null;
				// Don't clear turnComplete on SubagentStop — it maps to "busy"
				// but we need the flag to survive for the deferred idle check
				if (hookType !== "SubagentStop") {
					session.turnComplete = false;
				}
				break;

			case "idle":
				// Don't transition to idle if subagents are still running
				if (session.activeSubagents > 0) {
					session.turnComplete = true;
					break;
				}
				session.state = State.IDLE;
				session.lastTool = null;
				session.pendingMessage = null;
				session.permissionRequest = null;
				session.subagentActivity = 0;
				session.activeSubagents = 0;
				session.turnComplete = false;
				if (
					prevState !== State.IDLE &&
					session.windowHandle != null &&
					onIdleAlert
				) {
					onIdleAlert(session);
				}
				break;

			case "pending": {
				session.state = State.PENDING;
				session.pendingMessage = message || null;
				session.permissionRequest = permissionRequest || null;
				if (
					prevState !== State.PENDING &&
					session.windowHandle != null &&
					onPendingAlert
				) {
					onPendingAlert(session);
				}
				break;
			}

			default:
				return;
		}

		if (hookType === "SubagentStop") session.subagentActivity++;

		// Deferred idle: if Stop fired while subagents were running (turnComplete),
		// and the last subagent just finished, transition to idle now.
		if (
			hookType === "SubagentStop" &&
			session.activeSubagents === 0 &&
			session.turnComplete
		) {
			session.state = State.IDLE;
			session.lastTool = null;
			session.pendingMessage = null;
			session.permissionRequest = null;
			session.subagentActivity = 0;
			session.turnComplete = false;
			if (
				prevState !== State.IDLE &&
				session.windowHandle != null &&
				onIdleAlert
			) {
				onIdleAlert(session);
			}
		}

		if (session.state !== prevState) {
			session.stateChangedAt = Date.now();
		}

		// Always notify immediately so SFX/flash stay in sync with state changes
		notify();

		// Refresh git status on new sessions, cwd changes, and idle (work complete)
		const shouldRefreshGit =
			getGitStatus && (isNew || cwdChanged || state === "idle");
		if (shouldRefreshGit) {
			refreshGit(session)
				.then(notify)
				.catch(() => {});
		}
	}

	function getSessions() {
		return Array.from(sessions.values()).map((s) => ({
			id: s.id,
			state: s.state,
			displayName: s.displayName,
			cwd: s.cwd,
			lastTool: s.lastTool,
			lastEvent: s.lastEvent,
			stateChangedAt: s.stateChangedAt,
			pendingMessage: s.pendingMessage,
			permissionRequest: s.permissionRequest,
			windowHandle: s.windowHandle,
			git: s.git,
			subagentActivity: s.subagentActivity,
			activeSubagents: s.activeSubagents,
		}));
	}

	function getAggregateState() {
		const states = Array.from(sessions.values()).map((s) => s.state);
		if (states.includes(State.PENDING)) return State.PENDING;
		if (states.includes(State.BUSY)) return State.BUSY;
		return State.IDLE;
	}

	function pruneStale() {
		const now = Date.now();
		let pruned = false;
		for (const [id, session] of sessions) {
			// Skip linked sessions — dead-window pruning handles those
			if (session.windowHandle != null) continue;
			if (now - session.lastEvent > STALE_SESSION_TIMEOUT_MS) {
				sessions.delete(id);
				pruned = true;
			}
		}
		if (pruned) notify();
	}

	function getSessionDisplayName(cwd) {
		return extractDisplayName(cwd);
	}

	function start() {
		pruneInterval = setInterval(pruneStale, 60_000);
	}

	function stop() {
		if (pruneInterval) {
			clearInterval(pruneInterval);
			pruneInterval = null;
		}
		sessions.clear();
	}

	function storeWindowHandle(cwd, windowHandle, displayName = null) {
		const normalized = cwd.replace(/\\/g, "/");
		pendingLinks.set(normalized, { windowHandle, displayName });

		// Retroactively link the most recent unlinked session with this cwd
		// (handles race where SessionStart hook fires before spawn returns).
		// Only match ONE session — others with the same cwd are independent instances.
		let newest = null;
		for (const session of sessions.values()) {
			const sessionCwd = session.cwd ? session.cwd.replace(/\\/g, "/") : null;
			if (sessionCwd === normalized && session.windowHandle == null) {
				if (!newest || session.lastEvent > newest.lastEvent) {
					newest = session;
				}
			}
		}
		if (newest) {
			newest.windowHandle = windowHandle;
			if (displayName) {
				newest.displayName = deduplicateDisplayName(displayName);
			}
			// Consume — the entry was matched, don't let new-session path double-match
			pendingLinks.delete(normalized);
			notify();
		} else {
			// No unlinked session found. If this HWND is already assigned
			// (auto-link won the race), the pendingLink is stale — delete it
			// to prevent contaminating the next session with this cwd.
			const hwndTaken = Array.from(sessions.values()).some(
				(s) => s.windowHandle === windowHandle,
			);
			if (hwndTaken) {
				pendingLinks.delete(normalized);
			}
		}
	}

	function linkSessionById(sessionId, windowHandle, windowTitle = "") {
		const session = sessions.get(sessionId);
		if (!session) return null;
		session.windowHandle = windowHandle;

		const baseName = extractDisplayName(session.cwd);
		// If the terminal already has a valid Claudia title, reuse it
		// (e.g. reconnect in a spawned terminal whose title is locked)
		const titlePattern = new RegExp(
			`^${baseName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} [0-9a-f]{4}$`,
		);
		if (windowTitle && titlePattern.test(windowTitle)) {
			const deduped = deduplicateDisplayName(windowTitle);
			if (deduped === windowTitle) {
				session.displayName = windowTitle;
				notify();
				return { displayName: session.displayName, renamed: false };
			}
			// Name taken by another session — fall through to generate new hex
		}

		const hex = randomBytes(2).toString("hex");
		session.displayName = deduplicateDisplayName(`${baseName} ${hex}`);
		notify();
		return { displayName: session.displayName, renamed: true };
	}

	function getSession(id) {
		const s = sessions.get(id);
		if (!s) return null;
		return {
			id: s.id,
			state: s.state,
			displayName: s.displayName,
			cwd: s.cwd,
			lastTool: s.lastTool,
			lastEvent: s.lastEvent,
			stateChangedAt: s.stateChangedAt,
			pendingMessage: s.pendingMessage,
			permissionRequest: s.permissionRequest,
			windowHandle: s.windowHandle,
			git: s.git,
			subagentActivity: s.subagentActivity,
			activeSubagents: s.activeSubagents,
		};
	}

	function getLinkedHandles() {
		const handles = new Set();
		for (const session of sessions.values()) {
			if (session.windowHandle != null) {
				handles.add(session.windowHandle);
			}
		}
		return handles;
	}

	function setPermissionRequest(sessionId, permissionRequest) {
		const session = sessions.get(sessionId);
		if (!session) return;
		session.permissionRequest = permissionRequest || null;
		notify();
	}

	return {
		handleEvent,
		getSessions,
		getSession,
		getAggregateState,
		getSessionDisplayName,
		storeWindowHandle,
		linkSessionById,
		getLinkedHandles,
		pruneStale,
		setPermissionRequest,
		start,
		stop,
	};
}

export { STALE_SESSION_TIMEOUT_MS, State };
