// MAP 2: NEON DISTRICT - dark blue / cyan / magenta urban grid. Symmetric on X and Z.
import { MapBuilder, pts, finalize } from './util.js';
const b = new MapBuilder();
b.compound('building');
b.sym(17, -14, 18, 16, 12, 'building');                       // inner blocks (rows A)
b.sym(42.5, -14, 17, 16, 9, 'building');                      // outer blocks (rows A)
b.symHouse(17, -38, 18, 15, 10, 's', 'building');             // hollow blocks (rows B)
b.symHouse(42.5, -38, 17, 15, 8, 'w', 'building');
b.sym(-4, -30, 3, 6, 1.4, 'car');                             // street cover
b.box(0, -14, 5, 1.2, 1.3, 'cover'); b.box(0, 14, 5, 1.2, 1.3, 'cover');
b.sym(-11, -2, 2.5, 2.5, 1.4, 'kiosk');
b.sym(-58, -14, 3, 3, 2.4, 'crate'); b.sym(-58, -34, 4, 2, 1.3, 'cover'); b.sym(-60, -46, 3, 3, 2.4, 'crate');
b.sym(-29.5, -4, 2, 2, 1.4, 'car');
export default finalize('neon', 'Neon District',
  { sky: 0x05071a, fog: 0x0a0d2b, floor: 0x0c1030, building: 0x1a2350, cover: 0x2b3a7a, car: 0x14a4c8, kiosk: 0xd020a0, crate: 0x3a2a70, roof: 0x0e1238, wall: 0x1a2350, pillar: 0x2b3a7a, accent: 0x00e5ff, accent2: 0xff2bd6, sun: 0x6070ff, neon: true },
  b, pts([[0, 0, 'X'], [29.5, 26, 'I'], [29.5, 0, 'L'], [0, 26, 'A']]),
  pts([[0, 40, 'A'], [29.5, 26, 'I'], [58, 24, 'P'], [58, 8, 'Q']]));
