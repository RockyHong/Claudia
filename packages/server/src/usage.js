import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const CREDENTIALS_PATH = path.join(
	os.homedir(),
	".claude",
	".credentials.json",
);
const API_URL = "https://api.anthropic.com/api/oauth/usage";
const COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes
const MAX_BACKOFF_MS = 60 * 60 * 1000; // 60 minutes

function extractToken(json) {
	try {
		const creds = JSON.parse(json);
		return creds?.claudeAiOauth?.accessToken || null;
	} catch {
		return null;
	}
}

function readTokenFromKeychain() {
	return new Promise((resolve) => {
		execFile(
			"security",
			["find-generic-password", "-s", "Claude Code-credentials", "-w"],
			{ timeout: 5000 },
			(err, stdout) => {
				if (err) return resolve(null);
				resolve(extractToken(stdout.trim()));
			},
		);
	});
}

async function readToken() {
	// File-based credentials (Windows / Linux)
	try {
		const raw = await fs.readFile(CREDENTIALS_PATH, "utf-8");
		const token = extractToken(raw);
		if (token) return token;
	} catch {
		// fall through
	}
	// macOS: credentials stored in Keychain
	if (os.platform() === "darwin") {
		return readTokenFromKeychain();
	}
	return null;
}

async function fetchUsage(token) {
	const res = await fetch(API_URL, {
		headers: {
			Authorization: `Bearer ${token}`,
			"anthropic-beta": "oauth-2025-04-20",
			"Content-Type": "application/json",
		},
	});

	if (!res.ok) {
		return { error: true, status: res.status };
	}

	const data = await res.json();
	return {
		error: false,
		fiveHour: {
			utilization: data.five_hour?.utilization ?? 0,
			resetsAt: data.five_hour?.resets_at ?? null,
		},
		sevenDay: {
			utilization: data.seven_day?.utilization ?? 0,
			resetsAt: data.seven_day?.resets_at ?? null,
		},
	};
}

export function createUsageClient() {
	let cached = null;
	let lastFetchAt = 0;
	let backoffMs = COOLDOWN_MS;
	let inFlight = false;

	function getUsage() {
		return cached;
	}

	async function refreshUsage() {
		const now = Date.now();
		if (now - lastFetchAt < backoffMs) return cached;
		if (inFlight) return cached;

		const token = await readToken();
		if (!token) {
			console.log("[usage] no credentials found");
			return null;
		}

		inFlight = true;
		lastFetchAt = now;

		try {
			const result = await fetchUsage(token);

			if (result.error) {
				console.log(`[usage] API error: ${result.status}`);
				if (result.status === 429) {
					backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
				}
				return cached;
			}

			console.log(
				`[usage] 5h=${result.fiveHour.utilization}% 7d=${result.sevenDay.utilization}%`,
			);
			backoffMs = COOLDOWN_MS;
			cached = {
				fiveHour: result.fiveHour,
				sevenDay: result.sevenDay,
				fetchedAt: Date.now(),
			};
			return cached;
		} catch (err) {
			console.log(`[usage] fetch error: ${err.message}`);
			return cached;
		} finally {
			inFlight = false;
		}
	}

	return { getUsage, refreshUsage };
}
