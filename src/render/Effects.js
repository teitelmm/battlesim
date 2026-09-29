// Cartoon effects: particles (sparks, stars, dust, smoke, fire), tracers and beams,
// expanding shockwave rings and force-field bubbles. All instanced.
import * as THREE from 'three';
import { TEAM_COLORS } from './UnitRenderer.js';

const MAX_PARTICLES = 5000;
const MAX_LINES = 800;
const MAX_RINGS = 120;
const MAX_BUBBLES = 600;

const lin = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };
const C = {
  spark: lin(0xffe066), star: lin(0xfff27a), white: lin(0xffffff), dust: lin(0xb8a88a),
  smoke: lin(0x6e6e6e), fire: lin(0xff8c2b), fire2: lin(0xffd23b), heal: lin(0x6bff8e),
  shield: lin(0x7fe8ff), blood: lin(0xffffff), bullet: lin(0xfff0a0), laser: lin(0x6ff3ff),
  sniper: lin(0xffffff), minigun: lin(0xffc86b), beam: lin(0xffe14d), block: lin(0xdfe8ff),
};

export class Effects {
  constructor(scene) {
    this.scene = scene;
    const pGeo = new THREE.IcosahedronGeometry(0.62, 0);
    const pMat = new THREE.MeshBasicMaterial({ toneMapped: false });
    this.pMesh = this.instanced(pGeo, pMat, MAX_PARTICLES);
    this.particles = [];

    const lGeo = new THREE.CylinderGeometry(0.5, 0.5, 1, 6);
    lGeo.translate(0, 0.5, 0);
    const lMat = new THREE.MeshBasicMaterial({ toneMapped: false, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    this.lMesh = this.instanced(lGeo, lMat, MAX_LINES);
    this.lines = [];

    const rGeo = new THREE.RingGeometry(0.85, 1, 40);
    rGeo.rotateX(-Math.PI / 2);
    const rMat = new THREE.MeshBasicMaterial({ toneMapped: false, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    this.rMesh = this.instanced(rGeo, rMat, MAX_RINGS);
    this.rings = [];

    const bGeo = new THREE.SphereGeometry(0.5, 20, 14);
    const bMat = new THREE.MeshBasicMaterial({ toneMapped: false, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.35 });
    this.bMesh = this.instanced(bGeo, bMat, MAX_BUBBLES);
    this.bubbleCount = 0;

    this.m = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.v = new THREE.Vector3();
    this.s = new THREE.Vector3();
    this.up = new THREE.Vector3(0, 1, 0);
    this.dir = new THREE.Vector3();
    this.col = new THREE.Color();
    this.shake = 0;
  }

  instanced(geo, mat, n) {
    const mesh = new THREE.InstancedMesh(geo, mat, n);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
    mesh.frustumCulled = false;
    mesh.count = 0;
    this.scene.add(mesh);
    return mesh;
  }

  clear() {
    this.particles.length = 0;
    this.lines.length = 0;
    this.rings.length = 0;
    this.shake = 0;
  }

  // --------------------------------------------------------------- emitters
  particle(x, y, z, vx, vy, vz, life, size, color, gravity = 9, drag = 1.5, grow = 0) {
    if (this.particles.length >= MAX_PARTICLES) this.particles.shift();
    this.particles.push({ x, y, z, vx, vy, vz, life, max: life, size, color, gravity, drag, grow, rot: Math.random() * 6 });
  }

  burst(x, y, z, n, speed, life, size, color, gravity = 9, up = 0.5, grow = 0) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, e = Math.random() * 2 - 1;
      const r = Math.sqrt(1 - e * e);
      const s = speed * (0.4 + Math.random() * 0.6);
      this.particle(x, y, z, Math.cos(a) * r * s, (e * 0.5 + up) * s, Math.sin(a) * r * s, life * (0.6 + Math.random() * 0.6), size * (0.6 + Math.random() * 0.7), color, gravity, 1.5, grow);
    }
  }

  line(x1, y1, z1, x2, y2, z2, width, color, life) {
    if (this.lines.length >= MAX_LINES) this.lines.shift();
    this.lines.push({ x1, y1, z1, x2, y2, z2, width, color, life, max: life });
  }

  ring(x, y, z, r0, r1, life, color) {
    if (this.rings.length >= MAX_RINGS) this.rings.shift();
    this.rings.push({ x, y, z, r0, r1, life, max: life, color });
  }

  // Translate sim events into visuals.
  handle(e) {
    switch (e.type) {
      case 'hit':
        this.burst(e.x, e.y, e.z, e.big ? 10 : 5, e.big ? 6 : 4, 0.35, e.big ? 0.14 : 0.1, C.spark, 6, 0.6);
        if (e.big) this.burst(e.x, e.y, e.z, 4, 3, 0.6, 0.12, C.white, 4, 0.8);
        break;
      case 'block':
        this.burst(e.x, e.y, e.z, 6, 4, 0.25, 0.08, C.block, 5, 0.4);
        break;
      case 'death':
        this.burst(e.x, e.y + 0.2, e.z, 7, 2.5, 0.9, 0.12, C.star, 1.5, 1.2);
        break;
      case 'explosion':
        this.burst(e.x, e.y + 0.3, e.z, 26, 9 * (e.r / 3.5), 0.5, 0.35, C.fire, 3, 0.7, 1.2);
        this.burst(e.x, e.y + 0.3, e.z, 14, 6, 0.4, 0.3, C.fire2, 2, 0.8, 1);
        this.burst(e.x, e.y + 0.5, e.z, 14, 3, 1.4, 0.5, C.smoke, -1.5, 0.6, 1.6);
        this.ring(e.x, 0.08, e.z, 0.3, e.r * 1.2, 0.45, C.fire2);
        this.shake = Math.max(this.shake, Math.min(0.6, e.r * 0.12));
        break;
      case 'shockwave':
        this.ring(e.x, 0.08, e.z, 0.3, e.r, 0.4, C.white);
        this.burst(e.x, 0.2, e.z, 16, e.r * 1.6, 0.6, 0.25, C.dust, 5, 0.5, 0.8);
        this.shake = Math.max(this.shake, Math.min(0.5, e.r * 0.08));
        break;
      case 'dust':
        this.burst(e.x, 0.1, e.z, 6, 2 + e.r, 0.6, 0.2 + e.r * 0.1, C.dust, 2, 0.4, 0.8);
        break;
      case 'leap':
        this.burst(e.x, 0.1, e.z, 10, 3, 0.6, 0.25, C.dust, 2, 0.4, 0.8);
        break;
      case 'tracer': {
        const col = C[e.kind] || C.bullet;
        const w = e.kind === 'sniper' ? 0.06 : e.kind === 'laser' ? 0.07 : e.kind === 'minigun' ? 0.035 : 0.04;
        const life = e.kind === 'sniper' ? 0.25 : e.kind === 'laser' ? 0.12 : 0.06;
        this.line(e.x1, e.y1, e.z1, e.x2, e.y2, e.z2, w, col, life);
        this.particle(e.x1, e.y1, e.z1, 0, 0.5, 0, 0.05, e.kind === 'laser' ? 0.15 : 0.2, e.kind === 'laser' ? C.laser : C.fire2, 0, 0);
        if (e.hit) this.burst(e.x2, e.y2, e.z2, e.kind === 'minigun' ? 2 : 4, 3, 0.2, 0.07, col, 4, 0.3);
        break;
      }
      case 'launch':
        if (e.kind === 'rocket') this.burst(e.x, e.y, e.z, 6, 2, 0.5, 0.25, C.smoke, -1, 0.3, 1);
        break;
      case 'heal':
        this.line(e.x1, e.y1, e.z1, e.x2, e.y2, e.z2, 0.05, C.heal, 0.3);
        for (let i = 0; i < 6; i++) this.particle(e.x2 + (Math.random() - 0.5) * 0.6, e.y2, e.z2 + (Math.random() - 0.5) * 0.6, 0, 1.5 + Math.random(), 0, 0.8, 0.1, C.heal, -0.5, 0.5);
        break;
      case 'aura':
        this.ring(e.x, 0.1, e.z, 0.5, e.r, 0.7, C.shield);
        break;
      case 'blink': {
        const col = lin(TEAM_COLORS[e.team].teamLight);
        this.line(e.x1, e.y, e.z1, e.x2, e.y, e.z2, 0.22, col, 0.18);
        this.line(e.x1, e.y + 0.3, e.z1, e.x2, e.y + 0.3, e.z2, 0.06, C.fire2, 0.2);
        break;
      }
      case 'beamHit':
        this.burst(e.x, e.y, e.z, 2, 3, 0.25, 0.1, C.beam, 3, 0.5);
        break;
      default:
    }
  }

  // Per-frame visuals derived from live state (rocket trails, beams, bubbles).
  frameFromWorld(world, dt) {
    for (const p of world.projectiles) {
      if (p.kind === 'rocket' && Math.random() < 0.7) this.particle(p.x, p.y, p.z, (Math.random() - 0.5) * 0.4, 0.4, (Math.random() - 0.5) * 0.4, 0.7, 0.18, Math.random() < 0.4 ? C.fire : C.smoke, -0.5, 1, 1.2);
      if (p.kind === 'boulder' && Math.random() < 0.2) this.particle(p.x, p.y, p.z, 0, 0, 0, 0.4, 0.2, C.dust, 0, 0, 0.5);
    }
    let nb = 0;
    const m = this.m;
    for (const u of world.units) {
      if (u.channel > 0) {
        const def = u.def;
        const s = def.scale, c = Math.cos(u.facing), sn = Math.sin(u.facing);
        const mz = def.weapon.muzzle;
        const ox = u.x + mz[0] * s * c + mz[2] * s * sn, oy = u.y + mz[1] * s, oz = u.z - mz[0] * s * sn + mz[2] * s * c;
        const flick = 0.85 + Math.random() * 0.3;
        this.line(ox + 0.08 * c, oy, oz - 0.08 * sn, u.beamX, u.beamY, u.beamZ, 0.18 * flick, C.beam, dt * 1.1);
        this.line(ox - 0.08 * c, oy, oz + 0.08 * sn, u.beamX, u.beamY, u.beamZ, 0.18 * flick, C.beam, dt * 1.1);
        this.line(ox, oy, oz, u.beamX, u.beamY, u.beamZ, 0.08, C.white, dt * 1.1);
      }
      if (u.shield > 1 && nb < MAX_BUBBLES) {
        const f = Math.min(1, u.shield / 150);
        const r = u.def.height * 0.62 + 0.2;
        this.v.set(u.x, u.y + u.def.height * 0.5, u.z);
        this.s.set(r * 1.25, r * 1.1, r * 1.25);
        this.q.identity();
        m.compose(this.v, this.q, this.s);
        this.bMesh.setMatrixAt(nb, m);
        const pulse = 0.6 + Math.sin(world.time * 6 + u.id) * 0.1;
        this.bMesh.instanceColor.setXYZ(nb, C.shield[0] * f * pulse * 0.5, C.shield[1] * f * pulse * 0.5, C.shield[2] * f * pulse * 0.5);
        nb++;
      }
    }
    this.bMesh.count = nb;
    this.bMesh.instanceMatrix.needsUpdate = true;
    this.bMesh.instanceColor.needsUpdate = true;
  }

  update(dt) {
    const m = this.m;
    // Particles
    const ps = this.particles;
    let w = 0;
    const pm = this.pMesh;
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      p.life -= dt;
      if (p.life <= 0) continue;
      const d = Math.max(0, 1 - p.drag * dt);
      p.vx *= d; p.vy = p.vy * d - p.gravity * dt; p.vz *= d;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.y < 0.02) { p.y = 0.02; p.vy *= -0.3; p.vx *= 0.7; p.vz *= 0.7; }
      p.rot += dt * 5;
      const k = p.life / p.max;
      const size = p.size * (p.grow ? 1 + (1 - k) * p.grow : Math.min(1, k * 2));
      this.v.set(p.x, p.y, p.z);
      this.q.setFromAxisAngle(this.up, p.rot);
      this.s.set(size, size, size);
      m.compose(this.v, this.q, this.s);
      pm.setMatrixAt(w, m);
      const fade = p.grow ? Math.min(1, k * 1.5) : 1;
      pm.instanceColor.setXYZ(w, p.color[0] * fade, p.color[1] * fade, p.color[2] * fade);
      ps[w++] = p;
    }
    ps.length = w;
    pm.count = w;
    pm.instanceMatrix.needsUpdate = true;
    pm.instanceColor.needsUpdate = true;

    // Lines
    const ls = this.lines, lm = this.lMesh;
    w = 0;
    for (let i = 0; i < ls.length; i++) {
      const l = ls[i];
      l.life -= dt;
      if (l.life <= -1e-6) continue;
      const dx = l.x2 - l.x1, dy = l.y2 - l.y1, dz = l.z2 - l.z1;
      const len = Math.hypot(dx, dy, dz) || 1e-3;
      this.dir.set(dx / len, dy / len, dz / len);
      this.q.setFromUnitVectors(this.up, this.dir);
      const k = Math.max(0, l.life / l.max);
      this.v.set(l.x1, l.y1, l.z1);
      this.s.set(l.width, len, l.width);
      m.compose(this.v, this.q, this.s);
      lm.setMatrixAt(w, m);
      const f = 0.3 + 0.7 * k;
      lm.instanceColor.setXYZ(w, l.color[0] * f, l.color[1] * f, l.color[2] * f);
      ls[w++] = l;
    }
    ls.length = w;
    lm.count = w;
    lm.instanceMatrix.needsUpdate = true;
    lm.instanceColor.needsUpdate = true;

    // Rings
    const rs = this.rings, rm = this.rMesh;
    w = 0;
    for (let i = 0; i < rs.length; i++) {
      const r = rs[i];
      r.life -= dt;
      if (r.life <= 0) continue;
      const k = 1 - r.life / r.max;
      const rad = r.r0 + (r.r1 - r.r0) * (1 - (1 - k) * (1 - k));
      this.v.set(r.x, r.y, r.z);
      this.q.identity();
      this.s.set(rad, 1, rad);
      m.compose(this.v, this.q, this.s);
      rm.setMatrixAt(w, m);
      const f = 1 - k;
      rm.instanceColor.setXYZ(w, r.color[0] * f, r.color[1] * f, r.color[2] * f);
      rs[w++] = r;
    }
    rs.length = w;
    rm.count = w;
    rm.instanceMatrix.needsUpdate = true;
    rm.instanceColor.needsUpdate = true;

    this.shake = Math.max(0, this.shake - dt * 1.5);
  }
}
