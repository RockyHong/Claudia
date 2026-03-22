/**
 * Session state machine.
 *
 * Manages a registry of Claude Code sessions, handling state transitions
 * from hook events with debouncing and stale session pruning.
 */

const State = Object.freeze({
  IDLE: "idle",
  WORKING: "working",
  PENDING: "pending",
  THINKING: "thinking",
});

const IDLE_DEBOUNCE_MS = 2000;
const THINKING_THRESHOLD_MS = 5000;
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
  const debounceTimers = new Map();
  const thinkingTimers = new Map();
  let pruneInterval = null;

  function notify() {
    if (onStateChange) {
      onStateChange({
        sessions: getSessions(),
        aggregateState: getAggregateState(),
      });
    }
  }

  function clearTimers(sessionId) {
    if (debounceTimers.has(sessionId)) {
      clearTimeout(debounceTimers.get(sessionId));
      debounceTimers.delete(sessionId);
    }
    if (thinkingTimers.has(sessionId)) {
      clearTimeout(thinkingTimers.get(sessionId));
      thinkingTimers.delete(sessionId);
    }
  }

  function startThinkingTimer(sessionId) {
    clearTimeout(thinkingTimers.get(sessionId));
    thinkingTimers.set(
      sessionId,
      setTimeout(() => {
        const session = sessions.get(sessionId);
        if (session && session.state === State.WORKING) {
          session.state = State.THINKING;
          notify();
        }
        thinkingTimers.delete(sessionId);
      }, THINKING_THRESHOLD_MS)
    );
  }

  function handleEvent(event) {
    const { session: sessionId, state, tool, cwd, message, ts } = event;

    if (!sessionId || !state) return;

    if (state === "stopped") {
      if (sessions.has(sessionId)) {
        clearTimers(sessionId);
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

    clearTimers(sessionId);

    switch (state) {
      case "working":
        session.state = State.WORKING;
        session.lastTool = tool || null;
        session.pendingMessage = null;
        startThinkingTimer(sessionId);
        notify();
        break;

      case "idle":
        session.lastTool = tool || session.lastTool;
        session.pendingMessage = null;
        debounceTimers.set(
          sessionId,
          setTimeout(() => {
            if (session.state === State.WORKING || session.state === State.THINKING) {
              session.state = State.IDLE;
              notify();
            }
            debounceTimers.delete(sessionId);
          }, IDLE_DEBOUNCE_MS)
        );
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
    if (states.includes(State.WORKING)) return State.WORKING;
    if (states.includes(State.THINKING)) return State.THINKING;
    if (states.length > 0) return State.IDLE;
    return State.IDLE;
  }

  function pruneStale() {
    const now = Date.now();
    let pruned = false;
    for (const [id, session] of sessions) {
      if (now - session.lastEvent > STALE_SESSION_TIMEOUT_MS) {
        clearTimers(id);
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
    for (const [id] of sessions) {
      clearTimers(id);
    }
    sessions.clear();
    debounceTimers.clear();
    thinkingTimers.clear();
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

export { State, IDLE_DEBOUNCE_MS, THINKING_THRESHOLD_MS, STALE_SESSION_TIMEOUT_MS };
