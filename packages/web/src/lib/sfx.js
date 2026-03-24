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
  const audio = new Audio(src);
  let fileAvailable = null;

  audio.addEventListener("canplaythrough", () => { fileAvailable = true; }, { once: true });
  audio.addEventListener("error", () => { fileAvailable = false; }, { once: true });

  return (volume) => {
    if (fileAvailable === false) {
      fallbackFn(volume);
      return;
    }
    audio.volume = volume;
    audio.currentTime = 0;
    audio.play().catch(() => {
      fallbackFn(volume);
    });
  };
}

// --- Web Audio API synthesis fallback ---

let audioContext = null;

function getContext() {
  if (!audioContext) audioContext = new AudioContext();
  return audioContext;
}

function synthPendingChime(volume) {
  const ctx = getContext();
  const now = ctx.currentTime;

  const gain1 = ctx.createGain();
  gain1.connect(ctx.destination);
  gain1.gain.setValueAtTime(volume * 0.3, now);
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
  gain2.gain.setValueAtTime(volume * 0.3, now + 0.15);
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

  // White noise burst shaped into a short whoosh
  const bufferSize = ctx.sampleRate * 0.15;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
  }

  const noise = ctx.createBufferSource();
  noise.buffer = buffer;

  // Bandpass filter to make it sound like a soft send/swoosh
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.setValueAtTime(2000, now);
  filter.Q.setValueAtTime(0.5, now);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(volume * 0.15, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

  noise.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  noise.start(now);
  noise.stop(now + 0.15);
}

function synthIdleTone(volume) {
  const ctx = getContext();
  const now = ctx.currentTime;

  const gain = ctx.createGain();
  gain.connect(ctx.destination);
  gain.gain.setValueAtTime(volume * 0.2, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(523.25, now);
  osc.frequency.exponentialRampToValueAtTime(392, now + 0.4);
  osc.connect(gain);
  osc.start(now);
  osc.stop(now + 0.5);
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
