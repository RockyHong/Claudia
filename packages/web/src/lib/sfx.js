/**
 * Sound effects for session state transitions.
 * Plays MP3 files from /sfx/ served by the Express server.
 * Files: pending.mp3, idle.mp3
 */

const STORAGE_KEY = "claudia-sfx";

function loadPreferences() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch {
    // Ignore corrupt storage
  }
  return { muted: false, volume: 0.5 };
}

function savePreferences(prefs) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
}

const pendingAudio = new Audio("/sfx/pending.mp3");
const idleAudio = new Audio("/sfx/idle.mp3");

function play(audio, volume) {
  audio.volume = volume;
  audio.currentTime = 0;
  audio.play().catch(() => {
    // Browser may block autoplay until user interaction
  });
}

export function createSFXController() {
  let prefs = loadPreferences();

  return {
    get muted() {
      return prefs.muted;
    },
    set muted(value) {
      prefs.muted = value;
      savePreferences(prefs);
    },

    get volume() {
      return prefs.volume;
    },
    set volume(value) {
      prefs.volume = value;
      savePreferences(prefs);
    },

    playPending() {
      if (prefs.muted) return;
      play(pendingAudio, prefs.volume);
    },

    playIdle() {
      if (prefs.muted) return;
      play(idleAudio, prefs.volume);
    },

    preview(sound) {
      if (sound === "pending") play(pendingAudio, prefs.volume);
      if (sound === "idle") play(idleAudio, prefs.volume);
    },
  };
}
