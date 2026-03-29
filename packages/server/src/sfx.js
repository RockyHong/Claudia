import { execFile } from "node:child_process";
import { writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir, platform } from "node:os";
import { randomBytes } from "node:crypto";

const SAMPLE_RATE = 44100;
const DURATION = 0.6;
const NUM_SAMPLES = Math.ceil(SAMPLE_RATE * DURATION);

// --- Synth generators (return Float64Array of samples, -1 to 1) ---

function synthSend() {
	// White noise through lowpass filter sweep (4000 Hz → 500 Hz)
	const samples = new Float64Array(NUM_SAMPLES);
	let seed = 12345;
	function nextRandom() {
		seed = (seed * 16807 + 0) % 2147483647;
		return (seed / 2147483647) * 2 - 1;
	}

	const startFreq = 4000;
	const endFreq = 500;
	const tau = DURATION * 0.3;
	let filterState = 0;

	for (let i = 0; i < NUM_SAMPLES; i++) {
		const t = i / SAMPLE_RATE;
		const noise = nextRandom();
		const freq = endFreq + (startFreq - endFreq) * Math.exp(-t / tau);
		const rc = 1 / (2 * Math.PI * freq);
		const alpha = 1 / (1 + rc * SAMPLE_RATE);
		filterState += alpha * (noise - filterState);

		let env;
		if (t < 0.08) {
			env = t / 0.08;
		} else {
			env = 0.5 * Math.pow(0.001 / 0.5, (t - 0.08) / (DURATION - 0.08));
		}
		samples[i] = filterState * env;
	}
	return samples;
}

function synthPending() {
	// Two sine oscillators (659.25 Hz + 880 Hz), staggered 150ms
	const samples = new Float64Array(NUM_SAMPLES);
	const stagger = 0.15;

	for (let i = 0; i < NUM_SAMPLES; i++) {
		const t = i / SAMPLE_RATE;
		let val = 0;

		if (t < 0.3) {
			const env1 = 0.8 * Math.pow(0.001 / 0.8, t / 0.6);
			val += Math.sin(2 * Math.PI * 659.25 * t) * env1;
		}

		if (t >= stagger) {
			const t2 = t - stagger;
			const env2 = 0.8 * Math.pow(0.001 / 0.8, t2 / 0.45);
			val += Math.sin(2 * Math.PI * 880 * t2) * env2;
		}

		samples[i] = val;
	}
	return samples;
}

function synthIdle() {
	// Two sine oscillators (880 Hz + 659.25 Hz) — reversed from pending
	const samples = new Float64Array(NUM_SAMPLES);
	const stagger = 0.15;

	for (let i = 0; i < NUM_SAMPLES; i++) {
		const t = i / SAMPLE_RATE;
		let val = 0;

		if (t < 0.3) {
			const env1 = 0.8 * Math.pow(0.001 / 0.8, t / 0.6);
			val += Math.sin(2 * Math.PI * 880 * t) * env1;
		}

		if (t >= stagger) {
			const t2 = t - stagger;
			const env2 = 0.8 * Math.pow(0.001 / 0.8, t2 / 0.45);
			val += Math.sin(2 * Math.PI * 659.25 * t2) * env2;
		}

		samples[i] = val;
	}
	return samples;
}

const SYNTHS = { send: synthSend, pending: synthPending, idle: synthIdle };

// --- WAV encoding ---

export function generateWav(name, volume) {
	const synth = SYNTHS[name];
	if (!synth) return null;

	const samples = synth();
	const numSamples = samples.length;
	const bytesPerSample = 2;
	const dataSize = numSamples * bytesPerSample;
	const buffer = Buffer.alloc(44 + dataSize);

	// WAV header
	buffer.write("RIFF", 0);
	buffer.writeUInt32LE(36 + dataSize, 4);
	buffer.write("WAVE", 8);
	buffer.write("fmt ", 12);
	buffer.writeUInt32LE(16, 16);
	buffer.writeUInt16LE(1, 20);
	buffer.writeUInt16LE(1, 22);
	buffer.writeUInt32LE(SAMPLE_RATE, 24);
	buffer.writeUInt32LE(SAMPLE_RATE * bytesPerSample, 28);
	buffer.writeUInt16LE(bytesPerSample, 32);
	buffer.writeUInt16LE(16, 34);
	buffer.write("data", 36);
	buffer.writeUInt32LE(dataSize, 40);

	for (let i = 0; i < numSamples; i++) {
		const clamped = Math.max(-1, Math.min(1, samples[i] * volume));
		const int16 = Math.round(clamped * 32767);
		buffer.writeInt16LE(int16, 44 + i * 2);
	}

	return buffer;
}

// --- Platform playback ---

const currentPlatform = platform();

function playWavFile(filePath) {
	return new Promise((resolve) => {
		let cmd, args;
		if (currentPlatform === "win32") {
			const ps = `$p = New-Object Media.SoundPlayer '${filePath.replace(/'/g, "''")}'; $p.PlaySync()`;
			cmd = "powershell";
			args = ["-NoProfile", "-Command", ps];
		} else if (currentPlatform === "darwin") {
			cmd = "afplay";
			args = [filePath];
		} else {
			cmd = "aplay";
			args = ["-q", filePath];
		}
		execFile(cmd, args, { timeout: 10000 }, () => {
			unlink(filePath).catch(() => {});
			resolve();
		});
	});
}

// --- Public API ---

export function createSFX(getPreferences) {
	async function playSound(name) {
		const prefs = await getPreferences();
		if (prefs.sfx.muted) return;
		const wav = generateWav(name, prefs.sfx.volume);
		if (!wav) return;
		const filePath = join(
			tmpdir(),
			`claudia-sfx-${randomBytes(4).toString("hex")}.wav`,
		);
		await writeFile(filePath, wav);
		playWavFile(filePath); // fire-and-forget
	}

	async function previewSound(name) {
		const prefs = await getPreferences();
		const wav = generateWav(name, prefs.sfx.volume);
		if (!wav) return;
		const filePath = join(
			tmpdir(),
			`claudia-sfx-${randomBytes(4).toString("hex")}.wav`,
		);
		await writeFile(filePath, wav);
		playWavFile(filePath); // fire-and-forget
	}

	return { playSound, previewSound };
}
