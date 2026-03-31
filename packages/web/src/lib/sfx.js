/**
 * Web Audio synth for SFX playback.
 * Server decides when to play (via SSE), this module handles the audio output.
 * Volume/mute controlled by preferences fetched from the API.
 */

let audioContext = null;

function getContext() {
  if (!audioContext) audioContext = new AudioContext();
  return audioContext;
}

// Keep trying to unlock on every user gesture until actually running
function unlockAudio() {
  const ctx = getContext();
  if (ctx.state === "running") {
    document.removeEventListener("click", unlockAudio);
    document.removeEventListener("keydown", unlockAudio);
    return;
  }
  ctx.resume().then(() => {
    if (ctx.state === "running") {
      document.removeEventListener("click", unlockAudio);
      document.removeEventListener("keydown", unlockAudio);
    }
  });
}
document.addEventListener("click", unlockAudio);
document.addEventListener("keydown", unlockAudio);

// --- Synth sounds ---

function synthSend(volume) {
  const ctx = getContext();
  const now = ctx.currentTime;
  const duration = 0.6;

  const bufferSize = Math.ceil(ctx.sampleRate * duration);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }

  const noise = ctx.createBufferSource();
  noise.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(4000, now);
  filter.frequency.setTargetAtTime(500, now, duration * 0.3);
  filter.Q.setValueAtTime(0.7, now);

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

function synthPending(volume) {
  const ctx = getContext();
  const now = ctx.currentTime;

  const gain1 = ctx.createGain();
  gain1.connect(ctx.destination);
  gain1.gain.setValueAtTime(volume * 0.35, now);
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
  gain2.gain.setValueAtTime(volume * 0.35, now + 0.15);
  gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

  const osc2 = ctx.createOscillator();
  osc2.type = "sine";
  osc2.frequency.setValueAtTime(880, now + 0.15);
  osc2.connect(gain2);
  osc2.start(now + 0.15);
  osc2.stop(now + 0.6);
}

function synthIdle(volume) {
  const ctx = getContext();
  const now = ctx.currentTime;

  const gain1 = ctx.createGain();
  gain1.connect(ctx.destination);
  gain1.gain.setValueAtTime(volume * 0.35, now);
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
  gain2.gain.setValueAtTime(volume * 0.35, now + 0.15);
  gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

  const osc2 = ctx.createOscillator();
  osc2.type = "sine";
  osc2.frequency.setValueAtTime(659.25, now + 0.15);
  osc2.connect(gain2);
  osc2.start(now + 0.15);
  osc2.stop(now + 0.6);
}

const SYNTHS = { send: synthSend, pending: synthPending, idle: synthIdle };

// --- Controller ---

export function createSFXController() {
  let muted = false;
  let volume = 0.5;

  return {
    get muted() { return muted; },
    set muted(v) { muted = v; },

    get volume() { return volume; },
    set volume(v) { volume = v; },

    /** Play a sound triggered by SSE. Respects mute/volume. */
    play(name) {
      if (muted) return;
      const synth = SYNTHS[name];
      if (synth) synth(volume);
    },

    /** Play for settings preview. Ignores mute. */
    preview(name) {
      const synth = SYNTHS[name];
      if (synth) synth(volume);
    },
  };
}
