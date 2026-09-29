// DOM user interface: palette, HUD, banner, save/load modal, help, tooltips, toasts.
import { UNITS } from '../data/units.js';
import { ERAS } from '../data/eras.js';
import { SCENARIOS, randomBattle } from '../data/presets.js';
import { TEAM_NAMES } from '../sim/constants.js';
import { encodeShareCode, decodeShareCode, loadSlots, saveSlot, deleteSlot } from '../io/armyCodec.js';

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function unitStats(def) {
  const w = def.weapon;
  let dps;
  if (w.type === 'beam') dps = (w.dps * w.duration) / Math.max(w.cooldown, w.windup + w.duration + w.recover);
  else dps = (w.damage / Math.max(w.cooldown, w.windup + w.recover)) * (w.accuracy ?? 1);
  const range = w.type === 'melee' ? 'Melee' : `${w.range} m`;
  return { hp: def.hp, dps: Math.round(dps), range, speed: def.speed };
}

export class UI {
  constructor(game, renderer, sfx) {
    this.game = game;
    this.renderer = renderer;
    this.sfx = sfx;
    this.team = 0;
    this.era = ERAS[0].id;
    this.selected = UNITS[0].id;
    this.tool = 'place';
    this.thumbs = {};
    this.bannerDismissed = false;

    this.buildEras();
    this.buildCards();
    this.bindTop();
    this.bindPalette();
    this.bindModals();
    game.onChange((reason) => this.refresh(reason));
    this.refresh('init');
  }

  setThumbnails(thumbs) {
    this.thumbs = thumbs;
    this.buildCards();
  }

  // ---------------------------------------------------------------- palette
  buildEras() {
    const box = $('#palette .eras');
    box.innerHTML = '';
    for (const era of ERAS) {
      const b = document.createElement('button');
      b.dataset.era = era.id;
      b.setAttribute('role', 'tab');
      b.textContent = `${era.icon} ${era.name}`;
      b.addEventListener('click', () => this.setEra(era.id));
      box.appendChild(b);
    }
    this.markEras();
  }

  markEras() {
    for (const b of document.querySelectorAll('#palette .eras button')) {
      const on = b.dataset.era === this.era;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', on);
    }
  }

  setEra(id) {
    this.era = id;
    this.markEras();
    this.buildCards();
    const first = UNITS.find((u) => u.era === id);
    if (first && !UNITS.some((u) => u.id === this.selected && u.era === id)) this.select(first.id);
  }

  eraUnits() { return UNITS.filter((u) => u.era === this.era); }

  buildCards() {
    const box = $('#palette .cards');
    box.innerHTML = '';
    const era = ERAS.find((e) => e.id === this.era);
    this.eraUnits().forEach((def, i) => {
      const b = document.createElement('button');
      b.className = 'card';
      b.dataset.id = def.id;
      b.setAttribute('role', 'option');
      const thumb = this.thumbs[def.id]
        ? `<img src="${this.thumbs[def.id]}" alt="" draggable="false">`
        : `<span class="emoji">${era ? era.icon : '⚔️'}</span>`;
      b.innerHTML = `<span class="key">${i + 1}</span>${thumb}<span class="name">${esc(def.name)}</span><span class="cost">${def.cost}g</span>`;
      b.addEventListener('click', () => { this.select(def.id); this.sfx.click(); });
      b.addEventListener('pointerenter', () => this.showTip(def, b));
      b.addEventListener('pointerleave', () => this.hideTip());
      box.appendChild(b);
    });
    this.markCards();
  }

  markCards() {
    for (const c of document.querySelectorAll('#palette .card')) {
      const on = c.dataset.id === this.selected && this.tool === 'place';
      c.classList.toggle('on', on);
      c.setAttribute('aria-selected', on);
    }
  }

  select(id) {
    this.selected = id;
    this.setTool('place');
    this.markCards();
  }

  selectIndex(i) {
    const list = this.eraUnits();
    if (list[i]) this.select(list[i].id);
  }

  setTeam(t) {
    this.team = t;
    for (const b of document.querySelectorAll('.team-toggle button')) b.classList.toggle('on', Number(b.dataset.team) === t);
    $('#clearTeamBtn').textContent = `Clear ${TEAM_NAMES[t]}`;
  }

  setTool(tool) {
    this.tool = tool;
    $('#eraseBtn').classList.toggle('on', tool === 'erase');
    $('#view').classList.toggle('erase', tool === 'erase');
    this.markCards();
  }

