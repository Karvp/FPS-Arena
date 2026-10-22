// Main-source-only tactical band inventory. No server-private state read.
// Usage: node scripts/c8-main-weapon-audit.mjs > reports/c8/weapon-band-audit.json
import {WEAPONS} from '../lab/arena/source-main/shared/weapons.js';
import {gunStats,slotAllowed} from '../lab/arena/source-main/shared/attachments.js';
import {tacticalWeaponBand} from '../tactical-director.mjs';
const arr=Object.values(WEAPONS).filter(w=>!w.skillWeapon&&!w.unarmed&&!w.noLoot)
  .sort((a,b)=>a.id.localeCompare(b.id));
const guns=arr.map(w=>{
  const band=tacticalWeaponBand(w,true),legacy=tacticalWeaponBand(w,false);
  const suppressor=slotAllowed(w.id,'muzzle')?
    tacticalWeaponBand(gunStats(w.id,'suppressor'),true):null;
  return {id:w.id,cat:w.cat,damage:w.dmg,falloff:w.range,
    physicalMax:w.maxRange,adsSpreadDegrees:w.spreadAds,move:w.move,
    usefulPreference:band,legacyPreference:legacy,
    suppressedPreference:suppressor,attachmentCompatible:!!suppressor};
});
console.log(JSON.stringify({format:'fpsarena-c8-main-effective-weapon-audit-v1',
  source:'uploaded-main C7 lab/arena/source-main',
  note:'Preference ranges are experimental proxies, not hit probabilities or hard firing limits',
  counts:{allCatalog:Object.keys(WEAPONS).length,selectable:guns.length,
    suppressionCompatible:guns.filter(x=>x.attachmentCompatible).length},guns},null,2));
