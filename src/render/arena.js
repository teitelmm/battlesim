// Static scenery: sky dome, grass ground with a marked arena, and trees/rocks outside it.
import * as THREE from 'three';
import { createRng } from '../sim/rng.js';

function grassTexture(half) {
  const size = 1024;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  g.fillStyle = '#6fa84a';
  g.fillRect(0, 0, size, size);
  const rng = createRng(7);
  for (let i = 0; i < 26000; i++) {
    const x = rng.next() * size, y = rng.next() * size;
    const l = 38 + rng.next() * 18;
    g.fillStyle = `hsl(${92 + rng.next() * 18}, ${38 + rng.next() * 16}%, ${l}%)`;
    g.fillRect(x, y, 2 + rng.next() * 3, 2 + rng.next() * 3);
  }
  // Soft darker patches.
  for (let i = 0; i < 60; i++) {
    const x = rng.next() * size, y = rng.next() * size, r = 30 + rng.next() * 90;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, 'rgba(60,110,40,0.25)');
    grd.addColorStop(1, 'rgba(60,110,40,0)');
    g.fillStyle = grd;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(12, 12);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function skyDome() {
  const geo = new THREE.SphereGeometry(900, 32, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      top: { value: new THREE.Color(0x4f8fe0) },
      horizon: { value: new THREE.Color(0xcfe6ff) },
      bottom: { value: new THREE.Color(0xa9c98f) },
    },
    vertexShader: 'varying vec3 vPos; void main(){ vPos = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 bottom; varying vec3 vPos;
      void main(){ float h = vPos.y; vec3 c = h > 0.0 ? mix(horizon, top, pow(h, 0.6)) : mix(horizon, bottom, pow(-h, 0.4));
      gl_FragColor = vec4(c, 1.0); }`,
  });
  const m = new THREE.Mesh(geo, mat);
  m.renderOrder = -1;
  return m;
}

export function buildArena(scene, half) {
  const group = new THREE.Group();
  group.add(skyDome());

  const groundMat = new THREE.MeshStandardMaterial({ map: grassTexture(half), roughness: 1 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(700, 700), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);

  // Team-side tints and the arena border.
  const sideGeo = new THREE.PlaneGeometry(half, half * 2);
  const mkSide = (color, x) => {
    const m = new THREE.Mesh(sideGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.06, depthWrite: false }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.02, 0);
    return m;
  };
  group.add(mkSide(0xff3030, -half / 2), mkSide(0x3060ff, half / 2));
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false });
  const mid = new THREE.Mesh(new THREE.PlaneGeometry(0.15, half * 2), lineMat);
  mid.rotation.x = -Math.PI / 2;
  mid.position.y = 0.03;
  group.add(mid);
  const border = new THREE.Mesh(new THREE.RingGeometry(half * Math.SQRT2 - 0.3, half * Math.SQRT2, 4, 1), lineMat);
  border.rotation.x = -Math.PI / 2;
  border.rotation.z = Math.PI / 4;
  border.position.y = 0.03;
  group.add(border);

  // Trees and rocks outside the playable square.
  const rng = createRng(42);
  const trunkGeo = new THREE.CylinderGeometry(0.25, 0.35, 2, 6);
  trunkGeo.translate(0, 1, 0);
  const leafGeo = new THREE.ConeGeometry(1.6, 3.6, 7);
  leafGeo.translate(0, 3.6, 0);
  const rockGeo = new THREE.DodecahedronGeometry(1, 0);
  const trees = [], rocks = [];
  while (trees.length < 220) {
    const x = rng.range(-170, 170), z = rng.range(-170, 170);
    if (Math.abs(x) < half + 6 && Math.abs(z) < half + 6) continue;
    trees.push([x, z, rng.range(0.8, 1.6), rng.next() * 6]);
  }
  while (rocks.length < 90) {
    const x = rng.range(-150, 150), z = rng.range(-150, 150);
    if (Math.abs(x) < half + 3 && Math.abs(z) < half + 3) continue;
    rocks.push([x, z, rng.range(0.4, 1.6), rng.next() * 6]);
  }
  const trunk = new THREE.InstancedMesh(trunkGeo, new THREE.MeshStandardMaterial({ color: 0x6b4a2b, roughness: 1 }), trees.length);
  const leaves = new THREE.InstancedMesh(leafGeo, new THREE.MeshStandardMaterial({ color: 0x3f7a3a, roughness: 0.9, flatShading: true }), trees.length);
  const rock = new THREE.InstancedMesh(rockGeo, new THREE.MeshStandardMaterial({ color: 0x8c8c86, roughness: 1, flatShading: true }), rocks.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const tint = new THREE.Color();
  trees.forEach(([x, z, sc, r], i) => {
    q.setFromAxisAngle(up, r);
    m.compose(p.set(x, 0, z), q, s.set(sc, sc, sc));
    trunk.setMatrixAt(i, m);
    leaves.setMatrixAt(i, m);
    leaves.setColorAt(i, tint.setHSL(0.28 + rng.next() * 0.06, 0.4, 0.3 + rng.next() * 0.1));
  });
  rocks.forEach(([x, z, sc, r], i) => {
    q.setFromAxisAngle(up, r);
    m.compose(p.set(x, sc * 0.3, z), q, s.set(sc, sc * 0.7, sc));
    rock.setMatrixAt(i, m);
  });
  for (const mesh of [trunk, leaves, rock]) { mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh); }
  scene.add(group);
  return group;
}