  showTip(def, anchor) {
    const tip = $('#tooltip');
    const s = unitStats(def);
    const traits = [];
    const tr = def.traits;
    if (tr.flying) traits.push('Flies');
    if (tr.heal) traits.push('Heals allies');
    if (tr.aura) traits.push('Shields allies');
    if (tr.block) traits.push('Blocks projectiles');
    if (tr.charge) traits.push('Charge attack');
    if (tr.leap) traits.push('Leap slam');
    if (tr.stomp) traits.push('Stomp');
    if (tr.trample) traits.push('Trample');
    if (tr.blink) traits.push('Dash-through');
    if (def.weapon.splash || def.weapon.projectile?.splash) traits.push('Splash damage');
    if (def.weapon.type === 'beam') traits.push('Piercing beam');
    tip.innerHTML = `<h4>${esc(def.name)} · <span style="color:var(--accent)">${def.cost}g</span></h4><p>${esc(def.blurb)}</p>
      <dl><dt>Health</dt><dd>${s.hp}</dd><dt>Damage/s</dt><dd>${s.dps}</dd><dt>Range</dt><dd>${s.range}</dd><dt>Speed</dt><dd>${s.speed} m/s</dd>
      ${traits.length ? `<dt>Special</dt><dd>${traits.join(', ')}</dd>` : ''}</dl>`;
    tip.hidden = false;
    const r = anchor.getBoundingClientRect();
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    tip.style.left = `${Math.max(8, Math.min(window.innerWidth - tw - 8, r.left + r.width / 2 - tw / 2))}px`;
    tip.style.top = `${Math.max(8, r.top - th - 8)}px`;
  }

  hideTip() { $('#tooltip').hidden = true; }

  bindPalette() {
    for (const b of document.querySelectorAll('.team-toggle button')) {
      b.addEventListener('click', () => { this.setTeam(Number(b.dataset.team)); this.sfx.click(); });
    }
    $('#eraseBtn').addEventListener('click', () => this.setTool(this.tool === 'erase' ? 'place' : 'erase'));
    $('#clearTeamBtn').addEventListener('click', () => {
      if (!this.game.teamCounts()[this.team]) return;
      this.game.clearTeam(this.team);
      this.toast(`${TEAM_NAMES[this.team]} army cleared`);
    });
    $('#clearAllBtn').addEventListener('click', () => {
      if (!this.game.placement.length) return;
      if (!confirm('Remove every unit from the field?')) return;
      this.game.setPlacement([]);
    });
    this.setTeam(0);
  }

  // ---------------------------------------------------------------- top bar
  bindTop() {
    $('#startBtn').addEventListener('click', () => this.startOrPause());
    $('#resetBtn').addEventListener('click', () => this.game.reset());
    for (const b of document.querySelectorAll('.speed button')) {
      b.addEventListener('click', () => this.game.setSpeed(Number(b.dataset.speed)));
    }
    $('#randomBtn').addEventListener('click', () => {
      this.game.setPlacement(randomBattle());
      this.toast('Random armies deployed. Press Start!');
    });
    $('#saveBtn').addEventListener('click', () => this.openModal());
    $('#helpBtn').addEventListener('click', () => this.openHelp());
    $('#soundBtn').addEventListener('click', () => this.toggleSound());
    $('#bannerReset').addEventListener('click', () => this.game.reset());
    $('#bannerWatch').addEventListener('click', () => { this.bannerDismissed = true; $('#banner').hidden = true; });
    this.updateSoundBtn();
  }

  toggleSound() {
    this.sfx.unlock();
    this.sfx.setMuted(!this.sfx.muted);
    this.updateSoundBtn();
  }

  updateSoundBtn() {
    $('#soundBtn').textContent = this.sfx.muted ? '🔇' : '🔊';
  }

  startOrPause() {
    const g = this.game;
    if (g.state === 'edit') {
      const err = g.start();
      if (err) this.toast(err);
    } else {
      g.togglePause();
    }
  }

  refresh(reason) {
    const g = this.game;
    const s = g.summary();
    const battle = g.state !== 'edit';
    $('#redCount').textContent = s[0].count;
    $('#blueCount').textContent = s[1].count;
    $('#redLabel').textContent = battle ? `/ ${s[0].total} alive` : 'units';
    $('#blueLabel').textContent = battle ? `/ ${s[1].total} alive` : 'units';
    $('#redCost').textContent = `${s[0].cost}g`;
    $('#blueCost').textContent = `${s[1].cost}g`;
    if (reason === 'counts') return;

    const start = $('#startBtn');
    start.textContent = g.state === 'edit' ? '▶ Start' : g.paused ? '▶ Resume' : '⏸ Pause';
    $('#resetBtn').disabled = g.state === 'edit';
    for (const b of document.querySelectorAll('.speed button')) b.classList.toggle('on', Number(b.dataset.speed) === g.speed);
    $('#palette').classList.toggle('hidden', battle);
    $('#battlehint').hidden = !battle || g.state === 'result';
    if (reason === 'state' || reason === 'init' || reason === 'placement') { this.bannerDismissed = false; $('#banner').hidden = true; }
    if (reason === 'result') this.showBanner();
    if (reason === 'state' && battle) this.hideTip();
  }

