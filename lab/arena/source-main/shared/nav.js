// 2.5D navigation grid (1 m cells, several walkable surface heights per cell). Used by the zombie AI (flow fields) and map validation.
// A node = (cell, standable height). Neighbours are connected when the height difference is a step the movement code can climb.
import { STEP } from './movement.js';
import { MOVE } from './constants.js';

const R = 0.0, HEAD = 1.75, DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
const cache = new Map();
export function getNav(map) { let n = cache.get(map.id); if (!n) { n = new Nav(map); cache.set(map.id, n); } return n; }

export class Nav {
  constructor(map) {
    this.bound = map.bound || 68; const W = this.W = Math.ceil(this.bound * 2), bound = this.bound, BK = 8;
    const BW = Math.ceil(bound * 2 / BK) + 1, buckets = Array.from({ length: BW * BW }, () => []);
    for (const b of map.boxes) {
      const x0 = Math.max(0, Math.floor((b.x0 + bound) / BK)), x1 = Math.min(BW - 1, Math.floor((b.x1 + bound) / BK));
      const z0 = Math.max(0, Math.floor((b.z0 + bound) / BK)), z1 = Math.min(BW - 1, Math.floor((b.z1 + bound) / BK));
      for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) buckets[z * BW + x].push(b);
    }
    this.start = new Int32Array(W * W + 1); const hs = [], cellOf = [];
    for (let cz = 0; cz < W; cz++) for (let cx = 0; cx < W; cx++) {
      const X = -bound + cx + 0.5, Z = -bound + cz + 0.5, near = new Set();
      const bx0 = Math.max(0, Math.floor((X - 1 + bound) / BK)), bx1 = Math.min(BW - 1, Math.floor((X + 1 + bound) / BK));
      const bz0 = Math.max(0, Math.floor((Z - 1 + bound) / BK)), bz1 = Math.min(BW - 1, Math.floor((Z + 1 + bound) / BK));
      for (let z = bz0; z <= bz1; z++) for (let x = bx0; x <= bx1; x++) for (const b of buckets[z * BW + x]) near.add(b);
      const block = [], cands = [0];
      for (const b of near) {
        if (b.x0 < X + 0.5 + R && b.x1 > X - 0.5 - R && b.z0 < Z + 0.5 + R && b.z1 > Z - 0.5 - R) block.push(b);
        if (X + 0.25 > b.x0 && X - 0.25 < b.x1 && Z + 0.25 > b.z0 && Z - 0.25 < b.z1) cands.push(b.y1);   // surfaces under the cell centre area
      }
      cands.sort((a, c) => a - c);
      const idx = cz * W + cx; this.start[idx] = hs.length;
      let last = -9;
      for (const h of cands) {
        if (h - last < 0.05) continue; last = h;
        let ok = true; for (const b of block) if (b.y0 < h + HEAD && b.y1 > h + 0.05 && !(b.y0 <= h + 0.05 && b.y1 <= h + STEP)) { ok = false; break; }   // low ledges / stair steps are walkable
        if (ok) { hs.push(h); cellOf.push(idx); }
      }
    }
    this.start[W * W] = hs.length; this.h = Float32Array.from(hs); this.cell = Int32Array.from(cellOf); this.n = hs.length;
    // undirected adjacency (CSR): an edge exists if either end can step onto the other, so flow fields never dead-end
    const sets = Array.from({ length: this.n }, () => new Set());
    for (let n = 0; n < this.n; n++) this.each(n, (m) => { sets[n].add(m); sets[m].add(n); });
    this.adjStart = new Int32Array(this.n + 1); let tot = 0; for (let n = 0; n < this.n; n++) { this.adjStart[n] = tot; tot += sets[n].size; } this.adjStart[this.n] = tot;
    this.adj = new Int32Array(tot); for (let n = 0, o = 0; n < this.n; n++) for (const m of sets[n]) this.adj[o++] = m;
  }
  neighbors(n, cb) { for (let i = this.adjStart[n]; i < this.adjStart[n + 1]; i++) cb(this.adj[i]); }
  cellIdx(x, z) { const cx = Math.floor(x + this.bound), cz = Math.floor(z + this.bound); return (cx < 0 || cz < 0 || cx >= this.W || cz >= this.W) ? -1 : cz * this.W + cx; }
  nodeAt(x, y, z) {
    for (let r = 0; r <= 2; r++) {
      let best = -1, bd = 1.6;
      for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const c = this.cellIdx(x + dx, z + dz); if (c < 0) continue;
        for (let n = this.start[c]; n < this.start[c + 1]; n++) { const d = Math.abs(this.h[n] - y) + r * 0.3; if (d < bd) { bd = d; best = n; } }
      }
      if (best >= 0) return best;
    }
    return -1;
  }
  pos(n) { const c = this.cell[n]; return [-this.bound + (c % this.W) + 0.5, this.h[n], -this.bound + Math.floor(c / this.W) + 0.5]; }
  // nearby node in a neighbouring cell reachable from node n (height-compatible); cb(node)
  each(n, cb) {
    const c = this.cell[n], W = this.W, cx = c % W, cz = (c / W) | 0, h = this.h[n], lim = STEP + 0.001;
    const has = (x, z) => { if (x < 0 || z < 0 || x >= W || z >= W) return false; const ci = z * W + x; for (let m = this.start[ci]; m < this.start[ci + 1]; m++) if (Math.abs(this.h[m] - h) <= lim) return true; return false; };
    for (let i = 0; i < 8; i++) {
      const dx = DIRS[i][0], dz = DIRS[i][1], x = cx + dx, z = cz + dz;
      if (x < 0 || z < 0 || x >= W || z >= W) continue;
      if (i >= 4 && (!has(cx + dx, cz) || !has(cx, cz + dz))) continue;     // no corner cutting
      const ci = z * W + x;
      for (let m = this.start[ci]; m < this.start[ci + 1]; m++) if (Math.abs(this.h[m] - h) <= lim) cb(m);
    }
  }
  field(src) {
    const d = new Uint16Array(this.n).fill(65535); if (src < 0) return d;
    const q = new Int32Array(this.n); let qh = 0, qt = 0; q[qt++] = src; d[src] = 0;
    while (qh < qt) { const n = q[qh++], nd = d[n] + 1; for (let i = this.adjStart[n]; i < this.adjStart[n + 1]; i++) { const m = this.adj[i]; if (d[m] > nd) { d[m] = nd; q[qt++] = m; } } }
    return d;
  }
  // follow the field downhill for `hops` cells
  next(n, field, hops = 2) {
    let cur = n;
    for (let i = 0; i < hops; i++) { let best = -1, bd = field[cur]; this.neighbors(cur, (m) => { if (field[m] < bd) { bd = field[m]; best = m; } }); if (best < 0) break; cur = best; }
    return cur;
  }
}
