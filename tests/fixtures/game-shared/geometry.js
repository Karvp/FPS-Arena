// Small math helpers shared by client and server (ray casts, deterministic RNG, aim vectors).
export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const hashSeq = (seq, i) => ((seq * 73856093) ^ (i * 19349663) ^ 0x9E3779B9) | 0;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// yaw 0 looks toward -Z; positive pitch looks up.
export function forwardVec(yaw, pitch) {
  const cp = Math.cos(pitch);
  return [-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp];
}
export function rightVec(yaw) { return [Math.cos(yaw), 0, -Math.sin(yaw)]; }

// Deterministic spread: both client (visuals/prediction) and server (truth) call this with the same seed.
export function spreadDir(dir, yaw, angleDeg, rng) {
  if (angleDeg <= 0) return dir.slice();
  const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * Math.tan(angleDeg * Math.PI / 180);
  const rt = rightVec(yaw);
  // up = right x dir
  const up = [rt[1] * dir[2] - rt[2] * dir[1], rt[2] * dir[0] - rt[0] * dir[2], rt[0] * dir[1] - rt[1] * dir[0]];
  const ca = Math.cos(a) * r, sa = Math.sin(a) * r;
  const o = [dir[0] + rt[0] * ca + up[0] * sa, dir[1] + rt[1] * ca + up[1] * sa, dir[2] + rt[2] * ca + up[2] * sa];
  const l = Math.hypot(o[0], o[1], o[2]);
  return [o[0] / l, o[1] / l, o[2] / l];
}

// Ray vs axis-aligned box; returns entry distance or Infinity.
export function rayAABB(o, d, x0, y0, z0, x1, y1, z1, maxT = Infinity) {
  let tmin = 0, tmax = maxT;
  const lo = [x0, y0, z0], hi = [x1, y1, z1];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-9) { if (o[i] < lo[i] || o[i] > hi[i]) return Infinity; continue; }
    let t1 = (lo[i] - o[i]) / d[i], t2 = (hi[i] - o[i]) / d[i];
    if (t1 > t2) { const s = t1; t1 = t2; t2 = s; }
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return Infinity;
  }
  return tmin;
}
export function raySphere(o, d, cx, cy, cz, r, maxT = Infinity) {
  const mx = o[0] - cx, my = o[1] - cy, mz = o[2] - cz;
  const b = mx * d[0] + my * d[1] + mz * d[2];
  const c = mx * mx + my * my + mz * mz - r * r;
  if (c > 0 && b > 0) return Infinity;
  const disc = b * b - c;
  if (disc < 0) return Infinity;
  const t = Math.max(0, -b - Math.sqrt(disc));
  return t <= maxT ? t : Infinity;
}
export function rayWorld(o, d, boxes, maxT) {
  let best = maxT;
  for (const b of boxes) { const t = rayAABB(o, d, b.x0, b.y0, b.z0, b.x1, b.y1, b.z1, best); if (t < best) best = t; }
  return best;
}
