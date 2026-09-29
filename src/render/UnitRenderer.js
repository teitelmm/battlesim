// Poses living units procedurally and draws units, ragdolls, projectiles and debris
// through the PartBatch.
import * as THREE from 'three';
import { BONE, BONE_COUNT, JOINT_COUNT, poseJoints, jointsToWorld, computeFrames, swingCurve } from '../anim/skeleton.js';
import { getLook } from '../data/looks.js';
import { adoptPose } from '../sim/ragdoll.js';
import { rotXYZ, axisRot, mul3, mulVec3, scaleCols } from './PartBatch.js';

const lin = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };

export const TEAM_COLORS = [
  { team: 0xd63c3c, teamDark: 0x8e2323, teamLight: 0xff8a7a },
  { team: 0x3c6fd6, teamDark: 0x223f8e, teamLight: 0x8ab4ff },
];
const TOKENS = TEAM_COLORS.map((t) => ({
  team: lin(t.team), teamDark: lin(t.teamDark), teamLight: lin(t.teamLight),
  metal: lin(0x9aa1ad), dark: lin(0x222222),
}));
const SKINS = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524].map(lin);
const HAIRS = [0x2a1a0e, 0x5a3a1e, 0x8a5a2b, 0x111111].map(lin);
const HORSES = [0x8b5a2b, 0x5c3a1e, 0xe8e2d6, 0x3b3b3b].map(lin);

function compileLook(def) {
  const s = def.scale;
  return getLook(def.id).map((p) => {
    const R = rotXYZ(...p.rot);
    const size = p.size.map((v) => v * s);
    const pos = p.pos.map((v) => v * s);
    const center = (p.center || [0, 0, 0]).map((v) => v * s);
    const rs = scaleCols(R, size[0], size[1], size[2]);
    const rc = mulVec3(R, center);
    const t = [pos[0] + rc[0], pos[1] + rc[1], pos[2] + rc[2]];
    let color = null, token = null;
    if (typeof p.color === 'number') color = lin(p.color);
    else token = p.color;
    return {
      bone: BONE[p.bone] ?? 0, shape: p.shape, glow: !!p.glow, color, token,
      R, rs, t, size, pos, center,
      swing: p.swing || null, spin: p.spin ? p.spin * s : 0, showWhen: p.showWhen || null,
    };
  });
}

const tmpR = new Float32Array(9), tmpE = new Float32Array(9), tmpRS = new Float32Array(9), tmpV = [0, 0, 0], tmpT = [0, 0, 0];

export class UnitRenderer {
  constructor(batch) {
    this.batch = batch;
    this.looks = new Map();
    this.local = new Float32Array(JOINT_COUNT * 3);
    this.frames = new Float32Array(BONE_COUNT * 12);
    this.pose = {};
    this.projFrame = new Float32Array(12);
    this.projLooks = makeProjectileLooks();
  }

  look(def) {
    let l = this.looks.get(def.id);
    if (!l) { l = compileLook(def); this.looks.set(def.id, l); }
    return l;
  }

  color(part, team, skin, out) {
    if (part.color) return part.color;
    const tk = part.token;
    if (tk === 'skin') return SKINS[skin & 3];
    if (tk === 'hair') return HAIRS[skin & 3];
    if (tk === 'horse') return HORSES[skin & 3];
    return TOKENS[team][tk] || TOKENS[team].team;
  }

  // Advance per-unit render-only animation state (walk phase, wobble springs).
  animate(u, dt, time) {
    let r = u.r;
    if (!r) {
      r = u.r = { walk: u.id * 1.7, walkAmt: 0, tiltX: 0, tiltZ: 0, tvx: 0, tvz: 0, lastHit: u.hitTime, air: 0, fly: 0, wheel: 0, joints: new Float32Array(JOINT_COUNT * 3), cheer: 0, pvx: 0, pvz: 0 };
    }
    const def = u.def;
    const sp = u.speedNow;
    const stride = (def.skeleton === 'quad' ? 1.7 : 1.35) * def.scale;
    r.walk += (sp / stride) * Math.PI * 2 * dt * 0.5;
    r.wheel += sp * dt;
    const targetAmt = Math.min(1, sp / Math.max(0.5, def.speed * 0.55));
    r.walkAmt += (targetAmt - r.walkAmt) * Math.min(1, dt * 8);
    // Lean into acceleration and wobble from hits.
    const c = Math.cos(u.facing), s = Math.sin(u.facing);
    const ax = (u.vx - r.pvx) / Math.max(dt, 1e-3), az = (u.vz - r.pvz) / Math.max(dt, 1e-3);
    r.pvx = u.vx; r.pvz = u.vz;
    const aF = ax * s + az * c, aL = ax * c - az * s;
    const stiff = 70 / Math.sqrt(def.mass), damp = 7;
    r.tvx += (-stiff * r.tiltX - damp * r.tvx + Math.max(-30, Math.min(30, aF)) * 0.02) * dt;
    r.tvz += (-stiff * r.tiltZ - damp * r.tvz + Math.max(-30, Math.min(30, aL)) * 0.02) * dt;
    if (u.hitTime !== r.lastHit) {
      r.lastHit = u.hitTime;
      const hF = u.hitDirX * s + u.hitDirZ * c, hL = u.hitDirX * c - u.hitDirZ * s;
      const k = 4 / Math.sqrt(def.mass);
      r.tvx += hF * k; r.tvz += hL * k;
    }
    r.tiltX = Math.max(-0.6, Math.min(0.6, r.tiltX + r.tvx * dt));
    r.tiltZ = Math.max(-0.6, Math.min(0.6, r.tiltZ + r.tvz * dt));
    const airT = u.airborne && !u.leaping ? 1 : 0;
    r.air += (airT - r.air) * Math.min(1, dt * 10);
    const flyT = def.traits.flying && u.y > 1 ? (u.attackT >= 0 ? 0.35 : 1) : 0;
    r.fly += (flyT - r.fly) * Math.min(1, dt * 5);
    r.cheer += ((u.cheer ? 1 : 0) - r.cheer) * Math.min(1, dt * 4);
  }

