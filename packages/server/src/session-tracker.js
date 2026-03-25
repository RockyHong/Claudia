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
    spawned: false,
    terminalTitle: null,
    windowHandle: null,
    git: null,
  };
}

export function extractDisplayName(cwd) {
  if (!cwd) return "unknown";
  const normalized = cwd.replace(/\\/g, "/");
  return normalized.split("/").filter(Boolean).pop() || "unknown";
}

export function createSessionTracker({ onStateChange, getGitStatus, onPendingAlert, onIdleAlert } = {}) {
  const sessions = new Map();
  const spawnedInfo = new Map(); // cwd (normalized) → { terminalTitle, windowHandle }
  let pruneInterval = null;

  function deduplicateDisplayName(baseName) {
    const existing = new Set(
      Array.from(sessions.values()).map((s) => s.displayName),
    );
    if (!existing.has(baseName)) return baseName;
    let n = 2;
    while (existing.has(`${baseName} (${n})`)) n++;
    return `${baseName} (${n})`;
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
    const { session: sessionId, state, tool, cwd, message, ts } = event;

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
      if (normalizedCwd && spawnedInfo.has(normalizedCwd)) {
        const info = spawnedInfo.get(normalizedCwd);
        session.spawned = true;
        session.terminalTitle = info.terminalTitle;
        session.windowHandle = info.windowHandle;
        // Consume so next spawn of same cwd gets its own entry
        spawnedInfo.delete(normalizedCwd);
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

    switch (state) {
      case "busy":
        session.state = State.BUSY;
        session.lastTool = tool || session.lastTool;
        session.pendingMessage = null;
        break;

      case "idle":
        session.state = State.IDLE;
        session.lastTool = null;
        session.pendingMessage = null;
        if (prevState !== State.IDLE && session.terminalTitle && onIdleAlert) {
          onIdleAlert(session);
        }
        break;

      case "pending": {
        // Ignore late Notifications that arrive after Stop already resolved the session
        if (prevState === State.IDLE) break;
        session.state = State.PENDING;
        session.pendingMessage = message || null;
        if (prevState !== State.PENDING && session.terminalTitle && onPendingAlert) {
          onPendingAlert(session);
        }
        break;
      }

      default:
        return;
    }

    if (session.state !== prevState) {
      session.stateChangedAt = Date.now();
    }

    // Refresh git status on new sessions, cwd changes, and idle (work complete)
    const shouldRefreshGit = getGitStatus && (isNew || cwdChanged || state === "idle");
    if (shouldRefreshGit) {
      refreshGit(session).then(notify);
    } else {
      notify();
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
      spawned: s.spawned,
      terminalTitle: s.terminalTitle,
      windowHandle: s.windowHandle,
      git: s.git,
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

  function storeSpawnedInfo(cwd, terminalTitle, windowHandle) {
    const normalized = cwd.replace(/\\/g, "/");
    spawnedInfo.set(normalized, { terminalTitle, windowHandle });

    // Retroactively mark any session that arrived before the info was stored
    for (const session of sessions.values()) {
      const sessionCwd = session.cwd ? session.cwd.replace(/\\/g, "/") : null;
      if (sessionCwd === normalized && !session.spawned) {
        session.spawned = true;
        session.terminalTitle = terminalTitle;
        session.windowHandle = windowHandle;
        notify();
      }
    }
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
      spawned: s.spawned,
      terminalTitle: s.terminalTitle,
      windowHandle: s.windowHandle,
      git: s.git,
    };
  }

  return {
    handleEvent,
    getSessions,
    getSession,
    getAggregateState,
    getSessionDisplayName,
    storeSpawnedInfo,
    pruneStale,
    start,
    stop,
  };
}

export { State, STALE_SESSION_TIMEOUT_MS };
