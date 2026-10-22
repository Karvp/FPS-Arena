// Map construction helpers. A map = boxes (visual + collision, one list) + spawns + hardpoint zones + bombsite candidates.
export class MapBuilder {
  constructor() { this.boxes = []; }
  box(cx, cz, w, d, h, k = 'wall', y = 0) {
    this.boxes.push({ x0: cx - w / 2, x1: cx + w / 2, z0: cz - d / 2, z1: cz + d / 2, y0: y, y1: y + h, k });
    return this;
  }
  // mirror across X and/or Z (skips duplicates on the axis)
  sym(cx, cz, w, d, h, k = 'wall', y = 0, o = {}) {
    const { mx = true, mz = true } = o;
    for (const x of (mx && cx !== 0 ? [cx, -cx] : [cx])) for (const z of (mz && cz !== 0 ? [cz, -cz] : [cz])) this.box(x, z, w, d, h, k, y);
    return this;
  }
  symZ(cx, cz, w, d, h, k = 'wall', y = 0) { return this.sym(cx, cz, w, d, h, k, y, { mx: false, mz: true }); }
  // hollow building with doors on the given sides ('n' = -Z, 's' = +Z, 'e' = +X, 'w' = -X), optional roof, base height y
  house(cx, cz, w, d, h, doors = 's', k = 'wall', roof = true, t = 0.8, gap = 3.4, y = 0) {
    const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2;
    const seg = (a, b, fixed, horiz, door) => {
      if (!door) { horiz ? this.box((a + b) / 2, fixed, b - a, t, h, k, y) : this.box(fixed, (a + b) / 2, t, b - a, h, k, y); return; }
      const m = (a + b) / 2, g0 = m - gap / 2, g1 = m + gap / 2;
      if (horiz) { this.box((a + g0) / 2, fixed, g0 - a, t, h, k, y); this.box((g1 + b) / 2, fixed, b - g1, t, h, k, y); }
      else { this.box(fixed, (a + g0) / 2, t, g0 - a, h, k, y); this.box(fixed, (g1 + b) / 2, t, b - g1, h, k, y); }
    };
    seg(x0, x1, z0, true, doors.includes('n')); seg(x0, x1, z1, true, doors.includes('s'));
    seg(z0, z1, x0, false, doors.includes('w')); seg(z0, z1, x1, false, doors.includes('e'));
    if (roof) this.box(cx, cz, w, d, 0.5, 'roof', y + h - 0.5);
    return this;
  }
  rect(x0, x1, z0, z1, ytop, thick, k) { if (x1 - x0 > 0.01 && z1 - z0 > 0.01) this.box((x0 + x1) / 2, (z0 + z1) / 2, x1 - x0, z1 - z0, thick, k, ytop - thick); return this; }
  slab(cx, cz, w, d, ytop, thick = 0.6, k = 'deck') { return this.rect(cx - w / 2, cx + w / 2, cz - d / 2, cz + d / 2, ytop, thick, k); }
  // floor slab with a rectangular opening (for interior stairs)
  slabHole(cx, cz, w, d, ytop, thick, hole, k = 'floor') {
    const X0 = cx - w / 2, X1 = cx + w / 2, Z0 = cz - d / 2, Z1 = cz + d / 2;
    this.rect(X0, hole.x0, Z0, Z1, ytop, thick, k); this.rect(hole.x1, X1, Z0, Z1, ytop, thick, k);
    this.rect(hole.x0, hole.x1, Z0, hole.z0, ytop, thick, k); this.rect(hole.x0, hole.x1, hole.z1, Z1, ytop, thick, k); return this;
  }
  // Staircase climbing in direction dir ('+x','-x','+z','-z'); its TOP step ends at `edge` (coordinate along dir); `cross` = centre on the other axis.
  // Rise per step <= 0.5 (the movement code auto-steps up to 0.6). Returns the horizontal length used.
  stairsTo(dir, edge, cross, width, H, y0 = 0, k = 'stairs') {
    const n = Math.ceil(H / 0.5 - 1e-6), rise = H / n, run = 0.9, sign = dir[0] === '+' ? 1 : -1, alongX = dir[1] === 'x';
    for (let i = 0; i < n; i++) {                              // step i: i = 0 is the lowest
      const far = edge - sign * (n - 1 - i) * run, near = far - sign * run, a0 = Math.min(near, far), a1 = Math.max(near, far), top = (i + 1) * rise;
      if (alongX) this.box((a0 + a1) / 2, cross, run, width, top, k, y0); else this.box(cross, (a0 + a1) / 2, width, run, top, k, y0);
    }
    return n * run;
  }
  // stepped earth mound (walkable: every layer is 0.5 higher)
  mound(cx, cz, r, H, k = 'earth') {
    const n = Math.ceil(H / 0.5), stp = r * 0.85 / n;
    for (let i = 0; i < n; i++) { const half = r - i * stp; this.box(cx, cz, half * 2, half * 2, (i + 1) * 0.5, k, 0); }
    return this;
  }
  symHouse(cx, cz, w, d, h, doors, k = 'wall', o = {}) {
    const { mx = true, mz = true } = o;
    const flip = (s, fx, fz) => s.split('').map(c => (fx && c === 'e' ? 'w' : fx && c === 'w' ? 'e' : fz && c === 'n' ? 's' : fz && c === 's' ? 'n' : c)).join('');
    for (const sx of (mx && cx !== 0 ? [1, -1] : [1])) for (const sz of (mz && cz !== 0 ? [1, -1] : [1]))
      this.house(cx * sx, cz * sz, w, d, h, flip(doors, sx < 0, sz < 0), k);
    return this;
  }
  // Walled spawn compound for the team on the -Z side; mirrored to +Z (symmetric maps share this layout).
  compound(k = 'wall') {
    this.box(0, -65.5, 40, 1.5, 4, k);  this.box(0, 65.5, 40, 1.5, 4, k);
    this.sym(-20, -60, 1.5, 10, 4, k);                   // side walls (exits between wall end and front wall)
    this.sym(-14.5, -51.5, 11, 1.5, 3, k);               // front walls with a 18 wide centre gap
    this.box(0, -47, 6, 1.2, 1.3, 'cover'); this.box(0, 47, 6, 1.2, 1.3, 'cover');
    return this;
  }
}

