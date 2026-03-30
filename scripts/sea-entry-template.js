// SEA entry point — loaded by Node when the executable starts.
// Extracts embedded web assets and server bundle to temp, then starts the server.
// Must be CommonJS — Node SEA does not support ESM.

const { appendFileSync, writeFileSync, mkdirSync, existsSync } = require("node:fs");
const { tmpdir } = require("node:os");
const path = require("node:path");
const sea = require("node:sea");

// Crash log for debugging
const LOG_PATH = path.join(tmpdir(), "claudia-sea.log");
process.on("uncaughtException", (err) => {
  appendFileSync(LOG_PATH, `[${new Date().toISOString()}] UNCAUGHT: ${err.stack || err}\n`);
  process.exit(1);
});
process.on("unhandledRejection", (err) => {
  appendFileSync(LOG_PATH, `[${new Date().toISOString()}] UNHANDLED: ${err.stack || err}\n`);
  process.exit(1);
});

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

const managed = true; // SEA is always managed mode
const port = process.env.CLAUDIA_PORT || 48901;

// Dynamic import of the extracted server bundle
async function main() {
  const bundleUrl = "file://" + BUNDLE_PATH.replace(/\\/g, "/");
  const { startServer } = await import(bundleUrl);
  await startServer(port, { managed });
  console.log(`Claudia standalone server ready on port ${port}`);
}

main();

// Tar extraction — preserves relative paths (e.g. assets/index.js)
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
      const outPath = path.join(destDir, name);
      mkdirSync(path.dirname(outPath), { recursive: true });
      writeFileSync(outPath, Buffer.from(view.slice(offset, offset + size)));
    }
    offset += Math.ceil(size / 512) * 512;
  }
}
