import { describe, it, expect } from 'vitest';
import { World } from '../src/sim/World.js';
import { STEP } from '../src/sim/constants.js';
import { UNITS } from '../src/data/units.js';
import { SpatialGrid } from '../src/sim/SpatialGrid.js';
import { applyDamage, areaDamage } from '../src/sim/combat.js';
import { createRagdoll, stepRagdoll } from '../src/sim/ragdoll.js';
import { JOINT_COUNT } from '../src/anim/skeleton.js';

function run(world, seconds) {
  const n = Math.round(seconds / STEP);
  for (let i = 0; i < n && !world.over; i++) world.step(STEP);
}

function duel(a, na, b, nb, seed = 1) {
  const w = new World({ seed });
  for (let i = 0; i < na; i++) w.addUnit(a, 0, -12 - (i % 8) * 1.3, Math.floor(i / 8) * 1.3);
  for (let i = 0; i < nb; i++) w.addUnit(b, 1, 12 + (i % 8) * 1.3, Math.floor(i / 8) * 1.3);
  w.start();
  run(w, 240);
  return w;
}

describe('World basics', () => {
  it('rejects unknown units and bad teams', () => {
    const w = new World();
    expect(w.addUnit('nope', 0, 0, 0)).toBeNull();
    expect(w.addUnit('clubber', 2, 0, 0)).toBeNull();
    expect(w.addUnit('clubber', 0, 999, -999)).toMatchObject({ x: w.half, z: -w.half });
  });

  it('declares a winner immediately if a team is empty', () => {
    const w = new World();
    w.addUnit('clubber', 0, 0, 0);
    w.start();
    expect(w.over).toBe(true);
    expect(w.winner).toBe(0);
  });

  it('resolves a melee battle', () => {
    const w = duel('clubber', 10, 'clubber', 10);
    expect(w.over).toBe(true);
    expect([0, 1, 'draw']).toContain(w.winner);
    expect(w.ragdolls.length).toBeGreaterThan(0);
  });

  it('is deterministic for the same seed and setup', () => {
    const summary = (w) => [w.winner, w.time.toFixed(4), w.units.map((u) => `${u.id}:${u.hp.toFixed(3)}`).join(',')].join('|');
    const a = duel('archer', 6, 'swordsman', 5, 42);
    const b = duel('archer', 6, 'swordsman', 5, 42);
    expect(summary(a)).toBe(summary(b));
  });

  it('every unit type can fight and finish a battle without NaNs', () => {
    for (const def of UNITS) {
      const w = duel(def.id, 2, 'clubber', 4, 7);
      expect(w.over, `${def.id} battle should finish`).toBe(true);
      for (const u of w.units) {
        expect(Number.isFinite(u.x) && Number.isFinite(u.z) && Number.isFinite(u.y), `${def.id} position finite`).toBe(true);
      }
    }
  });
});

