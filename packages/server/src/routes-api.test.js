import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import http from "node:http";
import express from "express";

// Mock all external dependencies BEFORE importing the module under test
vi.mock("node:fs/promises", () => ({ default: { access: vi.fn() } }));
vi.mock("./focus.js", () => ({
  focusTerminal: vi.fn(),
  listTerminalWindows: vi.fn(),
  renameTerminal: vi.fn(),
}));
vi.mock("./project-storage.js", () => ({
  trackProject: vi.fn(),
  listProjects: vi.fn(),
  removeProject: vi.fn(),
}));
vi.mock("./spawner.js", () => ({
  spawnSession: vi.fn(),
  browseFolder: vi.fn(),
  cancelBrowse: vi.fn(),
  openFolder: vi.fn(),
}));
vi.mock("./multipart.js", () => ({ parseMultipart: vi.fn() }));
vi.mock("./avatar-storage.js", () => ({
  getActiveSetPath: vi.fn().mockResolvedValue("/tmp/avatars"),
  listSets: vi.fn(),
  getActiveSet: vi.fn(),
  createSet: vi.fn(),
  updateSet: vi.fn(),
  deleteSet: vi.fn(),
  setActiveSet: vi.fn(),
  isValidSetName: vi.fn((n) => /^[a-z0-9-]+$/.test(n)),
  getSetPath: vi.fn((n) => `/tmp/avatars/${n}`),
  VALID_FILENAMES: new Set(["idle.webm", "idle.mp4", "busy.webm", "busy.mp4", "pending.webm", "pending.mp4"]),
}));
vi.mock("./hooks.js", () => ({
  readSettings: vi.fn(),
  hasClaudiaHooks: vi.fn(),
  mergeHooks: vi.fn(),
  writeSettings: vi.fn(),
}));
vi.mock("./preferences.js", () => ({
  getPreferences: vi.fn(),
  setPreferences: vi.fn(),
}));

import { registerApiRoutes } from "./routes-api.js";
import fs from "node:fs/promises";
import { focusTerminal, listTerminalWindows, renameTerminal } from "./focus.js";
import { listProjects, removeProject, trackProject } from "./project-storage.js";
import { spawnSession, cancelBrowse, openFolder } from "./spawner.js";
import { listSets, getActiveSet, setActiveSet, deleteSet, updateSet } from "./avatar-storage.js";
import { readSettings, hasClaudiaHooks, mergeHooks, writeSettings } from "./hooks.js";
import { getPreferences, setPreferences } from "./preferences.js";

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
  linkSessionById: vi.fn(),
  getLinkedHandles: vi.fn(),
};

let server;

beforeAll(() => {
  return new Promise((resolve) => {
    const app = express();
    app.use(express.json());
    registerApiRoutes(app, mockTracker, null);
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

describe("PUT /api/avatars/sets/:name", () => {
  it("returns 400 for invalid set name", async () => {
    const res = await request(server, "PUT", "/api/avatars/sets/INVALID_NAME!");
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Invalid set name" });
  });

  it("returns 400 if no fields provided", async () => {
    const res = await request(server, "PUT", "/api/avatars/sets/test-set", {});
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "No changes provided" });
  });

  it("renames set via JSON body", async () => {
    updateSet.mockResolvedValue(undefined);

    const res = await request(server, "PUT", "/api/avatars/sets/old-name", {
      rename: "new-name",
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, name: "new-name" });
    expect(updateSet).toHaveBeenCalledWith("old-name", { rename: "new-name", files: [] });
  });

  it("returns error status on updateSet failure", async () => {
    updateSet.mockRejectedValue(new Error("Set not found"));

    const res = await request(server, "PUT", "/api/avatars/sets/ghost", {
      rename: "new-name",
    });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Set not found" });
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

describe("POST /api/open-folder", () => {
  it("returns 400 if cwd is missing", async () => {
    const res = await request(server, "POST", "/api/open-folder", {});
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Missing cwd" });
  });

  it("calls openFolder and returns 204", async () => {
    const res = await request(server, "POST", "/api/open-folder", { cwd: "/home/user/project" });
    expect(res.status).toBe(204);
    expect(openFolder).toHaveBeenCalledWith("/home/user/project");
  });

  it("returns 500 if openFolder throws", async () => {
    openFolder.mockImplementation(() => { throw new Error("Unsupported platform"); });
    const res = await request(server, "POST", "/api/open-folder", { cwd: "/home/user/project" });
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "Unsupported platform" });
    openFolder.mockReset();
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

describe("GET /api/usage", () => {
  it("returns 204 when no usage data", async () => {
    const res = await request(server, "GET", "/api/usage");
    expect(res.status).toBe(204);
  });
});

describe("GET /api/terminals", () => {
  it("returns filtered terminal window list", async () => {
    mockTracker.getLinkedHandles.mockReturnValue(new Set([111]));
    listTerminalWindows.mockResolvedValue([
      { hwnd: 222, title: "cmd.exe" },
      { hwnd: 333, title: "PowerShell" },
    ]);

    const res = await request(server, "GET", "/api/terminals");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      terminals: [
        { hwnd: 222, title: "cmd.exe" },
        { hwnd: 333, title: "PowerShell" },
      ],
      supported: true,
    });
    expect(mockTracker.getLinkedHandles).toHaveBeenCalled();
    expect(listTerminalWindows).toHaveBeenCalledWith(new Set([111]));
  });

  it("returns empty array when no terminals found", async () => {
    mockTracker.getLinkedHandles.mockReturnValue(new Set());
    listTerminalWindows.mockResolvedValue([]);

    const res = await request(server, "GET", "/api/terminals");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ terminals: [], supported: true });
  });
});

describe("GET /api/hooks/status", () => {
  it("returns installed: true when hooks are present", async () => {
    const settings = { hooks: { PreToolUse: [{ matcher: ".*", hooks: [{ type: "command", command: "curl 127.0.0.1:48901/hook/PreToolUse" }] }] } };
    readSettings.mockResolvedValue(settings);
    hasClaudiaHooks.mockReturnValue(true);

    const res = await request(server, "GET", "/api/hooks/status");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ installed: true });
  });

  it("returns installed: false when hooks are missing", async () => {
    readSettings.mockResolvedValue({});
    hasClaudiaHooks.mockReturnValue(false);

    const res = await request(server, "GET", "/api/hooks/status");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ installed: false });
  });

  it("returns 500 on settings read error", async () => {
    readSettings.mockRejectedValue(new Error("Malformed JSON"));

    const res = await request(server, "GET", "/api/hooks/status");

    expect(res.status).toBe(500);
    expect(res.body.error).toBe("Malformed JSON");
  });
});

