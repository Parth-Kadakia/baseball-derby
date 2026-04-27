// Audio engine: plays generated MP3 SFX with synthesized fallbacks. Both
// layers route through a master gain so volume/mute apply uniformly.

let ac = null;
let masterGain = null;
let muted = false;
let volume = 0.7;

function ensure(){
  if (ac) return ac;
  ac = new (window.AudioContext || window.webkitAudioContext)();
  masterGain = ac.createGain();
  masterGain.gain.value = muted ? 0 : volume;
  masterGain.connect(ac.destination);
  return ac;
}

export function setMuted(m){ muted = m; if (masterGain) masterGain.gain.value = m ? 0 : volume; }
export function setVolume(v){ volume = v; if (masterGain && !muted) masterGain.gain.value = v; }
export function resume(){ if (ac && ac.state === 'suspended') ac.resume(); }

function noiseBuffer(seconds){
  const ctx = ensure();
  const len = (seconds * ctx.sampleRate)|0;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random()*2 - 1;
  return buf;
}

// ---- synth fallbacks (used only when the matching MP3 is missing) ----
function synthBatCrack(power = 1){
  const ctx = ensure(); const t = ctx.currentTime;
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer(0.18);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass'; bp.frequency.value = 2400; bp.Q.value = 0.6;
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0.001, t);
  ng.gain.exponentialRampToValueAtTime(0.9*power, t+0.005);
  ng.gain.exponentialRampToValueAtTime(0.001, t+0.16);
  noise.connect(bp).connect(ng).connect(masterGain);
  noise.start(t); noise.stop(t+0.2);
  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(180, t);
  osc.frequency.exponentialRampToValueAtTime(60, t+0.08);
  const og = ctx.createGain();
  og.gain.setValueAtTime(0.001, t);
  og.gain.exponentialRampToValueAtTime(0.6*power, t+0.005);
  og.gain.exponentialRampToValueAtTime(0.001, t+0.12);
  osc.connect(og).connect(masterGain);
  osc.start(t); osc.stop(t+0.15);
}
function synthBatWhoosh(){
  const ctx = ensure(); const t = ctx.currentTime;
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer(0.25);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass'; bp.Q.value = 1.2;
  bp.frequency.setValueAtTime(400, t);
  bp.frequency.exponentialRampToValueAtTime(2200, t+0.18);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.001, t);
  g.gain.exponentialRampToValueAtTime(0.35, t+0.04);
  g.gain.exponentialRampToValueAtTime(0.001, t+0.22);
  noise.connect(bp).connect(g).connect(masterGain);
  noise.start(t); noise.stop(t+0.25);
}
function synthGlovePop(){
  const ctx = ensure(); const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(220, t);
  osc.frequency.exponentialRampToValueAtTime(80, t+0.06);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.001, t);
  g.gain.exponentialRampToValueAtTime(0.45, t+0.005);
  g.gain.exponentialRampToValueAtTime(0.001, t+0.1);
  osc.connect(g).connect(masterGain);
  osc.start(t); osc.stop(t+0.12);
}
function synthPitchWhoosh(){
  const ctx = ensure(); const t = ctx.currentTime;
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer(0.35);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass'; bp.Q.value = 2;
  bp.frequency.setValueAtTime(800, t);
  bp.frequency.exponentialRampToValueAtTime(3500, t+0.3);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.001, t);
  g.gain.exponentialRampToValueAtTime(0.18, t+0.1);
  g.gain.exponentialRampToValueAtTime(0.001, t+0.32);
  noise.connect(bp).connect(g).connect(masterGain);
  noise.start(t); noise.stop(t+0.36);
}
function synthUmpBlip(highHz=900, lowHz=600){
  const ctx = ensure(); const t = ctx.currentTime;
  [[highHz, 0], [lowHz, 0.09]].forEach(([f, off]) => {
    const osc = ctx.createOscillator();
    osc.type = 'square'; osc.frequency.value = f;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, t+off);
    g.gain.exponentialRampToValueAtTime(0.18, t+off+0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t+off+0.08);
    osc.connect(g).connect(masterGain);
    osc.start(t+off); osc.stop(t+off+0.1);
  });
}
function synthCrowdCheer(intensity = 1){
  const ctx = ensure(); const t = ctx.currentTime;
  const dur = 1.6 * intensity;
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer(dur);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass'; bp.Q.value = 0.8;
  bp.frequency.setValueAtTime(600, t);
  bp.frequency.linearRampToValueAtTime(1400, t+dur*0.4);
  bp.frequency.linearRampToValueAtTime(800, t+dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.001, t);
  g.gain.linearRampToValueAtTime(0.4*intensity, t+dur*0.25);
  g.gain.linearRampToValueAtTime(0.25*intensity, t+dur*0.6);
  g.gain.exponentialRampToValueAtTime(0.001, t+dur);
  noise.connect(bp).connect(g).connect(masterGain);
  noise.start(t); noise.stop(t+dur+0.05);
}
function synthCrowdGroan(){
  const ctx = ensure(); const t = ctx.currentTime;
  const dur = 0.9;
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer(dur);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass'; lp.Q.value = 0.7;
  lp.frequency.setValueAtTime(800, t);
  lp.frequency.linearRampToValueAtTime(300, t+dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.001, t);
  g.gain.linearRampToValueAtTime(0.18, t+0.15);
  g.gain.exponentialRampToValueAtTime(0.001, t+dur);
  noise.connect(lp).connect(g).connect(masterGain);
  noise.start(t); noise.stop(t+dur+0.05);
}

