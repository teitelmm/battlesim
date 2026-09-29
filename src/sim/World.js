// The battle simulation. Deterministic fixed-step, independent of rendering, so it runs
// the same in the browser, in unit tests and in the headless balance script.
import { ARENA_HALF, GRAVITY, MAX_RAGDOLLS, MAX_DEBRIS, BATTLE_TIME_LIMIT, MAX_UNITS } from './constants.js';
import { createRng } from './rng.js';
import { SpatialGrid } from './SpatialGrid.js';
import { getUnitDef } from '../data/units.js';
import { updateAI } from './ai.js';
import { updateAttack, updateAbilities, updateProjectiles, applyDamage, leapSlam, angleDiff } from './combat.js';
import { createRagdoll, stepRagdoll } from './ragdoll.js';

const cand = [];

export class World {
  constructor({ seed = 1, arenaHalf = ARENA_HALF } = {}) {
    this.seed = seed;
    this.rng = createRng(seed);
    this.half = arenaHalf;
    this.units = [];
    this.teams = [[], []];
    this.projectiles = [];
    this.ragdolls = [];
    this.debris = [];
    this.grid = new SpatialGrid(arenaHalf + 8, 3);
    this.maxRadius = 0.5;
    this.time = 0;
    this.started = false;
    this.over = false;
    this.winner = null; // 0 | 1 | 'draw'
    this.nextId = 1;
    this.events = null; // set to [] by a consumer that wants effect events
    this.kills = [0, 0];
  }

  emit(e) {
    if (this.events) this.events.push(e);
  }

  addUnit(defId, team, x, z, facing) {
    const def = getUnitDef(defId);
    if (!def || (team !== 0 && team !== 1) || this.units.length >= MAX_UNITS) return null;
    const h = this.half;
    const u = {
      id: this.nextId++, def, team,
      x: Math.max(-h, Math.min(h, x)), z: Math.max(-h, Math.min(h, z)), y: def.traits.flying ? def.traits.flying.altitude : 0,
      vx: 0, vy: 0, vz: 0,
      facing: facing ?? (team === 0 ? Math.PI / 2 : -Math.PI / 2),
      desiredFacing: 0,
      radius: def.radius, mass: def.mass,
      hp: def.hp, maxHp: def.hp, shield: 0,
      alive: true,
      target: null, follow: null, scan: 0,
      dvx: 0, dvz: 0, speedNow: 0, aiming: false,
      cooldown: 0, attackT: -1, attackDur: 0, attackFired: false, swingCount: 0,
      channel: 0, beamTarget: null, beamX: 0, beamY: 0, beamZ: 0,
      stun: 0, airborne: false, leaping: false, charging: false, altTarget: 0,
      chargeCd: 0, leapCd: 2, stompCd: 0, trampleCd: 0, healCd: 0, auraCd: 0.5,
      castT: -1, stompT: -1, hitTime: -99, hitDirX: 0, hitDirZ: 0,
      skin: this.rng.int(4), damageDealt: 0, cheer: false,
    };
    u.desiredFacing = u.facing;
    this.units.push(u);
    if (def.radius > this.maxRadius) this.maxRadius = def.radius;
    return u;
  }

  removeUnit(u) {
    const i = this.units.indexOf(u);
    if (i >= 0) this.units.splice(i, 1);
  }

  start() {
    this.started = true;
    // Stagger initial attack timings a little so lines don't swing in perfect unison.
    for (const u of this.units) {
      u.cooldown = this.rng.next() * 0.4;
      u.scan = this.rng.next() * 0.2;
    }
    this.rebuild();
    this.checkWin();
  }

  countAlive(team) {
    let n = 0;
    for (const u of this.units) if (u.alive && u.team === team) n++;
    return n;
  }

  rebuild() {
    const t0 = this.teams[0], t1 = this.teams[1];
    t0.length = 0; t1.length = 0;
    for (const u of this.units) if (u.alive) (u.team === 0 ? t0 : t1).push(u);
    this.grid.build(this.units);
  }

