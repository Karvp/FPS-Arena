// MAP 3: SUNSET FOUNDRY - warm brown / purple / orange. Symmetric on Z only: left flank = narrow corridor, right flank = open yard.
import { MapBuilder, pts, finalize } from './util.js';
const b = new MapBuilder();
b.compound('wall');
b.house(0, 0, 16, 14, 6, 'ns', 'forge');                     // central forge
b.box(5, 2.5, 2, 2, 1.4, 'crate');
b.symZ(-36, -14, 10, 9, 5, 'forge'); b.symZ(34, -16, 9, 9, 5, 'forge');   // furnaces
b.symZ(-22, -32, 10, 2.6, 2.6, 'container'); b.symZ(20, -36, 8, 2.6, 2.6, 'container');
b.symZ(24, -30, 2.6, 8, 2.6, 'container'); b.symZ(44, -38, 12, 2.6, 2.6, 'container');
b.symZ(-53, -34, 1.4, 26, 3.6, 'wall');                       // left corridor wall
b.symZ(-62, -28, 2.4, 2.4, 3, 'pillar'); b.symZ(-60, -42, 4, 2, 1.3, 'cover');
b.symZ(56, -24, 4, 4, 1.2, 'crate'); b.symZ(60, -32, 3, 3, 2.4, 'crate'); b.symZ(50, -10, 6, 1.2, 1.3, 'cover');
b.symZ(-12, -22, 5, 1.2, 1.3, 'cover'); b.symZ(10, -24, 1.2, 6, 1.4, 'cover'); b.box(0, -40, 8, 1.4, 1.5, 'cover'); b.box(0, 40, 8, 1.4, 1.5, 'cover');
b.symZ(-18, -6, 4, 1.2, 1.3, 'cover'); b.symZ(18, -6, 4, 1.2, 1.3, 'cover');
export default finalize('foundry', 'Sunset Foundry',
  { sky: 0x3a2040, fog: 0x4a2a38, floor: 0x4a3226, wall: 0x6b4a38, forge: 0x7a3d2a, container: 0x9a4a22, cover: 0x5a4032, crate: 0x8a6a3a, pillar: 0x6a3a5a, roof: 0x3a2a28, accent: 0xff7a1a, sun: 0xff9050 },
  b, pts([[0, 0, 'F'], [-30, 0, 'L'], [30, 0, 'R'], [12, 34, 'Y']], { mx: false, mz: false }).concat(pts([[-12, 34, 'D']], { mx: false })),
  pts([[-12, 42, 'S'], [12, 44, 'T'], [-40, 40, 'U'], [40, 48, 'V'], [-62, 12, 'W']], { mx: false }));
