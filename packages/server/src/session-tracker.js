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
  };
}

function extractDisplayName(cwd) {
  if (!cwd) return "unknown";
  const normalized = cwd.replace(/\\/g, "/");
  return normalized.split("/").filter(Boolean).pop() || "unknown";
}

export function createSessionTracker({ onStateChange } = {}) {
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

    if (!sessions.has(sessionId)) {
      sessions.set(sessionId, createSession(sessionId, cwd));
    }

    const session = sessions.get(sessionId);
    session.lastEvent = ts ? ts * 1000 : Date.now();

    if (cwd && cwd !== session.cwd) {
      session.cwd = cwd;
      session.displayName = extractDisplayName(cwd);
    }

    switch (state) {
      case "busy":
        session.state = State.BUSY;
        session.lastTool = tool || session.lastTool;
        session.pendingMessage = null;
        notify();
        break;

      case "idle":
        session.state = State.IDLE;
        session.lastTool = null;
        session.pendingMessage = null;
        notify();
        break;

      case "pending":
        session.state = State.PENDING;
        session.pendingMessage = message || null;
        notify();
        break;

      default:
        break;
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
    }));
  }

  function getAggregateState() {
    const states = Array.from(sessions.values()).map((s) => s.state);
    if (states.includes(State.PENDING)) return State.PENDING;
    if (states.includes(State.IDLE)) return State.IDLE;
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

  return {
    handleEvent,
    getSessions,
    getAggregateState,
    getSessionDisplayName,
    pruneStale,
    start,
    stop,
  };
}

export { State, STALE_SESSION_TIMEOUT_MS };
