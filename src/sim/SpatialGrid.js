// Uniform grid rebuilt every step with a counting sort. query() returns candidate units
// in the cells overlapping a circle; callers do the precise distance test.
export class SpatialGrid {
  constructor(half, cellSize) {
    this.half = half;
    this.cell = cellSize;
    this.n = Math.ceil((2 * half) / cellSize);
    const cells = this.n * this.n;
    this.start = new Int32Array(cells + 1);
    this.cursor = new Int32Array(cells);
    this.items = new Int32Array(256);
    this.keys = new Int32Array(256);
    this.units = [];
  }

  cellOf(v) {
    const c = Math.floor((v + this.half) / this.cell);
    return c < 0 ? 0 : c >= this.n ? this.n - 1 : c;
  }

  build(units) {
    const count = units.length;
    if (this.items.length < count) {
      this.items = new Int32Array(count * 2);
      this.keys = new Int32Array(count * 2);
    }
    const { start, cursor, keys, items, n } = this;
    start.fill(0);
    for (let i = 0; i < count; i++) {
      const u = units[i];
      const k = this.cellOf(u.x) + this.cellOf(u.z) * n;
      keys[i] = k;
      start[k + 1]++;
    }
    for (let c = 0; c < n * n; c++) start[c + 1] += start[c];
    cursor.set(start.subarray(0, n * n));
    for (let i = 0; i < count; i++) items[cursor[keys[i]]++] = i;
    this.units = units;
  }

  query(x, z, r, out) {
    const { n, start, items, units } = this;
    const x0 = this.cellOf(x - r), x1 = this.cellOf(x + r);
    const z0 = this.cellOf(z - r), z1 = this.cellOf(z + r);
    let m = 0;
    for (let cz = z0; cz <= z1; cz++) {
      for (let cx = x0; cx <= x1; cx++) {
        const k = cx + cz * n;
        for (let i = start[k], e = start[k + 1]; i < e; i++) out[m++] = units[items[i]];
      }
    }
    return m;
  }
}
