// Visual definitions: every unit is a list of primitive parts attached to skeleton bones.
// Part: { bone, shape, size:[x,y,z], pos:[x,y,z], rot:[rx,ry,rz] (applied X then Y then Z),
//         color (hex or token), glow?, center?, swing?, spin?, showWhen? }
// Sizes/positions are unscaled; the renderer multiplies by the unit's scale.
// Colour tokens: team, teamDark, teamLight, skin, hair, horse, metal, dark.
const PI = Math.PI;

const P = (bone, shape, size, pos, color, extra) => ({ bone, shape, size, pos, rot: [0, 0, 0], color, ...extra });

// ------------------------------------------------------------------ biped basics
function body(o = {}) {
  const {
    skin = 'skin', shirt = 'team', pants = 0x4d4034, pantsLower = null, shoes = 0x33261c,
    sleeves = null, forearms = null, gloves = null, bulk = 1, head = 'skin', eyes = true, belt = null,
  } = o;
  const parts = [
    P('torso', 'capsule', [0.44 * bulk, 0.62, 0.3 * bulk], [0, 0.27, 0], shirt),
    P('torso', 'box', [0.36 * bulk, 0.16, 0.27 * bulk], [0, 0.03, 0], pants),
    P('head', 'sphere', [0.42, 0.42, 0.42], [0, 0, 0], head),
  ];
  if (belt) parts.push(P('torso', 'box', [0.4 * bulk, 0.06, 0.3 * bulk], [0, 0.11, 0], belt));
  if (eyes) {
    parts.push(P('head', 'sphere', [0.06, 0.08, 0.05], [0.075, 0.03, 0.185], 0x1a1a1a));
    parts.push(P('head', 'sphere', [0.06, 0.08, 0.05], [-0.075, 0.03, 0.185], 0x1a1a1a));
  }
  for (const s of ['l', 'r']) {
    parts.push(
      P(`${s}Upper`, 'capsule', [0.13 * bulk, 0.34, 0.13 * bulk], [0, -0.15, 0], sleeves ?? skin),
      P(`${s}Fore`, 'capsule', [0.12 * bulk, 0.3, 0.12 * bulk], [0, -0.13, 0], forearms ?? sleeves ?? skin),
      P(`${s}Fore`, 'sphere', [0.14 * bulk, 0.14 * bulk, 0.14 * bulk], [0, -0.29, 0], gloves ?? skin),
      P(`${s}Thigh`, 'capsule', [0.17 * bulk, 0.5, 0.17 * bulk], [0, -0.22, 0], pants),
      P(`${s}Shin`, 'capsule', [0.15 * bulk, 0.48, 0.15 * bulk], [0, -0.22, 0], pantsLower ?? pants),
      P(`${s}Shin`, 'box', [0.15, 0.09, 0.27], [0, -0.43, 0.06], shoes),
    );
  }
  return parts;
}

const hair = (color = 'hair', shaggy = false) => shaggy
  ? [P('head', 'sphere', [0.47, 0.38, 0.48], [0, 0.08, -0.04], color), P('head', 'sphere', [0.3, 0.2, 0.2], [0, -0.13, 0.12], color)]
  : [P('head', 'sphere', [0.44, 0.28, 0.45], [0, 0.1, -0.03], color)];
const headband = (c = 'team') => [P('head', 'cylinder', [0.45, 0.07, 0.45], [0, 0.07, 0], c)];
const R_HAND = [0, -0.29, 0];
const at = (base, dx, dy, dz) => [base[0] + dx, base[1] + dy, base[2] + dz];

// Held along the forearm frame's z axis (the classic "weapon points up/forward" grip).
function heldZ(bone, shape, size, len, from, color, extra = {}) {
  return P(bone, shape, [size, len, size], at(R_HAND, 0, 0, from + len / 2), color, { rot: [PI / 2, 0, 0], ...extra });
}

