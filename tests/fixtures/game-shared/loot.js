// Crate / dropped-item targeting shared by the server (authority) and the client (interaction prompt).
import { forwardVec } from './geometry.js';
import { USE_RANGE } from './constants.js';

export const ITEM = { GUN: 0, AMMO: 1, PLATE: 2, THROW: 3, ENERGY: 4, KIT: 5 };      // AMMO: wid = ammo class ('heavy' | 'light'), reserve = rounds. ENERGY: reserve = energy points.

// crates: [{id,x,y,z,open}], items: [{id,kind,x,y,z}]; eye position + look angles. Returns {type:'crate'|'gun', id} or null.
export function findUseTarget(crates, items, ex, ey, ez, yaw, pitch) {
  const f = forwardVec(yaw, pitch); let best = null, bs = Infinity;
  const test = (type, obj, cx, cy, cz, range, minDot) => {
    const dx = cx - ex, dy = cy - ey, dz = cz - ez, d = Math.hypot(dx, dy, dz); if (d > range) return;
    const dot = d < 0.5 ? 1 : (dx * f[0] + dy * f[1] + dz * f[2]) / d; if (dot < minDot) return;
    const score = d - dot * 1.5; if (score < bs) { bs = score; best = { type, id: obj.id, dist: d }; }
  };
  for (const c of crates) if (!c.open) test('crate', c, c.x, c.y + 0.45, c.z, USE_RANGE.crate, 0.7);
  for (const it of items) if (it.kind === ITEM.GUN) test('gun', it, it.x, it.y + 0.35, it.z, USE_RANGE.gun, 0.5);
  return best;
}
