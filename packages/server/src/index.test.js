import http from "node:http";
import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";

// Mock all side-effectful dependencies BEFORE importing index.js
vi.mock("./focus.js", () => ({
	focusTerminal: vi.fn(),
	findDeadWindows: vi.fn().mockResolvedValue(new Set()),
	renameTerminal: vi.fn(),
	// Nesting-only admission is Windows-only; default off so every
	// pre-existing test here keeps today's unconditional-creation behavior.
	isWindowsHost: vi.fn(() => false),
}));

vi.mock("./git-status.js", () => ({
	getGitStatus: vi.fn().mockResolvedValue({ isGit: false }),
}));

vi.mock("./project-storage.js", () => ({
	trackProject: vi.fn(),
}));

vi.mock("./avatar-storage.js", () => ({
	ensureDefaults: vi.fn().mockResolvedValue(undefined),
	getActiveSetPath: vi.fn().mockResolvedValue("/tmp"),
	listSets: vi.fn(),
	getActiveSet: vi.fn(),
	createSet: vi.fn(),
	deleteSet: vi.fn(),
	setActiveSet: vi.fn(),
	isValidSetName: vi.fn(() => true),
	getSetPath: vi.fn(() => "/tmp"),
	VALID_FILENAMES: new Set(["idle.webm"]),
}));

vi.mock("./routes-api.js", () => ({
	registerApiRoutes: vi.fn(),
}));

vi.mock("./sfx.js", () => ({
	createSFX: vi.fn(() => ({ getSoundsForUpdate: vi.fn(() => []) })),
}));

vi.mock("./preferences.js", () => ({
	getPreferences: vi.fn().mockResolvedValue({}),
}));

// Window resolution shells out to PowerShell — never from a unit test.
vi.mock("./pid-ancestry.js", () => ({
	resolveTerminalWindow: vi.fn().mockResolvedValue(null),
}));

// Imported after the mock above — resolves to the same vi.fn() reference,
// so tests can flip the platform branch without touching process.platform.
import { findDeadWindows, isWindowsHost, renameTerminal } from "./focus.js";
import { resolveTerminalWindow } from "./pid-ancestry.js";

let app, tracker, server, baseUrl, pruneDeadLinkedSessions;

beforeAll(async () => {
	const mod = await import("./index.js");
	app = mod.app;
	tracker = mod.tracker;
	pruneDeadLinkedSessions = mod.pruneDeadLinkedSessions;

	server = await new Promise((resolve) => {
		const s = app.listen(0, "127.0.0.1", () => resolve(s));
	});
	baseUrl = `http://127.0.0.1:${server.address().port}`;
});

afterAll(() => {
	server?.close();
});

function request(method, path, body, extraHeaders) {
	return new Promise((resolve, reject) => {
		const url = new URL(path, baseUrl);
		const opts = {
			method,
			hostname: url.hostname,
			port: url.port,
			path: url.pathname,
		};
		if (body || extraHeaders) {
			opts.headers = {
				...(body ? { "Content-Type": "application/json" } : {}),
				...extraHeaders,
			};
		}
		const req = http.request(opts, (res) => {
			let data = "";
			res.on("data", (c) => (data += c));
			res.on("end", () => {
				try {
					resolve({
						status: res.statusCode,
						body: JSON.parse(data),
						headers: res.headers,
					});
				} catch {
					resolve({ status: res.statusCode, body: data, headers: res.headers });
				}
			});
		});
		req.on("error", reject);
		if (body) req.write(JSON.stringify(body));
		req.end();
	});
}

