// MAP 1: EXPANDED ARENA - neutral grey industrial. Symmetric on X and Z.
import { MapBuilder, pts, finalize } from './util.js';
const b = new MapBuilder();
b.compound('wall');
b.symHouse(-46, -32, 14, 11, 5, 'e', 'wall');                 // flank houses (door toward centre)
b.symHouse(-27, -17, 10, 9, 4.6, 's', 'wall');                // inner houses
b.box(0, 0, 10, 4, 3.2, 'wall');                              // central block
b.sym(-10, -7, 3.5, 1.2, 1.3, 'cover');                       // central cover
b.sym(-16, 0, 1.2, 6, 1.3, 'cover');
b.sym(-5, -14, 6, 1.2, 1.3, 'cover');
b.box(0, -24, 8, 1.2, 1.6, 'cover'); b.box(0, 24, 8, 1.2, 1.6, 'cover');
b.sym(-36, -45, 1.2, 10, 2.6, 'wall');                        // lane dividers
b.sym(-58, -8, 2, 2, 3.5, 'pillar'); b.box(-58, 0, 2, 2, 3.5, 'pillar'); b.box(58, 0, 2, 2, 3.5, 'pillar');
b.sym(-56, -42, 4, 3, 2.4, 'crate');
b.sym(-52, -14, 3, 3, 1.3, 'cover');
b.sym(-30, -36, 5, 1.2, 1.4, 'cover');
export default finalize('arena', 'Expanded Arena',
  { sky: 0x9aa4ad, fog: 0x8d969e, floor: 0x5c6167, wall: 0x8a8f95, cover: 0x6d7379, crate: 0x7c6f5a, pillar: 0x9da3a8, roof: 0x4f5459, accent: 0xffb020, sun: 0xffffff },
  b, pts([[0, 12, 'C'], [38, 0, 'W'], [26, 30, 'F']]),
  pts([[30, 40, 'S'], [0, 36, 'M'], [58, 26, 'O'], [46, 12, 'H']]));