// ------------------------------------------------------------------ weapons
const club = () => [
  heldZ('rFore', 'cylinder', 0.07, 0.55, -0.05, 0x7a4a26),
  P('rFore', 'sphere', [0.19, 0.22, 0.19], at(R_HAND, 0, 0, 0.5), 0x6b3f1f),
];
const spear = (tip = 0x9a9a9a) => [
  heldZ('rFore', 'cylinder', 0.04, 1.4, -0.45, 0x8b6a3e),
  P('rFore', 'cone', [0.08, 0.2, 0.08], at(R_HAND, 0, 0, 1.03), tip, { rot: [PI / 2, 0, 0] }),
];
const rockInHand = () => [P('rFore', 'sphere', [0.17, 0.15, 0.17], at(R_HAND, 0, 0, 0.05), 0x8a8a84)];
const staff = () => [
  heldZ('rFore', 'cylinder', 0.05, 1.5, -0.55, 0x6b4b2a),
  P('rFore', 'sphere', [0.16, 0.16, 0.16], at(R_HAND, 0, 0, 0.98), 0x7dff9a, { glow: true }),
  P('rFore', 'cone', [0.05, 0.25, 0.05], at(R_HAND, 0.06, 0.02, 1.02), 0xe8e0c8, { rot: [PI / 2, 0, 0.4] }),
];
const sword = (blade = 0xd4d8e0) => [
  P('rFore', 'box', [0.06, 0.75, 0.025], at(R_HAND, 0, 0, 0.48), blade, { rot: [PI / 2, 0, 0] }),
  P('rFore', 'box', [0.24, 0.05, 0.05], at(R_HAND, 0, 0, 0.1), 0xc9a13b),
];
const axe = (side) => [
  P(`${side}Fore`, 'cylinder', [0.05, 0.6, 0.05], at(R_HAND, 0, 0, 0.22), 0x7a4a26, { rot: [PI / 2, 0, 0] }),
  P(`${side}Fore`, 'box', [0.04, 0.26, 0.2], at(R_HAND, 0, 0.1, 0.45), 0xb8bcc4, { rot: [PI / 2, 0, 0] }),
];
const roundShield = (c = 'team') => [
  P('lFore', 'cylinder', [0.6, 0.06, 0.6], [0.02, -0.2, 0], c),
  P('lFore', 'cylinder', [0.64, 0.04, 0.64], [0.02, -0.18, 0], 0x8a6a3a),
  P('lFore', 'sphere', [0.14, 0.1, 0.14], [0.02, -0.25, 0], 0xc9a13b),
];
const bow = () => [
  P('lFore', 'arc', [1.1, 0.5, 1], [0, -0.03, 0], 0x7a4a26, { rot: [PI, -PI / 2, 0] }),
  P('lFore', 'box', [0.012, 0.012, 1.1], [0, -0.03, 0], 0xeeeeee),
];
const quiver = () => [
  P('torso', 'cylinder', [0.14, 0.5, 0.14], [0.1, 0.38, -0.2], 0x6b4b2a, { rot: [0.35, 0, 0.3] }),
  P('torso', 'cone', [0.12, 0.12, 0.12], [0.16, 0.66, -0.3], 0xeeeeee, { rot: [0.35, 0, 0.3] }),
];
// Guns point along the forearm (frame -y), since aim poses keep the forearm level.
function gun({ body = 0x2d2f33, len = 0.7, barrel = 0.35, barrelColor = 0x1c1d20, stock = true, glowTip = null, scope = false, bodyW = 0.08 }) {
  const y0 = -0.29;
  const parts = [
    P('rFore', 'box', [bodyW, len, 0.13], [0, y0 - len / 2 + 0.12, 0.03], body),
    P('rFore', 'cylinder', [0.045, barrel, 0.045], [0, y0 - len + 0.12 - barrel / 2, 0.05], barrelColor),
    P('rFore', 'box', [0.05, 0.14, 0.09], [0, y0 - 0.2, -0.09], barrelColor),
  ];
  if (stock) parts.push(P('rFore', 'box', [0.07, 0.24, 0.15], [0, y0 + 0.16, -0.01], body));
  if (glowTip) parts.push(P('rFore', 'sphere', [0.08, 0.08, 0.08], [0, y0 - len + 0.12 - barrel, 0.05], glowTip, { glow: true }));
  if (scope) parts.push(P('rFore', 'cylinder', [0.07, 0.28, 0.07], [0, y0 - 0.2, 0.13], 0x111111));
  return parts;
}

