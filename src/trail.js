import * as THREE from 'three';

// Fading dot trail for the pitched ball — a fixed-size pool of small spheres
// placed at recent ball positions with opacity ramping oldest→newest.
// (WebGL can't reliably draw thick lines, so we fake it with discrete blobs.)
export class Trail {
  constructor(scene, maxLen = 22){
    this.maxLen = maxLen;
    this.points = [];
    this.dots = [];
    for (let i = 0; i < maxLen; i++){
      const dot = new THREE.Mesh(
        new THREE.SphereGeometry(0.12, 10, 8),
        new THREE.MeshBasicMaterial({
          color: 0xffffff, transparent: true, opacity: 0, depthWrite: false,
        })
      );
      dot.renderOrder = 3;
      scene.add(dot);
      this.dots.push(dot);
    }
  }
  setColor(hex){ for (const d of this.dots) d.material.color.setHex(hex); }
  push(p){
    this.points.push(p.clone());
    if (this.points.length > this.maxLen) this.points.shift();
    for (let i = 0; i < this.maxLen; i++){
      const dot = this.dots[i];
      const pt = this.points[i];
      if (!pt){ dot.material.opacity = 0; continue; }
      const t = i / Math.max(1, this.points.length - 1);
      dot.position.copy(pt);
      dot.material.opacity = 0.15 + t * 0.75;
      dot.scale.setScalar(0.4 + t * 1.1);
    }
  }
  clear(){
    this.points = [];
    for (const d of this.dots) d.material.opacity = 0;
  }
}
