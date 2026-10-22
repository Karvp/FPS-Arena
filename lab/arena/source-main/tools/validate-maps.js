// Validates every map with the navigation grid: spawns / hardpoints / sites / crates / zombie spawns must be free and REACHABLE on foot
// (stairs, ramps and bridges included), and ziplines must have a walkable spot at their start.
import { MAPS } from '../maps/index.js';
import { getNav } from '../shared/nav.js';

export function validateMap(map) {
  const errors = [], nav = getNav(map);
  const start = (map.playerSpawns || map.spawns.red)[0];
  const src = nav.nodeAt(start.x, 0, start.z);
  if (src < 0) return { errors: ['start point not walkable'], nodes: nav.n, reachPct: 0 };
  const f = nav.field(src), ok = (x, y, z) => { const n = nav.nodeAt(x, y, z); return n >= 0 && f[n] < 65535; };
  for (const t of ['red', 'blue']) (map.spawns[t] || []).forEach((s, i) => { if (!ok(s.x, 0, s.z) && !map.water) errors.push(`${t} spawn ${i} blocked/unreachable`); });
  for (const h of map.hardpoints) if (!ok(h.x, 0, h.z)) errors.push(`hardpoint ${h.id} blocked/unreachable`);
  for (const s of map.sites) {
    if (!ok(s.x, 0, s.z)) errors.push(`site ${s.id} blocked/unreachable`);
    for (let a = 0; a < 8; a++) if (!ok(s.x + Math.cos(a * Math.PI / 4) * 2.5, 0, s.z + Math.sin(a * Math.PI / 4) * 2.5)) { errors.push(`site ${s.id} ring blocked`); break; }
  }
  (map.crates || []).forEach((c, i) => { if (!ok(c[0], c[1], c[2])) errors.push(`crate ${i} (${c.slice(0, 3)}) unreachable`); });
  (map.playerSpawns || []).forEach((p, i) => { if (!ok(p.x, 0, p.z)) errors.push(`player spawn ${i} unreachable`); });
  (map.zombieSpawns || []).forEach((p, i) => { if (!ok(p.x, 0, p.z)) errors.push(`zombie spawn ${i} (${p.x},${p.z}) unreachable`); });
  (map.ziplines || []).forEach((z, i) => { const feet = [[z.a[0], z.a[1] - 2.0, z.a[2]], [z.b[0], z.b[1] - 2.0, z.b[2]]]; feet.forEach((p, e) => { if (!ok(p[0], p[1] - (e ? 1 : 0), p[2]) && !ok(p[0] + 1.5, p[1], p[2]) && !ok(p[0] - 1.5, p[1], p[2]) && !ok(p[0], p[1], p[2] + 1.5) && !ok(p[0], p[1], p[2] - 1.5)) errors.push(`zipline ${i} end ${e} has no walkable spot`); }); });
  let reach = 0; for (let i = 0; i < f.length; i++) if (f[i] < 65535) reach++;
  const bound = map.bound || 68;
  for (const b of map.boxes) if (b.x0 < -bound - 1 || b.x1 > bound + 1 || b.z0 < -bound - 1 || b.z1 > bound + 1) errors.push('box outside bounds ' + JSON.stringify(b));
  return { errors, boxes: map.boxes.length, nodes: nav.n, reachPct: Math.round(100 * reach / nav.n) };
}
if (process.argv[1] && process.argv[1].endsWith('validate-maps.js')) {
  let bad = 0;
  for (const m of Object.values(MAPS)) { const t = Date.now(), r = validateMap(m); console.log(m.id, `boxes=${r.boxes} nodes=${r.nodes} reachable=${r.reachPct}% (${Date.now() - t}ms)`, r.errors.length ? r.errors : 'OK'); bad += r.errors.length; }
  process.exit(bad ? 1 : 0);
}
