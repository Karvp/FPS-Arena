/**
 * Live weapon policy derived from the v2.6.2 evaluation model.
 * All decisions are advisory. Server weapon state and primary-first switch
 * constraints remain authoritative; the policy cannot force a shot or switch.
 */
import {evaluateWeapon} from './weapon-evaluation.mjs';
import {zombiePickupDecision} from './zombie-weapon-choice.mjs';
import {weaponProfile} from './weapon-tactics.mjs';
const cap=(n,a,b)=>Math.max(a,Math.min(b,n));
const isFirearm=(w)=>!!(w&&!w.unarmed&&!w.melee&&!w.skillWeapon);
export function liveCombatScenario(game,target,risk={},weapon=null,gun=null){
  const mode=game?.modeState?.type||'tdm';
  const mv=game?.local?.mv, point=target?.point;
  const distance=mv&&point?Math.hypot(point.x-mv.x,point.z-mv.z):Infinity;
  const zombies=mode==='zm'?(game?.zremotes?.list||[]).filter(z=>z?.alive&&z.pos):[];
  const nearZombies=mv?zombies.filter(z=>Math.hypot(z.pos.x-mv.x,z.pos.z-mv.z)<45).length:0;
  const hostileCount=mode==='zm'?nearZombies:Math.max(Number(risk?.visible)||0,Number(risk?.close)||0,point?1:0);
  const hp=Number.isFinite(game?.local?.hp)?game.local.hp:100;
  const pressure=(risk?.aiming>0 || risk?.nearest<16 || (mode==='zm'&&zombies.some(z=>mv&&Math.hypot(z.pos.x-mv.x,z.pos.z-mv.z)<12)))?'high':
    (risk?.hot || risk?.nearest<55 || nearZombies>2)?'medium':'low';
  const finite=game?.local?.ws?.finite!==false;
  const reserve=finite?Math.max(0,Number(gun?.reserve)||0):Number.MAX_SAFE_INTEGER;
  return {id:'live',mode,distance:Number.isFinite(distance)?distance:999,
    enemies:Math.max(1,hostileCount),targetHp:Number.isFinite(target?.remote?.data?.hp)?target.remote.data.hp:100,
    ownHp:hp,pressure,visible:target?.visible!==false,cover:false,
    magazine:Math.max(0,Number(gun?.mag)||0),reserve,
    ringUrgent:mode==='br' && ((game?.local?.gas||0)>0 || (game?.you?.ringRate||0)>0),
    weaponId:weapon?.id};
}
export function liveWeaponPolicy(game,target,risk={},catalog={},options={}){
  const ws=game?.local?.ws;
  if(!ws?.guns?.length)return null;
  const slot=ws.slot,active=ws.guns[slot],primary=ws.guns[0],secondary=ws.guns[1];
  const gun=slot===1 && game?.modeState?.type!=='zm' && isFirearm(catalog[primary?.id]) ? primary : active;
  const weapon=catalog[gun?.id];
  if(!isFirearm(weapon))return null;
  const scenario=liveCombatScenario(game,target,risk,weapon,gun);
  const assessment=evaluateWeapon(weapon,scenario);
  const base=weaponProfile(weapon,{...options,dynamicWeaponPolicy:null});
  const pressure=scenario.pressure==='high',healthLow=scenario.ownHp<40;
  let desired=base.distance;
  // Floor/ceiling are category-specific; scores influence positioning, NOT
  // whether a loaded firearm is allowed to fire at a visible valid target.
  if(weapon.cat==='Sniper')desired=cap(base.distance*(pressure?1.22:1.10),38,82);
  else if(weapon.cat==='Marksman')desired=cap(base.distance*(pressure?1.14:1),28,61);
  else if(weapon.cat==='LMG')desired=cap(base.distance*(pressure?1.12:1),23,55);
  else if(weapon.cat==='SMG')desired=cap(base.distance*(healthLow?1.35:pressure?1.14:1),9,25);
  else if(weapon.cat==='Shotgun')desired=cap(base.distance*(healthLow?1.5:1),6,15);
  else desired=cap(base.distance*(healthLow?1.2:pressure?1.10:1),9,60);
  if(scenario.mode==='zm')desired=Math.max(desired,cap(options.zombieSpacing??22,12,34));
  // Let evaluated performance influence *how* to approach, without ever
  // vetoing an otherwise valid server-side shot.
  if(scenario.magazine>0 && scenario.visible && scenario.distance<=base.fire){
    if(assessment.score<35 && pressure)desired=Math.min(desired*1.12,weapon.cat==='Sniper'?82:67);
    else if(assessment.score>70 && !pressure && ['SMG','Shotgun'].includes(weapon.cat))
      desired=Math.max(weapon.cat==='Shotgun'?6:9,desired*.92);
  }
  if(scenario.mode==='zm')desired=Math.max(desired,policySpacing(options));
  if(assessment.action==='reload' && scenario.magazine===0)desired=Math.max(desired,base.distance*1.15);
  return {weaponId:weapon.id,slot:slot,strategicSlot:gun===primary?0:slot,
    score:assessment.score,action:assessment.action,desiredDistance:roundDistance(desired),
    fireRange:base.fire,mode:scenario.mode,pressure:scenario.pressure,
    lastDistance:scenario.distance};
}
function policySpacing(options){return cap(options.zombieSpacing??22,12,34);}
function roundDistance(n){return Math.round(n*10)/10;}
/**
 * Value of swapping a ground firearm into the ACTIVE slot. Use a mode-specific
 * portfolio of distances rather than one target snapshot. Return null when
 * a pickup may destroy the primary or when ammunition is not known.
 */
