// Verlet ragdolls for fallen units. Each ragdoll is the unit's 13-joint skeleton held
// together by distance links, so the renderer can draw it with the same parts as the
// living unit.
import { GRAVITY, STEP } from './constants.js';
import { JOINT_COUNT, RAGDOLL_LINKS, restJoints, jointsToWorld, J } from '../anim/skeleton.js';

const BIPED_RADII = [0.2, 0.12, 0.12, 0.12, 0.12, 0.07, 0.06, 0.07, 0.06, 0.08, 0.06, 0.08, 0.06];
const QUAD_RADII = [0.3, 0.3, 0.3, 0.3, 0.3, 0.1, 0.08, 0.1, 0.08, 0.1, 0.08, 0.1, 0.08];
const cache = new Map();

function ragdollInfo(def) {
  let info = cache.get(def.id);
  if (info) return info;
  const rest = restJoints(def.sk, def.skeleton);
  const s = def.scale;
  const links = RAGDOLL_LINKS[def.skeleton].map(([a, b, stiff, kind]) => {
    const dx = rest[a * 3] - rest[b * 3], dy = rest[a * 3 + 1] - rest[b * 3 + 1], dz = rest[a * 3 + 2] - rest[b * 3 + 2];
    const len = Math.hypot(dx, dy, dz) * s;
    return { a, b, stiff, kind, len: kind === 1 ? len * 0.55 : len };
  });
  const radii = (def.skeleton === 'quad' ? QUAD_RADII : BIPED_RADII).map((r) => r * s);
  info = { rest, links, radii };
  cache.set(def.id, info);
  return info;
}

export function createRagdoll(u, vx, vy, vz, kickX, kickZ) {
  const def = u.def;
  const info = ragdollInfo(def);
  const pos = new Float32Array(JOINT_COUNT * 3);
  jointsToWorld(info.rest, def.scale, u.facing, u.x, u.y, u.z, pos);
  const prev = new Float32Array(JOINT_COUNT * 3);
  const h = def.height;
  for (let j = 0; j < JOINT_COUNT; j++) {
    // Upper joints get an extra kick so bodies topple away from the hit.
    const k = Math.max(0, (pos[j * 3 + 1] - u.y) / h);
    prev[j * 3] = pos[j * 3] - (vx + kickX * k) * STEP;
    prev[j * 3 + 1] = pos[j * 3 + 1] - vy * STEP;
    prev[j * 3 + 2] = pos[j * 3 + 2] - (vz + kickZ * k) * STEP;
  }
  return {
    def, team: u.team, skin: u.skin, unit: u,
    pos, prev, info,
    still: 0, asleep: false, age: 0, fresh: true,
  };
}

// Overwrite the ragdoll's starting pose with the unit's last rendered pose (keeps velocity).
export function adoptPose(r, joints) {
  const { pos, prev } = r;
  for (let i = 0; i < JOINT_COUNT * 3; i++) {
    const v = pos[i] - prev[i];
    pos[i] = joints[i];
    prev[i] = joints[i] - v;
  }
}

export function stepRagdoll(r, dt) {
  r.age += dt;
  if (r.asleep) return;
  const { pos, prev, info } = r;
  const g = GRAVITY * dt * dt;
  const radii = info.radii;
  let motion = 0;
  for (let j = 0; j < JOINT_COUNT; j++) {
    const i = j * 3;
    const x = pos[i], y = pos[i + 1], z = pos[i + 2];
    let vx = (x - prev[i]) * 0.995, vy = (y - prev[i + 1]) * 0.995, vz = (z - prev[i + 2]) * 0.995;
    if (y <= radii[j] + 0.001) { vx *= 0.82; vz *= 0.82; }
    prev[i] = x; prev[i + 1] = y; prev[i + 2] = z;
    pos[i] = x + vx; pos[i + 1] = y + vy - g; pos[i + 2] = z + vz;
    motion = Math.max(motion, Math.abs(vx) + Math.abs(vy) + Math.abs(vz));
  }
  const links = info.links;
  for (let it = 0; it < 4; it++) {
    for (let l = 0; l < links.length; l++) {
      const L = links[l];
      const a = L.a * 3, b = L.b * 3;
      const dx = pos[b] - pos[a], dy = pos[b + 1] - pos[a + 1], dz = pos[b + 2] - pos[a + 2];
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
      if (L.kind === 1 && d >= L.len) continue;
      const k = ((d - L.len) / d) * 0.5 * L.stiff;
      pos[a] += dx * k; pos[a + 1] += dy * k; pos[a + 2] += dz * k;
      pos[b] -= dx * k; pos[b + 1] -= dy * k; pos[b + 2] -= dz * k;
    }
    for (let j = 0; j < JOINT_COUNT; j++) {
      if (pos[j * 3 + 1] < radii[j]) pos[j * 3 + 1] = radii[j];
    }
  }
  if (motion < 0.002) {
    r.still += dt;
    if (r.still > 0.6) r.asleep = true;
  } else {
    r.still = 0;
  }
}

// Blast impulse (m/s at the centre, falling off to zero at radius).
export function pushRagdoll(r, x, y, z, radius, force) {
  const { pos, prev } = r;
  let touched = false;
  for (let j = 0; j < JOINT_COUNT; j++) {
    const i = j * 3;
    const dx = pos[i] - x, dy = pos[i + 1] - y, dz = pos[i + 2] - z;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d > radius) continue;
    const f = (force * (1 - d / radius) * STEP) / (d || 1);
    prev[i] -= dx * f;
    prev[i + 1] -= (Math.abs(dy) + d * 0.8) * f;
    prev[i + 2] -= dz * f;
    touched = true;
  }
  if (touched) { r.asleep = false; r.still = 0; }
}

export function ragdollCenter(r) {
  const p = r.pos;
  return [(p[J.lHip * 3] + p[J.rHip * 3]) / 2, (p[J.lHip * 3 + 1] + p[J.rHip * 3 + 1]) / 2, (p[J.lHip * 3 + 2] + p[J.rHip * 3 + 2]) / 2];
}
