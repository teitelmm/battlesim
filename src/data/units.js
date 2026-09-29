// Unit definitions: gameplay stats only (visuals live in looks.js). Everything is
// data-driven, so balancing is a matter of editing numbers here.
//
// weapon.type: melee | projectile | hitscan | beam
// weapon.cooldown is the full attack cycle (set when an attack starts).
// muzzle offsets are unscaled local coords (+x left, +y up, +z forward).
import { SKELETONS } from '../anim/skeleton.js';

const HAND = [-0.25, 1.35, 0.45];
const OVERHEAD = [-0.25, 1.75, 0.2];

const RAW = [
  // ----------------------------------------------------------------- Stone Age
  {
    id: 'clubber', era: 'caveman', name: 'Clubber', cost: 70,
    blurb: 'Bonks things with a big club. Cheap and cheerful.',
    hp: 110, speed: 3.4,
    weapon: { type: 'melee', damage: 22, range: 0.9, cooldown: 1.1, windup: 0.35, recover: 0.35, knockback: 5, anim: 'chop' },
  },
  {
    id: 'spear_thrower', era: 'caveman', name: 'Spear Thrower', cost: 75,
    blurb: 'Lobs sharpened sticks from a short distance.',
    hp: 75, speed: 3.3,
    weapon: {
      type: 'projectile', damage: 30, range: 14, cooldown: 2.2, windup: 0.45, recover: 0.4, knockback: 3, anim: 'throw',
      projectile: { kind: 'spear', speed: 18, arc: 'low', gravity: 20, spread: 0.05, radius: 0.25 }, muzzle: OVERHEAD,
    },
  },
  {
    id: 'rock_slinger', era: 'caveman', name: 'Rock Slinger', cost: 55,
    blurb: 'Throws rocks. Surprisingly annoying.',
    hp: 60, speed: 3.5,
    weapon: {
      type: 'projectile', damage: 12, range: 17, cooldown: 1.3, windup: 0.35, recover: 0.3, knockback: 2, anim: 'throw',
      projectile: { kind: 'rock', speed: 20, arc: 'low', gravity: 20, spread: 0.07, radius: 0.22 }, muzzle: OVERHEAD,
    },
  },
  {
    id: 'shaman', era: 'caveman', name: 'Shaman', cost: 120, role: 'support',
    blurb: 'Stays behind the lines healing the most injured ally.',
    hp: 85, speed: 3.1, carry: 'cast',
    weapon: { type: 'melee', damage: 7, range: 0.9, cooldown: 1.2, windup: 0.3, recover: 0.3, knockback: 2, anim: 'chop' },
    traits: { heal: { amount: 26, radius: 9, cooldown: 1.4 } },
  },
  {
    id: 'mammoth', era: 'caveman', name: 'Mammoth', cost: 650,
    blurb: 'A woolly tank. Tramples anything in its path and tosses the rest.',
    hp: 1900, speed: 2.8, radius: 1.6, mass: 14, scale: 2.3, skeleton: 'quad', height: 3.6, turnRate: 2.5,
    build: { bodyY: 1.05, halfW: 0.36, halfL: 0.62, headY: 1.25, headZ: 1.0 },
    weapon: { type: 'melee', damage: 55, range: 1.4, cooldown: 1.6, windup: 0.45, recover: 0.5, knockback: 16, launch: true, anim: 'gore', cleave: { arc: 1.0 } },
    traits: { trample: { damage: 14, knockback: 10, cooldown: 0.7 } },
  },
  // ----------------------------------------------------------------- Medieval
  {
    id: 'swordsman', era: 'medieval', name: 'Swordsman', cost: 100,
    blurb: 'Sword and shield. Blocks half the arrows and bullets aimed at his front.',
    hp: 150, speed: 3.2, carry: 'shield',
    weapon: { type: 'melee', damage: 20, range: 0.95, cooldown: 0.9, windup: 0.3, recover: 0.3, knockback: 4, anim: 'shield' },
    traits: { block: 0.5 },
  },
  {
    id: 'archer', era: 'medieval', name: 'Archer', cost: 100,
    blurb: 'Long-range volleys that arc over the front line.',
    hp: 70, speed: 3.2,
    weapon: {
      type: 'projectile', damage: 20, range: 27, cooldown: 1.5, windup: 0.6, recover: 0.3, knockback: 2, anim: 'bow',
      projectile: { kind: 'arrow', speed: 28, arc: 'low', gravity: 20, spread: 0.035, radius: 0.2 }, muzzle: [0.25, 1.45, 0.45],
    },
  },
  {
    id: 'knight', era: 'medieval', name: 'Knight', cost: 320,
    blurb: 'Mounted and armoured. Charges from range for a devastating lance hit.',
    hp: 450, speed: 3.4, radius: 0.8, mass: 4, scale: 1.25, skeleton: 'quad', height: 2.7, turnRate: 4,
    build: { bodyY: 1.0, halfW: 0.2, halfL: 0.52, headY: 1.5, headZ: 0.82, upper: 0.46, fore: 0.46, thigh: 0.46, shin: 0.46 },
    weapon: { type: 'melee', damage: 40, range: 1.4, cooldown: 1.4, windup: 0.35, recover: 0.45, knockback: 7, anim: 'mount' },
    traits: { charge: { speed: 8.5, minDist: 7, mult: 2.2, knockback: 16, cooldown: 5 }, armor: 0.2 },
  },
  {
    id: 'catapult', era: 'medieval', name: 'Catapult', cost: 400,
    blurb: 'Slow siege engine. Huge splash damage at long range, helpless up close.',
    hp: 320, speed: 1.4, radius: 1.2, mass: 8, scale: 1.4, skeleton: 'quad', gait: 'wheels', height: 2.4, turnRate: 1.5,
    build: { bodyY: 0.5, halfW: 0.5, halfL: 0.62, headY: 0.55, headZ: 0.75, upper: 0.22, fore: 0.22, thigh: 0.22, shin: 0.22 },
    weapon: {
      type: 'projectile', damage: 75, range: 42, minRange: 8, cooldown: 4.5, windup: 0.3, recover: 1.8, knockback: 12, launch: true, anim: 'mount',
      projectile: { kind: 'boulder', speed: 30, arc: 'high', gravity: 20, splash: 4, spread: 0.035, radius: 0.5 }, muzzle: [0, 1.85, 0.9],
    },
    traits: { armor: 0.1 },
  },
  {
    id: 'berserker', era: 'medieval', name: 'Berserker', cost: 130,
    blurb: 'Two axes, no armour, no fear. Fast and hits everything in front.',
    hp: 160, speed: 4.6, carry: 'dual',
    weapon: { type: 'melee', damage: 15, range: 0.95, cooldown: 0.55, windup: 0.18, recover: 0.3, knockback: 4, anim: 'dual', cleave: { arc: 0.9 } },
  },
  // ----------------------------------------------------------------- Modern / Sci-fi
  {
    id: 'rifleman', era: 'modern', name: 'Rifleman', cost: 130,
    blurb: 'Reliable automatic rifle. Accuracy drops off with distance.',
    hp: 100, speed: 3.4,
    weapon: { type: 'hitscan', damage: 17, range: 25, cooldown: 0.65, windup: 0.2, recover: 0.1, knockback: 2, accuracy: 0.78, tracer: 'bullet', anim: 'aim', muzzle: [-0.1, 1.38, 0.85] },
  },
  {
    id: 'sniper', era: 'modern', name: 'Sniper', cost: 200,
    blurb: 'One shot, one very surprised target. Extreme range.',
    hp: 80, speed: 3.0,
    weapon: { type: 'hitscan', damage: 95, range: 58, cooldown: 3.6, windup: 0.5, recover: 0.3, knockback: 9, launch: true, accuracy: 0.92, tracer: 'sniper', anim: 'aim', muzzle: [-0.1, 1.38, 1.1] },
  },
  {
    id: 'laser_trooper', era: 'modern', name: 'Laser Trooper', cost: 180,
    blurb: 'Pew pew. Fast, accurate laser bolts.',
    hp: 130, speed: 3.4,
    weapon: { type: 'hitscan', damage: 13, range: 22, cooldown: 0.35, windup: 0.1, recover: 0.1, knockback: 1.5, accuracy: 0.9, tracer: 'laser', anim: 'aim', muzzle: [-0.1, 1.38, 0.85] },
  },
  {
    id: 'rocket_soldier', era: 'modern', name: 'Rocket Soldier', cost: 330,
    blurb: 'Rockets with big splash damage that send people flying.',
    hp: 110, speed: 3.1,
    weapon: {
      type: 'projectile', damage: 55, range: 30, cooldown: 3.3, windup: 0.5, recover: 0.4, knockback: 11, launch: true, anim: 'aim',
      projectile: { kind: 'rocket', speed: 22, arc: null, gravity: 1.5, splash: 3.5, spread: 0.03, radius: 0.3 }, muzzle: [-0.2, 1.62, 0.6],
    },
  },
  {
    id: 'mech', era: 'modern', name: 'Battle Mech', cost: 1500,
    blurb: 'Walking tank with a minigun. Stomps anything that gets too close.',
    hp: 2400, speed: 2.4, radius: 1.2, mass: 16, scale: 2.3, turnRate: 2.5, carry: 'minigun',
    weapon: { type: 'hitscan', damage: 9, range: 26, cooldown: 0.1, windup: 0.05, recover: 0.05, knockback: 1.2, accuracy: 0.6, tracer: 'minigun', anim: 'minigun', muzzle: [-0.35, 1.25, 1.0] },
    traits: { stomp: { damage: 60, radius: 4.5, knockback: 13, cooldown: 4, trigger: 2.5 }, armor: 0.25 },
  },
  // ----------------------------------------------------------------- Superheroes
  {
    id: 'skyblazer', era: 'heroes', name: 'Skyblazer', cost: 700,
    blurb: 'Flies above the battle and dive-punches targets into the sky.',
    hp: 650, speed: 7.5, radius: 0.42, mass: 2, scale: 1.1,
    weapon: { type: 'melee', damage: 65, range: 1.0, cooldown: 1.6, windup: 0.25, recover: 0.45, knockback: 14, launch: true, anim: 'punch', splash: 2.2 },
    traits: { flying: { altitude: 6 } },
  },
  {
    id: 'bulwark', era: 'heroes', name: 'Bulwark', cost: 1150,
    blurb: 'Super-strong brawler. Leaps into crowds and slams the ground.',
    hp: 2000, speed: 3.8, radius: 0.65, mass: 6, scale: 1.55,
    weapon: { type: 'melee', damage: 50, range: 1.0, cooldown: 0.9, windup: 0.25, recover: 0.3, knockback: 11, launch: true, anim: 'punch' },
    traits: { leap: { min: 6, max: 20, damage: 80, radius: 5, knockback: 16, cooldown: 6 }, armor: 0.15 },
  },
  {
    id: 'beamer', era: 'heroes', name: 'Beamer', cost: 1350,
    blurb: 'Sweeping eye-beams that burn through whole lines of enemies.',
    hp: 800, speed: 3.4, scale: 1.1, radius: 0.42,
    weapon: { type: 'beam', dps: 80, range: 30, duration: 2.5, cooldown: 4.5, windup: 0.5, recover: 0.4, width: 0.7, knockback: 6, anim: 'beam', muzzle: [0, 1.78, 0.2] },
  },
  {
    id: 'streak', era: 'heroes', name: 'Streak', cost: 750,
    blurb: 'Speedster. Zips through enemies faster than they can swing.',
    hp: 650, speed: 12, scale: 1.05, accel: 14, mass: 1.5,
    weapon: { type: 'melee', damage: 32, range: 0.9, cooldown: 0.35, windup: 0.08, recover: 0.15, knockback: 5, anim: 'punch' },
    traits: { blink: { dist: 1.6 } },
  },
  {
    id: 'guardian', era: 'heroes', name: 'Guardian', cost: 1000,
    blurb: 'Armoured protector who projects force-field shields onto nearby allies.',
    hp: 1300, speed: 3.2, scale: 1.2, radius: 0.46,
    weapon: { type: 'melee', damage: 30, range: 1.0, cooldown: 1.0, windup: 0.3, recover: 0.3, knockback: 8, anim: 'punch' },
    traits: { aura: { shield: 120, max: 220, radius: 10, cooldown: 4 }, armor: 0.25 },
  },
];

function finalize(raw, index) {
  const scale = raw.scale ?? 1;
  const skeleton = raw.skeleton ?? 'biped';
  const def = {
    radius: 0.38 * scale,
    mass: scale * scale * scale,
    turnRate: 8,
    accel: 8,
    gait: 'walk',
    role: 'fighter',
    traits: {},
    ...raw,
    index,
    scale,
    skeleton,
  };
  def.sk = { ...SKELETONS[skeleton], ...(raw.build || {}) };
  def.height = raw.height ?? (skeleton === 'biped' ? 1.95 * scale : (def.sk.headY + 0.35) * scale);
  def.carry = raw.carry ?? def.weapon.anim;
  def.weapon = { recover: 0.3, windup: 0.3, knockback: 0, ...def.weapon };
  if (!def.weapon.muzzle) def.weapon.muzzle = HAND;
  return Object.freeze(def);
}

export const UNITS = RAW.map(finalize);
export const UNIT_MAP = Object.fromEntries(UNITS.map((u) => [u.id, u]));
export function getUnitDef(id) {
  return Object.prototype.hasOwnProperty.call(UNIT_MAP, id) ? UNIT_MAP[id] : null;
}
