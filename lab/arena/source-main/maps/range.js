// MAP 6: SHOOTING RANGE - small walled test range for calibrating weapons / attachments. No PvP; static target dummies at 10 / 20 / 30 / 40 m.
// Players spawn behind the firing line (z = +8 .. +10, facing -Z). Marker strips on the floor show the distance from the firing line.
import { MapBuilder, finalize } from './util.js';
const b = new MapBuilder();
b.box(0, -48.5, 46, 1, 5, 'wall'); b.box(0, 12.5, 46, 1, 5, 'wall'); b.box(-22.5, -18, 1, 62, 5, 'wall'); b.box(22.5, -18, 1, 62, 5, 'wall');
b.box(0, 0, 44, 0.3, 0.12, 'marker');                                   // firing line (z = 0)
for (const d of [10, 20, 30, 40]) b.box(0, -d, 44, 0.3, 0.12, 'marker');
b.box(-8, 4, 3, 0.8, 1.1, 'cover'); b.box(8, 4, 3, 0.8, 1.1, 'cover');   // shooting benches behind the line
b.box(-6, -15, 3, 1, 1.2, 'cover'); b.box(10, -25, 3, 1, 1.4, 'cover'); b.box(-12, -35, 4, 1, 1.4, 'cover');   // cover to test around
export const RANGE_TARGETS = [[-12, -10], [0, -10], [12, -10], [-16, -20], [-8, -20], [8, -20], [16, -20], [-12, -30], [0, -30], [12, -30], [-16, -40], [-6, -40], [6, -40], [16, -40]];
const spawns = []; for (let i = 0; i < 8; i++) spawns.push({ x: -14 + i * 4, z: 8 + (i % 2) * 2, yaw: 0 });
export default finalize('range', 'Shooting Range',
  { sky: 0x8fb0c8, fog: 0x9db8cc, floor: 0x6a6f63, wall: 0x8a8f95, cover: 0x6d7379, marker: 0xffd400, roof: 0x4f5459, accent: 0xffd400, sun: 0xffffff, fogNear: 80, fogFar: 260 },
  b, [], [], { size: 50, bound: 50, spawns: { red: spawns, blue: spawns }, crates: [], range: true });
