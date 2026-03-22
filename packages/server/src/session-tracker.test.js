import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  createSessionTracker,
  State,
  IDLE_DEBOUNCE_MS,
  THINKING_THRESHOLD_MS,
  STALE_SESSION_TIMEOUT_MS,
} from "./session-tracker.js";

describe("session-tracker", () => {
  let tracker;
  let stateChanges;

  beforeEach(() => {
    vi.useFakeTimers();
    stateChanges = [];
    tracker = createSessionTracker({
      onStateChange: (update) => stateChanges.push(structuredClone(update)),
    });
  });

  afterEach(() => {
    tracker.stop();
    vi.useRealTimers();
  });

  describe("handleEvent", () => {
    it("creates a new session on first event", () => {
      tracker.handleEvent({
        session: "s1",
        state: "working",
        cwd: "/home/user/projects/api-server",
      });

      const sessions = tracker.getSessions();
      expect(sessions).toHaveLength(1);
      expect(sessions[0].id).toBe("s1");
      expect(sessions[0].state).toBe(State.WORKING);
      expect(sessions[0].displayName).toBe("api-server");
    });

    it("ignores events without session id or state", () => {
      tracker.handleEvent({ session: "s1" });
      tracker.handleEvent({ state: "working" });
      tracker.handleEvent({});

      expect(tracker.getSessions()).toHaveLength(0);
    });

    it("transitions to working on working event", () => {
      tracker.handleEvent({ session: "s1", state: "working", cwd: "/proj", tool: "Edit" });

      const session = tracker.getSessions()[0];
      expect(session.state).toBe(State.WORKING);
      expect(session.lastTool).toBe("Edit");
    });

    it("transitions to pending on pending event", () => {
      tracker.handleEvent({ session: "s1", state: "working", cwd: "/proj" });
      tracker.handleEvent({
        session: "s1",
        state: "pending",
        message: "Needs file edit approval",
      });

      const session = tracker.getSessions()[0];
      expect(session.state).toBe(State.PENDING);
      expect(session.pendingMessage).toBe("Needs file edit approval");
    });

    it("clears pending message on working event", () => {
      tracker.handleEvent({
        session: "s1",
        state: "pending",
        cwd: "/proj",
        message: "Need approval",
      });
      tracker.handleEvent({ session: "s1", state: "working" });

      const session = tracker.getSessions()[0];
      expect(session.state).toBe(State.WORKING);
      expect(session.pendingMessage).toBeNull();
    });

    it("updates cwd and display name when cwd changes", () => {
      tracker.handleEvent({ session: "s1", state: "working", cwd: "/proj/api" });
      expect(tracker.getSessions()[0].displayName).toBe("api");

      tracker.handleEvent({ session: "s1", state: "working", cwd: "/proj/frontend" });
      expect(tracker.getSessions()[0].displayName).toBe("frontend");
    });
  });

  describe("display name extraction", () => {
    it("extracts last path segment", () => {
      expect(tracker.getSessionDisplayName("/home/user/projects/api-server")).toBe("api-server");
    });

    it("handles windows paths", () => {
      expect(tracker.getSessionDisplayName("C:\\Users\\dev\\projects\\web")).toBe("web");
    });

    it("handles trailing slash", () => {
      expect(tracker.getSessionDisplayName("/home/user/projects/api/")).toBe("api");
    });

    it("returns unknown for empty input", () => {
      expect(tracker.getSessionDisplayName("")).toBe("unknown");
      expect(tracker.getSessionDisplayName(null)).toBe("unknown");
    });
  });

  describe("idle debounce", () => {
    it("does not transition to idle immediately", () => {
      tracker.handleEvent({ session: "s1", state: "working", cwd: "/proj" });
      tracker.handleEvent({ session: "s1", state: "idle" });

      expect(tracker.getSessions()[0].state).toBe(State.WORKING);
    });

    it("transitions to idle after debounce period", () => {
      tracker.handleEvent({ session: "s1", state: "working", cwd: "/proj" });
      tracker.handleEvent({ session: "s1", state: "idle" });

      vi.advanceTimersByTime(IDLE_DEBOUNCE_MS);

      expect(tracker.getSessions()[0].state).toBe(State.IDLE);
    });

    it("cancels idle transition if new working event arrives", () => {
      tracker.handleEvent({ session: "s1", state: "working", cwd: "/proj" });
      tracker.handleEvent({ session: "s1", state: "idle" });

      vi.advanceTimersByTime(IDLE_DEBOUNCE_MS - 100);
      tracker.handleEvent({ session: "s1", state: "working" });

      vi.advanceTimersByTime(200);

      expect(tracker.getSessions()[0].state).toBe(State.WORKING);
    });

    it("notifies on debounced idle transition", () => {
      tracker.handleEvent({ session: "s1", state: "working", cwd: "/proj" });
      stateChanges = [];

      tracker.handleEvent({ session: "s1", state: "idle" });
      expect(stateChanges).toHaveLength(0);

      vi.advanceTimersByTime(IDLE_DEBOUNCE_MS);
      expect(stateChanges).toHaveLength(1);
      expect(stateChanges[0].sessions[0].state).toBe(State.IDLE);
    });
  });

  describe("thinking detection", () => {
    it("transitions to thinking after threshold with no events", () => {
      tracker.handleEvent({ session: "s1", state: "working", cwd: "/proj" });

      vi.advanceTimersByTime(THINKING_THRESHOLD_MS);

      expect(tracker.getSessions()[0].state).toBe(State.THINKING);
    });

    it("does not transition to thinking if new event arrives", () => {
      tracker.handleEvent({ session: "s1", state: "working", cwd: "/proj" });

      vi.advanceTimersByTime(THINKING_THRESHOLD_MS - 100);
      tracker.handleEvent({ session: "s1", state: "working", tool: "Read" });

      vi.advanceTimersByTime(200);

      expect(tracker.getSessions()[0].state).toBe(State.WORKING);
    });

    it("thinking session transitions to idle after debounce", () => {
      tracker.handleEvent({ session: "s1", state: "working", cwd: "/proj" });
      vi.advanceTimersByTime(THINKING_THRESHOLD_MS);
      expect(tracker.getSessions()[0].state).toBe(State.THINKING);

      tracker.handleEvent({ session: "s1", state: "idle" });
      vi.advanceTimersByTime(IDLE_DEBOUNCE_MS);

      expect(tracker.getSessions()[0].state).toBe(State.IDLE);
    });
  });

  describe("stale session pruning", () => {
    it("removes sessions with no events past timeout", () => {
      tracker.handleEvent({ session: "s1", state: "working", cwd: "/proj" });

      vi.advanceTimersByTime(STALE_SESSION_TIMEOUT_MS + 1);
      tracker.pruneStale();

      expect(tracker.getSessions()).toHaveLength(0);
    });

    it("keeps sessions with recent events", () => {
      tracker.handleEvent({
        session: "s1",
        state: "working",
        cwd: "/proj",
        ts: Date.now() / 1000,
      });

      tracker.pruneStale();

      expect(tracker.getSessions()).toHaveLength(1);
    });

    it("notifies when sessions are pruned", () => {
      tracker.handleEvent({ session: "s1", state: "working", cwd: "/proj" });

      vi.advanceTimersByTime(STALE_SESSION_TIMEOUT_MS + 1);
      stateChanges = [];
      tracker.pruneStale();

      expect(stateChanges).toHaveLength(1);
      expect(stateChanges[0].sessions).toHaveLength(0);
    });
  });

  describe("aggregate state", () => {
    it("returns idle when no sessions", () => {
      expect(tracker.getAggregateState()).toBe(State.IDLE);
    });

    it("returns pending when any session is pending (highest priority)", () => {
      tracker.handleEvent({ session: "s1", state: "working", cwd: "/a" });
      tracker.handleEvent({ session: "s2", state: "pending", cwd: "/b" });

      expect(tracker.getAggregateState()).toBe(State.PENDING);
    });

    it("returns working over thinking and idle", () => {
      tracker.handleEvent({ session: "s1", state: "working", cwd: "/a" });
      tracker.handleEvent({ session: "s2", state: "working", cwd: "/b" });
      vi.advanceTimersByTime(THINKING_THRESHOLD_MS);
      // s1 and s2 both thinking now, but send s1 back to working
      tracker.handleEvent({ session: "s1", state: "working" });

      expect(tracker.getAggregateState()).toBe(State.WORKING);
    });

    it("returns thinking over idle", () => {
      tracker.handleEvent({ session: "s1", state: "working", cwd: "/a" });
      vi.advanceTimersByTime(THINKING_THRESHOLD_MS);

      tracker.handleEvent({ session: "s2", state: "working", cwd: "/b" });
      tracker.handleEvent({ session: "s2", state: "idle" });
      vi.advanceTimersByTime(IDLE_DEBOUNCE_MS);

      expect(tracker.getAggregateState()).toBe(State.THINKING);
    });
  });

  describe("state change notifications", () => {
    it("notifies on working event", () => {
      tracker.handleEvent({ session: "s1", state: "working", cwd: "/proj" });

      expect(stateChanges).toHaveLength(1);
      expect(stateChanges[0].aggregateState).toBe(State.WORKING);
    });

    it("notifies on pending event", () => {
      tracker.handleEvent({ session: "s1", state: "pending", cwd: "/proj", message: "hi" });

      expect(stateChanges).toHaveLength(1);
      expect(stateChanges[0].aggregateState).toBe(State.PENDING);
    });

    it("includes all sessions in notification", () => {
      tracker.handleEvent({ session: "s1", state: "working", cwd: "/a" });
      tracker.handleEvent({ session: "s2", state: "working", cwd: "/b" });

      expect(stateChanges[1].sessions).toHaveLength(2);
    });
  });
});
