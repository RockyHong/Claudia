#!/usr/bin/env node

// Standalone desktop app entry point.
// Started by Tauri as a sidecar — no browser open, managed process lifecycle.
// Tauri's webview loads localhost:48901 directly.

const port = process.env.CLAUDIA_PORT || 48901;

const { startServer } = await import("../packages/server/src/index.js");

await startServer(port, { managed: true });

console.log("");
console.log("  Claudia standalone server ready.");
console.log(`  Dashboard: http://localhost:${port}`);
console.log("");
