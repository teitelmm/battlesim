// Shared skeleton for every unit: 13 joints. Bipeds use them as a humanoid; quadrupeds
// reinterpret the arms as front legs and the legs as back legs. Everything here is pure
// math (no three.js) so the sim (ragdolls) and the renderer (posing) can both use it.
//
// Local frame convention: +x = unit's left, +y = up, +z = forward (matches three.js
// Object3D rotation.y, so facing angle θ maps local +z to world (sin θ, 0, cos θ)).

export const J = {
  head: 0, lSh: 1, rSh: 2, lHip: 3, rHip: 4,
  lElb: 5, lHand: 6, rElb: 7, rHand: 8,
  lKnee: 9, lFoot: 10, rKnee: 11, rFoot: 12,
};
export const JOINT_COUNT = 13;

export const BONES = ['torso', 'head', 'lUpper', 'lFore', 'rUpper', 'rFore', 'lThigh', 'lShin', 'rThigh', 'rShin'];
export const BONE = Object.fromEntries(BONES.map((b, i) => [b, i]));
export const BONE_COUNT = BONES.length;
// [proximal, distal] joints for limb bones (index matches BONES).
export const LIMB_JOINTS = [
  null, null,
  [J.lSh, J.lElb], [J.lElb, J.lHand], [J.rSh, J.rElb], [J.rElb, J.rHand],
  [J.lHip, J.lKnee], [J.lKnee, J.lFoot], [J.rHip, J.rKnee], [J.rKnee, J.rFoot],
];

export const SKELETONS = {
  biped: { hipY: 0.95, hipW: 0.11, shY: 1.42, shW: 0.21, headY: 1.74, upper: 0.3, fore: 0.28, thigh: 0.45, shin: 0.45 },
  quad: { bodyY: 1.05, halfW: 0.3, halfL: 0.6, upper: 0.48, fore: 0.48, thigh: 0.48, shin: 0.48, headY: 1.35, headZ: 1.0 },
};

// Ragdoll links: [a, b, stiffness, kind] where kind 0 = rigid distance, 1 = minimum distance only.
const BIPED_LINKS = [
  [J.head, J.lSh, 1, 0], [J.head, J.rSh, 1, 0], [J.lSh, J.rSh, 1, 0], [J.lHip, J.rHip, 1, 0],
  [J.lSh, J.lHip, 1, 0], [J.rSh, J.rHip, 1, 0], [J.lSh, J.rHip, 1, 0], [J.rSh, J.lHip, 1, 0],
  [J.head, J.lHip, 0.25, 0], [J.head, J.rHip, 0.25, 0],
  [J.lSh, J.lElb, 1, 0], [J.lElb, J.lHand, 1, 0], [J.rSh, J.rElb, 1, 0], [J.rElb, J.rHand, 1, 0],
  [J.lHip, J.lKnee, 1, 0], [J.lKnee, J.lFoot, 1, 0], [J.rHip, J.rKnee, 1, 0], [J.rKnee, J.rFoot, 1, 0],
  [J.lHip, J.lFoot, 1, 1], [J.rHip, J.rFoot, 1, 1], [J.lSh, J.lHand, 1, 1], [J.rSh, J.rHand, 1, 1],
];
const QUAD_LINKS = [
  [J.lSh, J.rSh, 1, 0], [J.lHip, J.rHip, 1, 0], [J.lSh, J.lHip, 1, 0], [J.rSh, J.rHip, 1, 0],
  [J.lSh, J.rHip, 1, 0], [J.rSh, J.lHip, 1, 0],
  [J.head, J.lSh, 1, 0], [J.head, J.rSh, 1, 0], [J.head, J.lHip, 0.5, 0], [J.head, J.rHip, 0.5, 0],
  [J.lSh, J.lElb, 1, 0], [J.lElb, J.lHand, 1, 0], [J.rSh, J.rElb, 1, 0], [J.rElb, J.rHand, 1, 0],
  [J.lHip, J.lKnee, 1, 0], [J.lKnee, J.lFoot, 1, 0], [J.rHip, J.rKnee, 1, 0], [J.rKnee, J.rFoot, 1, 0],
  [J.lSh, J.lHand, 1, 1], [J.rSh, J.rHand, 1, 1], [J.lHip, J.lFoot, 1, 1], [J.rHip, J.rFoot, 1, 1],
];
export const RAGDOLL_LINKS = { biped: BIPED_LINKS, quad: QUAD_LINKS };

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (t) => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;

