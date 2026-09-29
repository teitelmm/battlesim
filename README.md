# ⚔️ BattleSim: creative-mode battle simulator

A goofy 3D battle sandbox in the spirit of *Totally Accurate Battle Simulator*. Place
cavemen, knights, laser troopers and superheroes on a field, press **Start**, and watch
wobbly armies smash into each other, with floppy ragdolls, explosions and eye-beams.

Built with [three.js](https://threejs.org/) and plain JavaScript. It uses no game engine,
and the physics and ragdolls are custom and deterministic.

## Play

```bash
npm install
npm run dev        # open the printed http://localhost:5173 URL
```

`npm run build` produces a static site in `dist/` that you can host anywhere, including
GitHub Pages. It uses relative paths.

## The roster (20 units, 4 eras)

| Stone Age | Medieval | Modern & Sci-Fi | Superheroes |
|---|---|---|---|
| Clubber | Swordsman (blocks projectiles) | Rifleman | Skyblazer (flies, dive punches) |
| Spear Thrower | Archer | Sniper | Bulwark (leap slam) |
| Rock Slinger | Knight (mounted charge) | Laser Trooper | Beamer (piercing eye-beam) |
| Shaman (heals) | Catapult (siege splash) | Rocket Soldier (splash) | Streak (speedster dash-through) |
| Mammoth (trample) | Berserker (cleave) | Battle Mech (minigun + stomp) | Guardian (shields allies) |

The superheroes are original characters. Hover a unit card to see its stats and special
abilities. Gold costs are shown so you can set up fair fights, but creative mode has no
budget.

## Controls

| Input | Action |
|---|---|
| Click / click-drag | Place one unit / paint a line of units |
| Right-drag (left-drag during battle) | Orbit camera |
| Middle-drag, WASD / arrows | Pan |
| Wheel | Zoom |
| Q / E | Rotate camera |
| Space | Start / pause |
| R | Reset to your setup |
| T | Switch team |
| X | Eraser (Delete removes the hovered unit) |
| 1–5 | Pick a unit in the current era |
| F | Follow a random fighter |
| C | Recenter camera |
| M | Mute |

On touch screens, tap or drag to place and use two fingers to rotate and zoom.

**💾 Save/Load** stores named setups in your browser (localStorage), includes ready-made
scenarios, and makes **share codes**: compact strings you can paste to a friend. Your
current setup is also autosaved. **🎲** deploys random equal-budget armies.

## How it works

```
src/
  sim/        deterministic fixed-step simulation (no three.js)
    World.js      units, physics, separation, win check
    combat.js     melee/projectiles/hitscan/beams, splash, knockback, abilities
    ai.js         targeting + steering
    ragdoll.js    Verlet ragdolls for fallen units
    SpatialGrid.js
  anim/skeleton.js  13-joint skeleton shared by posing (living) and ragdolls (dead)
  data/       units.js (stats), looks.js (visuals), presets.js (formations/scenarios)
  render/     three.js renderer: every body part is an instanced primitive
  ui/         palette, HUD, modals, input
  io/armyCodec.js  save slots + share codes (validated, size-limited)
  audio/Sfx.js     procedural WebAudio sound effects
```

* **Everything is data-driven.** A unit is a stats block in `src/data/units.js` plus a list
  of primitive parts attached to skeleton bones in `src/data/looks.js`. To add a unit,
  add an entry to both.
* **Rendering is a handful of draw calls.** Parts are grouped by shape into
  `InstancedMesh`es, so a 1,000-unit battle is about 25 draw calls.
* **The sim is renderer-independent.** It runs identically in the browser, in tests and in
  the headless balance script. A 1,000-unit battle steps in about 1.5 ms.

## Development

```bash
npm test           # vitest: sim, combat, ragdolls, save/load + share-code validation
npm run balance    # headless equal-gold round-robin; prints each unit's win rate
npm run smoke      # Playwright end-to-end test (headless Chromium, software WebGL)
```

`npm run balance -- 6000 3` sets the budget per side and the number of seeds. Use it
after changing numbers in `src/data/units.js`.

The smoke test needs a Chromium that Playwright can find. Run `npx playwright install
chromium` once if you don't already have one. It writes screenshots to `screenshots/`.
