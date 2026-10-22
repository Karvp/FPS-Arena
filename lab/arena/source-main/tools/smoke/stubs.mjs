export const prepared = new Map(); export function onLoaded() { return () => {}; }
import { Group, Vector3, Quaternion } from './three-stub.mjs';
export function instantiate() { return new Group(); }
const PA = () => ({ muzzleX: 0, muzzleY: 0.02, muzzleZ: -0.4, opticY: 0.08, opticZ: -0.05, underY: -0.06, gripZ: -0.2, laserZ: -0.3 });
export function buildProcedural(id) { return { id, root: new Group(), R: new Quaternion(), ext: new Vector3(1, 1, 1), center: new Vector3(), scale: 1, sight: new Vector3(), anchors: PA(), anchorsFlip: PA(), procedural: true, axes: {} }; }