// ---------------------------------------------------------------------------
// Attack animations: keyframes on the attack's normalized time. `W` = the moment the
// weapon fires (windup / duration). Fields: rP/lP shoulder pitch (0 = hanging, + forward),
// rB/lB elbow bend, rS/lS arm spread, lean (upper body), twist, nod, crouch.
// ---------------------------------------------------------------------------
const AIM = { rP: 1.25, rB: 0.55, lP: 1.45, lB: 0.15, lS: -0.35 };
export const CARRY = {
  none: {},
  chop: { rP: 0.35, rB: 1.0 },
  thrust: { rP: 0.3, rB: 1.1 },
  dual: { rP: 0.35, rB: 1.0, lP: 0.35, lB: 1.0 },
  shield: { rP: 0.35, rB: 1.0, lP: 0.9, lB: 0.7, lS: -0.2 },
  throw: { rP: 0.35, rB: 1.2 },
  bow: { lP: 0.25, lB: 0.2 },
  aim: { rP: 0.6, rB: 1.0, lP: 0.9, lB: 0.7, lS: -0.3 },
  punch: { rP: 0.7, rB: 1.8, lP: 0.7, lB: 1.8 },
  slam: { rP: 0.2, rB: 0.4, lP: 0.2, lB: 0.4, rS: 0.25, lS: 0.25 },
  cast: { rP: 0.3, rB: 0.9 },
  beam: { rP: 0.05, lP: 0.05, rS: 0.25, lS: 0.25 },
  minigun: { rP: 1.4, rB: 0.1, lP: 0.3, lB: 0.6 },
  gore: {},
  mount: {},
};
const ANIMS = {
  chop: (W) => [[0, 'carry'], [W, { rP: 2.8, rB: 0.5, lean: -0.12, twist: -0.25 }], [W + 0.08, { rP: 0.2, rB: 0.05, lean: 0.28, twist: 0.3 }], [1, 'carry']],
  thrust: (W) => [[0, 'carry'], [W, { rP: 0.1, rB: 1.7, lean: -0.1, twist: -0.3 }], [W + 0.07, { rP: 1.5, rB: 0, lean: 0.25, twist: 0.25 }], [1, 'carry']],
  dual: (W) => [[0, 'carry'], [W, { rP: 2.7, rB: 0.5, lP: 0.3, lB: 0.8, lean: -0.1, twist: -0.2 }], [W + 0.08, { rP: 0.3, rB: 0, lP: 2.6, lB: 0.5, lean: 0.25, twist: 0.25 }], [W + 0.2, { rP: 0.4, rB: 0.6, lP: 0.3, lB: 0, lean: 0.2, twist: -0.1 }], [1, 'carry']],
  shield: (W) => ANIMS.chop(W),
  throw: (W) => [[0, 'carry'], [W * 0.8, { rP: 3.3, rB: 0.6, lP: 1.2, lB: 0.2, lean: -0.15, twist: -0.4 }], [W + 0.06, { rP: 1.3, rB: 0, lP: 0.2, lean: 0.25, twist: 0.35 }], [1, 'carry']],
  bow: (W) => [[0, 'carry'], [W * 0.6, { lP: 1.55, lB: 0, rP: 1.45, rB: 1.9, twist: -0.25 }], [W, { lP: 1.55, lB: 0, rP: 1.45, rB: 2.1, twist: -0.25 }], [W + 0.05, { lP: 1.55, lB: 0, rP: 1.2, rB: 0.9, twist: -0.2 }], [1, 'carry']],
  aim: (W) => [[0, 'carry'], [W * 0.6, AIM], [W, AIM], [W + 0.03, { ...AIM, rP: 1.4, lP: 1.6, lean: -0.1 }], [W + 0.2, AIM], [1, AIM]],
  punchR: (W) => [[0, 'carry'], [W, { rP: 0.8, rB: 2.0, twist: -0.3 }], [W + 0.07, { rP: 1.55, rB: 0.05, twist: 0.4, lean: 0.15 }], [1, 'carry']],
  punchL: (W) => [[0, 'carry'], [W, { lP: 0.8, lB: 2.0, twist: 0.3 }], [W + 0.07, { lP: 1.55, lB: 0.05, twist: -0.4, lean: 0.15 }], [1, 'carry']],
  slam: (W) => [[0, 'carry'], [W, { rP: 2.9, rB: 0.3, lP: 2.9, lB: 0.3, lean: -0.2 }], [W + 0.08, { rP: 0.9, rB: 0.1, lP: 0.9, lB: 0.1, lean: 0.35, crouch: 0.5 }], [1, 'carry']],
  cast: (W) => [[0, 'carry'], [W, { rP: 2.6, rB: 0.2, lP: 2.6, lB: 0.2, lean: -0.1 }], [W + 0.2, { rP: 2.3, lP: 2.3 }], [1, 'carry']],
  beam: (W) => [[0, 'carry'], [W, { lean: -0.18, nod: 0.12, rS: 0.6, lS: 0.6, rP: -0.25, lP: -0.25, crouch: 0.2 }], [0.95, { lean: -0.18, nod: 0.12, rS: 0.6, lS: 0.6, rP: -0.25, lP: -0.25, crouch: 0.2 }], [1, 'carry']],
  minigun: (W) => [[0, 'carry'], [W, CARRY.minigun], [1, 'carry']],
  gore: (W) => [[0, 'carry'], [W, { nod: -0.5, lean: -0.1 }], [W + 0.1, { nod: 0.6, lean: 0.2 }], [1, 'carry']],
  mount: (W) => [[0, 'carry'], [1, 'carry']],
};
const POSE_KEYS = ['rP', 'rB', 'rS', 'lP', 'lB', 'lS', 'lean', 'twist', 'nod', 'crouch'];

