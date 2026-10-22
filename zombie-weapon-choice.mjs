import {evaluateWeapon} from './weapon-evaluation.mjs';

// Portfolio for a moving zombie wave: meaningful damage at kiting distances,
// crowd control, and reloadability matter more than physical inventory slot.
const FIREARM = w=>!!w && !w.unarmed && !w.melee && !w.skillWeapon && !w.noLoot;
export function zombieWeaponScore(w, gun=null){
  if(!FIREARM(w))return -100;
  if(gun && !w.infinite && (gun.mag??0)<=0 && (gun.reserve??0)<=0)return -90;
  const distances=[8,20,34];
  let score=distances.reduce((sum,d,i)=>sum+[.20,.5,.30][i]*evaluateWeapon(w,{
    mode:'zm',distance:d,enemies:5,targetHp:100,pressure:d<12?'high':'medium',
    magazine:w.magSize,reserve:2*w.magSize
  }).score,0);
  // Maintain a strategic preference for sustainable crowd weapons over pistols.
  if(w.cat==='Pistol')score-=8;
  if(w.cat==='Assault Rifle'||w.cat==='LMG')score+=4;
  if(gun && !w.infinite && (gun.mag??0)<=0)score-=3; // reload costs time, not combat identity
  return Math.round(score*100)/100;
}
export function preferredZombieSlot(ws,catalog={},margin=9){
  if(!ws?.guns?.length)return null;
  const a=ws.guns[0],b=ws.guns[1],wa=catalog[a?.id],wb=catalog[b?.id];
  // The explicit Zombie upgrade is for a weak pistol in primary and a
  // substantially stronger NON-PISTOL in secondary. Do not make a second
  // pistol into a long-range replacement or preempt emergency-switch logic.
  if(!FIREARM(wa) && FIREARM(wb))return 1;
  if(wa?.cat==='Pistol' && FIREARM(wb) && wb.cat!=='Pistol'){
    const sa=zombieWeaponScore(wa,a),sb=zombieWeaponScore(wb,b);
    return sb>=sa+margin ? 1 : 0;
  }
  if(FIREARM(wa) && wa.cat!=='Pistol' && FIREARM(wb) && wb.cat!=='Pistol'){
    const sa=zombieWeaponScore(wa,a),sb=zombieWeaponScore(wb,b);
    return sb>=sa+margin+5 ? 1 : 0;
  }
  return 0;
}
export function zombiePickupDecision(game,candidate,catalog={},margin=9){
  const ws=game?.local?.ws;
  if(!ws?.guns || !FIREARM(candidate))return null;
  const current=ws.slot===1?1:0;
  const empty=i=>!FIREARM(catalog[ws.guns[i]?.id]);
  const slot=empty(current)?current:empty(1-current)?1-current:
    zombieWeaponScore(catalog[ws.guns[0]?.id],ws.guns[0]) <=
    zombieWeaponScore(catalog[ws.guns[1]?.id],ws.guns[1]) ? 0:1;
  const original=catalog[ws.guns[slot]?.id];
  // A weak pistol never displaces a rifle/sniper/SMG during a zombie wave.
  if(candidate.cat==='Pistol' && FIREARM(original) && original.cat!=='Pistol')return null;
  const advantage=zombieWeaponScore(candidate,{mag:candidate.magSize,reserve:candidate.magSize*2})-
    zombieWeaponScore(original,ws.guns[slot]);
  if(!empty(slot) && advantage<margin)return null;
  return {slot,advantage,score:Math.min(110,65+Math.max(0,advantage)),reason:empty(slot)?'empty-slot':'stronger-zombie-weapon'};
}
