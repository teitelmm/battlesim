// Damage, attacks, projectiles, beams and special abilities.
import { GRAVITY } from './constants.js';
import { pushRagdoll } from './ragdoll.js';

const cand = [];

export function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function localToWorld(u, m) {
  const s = u.def.scale, c = Math.cos(u.facing), sn = Math.sin(u.facing);
  const lx = m[0] * s, ly = m[1] * s, lz = m[2] * s;
  return [u.x + lx * c + lz * sn, u.y + ly, u.z - lx * sn + lz * c];
}

// Vertical overlap check so ground melee can only hit flyers when they swoop low.
export function canReach(u, t) {
  return t.y <= u.y + u.def.height * 0.8 && u.y <= t.y + t.def.height * 0.8;
}

export function inRange(u, t) {
  const w = u.def.weapon;
  const d = Math.hypot(t.x - u.x, t.z - u.z);
  if (w.type === 'melee') return d - u.radius - t.radius <= w.range && canReach(u, t);
  if (w.minRange && d < w.minRange) return false;
  return d <= w.range;
}

export function applyDamage(world, t, amount, fromX, fromZ, kb, launch, attacker, ranged) {
  if (!t.alive) return false;
  const d = t.def;
  if (ranged && d.traits.block && t.attackT < 0 && world.rng.next() < d.traits.block) {
    const ang = Math.atan2(fromX - t.x, fromZ - t.z);
    if (Math.abs(angleDiff(ang, t.facing)) < 1.1) {
      world.emit({ type: 'block', x: t.x, y: t.y + d.height * 0.6, z: t.z });
      return false;
    }
  }
  if (d.traits.armor) amount *= 1 - d.traits.armor;
  if (t.shield > 0) {
    const absorbed = Math.min(t.shield, amount);
    t.shield -= absorbed;
    amount -= absorbed;
  }
  t.hp -= amount;
  t.hitTime = world.time;
  let dx = t.x - fromX, dz = t.z - fromZ;
  const l = Math.hypot(dx, dz);
  if (l > 1e-6) { dx /= l; dz /= l; } else { dx = Math.sin(t.facing + Math.PI); dz = Math.cos(t.facing + Math.PI); }
  t.hitDirX = dx; t.hitDirZ = dz;
  const imp = kb / t.mass;
  if (imp > 0) {
    t.vx += dx * imp;
    t.vz += dz * imp;
    if (d.traits.flying) {
      t.vy += imp * 0.3;
    } else if (launch && imp > 1.5) {
      t.vy = Math.max(t.vy, imp * 0.6);
      t.airborne = true;
      t.y = Math.max(t.y, 0.01);
    }
  }
  if (attacker) attacker.damageDealt += amount;
  if (t.hp <= 0) world.killUnit(t, dx, dz, imp, attacker);
  return true;
}

// Area damage around a point, falling off to 50% at the edge. Hits enemies of `team`.
export function areaDamage(world, x, y, z, r, dmg, kb, launch, team, attacker, fx) {
  const n = world.grid.query(x, z, r + world.maxRadius, cand);
  for (let i = 0; i < n; i++) {
    const e = cand[i];
    if (!e.alive || e.team === team) continue;
    const d = Math.hypot(e.x - x, e.z - z) - e.radius;
    if (d > r) continue;
    if (e.y > y + r || e.y + e.def.height < y - r) continue;
    const f = 1 - 0.5 * Math.max(0, d) / r;
    applyDamage(world, e, dmg * f, x, z, kb * f, launch, attacker, false);
  }
  for (const rd of world.ragdolls) {
    const p = rd.pos;
    const dx = p[0] - x, dz = p[2] - z;
    if (dx * dx + dz * dz < (r + 3) * (r + 3)) pushRagdoll(rd, x, y - 0.5, z, r + 1, kb * 1.5 + 6);
  }
  if (fx) world.emit({ type: fx, x, y, z, r });
}

// ---------------------------------------------------------------------------- attacks

