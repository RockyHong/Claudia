import { describe, it, expect } from "vitest";
import { getStatusMessage } from "./personality.js";

// personality.js holds module-level cache (lastKey/lastMessage).
// Tests are ordered deliberately: caching tests run after state-branch tests
// so the cache is in a known state when we exercise it.

describe("getStatusMessage", () => {
  describe("no sessions", () => {
    it("returns waiting message for null", () => {
      expect(getStatusMessage(null)).toBe(
        "No active sessions. Waiting for Claude to check in."
      );
    });

    it("returns waiting message for undefined", () => {
      expect(getStatusMessage(undefined)).toBe(
        "No active sessions. Waiting for Claude to check in."
      );
    });

    it("returns waiting message for empty array", () => {
      expect(getStatusMessage([])).toBe(
        "No active sessions. Waiting for Claude to check in."
      );
    });
  });

  describe("all busy", () => {
    it("returns coffee message when all sessions are busy", () => {
      const sessions = [
        { id: "s1", state: "busy" },
        { id: "s2", state: "busy" },
      ];
      expect(getStatusMessage(sessions)).toBe("All busy. Grab a coffee.");
    });
  });

  describe("all idle", () => {
    it("returns free message when all sessions are idle", () => {
      const sessions = [
        { id: "s1", state: "idle" },
        { id: "s2", state: "idle" },
      ];
      expect(getStatusMessage(sessions)).toBe(
        "All sessions free — ready for tasks."
      );
    });
  });

  describe("mixed busy and idle", () => {
    it("returns standing by message when some busy and some idle", () => {
      const sessions = [
        { id: "s1", state: "busy" },
        { id: "s2", state: "idle" },
      ];
      expect(getStatusMessage(sessions)).toBe(
        "Some sessions standing by. Still working on the rest."
      );
    });
  });

  describe("pending sessions", () => {
    it("returns awaiting message with count of 1 when one session is pending", () => {
      const sessions = [{ id: "s1", state: "pending" }];
      expect(getStatusMessage(sessions)).toBe("1 awaiting your response.");
    });

    it("returns awaiting message with correct count for multiple pending sessions", () => {
      const sessions = [
        { id: "s1", state: "pending" },
        { id: "s2", state: "pending" },
        { id: "s3", state: "pending" },
      ];
      expect(getStatusMessage(sessions)).toBe("3 awaiting your response.");
    });

    it("pending takes priority over busy sessions", () => {
      const sessions = [
        { id: "s1", state: "pending" },
        { id: "s2", state: "busy" },
      ];
      expect(getStatusMessage(sessions)).toBe("1 awaiting your response.");
    });
  });

  describe("caching", () => {
    it("returns the same cached message when called twice with identical session states", () => {
      // Use a distinct state combination to ensure the cache is primed fresh.
      const sessions = [
        { id: "cache-a", state: "idle" },
        { id: "cache-b", state: "idle" },
      ];
      const first = getStatusMessage(sessions);
      const second = getStatusMessage(sessions);
      expect(second).toBe(first);
      expect(second).toBe("All sessions free — ready for tasks.");
    });

    it("returns new message when session states change", () => {
      const idleSessions = [
        { id: "cache-a", state: "idle" },
        { id: "cache-b", state: "idle" },
      ];
      const busySessions = [
        { id: "cache-a", state: "busy" },
        { id: "cache-b", state: "busy" },
      ];

      const idleMessage = getStatusMessage(idleSessions);
      const busyMessage = getStatusMessage(busySessions);

      expect(idleMessage).toBe("All sessions free — ready for tasks.");
      expect(busyMessage).toBe("All busy. Grab a coffee.");
      expect(busyMessage).not.toBe(idleMessage);
    });
  });
});
