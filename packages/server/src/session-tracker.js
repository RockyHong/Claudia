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
    pendingMessage: null,
    spawned: false,
    windowHandle: null,
    git: null,
  };
}

export function extractDisplayName(cwd) {
  if (!cwd) return "unknown";
  const normalized = cwd.replace(/\\/g, "/");
  return normalized.split("/").filter(Boolean).pop() || "unknown";
}

export function createSessionTracker({ onStateChange, getGitStatus, onPendingAlert } = {}) {
  const sessions = new Map();
  let pruneInterval = null;

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
    if (isNew) {
      sessions.set(sessionId, createSession(sessionId, cwd));
    }

    const session = sessions.get(sessionId);
    session.lastEvent = ts ? ts * 1000 : Date.now();

    const cwdChanged = cwd && cwd !== session.cwd;
    if (cwdChanged) {
      session.cwd = cwd;
      session.displayName = extractDisplayName(cwd);
    }

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
        break;

      case "pending": {
        const wasPending = session.state === State.PENDING;
        session.state = State.PENDING;
        session.pendingMessage = message || null;
        if (!wasPending && session.spawned && onPendingAlert) {
          onPendingAlert(session);
        }
        break;
      }

      default:
        return;
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
      pendingMessage: s.pendingMessage,
      spawned: s.spawned,
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

  function registerSpawned({ id, cwd, windowHandle }) {
    const session = createSession(id, cwd);
    session.spawned = true;
    session.windowHandle = windowHandle;
    sessions.set(id, session);

    if (getGitStatus) {
      refreshGit(session).then(notify);
    } else {
      notify();
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
      pendingMessage: s.pendingMessage,
      spawned: s.spawned,
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
    registerSpawned,
    pruneStale,
    start,
    stop,
  };
}

export { State, STALE_SESSION_TIMEOUT_MS };
