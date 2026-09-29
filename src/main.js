import { Renderer } from './render/Renderer.js';
import { Game } from './Game.js';
import { UI } from './ui/UI.js';
import { bindInput } from './ui/input.js';
import { Sfx } from './audio/Sfx.js';
import { UNITS } from './data/units.js';
import { formation } from './data/presets.js';
import { ARENA_HALF } from './sim/constants.js';
import { autosave, loadAutosave } from './io/armyCodec.js';

const rep = (id, n) => Array(n).fill(id);
function starterArmies() {
  return [
    ...formation([...rep('clubber', 16), ...rep('spear_thrower', 8), 'mammoth'], 0, 12),
    ...formation([...rep('swordsman', 10), ...rep('archer', 8), ...rep('knight', 2)], 1, 12),
  ];
}

function fail(msg) {
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;inset:0;display:grid;place-items:center;background:#1b2130;color:#fff;font:16px system-ui;padding:24px;text-align:center';
  el.textContent = msg;
  document.body.appendChild(el);
}

function boot() {
  const canvas = document.getElementById('view');
  let renderer;
  try {
    renderer = new Renderer(canvas, { arenaHalf: ARENA_HALF });
  } catch (e) {
    console.error(e);
    fail('BattleSim needs WebGL, which is not available in this browser.');
    return;
  }
  const game = new Game(renderer);
  const sfx = new Sfx();
  const ui = new UI(game, renderer, sfx);
  const input = bindInput({ canvas, game, renderer, ui, sfx });

  const saved = loadAutosave();
  game.setPlacement(saved.length ? saved : starterArmies());

  let saveTimer = 0;
  game.onChange((reason) => {
    if (reason !== 'placement') return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => autosave(game.placement), 400);
  });

  try {
    if (localStorage.getItem('battlesim.seenHelp') !== '1') {
      ui.openHelp();
      localStorage.setItem('battlesim.seenHelp', '1');
    }
  } catch { /* storage blocked: skip first-run help */ }

  // Unit portraits for the palette (falls back to emoji if this fails).
  setTimeout(() => {
    try { ui.setThumbnails(renderer.makeThumbnails(UNITS, 0)); } catch (e) { console.warn('Thumbnail rendering failed', e); }
  }, 50);

  window.addEventListener('resize', () => renderer.resize());

  let last = performance.now();
  let hudTimer = 0;
  function frame(now) {
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    game.update(dt);
    const world = game.world;
    if (world.events.length) for (const e of world.events) sfx.event(e);
    hudTimer -= dt;
    if (hudTimer <= 0 && game.state !== 'edit') { hudTimer = 0.2; ui.refresh('counts'); }
    const hover = input.state.hover;
    renderer.render(world, dt, {
      animDt: game.animDt(dt),
      hover,
      eraseHover: ui.tool === 'erase',
      ghosts: input.ghosts(),
    });
    sfx.beamHum(!game.paused && game.state !== 'edit' && world.units.some((u) => u.channel > 0));
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // Debug/test hook.
  window.__battlesim = { game, renderer, ui, input };
}

boot();