  buildPose(u, time) {
    const def = u.def, r = u.r, P = this.pose, w = def.weapon;
    P.t = time + u.id * 0.37;
    P.walk = r.walk;
    P.walkAmt = u.airborne ? 0 : r.walkAmt;
    P.carry = def.carry;
    P.anim = null; P.ap = -1; P.W = 0.4; P.count = u.swingCount;
    if (u.attackT >= 0) {
      P.anim = w.anim; P.ap = u.attackT / u.attackDur; P.W = w.windup / u.attackDur;
    } else if (u.castT >= 0) {
      P.anim = 'cast'; P.ap = u.castT / 0.8; P.W = 0.3;
    } else if (u.leaping) {
      P.anim = 'slam'; P.ap = 0.36; P.W = 0.4;
    } else if (u.stompT >= 0) {
      P.anim = 'slam'; P.ap = 0.4 + (u.stompT / 0.6) * 0.6; P.W = 0.4;
    }
    P.aiming = u.aiming;
    P.air = r.air;
    P.fly = r.fly;
    P.cheer = r.cheer;
    P.stun = u.stun > 0 ? Math.min(1, u.stun * 2) : 0;
    P.tiltX = r.tiltX; P.tiltZ = r.tiltZ;
    P.grounded = !u.airborne && !(def.traits.flying && u.y > 0.3);
    P.charge = u.charging;
    return P;
  }

  // Draw one living unit. tint: optional [r,g,b,amount] overlay (hover highlight).
  drawUnit(u, dt, time, tint) {
    const def = u.def;
    this.animate(u, dt, time);
    const P = this.buildPose(u, time);
    poseJoints(def.sk, def.skeleton, def.gait, P, this.local);
    jointsToWorld(this.local, def.scale, u.facing, u.x, u.y, u.z, u.r.joints);
    computeFrames(def.skeleton, u.r.joints, this.frames);
    let flash = Math.max(0, 1 - (time - u.hitTime) / 0.12) * 0.55;
    this.drawParts(def, u.team, u.skin, this.frames, flash, tint, u, P);
  }

  drawRagdoll(rd, time) {
    if (rd.fresh) {
      rd.fresh = false;
      if (rd.unit && rd.unit.r) adoptPose(rd, rd.unit.r.joints);
      rd.unit = null; // only needed for the pose hand-off
    }
    computeFrames(rd.def.skeleton, rd.pos, this.frames);
    this.drawParts(rd.def, rd.team, rd.skin, this.frames, 0, null, null, null);
  }

  // Static preview (ghost / thumbnails) at rest pose.
  posePreview(def, facing, x, z, time, outFrames) {
    const P = this.pose;
    for (const k of Object.keys(P)) P[k] = undefined;
    P.t = time; P.carry = def.carry; P.grounded = !def.traits.flying; P.fly = def.traits.flying ? 1 : 0;
    poseJoints(def.sk, def.skeleton, def.gait, P, this.local);
    const joints = new Float32Array(JOINT_COUNT * 3);
    jointsToWorld(this.local, def.scale, facing, x, def.traits.flying ? 1.5 : 0, z, joints);
    return computeFrames(def.skeleton, joints, outFrames || new Float32Array(BONE_COUNT * 12));
  }

