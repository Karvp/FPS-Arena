// LOOT RARITY (Battle Royale crates, Zombies crates). Used by the server (what a crate drops) and the client (colours).
// Everything is data: add a weapon to shared/weapons.js and it lands in a tier automatically through the rules below;
// to move a weapon, add it to EXPLICIT. To change what a tier drops, edit RARITIES.
import { WEAPONS } from './weapons.js';

// drops: ammoHeavy = Sniper + Marksman + Shotgun rounds, ammoLight = AR + SMG + LMG (+ pistol / special) rounds,
//        plates = armor plates, equip = throwables, energy = skill energy.   weight = chance of a crate rolling this rarity.
export const RARITIES = [
  { id: 'grey',   name: 'Grey',   color: 0x9aa0a6, css: '#9aa0a6', weight: 30, drops: { ammoHeavy: 0,  ammoLight: 10, plates: 0, equip: 0, energy: 0 } },
  { id: 'green',  name: 'Green',  color: 0x3ddc5a, css: '#3ddc5a', weight: 25, drops: { ammoHeavy: 2,  ammoLight: 10, plates: 1, equip: 0, energy: 0 } },
  { id: 'blue',   name: 'Blue',   color: 0x3d8bff, css: '#3d8bff', weight: 20, drops: { ammoHeavy: 5,  ammoLight: 30, plates: 1, equip: 0, energy: 0 } },
  { id: 'purple', name: 'Purple', color: 0xb44dff, css: '#b44dff', weight: 13, drops: { ammoHeavy: 5,  ammoLight: 30, plates: 1, equip: 0, energy: 0 } },
  { id: 'orange', name: 'Orange', color: 0xff8a1e, css: '#ff8a1e', weight: 8,  drops: { ammoHeavy: 10, ammoLight: 45, plates: 2, equip: 1, energy: 10 } },
  { id: 'red',    name: 'Red',    color: 0xff2a2a, css: '#ff2a2a', weight: 4,  drops: { ammoHeavy: 20, ammoLight: 60, plates: 3, equip: 2, energy: 30 } },
];
export const RARITY_IDX = Object.fromEntries(RARITIES.map((r, i) => [r.id, i]));
export const RARITY_COUNT = RARITIES.length;

// Weapons whose tier is named explicitly (these win over every category rule).
const EXPLICIT = {
  red: ['laser_rifle'],
  purple: ['hk_sl8', 'svt40', 'arx200'],
  blue: ['federov', 'tkb408', 'stg44', 'm16a4', 'ump45', 'aks74u'],
  grey: ['p08', 'makarov'],
};
const ORANGE_RPM = { 'SMG': 800, 'Assault Rifle': 700 };           // "any SMG with 800+ RPM, any AR with 700+ RPM"
// category rules (checked in this order). Marksman -> orange, Sniper -> red, Shotgun -> purple (AA-12 is orange), everything else by RPM.
function tierByRule(w) {
  if (w.id === 'aa12') return 'orange';
  switch (w.cat) {
    case 'Sniper': return 'red';
    case 'Marksman': return 'orange';
    case 'Shotgun': return 'purple';
    case 'Pistol': return 'green';                                  // every pistol that is not explicitly grey
    case 'Special': return 'red';
    case 'SMG': case 'Assault Rifle': return w.rpm >= ORANGE_RPM[w.cat] ? 'orange' : 'purple';
    case 'LMG': return 'purple';                                    // not named in the design: LMGs sit in Purple (edit here to move them)
    default: return 'purple';
  }
}

export const WEAPON_RARITY = {};                                    // weapon id -> rarity index
for (const w of Object.values(WEAPONS)) {
  if (w.unarmed || w.skillWeapon || w.noLoot) continue;
  let id = null;
  for (const [r, list] of Object.entries(EXPLICIT)) if (list.includes(w.id)) id = r;
  WEAPON_RARITY[w.id] = RARITY_IDX[id || tierByRule(w)];
}
export const rarityOf = (wid) => (WEAPON_RARITY[wid] ?? 0);
export const WEAPONS_BY_RARITY = RARITIES.map((_, i) => Object.keys(WEAPON_RARITY).filter(id => WEAPON_RARITY[id] === i));

// ammo classes: which rounds a gun uses
export const AMMO_CLASS = { heavy: ['Sniper', 'Marksman', 'Shotgun'], light: ['Assault Rifle', 'SMG', 'LMG', 'Pistol', 'Special'] };
export const ammoClassOf = (wid) => (WEAPONS[wid] && AMMO_CLASS.heavy.includes(WEAPONS[wid].cat) ? 'heavy' : 'light');

// weighted roll of a crate rarity; minIdx raises the floor (Zombies: Purple and above only)
export function rollRarity(rand = Math.random, minIdx = 0) {
  const pool = RARITIES.map((r, i) => [i, i >= minIdx ? r.weight : 0]); const tot = pool.reduce((a, p) => a + p[1], 0);
  let x = rand() * tot; for (const [i, w] of pool) { if (w > 0 && (x -= w) <= 0) return i; }
  return Math.max(minIdx, 0);
}
