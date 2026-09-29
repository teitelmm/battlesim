import { describe, it, expect } from 'vitest';
import {
  serializeArmy, validateArmy, encodeShareCode, decodeShareCode, CODE_PREFIX,
  saveSlot, loadSlots, deleteSlot, autosave, loadAutosave, cleanName,
} from '../src/io/armyCodec.js';
import { ARENA_HALF, MAX_UNITS } from '../src/sim/constants.js';

class MemStorage {
  constructor() { this.m = new Map(); }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) { this.m.set(k, String(v)); }
  removeItem(k) { this.m.delete(k); }
}

const army = [
  { defId: 'clubber', team: 0, x: -10.24, z: 3.33, facing: 1.5708 },
  { defId: 'mech', team: 1, x: 12, z: -4.5, facing: -1.5708 },
];

describe('validateArmy', () => {
  it('round-trips a serialized army', () => {
    const { units, dropped } = validateArmy(serializeArmy(army));
    expect(dropped).toBe(0);
    expect(units).toHaveLength(2);
    expect(units[0]).toMatchObject({ defId: 'clubber', team: 0, x: -10.2, z: 3.3 });
  });

  it('drops unknown units, bad teams and non-finite coordinates', () => {
    const { units, dropped } = validateArmy({
      v: 1,
      u: [['clubber', 0, 1, 1], ['dragon', 0, 1, 1], ['clubber', 7, 1, 1], ['clubber', 1, NaN, 0], 'junk', ['__proto__', 0, 1, 1], ['constructor', 1, 0, 0], ['archer', 1, 1e9, -1e9]],
    });
    expect(units.map((u) => u.defId)).toEqual(['clubber', 'archer']);
    expect(units[1].x).toBe(ARENA_HALF);
    expect(units[1].z).toBe(-ARENA_HALF);
    expect(dropped).toBe(6);
  });

  it('caps unit count', () => {
    const u = Array.from({ length: MAX_UNITS + 50 }, () => ['clubber', 0, 0, 0]);
    const res = validateArmy({ v: 1, u });
    expect(res.units).toHaveLength(MAX_UNITS);
    expect(res.dropped).toBe(50);
  });

  it('rejects garbage', () => {
    for (const bad of [null, 5, 'x', [], { v: 2, u: [] }, { v: 1 }, { v: 1, u: {} }]) {
      expect(() => validateArmy(bad)).toThrow();
    }
  });
});

describe('share codes', () => {
  it('encode/decode round trip', async () => {
    const code = await encodeShareCode(army);
    expect(code.startsWith(CODE_PREFIX)).toBe(true);
    const { units } = await decodeShareCode(`  ${code}\n`);
    expect(units).toHaveLength(2);
    expect(units[1].defId).toBe('mech');
  });

  it('rejects malformed codes with friendly errors', async () => {
    await expect(decodeShareCode('')).rejects.toThrow(/paste/i);
    await expect(decodeShareCode('hello world')).rejects.toThrow(/share code/i);
    await expect(decodeShareCode(`${CODE_PREFIX}@@@@`)).rejects.toThrow(/invalid characters/);
    await expect(decodeShareCode(`${CODE_PREFIX}AAAAAAAAAA`)).rejects.toThrow(/corrupted/);
    await expect(decodeShareCode(CODE_PREFIX + 'A'.repeat(500_000))).rejects.toThrow(/too long/);
    await expect(decodeShareCode(12)).rejects.toThrow();
  });

  it('refuses decompression bombs', async () => {
    // ~5 MB of zeros compresses to a few KB.
    const big = new Uint8Array(5_000_000);
    const stream = new Blob([big]).stream().pipeThrough(new CompressionStream('deflate-raw'));
    const packed = new Uint8Array(await new Response(stream).arrayBuffer());
    let s = '';
    for (const b of packed) s += String.fromCharCode(b);
    const code = CODE_PREFIX + btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    await expect(decodeShareCode(code)).rejects.toThrow(/too large/);
  });
});

describe('local storage slots', () => {
  it('saves, lists, overwrites and deletes', () => {
    const st = new MemStorage();
    saveSlot('My army', army, st);
    saveSlot('Other', army.slice(0, 1), st);
    saveSlot('My army', army.slice(1), st);
    const slots = loadSlots(st);
    expect(slots.map((s) => s.name)).toEqual(['My army', 'Other']);
    expect(slots[0].units).toHaveLength(1);
    deleteSlot('Other', st);
    expect(loadSlots(st).map((s) => s.name)).toEqual(['My army']);
  });

  it('survives corrupt storage', () => {
    const st = new MemStorage();
    st.setItem('battlesim.slots.v1', '{not json');
    expect(loadSlots(st)).toEqual([]);
    st.setItem('battlesim.slots.v1', JSON.stringify([{ name: 'ok', army: serializeArmy(army) }, { name: 'bad', army: 5 }, null, 7]));
    expect(loadSlots(st).map((s) => s.name)).toEqual(['ok']);
    st.setItem('battlesim.autosave.v1', '"oops"');
    expect(loadAutosave(st)).toEqual([]);
  });

  it('autosave round trip and name cleaning', () => {
    const st = new MemStorage();
    autosave(army, st);
    expect(loadAutosave(st)).toHaveLength(2);
    expect(cleanName('  hi\u0000there  ')).toBe('hithere');
    expect(cleanName('x'.repeat(100))).toHaveLength(40);
    expect(() => saveSlot('   ', army, st)).toThrow(/name/);
  });
});