  drawParts(def, team, skin, frames, flash, tint, u, P) {
    const parts = this.look(def);
    const batch = this.batch;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      let rs = part.rs, t = part.t;
      if (u && part.showWhen === 'loaded' && u.attackT >= 0) {
        const p = u.attackT / u.attackDur;
        if (p > def.weapon.windup / u.attackDur && p < 0.92) continue;
      }
      if (u && (part.swing || part.spin)) {
        let E;
        if (part.swing) {
          const sw = part.swing;
          let k = P && P.anim ? swingCurve(sw.curve, P.ap, P.W) : 0;
          if (sw.charge && u.charging) k = Math.max(k, 1);
          E = axisRot(sw.axis, sw.amt * k, tmpE);
        } else {
          E = axisRot('y', (u.r ? u.r.wheel : 0) / part.spin, tmpE);
        }
        mul3(part.R, E, tmpR);
        rs = scaleCols(tmpR, part.size[0], part.size[1], part.size[2], tmpRS);
        mulVec3(tmpR, part.center, tmpV);
        tmpT[0] = part.pos[0] + tmpV[0]; tmpT[1] = part.pos[1] + tmpV[1]; tmpT[2] = part.pos[2] + tmpV[2];
        t = tmpT;
      }
      const c = this.color(part, team, skin);
      let r = c[0], g = c[1], b = c[2];
      if (flash > 0) { r += (1 - r) * flash; g += (1 - g) * flash; b += (1 - b) * flash; }
      if (tint) { r += (tint[0] - r) * tint[3]; g += (tint[1] - g) * tint[3]; b += (tint[2] - b) * tint[3]; }
      batch.add(batch.pool(part.shape, part.glow), frames, part.bone * 12, rs, t, r, g, b);
    }
  }

  // Projectiles & stuck debris: frame with y axis along the direction of travel.
  drawProjectile(kind, x, y, z, dx, dy, dz, spin) {
    const parts = this.projLooks[kind];
    if (!parts) return;
    const F = this.projFrame;
    const l = Math.hypot(dx, dy, dz) || 1;
    const yx = dx / l, yy = dy / l, yz = dz / l;
    // x axis: horizontal perpendicular
    let xx = yz, xy = 0, xz = -yx;
    let xl = Math.hypot(xx, xz);
    if (xl < 1e-4) { xx = 1; xz = 0; xl = 1; }
    xx /= xl; xz /= xl;
    const cs = Math.cos(spin), sn = Math.sin(spin);
    // z = x × y, then spin x/z around y
    let zx = xy * yz - xz * yy, zy = xz * yx - xx * yz, zz = xx * yy - xy * yx;
    const rxx = xx * cs + zx * sn, rxy = xy * cs + zy * sn, rxz = xz * cs + zz * sn;
    const rzx = zx * cs - xx * sn, rzy = zy * cs - xy * sn, rzz = zz * cs - xz * sn;
    F[0] = rxx; F[1] = rxy; F[2] = rxz; F[3] = yx; F[4] = yy; F[5] = yz; F[6] = rzx; F[7] = rzy; F[8] = rzz;
    F[9] = x; F[10] = y; F[11] = z;
    for (const p of parts) this.batch.add(this.batch.pool(p.shape, p.glow), F, 0, p.rs, p.t, p.color[0], p.color[1], p.color[2]);
  }
}

function makeProjectileLooks() {
  const mk = (list) => list.map(([shape, size, pos, color, glow]) => ({
    shape, glow: !!glow, color: lin(color), rs: scaleCols(rotXYZ(0, 0, 0), ...size), t: pos,
  }));
  return {
    arrow: mk([
      ['cylinder', [0.03, 0.8, 0.03], [0, -0.1, 0], 0x8b6a3e],
      ['cone', [0.06, 0.12, 0.06], [0, 0.34, 0], 0x888888],
      ['box', [0.12, 0.14, 0.01], [0, -0.44, 0], 0xf2f2f2],
    ]),
    spear: mk([
      ['cylinder', [0.045, 1.4, 0.045], [0, -0.3, 0], 0x8b6a3e],
      ['cone', [0.09, 0.22, 0.09], [0, 0.5, 0], 0x7a7a78],
    ]),
    rock: mk([['sphere', [0.24, 0.2, 0.22], [0, 0, 0], 0x8a8a84]]),
    boulder: mk([['sphere', [0.95, 0.85, 0.9], [0, 0, 0], 0x7d7a72], ['sphere', [0.5, 0.5, 0.5], [0.25, 0.2, 0.1], 0x6e6b63]]),
    rocket: mk([
      ['cylinder', [0.14, 0.6, 0.14], [0, 0, 0], 0x4a5a32],
      ['cone', [0.14, 0.2, 0.14], [0, 0.4, 0], 0xd94a2b],
      ['sphere', [0.16, 0.3, 0.16], [0, -0.4, 0], 0xffb13b, true],
    ]),
  };
}
