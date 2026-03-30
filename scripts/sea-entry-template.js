// SEA entry point — loaded by Node when the executable starts.
// Extracts embedded web assets and server bundle to temp, then starts the server.
// Must be CommonJS — Node SEA does not support ESM.

const { writeFileSync, mkdirSync, existsSync } = require("node:fs");
const { tmpdir } = require("node:os");
const path = require("node:path");
const sea = require("node:sea");

// Extract web assets from embedded blob
const WEB_DIST_DIR = path.join(tmpdir(), "claudia-web-dist");

if (!existsSync(WEB_DIST_DIR)) {
  mkdirSync(WEB_DIST_DIR, { recursive: true });
  const tarBuffer = sea.getAsset("web-dist");
  extractTar(tarBuffer, WEB_DIST_DIR);
}

// Extract server bundle from embedded blob
const BUNDLE_DIR = path.join(tmpdir(), "claudia-sea");
const BUNDLE_PATH = path.join(BUNDLE_DIR, "server-bundle.js");

if (!existsSync(BUNDLE_PATH)) {
  mkdirSync(BUNDLE_DIR, { recursive: true });
  writeFileSync(BUNDLE_PATH, sea.getAsset("server-bundle", "utf8"));
}

// Set env so server knows where web assets are
process.env.CLAUDIA_WEB_DIST = WEB_DIST_DIR;

// Determine entry mode from executable name
const exeName = path.basename(process.execPath).toLowerCase();
const isWallpaper = exeName.includes("wallpaper");
const managed = true; // SEA is always managed mode

const port = process.env.CLAUDIA_PORT || 48901;

// Dynamic import of the extracted server bundle
async function main() {
  const bundleUrl = "file://" + BUNDLE_PATH.replace(/\\/g, "/");
  const { startServer } = await import(bundleUrl);
  await startServer(port, { managed });

  if (isWallpaper) {
    console.log(`Claudia wallpaper server ready on port ${port}`);
  } else {
    console.log(`Claudia standalone server ready on port ${port}`);
  }
}

main();

// Minimal tar extraction for flat archives
function extractTar(buffer, destDir) {
  let offset = 0;
  const view = new Uint8Array(buffer);
  while (offset < view.length) {
    const header = view.slice(offset, offset + 512);
    offset += 512;
    if (header.every((b) => b === 0)) break;
    const nameEnd = header.indexOf(0);
    const name = new TextDecoder().decode(header.slice(0, nameEnd > 0 ? nameEnd : 100)).trim();
    if (!name) break;
    const sizeStr = new TextDecoder().decode(header.slice(124, 136)).trim();
    const size = parseInt(sizeStr, 8) || 0;
    if (size > 0) {
      const data = view.slice(offset, offset + size);
      writeFileSync(path.join(destDir, path.basename(name)), Buffer.from(data));
    }
    offset += Math.ceil(size / 512) * 512;
  }
}