function sampleAnim(keys, carry, p, out) {
  let i = 0;
  while (i < keys.length - 2 && p > keys[i + 1][0]) i++;
  const [t0, a0] = keys[i];
  const [t1, a1] = keys[i + 1];
  const k = smooth(clamp01(t1 > t0 ? (p - t0) / (t1 - t0) : 1));
  const A = a0 === 'carry' ? carry : a0;
  const B = a1 === 'carry' ? carry : a1;
  for (const key of POSE_KEYS) {
    const va = A[key] ?? carry[key] ?? 0;
    const vb = B[key] ?? carry[key] ?? 0;
    out[key] = lerp(va, vb, k);
  }
}

// Curve used by part "swing" hooks (catapult arm, lance): 0 = rest, 1 = fully swung.
export function swingCurve(kind, p, W) {
  if (p < 0) return 0;
  if (kind === 'snap') {
    if (p < W) return 0;
    if (p < W + 0.06) return (p - W) / 0.06;
    return 1 - smooth(clamp01((p - W - 0.06) / (1 - W - 0.06)));
  }
  // 'wind': rises through windup, holds, then returns.
  if (p < W) return smooth(p / W);
  if (p < W + 0.15) return 1;
  return 1 - smooth(clamp01((p - W - 0.15) / (1 - W - 0.15)));
}

// ---------------------------------------------------------------------------
// Pose inputs (all optional): walk (phase rad), walkAmt 0..1, t (seconds), anim (name),
// ap (attack progress 0..1 or <0), W (fire moment), count (attack counter), air 0..1,
// fly 0..1, cheer 0..1, stun 0..1, tiltX/tiltZ (wobble radians), grounded (bool),
// charge (bool), carry (carry style).
// Output: local joint positions (unscaled) into `out` (Float32Array(39)).
// ---------------------------------------------------------------------------
const tmpPose = {};

export function poseJoints(sk, type, gait, P, out) {
  if (type === 'quad') poseQuad(sk, gait, P, out);
  else poseBiped(sk, P, out);
  return out;
}

function set(out, j, x, y, z) {
  out[j * 3] = x; out[j * 3 + 1] = y; out[j * 3 + 2] = z;
}

