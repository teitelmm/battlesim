// One InstancedMesh per (primitive shape, material kind). Every unit, ragdoll and
// projectile is drawn by writing matrices + colours straight into these buffers, so a
// thousand-unit battle is still only a handful of draw calls.
import * as THREE from 'three';

function makeGeometries() {
  const arc = new THREE.TorusGeometry(0.5, 0.05, 6, 16, Math.PI);
  return {
    box: new THREE.BoxGeometry(1, 1, 1),
    sphere: new THREE.SphereGeometry(0.5, 12, 8),
    capsule: new THREE.CapsuleGeometry(0.25, 0.5, 3, 8),
    cylinder: new THREE.CylinderGeometry(0.5, 0.5, 1, 10),
    cone: new THREE.ConeGeometry(0.5, 1, 10),
    arc,
  };
}

export const SHAPES = ['box', 'sphere', 'capsule', 'cylinder', 'cone', 'arc'];

export class PartBatch {
  constructor(scene) {
    this.scene = scene;
    this.geoms = makeGeometries();
    // Capsule geometry is 0.5 wide x 1 tall; normalise so size [1,1,1] means 1x1x1.
    this.geoms.capsule.scale(2, 1, 2);
    this.materials = {
      std: new THREE.MeshStandardMaterial({ roughness: 0.78, metalness: 0.05 }),
      glow: new THREE.MeshBasicMaterial({ toneMapped: false }),
    };
    this.pools = new Map();
  }

  pool(shape, glow) {
    const key = glow ? `${shape}:glow` : shape;
    let p = this.pools.get(key);
    if (!p) {
      p = { key, shape, glow, mesh: null, capacity: 0, count: 0 };
      this.pools.set(key, p);
      this.grow(p, 512);
    }
    return p;
  }

  grow(p, capacity) {
    const mesh = new THREE.InstancedMesh(this.geoms[p.shape], p.glow ? this.materials.glow : this.materials.std, capacity);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
    mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.castShadow = !p.glow;
    mesh.receiveShadow = !p.glow;
    if (p.mesh) {
      mesh.instanceMatrix.array.set(p.mesh.instanceMatrix.array.subarray(0, p.count * 16));
      mesh.instanceColor.array.set(p.mesh.instanceColor.array.subarray(0, p.count * 3));
      this.scene.remove(p.mesh);
      p.mesh.dispose();
    }
    this.scene.add(mesh);
    p.mesh = mesh;
    p.capacity = capacity;
    p.mat = mesh.instanceMatrix.array;
    p.col = mesh.instanceColor.array;
  }

  begin() {
    for (const p of this.pools.values()) p.count = 0;
  }

  // Frame F (12 floats at offset fo: x axis, y axis, z axis, origin) times part local
  // RS (9 floats, column-major) and translation t.
  add(p, F, fo, rs, t, r, g, b) {
    if (p.count >= p.capacity) this.grow(p, p.capacity * 2);
    const m = p.mat, o = p.count * 16;
    const ax = F[fo], ay = F[fo + 1], az = F[fo + 2];
    const bx = F[fo + 3], by = F[fo + 4], bz = F[fo + 5];
    const cx = F[fo + 6], cy = F[fo + 7], cz = F[fo + 8];
    for (let c = 0; c < 3; c++) {
      const u = rs[c * 3], v = rs[c * 3 + 1], w = rs[c * 3 + 2];
      m[o + c * 4] = ax * u + bx * v + cx * w;
      m[o + c * 4 + 1] = ay * u + by * v + cy * w;
      m[o + c * 4 + 2] = az * u + bz * v + cz * w;
      m[o + c * 4 + 3] = 0;
    }
    const u = t[0], v = t[1], w = t[2];
    m[o + 12] = ax * u + bx * v + cx * w + F[fo + 9];
    m[o + 13] = ay * u + by * v + cy * w + F[fo + 10];
    m[o + 14] = az * u + bz * v + cz * w + F[fo + 11];
    m[o + 15] = 1;
    const co = p.count * 3;
    p.col[co] = r; p.col[co + 1] = g; p.col[co + 2] = b;
    p.count++;
  }

  end() {
    for (const p of this.pools.values()) {
      p.mesh.count = p.count;
      p.mesh.instanceMatrix.needsUpdate = true;
      p.mesh.instanceColor.needsUpdate = true;
    }
  }

  dispose() {
    for (const p of this.pools.values()) { this.scene.remove(p.mesh); p.mesh.dispose(); }
    this.pools.clear();
    for (const g of Object.values(this.geoms)) g.dispose();
    for (const m of Object.values(this.materials)) m.dispose();
  }
}

// ---------------------------------------------------------------- small 3x3 helpers
// Rotation R = Rz * Ry * Rx (apply X first), column-major 9 floats.
export function rotXYZ(rx, ry, rz, out = new Float32Array(9)) {
  const cx = Math.cos(rx), sx = Math.sin(rx), cy = Math.cos(ry), sy = Math.sin(ry), cz = Math.cos(rz), sz = Math.sin(rz);
  // Row-major R = Rz*Ry*Rx
  const r00 = cz * cy, r01 = cz * sy * sx - sz * cx, r02 = cz * sy * cx + sz * sx;
  const r10 = sz * cy, r11 = sz * sy * sx + cz * cx, r12 = sz * sy * cx - cz * sx;
  const r20 = -sy, r21 = cy * sx, r22 = cy * cx;
  out[0] = r00; out[1] = r10; out[2] = r20;
  out[3] = r01; out[4] = r11; out[5] = r21;
  out[6] = r02; out[7] = r12; out[8] = r22;
  return out;
}

export function axisRot(axis, a, out = new Float32Array(9)) {
  const c = Math.cos(a), s = Math.sin(a);
  if (axis === 'x') return rotXYZ(a, 0, 0, out);
  if (axis === 'y') return rotXYZ(0, a, 0, out);
  if (axis === 'z') return rotXYZ(0, 0, a, out);
  out.fill(0); out[0] = c; out[4] = 1; out[8] = c; return out;
}

// out = A * B (column-major 3x3)
export function mul3(A, B, out = new Float32Array(9)) {
  for (let c = 0; c < 3; c++) {
    const b0 = B[c * 3], b1 = B[c * 3 + 1], b2 = B[c * 3 + 2];
    out[c * 3] = A[0] * b0 + A[3] * b1 + A[6] * b2;
    out[c * 3 + 1] = A[1] * b0 + A[4] * b1 + A[7] * b2;
    out[c * 3 + 2] = A[2] * b0 + A[5] * b1 + A[8] * b2;
  }
  return out;
}

export function mulVec3(A, v, out = [0, 0, 0]) {
  const x = v[0], y = v[1], z = v[2];
  out[0] = A[0] * x + A[3] * y + A[6] * z;
  out[1] = A[1] * x + A[4] * y + A[7] * z;
  out[2] = A[2] * x + A[5] * y + A[8] * z;
  return out;
}

// Scale columns of R by size.
export function scaleCols(R, sx, sy, sz, out = new Float32Array(9)) {
  out[0] = R[0] * sx; out[1] = R[1] * sx; out[2] = R[2] * sx;
  out[3] = R[3] * sy; out[4] = R[4] * sy; out[5] = R[5] * sy;
  out[6] = R[6] * sz; out[7] = R[7] * sz; out[8] = R[8] * sz;
  return out;
}