describe("POST /event validation", () => {
	it("returns 400 when session is missing", async () => {
		const res = await request("POST", "/event", { state: "busy" });
		expect(res.status).toBe(400);
		expect(res.body.error).toMatch(/session/i);
	});

	it("returns 400 when state is missing", async () => {
		const res = await request("POST", "/event", { session: "s1" });
		expect(res.status).toBe(400);
		expect(res.body.error).toMatch(/session|state/i);
	});

	it("returns 400 for an invalid state value", async () => {
		const res = await request("POST", "/event", {
			session: "s1",
			state: "dancing",
		});
		expect(res.status).toBe(400);
		expect(res.body.error).toMatch(/invalid state/i);
	});

	it("returns 400 when session field exceeds 100 characters", async () => {
		const longSession = "x".repeat(101);
		const res = await request("POST", "/event", {
			session: longSession,
			state: "busy",
		});
		expect(res.status).toBe(400);
		expect(res.body.error).toMatch(/too long/i);
	});

	it("returns 200 for a valid event with state busy", async () => {
		const res = await request("POST", "/event", {
			session: "valid-session-busy",
			state: "busy",
			cwd: "/home/user/project",
		});
		expect(res.status).toBe(200);
		expect(res.body.ok).toBe(true);
	});

	it("returns 200 for a valid event with state stopped", async () => {
		// First create the session so stopped has something to remove
		await request("POST", "/event", {
			session: "valid-session-stopped",
			state: "busy",
			cwd: "/home/user/project",
		});
		const res = await request("POST", "/event", {
			session: "valid-session-stopped",
			state: "stopped",
		});
		expect(res.status).toBe(200);
		expect(res.body.ok).toBe(true);
	});
});

describe("POST /hook/:type validation", () => {
	it("returns 400 for an unknown hook type", async () => {
		const res = await request("POST", "/hook/UnknownHook", {
			session_id: "s1",
			cwd: "/proj",
		});
		expect(res.status).toBe(400);
		expect(res.body.error).toMatch(/unknown hook type/i);
	});

	it("returns 200 for a valid hook type with a valid payload", async () => {
		const res = await request("POST", "/hook/SessionStart", {
			session_id: "hook-session-1",
			cwd: "/proj",
		});
		expect(res.status).toBe(200);
		expect(res.body.ok).toBe(true);
	});
});

