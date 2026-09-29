// Canvas pointer + keyboard handling: placement painting, erasing, shortcuts.
import { getUnitDef } from '../data/units.js';

const CAMERA_KEYS = new Set(['w', 'a', 's', 'd', 'q', 'e', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright']);

export function bindInput({ canvas, game, renderer, ui, sfx }) {
  const st = { hover: null, ground: null, inside: false, painting: false, erasing: false, last: null, pointerType: 'mouse' };

  const updateGround = (e) => {
    st.ground = renderer.groundAt(e.clientX, e.clientY);
    st.hover = st.ground && game.state === 'edit' ? game.unitAt(st.ground.x, st.ground.z) : null;
  };

  const paint = () => {
    const def = getUnitDef(ui.selected);
    const g = st.ground;
    if (!def || !g) return;
    const spacing = def.radius * 2.1;
    if (!st.last) {
      if (game.place(def.id, ui.team, g.x, g.z)) sfx.place();
      st.last = { x: g.x, z: g.z };
      return;
    }
    // Fill along the drag path at regular spacing so fast drags still make neat lines.
    let dx = g.x - st.last.x, dz = g.z - st.last.z;
    let d = Math.hypot(dx, dz);
    let placed = 0;
    while (d >= spacing && placed < 50) {
      const nx = st.last.x + (dx / d) * spacing, nz = st.last.z + (dz / d) * spacing;
      if (game.place(def.id, ui.team, nx, nz)) placed++;
      st.last = { x: nx, z: nz };
      dx = g.x - nx; dz = g.z - nz; d = Math.hypot(dx, dz);
    }
    if (placed) sfx.place();
  };

  const eraseHover = () => {
    if (st.hover) { game.erase(st.hover); st.hover = null; sfx.erase(); }
  };

  canvas.addEventListener('pointermove', (e) => {
    st.inside = true;
    st.pointerType = e.pointerType;
    updateGround(e);
    if (st.painting) paint();
    else if (st.erasing) eraseHover();
  });
  canvas.addEventListener('pointerleave', () => {
    st.inside = false; st.ground = null; st.hover = null;
  });
  canvas.addEventListener('pointerdown', (e) => {
    sfx.unlock();
    canvas.focus({ preventScroll: true });
    if (e.button !== 0 || game.state !== 'edit' || !e.isPrimary) return;
    st.pointerType = e.pointerType;
    updateGround(e);
    if (!st.ground) return;
    if (ui.tool === 'erase') { st.erasing = true; eraseHover(); } else { st.painting = true; st.last = null; paint(); }
  });
  const stop = () => { st.painting = false; st.erasing = false; st.last = null; };
  window.addEventListener('pointerup', stop);
  window.addEventListener('pointercancel', stop);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.tabIndex = 0;

  window.addEventListener('keydown', (e) => {
    const tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (ui.modalOpen()) {
      if (k === 'escape') ui.closeModals();
      return;
    }
    if (CAMERA_KEYS.has(k)) {
      renderer.keys.add(k);
      if (k.startsWith('arrow')) e.preventDefault();
      return;
    }
    switch (k) {
      case ' ':
        e.preventDefault();
        sfx.unlock();
        ui.startOrPause();
        break;
      case 'r': if (game.state !== 'edit') game.reset(); break;
      case 't': ui.setTeam(1 - ui.team); break;
      case 'x': ui.setTool(ui.tool === 'erase' ? 'place' : 'erase'); break;
      case 'delete': case 'backspace': if (st.hover) { game.erase(st.hover); st.hover = null; sfx.erase(); } break;
      case '1': case '2': case '3': case '4': case '5': ui.selectIndex(Number(k) - 1); break;
      case 'f': {
        const alive = game.world.units.filter((u) => u.alive);
        if (alive.length) renderer.follow = alive[Math.floor(Math.random() * alive.length)];
        break;
      }
      case 'c': renderer.resetCamera(); break;
      case 'm': ui.toggleSound(); break;
      case 'h': case '?': ui.openHelp(); break;
      case 'escape': renderer.follow = null; ui.setTool('place'); break;
      default:
    }
  });
  window.addEventListener('keyup', (e) => renderer.keys.delete(e.key.toLowerCase()));
  window.addEventListener('blur', () => renderer.keys.clear());

  return {
    state: st,
    // Ghost previews for the renderer.
    ghosts() {
      if (game.state !== 'edit' || !st.inside || !st.ground || ui.tool !== 'place' || st.pointerType === 'touch') return null;
      const def = getUnitDef(ui.selected);
      if (!def || !game.canPlace(def, st.ground.x, st.ground.z)) return null;
      return [{ def, team: ui.team, x: st.ground.x, z: st.ground.z, facing: ui.team === 0 ? Math.PI / 2 : -Math.PI / 2 }];
    },
  };
}