export function updateAttack(world, u, dt) {
  const w = u.def.weapon;
  u.cooldown -= dt;
  if (u.attackT >= 0) {
    u.attackT += dt;
    if (!u.attackFired && u.attackT >= w.windup) {
      u.attackFired = true;
      fireWeapon(world, u);
    }
    if (w.type === 'beam' && u.channel > 0) {
      updateBeam(world, u, dt);
      if (u.channel <= 0) u.attackT = Math.max(u.attackT, w.windup + w.duration);
    }
    if (u.attackT >= u.attackDur) { u.attackT = -1; u.channel = 0; u.beamTarget = null; }
    return;
  }
  const t = u.target;
  if (!t || !t.alive || u.cooldown > 0 || u.stun > 0 || u.airborne) return;
  if (!inRange(u, t)) return;
  if (Math.abs(angleDiff(u.desiredFacing, u.facing)) > 0.6) return;
  u.attackT = 0;
  u.attackFired = false;
  u.cooldown = w.cooldown;
  u.swingCount++;
  u.attackDur = w.windup + (w.type === 'beam' ? w.duration : 0) + w.recover;
}

function fireWeapon(world, u) {
  const w = u.def.weapon;
  const t = u.target;
  if (w.type === 'beam') {
    u.channel = w.duration;
    u.beamTarget = t && t.alive ? t : null;
    return;
  }
  if (!t || !t.alive) return;
  if (w.type === 'melee') meleeStrike(world, u, t, w);
  else if (w.type === 'projectile') spawnProjectile(world, u, t, w);
  else if (w.type === 'hitscan') fireHitscan(world, u, t, w);
}

function meleeStrike(world, u, t, w) {
  let dmg = w.damage, kb = w.knockback, launch = !!w.launch;
  const charge = u.def.traits.charge;
  if (charge && u.charging) {
    dmg *= charge.mult;
    kb = charge.knockback;
    launch = true;
    u.charging = false;
    u.chargeCd = charge.cooldown;
  }
  let hitAny = false;
  if (w.cleave) {
    const reach = w.range * 1.2 + u.radius;
    const n = world.grid.query(u.x, u.z, reach + world.maxRadius, cand);
    for (let i = 0; i < n; i++) {
      const e = cand[i];
      if (!e.alive || e.team === u.team || !canReach(u, e)) continue;
      const dx = e.x - u.x, dz = e.z - u.z;
      const d = Math.hypot(dx, dz);
      if (d - e.radius > reach) continue;
      if (Math.abs(angleDiff(Math.atan2(dx, dz), u.facing)) > w.cleave.arc) continue;
      applyDamage(world, e, dmg, u.x, u.z, kb, launch, u, false);
      hitAny = true;
    }
  } else if (Math.hypot(t.x - u.x, t.z - u.z) - u.radius - t.radius <= w.range * 1.4 && canReach(u, t)) {
    applyDamage(world, t, dmg, u.x, u.z, kb, launch, u, false);
    hitAny = true;
  }
  if (!hitAny) return;
  const hy = t.y + t.def.height * 0.6;
  world.emit({ type: 'hit', x: t.x, y: hy, z: t.z, big: kb > 8 });
  if (w.splash) areaDamage(world, t.x, t.y, t.z, w.splash, dmg * 0.35, kb * 0.6, launch, u.team, u, 'shockwave');
  const blink = u.def.traits.blink;
  if (blink) {
    let dx = t.x - u.x, dz = t.z - u.z;
    const d = Math.hypot(dx, dz) || 1;
    dx /= d; dz /= d;
    const x1 = u.x, z1 = u.z;
    const along = d + t.radius + u.radius + blink.dist;
    u.x = clampArena(world, u.x + dx * along);
    u.z = clampArena(world, u.z + dz * along);
    u.facing += Math.PI;
    world.emit({ type: 'blink', x1, z1, x2: u.x, z2: u.z, y: u.y + u.def.height * 0.5, team: u.team });
  }
}