// ---- file-based SFX with variants ----
// Each event id can have multiple variants: <id>.mp3, <id>_2.mp3, <id>_3.mp3
// at runtime we pick one at random per playback so identical events sound
// different each time. The base file (no suffix) is always tried first.
const buffers = {}; // id -> AudioBuffer | 'failed'

const SFX_IDS = [
  // base sounds
  'bat_crack', 'bat_crack_perfect', 'bat_whoosh', 'bat_foul_tip',
  'glove_pop', 'pitch_whoosh', 'ump_strike', 'ump_strike_three',
  'ump_ball', 'ump_safe',
  'crowd_cheer_big', 'crowd_cheer_small', 'crowd_groan', 'crowd_walk',
  'crowd_miss', 'crowd_aw',
  'crowd_ambient',
  // variants — script generates these too. Loading is non-fatal if missing.
  'crowd_cheer_big_2', 'crowd_cheer_big_3',
  'crowd_cheer_small_2',
  'crowd_groan_2',
  'crowd_miss_2',
  'bat_crack_2', 'bat_crack_perfect_2',
];

async function loadFile(id){
  if (buffers[id] != null) return;
  const ctx = ensure();
  try {
    const res = await fetch(`/sounds/sfx/${id}.mp3`);
    if (!res.ok) throw new Error('http ' + res.status);
    const arr = await res.arrayBuffer();
    buffers[id] = await ctx.decodeAudioData(arr);
  } catch {
    buffers[id] = 'failed';
  }
}

export function preloadAll(){ return Promise.all(SFX_IDS.map(loadFile)); }

// Build the candidate list for an event: base id + numbered variants. Only
// successfully-loaded buffers are kept. Cached so we only pay the cost once.
const variantCache = {};
function variantsFor(baseId){
  if (variantCache[baseId]) return variantCache[baseId];
  const list = [];
  for (const id of [baseId, `${baseId}_2`, `${baseId}_3`, `${baseId}_4`]){
    const b = buffers[id];
    if (b && b !== 'failed') list.push(b);
  }
  variantCache[baseId] = list;
  return list;
}

function playFile(baseId, gain = 1, rate = 1){
  const candidates = variantsFor(baseId);
  if (candidates.length === 0) return false;
  // Random variant + small playback-rate jitter so even the same buffer
  // sounds slightly different each play.
  const buf = candidates[Math.floor(Math.random() * candidates.length)];
  const ctx = ensure();
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = rate * (0.96 + Math.random() * 0.08);  // ±4% jitter
  const g = ctx.createGain();
  g.gain.value = gain * (0.92 + Math.random() * 0.16);            // ±8% gain jitter
  src.connect(g).connect(masterGain);
  src.start(ctx.currentTime);
  return true;
}

// ---- public event API: file with synth fallback ----
export function batCrack(power = 1){
  if (power >= 1.1 && playFile('bat_crack_perfect', 1.0)) return;
  if (playFile('bat_crack', 0.9)) return;
  synthBatCrack(power);
}
export function batWhoosh(){ if (!playFile('bat_whoosh', 0.8)) synthBatWhoosh(); }
export function batFoul()  { if (!playFile('bat_foul_tip', 0.8)) synthBatCrack(0.5); }
export function glovePop() { if (!playFile('glove_pop', 0.7)) synthGlovePop(); }
export function pitchWhoosh(){ if (!playFile('pitch_whoosh', 0.6)) synthPitchWhoosh(); }
export function umpStrike(three = false){
  const id = three ? 'ump_strike_three' : 'ump_strike';
  if (!playFile(id, 0.85)) synthUmpBlip(950, 600);
}
export function umpBall()  { if (!playFile('ump_ball', 0.85)) synthUmpBlip(620, 480); }
export function umpSafe()  { if (!playFile('ump_safe', 0.85)) synthUmpBlip(900, 600); }
export function crowdCheer(intensity = 1){
  const id = intensity >= 1.2 ? 'crowd_cheer_big' : 'crowd_cheer_small';
  if (!playFile(id, Math.min(1, 0.6 + intensity*0.2))) synthCrowdCheer(intensity);
}
export function crowdGroan(){ if (!playFile('crowd_groan', 0.7)) synthCrowdGroan(); }
export function crowdWalk() { if (!playFile('crowd_walk', 0.7)) synthCrowdCheer(0.6); }
// Softer "ohh" — used after a non-HR contact in derby (it's not a strikeout
// so we don't want the full crowdGroan disappointment).
export function crowdMiss() { if (!playFile('crowd_miss', 0.55)) synthCrowdGroan(); }
// Mild "aww" — used on a swing-and-miss in derby.
export function crowdAw()   { if (!playFile('crowd_aw',   0.5))  synthCrowdGroan(); }

// ---- ambient bgm (loops crowd_ambient if generated, falls back to ballpark.ogg) ----
let bgmEl = null;
let bgmVolume = 0.55;
function makeBgm(src){
  const el = new Audio(src);
  el.loop = true;
  el.volume = bgmVolume;
  return el;
}
export function startBgm(){
  if (bgmEl) return;
  bgmEl = makeBgm('/sounds/sfx/crowd_ambient.mp3');
  bgmEl.addEventListener('error', () => {
    // Generated ambient missing → fall back to the legacy stadium loop.
    bgmEl = makeBgm('/sounds/ballpark.ogg.mp3');
    bgmEl.play().catch(() => {});
  }, { once: true });
  bgmEl.play().catch(err => console.warn('bgm autoplay blocked', err));
}
export function setBgmVolume(v){
  bgmVolume = v;
  if (bgmEl) bgmEl.volume = v;
}
