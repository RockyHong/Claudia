// Fetches and caches Claude platform status from status.claude.com

const STATUS_URL = "https://status.claude.com/api/v2/summary.json";
const POLL_INTERVAL_MS = 60_000;
const RELEVANT_IDS = new Set([
	"yyzkbfz2thpt", // Claude Code
	"k8w3r06qmzrp", // Claude API
]);

let cached = null;
let pollTimer = null;

async function fetchStatus() {
	try {
		const res = await fetch(STATUS_URL, {
			signal: AbortSignal.timeout(10_000),
		});
		if (!res.ok) return;
		const data = await res.json();

		const components = (data.components || [])
			.filter((c) => RELEVANT_IDS.has(c.id))
			.map((c) => ({ name: c.name, status: c.status }));

		// Worst-of-all: operational < degraded_performance < partial_outage < major_outage
		const severity = {
			operational: 0,
			degraded_performance: 1,
			partial_outage: 2,
			major_outage: 3,
		};
		const worst = components.reduce(
			(max, c) => Math.max(max, severity[c.status] ?? 0),
			0,
		);
		const overall =
			Object.keys(severity).find((k) => severity[k] === worst) || "operational";

		cached = { overall, components, ts: Date.now() };
	} catch {
		// Keep stale cache on failure
	}
}

export function startStatusPolling() {
	fetchStatus();
	pollTimer = setInterval(fetchStatus, POLL_INTERVAL_MS);
}

export function stopStatusPolling() {
	if (pollTimer) {
		clearInterval(pollTimer);
		pollTimer = null;
	}
}

export function getCachedStatus() {
	return cached;
}
