import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  createSessionTracker,
  State,
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
        state: "busy",
        cwd: "/home/user/projects/api-server",
      });

      const sessions = tracker.getSessions();
      expect(sessions).toHaveLength(1);
      expect(sessions[0].id).toBe("s1");
      expect(sessions[0].state).toBe(State.BUSY);
      expect(sessions[0].displayName).toBe("api-server");
    });

    it("ignores events without session id or state", () => {
      tracker.handleEvent({ session: "s1" });
      tracker.handleEvent({ state: "busy" });
      tracker.handleEvent({});

      expect(tracker.getSessions()).toHaveLength(0);
    });

    it("transitions to busy on busy event", () => {
      tracker.handleEvent({ session: "s1", state: "busy", cwd: "/proj", tool: "Edit" });

      const session = tracker.getSessions()[0];
      expect(session.state).toBe(State.BUSY);
      expect(session.lastTool).toBe("Edit");
    });

    it("stays busy between PreToolUse and PostToolUse", () => {
      tracker.handleEvent({ session: "s1", state: "busy", cwd: "/proj", tool: "Edit" });
      // PostToolUse also sends busy
      tracker.handleEvent({ session: "s1", state: "busy", tool: "Edit" });

      expect(tracker.getSessions()[0].state).toBe(State.BUSY);
    });

    it("stays busy during long tool runs", () => {
      tracker.handleEvent({ session: "s1", state: "busy", cwd: "/proj", tool: "Edit" });

      vi.advanceTimersByTime(42 * 60 * 1000);

      expect(tracker.getSessions()[0].state).toBe(State.BUSY);
    });

    it("transitions to idle only on idle event (Stop hook)", () => {
      tracker.handleEvent({ session: "s1", state: "busy", cwd: "/proj", tool: "Edit" });
      tracker.handleEvent({ session: "s1", state: "idle" });

      expect(tracker.getSessions()[0].state).toBe(State.IDLE);
    });

    it("clears lastTool on idle", () => {
      tracker.handleEvent({ session: "s1", state: "busy", cwd: "/proj", tool: "Edit" });
      tracker.handleEvent({ session: "s1", state: "idle" });

      expect(tracker.getSessions()[0].lastTool).toBeNull();
    });

    it("transitions to pending on pending event", () => {
      tracker.handleEvent({ session: "s1", state: "busy", cwd: "/proj" });
      tracker.handleEvent({
        session: "s1",
        state: "pending",
        message: "Needs file edit approval",
      });

      const session = tracker.getSessions()[0];
      expect(session.state).toBe(State.PENDING);
      expect(session.pendingMessage).toBe("Needs file edit approval");
    });

    it("clears pending message on busy event", () => {
      tracker.handleEvent({
        session: "s1",
        state: "pending",
        cwd: "/proj",
        message: "Need approval",
      });
      tracker.handleEvent({ session: "s1", state: "busy" });

      const session = tracker.getSessions()[0];
      expect(session.state).toBe(State.BUSY);
      expect(session.pendingMessage).toBeNull();
    });

    it("updates cwd and display name when cwd changes", () => {
      tracker.handleEvent({ session: "s1", state: "busy", cwd: "/proj/api" });
      expect(tracker.getSessions()[0].displayName).toBe("api");

      tracker.handleEvent({ session: "s1", state: "busy", cwd: "/proj/frontend" });
      expect(tracker.getSessions()[0].displayName).toBe("frontend");
    });

    it("removes session on stopped event", () => {
      tracker.handleEvent({ session: "s1", state: "busy", cwd: "/proj/api" });
      tracker.handleEvent({ session: "s2", state: "busy", cwd: "/proj/web" });
      expect(tracker.getSessions()).toHaveLength(2);

      tracker.handleEvent({ session: "s1", state: "stopped" });
      const sessions = tracker.getSessions();
      expect(sessions).toHaveLength(1);
      expect(sessions[0].id).toBe("s2");
    });

    it("notifies on stopped event", () => {
      tracker.handleEvent({ session: "s1", state: "busy", cwd: "/proj" });
      stateChanges.length = 0;

      tracker.handleEvent({ session: "s1", state: "stopped" });
      expect(stateChanges).toHaveLength(1);
      expect(stateChanges[0].sessions).toHaveLength(0);
    });

    it("handles stopped event for unknown session", () => {
      tracker.handleEvent({ session: "unknown", state: "stopped" });
      expect(tracker.getSessions()).toHaveLength(0);
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

  describe("stale session pruning", () => {
    it("removes sessions with no events past timeout", () => {
      tracker.handleEvent({ session: "s1", state: "busy", cwd: "/proj" });

      vi.advanceTimersByTime(STALE_SESSION_TIMEOUT_MS + 1);
      tracker.pruneStale();

      expect(tracker.getSessions()).toHaveLength(0);
    });

    it("keeps sessions with recent events", () => {
      tracker.handleEvent({
        session: "s1",
        state: "busy",
        cwd: "/proj",
        ts: Date.now() / 1000,
      });

      tracker.pruneStale();

      expect(tracker.getSessions()).toHaveLength(1);
    });

    it("notifies when sessions are pruned", () => {
      tracker.handleEvent({ session: "s1", state: "busy", cwd: "/proj" });

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
      tracker.handleEvent({ session: "s1", state: "busy", cwd: "/a" });
      tracker.handleEvent({ session: "s2", state: "pending", cwd: "/b" });

      expect(tracker.getAggregateState()).toBe(State.PENDING);
    });

    it("returns busy when any session is busy", () => {
      tracker.handleEvent({ session: "s1", state: "busy", cwd: "/a" });
      tracker.handleEvent({ session: "s2", state: "idle", cwd: "/b" });

      expect(tracker.getAggregateState()).toBe(State.BUSY);
    });

    it("returns idle when all sessions are idle", () => {
      tracker.handleEvent({ session: "s1", state: "idle", cwd: "/a" });
      tracker.handleEvent({ session: "s2", state: "idle", cwd: "/b" });

      expect(tracker.getAggregateState()).toBe(State.IDLE);
    });
  });

  describe("state change notifications", () => {
    it("notifies on busy event", () => {
      tracker.handleEvent({ session: "s1", state: "busy", cwd: "/proj" });

      expect(stateChanges).toHaveLength(1);
      expect(stateChanges[0].aggregateState).toBe(State.BUSY);
    });

    it("notifies on pending event", () => {
      tracker.handleEvent({ session: "s1", state: "pending", cwd: "/proj", message: "hi" });

      expect(stateChanges).toHaveLength(1);
      expect(stateChanges[0].aggregateState).toBe(State.PENDING);
    });

    it("includes all sessions in notification", () => {
      tracker.handleEvent({ session: "s1", state: "busy", cwd: "/a" });
      tracker.handleEvent({ session: "s2", state: "busy", cwd: "/b" });

      expect(stateChanges[1].sessions).toHaveLength(2);
    });
  });
});