describe("POST /hook/:type — nesting-only admission (Windows only)", () => {
	afterEach(() => {
		isWindowsHost.mockReturnValue(false);
	});

	it("off-Windows: a hook with no header still creates a session (unchanged)", async () => {
		isWindowsHost.mockReturnValue(false);
		await request("POST", "/hook/PreToolUse", {
			session_id: "admit-off-win",
			tool_name: "Edit",
			cwd: "/proj",
		});
		expect(tracker.getSession("admit-off-win")).not.toBeNull();
	});

	it("on Windows: a non-header hook type never creates a new session", async () => {
		isWindowsHost.mockReturnValue(true);
		const res = await request("POST", "/hook/PreToolUse", {
			session_id: "admit-preTool-refused",
			tool_name: "Edit",
			cwd: "/proj",
		});
		expect(res.status).toBe(200);
		expect(tracker.getSession("admit-preTool-refused")).toBeNull();
	});

	it("on Windows: a non-header hook type still updates an existing session", async () => {
		await request("POST", "/hook/SessionStart", {
			session_id: "admit-existing",
			cwd: "/proj",
		});
		isWindowsHost.mockReturnValue(true);
		const res = await request("POST", "/hook/PreToolUse", {
			session_id: "admit-existing",
			tool_name: "Edit",
			cwd: "/proj",
		});
		expect(res.status).toBe(200);
		expect(tracker.getSession("admit-existing").state).toBe("busy");
	});

	it("on Windows: SessionStart with no header and no pending link is admitted (fail open) — HWND_PREAMBLE's ancestor walk can return empty for reasons unrelated to nesting, and refusing here would erase a real session's card instead of just leaving it unlinked for pruneStale", async () => {
		isWindowsHost.mockReturnValue(true);
		const res = await request("POST", "/hook/SessionStart", {
			session_id: "admit-no-header",
			cwd: "/proj",
		});
		expect(res.status).toBe(200);
		expect(tracker.getSession("admit-no-header")).not.toBeNull();
	});

	it("on Windows: SessionStart with a window header creates and links", async () => {
		isWindowsHost.mockReturnValue(true);
		const res = await request(
			"POST",
			"/hook/SessionStart",
			{ session_id: "admit-with-header", cwd: "/proj" },
			{ "X-Hook-Window": "777|My Terminal" },
		);
		expect(res.status).toBe(200);
		const session = tracker.getSession("admit-with-header");
		expect(session).not.toBeNull();
		expect(session.windowHandle).toBe(777);
	});

	it("on Windows: a shared HWND already held by another session is still admitted (not nested) — the collision predicate's regression, now locked down", async () => {
		isWindowsHost.mockReturnValue(true);
		await request(
			"POST",
			"/hook/SessionStart",
			{ session_id: "admit-holder", cwd: "/proj-a" },
			{ "X-Hook-Window": "888|Term" },
		);
		const res = await request(
			"POST",
			"/hook/SessionStart",
			{ session_id: "admit-sibling", cwd: "/proj-b" },
			{ "X-Hook-Window": "888|Term" },
		);
		expect(res.status).toBe(200);
		const sibling = tracker.getSession("admit-sibling");
		expect(sibling).not.toBeNull();
		expect(sibling.windowHandle).toBe(888);
		expect(tracker.getSession("admit-holder").windowHandle).toBe(888);
	});

	it("on Windows: X-Hook-Nested of 1 (own claude process only) is not nested — still admitted", async () => {
		isWindowsHost.mockReturnValue(true);
		const res = await request(
			"POST",
			"/hook/SessionStart",
			{ session_id: "admit-not-nested", cwd: "/proj-nn" },
			{ "X-Hook-Window": "444|Term", "X-Hook-Nested": "1" },
		);
		expect(res.status).toBe(200);
		expect(tracker.getSession("admit-not-nested")).not.toBeNull();
	});

	it("on Windows: X-Hook-Nested of 2 or more is refused even with a resolved HWND", async () => {
		isWindowsHost.mockReturnValue(true);
		const res = await request(
			"POST",
			"/hook/SessionStart",
			{ session_id: "admit-nested", cwd: "/proj-nested" },
			{ "X-Hook-Window": "555|Term", "X-Hook-Nested": "2" },
		);
		expect(res.status).toBe(200);
		expect(tracker.getSession("admit-nested")).toBeNull();
	});

	it("on Windows: a Claudia-spawned cwd (pendingLinks) is admitted without a header", async () => {
		isWindowsHost.mockReturnValue(true);
		tracker.storeWindowHandle("/proj-spawned", 999, "spawned abcd");
		const res = await request("POST", "/hook/SessionStart", {
			session_id: "admit-pending-link",
			cwd: "/proj-spawned",
		});
		expect(res.status).toBe(200);
		const session = tracker.getSession("admit-pending-link");
		expect(session).not.toBeNull();
		expect(session.windowHandle).toBe(999);
	});

	it("POST /event keeps unconditional creation regardless of platform", async () => {
		isWindowsHost.mockReturnValue(true);
		const res = await request("POST", "/event", {
			session: "admit-legacy-event",
			state: "busy",
			cwd: "/proj",
		});
		expect(res.status).toBe(200);
		expect(tracker.getSession("admit-legacy-event")).not.toBeNull();
	});
});

