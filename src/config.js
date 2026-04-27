// Pure constants: positions, pitch tables, hit table.
// No imports of three; we use plain objects so this module loads instantly.

export const HOME = { x: 2.6, y: 0, z: 0 };
export const WALL_RADIUS = 30;
export const BASE_DIST = 8.18;

// Foul-line / center directions in XZ plane (already normalized).
export const FOUL_DIR_R = { x: -1/Math.SQRT2, z:  1/Math.SQRT2 };
export const FOUL_DIR_L = { x: -1/Math.SQRT2, z: -1/Math.SQRT2 };
export const CENTER_DIR = { x: -1, z: 0 };

// Derived base positions.
export const FIRST_BASE  = { x: HOME.x + FOUL_DIR_R.x*BASE_DIST,         z: HOME.z + FOUL_DIR_R.z*BASE_DIST };
export const SECOND_BASE = { x: HOME.x + CENTER_DIR.x*BASE_DIST*Math.SQRT2, z: HOME.z + CENTER_DIR.z*BASE_DIST*Math.SQRT2 };
export const THIRD_BASE  = { x: HOME.x + FOUL_DIR_L.x*BASE_DIST,         z: HOME.z + FOUL_DIR_L.z*BASE_DIST };

// Game-mechanics constants.
export const PITCHER_HAND = { x: -5.1, y: 1.6, z: 0 };
export const PLATE        = { x:  2.4, y: 1.0, z: 0 };

export const SWING_TARGET_T       = 0.82;
export const SWING_PERFECT_OFFSET = 0.08;
export const SWING_GOOD_OFFSET    = 0.32;

export const PITCH_TYPES = [
  { name:'FAST',   duration: 0.85, color: 0xff7733 },
  { name:'NORMAL', duration: 1.10, color: 0xffffff },
  { name:'CURVE',  duration: 1.20, color: 0x44ddff },
  { name:'CHANGE', duration: 1.40, color: 0x58ff8a },
];

export const PITCH_LOCATIONS = [
  { name:'high',    y: 1.7,  x: 2.4, catcher:'receive normal' },
  { name:'normal',  y: 1.1,  x: 2.4, catcher:'receive normal' },
  { name:'low',     y: 0.55, x: 2.4, catcher:'receive low'    },
  { name:'inside',  y: 1.1,  x: 2.0, catcher:'receive normal' },
  { name:'outside', y: 1.1,  x: 3.0, catcher:'receive normal' },
  { name:'in dirt', y: 0.20, x: 2.4, catcher:'block'          },
];

// Outcome table for swing contact. `out:true` means the ball is hit but caught
// or fielded for an out (no score). `foul:true` means contact ruled foul (no
// flight). vx/vy: launch velocity in side-view (x = toward outfield, y = up).
export const HIT_TABLE = {
  perfect: [
    { w: 25, label:'HOME RUN!',  color:'#ffd24a', points:5,  vx:-22, vy:17 },
    { w: 20, label:'TRIPLE!',    color:'#ffd24a', points:3,  vx:-15, vy:13 },
    { w: 25, label:'DOUBLE!',    color:'#4afc7a', points:2,  vx:-10, vy:11 },
    { w: 15, label:'SINGLE!',    color:'#7ad8ff', points:1,  vx:-7,  vy:8  },
    { w: 10, label:'LINE OUT',   color:'#ff5a5a', points:0,  vx:-9,  vy:5,  out:true },
    { w:  5, label:'FOUL',       color:'#7ad8ff', points:0,  vx:null, vy:null, foul:true },
  ],
  good: [
    { w: 10, label:'HOME RUN!',  color:'#ffd24a', points:5,  vx:-20, vy:16 },
    { w: 12, label:'TRIPLE!',    color:'#ffd24a', points:3,  vx:-13, vy:12 },
    { w: 18, label:'DOUBLE!',    color:'#4afc7a', points:2,  vx:-9,  vy:10 },
    { w: 20, label:'SINGLE!',    color:'#7ad8ff', points:1,  vx:-6,  vy:7  },
    { w: 25, label:'GROUND OUT', color:'#ff5a5a', points:0,  vx:-4,  vy:2,  out:true },
    { w: 15, label:'FOUL',       color:'#7ad8ff', points:0,  vx:null, vy:null, foul:true },
  ],
};

export function rollOutcome(quality){
  const table = HIT_TABLE[quality];
  const total = table.reduce((s, r) => s + r.w, 0);
  let r = Math.random() * total;
  for (const row of table){ if ((r -= row.w) <= 0) return row; }
  return table[table.length - 1];
}