function clampArena(world, v) {
  return Math.max(-world.half, Math.min(world.half, v));
}

function spawnProjectile(world, u, t, w) {
  const P = w.projectile;
  const rng = world.rng;
  const [mx, my, mz] = localToWorld(u, w.muzzle);
  let ax = t.x, az = t.z;
  const ay = t.y + t.def.height * 0.5;
  let d = Math.hypot(ax - mx, az - mz);
  const lead = (d / P.speed) * 0.8;
  ax += t.vx * lead;
  az += t.vz * lead;
  d = Math.hypot(ax - mx, az - mz) || 0.01;
  const yaw = Math.atan2(ax - mx, az - mz) + rng.range(-1, 1) * P.spread;
  d *= 1 + rng.range(-1, 1) * P.spread;
  const hx = Math.sin(yaw), hz = Math.cos(yaw);
  let vh, vy;
  const v = P.speed;
  if (P.arc) {
    const g = P.gravity, h = ay - my;
    const disc = v ** 4 - g * (g * d * d + 2 * h * v * v);
    let ang = Math.PI / 4;
    if (disc >= 0) {
      const root = Math.sqrt(disc);
      ang = Math.atan((v * v + (P.arc === 'high' ? root : -root)) / (g * d));
    }
    vh = v * Math.cos(ang);
    vy = v * Math.sin(ang);
  } else {
    const h = ay - my;
    const l = Math.hypot(d, h);
    vh = (v * d) / l;
    vy = (v * h) / l + (P.gravity * (l / v)) / 2;
  }
  world.projectiles.push({
    x: mx, y: my, z: mz, vx: hx * vh, vy, vz: hz * vh, g: P.gravity,
    team: u.team, dmg: w.damage, splash: P.splash || 0, kb: w.knockback, launch: !!w.launch,
    kind: P.kind, r: P.radius, life: 8, owner: u,
  });
  world.emit({ type: 'launch', kind: P.kind, x: mx, y: my, z: mz });
}

function fireHitscan(world, u, t, w) {
  const rng = world.rng;
  const [mx, my, mz] = localToWorld(u, w.muzzle);
  let ex = t.x, ey = t.y + t.def.height * 0.6, ez = t.z;
  const d = Math.hypot(t.x - u.x, t.z - u.z);
  let p = w.accuracy * (1 - 0.35 * Math.min(1, d / w.range));
  if (t.airborne || t.def.traits.flying) p *= 0.85;
  const hit = rng.next() < p;
  if (hit) {
    applyDamage(world, t, w.damage, u.x, u.z, w.knockback, w.launch, u, true);
  } else {
    ex += rng.range(-1.5, 1.5);
    ey += rng.range(-0.8, 1.2);
    ez += rng.range(-1.5, 1.5);
    ex = mx + (ex - mx) * 1.4; ey = my + (ey - my) * 1.4; ez = mz + (ez - mz) * 1.4;
  }
  world.emit({ type: 'tracer', kind: w.tracer, x1: mx, y1: my, z1: mz, x2: ex, y2: ey, z2: ez, hit });
}