describe("POST /hook/:type — server-side window resolution (X-Hook-Pid)", () => {
	afterEach(() => {
		isWindowsHost.mockReturnValue(false);
		resolveTerminalWindow.mockReset();
		resolveTerminalWindow.mockResolvedValue(null);
	});

	it("resolves from the pid the hook sent and links with what comes back", async () => {
		isWindowsHost.mockReturnValue(true);
		resolveTerminalWindow.mockResolvedValue({
			hwnd: 4242,
			title: "proj-pid ab12",
			claudeCount: 1,
		});
		const res = await request(
			"POST",
			"/hook/SessionStart",
			{ session_id: "pid-link", cwd: "/proj-pid" },
			{ "X-Hook-Pid": "31337" },
		);
		expect(res.status).toBe(200);
		expect(resolveTerminalWindow).toHaveBeenCalledWith("31337");
		const session = tracker.getSession("pid-link");
		expect(session.windowHandle).toBe(4242);
		// The resolver's title reaches linkSessionById, which reuses a
		// Claudia-shaped one verbatim rather than generating a fresh hex.
		expect(session.displayName).toBe("proj-pid ab12");
	});

	it("gates nesting on the resolver's claudeCount — the card is never created", async () => {
		isWindowsHost.mockReturnValue(true);
		resolveTerminalWindow.mockResolvedValue({
			hwnd: 4243,
			title: "Term",
			claudeCount: 2,
		});
		const res = await request(
			"POST",
			"/hook/SessionStart",
			{ session_id: "pid-nested", cwd: "/proj-pid-nested" },
			{ "X-Hook-Pid": "31338" },
		);
		expect(res.status).toBe(200);
		expect(tracker.getSession("pid-nested")).toBeNull();
	});

	it("admits the session unlinked when resolution returns null", async () => {
		isWindowsHost.mockReturnValue(true);
		resolveTerminalWindow.mockResolvedValue(null);
		const res = await request(
			"POST",
			"/hook/SessionStart",
			{ session_id: "pid-unresolved", cwd: "/proj-pid-unresolved" },
			{ "X-Hook-Pid": "31339" },
		);
		expect(res.status).toBe(200);
		const session = tracker.getSession("pid-unresolved");
		expect(session).not.toBeNull();
		expect(session.windowHandle).toBeNull();
	});

	it("skips resolution entirely for a session that already holds a window handle", async () => {
		isWindowsHost.mockReturnValue(true);
		resolveTerminalWindow.mockResolvedValue({
			hwnd: 4244,
			title: "Term",
			claudeCount: 1,
		});
		await request(
			"POST",
			"/hook/SessionStart",
			{ session_id: "pid-linked", cwd: "/proj-pid-linked" },
			{ "X-Hook-Pid": "31340" },
		);
		expect(tracker.getSession("pid-linked").windowHandle).toBe(4244);

		resolveTerminalWindow.mockClear();
		const res = await request(
			"POST",
			"/hook/UserPromptSubmit",
			{ session_id: "pid-linked", cwd: "/proj-pid-linked" },
			{ "X-Hook-Pid": "31340" },
		);
		expect(res.status).toBe(200);
		expect(resolveTerminalWindow).not.toHaveBeenCalled();
		expect(tracker.getSession("pid-linked").windowHandle).toBe(4244);
	});

	it("answers the request even when resolution rejects", async () => {
		isWindowsHost.mockReturnValue(true);
		resolveTerminalWindow.mockRejectedValue(new Error("boom"));
		const res = await request(
			"POST",
			"/hook/SessionStart",
			{ session_id: "pid-rejected", cwd: "/proj-pid-rejected" },
			{ "X-Hook-Pid": "31341" },
		);
		expect(res.status).toBe(200);
		expect(res.body.ok).toBe(true);
		expect(tracker.getSession("pid-rejected")).not.toBeNull();
	});

	it("legacy install: no pid header keeps the X-Hook-Window path, resolver untouched", async () => {
		isWindowsHost.mockReturnValue(true);
		const res = await request(
			"POST",
			"/hook/SessionStart",
			{ session_id: "pid-legacy", cwd: "/proj-pid-legacy" },
			{ "X-Hook-Window": "606|Term", "X-Hook-Nested": "1" },
		);
		expect(res.status).toBe(200);
		expect(resolveTerminalWindow).not.toHaveBeenCalled();
		expect(tracker.getSession("pid-legacy").windowHandle).toBe(606);
	});

	it("legacy install: an empty pid header falls back to the legacy headers", async () => {
		isWindowsHost.mockReturnValue(true);
		const res = await request(
			"POST",
			"/hook/SessionStart",
			{ session_id: "pid-empty", cwd: "/proj-pid-empty" },
			{ "X-Hook-Pid": "", "X-Hook-Window": "607|Term" },
		);
		expect(res.status).toBe(200);
		expect(resolveTerminalWindow).not.toHaveBeenCalled();
		expect(tracker.getSession("pid-empty").windowHandle).toBe(607);
	});
});