function poseBiped(sk, P, out) {
  const carryName = P.carry || 'none';
  const carry = CARRY[carryName] || CARRY.none;
  const a = tmpPose;
  if (P.anim && P.ap >= 0) {
    let name = P.anim;
    if (name === 'punch') name = (P.count & 1) ? 'punchL' : 'punchR';
    sampleAnim((ANIMS[name] || ANIMS.chop)(P.W ?? 0.4), carry, P.ap, a);
  } else {
    for (const key of POSE_KEYS) a[key] = carry[key] ?? 0;
    if (P.aiming && carryName === 'aim') Object.assign(a, AIM);
  }
  const t = P.t || 0;
  const walk = P.walk || 0;
  const wa = P.walkAmt || 0;
  const air = P.air || 0;
  const fly = P.fly || 0;
  const cheer = P.cheer || 0;

  // Legs: swing opposite, bend the knee on the forward swing.
  const sw = Math.sin(walk) * 0.65 * wa;
  let lTh = sw, rTh = -sw;
  let lKn = wa * (0.15 + 0.75 * Math.max(0, Math.cos(walk)));
  let rKn = wa * (0.15 + 0.75 * Math.max(0, -Math.cos(walk)));
  // Arms not busy with a weapon swing opposite to legs.
  const armSwing = Math.sin(walk) * 0.55 * wa;
  if (carry.lP === undefined) a.lP += -armSwing;
  if (carry.rP === undefined && !(P.anim && P.ap >= 0)) a.rP += armSwing;

  let lean = a.lean + wa * 0.12;
  const crouch = a.crouch;
  if (crouch) { lTh += crouch * 0.6; rTh += crouch * 0.6; lKn += crouch * 1.2; rKn += crouch * 1.2; lean += crouch * 0.3; }

  // Idle breathing.
  const breath = Math.sin(t * 2.2) * 0.02;
  a.rS += 0.08 + breath; a.lS += 0.08 + breath;

  // Airborne flail: windmill arms and bicycle legs.
  if (air > 0) {
    const f = t * 14;
    a.rP = lerp(a.rP, 2.4 + Math.sin(f) * 0.9, air); a.rB = lerp(a.rB, 0.6, air); a.rS = lerp(a.rS, 0.6, air);
    a.lP = lerp(a.lP, 2.4 + Math.cos(f) * 0.9, air); a.lB = lerp(a.lB, 0.6, air); a.lS = lerp(a.lS, 0.6, air);
    lTh = lerp(lTh, Math.sin(f * 0.8) * 0.8, air); rTh = lerp(rTh, -Math.sin(f * 0.8) * 0.8, air);
    lKn = lerp(lKn, 0.8, air); rKn = lerp(rKn, 0.8, air);
  }
  // Cheering winners jump with both fists up.
  if (cheer > 0) {
    const c = Math.abs(Math.sin(t * 7));
    a.rP = lerp(a.rP, 2.9 + c * 0.2, cheer); a.rB = lerp(a.rB, 0.3, cheer); a.rS = lerp(a.rS, 0.35, cheer);
    a.lP = lerp(a.lP, 2.9 + c * 0.2, cheer); a.lB = lerp(a.lB, 0.3, cheer); a.lS = lerp(a.lS, 0.35, cheer);
  }
  // Flying (superman pose): legs trail straight, one arm forward.
  if (fly > 0) {
    lTh = lerp(lTh, Math.sin(t * 3) * 0.08, fly); rTh = lerp(rTh, -Math.sin(t * 3) * 0.08 - 0.12, fly);
    lKn = lerp(lKn, 0.05, fly); rKn = lerp(rKn, 0.35, fly);
    if (!(P.anim && P.ap >= 0)) { a.rP = lerp(a.rP, Math.PI, fly); a.rB = lerp(a.rB, 0, fly); a.rS = lerp(a.rS, 0.1, fly); }
    a.lP = lerp(a.lP, 0.1, fly); a.lB = lerp(a.lB, 0.2, fly);
  }
  if (P.stun > 0) { lean += Math.sin(t * 9) * 0.25 * P.stun; a.nod += Math.sin(t * 11) * 0.4 * P.stun; }

  // Upper body in torso space (origin = hip centre), rotated by lean/twist.
  const upY = sk.shY - sk.hipY;
  const cl = Math.cos(lean), sl = Math.sin(lean);
  const ct = Math.cos(a.twist), st = Math.sin(a.twist);
  const torsoPt = (j, x, y, z) => {
    // twist about y, then lean about x
    const x1 = x * ct + z * st, z1 = -x * st + z * ct;
    const y2 = y * cl - z1 * sl, z2 = y * sl + z1 * cl;
    set(out, j, x1, y2, z2);
  };
  torsoPt(J.lSh, sk.shW, upY, 0);
  torsoPt(J.rSh, -sk.shW, upY, 0);
  const nod = a.nod;
  torsoPt(J.head, 0, sk.headY - sk.hipY - Math.abs(nod) * 0.04, nod * 0.12);
  // Arms: direction vectors in torso space, then rotated with the torso.
  const arm = (side, jSh, jElb, jHand, pitch, bend, spread) => {
    const sx = out[jSh * 3], sy = out[jSh * 3 + 1], sz = out[jSh * 3 + 2];
    const dir = (ph, sp) => {
      const cs = Math.cos(sp);
      let x = side * Math.sin(sp), y = -Math.cos(ph) * cs, z = Math.sin(ph) * cs;
      const x1 = x * ct + z * st, z1 = -x * st + z * ct;
      return [x1, y * cl - z1 * sl, y * sl + z1 * cl];
    };
    const d1 = dir(pitch, spread);
    const ex = sx + d1[0] * sk.upper, ey = sy + d1[1] * sk.upper, ez = sz + d1[2] * sk.upper;
    set(out, jElb, ex, ey, ez);
    const d2 = dir(pitch + bend, spread * 0.5);
    set(out, jHand, ex + d2[0] * sk.fore, ey + d2[1] * sk.fore, ez + d2[2] * sk.fore);
  };
  arm(1, J.lSh, J.lElb, J.lHand, a.lP, a.lB, a.lS);
  arm(-1, J.rSh, J.rElb, J.rHand, a.rP, a.rB, a.rS);

  // Legs in root space (origin = hip centre).
  const leg = (side, jHip, jKnee, jFoot, th, kn) => {
    const hx = side * sk.hipW;
    set(out, jHip, hx, 0, 0);
    const kx = hx + side * 0.02, ky = -Math.cos(th) * sk.thigh, kz = Math.sin(th) * sk.thigh;
    set(out, jKnee, kx, ky, kz);
    const sp = th - kn;
    set(out, jFoot, kx + side * 0.01, ky - Math.cos(sp) * sk.shin, kz + Math.sin(sp) * sk.shin);
  };
  leg(1, J.lHip, J.lKnee, J.lFoot, lTh, lKn);
  leg(-1, J.rHip, J.rKnee, J.rFoot, rTh, rKn);

  // Whole-body pitch (flying = horizontal).
  const bodyPitch = fly * 1.35;
  if (bodyPitch) rotateAll(out, bodyPitch, 0, 0, 0);

  // Place the pelvis: grounded units keep their lowest foot on the floor.
  let py = sk.hipY;
  if (P.grounded !== false && fly === 0) {
    const minFoot = Math.min(out[J.lFoot * 3 + 1], out[J.rFoot * 3 + 1]);
    py = 0.05 - minFoot;
    if (cheer > 0) py += Math.abs(Math.sin(t * 7)) * 0.35 * cheer;
  } else if (fly > 0) {
    py = 0.9;
  }
  for (let j = 0; j < JOINT_COUNT; j++) out[j * 3 + 1] += py;

  applyTilt(out, P.tiltX || 0, P.tiltZ || 0);
}

