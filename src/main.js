import * as THREE from 'three';
import { buildField } from './field.js';
import { Actor, BallSprite, loadSpec } from './actors.js';
import { Particles } from './particles.js';
import { Trail } from './trail.js';
import { recolorAnims } from './recolor.js';
import { tickFeel, effectiveDt, applyShake } from './feel.js';
import * as sfx from './audio.js';
import { setAim, setMeter, updateBallMarker, setModeStat, setBodyMode } from './hud.js';
import { createGame } from './game.js';
import { MODES } from './modes.js';
import { loadProfile, saveProfile, recordDerbyRun, recordCareerRun } from './storage.js';

// ---- three.js bootstrap ----
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.setClearColor(0x102030, 1);
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x0a1830, 24, 90);

const camera = new THREE.PerspectiveCamera(50, innerWidth/innerHeight, 0.1, 200);
camera.position.set(4, 2.2, 16);
camera.lookAt(-2, 1.3, -2);
function fitCamera(){
  const aspect = innerWidth/innerHeight;
  camera.aspect = aspect;
  const hFovRad = THREE.MathUtils.degToRad(45);
  const vFovRad = 2 * Math.atan(Math.tan(hFovRad/2) / aspect);
  camera.fov = Math.min(75, Math.max(35, THREE.MathUtils.radToDeg(vFovRad)));
  camera.updateProjectionMatrix();
}
fitCamera();
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); fitCamera(); });

buildField(scene);

// ---- load all sprite specs in parallel ----
const [pitcherAnims, batterAnims, catcherAnims, umpireAnims, ballAnims] = await Promise.all([
  loadSpec('/slices/pitching.json',    'pitching'),
  loadSpec('/slices/batsman.json',     'batsman'),
  loadSpec('/slices/catching.json',    'catching'),
  loadSpec('/slices/umpire.json',      'umpire'),
  loadSpec('/slices/ball_physics.json','ball_physics'),
]);

const pitcher = new Actor(scene, pitcherAnims, { x:-5.5, z:0,    scale:0.011, flipX:false, renderOrder:1 });
const batter  = new Actor(scene, batterAnims,  { x: 2.4, z:-0.2, scale:0.011, flipX:true,  renderOrder:2 });
const catcher = new Actor(scene, catcherAnims, { x: 4.0, z: 0.4, scale:0.010, flipX:true,  renderOrder:3 });
const umpire  = new Actor(scene, umpireAnims,  { x: 5.4, z: 0.8, scale:0.0095,flipX:true,  renderOrder:4 });
const ball    = new BallSprite(scene, ballAnims);

pitcher.play('idle', 5, true);
batter.play('idle',  6, true);
catcher.play('ready stance', 5, true);
umpire.play('safe', 0.001, false);

const particles = new Particles(scene, 90);
const ballTrail = new Trail(scene, 24);

// ---- profile + run state ----
const profile = loadProfile();
let game = null;
let activeMode = null;
let coloredEnemy = false;
const paused = { value: false };

// ---- DOM refs ----
const titleEl = document.getElementById('title');
const overModal = document.getElementById('overModal');
const overTitle = document.getElementById('over-title');
const overStats = document.getElementById('over-stats');
const pauseModal = document.getElementById('pauseModal');
const modeCards = document.querySelectorAll('#modeCards .mode-card');

// ---- best-score chips on the title cards ----
function refreshBestChips(){
  const d = profile.derby;
  document.getElementById('best-derby').textContent =
    d.gamesPlayed > 0 ? `${d.bestHRs} HR · ${d.bestDistance|0} FT` : '—';
  const c = profile.career;
  document.getElementById('best-career').textContent =
    c.runs > 0 ? `LV ${c.level} · ${c.bestStreak} STREAK` : '—';
}
refreshBestChips();

// ---- title screen team color picker ----
let userHue = profile.teamHue || 220;
document.querySelectorAll('#colorSwatches .sw').forEach(sw => {
  if (parseFloat(sw.dataset.hue) === userHue){
    document.querySelectorAll('#colorSwatches .sw').forEach(s => s.classList.remove('selected'));
    sw.classList.add('selected');
  }
  sw.addEventListener('click', () => {
    document.querySelectorAll('#colorSwatches .sw').forEach(s => s.classList.remove('selected'));
    sw.classList.add('selected');
    userHue = parseFloat(sw.dataset.hue);
  });
});

// ---- mode-card click → start a run ----
modeCards.forEach(card => {
  card.addEventListener('click', () => startRun(card.dataset.mode));
});

