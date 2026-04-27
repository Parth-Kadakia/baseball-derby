import * as THREE from 'three';
import {
  HOME, WALL_RADIUS, BASE_DIST,
  FOUL_DIR_R, FOUL_DIR_L, CENTER_DIR,
  FIRST_BASE, SECOND_BASE, THIRD_BASE,
} from './config.js';

// Build the full stadium scene: sky, ground, infield, lines, mound, plate,
// bases, walls, foul poles, seating bowl, crowd, light poles. Returns the
// scene + ambient/sun lights for later tuning if needed.

export function buildField(scene){
  // Lighting
  scene.add(new THREE.AmbientLight(0x8faacc, 0.7));
  const sun = new THREE.DirectionalLight(0xfff0cf, 1.0);
  sun.position.set(-20, 35, 12);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0x6688aa, 0.35);
  fill.position.set(15, 20, 25);
  scene.add(fill);

  // Sky shader — gradient + scattered stars
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: {},
    vertexShader: `varying vec3 vP;
      void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);} `,
    fragmentShader: `varying vec3 vP;
      void main(){
        float h = normalize(vP).y*0.5+0.5;
        vec3 top = vec3(0.02,0.05,0.12);
        vec3 mid = vec3(0.08,0.14,0.28);
        vec3 bot = vec3(0.22,0.24,0.36);
        vec3 col = mix(bot, mix(mid, top, smoothstep(0.3,1.0,h)), smoothstep(0.0,0.6,h));
        vec2 uv = vP.xz*0.02;
        float s = fract(sin(dot(floor(uv*40.0), vec2(127.1,311.7))) * 43758.5453);
        float star = smoothstep(0.996, 1.0, s) * step(0.3, h);
        col += vec3(star)*0.8;
        gl_FragColor = vec4(col,1.0);
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(120, 24, 12), skyMat);
  sky.renderOrder = -10;
  scene.add(sky);

  // Outfield grass (large circle around home plate)
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(120, 64),
    new THREE.MeshLambertMaterial({ color: 0x2d7a33 })
  );
  ground.rotation.x = -Math.PI/2;
  scene.add(ground);

  // Infield dirt — 90° sector centered at home, opening toward the outfield.
  const infield = new THREE.Mesh(
    new THREE.CircleGeometry(11, 48, 3*Math.PI/4, Math.PI/2),
    new THREE.MeshLambertMaterial({ color: 0xa8744a })
  );
  infield.rotation.x = -Math.PI/2;
  infield.position.set(HOME.x, 0.005, HOME.z);
  scene.add(infield);

  // Inner grass diamond on top of the dirt — leaves only a "skin" of dirt
  // around each base (real ballparks have grass infields with dirt cutouts).
  {
    const shape = new THREE.Shape();
    shape.moveTo(HOME.x, HOME.z);
    shape.lineTo(FIRST_BASE.x, FIRST_BASE.z);
    shape.lineTo(SECOND_BASE.x, SECOND_BASE.z);
    shape.lineTo(THIRD_BASE.x, THIRD_BASE.z);
    shape.lineTo(HOME.x, HOME.z);
    const grass = new THREE.Mesh(
      new THREE.ShapeGeometry(shape),
      new THREE.MeshLambertMaterial({ color: 0x2d7a33 })
    );
    grass.rotation.x = -Math.PI/2;
    grass.position.y = 0.012;
    grass.scale.z = -1;  // shape was drawn in (x, z) world coords
    scene.add(grass);
  }

  // Foul lines (chalk strips)
  function chalkLine(fromX, fromZ, toX, toZ, w = 0.18){
    const dx = toX - fromX, dz = toZ - fromZ;
    const len = Math.hypot(dx, dz);
    const line = new THREE.Mesh(
      new THREE.BoxGeometry(len, 0.02, w),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    line.position.set((fromX+toX)/2, 0.02, (fromZ+toZ)/2);
    line.rotation.y = -Math.atan2(dz, dx);
    scene.add(line);
  }
  chalkLine(HOME.x, HOME.z, HOME.x + FOUL_DIR_R.x*WALL_RADIUS, HOME.z + FOUL_DIR_R.z*WALL_RADIUS);
  chalkLine(HOME.x, HOME.z, HOME.x + FOUL_DIR_L.x*WALL_RADIUS, HOME.z + FOUL_DIR_L.z*WALL_RADIUS);

  // Pitcher's mound + rubber
  const mound = new THREE.Mesh(
    new THREE.CylinderGeometry(1.0, 1.3, 0.22, 28),
    new THREE.MeshLambertMaterial({ color: 0x8b5a2b })
  );
  mound.position.set(-5.5, 0.11, 0);
  scene.add(mound);
  const rubber = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.04, 0.12),
    new THREE.MeshLambertMaterial({ color: 0xffffff })
  );
  rubber.position.set(-5.5, 0.24, 0);
  scene.add(rubber);

  // Home plate + bases
  const plate = new THREE.Mesh(
    new THREE.BoxGeometry(0.6, 0.06, 0.6),
    new THREE.MeshLambertMaterial({ color: 0xffffff })
  );
  plate.position.set(HOME.x, 0.03, HOME.z);
  scene.add(plate);
  function makeBase(p){
    const b = new THREE.Mesh(
      new THREE.BoxGeometry(0.45, 0.1, 0.45),
      new THREE.MeshLambertMaterial({ color: 0xffffff })
    );
    b.position.set(p.x, 0.05, p.z);
    scene.add(b);
  }
  makeBase(FIRST_BASE);
  makeBase(SECOND_BASE);
  makeBase(THIRD_BASE);

  // Outfield wall — 90° cylinder arc spanning foul-pole to foul-pole
  const wall = new THREE.Mesh(
    new THREE.CylinderGeometry(WALL_RADIUS, WALL_RADIUS, 3.0, 80, 1, true, 3*Math.PI/4, Math.PI/2),
    new THREE.MeshLambertMaterial({ color: 0x0d2438, side: THREE.DoubleSide })
  );
  wall.position.set(HOME.x, 1.5, HOME.z);
  scene.add(wall);

  // Yellow HR strip atop the wall
  const hrLine = new THREE.Mesh(
    new THREE.CylinderGeometry(WALL_RADIUS+0.01, WALL_RADIUS+0.01, 0.2, 80, 1, true, 3*Math.PI/4, Math.PI/2),
    new THREE.MeshBasicMaterial({ color: 0xffdd22, side: THREE.DoubleSide })
  );
  hrLine.position.set(HOME.x, 3.05, HOME.z);
  scene.add(hrLine);

  // Foul poles
  for (const dir of [FOUL_DIR_R, FOUL_DIR_L]){
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.09, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xffdd22 })
    );
    pole.position.set(HOME.x + dir.x*WALL_RADIUS, 4, HOME.z + dir.z*WALL_RADIUS);
    scene.add(pole);
  }

  // Stadium seating bowl — concentric arcs wrapping past the foul poles back
  // around behind home plate. The 245° arc starts just past +Z foul-pole and
  // wraps through the outfield to ~340°, leaving the +Z side open to camera.
  const SEAT_ARC_START = Math.PI/2 + 0.05;
  const SEAT_ARC_LEN   = 4*Math.PI/3 + 0.1;
  for (let i = 0; i < 5; i++){
    const r = WALL_RADIUS + 1.4 + i*1.6;
    const seat = new THREE.Mesh(
      new THREE.CylinderGeometry(r, r+0.7, 1.9, 96, 1, true, SEAT_ARC_START, SEAT_ARC_LEN),
      new THREE.MeshLambertMaterial({
        color: new THREE.Color().setHSL(0.6, 0.3, 0.15 + i*0.045),
        side: THREE.DoubleSide,
      })
    );
    seat.position.set(HOME.x, 4.0 + i*1.6, HOME.z);
    scene.add(seat);
  }

  // Outer "shell" — dark cylinder so glimpses past the tiers see structure.
  {
    const r = WALL_RADIUS + 11;
    const shell = new THREE.Mesh(
      new THREE.CylinderGeometry(r, r, 16, 64, 1, true, SEAT_ARC_START - 0.1, SEAT_ARC_LEN + 0.2),
      new THREE.MeshLambertMaterial({ color: 0x0a1426, side: THREE.DoubleSide })
    );
    shell.position.set(HOME.x, 8, HOME.z);
    scene.add(shell);
  }

  // Crowd texture — wraps the seating arc
  {
    const crowdTex = new THREE.TextureLoader().load('/spritsheets/crowd.png');
    crowdTex.wrapS = THREE.RepeatWrapping;
    crowdTex.wrapT = THREE.ClampToEdgeWrapping;
    crowdTex.repeat.set(40, 0.42);
    crowdTex.offset.set(0, 0.5);
    crowdTex.magFilter = THREE.NearestFilter;
    crowdTex.minFilter = THREE.LinearFilter;
    crowdTex.colorSpace = THREE.SRGBColorSpace;
    const crowd = new THREE.Mesh(
      new THREE.CylinderGeometry(WALL_RADIUS+0.8, WALL_RADIUS+0.8, 2.2, 96, 1, true, SEAT_ARC_START, SEAT_ARC_LEN),
      new THREE.MeshBasicMaterial({ map: crowdTex, transparent: true, alphaTest: 0.2, side: THREE.DoubleSide })
    );
    crowd.position.set(HOME.x, 3.5, HOME.z);
    scene.add(crowd);
  }

  // Stadium light poles — 4 around the back of the seating bowl
  const angles = [3*Math.PI/4 + 0.2, 5*Math.PI/6, 7*Math.PI/6, 5*Math.PI/4 - 0.2];
  const r = WALL_RADIUS + 8;
  for (const a of angles){
    const x = HOME.x + r * Math.cos(a);
    const z = HOME.z + r * Math.sin(a);
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.28, 18, 8),
      new THREE.MeshLambertMaterial({ color: 0x3a4a5a })
    );
    pole.position.set(x, 9, z); scene.add(pole);
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.7, 12, 12),
      new THREE.MeshBasicMaterial({ color: 0xfff8b0 })
    );
    bulb.position.set(x, 18, z); scene.add(bulb);
    const pt = new THREE.PointLight(0xfff0a8, 0.6, 70);
    pt.position.set(x, 17, z); scene.add(pt);
  }

  return { sun, fill };
}
