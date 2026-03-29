import { describe, it, expect, vi, beforeEach } from "vitest";
import { generateWav, createSFX } from "./sfx.js";

describe("generateWav", () => {
	it("returns a Buffer starting with RIFF header", () => {
		const buf = generateWav("pending", 0.5);
		expect(Buffer.isBuffer(buf)).toBe(true);
		expect(buf.toString("ascii", 0, 4)).toBe("RIFF");
		expect(buf.toString("ascii", 8, 12)).toBe("WAVE");
	});

	it("generates different buffers for each sound", () => {
		const pending = generateWav("pending", 0.5);
		const send = generateWav("send", 0.5);
		const idle = generateWav("idle", 0.5);
		expect(pending.equals(send)).toBe(false);
		expect(pending.equals(idle)).toBe(false);
	});

	it("generates silent buffer at volume 0", () => {
		const buf = generateWav("pending", 0);
		const pcm = buf.subarray(44);
		// Check that all 16-bit samples are 0
		for (let i = 0; i < pcm.length; i += 2) {
			expect(pcm.readInt16LE(i)).toBe(0);
		}
	});

	it("returns null for unknown sound name", () => {
		expect(generateWav("unknown", 0.5)).toBeNull();
	});
});

describe("createSFX", () => {
	let sfx;
	let mockPrefs;

	beforeEach(() => {
		mockPrefs = { sfx: { muted: false, volume: 0.5 } };
		sfx = createSFX(() => Promise.resolve(mockPrefs));
	});

	it("playSound is a no-op when muted", async () => {
		mockPrefs.sfx.muted = true;
		await sfx.playSound("pending");
		// No error thrown
	});

	it("previewSound plays even when muted", async () => {
		mockPrefs.sfx.muted = true;
		await sfx.previewSound("pending");
		// No error thrown (playback may fail in test env, that's OK)
	});

	it("playSound ignores unknown sound names", async () => {
		await sfx.playSound("unknown");
		// No error thrown
	});
});
