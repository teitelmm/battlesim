// Army generators: formations, random battles and ready-made scenarios.
import { UNITS, getUnitDef } from './units.js';
import { ARENA_HALF } from '../sim/constants.js';

function group(def) {
  if (def.traits.flying) return 1;
  if (def.weapon.minRange) return 4;
  if (def.role === 'support') return 2;
  if (def.weapon.type === 'melee') return 0;
  return 3;
}

// Lay out a list of unit ids for one team: melee in front, then support, ranged, siege.
export function formation(ids, team, frontX = 10) {
  const defs = ids.map(getUnitDef).filter(Boolean);
  defs.sort((a, b) => group(a) - group(b) || b.radius - a.radius || a.index - b.index);
  const side = team === 0 ? -1 : 1;
  const out = [];
  let x = frontX;
  let i = 0;
  while (i < defs.length) {
    const g = group(defs[i]);
    const row = [];
    const spacing = defs[i].radius * 2 + 0.5;
    const perRow = Math.max(1, Math.min(24, Math.floor((ARENA_HALF * 1.2) / spacing)));
    while (i < defs.length && group(defs[i]) === g && row.length < perRow && Math.abs(defs[i].radius * 2 + 0.5 - spacing) < 0.25) row.push(defs[i++]);
    const width = (row.length - 1) * spacing;
    row.forEach((d, k) => {
      out.push({ defId: d.id, team, x: side * (x + spacing / 2), z: -width / 2 + k * spacing, facing: team === 0 ? Math.PI / 2 : -Math.PI / 2 });
    });
    x += spacing + 0.3;
    if (x > ARENA_HALF - 2) x = frontX + 0.7;
  }
  return out;
}

function pickArmy(rand, budget, pool) {
  const kinds = [];
  const nKinds = 2 + Math.floor(rand() * 3);
  for (let k = 0; k < nKinds; k++) kinds.push(pool[Math.floor(rand() * pool.length)]);
  const ids = [];
  let spent = 0, guard = 0;
  while (spent < budget && ids.length < 160 && guard++ < 1000) {
    const d = kinds[Math.floor(rand() * kinds.length)];
    if (spent + d.cost > budget * 1.05) { if (kinds.every((k) => spent + k.cost > budget * 1.05)) break; continue; }
    ids.push(d.id);
    spent += d.cost;
  }
  return ids;
}

export function randomBattle(rand = Math.random, budget = 3500 + Math.floor(rand() * 4000)) {
  const eras = ['caveman', 'medieval', 'modern', 'heroes'];
  const poolFor = () => {
    if (rand() < 0.55) {
      const era = eras[Math.floor(rand() * eras.length)];
      return UNITS.filter((u) => u.era === era);
    }
    return UNITS;
  };
  return [...formation(pickArmy(rand, budget, poolFor()), 0), ...formation(pickArmy(rand, budget, poolFor()), 1)];
}

const rep = (id, n) => Array(n).fill(id);

export const SCENARIOS = [
  {
    name: 'Stone Age vs Space Age',
    build: () => [
      ...formation([...rep('clubber', 45), ...rep('spear_thrower', 20), ...rep('rock_slinger', 20), ...rep('mammoth', 3), ...rep('shaman', 6)], 0),
      ...formation([...rep('laser_trooper', 12), ...rep('rifleman', 10), ...rep('rocket_soldier', 4), 'mech'], 1),
    ],
  },
  {
    name: 'Heroes vs The Horde',
    build: () => [
      ...formation([...rep('clubber', 60), ...rep('swordsman', 40), ...rep('archer', 30), ...rep('berserker', 20), ...rep('knight', 6)], 0, 14),
      ...formation(['bulwark', 'beamer', 'streak', 'skyblazer', 'guardian'], 1, 8),
    ],
  },
  {
    name: 'Cavalry Charge',
    build: () => [
      ...formation([...rep('knight', 16), ...rep('archer', 20)], 0, 25),
      ...formation([...rep('swordsman', 30), ...rep('archer', 20), ...rep('catapult', 3)], 1, 8),
    ],
  },
  {
    name: 'Mammoths vs Mechs',
    build: () => [
      ...formation([...rep('mammoth', 6), ...rep('spear_thrower', 16), ...rep('shaman', 6)], 0),
      ...formation([...rep('mech', 2), ...rep('rifleman', 10)], 1),
    ],
  },
  {
    name: 'Snipers vs Speedster',
    build: () => [
      ...formation(rep('sniper', 14), 0, 30),
      ...formation(['streak'], 1, 20),
    ],
  },
];
