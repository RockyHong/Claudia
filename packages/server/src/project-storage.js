import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { extractDisplayName } from "./session-tracker.js";

const PROJECTS_PATH = path.join(os.homedir(), ".claudia", "projects.json");
const MAX_PROJECTS = 50;

// In-memory cache of known paths to avoid redundant disk I/O
const knownPaths = new Set();

async function readProjects() {
  try {
    const raw = await fs.readFile(PROJECTS_PATH, "utf-8");
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === "ENOENT") return [];
    if (err instanceof SyntaxError) return [];
    throw err;
  }
}

async function writeProjects(projects) {
  const dir = path.dirname(PROJECTS_PATH);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(PROJECTS_PATH, JSON.stringify(projects, null, 2) + "\n");
}

export async function trackProject(cwd) {
  if (!cwd || typeof cwd !== "string") return;

  const normalized = cwd.replace(/\\/g, "/");

  // Skip disk I/O if this path was already seen this server run
  if (knownPaths.has(normalized)) return;
  knownPaths.add(normalized);

  const projects = await readProjects();
  const existing = projects.find((p) => p.path === normalized);

  if (existing) {
    existing.lastSeen = Date.now();
  } else {
    projects.push({
      path: normalized,
      name: extractDisplayName(cwd),
      lastSeen: Date.now(),
    });
  }

  projects.sort((a, b) => b.lastSeen - a.lastSeen);
  await writeProjects(projects.slice(0, MAX_PROJECTS));
}

export async function removeProject(projectPath) {
  if (!projectPath || typeof projectPath !== "string") return;

  const normalized = projectPath.replace(/\\/g, "/");
  knownPaths.delete(normalized);

  const projects = await readProjects();
  const filtered = projects.filter((p) => p.path !== normalized);
  await writeProjects(filtered);
}

export async function listProjects() {
  return readProjects();
}
