import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	createSessionTracker,
	STALE_SESSION_TIMEOUT_MS,
	State,
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
			tracker.handleEvent({
				session: "s1",
				state: "busy",
				cwd: "/proj",
				tool: "Edit",
			});

			const session = tracker.getSessions()[0];
			expect(session.state).toBe(State.BUSY);
			expect(session.lastTool).toBe("Edit");
		});

		it("stays busy between PreToolUse and PostToolUse", () => {
			tracker.handleEvent({
				session: "s1",
				state: "busy",
				cwd: "/proj",
				tool: "Edit",
			});
			// PostToolUse also sends busy
			tracker.handleEvent({ session: "s1", state: "busy", tool: "Edit" });

			expect(tracker.getSessions()[0].state).toBe(State.BUSY);
		});

		it("stays busy during long tool runs", () => {
			tracker.handleEvent({
				session: "s1",
				state: "busy",
				cwd: "/proj",
				tool: "Edit",
			});

			vi.advanceTimersByTime(42 * 60 * 1000);

			expect(tracker.getSessions()[0].state).toBe(State.BUSY);
		});

		it("transitions to idle only on idle event (Stop hook)", () => {
			tracker.handleEvent({
				session: "s1",
				state: "busy",
				cwd: "/proj",
				tool: "Edit",
			});
			tracker.handleEvent({ session: "s1", state: "idle" });

			expect(tracker.getSessions()[0].state).toBe(State.IDLE);
		});

		it("clears lastTool on idle", () => {
			tracker.handleEvent({
				session: "s1",
				state: "busy",
				cwd: "/proj",
				tool: "Edit",
			});
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

			tracker.handleEvent({
				session: "s1",
				state: "busy",
				cwd: "/proj/frontend",
			});
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

		it("subagentActivity increments on SubagentStop hookType", () => {
			tracker.handleEvent({ session: "s1", state: "busy", cwd: "/proj" });
			tracker.handleEvent({
				session: "s1",
				state: "busy",
				hookType: "SubagentStop",
			});

			expect(tracker.getSessions()[0].subagentActivity).toBe(1);

			tracker.handleEvent({
				session: "s1",
				state: "busy",
				hookType: "SubagentStop",
			});
			expect(tracker.getSessions()[0].subagentActivity).toBe(2);
		});

		it("subagentActivity resets to 0 on idle", () => {
			tracker.handleEvent({ session: "s1", state: "busy", cwd: "/proj" });
			tracker.handleEvent({
				session: "s1",
				state: "busy",
				hookType: "SubagentStop",
			});
			tracker.handleEvent({
				session: "s1",
				state: "busy",
				hookType: "SubagentStop",
			});
			expect(tracker.getSessions()[0].subagentActivity).toBe(2);

			tracker.handleEvent({ session: "s1", state: "idle" });
			expect(tracker.getSessions()[0].subagentActivity).toBe(0);
		});

		it("stays busy on Stop when transcript shows pending Agent invocations", () => {
			tracker.handleEvent({ session: "s1", state: "busy", cwd: "/proj" });
			tracker.handleEvent({
				session: "s1",
				state: "idle",
				hookType: "Stop",
				pendingAgents: 1,
			});

			expect(tracker.getSessions()[0].state).toBe(State.BUSY);
		});

		it("transitions to idle on Stop when transcript shows no pending invocations", () => {
			tracker.handleEvent({ session: "s1", state: "busy", cwd: "/proj" });
			tracker.handleEvent({
				session: "s1",
				state: "idle",
				hookType: "Stop",
				pendingAgents: 0,
			});

			expect(tracker.getSessions()[0].state).toBe(State.IDLE);
		});

		it("transitions to idle on SubagentStop after deferred Stop when pending drops to 0", () => {
			// Background agent path: parent Stop fires while subagent still running.
			tracker.handleEvent({ session: "s1", state: "busy", cwd: "/proj" });
			tracker.handleEvent({
				session: "s1",
				state: "idle",
				hookType: "Stop",
				pendingAgents: 1,
			});
			expect(tracker.getSessions()[0].state).toBe(State.BUSY);

			// SubagentStop fires — transcript now shows 0 pending.
			tracker.handleEvent({
				session: "s1",
				state: "busy",
				hookType: "SubagentStop",
				pendingAgents: 0,
			});
			expect(tracker.getSessions()[0].state).toBe(State.IDLE);
			expect(tracker.getSessions()[0].subagentActivity).toBe(0);
		});

		it("stays busy on SubagentStop while more subagents remain pending", () => {
			tracker.handleEvent({ session: "s1", state: "busy", cwd: "/proj" });
			// Stop fires while 2 subagents pending.
			tracker.handleEvent({
				session: "s1",
				state: "idle",
				hookType: "Stop",
				pendingAgents: 2,
			});
			expect(tracker.getSessions()[0].state).toBe(State.BUSY);

			// First finishes — 1 remains.
			tracker.handleEvent({
				session: "s1",
				state: "busy",
				hookType: "SubagentStop",
				pendingAgents: 1,
			});
			expect(tracker.getSessions()[0].state).toBe(State.BUSY);

			// Last finishes.
			tracker.handleEvent({
				session: "s1",
				state: "busy",
				hookType: "SubagentStop",
				pendingAgents: 0,
			});
			expect(tracker.getSessions()[0].state).toBe(State.IDLE);
		});

		it("clears turnComplete when new turn starts before SubagentStop arrives", () => {
			tracker.handleEvent({ session: "s1", state: "busy", cwd: "/proj" });
			tracker.handleEvent({
				session: "s1",
				state: "idle",
				hookType: "Stop",
				pendingAgents: 1,
			});

			// New prompt starts a new turn before subagent finishes.
			tracker.handleEvent({
				session: "s1",
				state: "busy",
				hookType: "UserPromptSubmit",
			});

			// Late SubagentStop — pending finally 0, but new turn is live.
			tracker.handleEvent({
				session: "s1",
				state: "busy",
				hookType: "SubagentStop",
				pendingAgents: 0,
			});
			expect(tracker.getSessions()[0].state).toBe(State.BUSY);
		});

		it("ignores stale SubagentStop when session is already idle and nothing pending", () => {
			// Bug A guard: SubagentStop after a clean idle must not revive busy.
			tracker.handleEvent({ session: "s1", state: "busy", cwd: "/proj" });
			tracker.handleEvent({
				session: "s1",
				state: "idle",
				hookType: "Stop",
				pendingAgents: 0,
			});
			expect(tracker.getSessions()[0].state).toBe(State.IDLE);

			tracker.handleEvent({
				session: "s1",
				state: "busy",
				hookType: "SubagentStop",
				pendingAgents: 0,
			});
			expect(tracker.getSessions()[0].state).toBe(State.IDLE);
			expect(tracker.getSessions()[0].subagentActivity).toBe(0);
		});

		it("pending from idle is now accepted (bug fix)", () => {
			tracker.handleEvent({ session: "s1", state: "idle", cwd: "/proj" });
			tracker.handleEvent({
				session: "s1",
				state: "pending",
				message: "Permission needed",
			});

			const session = tracker.getSessions()[0];
			expect(session.state).toBe(State.PENDING);
			expect(session.pendingMessage).toBe("Permission needed");
		});

		it("ghost session guard still works", () => {
			tracker.handleEvent({
				session: "unknown-id",
				state: "pending",
				message: "hi",
			});
			expect(tracker.getSessions()).toHaveLength(0);
		});

		it("stores permissionRequest on pending event", () => {
			tracker.handleEvent({ session: "s1", state: "busy", cwd: "/proj" });
			tracker.handleEvent({
				session: "s1",
				state: "pending",
				permissionRequest: { toolName: "Bash", toolInput: "npm test" },
			});

			const session = tracker.getSession("s1");
			expect(session.permissionRequest).toEqual({
				toolName: "Bash",
				toolInput: "npm test",
			});
		});

		it("clears permissionRequest when state leaves pending", () => {
			tracker.handleEvent({ session: "s1", state: "busy", cwd: "/proj" });
			tracker.handleEvent({
				session: "s1",
				state: "pending",
				permissionRequest: { toolName: "Bash", toolInput: "npm test" },
			});
			tracker.handleEvent({ session: "s1", state: "busy", tool: "Bash" });

			const session = tracker.getSession("s1");
			expect(session.permissionRequest).toBeNull();
		});

		it("includes permissionRequest in getSessions output", () => {
			tracker.handleEvent({ session: "s1", state: "busy", cwd: "/proj" });
			tracker.handleEvent({
				session: "s1",
				state: "pending",
				permissionRequest: { toolName: "Edit", toolInput: "src/foo.js" },
			});

			const sessions = tracker.getSessions();
			expect(sessions[0].permissionRequest).toEqual({
				toolName: "Edit",
				toolInput: "src/foo.js",
			});
		});

		it("links windowHandle from storeWindowHandle for spawned sessions", () => {
			tracker.storeWindowHandle("/proj", 123, "proj 7f3a");
			tracker.handleEvent({ session: "s1", state: "idle", cwd: "/proj" });
			const session = tracker.getSessions()[0];
			expect(session.windowHandle).toBe(123);
			expect(session.displayName).toBe("proj 7f3a");
		});

		it("storeWindowHandle deletes stale pendingLink when HWND already assigned by auto-link", () => {
			// Simulate auto-link winning the race: session created and linked before spawn returns
			tracker.handleEvent({ session: "s1", state: "idle", cwd: "/proj" });
			tracker.linkSessionById("s1", 123);
			// Spawn returns late — storeWindowHandle should NOT leave a stale pendingLink
			tracker.storeWindowHandle("/proj", 123, "proj 7f3a");

			// Next session for same cwd should NOT pick up the stale pendingLink
			tracker.handleEvent({ session: "s2", state: "idle", cwd: "/proj" });
			const s2 = tracker.getSessions().find((s) => s.id === "s2");
			expect(s2.windowHandle).toBeNull();
			expect(s2.displayName).not.toBe("proj 7f3a");
		});
	});

	describe("display name extraction", () => {
		it("extracts last path segment", () => {
			expect(
				tracker.getSessionDisplayName("/home/user/projects/api-server"),
			).toBe("api-server");
		});

		it("handles windows paths", () => {
			expect(
				tracker.getSessionDisplayName("C:\\Users\\dev\\projects\\web"),
			).toBe("web");
		});

		it("handles trailing slash", () => {
			expect(tracker.getSessionDisplayName("/home/user/projects/api/")).toBe(
				"api",
			);
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

		it("linkSessionById sets displayName to projectName + hex", () => {
			tracker.handleEvent({ session: "s1", state: "idle", cwd: "/proj" });
			const result = tracker.linkSessionById("s1", 123);
			expect(result.displayName).toMatch(/^proj [0-9a-f]{4}$/);
			expect(result.renamed).toBe(true);
			expect(tracker.getSessions()[0].displayName).toBe(result.displayName);
		});

		it("linkSessionById reuses valid window title instead of generating new hex", () => {
			tracker.handleEvent({ session: "s1", state: "idle", cwd: "/proj" });
			const result = tracker.linkSessionById("s1", 123, "proj 7f3a");
			expect(result.displayName).toBe("proj 7f3a");
			expect(result.renamed).toBe(false);
			expect(tracker.getSessions()[0].displayName).toBe("proj 7f3a");
		});

		it("linkSessionById generates new hex when window title doesn't match format", () => {
			tracker.handleEvent({ session: "s1", state: "idle", cwd: "/proj" });
			const result = tracker.linkSessionById("s1", 123, "Command Prompt");
			expect(result.displayName).toMatch(/^proj [0-9a-f]{4}$/);
			expect(result.renamed).toBe(true);
		});

		it("linkSessionById generates new hex when reused title is taken by another session", () => {
			tracker.handleEvent({ session: "s1", state: "idle", cwd: "/proj" });
			tracker.linkSessionById("s1", 100, "proj 7f3a");
			// S1 now has displayName "proj 7f3a"

			tracker.handleEvent({ session: "s2", state: "idle", cwd: "/proj" });
			const result = tracker.linkSessionById("s2", 200, "proj 7f3a");
			// Should generate new hex, not append " 2"
			expect(result.displayName).toMatch(/^proj [0-9a-f]{4}$/);
			expect(result.displayName).not.toBe("proj 7f3a");
			expect(result.renamed).toBe(true);
		});

		it("linkSessionById returns null for unknown session", () => {
			const result = tracker.linkSessionById("nope", 123);
			expect(result).toBeNull();
		});

		it("skips linked sessions (dead-window pruning handles those)", () => {
			tracker.handleEvent({ session: "s1", state: "busy", cwd: "/proj" });
			tracker.linkSessionById("s1", 12345);

			vi.advanceTimersByTime(STALE_SESSION_TIMEOUT_MS + 1);
			tracker.pruneStale();

			expect(tracker.getSessions()).toHaveLength(1);
			expect(tracker.getSessions()[0].id).toBe("s1");
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
			tracker.handleEvent({ session: "s2", state: "busy", cwd: "/b" });
			tracker.handleEvent({ session: "s2", state: "pending", cwd: "/b" });

			expect(tracker.getAggregateState()).toBe(State.PENDING);
		});

		it("returns busy over idle", () => {
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
			tracker.handleEvent({ session: "s1", state: "busy", cwd: "/proj" });
			stateChanges.length = 0;
			tracker.handleEvent({
				session: "s1",
				state: "pending",
				cwd: "/proj",
				message: "hi",
			});

			expect(stateChanges).toHaveLength(1);
			expect(stateChanges[0].aggregateState).toBe(State.PENDING);
		});

		it("includes all sessions in notification", () => {
			tracker.handleEvent({ session: "s1", state: "busy", cwd: "/a" });
			tracker.handleEvent({ session: "s2", state: "busy", cwd: "/b" });

			expect(stateChanges[1].sessions).toHaveLength(2);
		});
	});

	describe("getLinkedHandles", () => {
		it("returns empty set when no sessions have window handles", () => {
			tracker.handleEvent({ session: "s1", state: "idle", cwd: "/proj-a" });
			tracker.handleEvent({ session: "s2", state: "idle", cwd: "/proj-b" });

			const handles = tracker.getLinkedHandles();
			expect(handles).toEqual(new Set());
		});

		it("returns set of all non-null window handles", () => {
			tracker.handleEvent({ session: "s1", state: "idle", cwd: "/proj-a" });
			tracker.storeWindowHandle("/proj-a", 111, "proj-a ab12");

			tracker.handleEvent({ session: "s2", state: "idle", cwd: "/proj-b" });
			// s2 remains unlinked

			tracker.handleEvent({ session: "s3", state: "idle", cwd: "/proj-c" });
			tracker.storeWindowHandle("/proj-c", 222, "proj-c cd34");

			const handles = tracker.getLinkedHandles();
			expect(handles).toEqual(new Set([111, 222]));
		});
	});

	describe("alert gating on linked status", () => {
		it("fires onPendingAlert for linked sessions", () => {
			const pendingAlerts = [];
			const alertTracker = createSessionTracker({
				onPendingAlert: (s) => pendingAlerts.push(s.id),
			});

			alertTracker.handleEvent({ session: "s1", state: "idle", cwd: "/proj" });
			alertTracker.linkSessionById("s1", 123);

			alertTracker.handleEvent({
				session: "s1",
				state: "pending",
				message: "Need approval",
			});
			expect(pendingAlerts).toContain("s1");
			alertTracker.stop();
		});

		it("does not fire onPendingAlert for unlinked sessions", () => {
			const pendingAlerts = [];
			const alertTracker = createSessionTracker({
				onPendingAlert: (s) => pendingAlerts.push(s.id),
			});

			alertTracker.handleEvent({ session: "s1", state: "idle", cwd: "/proj" });
			alertTracker.handleEvent({
				session: "s1",
				state: "pending",
				message: "Need approval",
			});
			expect(pendingAlerts).toHaveLength(0);
			alertTracker.stop();
		});

		it("fires onIdleAlert for linked sessions", () => {
			const idleAlerts = [];
			const alertTracker = createSessionTracker({
				onIdleAlert: (s) => idleAlerts.push(s.id),
			});

			alertTracker.handleEvent({ session: "s1", state: "busy", cwd: "/proj" });
			alertTracker.linkSessionById("s1", 123);

			alertTracker.handleEvent({ session: "s1", state: "idle" });
			expect(idleAlerts).toContain("s1");
			alertTracker.stop();
		});

		it("does not fire onIdleAlert for unlinked sessions", () => {
			const idleAlerts = [];
			const alertTracker = createSessionTracker({
				onIdleAlert: (s) => idleAlerts.push(s.id),
			});

			alertTracker.handleEvent({ session: "s1", state: "busy", cwd: "/proj" });
			alertTracker.handleEvent({ session: "s1", state: "idle" });
			expect(idleAlerts).toHaveLength(0);
			alertTracker.stop();
		});
	});

	describe("setPermissionRequest", () => {
		it("updates session.permissionRequest without changing state or stateChangedAt", () => {
			const tracker = createSessionTracker();
			tracker.handleEvent({ session: "s1", state: "idle", cwd: "/p", ts: 1 });
			tracker.handleEvent({
				session: "s1",
				state: "pending",
				permissionRequest: { toolName: "Bash", toolInput: "ls", id: "p1" },
				ts: 2,
			});
			const before = tracker.getSession("s1");
			const changedAt = before.stateChangedAt;

			tracker.setPermissionRequest("s1", {
				toolName: "WebSearch",
				toolInput: "query",
				id: "p2",
			});

			const after = tracker.getSession("s1");
			expect(after.state).toBe("pending");
			expect(after.stateChangedAt).toBe(changedAt);
			expect(after.permissionRequest.toolName).toBe("WebSearch");
			expect(after.permissionRequest.id).toBe("p2");
		});

		it("clears the permission when passed null without transitioning state", () => {
			const tracker = createSessionTracker();
			tracker.handleEvent({ session: "s1", state: "idle", cwd: "/p", ts: 1 });
			tracker.handleEvent({
				session: "s1",
				state: "pending",
				permissionRequest: { toolName: "Bash", toolInput: "ls", id: "p1" },
				ts: 2,
			});

			tracker.setPermissionRequest("s1", null);

			const s = tracker.getSession("s1");
			expect(s.permissionRequest).toBe(null);
			// State machine unchanged by this helper — it's the caller's job to transition
			expect(s.state).toBe("pending");
		});

		it("is a no-op for unknown sessions", () => {
			const tracker = createSessionTracker();
			expect(() => tracker.setPermissionRequest("unknown", null)).not.toThrow();
		});
	});
});
