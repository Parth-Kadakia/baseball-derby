// HUD glue — DOM updates for the scoreboard, count dots, call-out text,
// timing flash, score floaters, and the screen-space ball marker.

const $ = (id) => document.getElementById(id);

const els = {
  r: $('sb-r'), h: $('sb-h'), e: $('sb-e'), pt: $('sb-pitch'),
  bDots: $('b-dots'), sDots: $('s-dots'), oDots: $('o-dots'),
  call: $('call'), timing: $('timing'), flash: $('flash'),
  meterFill: $('meterFill'), meterLabel: $('meterLabel'),
  marker: $('ballMarker'),
  modeLabel: $('mode-label'), modeNum: $('mode-num'),
  // Derby-specific scoreboard cells.
  derbyBoard: $('board-derby'),
  dHr: $('d-hr'), dLongest: $('d-longest'),
  dTime: $('d-time'), dTimeLabel: $('d-time-label'),
  dPitches: $('d-pitches'),
  aimTicks: [
    $('aim-2'), $('aim-1'), $('aim0'), $('aim1'), $('aim2'),
  ],
};

export function setMeter(power){
  els.meterFill.style.width = (power*100) + '%';
}
export function setAim(aim){
  for (let i = 0; i < 5; i++){
    els.aimTicks[i].classList.toggle('on', (i-2) === aim);
  }
}
function renderDots(container, count, total, klass){
  let html = '';
  for (let i = 0; i < total; i++) html += `<span class="dot ${i<count?'on ':''}${klass}"></span>`;
  container.innerHTML = html;
}
export function setScoreboard({ score, hits, errors=0, balls, strikes, outs, pitchLabel='—' }){
  els.r.textContent = score;
  els.h.textContent = hits;
  els.e.textContent = errors;
  els.pt.textContent = pitchLabel;
  renderDots(els.bDots, balls,   4, 'b');
  renderDots(els.sDots, strikes, 3, 's');
  renderDots(els.oDots, outs,    3, 'o');
}
export function setModeStat(label, value){
  if (!els.modeLabel || !els.modeNum) return;
  els.modeLabel.textContent = label;
  els.modeNum.textContent = value;
}
// Derby board: HR · LONGEST · TIME · PITCHES. The TIME slot doubles as a
// BONUS clock once the derby enters the bonus phase.
export function setDerbyBoard({ hr, longest, timeLeft, phase, pitches, maxPitches }){
  if (els.dHr)      els.dHr.textContent      = hr;
  if (els.dLongest) els.dLongest.textContent = longest > 0 ? `${longest|0} FT` : '—';
  if (els.dTime){
    const t = Math.max(0, Math.ceil(timeLeft));
    const min = Math.floor(t / 60);
    const sec = t % 60;
    els.dTime.textContent = `${min}:${sec.toString().padStart(2, '0')}`;
  }
  if (els.dTimeLabel) els.dTimeLabel.textContent = phase === 'bonus' ? 'BONUS' : 'TIME';
  if (els.dPitches)   els.dPitches.textContent   = `${pitches}/${maxPitches}`;
  if (els.derbyBoard) els.derbyBoard.classList.toggle('bonus', phase === 'bonus');
}
// Toggle the body class so per-mode CSS rules apply (e.g. swap scoreboards).
export function setBodyMode(modeName){
  document.body.classList.remove('mode-endless', 'mode-derby', 'mode-career');
  document.body.classList.add('mode-' + modeName);
}
export function showTiming(text, color){
  els.timing.textContent = text;
  els.timing.style.color = color;
  els.timing.style.opacity = 1;
  clearTimeout(showTiming._t);
  showTiming._t = setTimeout(() => els.timing.style.opacity = 0, 600);
}
export function flash(intensity = 0.6, ms = 120){
  els.flash.style.opacity = intensity;
  setTimeout(() => els.flash.style.opacity = 0, ms);
}
export function floater(text, color, x = 50, y = 40){
  const el = document.createElement('div');
  el.className = 'floater';
  el.textContent = text;
  el.style.color = color;
  el.style.left = x+'%';
  el.style.top = y+'%';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1300);
}
export function showCall(text, color = '#ffd24a', durationMs = 900){
  els.call.textContent = text;
  els.call.style.color = color;
  els.call.style.opacity = 1;
  clearTimeout(showCall._t);
  showCall._t = setTimeout(() => els.call.style.opacity = 0, durationMs);
}

// Screen-space ball marker — a circle that tracks the pitched ball so the
// player can read location even when the ball is small at distance.
export function updateBallMarker({ visible, worldPos, color, camera }){
  if (!visible){
    els.marker.style.display = 'none';
    return;
  }
  const v = worldPos.clone().project(camera);
  const sx = (v.x*0.5 + 0.5) * innerWidth;
  const sy = (-v.y*0.5 + 0.5) * innerHeight;
  els.marker.style.display = 'block';
  els.marker.style.left = sx + 'px';
  els.marker.style.top  = sy + 'px';
  const col = '#' + color.toString(16).padStart(6, '0');
  els.marker.style.borderColor = col;
  els.marker.style.boxShadow = `0 0 14px ${col}, 0 0 6px ${col} inset`;
}