// Keep only crate spots that stand on a real surface with room around (so loot never floats / clips). list: [[x,y,z,yaw?]]
export function placeCrates(boxes, list) {
  const top = (x, z, y) => boxes.some(b => x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1 && Math.abs(b.y1 - y) < 0.02);
  const surf = (x, z, y) => (y === 0 ? !boxes.some(b => x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1 && b.y0 < 0.5 && b.y1 > 0.05) : top(x, z, y));
  const clear = (x, y, z) => !boxes.some(b => x + 0.8 > b.x0 && x - 0.8 < b.x1 && z + 0.8 > b.z0 && z - 0.8 < b.z1 && b.y0 < y + 1.3 && b.y1 > y + 0.05 && Math.abs(b.y1 - y) > 0.02);
  const out = [];
  for (const [x, y, z, yaw] of list) {
    if (!surf(x, z, y) || !clear(x, y, z)) continue;
    const ok = [[1.3, 0], [-1.3, 0], [0, 1.3], [0, -1.3]].filter(([dx, dz]) => surf(x + dx, z + dz, y) && clear(x + dx, y, z + dz)).length;
    if (ok >= 3) out.push([x, y, z, yaw ?? ((x * 7 + z * 13) % 6.28)]);
  }
  return out;
}

export function pts(list, o = {}) {
  const { mx = true, mz = true } = o; const out = [];
  for (const [x, z, name] of list) for (const sx of (mx && x !== 0 ? [1, -1] : [1])) for (const sz of (mz && z !== 0 ? [1, -1] : [1]))
    out.push({ x: x * sx, z: z * sz, name: name || '' });
  return out.map((p, i) => ({ ...p, id: `${p.name || 'P'}${i}` }));
}

export function makeSpawns() {
  const red = [], blue = [];
  for (let i = 0; i < 8; i++) {
    const x = -14 + i * 4;
    red.push({ x, z: 58 + (i % 2) * 3, yaw: 0 });
    blue.push({ x, z: -58 - (i % 2) * 3, yaw: Math.PI });
  }
  return { red, blue };
}

export function finalize(id, name, palette, b, hardpoints, sites, extra = {}) {
  return { id, name, size: 68, bound: 68, palette, boxes: b.boxes, spawns: makeSpawns(), hardpoints, sites, ...extra };
}

export function mulberry(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