// ------------------------------------------------------------------ riders (static, seated)
function rider(seat, k, o) {
  const { shirt = 'team', skin = 'skin', pants = 0x4d4034, arms = 'skin', extra = [] } = o;
  const T = (shape, size, pos, color, ex = {}) => P('torso', shape, size.map((s) => s * k), pos.map((p, i) => seat[i] + p * k), color, ex);
  return [
    T('box', [0.36, 0.16, 0.27], [0, 0.02, 0], pants),
    T('capsule', [0.44, 0.62, 0.3], [0, 0.3, 0], shirt),
    T('sphere', [0.42, 0.42, 0.42], [0, 0.82, 0.02], skin),
    T('sphere', [0.06, 0.08, 0.05], [0.075, 0.85, 0.2], 0x1a1a1a),
    T('sphere', [0.06, 0.08, 0.05], [-0.075, 0.85, 0.2], 0x1a1a1a),
    T('capsule', [0.17, 0.48, 0.17], [0.2, -0.05, 0.16], pants, { rot: [1.25, 0, 0] }),
    T('capsule', [0.17, 0.48, 0.17], [-0.2, -0.05, 0.16], pants, { rot: [1.25, 0, 0] }),
    T('capsule', [0.15, 0.45, 0.15], [0.26, -0.32, 0.32], pants, { rot: [0.1, 0, 0.15] }),
    T('capsule', [0.15, 0.45, 0.15], [-0.26, -0.32, 0.32], pants, { rot: [0.1, 0, -0.15] }),
    T('capsule', [0.13, 0.34, 0.13], [0.25, 0.42, 0.1], arms, { rot: [0.7, 0, 0.1] }),
    T('capsule', [0.13, 0.34, 0.13], [-0.25, 0.42, 0.1], arms, { rot: [0.7, 0, -0.1] }),
    T('capsule', [0.12, 0.3, 0.12], [0.25, 0.32, 0.33], arms, { rot: [1.5, 0, 0] }),
    T('capsule', [0.12, 0.3, 0.12], [-0.25, 0.32, 0.33], arms, { rot: [1.5, 0, 0] }),
    ...extra.map((e) => T(e.shape, e.size, e.pos, e.color, e.extra || {})),
  ];
}