function startRun(modeName){
  const mode = MODES[modeName] ?? MODES.endless;
  activeMode = mode;
  applyTeamColors();
  profile.teamHue = userHue; saveProfile(profile);

  setBodyMode(mode.name);

  titleEl.classList.add('hidden');
  overModal.classList.remove('show');
  pauseModal.classList.remove('show');
  paused.value = false;

  sfx.resume();
  sfx.preloadAll();
  sfx.startBgm();

  game = createGame({
    pitcher, batter, catcher, umpire, ball,
    particles, ballTrail,
    mode,
    onGameOver: handleGameOver,
  });
  game.refreshHud();
  setMeter(0); setAim(0);
  setTimeout(game.startWindup, 400);
}

function applyTeamColors(){
  if (coloredEnemy) return;  // textures are mutated in place — only do this once
  const palette = [0, 20, 50, 130, 220, 280, 320];
  const enemyOptions = palette.filter(h => {
    const d = Math.abs(h - userHue);
    return Math.min(d, 360 - d) > 60;
  });
  const enemyHue = enemyOptions[Math.floor(Math.random() * enemyOptions.length)];
  if (userHue !== 220) recolorAnims(batterAnims, userHue);
  if (enemyHue !== 220){
    recolorAnims(pitcherAnims, enemyHue);
    recolorAnims(catcherAnims, enemyHue);
  }
  coloredEnemy = true;
}

// ---- end-of-run → save + show modal ----
function handleGameOver(state, mode){
  // Persist the run.
  if (mode.name === 'derby'){
    recordDerbyRun(profile, {
      score: state.score,
      hrs: state.derbyHRs,
      longestHR: state.derbyLongest,
    });
  } else if (mode.name === 'career'){
    recordCareerRun(profile, {
      atBats: state.careerAtBats,
      hits: state.hits,
      hrs: state.careerHRs,
      finalLevel: state.careerLevel,
      streak: state.careerStreak,
    });
  }
  refreshBestChips();

  overTitle.textContent = mode.name === 'derby'  ? 'DERBY OVER'
                        : mode.name === 'career' ? 'CAREER OVER'
                        : 'GAME OVER';
  const stats = mode.resultStats(state);
  overStats.innerHTML = stats.map(s =>
    `<div class="stat"><div class="lbl">${s.label}</div><div class="num">${s.value}</div></div>`
  ).join('');
  overModal.classList.add('show');
}

// ---- modal buttons ----
document.getElementById('againBtn').addEventListener('click', () => {
  if (!activeMode) return;
  startRun(activeMode.name);
});
document.getElementById('menuBtn').addEventListener('click', () => {
  overModal.classList.remove('show');
  titleEl.classList.remove('hidden');
  game = null;
});
document.getElementById('resumeBtn').addEventListener('click', () => {
  pauseModal.classList.remove('show');
  paused.value = false;
});
document.getElementById('quitBtn').addEventListener('click', () => {
  pauseModal.classList.remove('show');
  paused.value = false;
  titleEl.classList.remove('hidden');
  game = null;
});

// ---- input ----
addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (!game){
    e.stopImmediatePropagation();
    return;
  }
  if ((e.code === 'KeyP' || e.code === 'Escape') && !game.isGameOver()){
    paused.value = !paused.value;
    pauseModal.classList.toggle('show', paused.value);
    return;
  }
  if (paused.value) return;
  if (e.code === 'KeyR' && game.isGameOver()){ game.restart(); overModal.classList.remove('show'); return; }
  if (e.code === 'Space') game.setCharging(true);
  if (e.code === 'KeyA')  game.adjustAim(-1);
  if (e.code === 'KeyD')  game.adjustAim(+1);
}, true);

addEventListener('keyup', (e) => {
  if (e.code === 'Space' && game) game.setCharging(false);
});

// Idle title-screen mode display so the HUD slot doesn't show stale text.
setModeStat('READY', '—');

// ---- main loop ----
let last = performance.now();
function loop(now){
  const realDt = Math.min(0.05, (now - last)/1000); last = now;
  tickFeel(realDt);
  const dt = effectiveDt(realDt, paused.value || !game);

  if (game && !paused.value){
    game.chargeOnly(realDt);
    game.modeTick(realDt);   // ticks derby clock + refreshes HUD periodically
  }

  pitcher.update(dt); batter.update(dt); catcher.update(dt); umpire.update(dt);
  particles.update(dt);

  applyShake(canvas);

  if (game) game.tick(dt);

  updateBallMarker({
    visible: !!game && game.state.phase === 'flight' && ball.mesh.visible,
    worldPos: ball.pos,
    color: game?.state?.pitch?.type?.color ?? 0xffffff,
    camera,
  });

  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
