import * as THREE from 'three';

// Pool of additive-blended sprite particles for contact sparks, dust, confetti.
// Pre-allocated to avoid GC spikes during gameplay.
export class Particles {
  constructor(scene, max = 90){
    this.max = max;
    this.items = [];
    for (let i = 0; i < max; i++){
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshBasicMaterial({
          color: 0xffffff, transparent: true, opacity: 0,
          depthWrite: false, blending: THREE.AdditiveBlending,
        })
      );
      m.renderOrder = 6;
      m.visible = false;
      scene.add(m);
      this.items.push({ mesh: m, vx:0, vy:0, vz:0, life:0, max:0, size:0.25, gravity:0 });
    }
  }
  spawn(x, y, z, opts = {}){
    const p = this.items.find(p => p.life <= 0);
    if (!p) return;
    const { vx=0, vy=0, vz=0, life=0.4, size=0.18, color=0xffffff, gravity=0 } = opts;
    p.mesh.position.set(x, y, z);
    p.mesh.material.color.setHex(color);
    p.mesh.material.opacity = 1;
    p.mesh.scale.setScalar(size);
    p.mesh.visible = true;
    p.vx = vx; p.vy = vy; p.vz = vz;
    p.life = life; p.max = life; p.size = size; p.gravity = gravity;
  }
  burst(x, y, z, count, opts){
    for (let i = 0; i < count; i++){
      const a = Math.random()*Math.PI*2;
      const sp = (opts.speed||4) * (0.5 + Math.random()*0.7);
      this.spawn(x, y, z, Object.assign({}, opts, {
        vx: Math.cos(a)*sp,
        vy: Math.abs(Math.sin(a)*sp) * (opts.upward !== false ? 1 : (Math.random()*2 - 1)),
        vz: (Math.random()*2 - 1) * sp * 0.4,
      }));
    }
  }
  update(dt){
    for (const p of this.items){
      if (p.life <= 0) continue;
      p.life -= dt;
      p.vy += p.gravity * dt;
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y += p.vy * dt;
      p.mesh.position.z += p.vz * dt;
      const k = Math.max(0, p.life / p.max);
      p.mesh.material.opacity = k;
      p.mesh.scale.setScalar(p.size * (0.4 + k*0.8));
      if (p.life <= 0) p.mesh.visible = false;
    }
  }
}
