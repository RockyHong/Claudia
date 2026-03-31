import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const CREDENTIALS_PATH = path.join(
	os.homedir(),
	".claude",
	".credentials.json",
);
const API_URL = "https://api.anthropic.com/api/oauth/usage";
const COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes
const MAX_BACKOFF_MS = 60 * 60 * 1000; // 60 minutes

async function readToken() {
	try {
		const raw = await fs.readFile(CREDENTIALS_PATH, "utf-8");
		const creds = JSON.parse(raw);
		return creds?.claudeAiOauth?.accessToken || null;
	} catch {
		return null;
	}
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
