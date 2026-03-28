/**
 * Sound effects for session state transitions.
 * Tries MP3 files from /sfx/ first, falls back to Web Audio API synthesis.
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

// --- Audio file playback ---

function createAudioWithFallback(src, fallbackFn) {
  let audio = null;
  let fileAvailable = false;

  // Probe with fetch to avoid browser console errors on 404
  fetch(src, { method: "HEAD" })
    .then((res) => {
      if (res.ok) {
        audio = new Audio(src);
        fileAvailable = true;
      }
    })
    .catch(() => {
      // Network error — stay on synth fallback
    });

  return (volume) => {
    if (!fileAvailable || !audio) {
      ensureContextReady().then(() => fallbackFn(volume));
      return;
    }
    audio.volume = volume;
    audio.currentTime = 0;
    audio.play().catch(() => {
      ensureContextReady().then(() => fallbackFn(volume));
    });
  };
}

// --- Web Audio API synthesis fallback ---

let audioContext = null;
let resumePromise = null;

function getContext() {
  if (!audioContext) audioContext = new AudioContext();
  if (audioContext.state === "suspended" && !resumePromise) {
    resumePromise = audioContext.resume().then(() => { resumePromise = null; });
  }
  return audioContext;
}

function ensureContextReady() {
  getContext();
  return resumePromise || Promise.resolve();
}

// Unlock AudioContext on first user interaction (browsers require a gesture)
function unlockAudio() {
  getContext();
  document.removeEventListener("click", unlockAudio);
  document.removeEventListener("keydown", unlockAudio);
}
document.addEventListener("click", unlockAudio);
document.addEventListener("keydown", unlockAudio);

function synthPendingChime(volume) {
  const ctx = getContext();
  const now = ctx.currentTime;

  const gain1 = ctx.createGain();
  gain1.connect(ctx.destination);
  gain1.gain.setValueAtTime(volume * 0.8, now);
  gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

  const osc1 = ctx.createOscillator();
  osc1.type = "sine";
  osc1.frequency.setValueAtTime(659.25, now);
  osc1.connect(gain1);
  osc1.start(now);
  osc1.stop(now + 0.3);

  const gain2 = ctx.createGain();
  gain2.connect(ctx.destination);
  gain2.gain.setValueAtTime(0.001, now);
  gain2.gain.setValueAtTime(volume * 0.8, now + 0.15);
  gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

  const osc2 = ctx.createOscillator();
  osc2.type = "sine";
  osc2.frequency.setValueAtTime(880, now + 0.15);
  osc2.connect(gain2);
  osc2.start(now + 0.15);
  osc2.stop(now + 0.6);
}

function synthBusyWhoosh(volume) {
  const ctx = getContext();
  const now = ctx.currentTime;
  const duration = 0.6;

  // White noise so the lowpass sweep is clearly audible
  const bufferSize = Math.ceil(ctx.sampleRate * duration);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }

  const noise = ctx.createBufferSource();
  noise.buffer = buffer;

  // Low-pass filter sweeping down for a "sent away" fade
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(4000, now);
  filter.frequency.setTargetAtTime(500, now, duration * 0.3);
  filter.Q.setValueAtTime(0.7, now);

  // Quick fade-in, long fade-out envelope
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.001, now);
  gain.gain.linearRampToValueAtTime(volume * 0.5, now + 0.08);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

  noise.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  noise.start(now);
  noise.stop(now + duration);
}

function synthIdleTone(volume) {
  const ctx = getContext();
  const now = ctx.currentTime;

  const gain1 = ctx.createGain();
  gain1.connect(ctx.destination);
  gain1.gain.setValueAtTime(volume * 0.8, now);
  gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

  const osc1 = ctx.createOscillator();
  osc1.type = "sine";
  osc1.frequency.setValueAtTime(880, now);
  osc1.connect(gain1);
  osc1.start(now);
  osc1.stop(now + 0.3);

  const gain2 = ctx.createGain();
  gain2.connect(ctx.destination);
  gain2.gain.setValueAtTime(0.001, now);
  gain2.gain.setValueAtTime(volume * 0.8, now + 0.15);
  gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

  const osc2 = ctx.createOscillator();
  osc2.type = "sine";
  osc2.frequency.setValueAtTime(659.25, now + 0.15);
  osc2.connect(gain2);
  osc2.start(now + 0.15);
  osc2.stop(now + 0.6);
}

// --- Controller ---

const playBusySound = createAudioWithFallback("/sfx/busy.mp3", synthBusyWhoosh);
const playPendingSound = createAudioWithFallback("/sfx/pending.mp3", synthPendingChime);
const playIdleSound = createAudioWithFallback("/sfx/idle.mp3", synthIdleTone);

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

    playBusy() {
      if (prefs.muted) return;
      playBusySound(prefs.volume);
    },

    playPending() {
      if (prefs.muted) return;
      playPendingSound(prefs.volume);
    },

    playIdle() {
      if (prefs.muted) return;
      playIdleSound(prefs.volume);
    },

    preview(sound) {
      if (sound === "busy") playBusySound(prefs.volume);
      if (sound === "pending") playPendingSound(prefs.volume);
      if (sound === "idle") playIdleSound(prefs.volume);
    },
  };
}
