#!/usr/bin/env node

// Package Claudia for Wallpaper Engine distribution.
// Copies 32-bit SEA + WE template files into a zip.
//
// Usage: node scripts/package-we.js
// Requires: dist/claudia-server-x86.exe must exist (run build:sea:x86 first)

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const seaPath = path.join(root, "dist/claudia-server-x86.exe");
if (!fs.existsSync(seaPath)) {
  console.error("Error: dist/claudia-server-x86.exe not found.");
  console.error("Run `npm run build:sea:x86` first.");
  process.exit(1);
}

const outDir = path.join(root, "dist/claudia-wallpaper");
fs.mkdirSync(outDir, { recursive: true });

// Copy files
fs.copyFileSync(seaPath, path.join(outDir, "server.exe"));
fs.copyFileSync(path.join(root, "we-template/project.json"), path.join(outDir, "project.json"));
fs.copyFileSync(path.join(root, "we-template/index.html"), path.join(outDir, "index.html"));

// Create preview.jpg placeholder if it doesn't exist
const previewPath = path.join(outDir, "preview.jpg");
if (!fs.existsSync(previewPath)) {
  fs.writeFileSync(previewPath, "");
  console.log("Note: preview.jpg is a placeholder — replace with a real screenshot for Steam Workshop.");
}

// Zip it
const zipPath = path.join(root, "dist/claudia-wallpaper.zip");
try {
  execSync(
    `powershell -NoProfile -Command "Compress-Archive -Path '${outDir.replace(/\\/g, "/")}/*' -DestinationPath '${zipPath.replace(/\\/g, "/")}' -Force"`,
    { stdio: "inherit" },
  );
} catch {
  // Fallback to zip command (macOS/Linux)
  execSync(`cd "${outDir}" && zip -r "${zipPath}" .`, { stdio: "inherit" });
}

console.log(`\nWallpaper Engine package: ${zipPath}`);
console.log("Contents:");
for (const f of fs.readdirSync(outDir)) {
  const stat = fs.statSync(path.join(outDir, f));
  console.log(`  ${f} (${(stat.size / 1024).toFixed(0)} KB)`);
}