function poseQuad(sk, gait, P, out) {
  const wa = gait === 'wheels' ? 0 : (P.walkAmt || 0);
  const walk = P.walk || 0;
  const t = P.t || 0;
  const air = P.air || 0;
  // Attack: head gore / lunge.
  let nod = 0, lunge = 0;
  if (P.anim && P.ap >= 0 && P.anim !== 'mount') {
    const a = tmpPose;
    sampleAnim(ANIMS.gore(P.W ?? 0.4), CARRY.gore, P.ap, a);
    nod = a.nod; lunge = a.lean;
  }
  const bodyY = sk.bodyY;
  const bob = gait === 'wheels' ? 0 : Math.abs(Math.sin(walk)) * 0.04 * wa + Math.sin(t * 2) * 0.01;
  set(out, J.lSh, sk.halfW, bodyY + bob, sk.halfL + lunge * 0.3);
  set(out, J.rSh, -sk.halfW, bodyY + bob, sk.halfL + lunge * 0.3);
  set(out, J.lHip, sk.halfW, bodyY + bob, -sk.halfL);
  set(out, J.rHip, -sk.halfW, bodyY + bob, -sk.halfL);
  set(out, J.head, 0, sk.headY + bob + nod * 0.35, sk.headZ + lunge * 0.4 + Math.abs(nod) * 0.1);
  // Diagonal gait: front-left with back-right.
  const leg = (jTop, jMid, jFoot, phase) => {
    const x = out[jTop * 3], y = out[jTop * 3 + 1], z = out[jTop * 3 + 2];
    let th = Math.sin(walk + phase) * 0.45 * wa;
    let kn = wa * 0.6 * Math.max(0, Math.cos(walk + phase));
    if (air > 0) { th = lerp(th, Math.sin(t * 12 + phase) * 0.7, air); kn = lerp(kn, 0.5, air); }
    const mx = x, my = y - Math.cos(th) * sk.upper, mz = z + Math.sin(th) * sk.upper;
    set(out, jMid, mx, my, mz);
    const sp = th - kn;
    set(out, jFoot, mx, my - Math.cos(sp) * sk.fore, mz + Math.sin(sp) * sk.fore);
  };
  leg(J.lSh, J.lElb, J.lHand, 0);
  leg(J.rSh, J.rElb, J.rHand, Math.PI);
  leg(J.lHip, J.lKnee, J.lFoot, Math.PI);
  leg(J.rHip, J.rKnee, J.rFoot, 0);
  if (P.grounded !== false) {
    let minFoot = Infinity;
    for (const j of [J.lHand, J.rHand, J.lFoot, J.rFoot]) minFoot = Math.min(minFoot, out[j * 3 + 1]);
    const dy = 0.05 - minFoot;
    for (let j = 0; j < JOINT_COUNT; j++) out[j * 3 + 1] += dy;
  }
  applyTilt(out, P.tiltX || 0, P.tiltZ || 0);
}

