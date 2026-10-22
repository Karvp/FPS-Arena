// PER-WEAPON viewmodel calibration. Every weapon owns its own object (no shared references).
//  position    : hip-fire position of weaponGroup relative to the camera [x,y,z]
//  rotationDeg : extra rotation applied to weaponWrapper on top of the auto-orientation [x,y,z]
//  scale       : extra uniform scale on top of the auto-fit (auto-fit makes the model WEAPONS[id].len metres long)
//  ads         : fine offset added to the computed ADS pose (metres)
//  eyeRelief   : distance camera -> rear sight when aiming
//  orient      : {flip:true} swaps muzzle/stock ends, {flipUp:true} rolls the gun 180deg about the barrel (auto-detection override)
// DEV MODE (main menu -> DEV MODE) edits these live; press C to copy the values, paste them here.
import { WEAPONS } from '/shared/weapons.js';

const CAT = {
  'Assault Rifle': { position: [0.24, -0.22, -0.55], eyeRelief: 0.30 },
  SMG:             { position: [0.22, -0.21, -0.50], eyeRelief: 0.28 },
  Sniper:          { position: [0.25, -0.24, -0.60], eyeRelief: 0.34 },
  LMG:             { position: [0.26, -0.25, -0.58], eyeRelief: 0.32 },
  Marksman:        { position: [0.24, -0.23, -0.58], eyeRelief: 0.32 },
  Shotgun:         { position: [0.24, -0.23, -0.56], eyeRelief: 0.30 },
  Special:         { position: [0.23, -0.21, -0.52], eyeRelief: 0.28 },
  Pistol:          { position: [0.2, -0.2, -0.42], eyeRelief: 0.26 },
};
export const CALIBRATION = {};
for (const id of Object.keys(WEAPONS)) {
  const c = CAT[WEAPONS[id].cat];
  CALIBRATION[id] = { position: c.position.slice(), rotationDeg: [0, 0, 0], scale: 1, ads: [0, 0, 0], eyeRelief: c.eyeRelief, orient: { flip: false, flipUp: false } };
}
// ---- per-weapon overrides (DEV MODE output; each entry is merged onto that weapon's own defaults) ----
const TUNED = {
  m134: { position: [0, -0.36, -0.66], rotationDeg: [0, 0, 0], ads: [0, 0, 0], scale: 1, eyeRelief: 0.3 },              // Attack Chopper gun: centred and lowered, like a gunner camera
  knife: { position: [0.22, -0.2, -0.5], rotationDeg: [0, 0, 0], ads: [0, 0, 0], scale: 1, eyeRelief: 0.26 },
  m4a1: { position: [0.24, -0.22, -0.452], rotationDeg: [0, 0, 0], ads: [0.008, -0.042, 0.016], scale: 1, eyeRelief: 0.3 },
  fn_scar: { position: [0.24, -0.22, -0.55], rotationDeg: [0, 0, 0], ads: [-0.006, -0.052, 0], scale: 1, eyeRelief: 0.3 },
  honey_badger: { position: [0.24, -0.22, -0.55], rotationDeg: [0, 0, 0], ads: [0.002, -0.038, 0], scale: 1, eyeRelief: 0.3 },
  colt9mm: { position: [0.2, -0.2, -0.45], rotationDeg: [0.2, -179.4, 0], ads: [0, -0.032, 0], scale: 1, eyeRelief: 0.28 },
  mp5sd: { position: [0.22, -0.21, -0.5], rotationDeg: [0.4, 0, 0], ads: [0, -0.022, 0], scale: 1, eyeRelief: 0.28 },
  mpx: { position: [0.22, -0.21, -0.5], rotationDeg: [0, 0, 0], ads: [0, -0.04, 0], scale: 1, eyeRelief: 0.28 },
  apc9: { position: [0.22, -0.21, -0.5], rotationDeg: [0, -180, 0], ads: [-0.006, -0.022, 0], scale: 1, eyeRelief: 0.28 },
  m249: { position: [0.26, -0.25, -0.58], rotationDeg: [-0.4, -0.2, 0], ads: [0.004, -0.036, 0], scale: 1, eyeRelief: 0.32 },
  rpd: { position: [0.26, -0.25, -0.58], rotationDeg: [0, 0, 0], ads: [-0.012, -0.038, 0], scale: 1, eyeRelief: 0.32 },
  hk_sl8: { position: [0.24, -0.23, -0.58], rotationDeg: [0, 0, 0], ads: [0.004, -0.028, 0], scale: 1, eyeRelief: 0.32 },
  a545: { position: [0.24, -0.22, -0.55], rotationDeg: [2.2, 0, 0], ads: [0.01, -0.022, 0], scale: 1, eyeRelief: 0.3 },
  ak74: { position: [0.24, -0.22, -0.47], rotationDeg: [0.6, 0, 0], ads: [0.008, -0.064, -0.016], scale: 1, eyeRelief: 0.3 },
  acr: { position: [0.24, -0.22, -0.55], rotationDeg: [0, 0, 0], ads: [0, -0.022, 0], scale: 1, eyeRelief: 0.3 },
  fnc: { position: [0.24, -0.22, -0.55], rotationDeg: [0.8, 0, 0], ads: [0.004, -0.018, -0.008], scale: 1, eyeRelief: 0.3 },
  hk416: { position: [0.24, -0.22, -0.55], rotationDeg: [1.4, 0, 0], ads: [0.006, -0.052, 0], scale: 1, eyeRelief: 0.3 },
  ac556: { position: [0.248, -0.22, -0.55], rotationDeg: [1.4, 0, 0], ads: [0.008, -0.018, 0], scale: 1, eyeRelief: 0.3 },
  qbz95: { position: [0.24, -0.22, -0.55], rotationDeg: [0, 0, 0], ads: [0, -0.028, 0], scale: 1, eyeRelief: 0.3 },
  apc308: { position: [0.24, -0.22, -0.55], rotationDeg: [0, 0, 0], ads: [-0.008, -0.026, 0], scale: 1, eyeRelief: 0.3 },
  ar57: { position: [0.22, -0.21, -0.5], rotationDeg: [0.4, 0, 0], ads: [0.004, -0.032, 0], scale: 1, eyeRelief: 0.28 },
  aek918g: { position: [0.21, -0.21, -0.5], rotationDeg: [0, -179.8, 0], ads: [0.008, -0.024, 0], scale: 1, eyeRelief: 0.28 },
  aek919k: { position: [0.22, -0.21, -0.5], rotationDeg: [0.8, -180, 0], ads: [-0.004, -0.028, 0], scale: 1, eyeRelief: 0.28 },
  uzi: { position: [0.22, -0.21, -0.5], rotationDeg: [0, 0, 0], ads: [0, -0.056, 0], scale: 1, eyeRelief: 0.28 },
  pp93: { position: [0.22, -0.21, -0.5], rotationDeg: [1, -180, 0], ads: [-0.002, -0.028, 0], scale: 1, eyeRelief: 0.28 },
  thompson: { position: [0.22, -0.21, -0.5], rotationDeg: [0, -0.2, 0], ads: [0, -0.018, 0], scale: 1, eyeRelief: 0.28 },
  ump45: { position: [0.208, -0.21, -0.5], rotationDeg: [0.2, -180, 0], ads: [-0.006, -0.058, 0], scale: 1, eyeRelief: 0.28 },
  sks: { position: [0.24, -0.23, -0.58], rotationDeg: [-0.2, 0, 0], ads: [0.01, -0.032, 0], scale: 1, eyeRelief: 0.32 },
  arx200: { position: [0.24, -0.23, -0.58], rotationDeg: [0, 0, 0], ads: [-0.006, -0.042, 0], scale: 1, eyeRelief: 0.32 },
  aa12: { position: [0.24, -0.23, -0.56], rotationDeg: [1, 0, 0], ads: [0, -0.02, 0], scale: 1, eyeRelief: 0.3 },
  srm1216: { position: [0.238, -0.23, -0.56], rotationDeg: [1.2, -179.4, 0], ads: [-0.01, -0.034, 0], scale: 1, eyeRelief: 0.3 },
  makarov: { position: [0.2, -0.2, -0.42], rotationDeg: [0, 0, 0], ads: [-0.002, -0.028, 0], scale: 1, eyeRelief: 0.26 },
  rpk: { position: [0.26, -0.25, -0.58], rotationDeg: [0.8, -0.2, 0], ads: [0.012, -0.024, 0], scale: 1, eyeRelief: 0.32 },
  m26mass: { position: [0.24, -0.23, -0.56], rotationDeg: [0, 0, 0], ads: [-0.014, -0.046, 0], scale: 1, eyeRelief: 0.3 },
  rsh12: { position: [0.2, -0.2, -0.42], rotationDeg: [0, 0, 0], ads: [0, -0.026, 0], scale: 1, eyeRelief: 0.26 },
  microuzi: { position: [0.2, -0.2, -0.42], rotationDeg: [0, -0.4, 0], ads: [0, -0.056, 0], scale: 1, eyeRelief: 0.26 },
  em2: { position: [0.2, -0.2, -0.42], rotationDeg: [0, 0, 0], ads: [0, -0.024, 0], scale: 1, eyeRelief: 0.26 },
  annihilator: { position: [0.2, -0.2, -0.42], rotationDeg: [0, 0, 0], ads: [0, -0.024, 0], scale: 1, eyeRelief: 0.26 },
};
for (const [id, v] of Object.entries(TUNED)) if (CALIBRATION[id]) Object.assign(CALIBRATION[id], JSON.parse(JSON.stringify(v)));

export const getCal = (id) => CALIBRATION[id] || CALIBRATION.m4a1;
