import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import http from "node:http";
import express from "express";

// Mock all external dependencies BEFORE importing the module under test
vi.mock("node:fs/promises", () => ({ default: { access: vi.fn() } }));
vi.mock("./focus.js", () => ({ focusTerminal: vi.fn() }));
vi.mock("./project-storage.js", () => ({
  trackProject: vi.fn(),
  listProjects: vi.fn(),
  removeProject: vi.fn(),
}));
vi.mock("./spawner.js", () => ({
  spawnSession: vi.fn(),
  browseFolder: vi.fn(),
  cancelBrowse: vi.fn(),
}));
vi.mock("./multipart.js", () => ({ parseMultipart: vi.fn() }));
vi.mock("./avatar-storage.js", () => ({
  getActiveSetPath: vi.fn().mockResolvedValue("/tmp/avatars"),
  listSets: vi.fn(),
  getActiveSet: vi.fn(),
  createSet: vi.fn(),
  deleteSet: vi.fn(),
  setActiveSet: vi.fn(),
  isValidSetName: vi.fn((n) => /^[a-z0-9-]+$/.test(n)),
  getSetPath: vi.fn((n) => `/tmp/avatars/${n}`),
  VALID_FILENAMES: new Set(["idle.webm", "idle.mp4", "busy.webm", "busy.mp4", "pending.webm", "pending.mp4"]),
}));

import { registerApiRoutes } from "./routes-api.js";
import fs from "node:fs/promises";
import { focusTerminal } from "./focus.js";
import { listProjects, removeProject, trackProject } from "./project-storage.js";
import { spawnSession, cancelBrowse } from "./spawner.js";
import { listSets, getActiveSet, setActiveSet, deleteSet } from "./avatar-storage.js";

function request(server, method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, `http://localhost:${server.address().port}`);
    const opts = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
    };
    if (body !== undefined) {
      const payload = JSON.stringify(body);
      opts.headers = {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
      };
    }
    const req = http.request(opts, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    req.on("error", reject);
    if (body !== undefined) req.write(JSON.stringify(body));
    req.end();
  });
}

const mockTracker = {
  getSession: vi.fn(),
  storeSpawnedInfo: vi.fn(),
};

let server;

beforeAll(() => {
  return new Promise((resolve) => {
    const app = express();
    app.use(express.json());
    registerApiRoutes(app, mockTracker);
    server = http.createServer(app);
    server.listen(0, "127.0.0.1", resolve);
  });
});

afterAll(() => {
  return new Promise((resolve) => server.close(resolve));
});

describe("GET /api/projects", () => {
  it("returns the projects list", async () => {
    listProjects.mockResolvedValue(["/home/user/proj-a", "/home/user/proj-b"]);

    const res = await request(server, "GET", "/api/projects");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ projects: ["/home/user/proj-a", "/home/user/proj-b"] });
  });
});

describe("DELETE /api/projects", () => {
  it("returns 400 if path is missing", async () => {
    const res = await request(server, "DELETE", "/api/projects", {});

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Missing path" });
  });

  it("removes project successfully", async () => {
    removeProject.mockResolvedValue(undefined);

    const res = await request(server, "DELETE", "/api/projects", { path: "/home/user/proj-a" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(removeProject).toHaveBeenCalledWith("/home/user/proj-a");
  });
});

describe("POST /api/launch", () => {
  it("returns 400 if cwd is missing", async () => {
    const res = await request(server, "POST", "/api/launch", {});

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Missing cwd" });
  });

  it("returns 400 if directory does not exist", async () => {
    fs.access.mockRejectedValue(new Error("ENOENT"));

    const res = await request(server, "POST", "/api/launch", { cwd: "/nonexistent/path" });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Directory not found" });
  });

  it("spawns session successfully", async () => {
    fs.access.mockResolvedValue(undefined);
    spawnSession.mockResolvedValue({ terminalTitle: "my-project", windowHandle: 42 });
    trackProject.mockResolvedValue(undefined);

    const res = await request(server, "POST", "/api/launch", { cwd: "/home/user/my-project" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(spawnSession).toHaveBeenCalledWith("/home/user/my-project");
    expect(mockTracker.storeSpawnedInfo).toHaveBeenCalledWith("/home/user/my-project", "my-project", 42);
    expect(trackProject).toHaveBeenCalledWith("/home/user/my-project");
  });
});

describe("GET /api/avatars/sets", () => {
  it("returns sets list", async () => {
    listSets.mockResolvedValue(["default", "minimal"]);

    const res = await request(server, "GET", "/api/avatars/sets");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ sets: ["default", "minimal"] });
  });
});

describe("GET /api/avatars/active", () => {
  it("returns the active set", async () => {
    getActiveSet.mockResolvedValue("minimal");

    const res = await request(server, "GET", "/api/avatars/active");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ activeSet: "minimal" });
  });
});

describe("PUT /api/avatars/active", () => {
  it("returns 400 if set name is missing", async () => {
    const res = await request(server, "PUT", "/api/avatars/active", {});

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Missing set name" });
  });

  it("sets active set successfully", async () => {
    setActiveSet.mockResolvedValue(undefined);

    const res = await request(server, "PUT", "/api/avatars/active", { set: "minimal" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, activeSet: "minimal" });
    expect(setActiveSet).toHaveBeenCalledWith("minimal");
  });
});

describe("DELETE /api/avatars/sets/:name", () => {
  it("returns 400 for invalid set name", async () => {
    const res = await request(server, "DELETE", "/api/avatars/sets/INVALID_NAME!");

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Invalid set name" });
  });

  it("deletes set successfully", async () => {
    deleteSet.mockResolvedValue(undefined);

    const res = await request(server, "DELETE", "/api/avatars/sets/minimal");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(deleteSet).toHaveBeenCalledWith("minimal");
  });
});

describe("POST /api/browse/cancel", () => {
  it("calls cancelBrowse and returns ok", async () => {
    const { status, body } = await request(server, "POST", "/api/browse/cancel");
    expect(status).toBe(200);
    expect(body).toEqual({ ok: true });
    expect(cancelBrowse).toHaveBeenCalled();
  });
});

describe("POST /focus/:sessionId", () => {
  it("returns 404 for unknown session", async () => {
    mockTracker.getSession.mockReturnValue(null);

    const res = await request(server, "POST", "/focus/unknown-session-id");

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Session not found" });
  });

  it("focuses known session", async () => {
    mockTracker.getSession.mockReturnValue({
      displayName: "my-project",
      windowHandle: 42,
    });
    focusTerminal.mockResolvedValue(true);

    const res = await request(server, "POST", "/focus/session-abc");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, focused: true });
    expect(mockTracker.getSession).toHaveBeenCalledWith("session-abc");
    expect(focusTerminal).toHaveBeenCalledWith("my-project", "navigate", 42);
  });
});
