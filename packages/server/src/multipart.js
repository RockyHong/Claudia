// Minimal multipart/form-data parser (no dependencies)

import { VALID_FILENAMES } from "./avatar-storage.js";

const MAX_UPLOAD_SIZE = 20 * 1024 * 1024;

export function parseMultipart(req) {
	return new Promise((resolve, reject) => {
		const contentType = req.headers["content-type"] || "";
		const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^\s;]+))/);
		if (!boundaryMatch) return reject(new Error("No boundary found"));
		const boundary = boundaryMatch[1] || boundaryMatch[2];

		const chunks = [];
		let totalSize = 0;

		req.on("data", (chunk) => {
			totalSize += chunk.length;
			if (totalSize > MAX_UPLOAD_SIZE) {
				req.destroy();
				return reject(new Error("Upload too large"));
			}
			chunks.push(chunk);
		});

		req.on("end", () => {
			try {
				const files = extractParts(Buffer.concat(chunks), boundary);
				resolve(files);
			} catch (err) {
				reject(err);
			}
		});

		req.on("error", reject);
	});
}

function extractParts(body, boundary) {
	const sep = Buffer.from(`--${boundary}`);
	const files = [];
	let start = 0;

	while (true) {
		const sepIdx = body.indexOf(sep, start);
		if (sepIdx === -1) break;

		const partStart = sepIdx + sep.length;
		// Check for closing boundary (--)
		if (body[partStart] === 0x2d && body[partStart + 1] === 0x2d) break;

		const nextSep = body.indexOf(sep, partStart);
		if (nextSep === -1) break;

		const part = body.subarray(partStart, nextSep);
		const headerEnd = part.indexOf("\r\n\r\n");
		if (headerEnd === -1) {
			start = nextSep;
			continue;
		}

		const headerStr = part.subarray(0, headerEnd).toString("utf-8");
		// Extract filename from Content-Disposition
		const filenameMatch = headerStr.match(/filename="([^"]+)"/);
		if (!filenameMatch) {
			start = nextSep;
			continue;
		}

		const filename = filenameMatch[1];
		if (!VALID_FILENAMES.has(filename)) {
			start = nextSep;
			continue;
		}

		// Data starts after \r\n\r\n, strip trailing \r\n before boundary
		let data = part.subarray(headerEnd + 4);
		if (
			data.length >= 2 &&
			data[data.length - 2] === 0x0d &&
			data[data.length - 1] === 0x0a
		) {
			data = data.subarray(0, data.length - 2);
		}

		files.push({ name: filename, data });
		start = nextSep;
	}

	return files;
}