describe("auto-link never renames the terminal", () => {
	afterEach(() => {
		isWindowsHost.mockReturnValue(false);
		resolveTerminalWindow.mockReset();
		resolveTerminalWindow.mockResolvedValue(null);
	});

	it("leaves the window title alone when it generates a fresh display name", async () => {
		isWindowsHost.mockReturnValue(true);
		renameTerminal.mockClear();
		resolveTerminalWindow.mockResolvedValue({
			hwnd: 5150,
			title: "Windows Terminal",
			claudeCount: 1,
			claudePid: 4001,
		});
		await request(
			"POST",
			"/hook/SessionStart",
			{ session_id: "no-rename-generated", cwd: "/proj-nr" },
			{ "X-Hook-Pid": "41000" },
		);
		const session = tracker.getSession("no-rename-generated");
		expect(session.windowHandle).toBe(5150);
		// The card still gets its own generated name...
		expect(session.displayName).toMatch(/^proj-nr [0-9a-f]{4}$/);
		// ...but the window, which may host other sessions' tabs, is untouched.
		expect(renameTerminal).not.toHaveBeenCalled();
	});

	it("leaves the window title alone on the legacy header path too", async () => {
		isWindowsHost.mockReturnValue(true);
		renameTerminal.mockClear();
		await request(
			"POST",
			"/hook/SessionStart",
			{ session_id: "no-rename-legacy", cwd: "/proj-nrl" },
			{ "X-Hook-Window": "5151|Windows Terminal", "X-Hook-Nested": "1" },
		);
		expect(tracker.getSession("no-rename-legacy").windowHandle).toBe(5151);
		expect(renameTerminal).not.toHaveBeenCalled();
	});

	it("still adopts a spawned terminal's locked Claudia title on reconnect", async () => {
		isWindowsHost.mockReturnValue(true);
		renameTerminal.mockClear();
		resolveTerminalWindow.mockResolvedValue({
			hwnd: 5152,
			title: "proj-sp 7f3a",
			claudeCount: 1,
			claudePid: 4002,
		});
		await request(
			"POST",
			"/hook/SessionStart",
			{ session_id: "reuse-spawn-title", cwd: "/proj-sp" },
			{ "X-Hook-Pid": "41001" },
		);
		expect(tracker.getSession("reuse-spawn-title").displayName).toBe(
			"proj-sp 7f3a",
		);
		expect(renameTerminal).not.toHaveBeenCalled();
	});
});

