// MAP 5 (Zombies): DEAD MARSH - big, humid and dim. Muddy slow ground, stepped hills, a fenced outpost where players spawn,
// several two-floor buildings with interior stairs, watchtowers, wrecks and dead trees.
import { MapBuilder, placeCrates, mulberry } from './util.js';
const b = new MapBuilder(), crateList = [];

// two-floor building: ground floor + upper floor (interior stairs through a hole), roof on top
function building(cx, cz, w, d, doors, doors2 = '') {
  b.house(cx, cz, w, d, 4, doors, 'wall', false, 0.8, 3.4, 0);
  const x0 = cx - w / 2 + 1.2, z1 = cz + d / 2 - 1.2, hole = { x0, x1: x0 + 3.6, z0: z1 - 7.6, z1 };
  b.slabHole(cx, cz, w, d, 4, 0.4, hole, 'floor');
  b.stairsTo('+z', z1, x0 + 1.8, 3.6, 4, 0);
  b.house(cx, cz, w, d, 3.6, doors2, 'wall', true, 0.8, 3.4, 4);
  crateList.push([cx + w / 4, 0, cz - d / 4], [cx + w / 4, 4, cz - d / 4], [cx - w / 4 + 3, 4, cz - d / 4 + 1]);
}
function tower(cx, cz) {
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(cx + sx * 2.4, cz + sz * 2.4, 1, 1, 7.2, 'wood', 0);
  b.slab(cx, cz, 6.4, 6.4, 8, 0.6, 'floor'); b.box(cx, cz - 3.2, 6.4, 0.3, 1.1, 'rail', 8); b.box(cx, cz + 3.2, 6.4, 0.3, 1.1, 'rail', 8); b.box(cx - 3.2, cz, 0.3, 6.4, 1.1, 'rail', 8);
  b.stairsTo('+z', cz + 3.2 - 1.6, cx + 4.8, 3, 8, 0, 'wood'); crateList.push([cx - 1, 8, cz]);
}

// ---- outpost (player spawn): fenced yard with gates on all sides
b.house(0, 0, 34, 34, 3, 'nsew', 'fence', false, 0.6, 6, 0);
b.box(-10, -9, 6, 4, 2.4, 'crate', 0); b.box(11, 9, 5, 3, 1.3, 'cover', 0); b.box(10, -10, 1.2, 6, 1.4, 'cover', 0);
crateList.push([-12, 0, 11], [13, 0, -4], [0, 0, -12]);
// ---- buildings
building(-48, -32, 18, 14, 's', 'n');
building(42, -42, 26, 16, 'sw', 'e');
building(-8, -74, 16, 22, 's', 'w');
building(-58, 42, 16, 16, 'e', 's');
building(58, 38, 18, 14, 'n', 'w');
building(8, 62, 14, 14, 'n', 'e');
tower(74, -6); tower(-72, 66); tower(-20, 20); tower(30, -12);
// ---- hills
b.mound(-34, 64, 14, 3); b.mound(38, 74, 16, 3.5); b.mound(76, -62, 12, 3); b.mound(-76, -70, 14, 3); b.mound(0, 38, 9, 2); b.mound(-40, -4, 8, 2);
// ---- wrecks, fences, rocks
const rnd = mulberry(7);
for (const [x, z, w, d] of [[-24, -44, 4.4, 2], [22, -20, 4.4, 2], [-36, 22, 2, 4.4], [60, 8, 4.4, 2], [-60, -6, 2, 4.4], [18, 40, 4.4, 2], [-82, 20, 4.4, 2], [80, 60, 2, 4.4]]) { b.box(x, z, w, d, 1.4, 'car'); crateList.push([x + 3, 0, z + 3]); }
for (const [x, z, w, d] of [[-20, -20, 8, 0.4], [26, 12, 0.4, 8], [-50, 8, 10, 0.4], [40, -22, 0.4, 10], [0, -48, 12, 0.4]]) b.box(x, z, w, d, 1.2, 'fence');
const occupied = (x, z) => b.boxes.some(bx => x > bx.x0 - 3 && x < bx.x1 + 3 && z > bx.z0 - 3 && z < bx.z1 + 3);
for (let i = 0, n = 0; n < 46 && i < 400; i++) { const x = (rnd() * 2 - 1) * 94, z = (rnd() * 2 - 1) * 94; if (!occupied(x, z)) { b.box(x, z, 1, 1, 7, 'tree'); n++; } }
for (let i = 0, n = 0; n < 14 && i < 200; i++) { const x = (rnd() * 2 - 1) * 90, z = (rnd() * 2 - 1) * 90; if (!occupied(x, z)) { b.box(x, z, 2.4, 2.2, 1.1, 'rock'); crateList.push([x + 2.5, 0, z]); n++; } }
for (let i = 0; i < 40; i++) crateList.push([(rnd() * 2 - 1) * 90, 0, (rnd() * 2 - 1) * 90]);

const spawnRing = []; for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; spawnRing.push({ x: Math.round(Math.cos(a) * 6 * 10) / 10, z: Math.round(Math.sin(a) * 6 * 10) / 10 + 2, yaw: a + Math.PI }); }
const zs = []; for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2, x = Math.round(Math.cos(a) * 94), z = Math.round(Math.sin(a) * 94); if (!occupied(x, z)) zs.push({ x, z }); }

export default {
  id: 'marsh', name: 'Dead Marsh', size: 100, bound: 100, boxes: b.boxes, crates: placeCrates(b.boxes, crateList), playerSpawns: spawnRing, zombieSpawns: zs,
  slow: [{ x0: -88, z0: -26, x1: -52, z1: 22, m: 0.65 }, { x0: 48, z0: 48, x1: 90, z1: 86, m: 0.65 }, { x0: -30, z0: -62, x1: 24, z1: -50, m: 0.7 }, { x0: 20, z0: 84, x1: 70, z1: 96, m: 0.7 }],
  palette: { sky: 0x1b2a22, fog: 0x1d2b24, fogNear: 6, fogFar: 85, floor: 0x2c3a26, wall: 0x4a4a42, floorBox: 0x4a4034, roof: 0x2e302c, fence: 0x5a5340, crate: 0x4a3c2a, cover: 0x3b3b33, car: 0x4a3a30, tree: 0x2a2218, wood: 0x4a3a24, rock: 0x4c4c46, earth: 0x34452c, rail: 0x5a5340, stairs: 0x55554a, accent: 0xc8d46a, sun: 0x8fa890, sunI: 0.35, hemiI: 0.45, noGrid: true, mud: 0x1e2a1a },
  spawns: { red: spawnRing, blue: spawnRing.slice(0, 2) }, hardpoints: [], sites: [],
};
