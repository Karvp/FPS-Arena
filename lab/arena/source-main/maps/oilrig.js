// MAP 4 (Battle Royale): OIL RIG - a huge vertical offshore complex. One big central rig (sea level, lower deck y=8, upper deck y=16,
// helipad y=24, derrick platform y=32) linked by long bridges to four satellite rigs, plus ziplines (press F) running from the derrick
// and between the satellites. The sea (y=0) is walkable shallow water (slower).
import { MapBuilder, placeCrates } from './util.js';
const b = new MapBuilder(), zips = [], crateList = [];
const post = (x, y0, z, h) => b.box(x, z, 0.3, 0.3, h, 'post', y0);

function rig(cx, cz, L, U, central, side) {
  const l = L / 2 - 4;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(cx + sx * l, cz + sz * l, 5, 5, 7, 'leg', 0);          // legs standing in the sea
  b.slab(cx, cz, L, L, 8, 1, 'deck');                                                                                // lower deck
  const u = U / 2 - 2;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(cx + sx * u, cz + sz * u, 2, 2, 7.2, 'leg', 8);
  b.slab(cx, cz, U, U, 16, 0.8, 'deck');                                                                             // upper deck
  b.stairsTo('+z', cz - 2, cx + U / 2 + 2, 4, 8, 8);                                                                  // lower -> upper (east side of the upper deck)
  if (central) {
    b.house(cx - 15, cz - 15, 18, 14, 4, 'es', 'wall', true, 0.8, 3.4, 8);                                           // lower-deck rooms
    b.house(cx - 15, cz + 15, 18, 14, 4, 'en', 'wall', true, 0.8, 3.4, 8);
    b.house(cx + 15, cz + 15, 18, 14, 4, 'wn', 'wall', true, 0.8, 3.4, 8);
    b.box(cx + 2, cz - 24, 8, 1.2, 1.3, 'cover', 8); b.box(cx + 2, cz + 24, 8, 1.2, 1.3, 'cover', 8); b.box(cx - 2, cz, 3, 3, 1.4, 'pipe', 8);
    b.box(cx - 3, cz - 12, 6, 1.2, 1.3, 'cover', 16);                                                                // upper-deck rooms / cover
    b.house(cx - 10, cz + 10, 14, 12, 3.6, 'en', 'wall', true, 0.8, 3.4, 16);
    b.house(cx + 10, cz + 10, 14, 12, 3.6, 'wn', 'wall', true, 0.8, 3.4, 16);
    // helipad (24) and derrick platform (32)
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(cx + sx * 8, cz + sz * 8, 2, 2, 7.2, 'leg', 16);
    b.slab(cx, cz, 20, 20, 24, 0.8, 'deck'); b.box(cx - 5, cz + 6, 6, 0.1, 0.15, 'pad', 24);
    b.stairsTo('+z', cz, cx - 12, 4, 8, 16);                                                                          // upper -> helipad (west side)
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(cx + sx * 4, cz + sz * 4, 2, 2, 7.2, 'leg', 24);
    b.slab(cx, cz, 12, 12, 32, 0.8, 'deck');
    b.stairsTo('+z', cz + 4.4, cx + 8, 4, 8, 24);                                                                     // helipad -> derrick
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(cx + sx * 5.5, cz + sz * 5.5, 1, 1, 30, 'pipe', 32);   // derrick frame
    for (const [px, pz] of [[0, -5.5], [0, 5.5], [5.5, 0], [-5.5, 0]]) post(cx + px, 32, cz + pz, 2);
    // sea stairs (pinwheel) and crates
    b.stairsTo('+z', cz - 30, cx - 18, 5, 8, 0); b.stairsTo('-z', cz + 30, cx + 18, 5, 8, 0);
    b.stairsTo('-x', cx + 30, cz - 18, 5, 8, 0); b.stairsTo('+x', cx - 30, cz + 18, 5, 8, 0);
    crateList.push(...[[-26, 8, -26], [26, 8, -26], [26, 8, 26], [-26, 8, 26], [-15, 8, -15], [-15, 8, 15], [15, 8, 15], [0, 8, -20], [0, 8, 20],
      [-16, 16, 0], [-10, 16, -10], [-10, 16, 10], [10, 16, 10], [16, 16, -16], [-7, 24, -7], [-7, 24, 7], [0, 32, 0],
      [-12, 0, -12], [12, 0, 12], [-12, 0, 12], [12, 0, -12], [0, 0, 0]].map(([x, y, z]) => [cx + x, y, cz + z]));
  } else {
    b.house(cx - 10, cz, 12, 14, 4, 'e', 'wall', true, 0.8, 3.4, 8);
    b.box(cx + 4, cz + 12, 6, 1.2, 1.3, 'cover', 8); b.box(cx - 10, cz - 12, 1.2, 4, 1.4, 'cover', 8);
    b.box(cx - 2, cz - 3, 4, 3, 1.3, 'cover', 16);
    b.stairsTo(side[0], side[1] === 'x' ? cx + side[2] * L / 2 : cz + side[2] * L / 2, side[1] === 'x' ? cz : cx, 5, 8, 0);   // sea stair, outer side
    crateList.push(...[[12, 8, 12], [-14, 8, 14], [12, 8, -12], [-10, 8, 0], [-14, 8, -14], [0, 16, 0], [-4, 16, 4], [4, 16, -4]].map(([x, y, z]) => [cx + x, y, cz + z]));
  }
}
rig(0, 0, 60, 40, true);
rig(0, -95, 36, 18, false, ['+z', 'z', -1]); rig(0, 95, 36, 18, false, ['-z', 'z', 1]);
rig(95, 0, 36, 18, false, ['-x', 'x', 1]); rig(-95, 0, 36, 18, false, ['+x', 'x', -1]);
// bridges (lower deck level) with rails + supports
for (const [bx, bz, w, d] of [[0, -53.5, 6, 47], [0, 53.5, 6, 47], [53.5, 0, 47, 6], [-53.5, 0, 47, 6]]) {
  b.rect(bx - w / 2, bx + w / 2, bz - d / 2, bz + d / 2, 8, 0.8, 'deck');
  if (w < d) { b.box(bx - 3.2, bz, 0.4, d, 1.1, 'rail', 8); b.box(bx + 3.2, bz, 0.4, d, 1.1, 'rail', 8); for (const t of [-14, 0, 14]) b.box(bx, bz + t, 2, 2, 7.2, 'leg', 0); crateList.push([bx, 8, bz - 8], [bx, 8, bz + 10]); }
  else { b.box(bx, bz - 3.2, d, 0.4, 1.1, 'rail', 8); b.box(bx, bz + 3.2, d, 0.4, 1.1, 'rail', 8); for (const t of [-14, 0, 14]) b.box(bx + t, bz, 2, 2, 7.2, 'leg', 0); crateList.push([bx - 8, 8, bz], [bx + 10, 8, bz]); }
}
// ziplines (cable endpoints; riders hang 2 m below the cable)
const zip = (a, c) => { zips.push({ a, b: c }); post(a[0], a[1] - 2 - 0.0, a[2], 0); };
const addZip = (a, c, ba, bc) => { zips.push({ a, b: c }); post(a[0], ba, a[2], a[1] - ba); post(c[0], bc, c[2], c[1] - bc); };
void zip;
addZip([0, 34, -5.5], [0, 19, -88], 32, 16); addZip([0, 34, 5.5], [0, 19, 88], 32, 16);
addZip([5.5, 34, 0], [88, 19, 0], 32, 16); addZip([-5.5, 34, 0], [-88, 19, 0], 32, 16);
addZip([8, 19, -90], [90, 19, -8], 16, 16); addZip([90, 19, 8], [8, 19, 90], 16, 16);
addZip([-8, 19, 90], [-90, 19, 8], 16, 16); addZip([-90, 19, -8], [-8, 19, -90], 16, 16);
crateList.push([-55, 0, 10], [55, 0, -10], [10, 0, 55], [-10, 0, -55], [-60, 0, -60], [60, 0, -60], [-60, 0, 60], [60, 0, 60], [-80, 0, 40], [80, 0, -40], [40, 0, 80], [-40, 0, -80]);

export default {
  id: 'oilrig', name: 'Oil Rig', size: 130, bound: 130, water: true, boxes: b.boxes, ziplines: zips, crates: placeCrates(b.boxes, crateList),
  palette: { sky: 0x8fb4d6, fog: 0x9bbcd8, fogNear: 120, fogFar: 520, floor: 0x0e4a73, deck: 0x6a6f76, leg: 0x4b5057, wall: 0x9a9fa5, roof: 0x55595f, rail: 0xd9a21a, post: 0xffb020, stairs: 0x7d838a, cover: 0x9a6a3a, pipe: 0xb04a2a, pad: 0xffe14a, accent: 0xff7a1a, sun: 0xfff2d6, noGrid: true },
  spawns: { red: [{ x: -62, z: -20, yaw: 0 }, { x: 62, z: 20, yaw: 0 }], blue: [{ x: 62, z: -20, yaw: 0 }, { x: -62, z: 20, yaw: 0 }] }, hardpoints: [], sites: [],
};