export function pickupUpgradeValue(game,candidate,catalog={}){
  const ws=game?.local?.ws, guns=ws?.guns||[], old=guns[ws?.slot];
  if(!ws || !isFirearm(candidate) || !guns.length)return null;
  if(game?.modeState?.type==='zm')return zombiePickupDecision(game,candidate,catalog)?.score??null;
  const oldWeapon=catalog[old?.id], otherWeapon=catalog[guns[1-ws.slot]?.id];
  if(isFirearm(oldWeapon) && ws.slot===0 && isFirearm(otherWeapon))return null;
  // Protect any loaded primary even if the player has temporarily selected it;
  // if slot 1 is empty, the server fills that slot without replacing the main.
  if(!isFirearm(oldWeapon) || !isFirearm(otherWeapon))return 65;
  const distances=game?.modeState?.type==='zm'?[8,20,34]:
    game?.modeState?.type==='br'?[8,35,90]:[8,30,85];
  const score=w=>distances.reduce((sum,d,i)=>{
    const s=evaluateWeapon(w,{mode:game?.modeState?.type||'tdm',distance:d,
      magazine:w.magSize,reserve:Math.max(w.magSize,1)*2,
      enemies:game?.modeState?.type==='zm'?4:1,
      pressure:d<12?'high':'medium'}).score;
    return sum+s*[.25,.5,.25][i];
  },0);
  const delta=score(candidate)-score(oldWeapon);
  // A modest modeled advantage must not trigger a disruptive weapon swap.
  return delta>=9?Math.min(70,22+delta):null;
}

// BR loadout optimization: compare BOTH occupied slots before a pickup.
// Server replaces the selected slot. Never allow rarity alone to destroy a
// better rifle/sniper; preserve complementary close and long-range weapons.
export function brPickupDecision(game,candidate,catalog={},margin=11){
  if(game?.modeState?.type!=='br'||!isFirearm(candidate))return null;
  const ws=game?.local?.ws;if(!ws?.guns?.length)return null;
  const valid=w=>isFirearm(w);
  const score=w=>{
    if(!valid(w))return -100;
    const distances=[7,22,47,105],weights=[.18,.30,.32,.20];
    return distances.reduce((a,d,i)=>a+weights[i]*evaluateWeapon(w,{
      mode:'br',distance:d,enemies:1,targetHp:120,pressure:d<15?'high':'medium',
      magazine:w.magSize,reserve:w.magSize*2}).score,0);
  };
  let best=null;
  for(const slot of [0,1]){
    const old=catalog[ws.guns[slot]?.id],other=catalog[ws.guns[1-slot]?.id];
    const empty=!valid(old);
    const increase=score(candidate)-score(old);
    if(!empty && increase<margin)continue;
    // Avoid replacing a useful long gun with a redundant second pistol.
    if(candidate.cat==='Pistol' && valid(old) && old.cat!=='Pistol')continue;
    const complement=valid(other)&&candidate.cat!==other.cat?2:0;
    const utility=(empty?125:increase)+complement;
    if(!best||utility>best.utility)best={slot,advantage:increase,utility,
      score:Math.min(110,75+Math.max(0,increase)),reason:empty?'empty-slot':'better-br-loadout'};
  }
  return best;
}