describe("pruneDeadLinkedSessions — liveness from the session's own process", () => {
	let killSpy;

	beforeEach(() => {
		killSpy = vi.spyOn(process, "kill").mockImplementation(() => true);
	});

	afterEach(() => {
		killSpy.mockRestore();
		isWindowsHost.mockReturnValue(false);
		resolveTerminalWindow.mockReset();
		resolveTerminalWindow.mockResolvedValue(null);
		findDeadWindows.mockClear();
		findDeadWindows.mockResolvedValue(new Set());
	});

	async function linkViaPid(sessionId, cwd, hwnd, claudePid, hookPid) {
		isWindowsHost.mockReturnValue(true);
		resolveTerminalWindow.mockResolvedValue({
			hwnd,
			title: "Windows Terminal",
			claudeCount: 1,
			claudePid,
		});
		await request(
			"POST",
			"/hook/SessionStart",
			{ session_id: sessionId, cwd },
			{ "X-Hook-Pid": hookPid },
		);
	}

	function killThrows(code) {
		killSpy.mockImplementation(() => {
			const err = new Error(code);
			err.code = code;
			throw err;
		});
	}

	it("removes a linked session whose own claude process is gone (ESRCH)", async () => {
		await linkViaPid("prune-dead-proc", "/p-dead", 6001, 7001, "42001");
		expect(tracker.getSession("prune-dead-proc").windowHandle).toBe(6001);

		killThrows("ESRCH");
		await pruneDeadLinkedSessions();

		expect(tracker.getSession("prune-dead-proc")).toBeNull();
		expect(killSpy).toHaveBeenCalledWith(7001, 0);
	});

	it("keeps a linked session whose claude process is alive, even when its window reads dead", async () => {
		await linkViaPid("prune-live-proc", "/p-live", 6002, 7002, "42002");
		findDeadWindows.mockResolvedValue(new Set([6002]));

		await pruneDeadLinkedSessions();

		expect(tracker.getSession("prune-live-proc")).not.toBeNull();
		// The window sweep is never even asked about a pid-carrying session.
		const asked = findDeadWindows.mock.calls.at(-1)?.[0] ?? [];
		expect(asked).not.toContain(6002);
	});

	it("counts EPERM as alive — the process exists, we just cannot signal it", async () => {
		await linkViaPid("prune-eperm", "/p-eperm", 6003, 7003, "42003");

		killThrows("EPERM");
		await pruneDeadLinkedSessions();

		expect(tracker.getSession("prune-eperm")).not.toBeNull();
	});

	it("never lets an unexpected probe failure escape the sweep", async () => {
		await linkViaPid("prune-weird", "/p-weird", 6005, 7005, "42005");

		killSpy.mockImplementation(() => {
			throw new Error("something unexpected");
		});
		await expect(pruneDeadLinkedSessions()).resolves.toBeUndefined();
		expect(tracker.getSession("prune-weird")).not.toBeNull();
	});

	it("legacy session with no claudePid still prunes on window death", async () => {
		isWindowsHost.mockReturnValue(true);
		await request(
			"POST",
			"/hook/SessionStart",
			{ session_id: "prune-legacy", cwd: "/p-legacy" },
			{ "X-Hook-Window": "6004|Term", "X-Hook-Nested": "1" },
		);
		expect(tracker.getSession("prune-legacy").windowHandle).toBe(6004);
		expect(tracker.getSession("prune-legacy").claudePid).toBeNull();

		findDeadWindows.mockResolvedValue(new Set([6004]));
		await pruneDeadLinkedSessions();

		expect(tracker.getSession("prune-legacy")).toBeNull();
	});

	it("sweeps process-checked and window-checked sessions together", async () => {
		await linkViaPid("prune-mixed-proc", "/p-mixed-a", 6006, 7006, "42006");
		isWindowsHost.mockReturnValue(true);
		await request(
			"POST",
			"/hook/SessionStart",
			{ session_id: "prune-mixed-win", cwd: "/p-mixed-b" },
			{ "X-Hook-Window": "6007|Term", "X-Hook-Nested": "1" },
		);

		findDeadWindows.mockResolvedValue(new Set([6007]));
		await pruneDeadLinkedSessions();

		expect(tracker.getSession("prune-mixed-proc")).not.toBeNull();
		expect(tracker.getSession("prune-mixed-win")).toBeNull();
	});
});

describe("GET /api/sessions", () => {
	it("returns sessions array and aggregateState", async () => {
		const res = await request("GET", "/api/sessions");
		expect(res.status).toBe(200);
		expect(Array.isArray(res.body.sessions)).toBe(true);
		expect(typeof res.body.aggregateState).toBe("string");
	});
});

