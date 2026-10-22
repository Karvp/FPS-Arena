// Reproducible static ballistics table for main selectable weapon roster.
import {writeFileSync} from 'node:fs';
import {WEAPON_ORDER,WEAPONS} from '../lab/arena/source-main/shared/weapons.js';
import {slotAllowed,gunStats} from '../lab/arena/source-main/shared/attachments.js';
import {estimateEngagementBallistics as estimate} from '../engagement-ballistics.mjs';
const distances=[5,10,20,40,75,120,200,320];
const rows=[];let excluded=[];
for(const [,weapons] of WEAPON_ORDER)for(const id of weapons){
 const w=WEAPONS[id];
 if(w.melee||w.laser){excluded.push({id,reason:w.melee?'melee':'laser'});continue;}
 for(const att of ['',...(slotAllowed(id,'muzzle')?['suppressor']:[])]){
  const effective=gunStats(id,att);
  for(const d of distances){
   const ads=estimate(effective,d,{samples:96,aimPoint:'head'});
   const hip=estimate(effective,d,{samples:96,aim:false,aimPoint:'head'});
   rows.push({weapon:id,category:w.cat,attachment:att||'none',distance:d,
    physicalMax:effective.maxRange,falloffStart:effective.range[0],falloffEnd:effective.range[1],
    adsPelletHit:ads?.pelletHitFraction??null,adsDamage:ads?.expectedDamagePerTrigger??null,
    hipPelletHit:hip?.pelletHitFraction??null,hipDamage:hip?.expectedDamagePerTrigger??null});
  }
 }
}
const base=new URL('../reports/c9/',import.meta.url);
writeFileSync(new URL('weapon-ballistic-atlas.json',base),JSON.stringify({model:'static-unoccluded-angular-envelope-v1',
 notes:'No target motion, network latency, recoil control, environmental occlusion or buffs. Not calibrated to real matches.',
 distances,selectableCount:WEAPON_ORDER.reduce((s,[,v])=>s+v.length,0),excluded,rows},null,2));
const keys=Object.keys(rows[0]);
writeFileSync(new URL('weapon-ballistic-atlas.csv',base),[keys.join(','),...rows.map(r=>keys.map(k=>r[k]??'').join(','))].join('\n')+'\n');
console.log(`selectable ${WEAPON_ORDER.reduce((s,[,v])=>s+v.length,0)}, excluded ${excluded.length}, rows ${rows.length}`);