  nearestEnemy(u, maxRange = Infinity) {
    let best = null, bd = maxRange * maxRange;
    for (const e of this.teams[1 - u.team]) {
      if (!e.alive) continue;
      const d = (e.x - u.x) ** 2 + (e.z - u.z) ** 2;
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  mostInjuredAlly(u, radius) {
    let best = null, worst = 0.97;
    const r2 = radius * radius;
    for (const a of this.teams[u.team]) {
      if (!a.alive) continue;
      const f = a.hp / a.maxHp;
      if (f >= worst) continue;
      if ((a.x - u.x) ** 2 + (a.z - u.z) ** 2 > r2) continue;
      worst = f; best = a;
    }
    return best;
  }

  killUnit(u, dx, dz, imp, attacker) {
    if (!u.alive) return;
    u.alive = false;
    u.hp = 0;
    u.channel = 0;
    if (attacker) this.kills[attacker.team]++;
    const push = 1.5 + imp * 0.9;
    const pop = 1.5 + imp * 0.5;
    const rd = createRagdoll(u, u.vx + dx * push, Math.max(u.vy, 0) + pop, u.vz + dz * push, dx * (1 + imp * 0.4), dz * (1 + imp * 0.4));
    this.ragdolls.push(rd);
    if (this.ragdolls.length > MAX_RAGDOLLS) this.ragdolls.shift();
    this.emit({ type: 'death', x: u.x, y: u.y + u.def.height, z: u.z, unit: u, ragdoll: rd });
  }

  addDebris(p) {
    const l = Math.hypot(p.vx, p.vy, p.vz) || 1;
    this.debris.push({ kind: p.kind, x: p.x, y: 0, z: p.z, dx: p.vx / l, dy: p.vy / l, dz: p.vz / l, life: 25 });
    if (this.debris.length > MAX_DEBRIS) this.debris.shift();
  }

  step(dt) {
    this.time += dt;
    this.rebuild();
    const units = this.units;
    if (this.started && !this.over) {
      for (let i = 0; i < units.length; i++) {
        const u = units[i];
        if (!u.alive) continue;
        updateAbilities(this, u, dt);
        if (!u.alive) continue;
        updateAI(this, u, dt);
        updateAttack(this, u, dt);
      }
    } else if (this.over) {
      for (const u of units) {
        u.dvx = 0; u.dvz = 0; u.attackT = -1; u.channel = 0;
        u.cheer = u.alive && u.team === this.winner;
        if (u.def.traits.flying) u.altTarget = u.def.traits.flying.altitude;
      }
    }
    for (let i = 0; i < units.length; i++) if (units[i].alive) this.integrate(units[i], dt);
    this.separate();
    updateProjectiles(this, dt);
    for (const r of this.ragdolls) stepRagdoll(r, dt);
    if (this.debris.length) {
      let w = 0;
      for (const d of this.debris) { d.life -= dt; if (d.life > 0) this.debris[w++] = d; }
      this.debris.length = w;
    }
    // Remove the fallen (their ragdolls live on).
    let w = 0;
    for (let i = 0; i < units.length; i++) if (units[i].alive) units[w++] = units[i];
    units.length = w;
    this.checkWin();
  }

  integrate(u, dt) {
    const def = u.def;
    const fly = def.traits.flying;
    if (fly) {
      const alt = this.started ? u.altTarget || fly.altitude : fly.altitude;
      const vyT = Math.max(-9, Math.min(7, (alt - u.y) * 3));
      u.vy += (vyT - u.vy) * Math.min(1, 4 * dt);
      u.y += u.vy * dt;
      if (u.y < 0) { u.y = 0; u.vy = 0; }
      this.steer(u, dt);
    } else if (u.airborne) {
      u.vy -= GRAVITY * dt;
      u.y += u.vy * dt;
      if (!u.leaping) { const k = 1 - 0.3 * dt; u.vx *= k; u.vz *= k; }
      if (u.y <= 0) this.land(u);
    } else {
      this.steer(u, dt);
    }
    u.x += u.vx * dt;
    u.z += u.vz * dt;
    const h = this.half;
    if (u.x < -h) { u.x = -h; u.vx = Math.max(0, u.vx); } else if (u.x > h) { u.x = h; u.vx = Math.min(0, u.vx); }
    if (u.z < -h) { u.z = -h; u.vz = Math.max(0, u.vz); } else if (u.z > h) { u.z = h; u.vz = Math.min(0, u.vz); }
    u.speedNow = Math.hypot(u.vx, u.vz);
    if (!u.airborne || fly) {
      let want = u.desiredFacing;
      if (!u.target && u.speedNow > 0.5) want = Math.atan2(u.vx, u.vz);
      const d = angleDiff(want, u.facing);
      const maxTurn = def.turnRate * dt;
      u.facing += Math.max(-maxTurn, Math.min(maxTurn, d));
    }
  }

  steer(u, dt) {
    if (u.stun > 0) {
      u.stun -= dt;
      const k = Math.min(1, 5 * dt);
      u.vx -= u.vx * k; u.vz -= u.vz * k;
      return;
    }
    const k = Math.min(1, u.def.accel * dt);
    u.vx += (u.dvx - u.vx) * k;
    u.vz += (u.dvz - u.vz) * k;
  }

  land(u) {
    const impact = -u.vy;
    u.y = 0; u.vy = 0; u.airborne = false;
    if (u.leaping) {
      u.leaping = false;
      u.vx *= 0.2; u.vz *= 0.2;
      leapSlam(this, u);
      return;
    }
    if (impact > 5) {
      u.stun = Math.min(1.5, 0.25 + impact * 0.05);
      this.emit({ type: 'dust', x: u.x, y: 0, z: u.z, r: u.radius * 1.5 });
      if (impact > 13) applyDamage(this, u, (impact - 13) * 4, u.x, u.z, 0, false, null, false);
    }
  }

  // Push overlapping units apart, heavier units shove lighter ones.
  separate() {
    const units = this.units;
    for (let i = 0; i < units.length; i++) {
      const a = units[i];
      if (!a.alive || a.y > 1.2) continue;
      const n = this.grid.query(a.x, a.z, a.radius + this.maxRadius, cand);
      for (let k = 0; k < n; k++) {
        const b = cand[k];
        if (b.id <= a.id || !b.alive || b.y > 1.2) continue;
        let dx = b.x - a.x, dz = b.z - a.z;
        let d2 = dx * dx + dz * dz;
        const min = a.radius + b.radius;
        if (d2 >= min * min) continue;
        if (d2 < 1e-8) { dx = this.rng.range(-0.01, 0.01); dz = this.rng.range(-0.01, 0.01); d2 = dx * dx + dz * dz + 1e-10; }
        const d = Math.sqrt(d2);
        const overlap = (min - d) * 0.6;
        const nx = dx / d, nz = dz / d;
        const wa = b.mass / (a.mass + b.mass);
        a.x -= nx * overlap * wa; a.z -= nz * overlap * wa;
        b.x += nx * overlap * (1 - wa); b.z += nz * overlap * (1 - wa);
      }
    }
  }

  checkWin() {
    if (!this.started || this.over) return;
    const a = this.countAlive(0), b = this.countAlive(1);
    if (a > 0 && b > 0 && this.time < BATTLE_TIME_LIMIT) return;
    this.over = true;
    this.winner = a === 0 && b === 0 ? 'draw' : a === 0 ? 1 : b === 0 ? 0 : 'draw';
    this.emit({ type: 'end', winner: this.winner });
  }
}
