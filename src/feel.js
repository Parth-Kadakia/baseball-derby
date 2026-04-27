// Game-feel state: screen shake, hit-stop, slow-mo. The main loop reads this
// every frame to apply effects and scale the simulation dt.

export const feel = {
  shake: 0,
  shakeMax: 0,
  shakeAmp: 0,
  hitStop: 0,
  slowMo: 0,
  slowFactor: 1,
};

export function kick(amp = 10, dur = 0.25){
  feel.shake = dur; feel.shakeMax = dur; feel.shakeAmp = amp;
}
export function freeze(dur = 0.08){ feel.hitStop = dur; }
export function slowmo(dur = 0.6, factor = 0.35){ feel.slowMo = dur; feel.slowFactor = factor; }

export function tickFeel(realDt){
  if (feel.shake > 0) feel.shake = Math.max(0, feel.shake - realDt);
  if (feel.hitStop > 0) feel.hitStop = Math.max(0, feel.hitStop - realDt);
  if (feel.slowMo > 0) feel.slowMo = Math.max(0, feel.slowMo - realDt);
}

// Returns an effective simulation dt given real-time dt and a paused flag.
export function effectiveDt(realDt, paused){
  if (paused || feel.hitStop > 0) return 0;
  if (feel.slowMo > 0) return realDt * feel.slowFactor;
  return realDt;
}

// Apply screen shake to a DOM element by writing CSS transform.
export function applyShake(el){
  if (feel.shake > 0){
    const k = feel.shake / Math.max(0.001, feel.shakeMax);
    const ox = (Math.random()*2 - 1) * feel.shakeAmp * k;
    const oy = (Math.random()*2 - 1) * feel.shakeAmp * k;
    el.style.transform = `translate(${ox}px, ${oy}px)`;
  } else if (el.style.transform){
    el.style.transform = '';
  }
}