function updateBeam(world, u, dt) {
  const w = u.def.weapon;
  u.channel -= dt;
  let t = u.beamTarget;
  if (!t || !t.alive || Math.hypot(t.x - u.x, t.z - u.z) > w.range * 1.1) {
    t = world.nearestEnemy(u, w.range);
    u.beamTarget = t;
    if (!t) { u.channel = 0; return; }
  }
  const [ox, oy, oz] = localToWorld(u, w.muzzle);
  let dx = t.x - ox, dy = t.y + t.def.height * 0.5 - oy, dz = t.z - oz;
  const dist = Math.hypot(dx, dy, dz) || 1;
  dx /= dist; dy /= dist; dz /= dist;
  const len = Math.min(w.range, dist + 5);
  const ex = ox + dx * len, ey = Math.max(0, oy + dy * len), ez = oz + dz * len;
  u.beamX = ex; u.beamY = ey; u.beamZ = ez;
  u.desiredFacing = Math.atan2(t.x - u.x, t.z - u.z);
  const enemies = world.teams[1 - u.team];
  const sx = ex - ox, sy = ey - oy, sz = ez - oz;
  const sl2 = sx * sx + sy * sy + sz * sz || 1;
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    if (!e.alive) continue;
    const cx = e.x - ox, cy = e.y + e.def.height * 0.5 - oy, cz = e.z - oz;
    const k = Math.max(0, Math.min(1, (cx * sx + cy * sy + cz * sz) / sl2));
    const px = cx - sx * k, py = cy - sy * k, pz = cz - sz * k;
    const reach = w.width + e.radius + e.def.height * 0.3;
    if (px * px + py * py + pz * pz > reach * reach) continue;
    applyDamage(world, e, w.dps * dt, ox, oz, 0, false, u, false);
    e.vx += (dx * w.knockback * dt) / e.mass;
    e.vz += (dz * w.knockback * dt) / e.mass;
  }
  u.beamSpark = (u.beamSpark || 0) - dt;
  if (u.beamSpark <= 0) {
    u.beamSpark = 0.06;
    world.emit({ type: 'beamHit', x: t.x, y: t.y + t.def.height * 0.5, z: t.z });
  }
}

// ---------------------------------------------------------------------------- projectiles

export function updateProjectiles(world, dt) {
  const list = world.projectiles;
  let w = 0;
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    p.vy -= p.g * dt;
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    p.life -= dt;
    let dead = false;
    const n = world.grid.query(p.x, p.z, p.r + world.maxRadius, cand);
    for (let k = 0; k < n; k++) {
      const e = cand[k];
      if (!e.alive || e.team === p.team) continue;
      const dx = e.x - p.x, dz = e.z - p.z, rr = e.radius + p.r;
      if (dx * dx + dz * dz > rr * rr) continue;
      if (p.y < e.y - p.r || p.y > e.y + e.def.height + p.r) continue;
      if (p.splash > 0) {
        areaDamage(world, p.x, p.y, p.z, p.splash, p.dmg, p.kb, p.launch, p.team, p.owner, 'explosion');
      } else {
        const hit = applyDamage(world, e, p.dmg, p.x - p.vx * 0.2, p.z - p.vz * 0.2, p.kb, p.launch, p.owner, true);
        if (hit) world.emit({ type: 'hit', x: p.x, y: p.y, z: p.z, big: false });
      }
      dead = true;
      break;
    }
    if (!dead && p.y <= 0) {
      if (p.splash > 0) {
        areaDamage(world, p.x, 0, p.z, p.splash, p.dmg, p.kb, p.launch, p.team, p.owner, 'explosion');
      } else {
        if (p.kind === 'arrow' || p.kind === 'spear') world.addDebris(p);
        world.emit({ type: 'dust', x: p.x, y: 0, z: p.z, r: 0.4 });
      }
      dead = true;
    }
    if (!dead && (p.life <= 0 || Math.abs(p.x) > world.half + 20 || Math.abs(p.z) > world.half + 20)) dead = true;
    if (!dead) list[w++] = p;
  }
  list.length = w;
}

// ---------------------------------------------------------------------------- abilities

