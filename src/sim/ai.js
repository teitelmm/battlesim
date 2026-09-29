// Per-unit decision making: pick a target and a desired velocity/facing.
export function pickTarget(world, u) {
  const enemies = world.teams[1 - u.team];
  const w = u.def.weapon;
  const melee = w.type === 'melee' && !u.def.traits.flying;
  const reach = u.def.height * 0.8;
  const minR2 = w.minRange ? w.minRange * w.minRange : 0;
  let best = null, bestScore = Infinity;
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    if (!e.alive) continue;
    const dx = e.x - u.x, dz = e.z - u.z;
    let s = dx * dx + dz * dz;
    if (melee && e.y > reach) s += 900;
    if (minR2 && s < minR2) s += 1e6;
    if (e === u.target) s *= 0.6;
    if (s < bestScore) { bestScore = s; best = e; }
  }
  return best;
}

export function updateAI(world, u, dt) {
  const def = u.def, w = def.weapon, tr = def.traits;
  u.scan -= dt;
  if (u.scan <= 0 || !u.target || !u.target.alive) {
    u.scan = 0.25 + world.rng.next() * 0.15;
    const prev = u.target;
    u.target = pickTarget(world, u);
    if (u.target !== prev) u.charging = false;
    if (def.role === 'support') u.follow = pickFollow(world, u);
  }
  u.dvx = 0; u.dvz = 0; u.aiming = false;
  const t = u.target;
  if (!t) { u.charging = false; return; }

  let dx = t.x - u.x, dz = t.z - u.z;
  const dist = Math.hypot(dx, dz) || 1e-6;
  dx /= dist; dz /= dist;
  const edge = dist - u.radius - t.radius;
  if (u.channel <= 0) u.desiredFacing = Math.atan2(dx, dz);
  let speed = def.speed;

  if (tr.flying) {
    const diving = u.cooldown <= 0.3 && dist < 10;
    u.altTarget = diving ? t.y + t.def.height * 0.4 : tr.flying.altitude;
  }

  if (def.role === 'support' && edge > 1.5 && supportMove(world, u, dx, dz)) return;

  if (tr.charge) {
    if (!u.charging && u.chargeCd <= 0 && edge > tr.charge.minDist) u.charging = true;
    if (u.charging) speed = tr.charge.speed;
  }

  let want;
  if (w.type === 'melee') {
    want = edge > w.range * 0.8;
  } else if (w.minRange && dist < w.minRange) {
    // Siege weapon too close: back away.
    u.dvx = -dx * speed; u.dvz = -dz * speed;
    return;
  } else {
    want = dist > w.range * 0.92;
    if (!want) u.aiming = true;
  }
  if (u.attackT >= 0) speed *= w.type === 'melee' ? 0.25 : 0;
  if (want) { u.dvx = dx * speed; u.dvz = dz * speed; }
}

function pickFollow(world, u) {
  let best = null, bestD = Infinity;
  for (const a of world.teams[u.team]) {
    if (!a.alive || a === u || a.def.role === 'support') continue;
    const d = (a.x - u.x) ** 2 + (a.z - u.z) ** 2 + (a.hp < a.maxHp * 0.7 ? -200 : 0);
    if (d < bestD) { bestD = d; best = a; }
  }
  return best;
}

// Healers trail a friendly fighter, staying on the far side from the enemy.
function supportMove(world, u, ex, ez) {
  const f = u.follow;
  if (!f || !f.alive) return false;
  const gx = f.x - ex * 3.5, gz = f.z - ez * 3.5;
  const dx = gx - u.x, dz = gz - u.z;
  const d = Math.hypot(dx, dz);
  if (d > 1) {
    const s = u.def.speed * Math.min(1, d / 3);
    u.dvx = (dx / d) * s; u.dvz = (dz / d) * s;
  }
  return true;
}
