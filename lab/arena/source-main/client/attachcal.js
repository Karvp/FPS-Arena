// ATTACHMENT PLACEMENT calibration. Defaults are derived automatically from each weapon's geometry (muzzle tip, top surface, underside, see weaponmodel.js `anchors`);
// everything below is a hand-tuned correction on top. Offsets are in metres, relative to the automatic anchor; +x right, +y up, +z towards the SHOULDER (-z = towards the muzzle):
//   BASE  : <attachmentId>: { pos: [x, y, z], yaw: deg, scale: k }          -> applies to that attachment on EVERY weapon (fix a model once, e.g. the suppressor)
//   TUNED : <weaponId>: { <attachmentId>: { pos, yaw, scale }, ... }        -> extra correction for ONE weapon (added on top of BASE)
// Attachment ids: coyote | dd_grip vgrip agrip | laser | suppressor.
// DEV MODE (key B) edits both live: B cycles through the equipped attachments, first the ONE-WEAPON edit, then the ALL-WEAPONS edit; C copies the matching line.
export const BASE = {
  // suppressor: { pos: [0, 0, 0], yaw: 0, scale: 1 },
};
const TUNED = {
  // m4a1: { vgrip: { pos: [0, 0, -0.01], yaw: 0, scale: 1 }, suppressor: { pos: [0, 0.002, 0], yaw: 0, scale: 1 } },
};
const live = {}, liveBase = {};
const blank = () => ({ pos: [0, 0, 0], yaw: 0, scale: 1 });
const from = (t) => { const c = blank(); if (t) { if (t.pos) c.pos = t.pos.slice(); if (typeof t.yaw === 'number') c.yaw = t.yaw; if (typeof t.scale === 'number') c.scale = t.scale; } return c; };
export function getAttCal(weaponId, attId) { const k = weaponId + '.' + attId; return live[k] || (live[k] = from(TUNED[weaponId] && TUNED[weaponId][attId])); }
export const baseCal = (attId) => liveBase[attId] || (liveBase[attId] = from(BASE[attId]));
export const resetAttCal = (weaponId, attId) => { delete live[weaponId + '.' + attId]; };
export const resetBase = (attId) => { delete liveBase[attId]; };
const f4 = (n) => +n.toFixed(4), fmt = (c) => `{ pos: [${c.pos.map(f4).join(', ')}], yaw: ${f4(c.yaw)}, scale: ${f4(c.scale)} }`;
export function attCalCode(weaponId) {                // line for TUNED (this weapon only)
  const parts = Object.keys(live).filter(k => k.startsWith(weaponId + '.')).map(k => `${k.slice(weaponId.length + 1)}: ${fmt(live[k])}`);
  return parts.length ? `${weaponId}: { ${parts.join(', ')} },` : `// ${weaponId}: no attachment edits yet`;
}
export function baseCode() {                          // lines for BASE (all weapons)
  const parts = Object.keys(liveBase).map(k => `${k}: ${fmt(liveBase[k])},`);
  return parts.length ? parts.join('\n') : '// no all-weapons attachment edits yet';
}

// ADS POSITION WITH AN OPTIC. An optic is an accessory: the gun stays centred on its own iron sights, the optic just swaps in the ADS offset [x, y, z] (metres) YOU give.
// One entry per weapon AND per optic (their heights differ).  Offsets are added to the gun-centred pose, +x right, +y up, +z towards the camera (closer).
// Without an entry the game starts from an automatic estimate (the offset that puts the optic's centre on the crosshair) so a new combination is usable at once.
// DEV MODE: equip the optic, aim (RMB) and use J/L I/K U/O - the first nudge copies the automatic estimate, then it is YOURS; C copies the line for here.
export const ADS_OPTIC = {
  // m4a1: { coyote: [0, -0.06, 0] },
};
const liveAds = {}, cleared = new Set();
export function getOpticAds(weaponId, opticId) {
  const k = weaponId + '.' + opticId; if (liveAds[k]) return liveAds[k]; if (cleared.has(k)) return null;
  const t = ADS_OPTIC[weaponId] && ADS_OPTIC[weaponId][opticId]; if (t) { liveAds[k] = t.slice(); return liveAds[k]; } return null;
}
export function setOpticAds(weaponId, opticId, v) { const k = weaponId + '.' + opticId; cleared.delete(k); liveAds[k] = v; return v; }
export function resetOpticAds(weaponId, opticId) { const k = weaponId + '.' + opticId; delete liveAds[k]; cleared.add(k); }
export function opticAdsCode(weaponId) {
  const f = (n) => +n.toFixed(4), parts = [];
  for (const k of Object.keys(liveAds)) if (k.startsWith(weaponId + '.')) parts.push(`${k.slice(weaponId.length + 1)}: [${liveAds[k].map(f).join(', ')}]`);
  return parts.length ? `${weaponId}: { ${parts.join(', ')} },` : '';
}