describe("POST /hook/PermissionRequest (queue)", () => {
	it("holds a single response and returns decision JSON when resolved", async () => {
		await request("POST", "/hook/SessionStart", {
			session_id: "perm-sess-1",
			cwd: "/proj",
		});

		const permPromise = request("POST", "/hook/PermissionRequest", {
			session_id: "perm-sess-1",
			tool_name: "Bash",
			tool_input: { command: "npm test" },
			cwd: "/proj",
		});

		await new Promise((r) => setTimeout(r, 50));

		const decisionRes = await request("POST", "/api/permission/perm-sess-1", {
			decision: "allow",
		});
		expect(decisionRes.status).toBe(200);
		expect(decisionRes.body.ok).toBe(true);

		const hookRes = await permPromise;
		expect(hookRes.status).toBe(200);
		expect(hookRes.body.hookSpecificOutput.decision.behavior).toBe("allow");
	});

	it("returns deny decision with message", async () => {
		await request("POST", "/hook/SessionStart", {
			session_id: "perm-sess-2",
			cwd: "/proj",
		});

		const permPromise = request("POST", "/hook/PermissionRequest", {
			session_id: "perm-sess-2",
			tool_name: "Bash",
			cwd: "/proj",
		});

		await new Promise((r) => setTimeout(r, 50));

		await request("POST", "/api/permission/perm-sess-2", { decision: "deny" });

		const hookRes = await permPromise;
		expect(hookRes.body.hookSpecificOutput.decision.behavior).toBe("deny");
		expect(hookRes.body.hookSpecificOutput.decision.message).toBe(
			"Denied from Claudia dashboard",
		);
	});

	it("queues multiple PermissionRequests and resolves them in FIFO order", async () => {
		await request("POST", "/hook/SessionStart", {
			session_id: "perm-sess-queue",
			cwd: "/proj",
		});

		const p1 = request("POST", "/hook/PermissionRequest", {
			session_id: "perm-sess-queue",
			tool_name: "WebSearch",
			tool_input: { query: "first" },
			cwd: "/proj",
		});
		await new Promise((r) => setTimeout(r, 20));

		const p2 = request("POST", "/hook/PermissionRequest", {
			session_id: "perm-sess-queue",
			tool_name: "WebSearch",
			tool_input: { query: "second" },
			cwd: "/proj",
		});
		await new Promise((r) => setTimeout(r, 20));

		const p3 = request("POST", "/hook/PermissionRequest", {
			session_id: "perm-sess-queue",
			tool_name: "WebSearch",
			tool_input: { query: "third" },
			cwd: "/proj",
		});
		await new Promise((r) => setTimeout(r, 20));

		await request("POST", "/api/permission/perm-sess-queue", {
			decision: "allow",
		});
		const r1 = await p1;
		expect(r1.body.hookSpecificOutput.decision.behavior).toBe("allow");

		await new Promise((r) => setTimeout(r, 20));
		await request("POST", "/api/permission/perm-sess-queue", {
			decision: "deny",
		});
		const r2 = await p2;
		expect(r2.body.hookSpecificOutput.decision.behavior).toBe("deny");

		await new Promise((r) => setTimeout(r, 20));
		await request("POST", "/api/permission/perm-sess-queue", {
			decision: "allow",
		});
		const r3 = await p3;
		expect(r3.body.hookSpecificOutput.decision.behavior).toBe("allow");
	});

	it("never resolves a queued response until the user decides it", async () => {
		// Regression test for the dead-loop bug: previously the second
		// PermissionRequest silently resolved the first with {ok: true}.
		await request("POST", "/hook/SessionStart", {
			session_id: "perm-sess-hold",
			cwd: "/proj",
		});

		let p1Resolved = false;
		const p1 = request("POST", "/hook/PermissionRequest", {
			session_id: "perm-sess-hold",
			tool_name: "Bash",
			tool_input: { command: "first" },
			cwd: "/proj",
		}).then((r) => {
			p1Resolved = true;
			return r;
		});

		await new Promise((r) => setTimeout(r, 30));

		const p2 = request("POST", "/hook/PermissionRequest", {
			session_id: "perm-sess-hold",
			tool_name: "Bash",
			tool_input: { command: "second" },
			cwd: "/proj",
		});

		await new Promise((r) => setTimeout(r, 100));
		expect(p1Resolved).toBe(false);

		await request("POST", "/api/permission/perm-sess-hold", {
			decision: "allow",
		});
		const r1 = await p1;
		expect(r1.body.hookSpecificOutput.decision.behavior).toBe("allow");

		await new Promise((r) => setTimeout(r, 20));
		await request("POST", "/api/permission/perm-sess-hold", {
			decision: "allow",
		});
		const r2 = await p2;
		expect(r2.body.hookSpecificOutput.decision.behavior).toBe("allow");
	});

	it("returns 404 when no held response exists for session", async () => {
		const res = await request("POST", "/api/permission/nonexistent", {
			decision: "allow",
		});
		expect(res.status).toBe(404);
	});

	it("returns 400 for invalid decision value", async () => {
		const res = await request("POST", "/api/permission/any-session", {
			decision: "maybe",
		});
		expect(res.status).toBe(400);
	});

	it("drains the queue with {ok: true} when session ends", async () => {
		await request("POST", "/hook/SessionStart", {
			session_id: "perm-sess-end",
			cwd: "/proj",
		});

		const p1 = request("POST", "/hook/PermissionRequest", {
			session_id: "perm-sess-end",
			tool_name: "Bash",
			cwd: "/proj",
		});
		await new Promise((r) => setTimeout(r, 20));

		const p2 = request("POST", "/hook/PermissionRequest", {
			session_id: "perm-sess-end",
			tool_name: "Bash",
			cwd: "/proj",
		});
		await new Promise((r) => setTimeout(r, 20));

		await request("POST", "/hook/SessionEnd", {
			session_id: "perm-sess-end",
			cwd: "/proj",
		});

		const r1 = await p1;
		const r2 = await p2;
		expect(r1.status).toBe(200);
		expect(r2.status).toBe(200);
		// Plain {ok: true}, no decision payload
		expect(r1.body.hookSpecificOutput).toBeUndefined();
		expect(r2.body.hookSpecificOutput).toBeUndefined();
	});
});

