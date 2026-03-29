import http from "node:http";
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

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
          resolve({ status: res.statusCode, body: JSON.parse(data), headers: res.headers });
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
    const res = await request("POST", "/event", { session: "s1", state: "dancing" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid state/i);
  });

  it("returns 400 when session field exceeds 100 characters", async () => {
    const longSession = "x".repeat(101);
    const res = await request("POST", "/event", { session: longSession, state: "busy" });
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
            if (err.code === "ECONNRESET" || err.message.includes("aborted")) return;
            reject(err);
          });
        },
      );

      req.on("error", (err) => {
        if (err.code === "ECONNRESET" || err.message.includes("aborted")) return;
        reject(err);
      });

      req.end();
    });
  });
});
