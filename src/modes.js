// Mode definitions. The game state machine consults a mode object at every
// pitch-resolution point. Each mode hook mutates `state` and returns
// { atBatEnd, gameOver } so the game knows what to do next.
//
// outcome shorthand:
//   - "atBatEnd"  : current at-bat is over; next pitch will be a fresh count
//   - "gameOver"  : whole run is over; show the results card
//
// HOOKS:
//   init(state)                              one-time setup
//   pickPitch(state) -> {type, location}     choose next pitch
//   shouldShowCount                          if false, looking pitches don't
//                                            tick the ball/strike count
//   onPitchTaken(state, isStrike)            looking pitch resolution
//   onSwingMiss(state)                       full swing-and-miss
//   onFoul(state)                            foul-tip contact
//   onContact(state, {isOut, label, ballPos}) ball put in play (or ground out)
//   hudStat(state) -> {label, value}         text shown in HUD top-right
//   resultStats(state) -> [{label, value}]   shown on game-over card

import { PITCH_TYPES, PITCH_LOCATIONS } from './config.js';

function pickFrom(pool){ return pool[Math.floor(Math.random()*pool.length)]; }
function noChange(){ return { atBatEnd: false, gameOver: false }; }

// ---------- Endless / Practice — 3 outs and done ----------
export const ENDLESS = {
  name: 'endless',
  label: 'PRACTICE',
  description: 'No pressure. Endless at-bats until you make 3 outs.',
  shouldShowCount: true,
  init(state){ state.outs = 0; state.balls = 0; state.strikes = 0; },
  pickPitch(){
    return { type: pickFrom(PITCH_TYPES), location: pickFrom(PITCH_LOCATIONS) };
  },
  onPitchTaken(state, isStrike){
    if (isStrike){
      state.strikes++;
      if (state.strikes >= 3){
        state.outs++; state.strikes = 0; state.balls = 0;
        return { atBatEnd: true, gameOver: state.outs >= 3, ko: true };
      }
      return { atBatEnd: false, gameOver: false };
    }
    state.balls++;
    if (state.balls >= 4){
      state.balls = 0; state.strikes = 0;
      return { atBatEnd: true, gameOver: false, walk: true };
    }
    return { atBatEnd: false, gameOver: false };
  },
  onSwingMiss(state){
    state.strikes++;
    if (state.strikes >= 3){
      state.outs++; state.strikes = 0; state.balls = 0;
      return { atBatEnd: true, gameOver: state.outs >= 3, ko: true };
    }
    return { atBatEnd: false, gameOver: false };
  },
  onFoul(state){
    if (state.strikes < 2) state.strikes++;
    return { atBatEnd: false, gameOver: false };
  },
  onContact(state, { isOut, points }){
    // Practice mode: every base counts as a run, every hit counts.
    state.score += points;
    if (points > 0) state.hits++;
    state.balls = 0; state.strikes = 0;
    if (isOut){
      state.outs++;
      return { atBatEnd: true, gameOver: state.outs >= 3 };
    }
    return { atBatEnd: true, gameOver: false };
  },
  hudStat(state){ return { label: 'OUTS', value: `${state.outs}/3` }; },
  display: {
    contactCallout(o){ return { label: o.label, color: o.color }; },
    contactFloater(o){
      return o.points > 0 ? { text: '+' + o.points, color: o.color } : null;
    },
    missCallout(){ return null; },
  },
  resultStats(state){
    return [
      { label: 'SCORE', value: state.score },
      { label: 'HITS',  value: state.hits  },
    ];
  },
};

// Default display transforms — modes can override to relabel call-outs and
// suppress floaters. Returning `floater: null` means "don't pop a floater".
const defaultDisplay = {
  contactCallout(o){ return { label: o.label, color: o.color }; },
  contactFloater(o){
    return o.points > 0 ? { text: '+' + o.points, color: o.color } : null;
  },
  missCallout(_state, _ko){ return null; }, // null → use game.js default
};