describe("GET /events (SSE)", () => {
	it("returns text/event-stream content type and sends initial data", async () => {
		await new Promise((resolve, reject) => {
			const url = new URL("/events", baseUrl);
			const req = http.request(
				{
					method: "GET",
					hostname: url.hostname,
					port: url.port,
					path: url.pathname,
				},
				(res) => {
					expect(res.statusCode).toBe(200);
					expect(res.headers["content-type"]).toMatch(/text\/event-stream/);

					let buffer = "";
					res.on("data", (chunk) => {
						buffer += chunk.toString();
						// Once we have at least one SSE data frame, verify and clean up
						if (buffer.includes("data:")) {
							try {
								const line = buffer
									.split("\n")
									.find((l) => l.startsWith("data:"));
								const payload = JSON.parse(line.slice("data:".length).trim());
								expect(Array.isArray(payload.sessions)).toBe(true);
								expect(typeof payload.aggregateState).toBe("string");
								expect(typeof payload.statusMessage).toBe("string");
							} catch (err) {
								reject(err);
								return;
							}
							req.destroy();
							resolve();
						}
					});

					res.on("error", (err) => {
						// destroy() causes an aborted error — that is expected
						if (err.code === "ECONNRESET" || err.message.includes("aborted"))
							return;
						reject(err);
					});
				},
			);

			req.on("error", (err) => {
				if (err.code === "ECONNRESET" || err.message.includes("aborted"))
					return;
				reject(err);
			});

			req.end();
		});
	});
});
