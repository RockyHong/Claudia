/**
 * SFX trigger logic — decides when to play sounds based on session state transitions.
 * Actual audio playback happens on the frontend via Web Audio API.
 * The server sends {sfx: "soundName"} in SSE broadcasts.
 */

const VALID_SOUNDS = new Set(["send", "pending", "idle"]);

export function createSFX() {
	const previousStates = new Map();
	let firstBroadcast = true;

	/**
	 * Given an SSE update, returns an array of sound names to play.
	 * Called by index.js before broadcasting — sounds are included in the SSE data.
	 */
	function getSoundsForUpdate(sessions) {
		if (firstBroadcast) {
			firstBroadcast = false;
			for (const s of sessions) {
				previousStates.set(s.id, s.state);
			}
			return [];
		}

		const sounds = [];
		for (const s of sessions) {
			const prev = previousStates.get(s.id);
			previousStates.set(s.id, s.state);
			if (prev === s.state) continue;
			if (s.state === "pending") sounds.push("pending");
			else if (s.state === "idle" && prev) sounds.push("idle");
		}

		// Clean up removed sessions
		const currentIds = new Set(sessions.map((s) => s.id));
		for (const id of previousStates.keys()) {
			if (!currentIds.has(id)) previousStates.delete(id);
		}

		return sounds;
	}

	return { getSoundsForUpdate, VALID_SOUNDS };
}