describe('combat', () => {
  it('ranged units damage targets from range', () => {
    const w = new World({ seed: 3 });
    const archer = w.addUnit('archer', 0, -20, 0);
    const dummy = w.addUnit('mammoth', 1, 5, 0);
    w.start();
    let gapAtFirstHit = null;
    for (let i = 0; i < 60 * 6 && gapAtFirstHit === null; i++) {
      w.step(STEP);
      if (dummy.hp < dummy.maxHp) gapAtFirstHit = Math.abs(archer.x - dummy.x);
    }
    expect(gapAtFirstHit).not.toBeNull();
    expect(gapAtFirstHit).toBeGreaterThan(15);
  });

  it('knockback pushes and launch sends units airborne', () => {
    const w = new World();
    const a = w.addUnit('clubber', 0, 0, 0);
    const b = w.addUnit('clubber', 1, 1, 0);
    w.rebuild();
    applyDamage(w, b, 1, a.x, a.z, 10, true, a, false);
    expect(b.vx).toBeGreaterThan(5);
    expect(b.airborne).toBe(true);
    expect(b.vy).toBeGreaterThan(0);
  });

  it('area damage hits multiple enemies but not allies', () => {
    const w = new World();
    const ally = w.addUnit('clubber', 0, 0, 0);
    const e1 = w.addUnit('clubber', 1, 1, 0);
    const e2 = w.addUnit('clubber', 1, -1, 1);
    const far = w.addUnit('clubber', 1, 20, 0);
    w.rebuild();
    areaDamage(w, 0, 0, 0, 3, 30, 0, false, 0, null, null);
    expect(ally.hp).toBe(ally.maxHp);
    expect(e1.hp).toBeLessThan(e1.maxHp);
    expect(e2.hp).toBeLessThan(e2.maxHp);
    expect(far.hp).toBe(far.maxHp);
  });

  it('armor and shields reduce damage', () => {
    const w = new World();
    const g = w.addUnit('guardian', 0, 0, 0);
    w.rebuild();
    applyDamage(w, g, 100, 5, 0, 0, false, null, false);
    expect(g.maxHp - g.hp).toBeCloseTo(75); // 25% armour
    g.shield = 50;
    const before = g.hp;
    applyDamage(w, g, 100, 5, 0, 0, false, null, false);
    expect(before - g.hp).toBeCloseTo(25);
    expect(g.shield).toBe(0);
  });

  it('shamans heal injured allies', () => {
    const w = new World({ seed: 5 });
    w.addUnit('shaman', 0, 0, 0);
    const hurt = w.addUnit('clubber', 0, 2, 0);
    w.addUnit('clubber', 1, 50, 50);
    hurt.hp = 30;
    w.start();
    run(w, 2);
    expect(hurt.hp).toBeGreaterThan(30);
  });

  it('guardians grant shields to nearby allies', () => {
    const w = new World({ seed: 5 });
    w.addUnit('guardian', 0, 0, 0);
    const friend = w.addUnit('rifleman', 0, 3, 0);
    w.addUnit('clubber', 1, 55, 55);
    w.start();
    run(w, 1);
    expect(friend.shield).toBeGreaterThan(0);
  });

  it('flyers stay airborne and dive to attack', () => {
    const w = new World({ seed: 9 });
    const flyer = w.addUnit('skyblazer', 0, -10, 0);
    const target = w.addUnit('mammoth', 1, 10, 0);
    w.start();
    run(w, 0.5);
    expect(flyer.y).toBeGreaterThan(3);
    run(w, 8);
    expect(target.hp).toBeLessThan(target.maxHp);
  });

  it('killed units become ragdolls', () => {
    const w = new World();
    const a = w.addUnit('clubber', 0, 0, 0);
    const b = w.addUnit('clubber', 1, 1, 0);
    w.rebuild();
    applyDamage(w, b, 9999, a.x, a.z, 5, false, a, false);
    expect(b.alive).toBe(false);
    expect(w.ragdolls.length).toBe(1);
    w.step(STEP);
    expect(w.units.includes(b)).toBe(false);
  });
});

describe('ragdoll', () => {
  it('settles on the ground without exploding', () => {
    for (const def of UNITS) {
      const w = new World();
      const u = w.addUnit(def.id, 0, 0, 0);
      const r = createRagdoll(u, 8, 10, -3, 5, 2);
      for (let i = 0; i < 60 * 8; i++) stepRagdoll(r, STEP);
      for (let j = 0; j < JOINT_COUNT; j++) {
        const x = r.pos[j * 3], y = r.pos[j * 3 + 1], z = r.pos[j * 3 + 2];
        expect(Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z), def.id).toBe(true);
        expect(y, `${def.id} joint ${j} above ground`).toBeGreaterThanOrEqual(0);
        expect(y, `${def.id} joint ${j} came down`).toBeLessThan(def.height * 1.5);
        expect(Math.hypot(x, z), `${def.id} did not fly away`).toBeLessThan(40);
      }
    }
  });
});

describe('SpatialGrid', () => {
  it('returns all units near a point', () => {
    const g = new SpatialGrid(70, 3);
    const units = [];
    for (let i = 0; i < 500; i++) units.push({ x: (i * 37) % 120 - 60, z: (i * 53) % 120 - 60 });
    g.build(units);
    const out = [];
    const n = g.query(10, -5, 6, out);
    const found = new Set(out.slice(0, n));
    for (const u of units) {
      if (Math.hypot(u.x - 10, u.z + 5) <= 6) expect(found.has(u)).toBe(true);
    }
  });
});

describe('performance', () => {
  it('steps a 1000-unit battle quickly', () => {
    const w = new World({ seed: 11 });
    for (let i = 0; i < 500; i++) w.addUnit(UNITS[i % UNITS.length].id, 0, -30 + (i % 25) * 1.4, -20 + Math.floor(i / 25) * 2);
    for (let i = 0; i < 500; i++) w.addUnit(UNITS[(i + 7) % UNITS.length].id, 1, 30 - (i % 25) * 1.4, -20 + Math.floor(i / 25) * 2);
    w.start();
    for (let i = 0; i < 120; i++) w.step(STEP); // warm-up into contact
    const t0 = performance.now();
    const n = 300;
    for (let i = 0; i < n; i++) w.step(STEP);
    const avg = (performance.now() - t0) / n;
    expect(avg).toBeLessThan(8);
  });
});