describe("POST /api/hooks/install", () => {
  it("installs hooks and returns success", async () => {
    const settings = {};
    const merged = { hooks: { PreToolUse: [{ matcher: ".*", hooks: [{ type: "command", command: "curl 127.0.0.1:48901/hook/PreToolUse" }] }] } };
    readSettings.mockResolvedValue(settings);
    mergeHooks.mockReturnValue(merged);
    writeSettings.mockResolvedValue(undefined);

    const res = await request(server, "POST", "/api/hooks/install");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
    expect(mergeHooks).toHaveBeenCalledWith(settings);
    expect(writeSettings).toHaveBeenCalledWith(merged);
  });

  it("returns success: false on write error", async () => {
    readSettings.mockResolvedValue({});
    mergeHooks.mockReturnValue({});
    writeSettings.mockRejectedValue(new Error("Permission denied"));

    const res = await request(server, "POST", "/api/hooks/install");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: false, error: "Permission denied" });
  });

  it("returns success: false on read error", async () => {
    readSettings.mockRejectedValue(new Error("Malformed JSON"));

    const res = await request(server, "POST", "/api/hooks/install");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: false, error: "Malformed JSON" });
  });
});

describe("GET /api/preferences", () => {
  it("returns preferences", async () => {
    getPreferences.mockResolvedValue({ theme: "dark", sfx: { muted: false, volume: 0.5 } });
    const res = await request(server, "GET", "/api/preferences");
    expect(res.status).toBe(200);
    expect(res.body.theme).toBe("dark");
  });
});

describe("PATCH /api/preferences", () => {
  it("merges partial update", async () => {
    setPreferences.mockResolvedValue({ theme: "light", sfx: { muted: false, volume: 0.5 } });
    const res = await request(server, "PATCH", "/api/preferences", { theme: "light" });
    expect(res.status).toBe(200);
    expect(res.body.theme).toBe("light");
    expect(setPreferences).toHaveBeenCalledWith({ theme: "light" });
  });

  it("deep-merges sfx", async () => {
    setPreferences.mockResolvedValue({ theme: "dark", sfx: { muted: false, volume: 0.8 } });
    const res = await request(server, "PATCH", "/api/preferences", { sfx: { volume: 0.8 } });
    expect(res.status).toBe(200);
    expect(res.body.sfx.volume).toBe(0.8);
  });
});

describe("POST /api/link/:sessionId", () => {
  it("returns 404 for unknown session", async () => {
    mockTracker.getSession.mockReturnValue(null);

    const res = await request(server, "POST", "/api/link/unknown-id", { windowHandle: 123 });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Session not found" });
  });

  it("returns 400 if session is already spawned", async () => {
    mockTracker.getSession.mockReturnValue({
      id: "s1",
      spawned: true,
      displayName: "proj",
      cwd: "/proj",
    });

    const res = await request(server, "POST", "/api/link/s1", { windowHandle: 123 });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Session already linked" });
  });

  it("returns 400 if windowHandle is missing", async () => {
    mockTracker.getSession.mockReturnValue({
      id: "s1",
      spawned: false,
      displayName: "proj",
      cwd: "/proj",
    });

    const res = await request(server, "POST", "/api/link/s1", {});

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Missing windowHandle" });
  });

  it("links session successfully", async () => {
    mockTracker.getSession.mockReturnValue({
      id: "s1",
      spawned: false,
      displayName: "proj",
      cwd: "/proj",
    });
    renameTerminal.mockResolvedValue(true);

    const res = await request(server, "POST", "/api/link/s1", { windowHandle: 456 });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.terminalTitle).toMatch(/^claudia · proj-[0-9a-z]{2,}$/);
    expect(renameTerminal).toHaveBeenCalledWith(456, res.body.terminalTitle);
    expect(mockTracker.linkSessionById).toHaveBeenCalledWith("s1", res.body.terminalTitle, 456);
  });
});