// ---------- HR Derby — current MLB single-elim format, single-player ----------
// Regulation: 3:00 of clock time. Unlimited swings. No outs. Only HRs count.
// Bonus: 0:30 automatically when regulation ends. +0:30 extra (max 1:00) if
// the player hit ≥ 2 HRs of 440+ feet in regulation.
// Run ends when the bonus clock hits 0:00.
//
// Skipping for single-player: the 8-player bracket, head-to-head matchups,
// timeouts (1×45s), and tiebreaker swing-offs. The leaderboard plays the role
// of "the bracket" once it's wired up.
export const DERBY = {
  name: 'derby',
  label: 'HR DERBY',
  description: '1:30 or 20 pitches. 30s bonus (1:00 if you hit a 425+).',
  shouldShowCount: false,
  init(state){
    state.derbyHRs = 0;
    state.derbyLongest = 0;
    state.derby425HRs = 0;          // 425+ HRs in regulation → unlocks max bonus
    state.derbyPhase = 'regulation';// 'regulation' | 'bonus'
    state.derbyTimeLeft = 90;       // arcade-tuned: 1:30 of regulation
    state.derbyPitches = 0;
    state.derbyMaxPitches = 20;
    state.derbyBonusExtended = false;
    state.derbyPendingPhaseChange = null; // 'bonus' | 'over' — applied at next pitch boundary
    state.balls = 0; state.strikes = 0; state.outs = 0;
  },
  pickPitch(){
    const type = PITCH_TYPES.find(t => t.name === 'NORMAL') ?? PITCH_TYPES[1];
    const location = PITCH_LOCATIONS.find(l => l.name === 'normal') ?? PITCH_LOCATIONS[1];
    return { type, location };
  },
  // Called by the main loop with real (un-paused) dt. Both regulation and
  // bonus tick the same clock down. We don't actually transition mid-flight
  // — the change is queued and applied at the next pitch boundary so a HR
  // landing right at 0:00 still counts toward the right phase.
  tick(state, realDt){
    state.derbyTimeLeft = Math.max(0, state.derbyTimeLeft - realDt);
    if (state.derbyPendingPhaseChange) return;
    if (state.derbyPhase === 'regulation'){
      // End of regulation = clock zero OR 40 pitches reached.
      if (state.derbyTimeLeft <= 0 || state.derbyPitches >= state.derbyMaxPitches){
        state.derbyPendingPhaseChange = 'bonus';
      }
    } else if (state.derbyPhase === 'bonus'){
      if (state.derbyTimeLeft <= 0) state.derbyPendingPhaseChange = 'over';
    }
  },
  onPitchThrown(state){
    if (state.derbyPhase !== 'regulation') return;
    state.derbyPitches++;
    if (state.derbyPitches >= state.derbyMaxPitches && !state.derbyPendingPhaseChange){
      state.derbyPendingPhaseChange = 'bonus';
    }
  },
  // Resolve any pending phase change. Returns null, 'bonus', or 'over'.
  // Called by game.js between at-bats so transitions never split a pitch.
  applyPendingPhase(state){
    const change = state.derbyPendingPhaseChange;
    state.derbyPendingPhaseChange = null;
    if (change === 'bonus'){
      state.derbyPhase = 'bonus';
      state.derbyBonusExtended = state.derby425HRs >= 1;
      state.derbyTimeLeft = state.derbyBonusExtended ? 60 : 30;
      return 'bonus';
    }
    if (change === 'over'){
      return 'over';
    }
    return null;
  },
  // No outs / no penalties — every swing & take is free.
  onPitchTaken(){ return { atBatEnd: true, gameOver: false, taken: true }; },
  onSwingMiss() { return { atBatEnd: true, gameOver: false }; },
  onFoul()      { return { atBatEnd: true, gameOver: false }; },
  onContact(state, { ballPos, label }){
    if (label?.startsWith('HOME RUN')){
      state.derbyHRs++;
      state.score++;            // R column = HR count
      state.hits++;
      const dx = ballPos.x - 2.6;
      const dz = ballPos.z;
      const dist = Math.hypot(dx, dz) * 12;     // tuned to read as ~350-450 ft
      if (dist > state.derbyLongest) state.derbyLongest = dist;
      // 425+ during regulation unlocks the extended bonus (max 1:00).
      if (state.derbyPhase === 'regulation' && dist >= 425) state.derby425HRs++;
    }
    return { atBatEnd: true, gameOver: false };
  },
  hudStat(state){
    const min = Math.floor(state.derbyTimeLeft / 60);
    const sec = Math.floor(state.derbyTimeLeft % 60);
    const label = state.derbyPhase === 'bonus' ? 'BONUS' : 'TIME';
    return { label, value: `${min}:${sec.toString().padStart(2,'0')}` };
  },
  // Derby UI transforms: only HR is a meaningful event. Anything that's not
  // an HR is just "not a homer" — no label flashes, no points float. There
  // are no "outs" in HR Derby, so we don't pretend there are. The ball lands,
  // the swing counter drops, and that's all the feedback you get.
  // (Whiffs still get a "MISS!" because there's no ball flight to read.)
  display: {
    ...defaultDisplay,
    contactCallout(o){
      if (o.label?.startsWith('HOME RUN')) return { label: 'HOME RUN!', color: '#ffd24a' };
      if (o.label === 'FOUL')              return { label: 'FOUL',      color: '#7ad8ff' };
      return null;  // null = no call-out for non-HR non-foul contact
    },
    contactFloater(){ return null; },
    missCallout(){ return { label: 'MISS!', color: '#ff5a5a' }; },
  },
  resultStats(state){
    return [
      { label: 'HOME RUNS', value: state.derbyHRs },
      { label: 'LONGEST',   value: state.derbyLongest > 0 ? `${state.derbyLongest|0} FT` : '—' },
    ];
  },
};