// Rotate all joints about the x axis (pitch forward) around pivot (0, py, pz).
function rotateAll(out, pitch, roll, py, pz) {
  const c = Math.cos(pitch), s = Math.sin(pitch);
  const cr = Math.cos(roll), sr = Math.sin(roll);
  for (let j = 0; j < JOINT_COUNT; j++) {
    let x = out[j * 3], y = out[j * 3 + 1] - py, z = out[j * 3 + 2] - pz;
    const y1 = y * c - z * s, z1 = y * s + z * c;
    const x2 = x * cr + y1 * sr, y2 = -x * sr + y1 * cr;
    out[j * 3] = x2; out[j * 3 + 1] = y2 + py; out[j * 3 + 2] = z1 + pz;
  }
}

// Wobble tilt around the feet (ground origin).
function applyTilt(out, tx, tz) {
  if (tx === 0 && tz === 0) return;
  rotateAll(out, tx, tz, 0, 0);
}

// Rest-pose joints (unscaled local) for building ragdolls.
export function restJoints(sk, type, out = new Float32Array(JOINT_COUNT * 3)) {
  return poseJoints(sk, type, 'walk', { grounded: true }, out);
}

// ---------------------------------------------------------------------------
// Bone frames from world-space joints. Each frame is 12 floats: x axis, y axis, z axis,
// origin. Torso/head axes: x = left, y = up, z = forward. Limb frames: y points from
// the distal joint toward the proximal joint (i.e. "up" in rest pose), x = torso left.
// ---------------------------------------------------------------------------
const v = new Float32Array(12);

function norm3(a, o) {
  const l = Math.hypot(a[o], a[o + 1], a[o + 2]) || 1;
  a[o] /= l; a[o + 1] /= l; a[o + 2] /= l;
}

