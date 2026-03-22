#!/usr/bin/env node

import { createInterface } from "node:readline";
import { createServer as createNetServer } from "node:net";
import { exec } from "node:child_process";
import { platform } from "node:os";
import {
  readSettings,
  writeSettings,
  hasClaudiaHooks,
  mergeHooks,
  removeHooks,
  getSettingsPath,
  CLAUDIA_MARKER,
} from "../packages/server/src/hooks.js";

const command = process.argv[2];

switch (command) {
  case "init":
    await runInit();
    break;
  case "teardown":
    await runTeardown();
    break;
  default:
    await runStart();
    break;
}

// --- init ---

async function runInit() {
  let settings;
  try {
    settings = await readSettings();
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }

  if (hasClaudiaHooks(settings)) {
    console.log("Claudia hooks are already installed.");
    console.log(`  ${getSettingsPath()}`);
    console.log("\nRe-running will update them to the latest version.");
    const ok = await confirm("Update hooks?");
    if (!ok) return;
  }

  const merged = mergeHooks(settings);

  console.log("\nChanges to apply:");
  console.log(`  File: ${getSettingsPath()}`);
  console.log("  Adding hooks: PreToolUse, PostToolUse, Notification");
  if (settings.hooks) {
    const userHooks = Object.entries(settings.hooks)
      .flatMap(([event, hooks]) =>
        Array.isArray(hooks) ? hooks.filter((h) => !h.command?.includes(CLAUDIA_MARKER)) : [],
      );
    if (userHooks.length > 0) {
      console.log(`  Preserving ${userHooks.length} existing user hook(s)`);
    }
  }

  const ok = await confirm("\nApply changes?");
  if (!ok) {
    console.log("Aborted.");
    return;
  }

  try {
    await writeSettings(merged);
    console.log("\nHooks installed successfully.");
    console.log("Restart any running Claude Code sessions to pick up the hooks.");
    console.log("Then run `claudia` or `npx claudia` to start the receptionist.");
  } catch (err) {
    console.error(`Error writing settings: ${err.message}`);
    process.exit(1);
  }
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
  console.log("  Removing: PreToolUse, PostToolUse, Notification (Claudia entries only)");
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

// --- start ---

async function runStart() {
  const port = process.env.CLAUDIA_PORT || 7890;

  // Check for port conflict before importing the server
  const portInUse = await checkPort(port);
  if (portInUse) {
    console.error(`Error: Port ${port} is already in use.`);
    console.error(`  Try: CLAUDIA_PORT=7891 claudia`);
    process.exit(1);
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
    win32: `start "" "${url}"`,
    darwin: `open "${url}"`,
    linux: `xdg-open "${url}"`,
  };
  const cmd = commands[platform()];
  if (cmd) {
    exec(cmd, () => {
      // Silently ignore errors — browser open is best-effort
    });
  }
}
