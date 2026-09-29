// Owns the three.js scene, camera and draw pipeline.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { PartBatch } from './PartBatch.js';
import { UnitRenderer } from './UnitRenderer.js';
import { Effects } from './Effects.js';
import { buildArena } from './arena.js';
import { BONE_COUNT } from '../anim/skeleton.js';

const WHITE_TINT = [1, 1, 1, 0.35];
const SRGB_LUT = new Uint8Array(256).map((_, i) => {
  const c = Math.min(1, (i / 255) * 1.1);
  return Math.round(255 * (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055));
});
const ERASE_TINT = [1, 0.15, 0.15, 0.55];

export class Renderer {
  constructor(canvas, { arenaHalf }) {
    this.canvas = canvas;
    const gl = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: false, powerPreference: 'high-performance' });
    gl.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    gl.shadowMap.enabled = true;
    gl.shadowMap.type = THREE.PCFShadowMap;
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = 1.05;
    this.gl = gl;

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0xcfe6ff, 140, 420);
    this.scene = scene;

    const camera = new THREE.PerspectiveCamera(50, 1, 0.3, 2000);
    this.camera = camera;

    const controls = new OrbitControls(camera, canvas);
    controls.target.set(0, 0, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.maxPolarAngle = 1.42;
    controls.minDistance = 6;
    controls.maxDistance = 230;
    controls.screenSpacePanning = false;
    controls.zoomToCursor = true;
    this.controls = controls;
    this.setPlacementMode(true);

    scene.add(new THREE.HemisphereLight(0xdcecff, 0x5e7f45, 1.35));
    const sun = new THREE.DirectionalLight(0xfff4e0, 2.4);
    sun.position.set(45, 70, 30);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -75; sc.right = 75; sc.top = 75; sc.bottom = -75; sc.near = 10; sc.far = 220;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.03;
    scene.add(sun);
    scene.add(sun.target);
    this.sun = sun;

    buildArena(scene, arenaHalf);
    this.batch = new PartBatch(scene);
    this.units = new UnitRenderer(this.batch);
    this.effects = new Effects(scene);

    // Translucent batch for the placement ghost.
    this.ghostBatch = new PartBatch(scene);
    for (const m of Object.values(this.ghostBatch.materials)) { m.transparent = true; m.opacity = 0.5; m.depthWrite = false; }
    this.ghostUnits = new UnitRenderer(this.ghostBatch);
    this.ghostFrames = new Float32Array(BONE_COUNT * 12);

    this.time = 0;
    this.raycaster = new THREE.Raycaster();
    this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.tmpV = new THREE.Vector3();
    this.keys = new Set();
    this.follow = null;
    this.resize();
    this.resetCamera();
  }

  setPlacementMode(placing) {
    const c = this.controls;
    c.mouseButtons = placing
      ? { LEFT: null, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE }
      : { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE };
    c.touches = placing ? { ONE: null, TWO: THREE.TOUCH.DOLLY_ROTATE } : { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.gl.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // Screen position (client px) -> ground point, or null.
  groundAt(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = this.raycaster.ray.intersectPlane(this.groundPlane, this.tmpV);
    return hit ? { x: hit.x, z: hit.z } : null;
  }

  cameraAzimuth() {
    const c = this.camera.position, t = this.controls.target;
    return Math.atan2(c.x - t.x, c.z - t.z);
  }

  moveCamera(dt) {
    const k = this.keys;
    if (!k.size) return;
    const speed = 18 + this.camera.position.distanceTo(this.controls.target) * 0.6;
    const az = this.cameraAzimuth();
    let fx = 0, fz = 0;
    const fwd = [-Math.sin(az), -Math.cos(az)], right = [Math.cos(az), -Math.sin(az)];
    if (k.has('w') || k.has('arrowup')) { fx += fwd[0]; fz += fwd[1]; }
    if (k.has('s') || k.has('arrowdown')) { fx -= fwd[0]; fz -= fwd[1]; }
    if (k.has('d') || k.has('arrowright')) { fx += right[0]; fz += right[1]; }
    if (k.has('a') || k.has('arrowleft')) { fx -= right[0]; fz -= right[1]; }
    if (fx || fz) {
      this.follow = null;
      const l = Math.hypot(fx, fz);
      const dx = (fx / l) * speed * dt, dz = (fz / l) * speed * dt;
      this.pan(dx, dz);
    }
    const rot = (k.has('q') ? 1 : 0) - (k.has('e') ? 1 : 0);
    if (rot) {
      const t = this.controls.target, c = this.camera.position;
      const a = rot * 1.6 * dt;
      const ox = c.x - t.x, oz = c.z - t.z;
      c.x = t.x + ox * Math.cos(a) + oz * Math.sin(a);
      c.z = t.z - ox * Math.sin(a) + oz * Math.cos(a);
    }
  }

  pan(dx, dz) {
    const t = this.controls.target;
    const lim = 90;
    const nx = Math.max(-lim, Math.min(lim, t.x + dx)), nz = Math.max(-lim, Math.min(lim, t.z + dz));
    this.camera.position.x += nx - t.x; this.camera.position.z += nz - t.z;
    t.x = nx; t.z = nz;
  }

  // Landscape: look across the battle line. Portrait (phones): look down it, Red nearest.
  resetCamera() {
    this.follow = null;
    if (this.camera.aspect < 0.9) {
      // The palette covers the bottom of the screen, so aim a little past Red.
      this.controls.target.set(-12, 0, 0);
      this.camera.position.set(-72, 50, 0);
    } else {
      this.controls.target.set(0, 0, 0);
      this.camera.position.set(0, 34, 46);
    }
  }

  // opts: { animDt, hover, eraseHover, ghost: {def, team, x, z, facing}, live (bool) }
  render(world, dt, opts) {
    const animDt = opts.animDt;
    this.time += animDt;
    const fx = this.effects;
    if (world.events && world.events.length) {
      for (const e of world.events) fx.handle(e);
      world.events.length = 0;
    }
    if (animDt > 0) {
      fx.frameFromWorld(world, animDt);
      fx.update(animDt);
    }

    const batch = this.batch;
    batch.begin();
    for (const u of world.units) {
      let tint = null;
      if (u === opts.hover) tint = opts.eraseHover ? ERASE_TINT : WHITE_TINT;
      this.units.drawUnit(u, animDt, this.time, tint);
    }
    for (const r of world.ragdolls) this.units.drawRagdoll(r, this.time);
    for (const p of world.projectiles) {
      const spin = p.kind === 'rock' || p.kind === 'boulder' ? this.time * 9 : p.kind === 'rocket' ? this.time * 12 : 0;
      this.units.drawProjectile(p.kind, p.x, p.y, p.z, p.vx, p.vy, p.vz, spin);
    }
    for (const d of world.debris) {
      const sink = d.kind === 'spear' ? 0.45 : 0.25;
      this.units.drawProjectile(d.kind, d.x - d.dx * sink, Math.max(0, -d.dy * (0.5 - sink)), d.z - d.dz * sink, d.dx, d.dy, d.dz, 0);
    }
    batch.end();

    const gb = this.ghostBatch;
    gb.begin();
    if (opts.ghosts) {
      for (const g of opts.ghosts) {
        const frames = this.ghostUnits.posePreview(g.def, g.facing, g.x, g.z, this.time, this.ghostFrames);
        this.ghostUnits.drawParts(g.def, g.team, 0, frames, 0.25, null, null, null);
      }
    }
    gb.end();

    // Follow cam
    if (this.follow) {
      if (!this.follow.alive) this.follow = null;
      else {
        const t = this.controls.target;
        const k = Math.min(1, dt * 4);
        this.pan((this.follow.x - t.x) * k, (this.follow.z - t.z) * k);
      }
    }
    this.moveCamera(dt);
    this.controls.update(dt);

    // Screen shake (applied only for this draw).
    const cam = this.camera;
    const sh = fx.shake;
    let ox = 0, oy = 0, oz = 0;
    if (sh > 0) {
      ox = (Math.random() - 0.5) * sh; oy = (Math.random() - 0.5) * sh; oz = (Math.random() - 0.5) * sh;
      cam.position.x += ox; cam.position.y += oy; cam.position.z += oz;
    }
    this.gl.render(this.scene, cam);
    if (sh > 0) { cam.position.x -= ox; cam.position.y -= oy; cam.position.z -= oz; }
  }

  // Render small portraits of each unit type for the palette. Returns {id: dataURL}.
  makeThumbnails(defs, team = 0) {
    const size = 128;
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x88aa77, 1.6));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(3, 5, 6);
    scene.add(key);
    const batch = new PartBatch(scene);
    for (const p of batch.pools.values()) p.mesh.castShadow = false;
    const ur = new UnitRenderer(batch);
    const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
    const target = new THREE.WebGLRenderTarget(size, size, { samples: 4 });
    const pixels = new Uint8Array(size * size * 4);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(size, size);
    const out = {};
    const prevTarget = this.gl.getRenderTarget();
    const prevShadow = this.gl.shadowMap.enabled;
    this.gl.shadowMap.enabled = false;
    for (const def of defs) {
      batch.begin();
      const frames = ur.posePreview(def, 0.6, 0, 0, 0.5);
      ur.drawParts(def, team, 1, frames, 0, null, null, null);
      batch.end();
      // Frame the posed skeleton (bone origins + margin) so flyers and mounts fit too.
      const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
      for (let b = 0; b < BONE_COUNT; b++) {
        for (let k = 0; k < 3; k++) {
          const v = frames[b * 12 + 9 + k];
          lo[k] = Math.min(lo[k], v); hi[k] = Math.max(hi[k], v);
        }
      }
      const margin = def.scale * 0.45;
      if (!def.traits.flying) lo[1] = Math.min(lo[1], 0);
      const cx = (lo[0] + hi[0]) / 2, cy = (lo[1] + hi[1]) / 2 + margin * 0.3, cz = (lo[2] + hi[2]) / 2;
      const ext = Math.max(hi[0] - lo[0], hi[1] - lo[1] + margin, hi[2] - lo[2]) / 2 + margin;
      const dist = ext / Math.tan((cam.fov * Math.PI) / 360) * 1.1;
      cam.position.set(cx + dist * 0.33, cy + dist * 0.22, cz + dist * 0.92);
      cam.lookAt(cx, cy, cz);
      this.gl.setRenderTarget(target);
      this.gl.setClearColor(0x000000, 0);
      this.gl.clear();
      this.gl.render(scene, cam);
      this.gl.readRenderTargetPixels(target, 0, 0, size, size, pixels);
      // Render targets are linear (no tone mapping), so convert to sRGB while flipping.
      for (let y = 0; y < size; y++) {
        const src = (size - 1 - y) * size * 4, dst = y * size * 4;
        for (let i = 0; i < size * 4; i += 4) {
          img.data[dst + i] = SRGB_LUT[pixels[src + i]];
          img.data[dst + i + 1] = SRGB_LUT[pixels[src + i + 1]];
          img.data[dst + i + 2] = SRGB_LUT[pixels[src + i + 2]];
          img.data[dst + i + 3] = pixels[src + i + 3];
        }
      }
      ctx.putImageData(img, 0, 0);
      out[def.id] = canvas.toDataURL('image/png');
    }
    this.gl.setRenderTarget(prevTarget);
    this.gl.shadowMap.enabled = prevShadow;
    target.dispose();
    batch.dispose();
    return out;
  }
}
