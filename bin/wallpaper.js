#!/usr/bin/env node

// Wallpaper Engine entry point.
// Runs as an Application wallpaper — no browser, no tray, managed lifecycle.
// WE's CEF layer renders the dashboard via localhost.
// WE kills this process on wallpaper switch — Job Object cleans up children.

const port = process.env.CLAUDIA_PORT || 48901;

const { startServer } = await import("../packages/server/src/index.js");

await startServer(port, { managed: true });

console.log(`Claudia wallpaper server ready on port ${port}`);
