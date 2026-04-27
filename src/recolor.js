// Jersey recolor — sprites use navy blue (~hue 220°) for the team accent
// (cap, helmet, sleeves, pants stripes). We detect those pixels by HSL range
// and re-hue them to the chosen team color, leaving skin/bat/numbers alone.

function hslToRgb(h, s, l){
  if (s === 0){ const v = Math.round(l*255); return [v, v, v]; }
  const hue2rgb = (p, q, t) => {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1/6) return p + (q - p) * 6 * t;
    if (t < 1/2) return q;
    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l*(1+s) : l + s - l*s;
  const p = 2*l - q;
  return [
    Math.round(hue2rgb(p, q, h + 1/3) * 255),
    Math.round(hue2rgb(p, q, h)       * 255),
    Math.round(hue2rgb(p, q, h - 1/3) * 255),
  ];
}

function recolorJersey(canvas, targetHueDeg){
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = data.data;
  for (let i = 0; i < d.length; i += 4){
    if (d[i+3] === 0) continue;
    const r = d[i]/255, g = d[i+1]/255, b = d[i+2]/255;
    const max = Math.max(r,g,b), min = Math.min(r,g,b);
    if (max === min) continue;                       // gray → skip
    const dl = max - min;
    const l = (max + min) / 2;
    const s = l > 0.5 ? dl/(2-max-min) : dl/(max+min);
    let h;
    if      (max === r) h = ((g-b)/dl + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b-r)/dl + 2) / 6;
    else                h = ((r-g)/dl + 4) / 6;
    const hueDeg = h * 360;
    if (hueDeg > 195 && hueDeg < 255 && s > 0.18 && l > 0.04 && l < 0.62){
      const [nr, ng, nb] = hslToRgb(targetHueDeg/360, Math.min(0.95, s+0.05), l);
      d[i] = nr; d[i+1] = ng; d[i+2] = nb;
    }
  }
  ctx.putImageData(data, 0, 0);
}

export function recolorAnims(animsObj, hueDeg){
  for (const frames of Object.values(animsObj)){
    for (const f of frames){
      recolorJersey(f.texture.image, hueDeg);
      f.texture.needsUpdate = true;
    }
  }
}
