// Headless balance check: every unit type fights every other with an equal gold budget
// (both side assignments, several seeds). Prints each unit's overall win rate and the
// most lopsided match-ups so outliers are easy to spot when tuning src/data/units.js.
//
//   node scripts/balance.mjs [budget=3000] [seeds=2]
import { World } from '../src/sim/World.js';
import { STEP } from '../src/sim/constants.js';
import { UNITS } from '../src/data/units.js';
import { formation } from '../src/data/presets.js';

const budget = Number(process.argv[2] || 3000);
const seeds = Number(process.argv[3] || 2);

function army(def) {
  return Array(Math.max(1, Math.floor(budget / def.cost))).fill(def.id);
}

function fight(a, b, seed) {
  const w = new World({ seed });
  for (const p of [...formation(army(a), 0, 14), ...formation(army(b), 1, 14)]) w.addUnit(p.defId, p.team, p.x, p.z, p.facing);
  w.start();
  let n = 0;
  while (!w.over && n < 60 * 180) { w.step(STEP); n++; }
  if (!w.over) return 0.5;
  return w.winner === 0 ? 1 : w.winner === 1 ? 0 : 0.5;
}

const N = UNITS.length;
const score = Array.from({ length: N }, () => new Float64Array(N));
const t0 = Date.now();
for (let i = 0; i < N; i++) {
  for (let j = i + 1; j < N; j++) {
    let s = 0, games = 0;
    for (let k = 0; k < seeds; k++) {
      s += fight(UNITS[i], UNITS[j], 100 + k);
      s += 1 - fight(UNITS[j], UNITS[i], 200 + k);
      games += 2;
    }
    score[i][j] = s / games;
    score[j][i] = 1 - s / games;
  }
}

const rows = UNITS.map((u, i) => {
  let total = 0;
  for (let j = 0; j < N; j++) if (j !== i) total += score[i][j];
  return { id: u.id, cost: u.cost, win: total / (N - 1) };
}).sort((a, b) => b.win - a.win);

console.log(`Equal-gold battles, budget ${budget}g, ${seeds * 2} games per match-up (${((Date.now() - t0) / 1000).toFixed(1)}s)\n`);
console.log('unit               cost   win%');
for (const r of rows) {
  const bar = '█'.repeat(Math.round(r.win * 30));
  console.log(`${r.id.padEnd(17)} ${String(r.cost).padStart(5)}  ${(r.win * 100).toFixed(0).padStart(4)}%  ${bar}`);
}

const pairs = [];
for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) if (score[i][j] === 1) pairs.push(`${UNITS[i].id} > ${UNITS[j].id}`);
console.log(`\nClean sweeps (${pairs.length}): ${pairs.slice(0, 40).join(', ')}${pairs.length > 40 ? ', …' : ''}`);
