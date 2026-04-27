import * as THREE from 'three';
import {
  PITCHER_HAND, PLATE,
  SWING_TARGET_T, SWING_PERFECT_OFFSET, SWING_GOOD_OFFSET, rollOutcome,
} from './config.js';
import * as sfx from './audio.js';
import { kick, freeze, slowmo } from './feel.js';
import {
  setMeter, setAim, setScoreboard, setModeStat, setDerbyBoard,
  showTiming, showCall, flash, floater,
} from './hud.js';
import { ENDLESS } from './modes.js';

// State machine for one continuous play loop. Mode-aware: every pitch outcome
// flows through the active mode's hook, which decides whether the at-bat is
// over, whether the run is over, and what HUD stats to show.

export const PLATE_VEC = new THREE.Vector3(PLATE.x, PLATE.y, 0);

export function createGame({
  pitcher, batter, catcher, umpire, ball,
  particles, ballTrail,
  mode = ENDLESS,
  onGameOver,
}){
  const state = {
    phase: 'idle',  // idle | windup | flight | hit | resolved | gameOver
    pitchT: 0,
    swung: false, swingTime: -1, swingPower: 0,
    pitch: null,
    score: 0, hits: 0, balls: 0, strikes: 0, outs: 0,
    charging: false, power: 0, aim: 0,
    pendingOutcome: null,
    mode: mode.name,
  };
  mode.init(state);

  function refreshHud(){
    setScoreboard({
      score: state.score, hits: state.hits, errors: 0,
      balls: state.balls, strikes: state.strikes, outs: state.outs,
      pitchLabel: state.pitch
        ? `${state.pitch.type.name} / ${state.pitch.location.name.toUpperCase()}`
        : '—',
    });
    const m = mode.hudStat(state);
    setModeStat(m.label, m.value);
    if (mode.name === 'derby'){
      setDerbyBoard({
        hr: state.derbyHRs,
        longest: state.derbyLongest,
        timeLeft: state.derbyTimeLeft,
        phase: state.derbyPhase,
        pitches: state.derbyPitches,
        maxPitches: state.derbyMaxPitches,
      });
    }
  }

  function startWindup(){
    if (state.phase === 'gameOver') return;
    state.phase = 'windup';
    state.swung = false; state.swingTime = -1; state.pitchT = 0;
    state.power = 0; state.charging = false; setMeter(0);
    state.pitch = mode.pickPitch(state);
    ballTrail.setColor(state.pitch.type.color);
    ballTrail.clear();
    batter.play('idle', 6, true);
    catcher.play('ready stance', 5, true);
    pitcher.playSequence([
      ['set', 4, false],
      ['windup', 7, false],
      ['leg lift', 5, false],
      ['pitch', 16, false, () => launchBall()],
      ['follow through', 9, false],
      ['idle', 5, true],
    ]);
    refreshHud();
  }

  function launchBall(){
    state.phase = 'flight';
    state.pitchT = 0;
    ball.setAnim('ball frame', 14);
    ball.show(true);
    sfx.pitchWhoosh();
    // Mode bookkeeping (e.g. derby's pitch counter ticks here).
    if (mode.onPitchThrown) mode.onPitchThrown(state);
  }

  function commitSwing(){
    if (state.phase !== 'flight' || state.swung) return;
    state.swung = true;
    state.swingTime = state.pitchT;
    state.swingPower = state.power;
    const off = state.swingTime - SWING_TARGET_T;
    const absOff = Math.abs(off);
    if (absOff < SWING_PERFECT_OFFSET) showTiming('PERFECT', '#ffdd3a');
    else if (absOff < SWING_GOOD_OFFSET) showTiming(off < 0 ? 'EARLY' : 'LATE', off < 0 ? '#7ad8ff' : '#ff7a30');
    else showTiming(off < 0 ? 'WAY EARLY' : 'WAY LATE', '#ff5a5a');
    batter.play('swing', 22, false, () => batter.play('idle', 6, true));
  }

  function playCatcherReceive(){
    const anim = state.pitch?.location?.catcher || 'receive normal';
    sfx.glovePop();
    catcher.play(anim, 12, false, () =>
      catcher.play('throwback', 14, false, () =>
        catcher.play('ready stance', 5, true)));
  }

  // Centralized post-pitch handler — every outcome funnels through here so the
  // mode hooks see a consistent flow.
  function afterAtBat(result){
    refreshHud();
    if (result.gameOver){
      setTimeout(gameOver, result.ko || result.walk ? 1700 : 1100);
    } else if (result.atBatEnd){
      const delay = result.ko ? 1700 : 1100;
      setTimeout(nextPitch, delay);
    } else {
      setTimeout(nextPitch, 1300);
    }
  }

  function launchHit({ label, color, vx, vy, points }){
    state.phase = 'hit';
    state.pendingOutcome = { label, color, points };
    ball.setAnim('speed trail fast pitch', 18);
    ball.setPos(PLATE.x - 0.2, PLATE.y, 0);
    ball.setVel(vx, vy, 0);
    ball.show(true);
    catcher.play('ready stance', 5, true);
    batter.play('hit', 10, false, () => batter.play('idle', 6, true));
  }

  function commitHit(){
    if (!state.pendingOutcome) return;
    const o = state.pendingOutcome;
    // Mode-specific display transforms. Returning null means "show nothing"
    // — derby uses this for non-HR contact so the ball just lands quietly.
    const callout = mode.display.contactCallout(o);
    if (callout) showCall(callout.label, callout.color);
    const fl = mode.display.contactFloater(o);
    if (fl) floater(fl.text, fl.color, 50, 35);

    // Visuals first; the mode owns score/hit tallying so each mode can decide
    // what counts (e.g. HR Derby only counts HRs).
    if (o.points > 0){
      if (o.label.startsWith('HOME RUN')){
        flash(0.7, 200);
        sfx.crowdCheer(1.4);
        kick(16, 0.45);
        slowmo(0.55, 0.3);
        for (let i = 0; i < 14; i++){
          const a = Math.PI + (Math.random() - 0.5) * 0.6;
          const sp = 6 + Math.random() * 4;
          particles.spawn(ball.pos.x, ball.pos.y, ball.pos.z, {
            vx: Math.cos(a) * sp, vy: Math.abs(Math.sin(a)) * sp + 2,
            vz: (Math.random() - 0.5) * 3,
            life: 1.2, size: 0.22,
            color: [0xffdd44, 0xff7733, 0x7ad8ff, 0x4afc7a, 0xffffff][i % 5],
            gravity: -8,
          });
        }
      } else if (o.points >= 2){
        flash(0.35, 100);
        sfx.crowdCheer(0.9);
      } else {
        sfx.crowdCheer(0.5);
      }
    } else {
      // Non-HR contact: derby plays a softer "ohhh" since it's an out, not
      // a strikeout. Other modes use the louder groan for the actual out.
      if (mode.name === 'derby') sfx.crowdMiss();
      else sfx.crowdGroan();
      particles.burst(ball.pos.x, 0.1, ball.pos.z, 8, {
        speed: 1.4, life: 0.5, size: 0.35, color: 0xc8a070, gravity: -2, upward: true,
      });
    }

    // Now let the mode score this contact (score/hit tallying + mode-specific
    // bookkeeping like HR distance, swing count, outs).
    const result = mode.onContact(state, {
      isOut: o.points === 0,
      label: o.label,
      points: o.points,
      ballPos: { x: ball.pos.x, y: ball.pos.y, z: ball.pos.z },
    });
    state.pendingOutcome = null;
    state.phase = 'resolved';
    ball.show(false);
    ballTrail.clear();
    afterAtBat(result);
  }

  function doSwingContact(quality){
    const o = rollOutcome(quality);
    if (!o.foul) sfx.batCrack(quality === 'perfect' ? 1.2 : 0.8);
    freeze(quality === 'perfect' ? 0.09 : 0.05);
    kick(quality === 'perfect' ? 9 : 5, 0.18);
    particles.burst(PLATE.x - 0.2, PLATE.y, 0, o.foul ? 5 : 10, {
      speed: o.foul ? 3 : 5, life: 0.35, size: 0.18,
      color: quality === 'perfect' ? 0xffe066 : 0xfff0c8,
      upward: false,
    });

    if (o.foul){
      showCall('FOUL', o.color);
      sfx.batFoul();
      batter.play('miss', 10, false, () => batter.play('idle', 6, true));
      playCatcherReceive();
      const result = mode.onFoul(state);
      refreshHud();
      afterAtBat(result);
      return;
    }
    // Power scales hit force, aim nudges launch direction.
    const pwr = 0.55 + (state.swingPower ?? 0) * 0.9;
    const aimVy = state.aim * 0.6;
    const scaled = Object.assign({}, o, {
      vx: o.vx != null ? o.vx * pwr : null,
      vy: o.vy != null ? (o.vy + aimVy) * pwr : null,
    });
    if (o.out){
      // Caught/fielded out — ball flies briefly then lands. mode.onContact
      // runs in commitHit() once the ball lands.
      state.pendingOutcome = { label: o.label, color: o.color, points: 0 };
      state.phase = 'hit';
      ball.setAnim('speed trail fast pitch', 18);
      ball.setPos(PLATE.x - 0.2, PLATE.y, 0);
      ball.setVel(scaled.vx, scaled.vy, 0);
      ball.show(true);
      batter.play('hit', 10, false, () => batter.play('idle', 6, true));
      catcher.play('ready stance', 5, true);
      return;
    }
    launchHit(scaled);
  }

  function doSwingMiss(){
    sfx.batWhoosh();
    const result = mode.onSwingMiss(state);
    // Mode can override the call-out (e.g. derby shows "MISS!" instead of
    // STRIKE because there's no count). null = use the default below.
    const override = mode.display.missCallout(state, !!result.ko);
    if (override){
      showCall(override.label, override.color);
      batter.play('miss', 10, false, () => batter.play('idle', 6, true));
      playCatcherReceive();
    } else if (result.ko){
      showCall('STRIKEOUT', '#ff5a5a');
      umpire.play('strike', 8, false);
      sfx.umpStrike(false);
      setTimeout(() => { umpire.play('out', 8, false); sfx.umpStrike(true); sfx.crowdGroan(); }, 700);
      batter.play('strikeout', 8, false);
      playCatcherReceive();
    } else {
      showCall('STRIKE', '#ff5a5a');
      umpire.play('strike', 8, false);
      sfx.umpStrike(false);
      batter.play('miss', 10, false, () => batter.play('idle', 6, true));
      playCatcherReceive();
    }
    refreshHud();
    afterAtBat(result);
  }

  function doLooking(){
    if (!mode.shouldShowCount){
      // Modes without a count (derby) just throw another pitch — no looking
      // ever counts. Slight delay so the pitch beat doesn't feel too rapid.
      playCatcherReceive();
      setTimeout(nextPitch, 800);
      return;
    }
    // Decide if the pitch was actually in the strike zone — for now, random.
    const isStrike = Math.random() < 0.4;
    const result = mode.onPitchTaken(state, isStrike);
    if (result.ko){
      showCall('STRIKE THREE - OUT', '#ff5a5a');
      umpire.play('strike', 8, false);
      sfx.umpStrike(false);
      setTimeout(() => { umpire.play('out', 8, false); sfx.umpStrike(true); sfx.crowdGroan(); }, 700);
      batter.play('strikeout', 8, false);
    } else if (result.walk){
      showCall('WALK!', '#7ad8ff');
      umpire.play('ball', 8, false);
      sfx.umpBall();
      sfx.crowdWalk();
      playCatcherReceive();
    } else if (isStrike){
      showCall('STRIKE LOOKING', '#ff5a5a');
      umpire.play('strike', 8, false);
      sfx.umpStrike(false);
      playCatcherReceive();
    } else {
      showCall('BALL', '#7ad8ff');
      umpire.play('ball', 8, false);
      sfx.umpBall();
      playCatcherReceive();
    }
    refreshHud();
    afterAtBat(result);
  }

  function resolveAtPlate(){
    state.phase = 'resolved';
    ball.show(false);
    if (state.swung){
      const off = Math.abs(state.swingTime - SWING_TARGET_T);
      if (off < SWING_PERFECT_OFFSET) return doSwingContact('perfect');
      if (off < SWING_GOOD_OFFSET)    return doSwingContact('good');
      return doSwingMiss();
    }
    return doLooking();
  }

  function nextPitch(){
    if (state.phase === 'gameOver') return;
    refreshHud();
    state.phase = 'idle';
    // Career level-up beat.
    if (state.mode === 'career' && state.careerJustLeveled){
      state.careerJustLeveled = false;
      showCall(`LEVEL ${state.careerLevel}`, '#ffd24a', 1300);
      sfx.crowdCheer(1.0);
      flash(0.4, 150);
      setTimeout(startWindup, 1100);
      return;
    }
    // Derby: resolve any pending phase transition (regulation→bonus, or
    // bonus clock expiry → game over). Done here so transitions land between
    // pitches, never splitting an at-bat.
    if (state.mode === 'derby'){
      const phase = mode.applyPendingPhase?.(state);
      if (phase === 'bonus'){
        const ext = state.derbyBonusExtended;
        showCall(ext ? 'BONUS · 1:00' : 'BONUS · 0:30', '#ffd24a', 1500);
        sfx.crowdCheer(ext ? 1.2 : 0.9);
        flash(0.35, 150);
        setTimeout(startWindup, 1300);
        return;
      }
      if (phase === 'over'){
        gameOver();
        return;
      }
    }
    setTimeout(startWindup, 600);
  }

  function gameOver(){
    state.phase = 'gameOver';
    ball.show(false);
    ballTrail.clear();
    if (onGameOver) onGameOver(state, mode);
    else showCall(`GAME OVER · ${state.score} pts · R to restart`, '#ffd24a');
  }

  function restart(){
    state.score = 0; state.hits = 0;
    state.strikes = 0; state.balls = 0;
    state.outs = 0;
    state.phase = 'idle';
    mode.init(state);
    refreshHud();
    nextPitch();
  }

  function setCharging(on){
    if (on && !state.charging && !state.swung){
      state.charging = true; state.power = 0; setMeter(0);
    } else if (!on && state.charging){
      state.charging = false;
      if (state.phase === 'flight') commitSwing();
      else { state.power = 0; setMeter(0); }
    }
  }

  function adjustAim(d){
    state.aim = Math.max(-2, Math.min(2, state.aim + d));
    setAim(state.aim);
  }

  function tick(dt){
    if (state.phase === 'flight'){
      const pitch = state.pitch;
      state.pitchT += dt / pitch.type.duration;
      const t = Math.min(1.2, state.pitchT);
      const targetX = pitch.location.x;
      const targetY = pitch.location.y;
      const x = PITCHER_HAND.x + (targetX - PITCHER_HAND.x) * t;
      const arc = Math.sin(t * Math.PI) * 0.18;
      const y = PITCHER_HAND.y + (targetY - PITCHER_HAND.y) * t + arc;
      ball.setPos(x, y, 0);
      ball.update(dt);
      ballTrail.push(ball.pos);
      if (state.pitchT >= 1.0) resolveAtPlate();
    } else if (state.phase === 'hit'){
      ball.applyPhysics(dt);
      ball.update(dt);
      ballTrail.push(ball.pos);
      if (ball.pos.y <= 0 || Math.abs(ball.pos.x) > 32 || Math.abs(ball.pos.z) > 32 || ball.pos.y > 18){
        commitHit();
      }
    } else {
      ball.update(dt);
    }
  }

  // Power charging uses real-time so it doesn't stall during slow-mo.
  function chargeOnly(realDt){
    if (state.charging){
      state.power = Math.min(1, state.power + realDt / 0.65);
      setMeter(state.power);
    }
  }

  // Mode tick — runs every frame on real time. Derby uses this for the
  // 3-minute regulation clock; other modes leave it null.
  function modeTick(realDt){
    if (mode.tick) mode.tick(state, realDt);
    // Refresh HUD periodically so the derby clock visibly counts down even
    // when no pitch event is firing. Throttled to every ~0.25s.
    modeTick._acc = (modeTick._acc || 0) + realDt;
    if (modeTick._acc >= 0.25){ modeTick._acc = 0; refreshHud(); }
  }

  return {
    state, mode,
    startWindup, restart, tick, chargeOnly, modeTick,
    setCharging, adjustAim, refreshHud,
    isGameOver: () => state.phase === 'gameOver',
  };
}
