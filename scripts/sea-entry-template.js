// SEA entry point — loaded by Node when the executable starts.
// Extracts embedded web assets to a temp dir, then starts the server.

import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import sea from "node:sea";

// Extract web assets from embedded blob
const WEB_DIST_DIR = path.join(tmpdir(), "claudia-web-dist");

if (!existsSync(WEB_DIST_DIR)) {
  mkdirSync(WEB_DIST_DIR, { recursive: true });
  const tarBuffer = sea.getAsset("web-dist");
  extractTar(tarBuffer, WEB_DIST_DIR);
}

// Set env so server knows where web assets are
process.env.CLAUDIA_WEB_DIST = WEB_DIST_DIR;

// Determine entry mode from executable name
const exeName = path.basename(process.execPath).toLowerCase();
const isWallpaper = exeName.includes("wallpaper");
const managed = true; // SEA is always managed mode

const port = process.env.CLAUDIA_PORT || 48901;

// Dynamic import of the bundled server
const { startServer } = await import("./server-bundle.js");
await startServer(port, { managed });

if (isWallpaper) {
  console.log(`Claudia wallpaper server ready on port ${port}`);
} else {
  console.log(`Claudia standalone server ready on port ${port}`);
}

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
