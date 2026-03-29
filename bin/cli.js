#!/usr/bin/env node

import { createInterface } from "node:readline";
import { createServer as createNetServer } from "node:net";
import { execFile, execSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { homedir, platform } from "node:os";
import {
  readSettings,
  writeSettings,
  hasClaudiaHooks,
  removeHooks,
  getSettingsPath,
  CLAUDIA_HOOKS,
} from "../packages/server/src/hooks.js";

const command = process.argv[2];

switch (command) {
  case "teardown":
    await runTeardown();
    break;
  case "shutdown":
    await runShutdown();
    break;
  default:
    await runStart();
    break;
}

// --- teardown ---

async function runTeardown() {
  let settings;
  try {
    settings = await readSettings();
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }

  if (!hasClaudiaHooks(settings)) {
    console.log("No Claudia hooks found. Nothing to remove.");
    return;
  }

  console.log("Will remove Claudia hooks from:");
  console.log(`  ${getSettingsPath()}`);
  console.log(`  Removing: ${Object.keys(CLAUDIA_HOOKS).join(", ")} (Claudia entries only)`);
  console.log("  Your other hooks will not be touched.");

  const ok = await confirm("\nRemove hooks?");
  if (!ok) {
    console.log("Aborted.");
    return;
  }

  const cleaned = removeHooks(settings);
  try {
    await writeSettings(cleaned);
    console.log("\nClaudia hooks removed.");
  } catch (err) {
    console.error(`Error writing settings: ${err.message}`);
    process.exit(1);
  }
}

// --- shutdown ---

async function runShutdown() {
  const port = process.env.CLAUDIA_PORT || 48901;
  await killExistingInstance(port);
}

// --- start ---

async function runStart() {
  const port = process.env.CLAUDIA_PORT || 48901;

  const portInUse = await checkPort(port);
  if (portInUse) {
    console.log(`Claudia is already running on port ${port}. Replacing...`);
    await killExistingInstance(port);
    // Wait for port to free up
    for (let i = 0; i < 20; i++) {
      if (!(await checkPort(port))) break;
      await new Promise((r) => setTimeout(r, 250));
    }
    if (await checkPort(port)) {
      console.error(`Error: Could not free port ${port}.`);
      process.exit(1);
    }
  }

  const { startServer } = await import("../packages/server/src/index.js");

  await startServer(port);
  const url = `http://localhost:${port}`;

  console.log("");
  console.log("  Claudia is ready.");
  console.log(`  Dashboard: ${url}`);
  console.log("  Press Ctrl+C to stop.");
  console.log("");

  openBrowser(url);
}

// --- helpers ---

function confirm(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`${question} (y/N) `, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === "y");
    });
  });
}

async function killExistingInstance(port) {
  try {
    const tokenPath = path.join(homedir(), ".claudia", "shutdown-token");
    const token = await readFile(tokenPath, "utf-8").catch(() => "");
    await fetch(`http://127.0.0.1:${port}/api/shutdown`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
  } catch {
    // Instance might not support /api/shutdown — force kill as fallback
    try {
      if (platform() === "win32") {
        const out = execSync(`netstat -ano | findstr :${port} | findstr LISTENING`, { encoding: "utf-8" });
        const pids = new Set(out.trim().split("\n").map((line) => line.trim().split(/\s+/).pop()).filter(Boolean));
        for (const pid of pids) {
          try { execSync(`taskkill /F /PID ${pid}`, { stdio: "ignore" }); } catch {}
        }
      } else {
        execSync(`lsof -ti :${port} | xargs kill -9`, { stdio: "ignore" });
      }
    } catch {}
  }
}

function checkPort(port) {
  return new Promise((resolve) => {
    const server = createNetServer();
    server.once("error", () => resolve(true));
    server.once("listening", () => {
      server.close(() => resolve(false));
    });
    server.listen(port);
  });
}

function openBrowser(url) {
  const commands = {
    win32: ["cmd", ["/c", "start", "", url]],
    darwin: ["open", [url]],
    linux: ["xdg-open", [url]],
  };
  const entry = commands[platform()];
  if (entry) {
    execFile(entry[0], entry[1], () => {
      // Silently ignore errors — browser open is best-effort
    });
  }
}