export function updateAbilities(world, u, dt) {
  const tr = u.def.traits;
  if (u.castT >= 0) { u.castT += dt; if (u.castT > 0.8) u.castT = -1; }
  if (u.stompT >= 0) { u.stompT += dt; if (u.stompT > 0.6) u.stompT = -1; }
  if (tr.heal) {
    u.healCd -= dt;
    if (u.healCd <= 0) {
      const ally = world.mostInjuredAlly(u, tr.heal.radius);
      if (ally) {
        ally.hp = Math.min(ally.maxHp, ally.hp + tr.heal.amount);
        u.healCd = tr.heal.cooldown;
        u.castT = 0;
        world.emit({ type: 'heal', x1: u.x, y1: u.y + u.def.height, z1: u.z, x2: ally.x, y2: ally.y + ally.def.height * 0.6, z2: ally.z });
      } else {
        u.healCd = 0.3;
      }
    }
  }
  if (tr.aura) {
    u.auraCd -= dt;
    if (u.auraCd <= 0) {
      u.auraCd = tr.aura.cooldown;
      const r2 = tr.aura.radius * tr.aura.radius;
      let any = false;
      for (const a of world.teams[u.team]) {
        if (!a.alive) continue;
        const dx = a.x - u.x, dz = a.z - u.z;
        if (dx * dx + dz * dz > r2) continue;
        a.shield = Math.min(tr.aura.max, a.shield + tr.aura.shield);
        any = true;
      }
      if (any) { u.castT = 0; world.emit({ type: 'aura', x: u.x, y: u.y + 1, z: u.z, r: tr.aura.radius, team: u.team }); }
    }
  }
  if (tr.stomp) {
    u.stompCd -= dt;
    if (u.stompCd <= 0 && !u.airborne) {
      const n = world.grid.query(u.x, u.z, u.radius + tr.stomp.trigger + world.maxRadius, cand);
      let near = false;
      for (let i = 0; i < n && !near; i++) {
        const e = cand[i];
        if (e.alive && e.team !== u.team && Math.hypot(e.x - u.x, e.z - u.z) - e.radius - u.radius < tr.stomp.trigger && e.y < 2) near = true;
      }
      if (near) {
        u.stompCd = tr.stomp.cooldown;
        u.stompT = 0;
        areaDamage(world, u.x, 0, u.z, tr.stomp.radius, tr.stomp.damage, tr.stomp.knockback, true, u.team, u, 'shockwave');
      } else {
        u.stompCd = 0.2;
      }
    }
  }
  if (tr.trample) {
    u.trampleCd -= dt;
    if (u.trampleCd <= 0 && u.speedNow > 1 && !u.airborne) {
      u.trampleCd = tr.trample.cooldown;
      const fx = u.x + Math.sin(u.facing) * u.radius * 0.8;
      const fz = u.z + Math.cos(u.facing) * u.radius * 0.8;
      areaDamage(world, fx, 0, fz, u.radius * 0.9, tr.trample.damage, tr.trample.knockback, true, u.team, u, null);
    }
  }
  if (tr.leap) {
    u.leapCd -= dt;
    const t = u.target;
    if (u.leapCd <= 0 && !u.airborne && u.attackT < 0 && u.stun <= 0 && t && t.alive) {
      const d = Math.hypot(t.x - u.x, t.z - u.z);
      if (d >= tr.leap.min && d <= tr.leap.max) startLeap(world, u, t, d);
    }
  }
  if (tr.charge) u.chargeCd -= dt;
}

function startLeap(world, u, t, d) {
  const T = Math.max(0.55, Math.min(1.1, d / 14));
  let tx = t.x + t.vx * T * 0.5, tz = t.z + t.vz * T * 0.5;
  const dx = tx - u.x, dz = tz - u.z;
  const l = Math.hypot(dx, dz) || 1;
  const back = (t.radius + u.radius) * 0.6;
  tx -= (dx / l) * back; tz -= (dz / l) * back;
  u.vx = (tx - u.x) / T;
  u.vz = (tz - u.z) / T;
  u.vy = (GRAVITY * T) / 2;
  u.airborne = true;
  u.leaping = true;
  u.y = 0.01;
  u.leapCd = u.def.traits.leap.cooldown;
  world.emit({ type: 'leap', x: u.x, y: 0, z: u.z });
}

export function leapSlam(world, u) {
  const L = u.def.traits.leap;
  areaDamage(world, u.x, 0, u.z, L.radius, L.damage, L.knockback, true, u.team, u, 'shockwave');
  u.stompT = 0;
}