// ------------------------------------------------------------------ per-unit looks
const LOOKS = {
  clubber: () => [
    ...body({ shirt: 'team', pants: 0x8a5a2b, shoes: 0x5a3a1e }),
    ...hair(0x3b2412, true), ...headband(), ...club(),
  ],
  spear_thrower: () => [
    ...body({ shirt: 'team', pants: 0x8a5a2b, shoes: 0x5a3a1e }),
    ...hair(0x2a1a0e, true), ...headband(), ...spear(0x7a7a78),
  ],
  rock_slinger: () => [
    ...body({ shirt: 'teamLight', pants: 0x7a4a26, shoes: 0x5a3a1e }),
    ...hair(0x5a3a1e, true), ...headband(), ...rockInHand(),
    P('torso', 'box', [0.1, 0.3, 0.2], [0.24, 0.05, 0.02], 0x6b4b2a),
  ],
  shaman: () => [
    ...body({ shirt: 'teamDark', pants: 0x6b4b2a, shoes: 0x4a3018 }),
    ...hair(0xdddddd, true),
    P('head', 'cone', [0.1, 0.32, 0.04], [0.12, 0.3, -0.05], 'team', { rot: [0, 0, -0.35] }),
    P('head', 'cone', [0.1, 0.36, 0.04], [0, 0.32, -0.08], 0xf2d24b, { rot: [-0.2, 0, 0] }),
    P('head', 'cone', [0.1, 0.32, 0.04], [-0.12, 0.3, -0.05], 'team', { rot: [0, 0, 0.35] }),
    P('torso', 'sphere', [0.12, 0.12, 0.08], [0, 0.42, 0.15], 0xe8e0c8),
    ...staff(),
  ],
  mammoth: () => [
    P('torso', 'sphere', [1.0, 0.95, 1.6], [0, 0.08, 0], 0x6b4a2f),
    P('torso', 'sphere', [0.82, 0.6, 0.8], [0, 0.42, 0.32], 0x5e3f27),
    P('torso', 'box', [0.62, 0.08, 0.7], [0, 0.6, -0.12], 'team'),
    P('torso', 'capsule', [0.1, 0.4, 0.1], [0, 0.05, -0.8], 0x5e3f27, { rot: [-0.8, 0, 0] }),
    P('head', 'sphere', [0.68, 0.7, 0.66], [0, 0, 0], 0x6b4a2f),
    P('head', 'sphere', [0.12, 0.42, 0.36], [0.32, 0.04, -0.06], 0x5e3f27),
    P('head', 'sphere', [0.12, 0.42, 0.36], [-0.32, 0.04, -0.06], 0x5e3f27),
    P('head', 'sphere', [0.07, 0.07, 0.05], [0.2, 0.08, 0.28], 0x111111),
    P('head', 'sphere', [0.07, 0.07, 0.05], [-0.2, 0.08, 0.28], 0x111111),
    P('head', 'capsule', [0.2, 0.75, 0.2], [0, -0.38, 0.32], 0x62432a, { rot: [0.3, 0, 0] }),
    P('head', 'capsule', [0.15, 0.3, 0.15], [0, -0.72, 0.5], 0x62432a, { rot: [1.1, 0, 0] }),
    P('head', 'cone', [0.1, 0.8, 0.1], [0.17, -0.3, 0.52], 0xf2ead8, { rot: [1.35, 0, 0.12] }),
    P('head', 'cone', [0.1, 0.8, 0.1], [-0.17, -0.3, 0.52], 0xf2ead8, { rot: [1.35, 0, -0.12] }),
    ...['l', 'r'].flatMap((s) => [
      P(`${s}Upper`, 'capsule', [0.3, 0.55, 0.3], [0, -0.22, 0], 0x5e3f27),
      P(`${s}Fore`, 'capsule', [0.26, 0.5, 0.26], [0, -0.22, 0], 0x5e3f27),
      P(`${s}Fore`, 'cylinder', [0.28, 0.08, 0.28], [0, -0.46, 0], 0x3a2718),
      P(`${s}Thigh`, 'capsule', [0.3, 0.55, 0.3], [0, -0.22, 0], 0x5e3f27),
      P(`${s}Shin`, 'capsule', [0.26, 0.5, 0.26], [0, -0.22, 0], 0x5e3f27),
      P(`${s}Shin`, 'cylinder', [0.28, 0.08, 0.28], [0, -0.46, 0], 0x3a2718),
    ]),
    ...rider([0, 0.62, -0.18], 1 / 2.3, {
      shirt: 'team', pants: 0x8a5a2b,
      extra: [
        { shape: 'sphere', size: [0.47, 0.38, 0.48], pos: [0, 0.9, -0.02], color: 0x3b2412 },
        { shape: 'cylinder', size: [0.45, 0.07, 0.45], pos: [0, 0.89, 0.02], color: 'team' },
        { shape: 'cylinder', size: [0.04, 1.5, 0.04], pos: [-0.28, 0.6, 0.5], color: 0x8b6a3e, extra: { rot: [1.1, 0, 0] } },
        { shape: 'cone', size: [0.09, 0.2, 0.09], pos: [-0.28, 0.94, 1.18], color: 0x7a7a78, extra: { rot: [1.1, 0, 0] } },
      ],
    }),
  ],
  swordsman: () => [
    ...body({ shirt: 'team', pants: 0x5a5f6e, shoes: 0x3a3028, sleeves: 0x8f96a3, belt: 0x5a3a1e }),
    P('head', 'cylinder', [0.46, 0.26, 0.46], [0, 0.08, 0], 0x9aa1ad),
    P('head', 'sphere', [0.46, 0.2, 0.46], [0, 0.2, 0], 0x9aa1ad),
    P('head', 'box', [0.04, 0.16, 0.04], [0, 0.0, 0.22], 0x9aa1ad),
    ...sword(), ...roundShield(),
  ],
  archer: () => [
    ...body({ shirt: 'team', pants: 0x4a5a32, shoes: 0x4a3018, sleeves: 0x5a6b3a, belt: 0x5a3a1e }),
    ...hair(0x7a4a26),
    P('head', 'cone', [0.46, 0.3, 0.46], [0, 0.22, -0.02], 0x3f5a2a, { rot: [-0.15, 0, 0] }),
    P('head', 'cone', [0.04, 0.2, 0.04], [0.08, 0.36, -0.12], 'team', { rot: [-0.6, 0, -0.4] }),
    ...bow(), ...quiver(),
  ],
  knight: () => [
    // horse
    P('torso', 'capsule', [0.48, 0.55, 1.3], [0, 0.02, 0], 'horse', { rot: [PI / 2, 0, 0] }),
    P('torso', 'box', [0.54, 0.36, 1.1], [0, -0.06, -0.02], 'team'),
    P('torso', 'box', [0.56, 0.06, 1.12], [0, 0.12, -0.02], 0xe6c34a),
    P('torso', 'capsule', [0.24, 0.72, 0.32], [0, 0.34, 0.56], 'horse', { rot: [0.6, 0, 0] }),
    P('torso', 'box', [0.06, 0.6, 0.1], [0, 0.44, 0.5], 0x2a1e14, { rot: [0.6, 0, 0] }),
    P('torso', 'capsule', [0.1, 0.5, 0.1], [0, 0.0, -0.72], 0x2a1e14, { rot: [-0.6, 0, 0] }),
    P('head', 'capsule', [0.2, 0.55, 0.26], [0, -0.05, 0.1], 'horse', { rot: [1.9, 0, 0] }),
    P('head', 'box', [0.24, 0.2, 0.3], [0, 0.08, 0.02], 0x9aa1ad),
    P('head', 'sphere', [0.05, 0.05, 0.05], [0.1, 0.06, 0.12], 0x111111),
    P('head', 'sphere', [0.05, 0.05, 0.05], [-0.1, 0.06, 0.12], 0x111111),
    P('head', 'cone', [0.06, 0.12, 0.06], [0.07, 0.2, -0.04], 'horse'),
    P('head', 'cone', [0.06, 0.12, 0.06], [-0.07, 0.2, -0.04], 'horse'),
    ...['l', 'r'].flatMap((s) => [
      P(`${s}Upper`, 'capsule', [0.13, 0.48, 0.13], [0, -0.2, 0], 'horse'),
      P(`${s}Fore`, 'capsule', [0.1, 0.46, 0.1], [0, -0.2, 0], 'horse'),
      P(`${s}Fore`, 'cylinder', [0.12, 0.08, 0.12], [0, -0.44, 0], 0x222222),
      P(`${s}Thigh`, 'capsule', [0.15, 0.48, 0.15], [0, -0.2, 0], 'horse'),
      P(`${s}Shin`, 'capsule', [0.1, 0.46, 0.1], [0, -0.2, 0], 'horse'),
      P(`${s}Shin`, 'cylinder', [0.12, 0.08, 0.12], [0, -0.44, 0], 0x222222),
    ]),
    ...rider([0, 0.32, -0.08], 1 / 1.25, {
      shirt: 'team', pants: 0x9aa1ad, arms: 0x9aa1ad,
      extra: [
        { shape: 'box', size: [0.36, 0.38, 0.4], pos: [0, 0.86, 0.02], color: 0x9aa1ad },
        { shape: 'box', size: [0.3, 0.04, 0.05], pos: [0, 0.88, 0.22], color: 0x222222 },
        { shape: 'cone', size: [0.1, 0.35, 0.3], pos: [0, 1.15, -0.04], color: 'team', extra: { rot: [-0.3, 0, 0] } },
        { shape: 'cylinder', size: [0.5, 0.05, 0.62], pos: [0.36, 0.35, 0.2], color: 'team', extra: { rot: [0, 0, PI / 2] } },
        { shape: 'cylinder', size: [0.07, 2.6, 0.07], pos: [-0.27, 0.32, 0.4], color: 0xdedede, extra: { rot: [0.87, 0, 0], center: [0, 0.9, 0], swing: { axis: 'x', amt: 0.75, curve: 'wind', charge: true } } },
        { shape: 'cone', size: [0.14, 0.3, 0.14], pos: [-0.27, 0.32, 0.4], color: 'team', extra: { rot: [0.87, 0, 0], center: [0, -0.2, 0], swing: { axis: 'x', amt: 0.75, curve: 'wind', charge: true } } },
      ],
    }),
  ],
  catapult: () => [
    P('torso', 'box', [0.12, 0.12, 1.5], [0.42, 0, 0], 0x7a5230),
    P('torso', 'box', [0.12, 0.12, 1.5], [-0.42, 0, 0], 0x7a5230),
    P('torso', 'box', [0.96, 0.1, 0.12], [0, 0, 0.62], 0x6b4526),
    P('torso', 'box', [0.96, 0.1, 0.12], [0, 0, -0.62], 0x6b4526),
    P('torso', 'box', [0.96, 0.08, 0.5], [0, 0.04, -0.3], 'team'),
    P('torso', 'box', [0.1, 0.95, 0.1], [0.32, 0.45, 0.1], 0x7a5230, { rot: [0.15, 0, 0] }),
    P('torso', 'box', [0.1, 0.95, 0.1], [-0.32, 0.45, 0.1], 0x7a5230, { rot: [0.15, 0, 0] }),
    P('torso', 'cylinder', [0.07, 0.75, 0.07], [0, 0.85, 0.05], 0x444444, { rot: [0, 0, PI / 2] }),
    P('torso', 'box', [0.12, 1.5, 0.12], [0, 0.85, 0.05], 0x8b5a2b, { rot: [-1.3, 0, 0], center: [0, 0.5, 0], swing: { axis: 'x', amt: 2.0, curve: 'snap' } }),
    P('torso', 'box', [0.36, 0.12, 0.36], [0, 0.85, 0.05], 'team', { rot: [-1.3, 0, 0], center: [0, 1.25, 0], swing: { axis: 'x', amt: 2.0, curve: 'snap' } }),
    P('torso', 'sphere', [0.32, 0.3, 0.32], [0, 0.85, 0.05], 0x8a8a84, { rot: [-1.3, 0, 0], center: [0, 1.25, 0.15], swing: { axis: 'x', amt: 2.0, curve: 'snap' }, showWhen: 'loaded' }),
    P('torso', 'box', [0.34, 0.34, 0.34], [0, 0.85, 0.05], 0x555555, { rot: [-1.3, 0, 0], center: [0, -0.3, 0], swing: { axis: 'x', amt: 2.0, curve: 'snap' } }),
    P('torso', 'cylinder', [0.04, 1.0, 0.04], [0.46, 0.5, -0.62], 0x5a3a1e),
    P('torso', 'box', [0.02, 0.26, 0.38], [0.46, 0.85, -0.44], 'team'),
    ...['lFore', 'rFore', 'lShin', 'rShin'].flatMap((b) => [
      P(b, 'cylinder', [0.46, 0.1, 0.46], [0, -0.05, 0], 0x5a3a1e, { rot: [0, 0, PI / 2], spin: 0.23 }),
      P(b, 'box', [0.05, 0.12, 0.42], [0, -0.05, 0], 0x3a2718, { rot: [0, 0, PI / 2], spin: 0.23 }),
    ]),
  ],
  berserker: () => [
    ...body({ shirt: 'team', pants: 0x5a3a1e, shoes: 0x3a2718, bulk: 1.08, belt: 0x2a1e14 }),
    ...hair(0xd9822b, true),
    P('head', 'sphere', [0.46, 0.2, 0.46], [0, 0.17, 0], 0x9aa1ad),
    P('head', 'cone', [0.07, 0.24, 0.07], [0.22, 0.24, 0], 0xf2ead8, { rot: [0, 0, -1.0] }),
    P('head', 'cone', [0.07, 0.24, 0.07], [-0.22, 0.24, 0], 0xf2ead8, { rot: [0, 0, 1.0] }),
    ...axe('r'), ...axe('l'),
  ],
  rifleman: () => [
    ...body({ shirt: 'team', pants: 0x5a6340, shoes: 0x2a2a2a, sleeves: 0x5a6340, belt: 0x3a3a2a }),
    P('head', 'sphere', [0.48, 0.3, 0.5], [0, 0.1, 0], 0x4f5a36),
    P('torso', 'box', [0.46, 0.34, 0.34], [0, 0.32, 0], 0x4a5234),
    ...gun({}),
  ],
  sniper: () => [
    ...body({ shirt: 'teamDark', pants: 0x3f4a2e, shoes: 0x2a2a2a, sleeves: 0x3f4a2e }),
    P('head', 'sphere', [0.46, 0.26, 0.47], [0, 0.11, -0.01], 'team'),
    P('head', 'box', [0.3, 0.06, 0.05], [0, 0.03, 0.2], 0x111111),
    P('torso', 'box', [0.5, 0.12, 0.36], [0, 0.5, 0], 0x3f4a2e),
    ...gun({ len: 0.8, barrel: 0.6, scope: true, body: 0x3a3f2a }),
  ],
  laser_trooper: () => [
    ...body({ shirt: 'team', pants: 0xe6e8ee, shoes: 0x8a8f99, sleeves: 0xe6e8ee, gloves: 0x2a2d33, head: 0xeef0f4, eyes: false }),
    P('head', 'box', [0.3, 0.08, 0.06], [0, 0.02, 0.19], 0x6ff3ff, { glow: true }),
    P('torso', 'box', [0.46, 0.3, 0.33], [0, 0.33, 0], 0xe6e8ee),
    P('torso', 'box', [0.12, 0.08, 0.02], [0.1, 0.36, 0.17], 0x6ff3ff, { glow: true }),
    ...gun({ body: 0xf2f4f8, barrelColor: 0x8a8f99, glowTip: 0x6ff3ff, stock: false, len: 0.6 }),
  ],
  rocket_soldier: () => [
    ...body({ shirt: 'team', pants: 0x5a6340, shoes: 0x2a2a2a, sleeves: 0x5a6340 }),
    P('head', 'sphere', [0.48, 0.3, 0.5], [0, 0.1, 0], 0x4f5a36),
    P('head', 'box', [0.3, 0.07, 0.05], [0, 0.08, 0.22], 0x222222),
    P('torso', 'cylinder', [0.2, 1.15, 0.2], [-0.24, 0.56, 0.12], 0x4a5a32, { rot: [PI / 2, 0, 0] }),
    P('torso', 'cylinder', [0.24, 0.1, 0.24], [-0.24, 0.56, 0.7], 0x2a2a2a, { rot: [PI / 2, 0, 0] }),
    P('torso', 'cone', [0.14, 0.16, 0.14], [-0.24, 0.56, 0.72], 0xd94a2b, { rot: [PI / 2, 0, 0] }),
  ],
  mech: () => [
    P('torso', 'box', [0.62, 0.52, 0.46], [0, 0.3, 0], 0x7d848f),
    P('torso', 'box', [0.34, 0.2, 0.06], [0, 0.34, 0.24], 'team'),
    P('torso', 'box', [0.44, 0.14, 0.36], [0, 0.0, 0], 0x5a6069),
    P('torso', 'box', [0.24, 0.24, 0.3], [0.32, 0.56, -0.08], 'teamDark'),
    P('torso', 'sphere', [0.06, 0.06, 0.02], [0.28, 0.6, 0.08], 0xff5a3a, { glow: true }),
    P('torso', 'sphere', [0.06, 0.06, 0.02], [0.36, 0.6, 0.08], 0xff5a3a, { glow: true }),
    P('torso', 'cylinder', [0.02, 0.4, 0.02], [-0.2, 0.7, -0.15], 0x333333),
    P('head', 'box', [0.36, 0.26, 0.34], [0, -0.04, 0], 0x7d848f),
    P('head', 'box', [0.28, 0.07, 0.05], [0, -0.02, 0.17], 0x6ff3ff, { glow: true }),
    ...['l', 'r'].flatMap((s) => [
      P(`${s}Upper`, 'box', [0.24, 0.2, 0.28], [0, 0.02, 0], 'team'),
      P(`${s}Upper`, 'box', [0.14, 0.32, 0.14], [0, -0.15, 0], 0x5a6069),
      P(`${s}Fore`, 'box', [0.16, 0.3, 0.16], [0, -0.14, 0], 0x7d848f),
      P(`${s}Thigh`, 'box', [0.2, 0.48, 0.22], [0, -0.22, 0], 0x7d848f),
      P(`${s}Shin`, 'box', [0.18, 0.46, 0.2], [0, -0.22, 0], 0x5a6069),
      P(`${s}Shin`, 'box', [0.24, 0.1, 0.38], [0, -0.43, 0.06], 0x3d4249),
    ]),
    P('lFore', 'box', [0.16, 0.14, 0.18], [0, -0.3, 0], 0x5a6069),
    P('rFore', 'cylinder', [0.2, 0.3, 0.2], [0, -0.32, 0.02], 0x3d4249),
    P('rFore', 'cylinder', [0.05, 0.55, 0.05], [0.045, -0.7, 0.04], 0x222222),
    P('rFore', 'cylinder', [0.05, 0.55, 0.05], [-0.045, -0.7, 0.04], 0x222222),
    P('rFore', 'cylinder', [0.05, 0.55, 0.05], [0, -0.7, -0.04], 0x222222),
  ],
  skyblazer: () => [
    ...body({ shirt: 'team', pants: 'team', shoes: 'teamDark', gloves: 'teamDark', sleeves: 'team', belt: 0xf2c23b }),
    ...hair(0x2a1a0e),
    P('torso', 'box', [0.48, 0.85, 0.03], [0, 0.12, -0.18], 'teamDark', { rot: [-0.15, 0, 0] }),
    P('torso', 'cone', [0.16, 0.18, 0.03], [0, 0.38, 0.16], 0xffd23b, { glow: true, rot: [PI, 0, 0] }),
  ],
  bulwark: () => [
    ...body({ shirt: 'team', pants: 0x3a3d45, shoes: 'teamDark', sleeves: 'team', forearms: 'skin', gloves: 0x3a3d45, bulk: 1.35, belt: 0x3a3d45 }),
    ...hair(0x111111),
    P('head', 'box', [0.38, 0.09, 0.05], [0, 0.05, 0.19], 'teamDark'),
    P('lFore', 'sphere', [0.26, 0.26, 0.26], [0, -0.3, 0], 0x3a3d45),
    P('rFore', 'sphere', [0.26, 0.26, 0.26], [0, -0.3, 0], 0x3a3d45),
    P('torso', 'box', [0.28, 0.2, 0.03], [0, 0.34, 0.2], 0xf2f2f2),
  ],
  beamer: () => [
    ...body({ shirt: 'teamDark', pants: 'teamDark', shoes: 0x222222, gloves: 0x222222, sleeves: 'teamDark', belt: 'team' }),
    ...hair(0xe8d8a0),
    P('head', 'box', [0.34, 0.08, 0.06], [0, 0.03, 0.19], 0xffe14d, { glow: true }),
    P('torso', 'sphere', [0.18, 0.18, 0.05], [0, 0.36, 0.16], 'team'),
    P('torso', 'sphere', [0.1, 0.1, 0.04], [0, 0.36, 0.18], 0xffe14d, { glow: true }),
  ],
  streak: () => [
    ...body({ shirt: 'team', pants: 'team', shoes: 0xf2c23b, gloves: 0xf2c23b, sleeves: 'team' }),
    P('head', 'sphere', [0.45, 0.45, 0.45], [0, 0.02, -0.01], 'team'),
    P('head', 'box', [0.02, 0.1, 0.16], [0.23, 0.08, -0.04], 0xf2c23b, { rot: [0.5, 0, 0] }),
    P('head', 'box', [0.02, 0.1, 0.16], [-0.23, 0.08, -0.04], 0xf2c23b, { rot: [0.5, 0, 0] }),
    P('head', 'sphere', [0.3, 0.16, 0.1], [0, -0.07, 0.16], 'skin'),
    P('torso', 'box', [0.06, 0.26, 0.03], [0, 0.34, 0.16], 0xffe14d, { glow: true, rot: [0, 0, 0.5] }),
  ],
  guardian: () => [
    ...body({ shirt: 'team', pants: 'teamDark', shoes: 0xd8b44a, gloves: 0xd8b44a, sleeves: 0xd8b44a, bulk: 1.12 }),
    P('head', 'sphere', [0.46, 0.34, 0.47], [0, 0.08, -0.01], 0xd8b44a),
    P('head', 'box', [0.05, 0.2, 0.3], [0, 0.26, -0.02], 'team'),
    P('torso', 'box', [0.56, 0.18, 0.34], [0, 0.46, 0], 0xd8b44a),
    P('torso', 'sphere', [0.14, 0.14, 0.05], [0, 0.3, 0.17], 0x7fe8ff, { glow: true }),
    P('lFore', 'sphere', [0.16, 0.16, 0.16], [0, -0.33, 0.06], 0x7fe8ff, { glow: true }),
  ],
};

export function getLook(id) {
  const f = LOOKS[id];
  return f ? f() : body();
}
