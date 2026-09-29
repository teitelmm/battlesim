// Game state machine: EDIT (place units) -> BATTLE -> RESULT, plus the placement list
// that Reset restores and save/load serialises.
import { World } from './sim/World.js';
import { STEP, ARENA_HALF, MAX_UNITS } from './sim/constants.js';
import { getUnitDef } from './data/units.js';

const MAX_STEPS_PER_FRAME = 12;

export class Game {
  constructor(renderer) {
    this.renderer = renderer;
    this.state = 'edit';
    this.placement = [];
    this.speed = 1;
    this.paused = false;
    this.acc = 0;
    this.listeners = new Set();
    this.world = this.makeWorld();
  }

  onChange(fn) { this.listeners.add(fn); }
  changed(reason) { for (const fn of this.listeners) fn(reason); }

  makeWorld() {
    const w = new World({ seed: (Math.random() * 2 ** 31) | 0 });
    w.events = [];
    for (const p of this.placement) {
      const u = w.addUnit(p.defId, p.team, p.x, p.z, p.facing);
      if (u) u.entry = p;
    }
    return w;
  }

  canPlace(def, x, z) {
    if (this.state !== 'edit' || this.placement.length >= MAX_UNITS) return false;
    if (Math.abs(x) > ARENA_HALF || Math.abs(z) > ARENA_HALF) return false;
    for (const u of this.world.units) {
      const min = (u.radius + def.radius) * 0.85;
      if ((u.x - x) ** 2 + (u.z - z) ** 2 < min * min) return false;
    }
    return true;
  }

  place(defId, team, x, z) {
    const def = getUnitDef(defId);
    if (!def || !this.canPlace(def, x, z)) return null;
    const entry = { defId, team, x, z, facing: team === 0 ? Math.PI / 2 : -Math.PI / 2 };
    const u = this.world.addUnit(defId, team, x, z, entry.facing);
    if (!u) return null;
    u.entry = entry;
    this.placement.push(entry);
    this.changed('placement');
    return u;
  }

  erase(u) {
    if (this.state !== 'edit' || !u) return;
    const i = this.placement.indexOf(u.entry);
    if (i >= 0) this.placement.splice(i, 1);
    this.world.removeUnit(u);
    this.changed('placement');
  }

  unitAt(x, z, pad = 0.35) {
    let best = null, bd = Infinity;
    for (const u of this.world.units) {
      const d = Math.hypot(u.x - x, u.z - z);
      if (d < u.radius + pad && d < bd) { bd = d; best = u; }
    }
    return best;
  }

  clearTeam(team) {
    if (this.state !== 'edit') this.reset();
    this.placement = this.placement.filter((p) => p.team !== team);
    this.world = this.makeWorld();
    this.changed('placement');
  }

  setPlacement(units) {
    this.placement = units.slice(0, MAX_UNITS).map((p) => ({ defId: p.defId, team: p.team, x: p.x, z: p.z, facing: p.facing }));
    this.state = 'edit';
    this.paused = false;
    this.world = this.makeWorld();
    this.renderer.effects.clear();
    this.renderer.setPlacementMode(true);
    this.changed('placement');
  }

  teamCounts() {
    const c = [0, 0];
    for (const p of this.placement) c[p.team]++;
    return c;
  }

  // Returns an error message or null.
  start() {
    if (this.state !== 'edit') return null;
    const [r, b] = this.teamCounts();
    if (!r || !b) return 'Place units on both teams first.';
    this.world.start();
    this.state = 'battle';
    this.paused = false;
    this.acc = 0;
    this.renderer.setPlacementMode(false);
    this.changed('state');
    return null;
  }

  reset() {
    this.state = 'edit';
    this.paused = false;
    this.world = this.makeWorld();
    this.renderer.effects.clear();
    this.renderer.follow = null;
    this.renderer.setPlacementMode(true);
    this.changed('state');
  }

  togglePause() {
    if (this.state === 'edit') return;
    this.paused = !this.paused;
    this.changed('pause');
  }

  setSpeed(s) {
    this.speed = s;
    this.changed('speed');
  }

  update(dt) {
    if (this.state === 'edit' || this.paused) return;
    this.acc += dt * this.speed;
    let n = 0;
    while (this.acc >= STEP && n < MAX_STEPS_PER_FRAME) {
      this.world.step(STEP);
      this.acc -= STEP;
      n++;
    }
    if (n === MAX_STEPS_PER_FRAME) this.acc = 0;
    if (this.state === 'battle' && this.world.over) {
      this.state = 'result';
      this.changed('result');
    }
  }

  animDt(dt) {
    if (this.state === 'edit') return dt;
    return this.paused ? 0 : dt * this.speed;
  }

  // Unit counts and gold value per team (alive units during battle).
  summary() {
    const out = [{ count: 0, cost: 0, total: 0 }, { count: 0, cost: 0, total: 0 }];
    for (const p of this.placement) {
      const d = getUnitDef(p.defId);
      out[p.team].total++;
      out[p.team].cost += d ? d.cost : 0;
    }
    if (this.state === 'edit') {
      out[0].count = out[0].total; out[1].count = out[1].total;
    } else {
      for (const u of this.world.units) if (u.alive) out[u.team].count++;
    }
    return out;
  }
}
