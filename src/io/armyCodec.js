// Army setups: validation, share codes and localStorage slots.
// Imported data (share codes, storage) is treated as untrusted: unknown units are
// dropped, numbers clamped, sizes capped, and decompression output is size-limited.
import { getUnitDef } from '../data/units.js';
import { ARENA_HALF, MAX_UNITS } from '../sim/constants.js';

export const CODE_PREFIX = 'BSIM1.';
const PLAIN_PREFIX = 'BSIM0.';
export const MAX_CODE_LENGTH = 400_000;
const MAX_JSON_BYTES = 2_000_000;
const SLOTS_KEY = 'battlesim.slots.v1';
const AUTOSAVE_KEY = 'battlesim.autosave.v1';
const MAX_SLOTS = 30;
const MAX_NAME = 40;

const round = (v, k) => Math.round(v * k) / k;

export function serializeArmy(placement) {
  return { v: 1, u: placement.map((p) => [p.defId, p.team, round(p.x, 10), round(p.z, 10), round(p.facing ?? 0, 100)]) };
}

// Returns { units, dropped }. Throws Error with a user-facing message if unusable.
export function validateArmy(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw new Error('Not an army setup.');
  if (obj.v !== 1) throw new Error('Unsupported setup version.');
  if (!Array.isArray(obj.u)) throw new Error('Setup has no unit list.');
  const units = [];
  let dropped = 0;
  for (const e of obj.u) {
    if (units.length >= MAX_UNITS) { dropped++; continue; }
    if (!Array.isArray(e) || e.length < 4) { dropped++; continue; }
    const [id, team, x, z, facing] = e;
    if (typeof id !== 'string' || id.length > 40 || !getUnitDef(id)) { dropped++; continue; }
    if (team !== 0 && team !== 1) { dropped++; continue; }
    if (!Number.isFinite(x) || !Number.isFinite(z)) { dropped++; continue; }
    const f = Number.isFinite(facing) ? Math.max(-10, Math.min(10, facing)) : (team === 0 ? Math.PI / 2 : -Math.PI / 2);
    units.push({
      defId: id, team,
      x: Math.max(-ARENA_HALF, Math.min(ARENA_HALF, x)),
      z: Math.max(-ARENA_HALF, Math.min(ARENA_HALF, z)),
      facing: f,
    });
  }
  return { units, dropped };
}

// ------------------------------------------------------------------ base64url
function bytesToB64url(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlToBytes(str) {
  if (!/^[A-Za-z0-9_-]*$/.test(str)) throw new Error('Share code contains invalid characters.');
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4);
  let bin;
  try { bin = atob(b64); } catch { throw new Error('Share code is corrupted.'); }
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function pipeBytes(bytes, transform, limit) {
  const stream = new Blob([bytes]).stream().pipeThrough(transform);
  const reader = stream.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > limit) { await reader.cancel(); throw new Error('Share code is too large.'); }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}

const hasCompression = () => typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';

export async function encodeShareCode(placement) {
  const json = new TextEncoder().encode(JSON.stringify(serializeArmy(placement)));
  if (!hasCompression()) return PLAIN_PREFIX + bytesToB64url(json);
  const packed = await pipeBytes(json, new CompressionStream('deflate-raw'), MAX_JSON_BYTES);
  return CODE_PREFIX + bytesToB64url(packed);
}

export async function decodeShareCode(code) {
  if (typeof code !== 'string') throw new Error('Paste a share code first.');
  const c = code.trim();
  if (!c) throw new Error('Paste a share code first.');
  if (c.length > MAX_CODE_LENGTH) throw new Error('Share code is too long.');
  let jsonBytes;
  if (c.startsWith(CODE_PREFIX)) {
    if (!hasCompression()) throw new Error('This browser cannot read compressed share codes.');
    const bytes = b64urlToBytes(c.slice(CODE_PREFIX.length));
    try {
      jsonBytes = await pipeBytes(bytes, new DecompressionStream('deflate-raw'), MAX_JSON_BYTES);
    } catch (e) {
      throw new Error(e.message === 'Share code is too large.' ? e.message : 'Share code is corrupted.');
    }
  } else if (c.startsWith(PLAIN_PREFIX)) {
    jsonBytes = b64urlToBytes(c.slice(PLAIN_PREFIX.length));
    if (jsonBytes.length > MAX_JSON_BYTES) throw new Error('Share code is too large.');
  } else {
    throw new Error("That doesn't look like a BattleSim share code.");
  }
  let obj;
  try { obj = JSON.parse(new TextDecoder().decode(jsonBytes)); } catch { throw new Error('Share code is corrupted.'); }
  return validateArmy(obj);
}

// ------------------------------------------------------------------ localStorage
function defaultStorage() {
  try { return globalThis.localStorage || null; } catch { return null; }
}

function readJSON(storage, key) {
  try {
    const raw = storage && storage.getItem(key);
    if (!raw || raw.length > MAX_JSON_BYTES * 2) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

function writeJSON(storage, key, value) {
  try { storage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}

export function cleanName(name) {
  return String(name ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, MAX_NAME);
}

export function loadSlots(storage = defaultStorage()) {
  const raw = readJSON(storage, SLOTS_KEY);
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const s of raw.slice(0, MAX_SLOTS)) {
    if (!s || typeof s !== 'object') continue;
    const name = cleanName(s.name);
    if (!name) continue;
    try {
      const { units } = validateArmy(s.army);
      out.push({ name, savedAt: Number.isFinite(s.savedAt) ? s.savedAt : 0, units });
    } catch { /* skip corrupt slot */ }
  }
  return out;
}

export function saveSlot(name, placement, storage = defaultStorage()) {
  const n = cleanName(name);
  if (!n) throw new Error('Give your army a name.');
  if (!storage) throw new Error('Saving is unavailable in this browser.');
  const raw = readJSON(storage, SLOTS_KEY);
  const list = (Array.isArray(raw) ? raw : []).filter((s) => s && cleanName(s.name) !== n);
  list.unshift({ name: n, savedAt: Date.now(), army: serializeArmy(placement) });
  if (list.length > MAX_SLOTS) list.length = MAX_SLOTS;
  if (!writeJSON(storage, SLOTS_KEY, list)) throw new Error('Could not save (storage full or blocked).');
  return n;
}

export function deleteSlot(name, storage = defaultStorage()) {
  const raw = readJSON(storage, SLOTS_KEY);
  if (!Array.isArray(raw)) return;
  writeJSON(storage, SLOTS_KEY, raw.filter((s) => s && cleanName(s.name) !== cleanName(name)));
}

export function autosave(placement, storage = defaultStorage()) {
  if (storage) writeJSON(storage, AUTOSAVE_KEY, serializeArmy(placement));
}

export function loadAutosave(storage = defaultStorage()) {
  const raw = readJSON(storage, AUTOSAVE_KEY);
  if (!raw) return [];
  try { return validateArmy(raw).units; } catch { return []; }
}
