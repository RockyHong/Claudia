// Temporary SFX preview page — inline HTML for testing synth vs MP3 sounds

export function registerSfxPreview(app) {
  app.get("/sfx-preview", (req, res) => {
    res.type("html").send(/* html */ `<!DOCTYPE html>
<html><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>Claudia SFX Preview</title>
<style>
  * { margin: 0; box-sizing: border-box; }
  body { font-family: system-ui, sans-serif; background: #0f1117; color: #e1e4ed; padding: 40px 20px; }
  h1 { font-size: 20px; margin-bottom: 24px; }
  .grid { display: flex; flex-direction: column; gap: 16px; max-width: 400px; }
  .row { display: flex; align-items: center; gap: 12px; }
  .label { width: 80px; font-size: 14px; color: #8b8fa3; }
  button { background: #1a1d27; border: 1px solid #2a2d3a; border-radius: 8px; padding: 10px 20px;
    color: #e1e4ed; font-size: 14px; cursor: pointer; transition: all 0.15s; }
  button:hover { background: #2a2d3a; }
  button:active { transform: scale(0.97); }
  .synth { border-color: #3b82f6; }
  .file { border-color: #22c55e; }
  .note { margin-top: 24px; font-size: 12px; color: #6b7280; }
  .volume { display: flex; align-items: center; gap: 8px; margin-bottom: 20px; font-size: 13px; color: #8b8fa3; }
  input[type=range] { width: 150px; }
</style>
</head><body>
<h1>SFX Preview</h1>
<div class="volume">Volume: <input type="range" id="vol" min="0" max="1" step="0.05" value="0.5"> <span id="vol-label">0.5</span></div>
<div class="grid">
  <div class="row"><span class="label">Pending</span>
    <button class="synth" onclick="synthPending()">Synth</button>
    <button class="file" onclick="playFile('pending')">MP3</button></div>
  <div class="row"><span class="label">Busy</span>
    <button class="synth" onclick="synthBusy()">Synth</button>
    <button class="file" onclick="playFile('busy')">MP3</button></div>
  <div class="row"><span class="label">Idle</span>
    <button class="synth" onclick="synthIdle()">Synth</button>
    <button class="file" onclick="playFile('idle')">MP3</button></div>
</div>
<p class="note">Synth = Web Audio fallback. MP3 = file from /sfx/ (may 404 if not uploaded yet).</p>
<script>
const volEl = document.getElementById('vol');
const volLabel = document.getElementById('vol-label');
volEl.oninput = () => { volLabel.textContent = volEl.value; };
function vol() { return parseFloat(volEl.value); }

let ctx;
function getCtx() {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function synthPending() {
  const c = getCtx(), now = c.currentTime, v = vol();
  const g1 = c.createGain(); g1.connect(c.destination);
  g1.gain.setValueAtTime(v*0.8, now); g1.gain.exponentialRampToValueAtTime(0.001, now+0.6);
  const o1 = c.createOscillator(); o1.type='sine'; o1.frequency.setValueAtTime(659.25, now);
  o1.connect(g1); o1.start(now); o1.stop(now+0.3);
  const g2 = c.createGain(); g2.connect(c.destination);
  g2.gain.setValueAtTime(0.001, now); g2.gain.setValueAtTime(v*0.8, now+0.15);
  g2.gain.exponentialRampToValueAtTime(0.001, now+0.6);
  const o2 = c.createOscillator(); o2.type='sine'; o2.frequency.setValueAtTime(880, now+0.15);
  o2.connect(g2); o2.start(now+0.15); o2.stop(now+0.6);
}

function synthBusy() {
  const c = getCtx(), now = c.currentTime, v = vol(), dur = 0.6;
  const bufSz = Math.ceil(c.sampleRate*dur), buf = c.createBuffer(1, bufSz, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i=0; i<bufSz; i++) d[i] = Math.random()*2-1;
  const n = c.createBufferSource(); n.buffer = buf;
  const f = c.createBiquadFilter(); f.type='lowpass';
  f.frequency.setValueAtTime(4000,now); f.frequency.setTargetAtTime(500,now,dur*0.3); f.Q.setValueAtTime(0.7,now);
  const g = c.createGain(); g.gain.setValueAtTime(0.001,now);
  g.gain.linearRampToValueAtTime(v*0.5,now+0.08); g.gain.exponentialRampToValueAtTime(0.001,now+dur);
  n.connect(f); f.connect(g); g.connect(c.destination); n.start(now); n.stop(now+dur);
}

function synthIdle() {
  const c = getCtx(), now = c.currentTime, v = vol();
  const g1 = c.createGain(); g1.connect(c.destination);
  g1.gain.setValueAtTime(v*0.8, now); g1.gain.exponentialRampToValueAtTime(0.001, now+0.6);
  const o1 = c.createOscillator(); o1.type='sine'; o1.frequency.setValueAtTime(880, now);
  o1.connect(g1); o1.start(now); o1.stop(now+0.3);
  const g2 = c.createGain(); g2.connect(c.destination);
  g2.gain.setValueAtTime(0.001, now); g2.gain.setValueAtTime(v*0.8, now+0.15);
  g2.gain.exponentialRampToValueAtTime(0.001, now+0.6);
  const o2 = c.createOscillator(); o2.type='sine'; o2.frequency.setValueAtTime(659.25, now+0.15);
  o2.connect(g2); o2.start(now+0.15); o2.stop(now+0.6);
}

function playFile(name) {
  const a = new Audio('/sfx/' + name + '.mp3');
  a.volume = vol();
  a.play().catch(e => alert('No MP3 file found for ' + name));
}
</script>
</body></html>`);
  });
}
