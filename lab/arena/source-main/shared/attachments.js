// WEAPON MODIFICATION: attachment table, per-weapon compatibility and the stat maths. Used by BOTH server (truth) and client (prediction / UI).
// ACCESSORIES: a gun carries at most MAX_ATT (2) attachments, stored as an ordered list of ids joined by '|', e.g. "laser|coyote" ('' = nothing).
// Every attachment has a MOUNT (`slot`: optic / grip / laser / muzzle): two attachments on the same mount would overlap, so a gun never carries two of one mount.
//  mul   : multipliers applied to the weapon table (numbers; `range` scales both entries of range:[near,far])
//  flags : booleans merged onto the weapon (suppressed -> no muzzle flash, quiet shots)
// All balance numbers live HERE.
import { WEAPONS } from './weapons.js';

export const SLOTS = ['optic', 'grip', 'laser', 'muzzle'];       // the MOUNTS
export const MAX_ATT = 2;
export const SLOT_NAME = { optic: 'Optic', grip: 'Foregrip', laser: 'Laser', muzzle: 'Muzzle' };

export const ATT = {
  // ---- optics (the models bring their own reticle; `eyeRelief` = default camera distance behind the sight when aiming) ----
  coyote:     { id: 'coyote', slot: 'optic', name: 'Coyote Reflex Sight', file: 'assets/attachments/coyote_sight.glb', eyeRelief: 0.2,
    mul: { adsTime: 0.96 }, desc: 'Compact open reflex sight. Quickest to aim.' },
  // ---- foregrips ----
  dd_grip:    { id: 'dd_grip', slot: 'grip', name: 'Daniel Defense Vertical Grip', file: 'assets/attachments/daniel_defense_grip.glb',
    mul: { recoilV: 0.92, recoilH: 0.8, adsTime: 1.04 }, desc: 'Strong horizontal recoil control. Slightly slower to aim.' },
  vgrip:      { id: 'vgrip', slot: 'grip', name: 'Vertical Foregrip', file: 'assets/attachments/vertical_foregrip.glb',
    mul: { recoilV: 0.8, recoilH: 0.95, adsTime: 1.03 }, desc: 'Strong vertical recoil control. Slightly slower to aim.' },
  agrip:      { id: 'agrip', slot: 'grip', name: 'Angled Foregrip', file: 'assets/attachments/angled_grip.glb',
    mul: { recoilV: 0.93, recoilH: 0.93, adsTime: 0.92 }, desc: 'Faster aiming with a small recoil reduction.' },
  // ---- laser ----
  laser:      { id: 'laser', slot: 'laser', name: 'DBAL Laser Sight', file: 'assets/attachments/laser_sight.glb',
    mul: { spreadHip: 0.65 }, beam: true, desc: 'Much tighter hip-fire spread. The red beam is visible to everybody.' },
  // ---- muzzle ----
  suppressor: { id: 'suppressor', slot: 'muzzle', name: 'Suppressor', file: 'assets/attachments/suppressor.glb',
    mul: { range: 0.88, recoilV: 0.95 }, flags: { suppressed: true }, desc: 'No muzzle flash and much quieter shots. Shorter effective range.' },
};
export const ATT_BY_SLOT = {}; for (const s of SLOTS) ATT_BY_SLOT[s] = Object.values(ATT).filter(a => a.slot === s).map(a => a.id);

// ---- compatibility (edit these lists freely) ----
const OPTIC_CATS = new Set(['Assault Rifle', 'SMG', 'Marksman', 'LMG', 'Shotgun']);
const GRIP_CATS = new Set(['Assault Rifle', 'SMG', 'Marksman', 'LMG', 'Shotgun']);
const NO_OPTIC = new Set(['qbz95', 'thompson', 'sks']);   // integrated optics / carry handles / vintage furniture
const NO_GRIP = new Set(['thompson']);
const NO_MUZZLE = new Set(['mp5sd', 'honey_badger']);                                                                 // already suppressed
export function slotAllowed(weaponId, slot) {
  const w = WEAPONS[weaponId]; if (!w || w.unarmed || w.skillWeapon || w.melee || w.laser || w.id === 'laser_rifle') return false;      // the knife takes nothing
  if (slot === 'optic') return OPTIC_CATS.has(w.cat) && !NO_OPTIC.has(weaponId);
  if (slot === 'grip') return GRIP_CATS.has(w.cat) && !NO_GRIP.has(weaponId);
  if (slot === 'muzzle') return !NO_MUZZLE.has(weaponId);
  return slot === 'laser';
}
export const slotsFor = (weaponId) => SLOTS.filter(s => slotAllowed(weaponId, s));

// ---- string <-> object ----
// parseAtt accepts any '|' list of ids -> { optic, grip, laser, muzzle } (first id per mount wins)
export const parseAtt = (str) => { const o = {}; for (const s of SLOTS) o[s] = null; if (typeof str === 'string') for (const t of str.split('|')) { const a = ATT[t]; if (a && !o[a.slot]) o[a.slot] = t; } return o; };
export const attString = (o) => SLOTS.map(s => o && o[s]).filter(Boolean).join('|');
// sanitises untrusted input for one weapon -> canonical ordered list ('' = nothing): valid + allowed ids only, one per mount, at most MAX_ATT
export function cleanAtt(weaponId, input) {
  const ids = typeof input === 'string' ? input.split('|') : (input && typeof input === 'object' ? SLOTS.map(s => input[s]) : []), out = [], used = new Set();
  for (const id of ids) {
    const a = typeof id === 'string' && ATT[id]; if (!a || used.has(a.slot) || !slotAllowed(weaponId, a.slot)) continue;
    used.add(a.slot); out.push(id); if (out.length >= MAX_ATT) break;
  }
  return out.join('|');
}
export const attList = (str) => SLOTS.map(s => parseAtt(str)[s]).filter(Boolean).map(id => ATT[id]);

// ---- effective weapon stats (cached; the returned object is shared, never mutate it) ----
const cache = new Map();
export function gunStats(id, att) {
  const base = WEAPONS[id]; if (!base || !att) return base;
  const key = id + '#' + att; let w = cache.get(key); if (w) return w;
  w = { ...base };
  for (const a of attList(att)) {
    for (const k in (a.mul || {})) {
      const m = a.mul[k];
      if (k === 'range') w.range = w.range.map(v => v * m);
      else if (typeof w[k] === 'number') w[k] *= m;
    }
    Object.assign(w, a.flags || {});
  }
  w.att = att; cache.set(key, w); return w;
}