export function computeFrames(type, jt, out) {
  const g = (j, k) => jt[j * 3 + k];
  // L0 = (lSh - rSh) + (lHip - rHip)
  let lx = g(J.lSh, 0) - g(J.rSh, 0) + g(J.lHip, 0) - g(J.rHip, 0);
  let ly = g(J.lSh, 1) - g(J.rSh, 1) + g(J.lHip, 1) - g(J.rHip, 1);
  let lz = g(J.lSh, 2) - g(J.rSh, 2) + g(J.lHip, 2) - g(J.rHip, 2);
  let ux, uy, uz, fx, fy, fz, ox, oy, oz;
  if (type === 'quad') {
    fx = (g(J.lSh, 0) + g(J.rSh, 0) - g(J.lHip, 0) - g(J.rHip, 0));
    fy = (g(J.lSh, 1) + g(J.rSh, 1) - g(J.lHip, 1) - g(J.rHip, 1));
    fz = (g(J.lSh, 2) + g(J.rSh, 2) - g(J.lHip, 2) - g(J.rHip, 2));
    let l = Math.hypot(fx, fy, fz) || 1; fx /= l; fy /= l; fz /= l;
    // U = F x L0
    ux = fy * lz - fz * ly; uy = fz * lx - fx * lz; uz = fx * ly - fy * lx;
    l = Math.hypot(ux, uy, uz) || 1; ux /= l; uy /= l; uz /= l;
    ox = (g(J.lSh, 0) + g(J.rSh, 0) + g(J.lHip, 0) + g(J.rHip, 0)) / 4;
    oy = (g(J.lSh, 1) + g(J.rSh, 1) + g(J.lHip, 1) + g(J.rHip, 1)) / 4;
    oz = (g(J.lSh, 2) + g(J.rSh, 2) + g(J.lHip, 2) + g(J.rHip, 2)) / 4;
  } else {
    ox = (g(J.lHip, 0) + g(J.rHip, 0)) / 2; oy = (g(J.lHip, 1) + g(J.rHip, 1)) / 2; oz = (g(J.lHip, 2) + g(J.rHip, 2)) / 2;
    ux = (g(J.lSh, 0) + g(J.rSh, 0)) / 2 - ox; uy = (g(J.lSh, 1) + g(J.rSh, 1)) / 2 - oy; uz = (g(J.lSh, 2) + g(J.rSh, 2)) / 2 - oz;
    let l = Math.hypot(ux, uy, uz) || 1; ux /= l; uy /= l; uz /= l;
    // F = L0 x U
    fx = ly * uz - lz * uy; fy = lz * ux - lx * uz; fz = lx * uy - ly * ux;
    l = Math.hypot(fx, fy, fz) || 1; fx /= l; fy /= l; fz /= l;
  }
  // L = U x F (re-orthogonalised)
  lx = uy * fz - uz * fy; ly = uz * fx - ux * fz; lz = ux * fy - uy * fx;
  if (type === 'quad') {
    // F = L x U to make sure the frame is orthonormal
    fx = ly * uz - lz * uy; fy = lz * ux - lx * uz; fz = lx * uy - ly * ux;
  }
  writeFrame(out, 0, lx, ly, lz, ux, uy, uz, fx, fy, fz, ox, oy, oz);
  writeFrame(out, 1, lx, ly, lz, ux, uy, uz, fx, fy, fz, g(J.head, 0), g(J.head, 1), g(J.head, 2));
  for (let b = 2; b < BONE_COUNT; b++) {
    const [pj, dj] = LIMB_JOINTS[b];
    v[3] = g(pj, 0) - g(dj, 0); v[4] = g(pj, 1) - g(dj, 1); v[5] = g(pj, 2) - g(dj, 2);
    norm3(v, 3);
    const yx = v[3], yy = v[4], yz = v[5];
    let d = lx * yx + ly * yy + lz * yz;
    let xx = lx - d * yx, xy = ly - d * yy, xz = lz - d * yz;
    let xl = Math.hypot(xx, xy, xz);
    if (xl < 1e-3) {
      d = fx * yx + fy * yy + fz * yz;
      xx = fx - d * yx; xy = fy - d * yy; xz = fz - d * yz; xl = Math.hypot(xx, xy, xz) || 1;
    }
    xx /= xl; xy /= xl; xz /= xl;
    // z = x × y
    const zx = xy * yz - xz * yy, zy = xz * yx - xx * yz, zz = xx * yy - xy * yx;
    writeFrame(out, b, xx, xy, xz, yx, yy, yz, zx, zy, zz, g(pj, 0), g(pj, 1), g(pj, 2));
  }
  return out;
}

function writeFrame(out, b, xx, xy, xz, yx, yy, yz, zx, zy, zz, px, py, pz) {
  const o = b * 12;
  out[o] = xx; out[o + 1] = xy; out[o + 2] = xz;
  out[o + 3] = yx; out[o + 4] = yy; out[o + 5] = yz;
  out[o + 6] = zx; out[o + 7] = zy; out[o + 8] = zz;
  out[o + 9] = px; out[o + 10] = py; out[o + 11] = pz;
}

// Transform local (unscaled) joints to world: scale, rotate by facing, translate.
export function jointsToWorld(local, scale, facing, x, y, z, out) {
  const c = Math.cos(facing), s = Math.sin(facing);
  for (let j = 0; j < JOINT_COUNT; j++) {
    const lx = local[j * 3] * scale, ly = local[j * 3 + 1] * scale, lz = local[j * 3 + 2] * scale;
    // world = P + lx*L + ly*U + lz*F, L = (c,0,-s), F = (s,0,c)
    out[j * 3] = x + lx * c + lz * s;
    out[j * 3 + 1] = y + ly;
    out[j * 3 + 2] = z - lx * s + lz * c;
  }
  return out;
}
