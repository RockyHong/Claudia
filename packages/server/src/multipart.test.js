import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import { parseMultipart } from "./multipart.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildMultipartBody(boundary, parts) {
	const chunks = [];
	for (const { filename, data } of parts) {
		chunks.push(`--${boundary}\r\n`);
		chunks.push(
			`Content-Disposition: form-data; name="file"; filename="${filename}"\r\n`,
		);
		chunks.push(`Content-Type: application/octet-stream\r\n\r\n`);
		chunks.push(data);
		chunks.push(`\r\n`);
	}
	chunks.push(`--${boundary}--\r\n`);
	return Buffer.concat(
		chunks.map((c) => (Buffer.isBuffer(c) ? c : Buffer.from(c))),
	);
}

/**
 * Creates a mock request that behaves like a Node.js IncomingMessage: an
 * EventEmitter with a `headers` property. After `parseMultipart` is called
 * we asynchronously emit the data chunks and the "end" event so the promise
 * has a chance to attach its listeners first.
 */
function makeMockReq(headers, body) {
	const req = new EventEmitter();
	req.headers = headers;

	// Emit asynchronously so the Promise executor inside parseMultipart can
	// attach its "data" / "end" / "error" listeners before we fire.
	setImmediate(() => {
		if (Buffer.isBuffer(body)) {
			req.emit("data", body);
		}
		req.emit("end");
	});

	return req;
}

/**
 * Creates a mock request that emits an error instead of ending cleanly.
 */
function makeMockReqWithError(headers, err) {
	const req = new EventEmitter();
	req.headers = headers;
	req.destroy = () => {}; // stub – parseMultipart calls this before reject

	setImmediate(() => {
		req.emit("error", err);
	});

	return req;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("parseMultipart", () => {
	const BOUNDARY = "test-boundary-abc";
	const CONTENT_TYPE = `multipart/form-data; boundary=${BOUNDARY}`;

	it("parses a valid multipart body with one file", async () => {
		const fileData = Buffer.from("video-bytes-here");
		const body = buildMultipartBody(BOUNDARY, [
			{ filename: "idle.webm", data: fileData },
		]);
		const req = makeMockReq({ "content-type": CONTENT_TYPE }, body);

		const files = await parseMultipart(req);

		expect(files).toHaveLength(1);
		expect(files[0].name).toBe("idle.webm");
		expect(files[0].data.equals(fileData)).toBe(true);
	});

	it("parses multiple files in one body", async () => {
		const idleData = Buffer.from("idle-video");
		const busyData = Buffer.from("busy-video");
		const pendingData = Buffer.from("pending-video");

		const body = buildMultipartBody(BOUNDARY, [
			{ filename: "idle.webm", data: idleData },
			{ filename: "busy.webm", data: busyData },
			{ filename: "pending.webm", data: pendingData },
		]);
		const req = makeMockReq({ "content-type": CONTENT_TYPE }, body);

		const files = await parseMultipart(req);

		expect(files).toHaveLength(3);
		expect(files.map((f) => f.name)).toEqual([
			"idle.webm",
			"busy.webm",
			"pending.webm",
		]);
		expect(files[0].data.equals(idleData)).toBe(true);
		expect(files[1].data.equals(busyData)).toBe(true);
		expect(files[2].data.equals(pendingData)).toBe(true);
	});

	it("rejects when no boundary in content-type header", async () => {
		const req = makeMockReq(
			{ "content-type": "multipart/form-data" },
			Buffer.alloc(0),
		);

		await expect(parseMultipart(req)).rejects.toThrow("No boundary found");
	});

	it("rejects when content-type header is missing entirely", async () => {
		const req = makeMockReq({}, Buffer.alloc(0));

		await expect(parseMultipart(req)).rejects.toThrow("No boundary found");
	});

	it("rejects when upload exceeds MAX_UPLOAD_SIZE", async () => {
		const MAX = 20 * 1024 * 1024;

		const req = new EventEmitter();
		req.headers = { "content-type": CONTENT_TYPE };

		let destroyed = false;
		req.destroy = () => {
			destroyed = true;
		};

		const promise = parseMultipart(req);

		// Emit a chunk that is 1 byte over the limit
		setImmediate(() => {
			req.emit("data", Buffer.alloc(MAX + 1));
			// "end" would normally follow but after destroy the promise already
			// rejects — we still emit it to avoid a dangling listener warning.
			req.emit("end");
		});

		await expect(promise).rejects.toThrow("Upload too large");
		expect(destroyed).toBe(true);
	});

	it("filters out parts with invalid filenames", async () => {
		const body = buildMultipartBody(BOUNDARY, [
			{ filename: "evil.exe", data: Buffer.from("malware") },
			{ filename: "idle.webm", data: Buffer.from("good-video") },
		]);
		const req = makeMockReq({ "content-type": CONTENT_TYPE }, body);

		const files = await parseMultipart(req);

		expect(files).toHaveLength(1);
		expect(files[0].name).toBe("idle.webm");
	});

	it("skips parts that have no filename in their Content-Disposition header", async () => {
		const boundary = BOUNDARY;
		// Build a body manually: one part without a filename field, one valid part.
		const noFilenamePart = [
			`--${boundary}\r\n`,
			`Content-Disposition: form-data; name="field"\r\n`,
			`Content-Type: text/plain\r\n\r\n`,
			`some text value\r\n`,
		].join("");

		const validPart = [
			`--${boundary}\r\n`,
			`Content-Disposition: form-data; name="file"; filename="busy.mp4"\r\n`,
			`Content-Type: video/mp4\r\n\r\n`,
			"mp4-data",
			"\r\n",
		].join("");

		const body = Buffer.from(
			`${noFilenamePart}${validPart}--${boundary}--\r\n`,
		);
		const req = makeMockReq({ "content-type": CONTENT_TYPE }, body);

		const files = await parseMultipart(req);

		expect(files).toHaveLength(1);
		expect(files[0].name).toBe("busy.mp4");
	});

	it("returns an empty array for an empty / boundary-only body", async () => {
		// A body that has only the closing delimiter and no parts.
		const body = Buffer.from(`--${BOUNDARY}--\r\n`);
		const req = makeMockReq({ "content-type": CONTENT_TYPE }, body);

		const files = await parseMultipart(req);

		expect(files).toEqual([]);
	});

	it("rejects on stream error", async () => {
		const streamError = new Error("socket hang up");
		const req = makeMockReqWithError(
			{ "content-type": CONTENT_TYPE },
			streamError,
		);

		await expect(parseMultipart(req)).rejects.toThrow("socket hang up");
	});
});