// ---------- Career Streak — 3 lives, rising difficulty, level-ups ----------
export const CAREER = {
  name: 'career',
  label: 'CAREER',
  description: '3 lives. Pitches get faster every level. How long can you stay up?',
  shouldShowCount: true,
  init(state){
    state.careerLives = 3;
    state.careerLevel = 1;
    state.careerAtBats = 0;
    state.careerStreak = 0;
    state.careerHRs = 0;
    state.careerJustLeveled = false;
    state.balls = 0; state.strikes = 0; state.outs = 0;
  },
  pickPitch(state){
    const lvl = state.careerLevel;
    const typePool = lvl >= 5 ? PITCH_TYPES
                  : lvl >= 3 ? PITCH_TYPES.slice(0, 3)
                  : PITCH_TYPES.slice(0, 2);
    const easyLocs   = PITCH_LOCATIONS.filter(l => l.name === 'normal');
    const midLocs    = PITCH_LOCATIONS.filter(l => ['normal','high','low'].includes(l.name));
    const locPool    = lvl >= 4 ? PITCH_LOCATIONS
                    : lvl >= 2 ? midLocs
                    : easyLocs;
    const t = pickFrom(typePool);
    const speedMul = Math.max(0.55, 1 - (lvl - 1) * 0.08);  // -8% per level, floor 0.55x
    const type = { ...t, duration: t.duration * speedMul };
    return { type, location: pickFrom(locPool) };
  },
  // Helper — bumps at-bat counter, returns true if we hit a level-up boundary.
  // Also flags streak milestones (5/10/20/...) so the game can celebrate them.
  _completeAtBat(state){
    state.careerAtBats++;
    state.careerStreak++;
    state.careerStreakMilestone = null;
    if (state.careerStreak === 5)  state.careerStreakMilestone = { text: 'ON FIRE!',     color: '#ff7733' };
    if (state.careerStreak === 10) state.careerStreakMilestone = { text: 'HEATING UP!',  color: '#ffd24a' };
    if (state.careerStreak === 20) state.careerStreakMilestone = { text: 'UNSTOPPABLE!', color: '#ff5e2a' };
    if (state.careerStreak === 30) state.careerStreakMilestone = { text: 'LEGENDARY!',   color: '#ff2ad6' };
    const newLevel = 1 + Math.floor(state.careerAtBats / 5);
    if (newLevel > state.careerLevel){
      state.careerLevel = newLevel;
      state.careerJustLeveled = true;
    }
  },
  // Internal — applied on any career strikeout so all UI stays in sync.
  _strikeoutPenalty(state){
    state.balls = 0; state.strikes = 0;
    state.careerLives--;
    state.careerStreak = 0;
    state.careerAtBats++;
    // Mirror lives-lost into the scoreboard "O" dot row so the most prominent
    // bottom-of-the-board indicator also reflects the danger state.
    state.outs = 3 - state.careerLives;
    return { atBatEnd: true, gameOver: state.careerLives <= 0, ko: true };
  },
  onPitchTaken(state, isStrike){
    if (isStrike){
      state.strikes++;
      if (state.strikes >= 3) return CAREER._strikeoutPenalty(state);
      return { atBatEnd: false, gameOver: false };
    }
    state.balls++;
    if (state.balls >= 4){
      state.balls = 0; state.strikes = 0;
      CAREER._completeAtBat(state);
      return { atBatEnd: true, gameOver: false, walk: true };
    }
    return { atBatEnd: false, gameOver: false };
  },
  onSwingMiss(state){
    state.strikes++;
    if (state.strikes >= 3) return CAREER._strikeoutPenalty(state);
    return { atBatEnd: false, gameOver: false };
  },
  onFoul(state){
    if (state.strikes < 2) state.strikes++;
    return { atBatEnd: false, gameOver: false };
  },
  onContact(state, { isOut, label, points }){
    // Career: every base counts as a run, hits tracked normally.
    state.score += points;
    if (points > 0) state.hits++;
    state.balls = 0; state.strikes = 0;
    if (label?.startsWith('HOME RUN')) state.careerHRs++;
    CAREER._completeAtBat(state);
    return { atBatEnd: true, gameOver: false };
  },
  hudStat(state){
    const lives = Math.max(0, state.careerLives);
    const lost = Math.max(0, 3 - lives);
    const hearts = '♥'.repeat(lives) + '♡'.repeat(lost);
    return { label: `LV ${state.careerLevel} · ${hearts}`, value: `${state.careerStreak}` };
  },
  display: {
    contactCallout(o){ return { label: o.label, color: o.color }; },
    contactFloater(o){
      return o.points > 0 ? { text: '+' + o.points, color: o.color } : null;
    },
    missCallout(){ return null; },
  },
  resultStats(state){
    return [
      { label: 'STREAK',  value: state.careerStreak },
      { label: 'LEVEL',   value: state.careerLevel },
      { label: 'AT-BATS', value: state.careerAtBats },
      { label: 'HRs',     value: state.careerHRs },
      { label: 'SCORE',   value: state.score },
    ];
  },
};

export const MODES = { endless: ENDLESS, derby: DERBY, career: CAREER };
