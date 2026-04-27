import * as THREE from 'three';

// Sprite-sheet loading + the Actor / BallSprite classes that wrap a textured
// plane and step through frames each tick.

function loadImage(src){
  return new Promise((res, rej) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = src;
  });
}

// Inspect the four corners of the sheet to find the dominant background color
// — used to alpha-key sprites that would otherwise render with ugly squares.
function makeBgTest(sctx, W, H){
  const samples = [];
  for (const [x, y] of [[2, 2], [W-3, 2], [2, H-3], [W-3, H-3]]) {
    const p = sctx.getImageData(x, y, 1, 1).data;
    samples.push([p[0], p[1], p[2]]);
  }
  const sorted = (k) => samples.map(s => s[k]).sort((a, b) => a - b);
  const br = sorted(0)[2], bg = sorted(1)[2], bb = sorted(2)[2];
  const TOL = 8;
  return (r, g, b, a) => {
    if (a !== undefined && a < 5) return true;
    return Math.abs(r-br) <= TOL && Math.abs(g-bg) <= TOL && Math.abs(b-bb) <= TOL;
  };
}

function cutSprite(sctx, rx, ry, rw, rh, isBg){
  const data = sctx.getImageData(rx, ry, rw, rh);
  const d = data.data;
  const W = data.width, H = data.height;
  for (let i = 0; i < d.length; i += 4){
    if (d[i+3] < 5 || isBg(d[i], d[i+1], d[i+2], d[i+3])){ d[i+3] = 0; }
  }
  let miX = W, miY = H, maX = -1, maY = -1;
  for (let y = 0; y < H; y++){
    for (let x = 0; x < W; x++){
      if (d[(y*W+x)*4+3] > 0){
        if (x < miX) miX = x; if (y < miY) miY = y;
        if (x > maX) maX = x; if (y > maY) maY = y;
      }
    }
  }
  if (maX < 0){
    const c = document.createElement('canvas'); c.width = 1; c.height = 1; return c;
  }
  const tw = maX - miX + 1, th = maY - miY + 1;
  const tmp = document.createElement('canvas');
  tmp.width = W; tmp.height = H;
  tmp.getContext('2d').putImageData(data, 0, 0);
  const out = document.createElement('canvas');
  out.width = tw; out.height = th;
  out.getContext('2d').drawImage(tmp, miX, miY, tw, th, 0, 0, tw, th);
  return out;
}

export async function sliceFromJson(spec){
  const img = await loadImage(spec.sheet);
  const src = document.createElement('canvas');
  src.width = img.width; src.height = img.height;
  const sctx = src.getContext('2d', { willReadFrequently: true });
  sctx.drawImage(img, 0, 0);
  const isBg = makeBgTest(sctx, img.width, img.height);
  const out = {};
  for (const [name, rects] of Object.entries(spec.animations)){
    out[name] = rects.map(r => {
      const c = cutSprite(sctx, r.x|0, r.y|0, r.w|0, r.h|0, isBg);
      const tex = new THREE.CanvasTexture(c);
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.generateMipmaps = false;
      return { texture: tex, w: c.width, h: c.height };
    });
  }
  return out;
}

// Convenience: fetch a slice spec JSON and run it through sliceFromJson.
export async function loadSpec(url, key){
  const j = await (await fetch(url)).json();
  return sliceFromJson(j[key]);
}

// A 2D sprite actor positioned in the 3D scene. Uses a plane geometry whose
// scale is set per frame from the underlying canvas size. flipX mirrors the
// sprite for left/right-facing variants.
export class Actor {
  constructor(scene, animations, opts = {}){
    const { x=0, z=0, scale=0.011, flipX=false, renderOrder=1 } = opts;
    this.animations = animations;
    this.mat = new THREE.MeshBasicMaterial({
      map: null, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.mat);
    this.mesh.renderOrder = renderOrder;
    scene.add(this.mesh);
    this.posX = x; this.posZ = z;
    this.pixelScale = scale;
    this.flipX = flipX ? -1 : 1;
    this.frame = 0; this.timer = 0; this.fps = 8; this.loop = true;
    this.currentName = null; this.onDone = null;
  }
  play(name, fps = 8, loop = true, onDone = null){
    if (!this.animations[name]){ console.warn('missing animation:', name); return; }
    if (this.currentName === name && loop){
      this.fps = fps; this.loop = loop; this.onDone = onDone;
      return;
    }
    this.currentName = name; this.fps = fps; this.loop = loop;
    this.frame = 0; this.timer = 0; this.onDone = onDone;
    this._apply();
  }
  playSequence(steps){
    let i = 0;
    const next = () => {
      if (i >= steps.length) return;
      const [name, fps, loop, hook] = steps[i++];
      if (hook) hook();
      this.play(name, fps, loop, loop ? null : next);
    };
    next();
  }
  _apply(){
    const f = this.animations[this.currentName][this.frame];
    this.mat.map = f.texture; this.mat.needsUpdate = true;
    const w = f.w * this.pixelScale;
    const h = f.h * this.pixelScale;
    this.mesh.scale.set(w * this.flipX, h, 1);
    this.mesh.position.set(this.posX, h/2, this.posZ);
  }
  update(dt){
    if (!this.currentName) return;
    this.timer += dt;
    const spf = 1/this.fps;
    const frames = this.animations[this.currentName];
    let finished = false;
    while (this.timer >= spf){
      this.timer -= spf; this.frame++;
      if (this.frame >= frames.length){
        if (this.loop) this.frame = 0;
        else { this.frame = frames.length - 1; finished = true; break; }
      }
    }
    this._apply();
    if (finished && this.onDone){ const cb = this.onDone; this.onDone = null; cb(); }
  }
}

// The ball is its own thing — a sprite anchored at its own center, with a free
// 3D position + velocity for projectile motion.
export class BallSprite {
  constructor(scene, animations){
    this.animations = animations;
    this.mat = new THREE.MeshBasicMaterial({
      map: null, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.mat);
    this.mesh.renderOrder = 5;
    this.mesh.visible = false;
    scene.add(this.mesh);
    this.pixelScale = 0.010;
    this.frame = 0; this.timer = 0; this.fps = 14;
    this.currentName = 'ball frame';
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.gravity = -18;
  }
  setAnim(name, fps = 14){
    this.currentName = name; this.fps = fps; this.frame = 0; this.timer = 0;
  }
  setPos(x, y, z){ this.pos.set(x, y, z); }
  setVel(x, y, z){ this.vel.set(x, y, z); }
  applyPhysics(dt){
    this.vel.y += this.gravity * dt;
    this.pos.addScaledVector(this.vel, dt);
  }
  show(v = true){ this.mesh.visible = v; }
  update(dt){
    this.timer += dt;
    const spf = 1/this.fps;
    const frames = this.animations[this.currentName];
    while (this.timer >= spf){
      this.timer -= spf; this.frame = (this.frame + 1) % frames.length;
    }
    const f = frames[this.frame];
    this.mat.map = f.texture; this.mat.needsUpdate = true;
    this.mesh.scale.set(f.w * this.pixelScale, f.h * this.pixelScale, 1);
    this.mesh.position.copy(this.pos);
  }
}
