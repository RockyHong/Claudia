#!/usr/bin/env node

// Build a Node SEA executable.
// Usage: node scripts/build-sea.js [--arch x86|x64]
//
// Steps:
// 1. Bundle server via esbuild
// 2. Build web assets
// 3. Pack web dist into a tar
// 4. Copy SEA entry template to dist/
// 5. Generate SEA blob via node --experimental-sea-config
// 6. Copy node.exe and inject blob via postject

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const args = process.argv.slice(2);
const archFlag = args.includes("--arch") ? args[args.indexOf("--arch") + 1] : "x64";
const arch = archFlag === "x86" ? "x86" : "x64";

console.log(`Building Claudia SEA (${arch})...\n`);

// Step 1: Bundle server
console.log("[1/6] Bundling server...");
execSync("node scripts/bundle-server.js", { cwd: root, stdio: "inherit" });

// Step 2: Build web UI
console.log("[2/6] Building web UI...");
execSync("npm run build", { cwd: root, stdio: "inherit" });

// Step 3: Pack web dist into tar
console.log("[3/6] Packing web assets...");
const webDistDir = path.join(root, "packages/web/dist");
const tarPath = path.join(root, "dist/web-dist.tar");
packTar(webDistDir, tarPath);

// Step 4: Copy SEA entry to dist/
console.log("[4/6] Preparing SEA entry...");
fs.copyFileSync(
  path.join(root, "scripts/sea-entry-template.js"),
  path.join(root, "dist/sea-entry.js"),
);

// Step 5: Generate SEA blob
console.log("[5/6] Generating SEA blob...");
execSync("node --experimental-sea-config sea-config.json", {
  cwd: root,
  stdio: "inherit",
});

// Step 6: Copy node.exe and inject blob
console.log("[6/6] Injecting blob into executable...");
const outputName = arch === "x86" ? "claudia-server-x86.exe" : "claudia-server-x64.exe";
const outputPath = path.join(root, "dist", outputName);

const nodeExe = process.env.NODE_EXE || process.execPath;
fs.copyFileSync(nodeExe, outputPath);

// Remove signature (Windows requires this before injection)
try {
  execSync(`signtool remove /s "${outputPath}"`, { stdio: "ignore" });
} catch {
  // signtool may not be available — not critical
}

// Inject blob via postject
execSync([
  "npx postject",
  `"${outputPath}"`,
  "NODE_SEA_BLOB",
  `"${path.join(root, "dist/sea-prep.blob")}"`,
  "--sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2",
].join(" "), { cwd: root, stdio: "inherit" });

console.log(`\nSEA built: ${outputPath}`);

// Auto-copy to Tauri directories (build-time + runtime)
const tauriDirs = [
  path.join(root, "src-tauri/binaries"),                      // build-time (externalBin)
  path.join(root, "src-tauri/target/release/binaries"),        // runtime (dev builds)
];
for (const dir of tauriDirs) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(outputPath, path.join(dir, "claudia-server-x86_64-pc-windows-msvc.exe"));
  fs.copyFileSync(outputPath, path.join(dir, "claudia-server.exe"));
}
console.log("Copied to Tauri sidecar directories");

// Recursive tar packer — preserves relative paths (e.g. assets/index.js)
function packTar(srcDir, destPath) {
  const chunks = [];

  function walk(dir, prefix) {
    for (const entry of fs.readdirSync(dir)) {
      const filePath = path.join(dir, entry);
      const tarName = prefix ? `${prefix}/${entry}` : entry;
      const stat = fs.statSync(filePath);

      if (stat.isDirectory()) {
        walk(filePath, tarName);
        continue;
      }

      const data = fs.readFileSync(filePath);

      // Create tar header (512 bytes)
      const header = Buffer.alloc(512);
      header.write(tarName, 0, Math.min(tarName.length, 100), "utf-8");
      header.write("0000644\0", 100, 8, "utf-8");
      header.write("0000000\0", 108, 8, "utf-8");
      header.write("0000000\0", 116, 8, "utf-8");
      header.write(stat.size.toString(8).padStart(11, "0") + "\0", 124, 12, "utf-8");
      header.write(Math.floor(stat.mtimeMs / 1000).toString(8).padStart(11, "0") + "\0", 136, 12, "utf-8");
      header.write("        ", 148, 8, "utf-8");
      header.write("0", 156, 1, "utf-8");

      let checksum = 0;
      for (let i = 0; i < 512; i++) checksum += header[i];
      header.write(checksum.toString(8).padStart(6, "0") + "\0 ", 148, 8, "utf-8");

      chunks.push(header);
      chunks.push(data);

      const padding = 512 - (data.length % 512);
      if (padding < 512) chunks.push(Buffer.alloc(padding));
    }
  }

  walk(srcDir, "");
  chunks.push(Buffer.alloc(1024));

  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.writeFileSync(destPath, Buffer.concat(chunks));
}
