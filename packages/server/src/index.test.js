import http from "node:http";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Mock all side-effectful dependencies BEFORE importing index.js
vi.mock("./focus.js", () => ({
	focusTerminal: vi.fn(),
	findDeadWindows: vi.fn().mockResolvedValue(new Set()),
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

let app, tracker, server, baseUrl;

beforeAll(async () => {
	const mod = await import("./index.js");
	app = mod.app;
	tracker = mod.tracker;

	server = await new Promise((resolve) => {
		const s = app.listen(0, "127.0.0.1", () => resolve(s));
	});
	baseUrl = `http://127.0.0.1:${server.address().port}`;
});

afterAll(() => {
	server?.close();
});

function request(method, path, body) {
	return new Promise((resolve, reject) => {
		const url = new URL(path, baseUrl);
		const opts = {
			method,
			hostname: url.hostname,
			port: url.port,
			path: url.pathname,
		};
		if (body) opts.headers = { "Content-Type": "application/json" };
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