  showBanner() {
    if (this.bannerDismissed) return;
    const w = this.game.world;
    const h = $('#bannerTitle');
    h.className = '';
    if (w.winner === 'draw') {
      h.textContent = "It's a draw!";
    } else {
      h.textContent = `${TEAM_NAMES[w.winner]} wins!`;
      h.classList.add(w.winner === 0 ? 'red' : 'blue');
    }
    const s = this.game.summary();
    const alive = w.winner === 'draw' ? '' : `${s[w.winner].count} of ${s[w.winner].total} survived · `;
    $('#bannerStats').textContent = `${alive}${w.time.toFixed(1)} s of battle`;
    $('#banner').hidden = false;
  }

  // ---------------------------------------------------------------- modals
  bindModals() {
    for (const el of document.querySelectorAll('[data-close]')) {
      el.addEventListener('click', () => this.closeModals());
    }
    for (const id of ['#modal', '#help']) {
      $(id).addEventListener('pointerdown', (e) => { if (e.target === e.currentTarget) this.closeModals(); });
    }
    $('#saveConfirm').addEventListener('click', () => this.doSave());
    $('#saveName').addEventListener('keydown', (e) => { if (e.key === 'Enter') this.doSave(); e.stopPropagation(); });
    $('#shareCode').addEventListener('keydown', (e) => e.stopPropagation());
    $('#exportBtn').addEventListener('click', () => this.doExport());
    $('#copyBtn').addEventListener('click', () => this.doCopy());
    $('#importBtn').addEventListener('click', () => this.doImport());
    const box = $('#scenarioList');
    for (const sc of SCENARIOS) {
      const b = document.createElement('button');
      b.textContent = sc.name;
      b.addEventListener('click', () => {
        this.game.setPlacement(sc.build());
        this.closeModals();
        this.toast(`${sc.name} ready. Press Start!`);
      });
      box.appendChild(b);
    }
  }

  modalOpen() { return !$('#modal').hidden || !$('#help').hidden; }

  closeModals() { $('#modal').hidden = true; $('#help').hidden = true; }

  openHelp() { this.closeModals(); $('#help').hidden = false; }

  openModal() {
    this.closeModals();
    this.renderSlots();
    this.shareMsg('');
    $('#modal').hidden = false;
    setTimeout(() => $('#saveName').focus(), 0);
  }

  renderSlots() {
    const list = $('#slotList');
    const slots = loadSlots();
    list.innerHTML = '';
    if (!slots.length) {
      const li = document.createElement('li');
      li.className = 'empty';
      li.textContent = 'No saved setups yet.';
      list.appendChild(li);
      return;
    }
    for (const s of slots) {
      const li = document.createElement('li');
      const red = s.units.filter((u) => u.team === 0).length;
      const date = s.savedAt ? new Date(s.savedAt).toLocaleString() : '';
      li.innerHTML = `<div class="meta"><b></b><small>${red} red · ${s.units.length - red} blue · ${esc(date)}</small></div>`;
      li.querySelector('b').textContent = s.name;
      const load = document.createElement('button');
      load.textContent = 'Load';
      load.className = 'primary';
      load.addEventListener('click', () => { this.game.setPlacement(s.units); this.closeModals(); this.toast(`Loaded “${s.name}”`); });
      const del = document.createElement('button');
      del.textContent = 'Delete';
      del.addEventListener('click', () => { deleteSlot(s.name); this.renderSlots(); });
      li.append(load, del);
      list.appendChild(li);
    }
  }

  doSave() {
    try {
      if (!this.game.placement.length) throw new Error('Place some units before saving.');
      const name = saveSlot($('#saveName').value, this.game.placement);
      $('#saveName').value = '';
      this.renderSlots();
      this.toast(`Saved “${name}”`);
    } catch (e) {
      this.toast(e.message);
    }
  }

  shareMsg(text, kind = '') {
    const m = $('#shareMsg');
    m.textContent = text;
    m.className = `msg ${kind}`;
  }

  async doExport() {
    if (!this.game.placement.length) { this.shareMsg('Place some units first.', 'err'); return; }
    try {
      const code = await encodeShareCode(this.game.placement);
      $('#shareCode').value = code;
      this.shareMsg(`Code for ${this.game.placement.length} units ready. Copy it and share!`, 'ok');
    } catch {
      this.shareMsg('Could not create a code.', 'err');
    }
  }

  async doCopy() {
    const ta = $('#shareCode');
    if (!ta.value) await this.doExport();
    if (!ta.value) return;
    try {
      await navigator.clipboard.writeText(ta.value);
      this.shareMsg('Copied to clipboard.', 'ok');
    } catch {
      ta.select();
      this.shareMsg('Press Ctrl+C to copy.', 'ok');
    }
  }

  async doImport() {
    try {
      const { units, dropped } = await decodeShareCode($('#shareCode').value);
      if (!units.length) throw new Error('That code has no valid units.');
      this.game.setPlacement(units);
      this.closeModals();
      this.toast(`Imported ${units.length} units${dropped ? ` (${dropped} skipped)` : ''}`);
    } catch (e) {
      this.shareMsg(e.message, 'err');
    }
  }

  toast(text) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = text;
    $('#toasts').appendChild(t);
    setTimeout(() => t.remove(), 2700);
  }
}
