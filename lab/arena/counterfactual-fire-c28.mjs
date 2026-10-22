// C28: research-only, no control of production agents.
// Three-arm same-initial-state/same-shot-seed counterfactual micro encounter.
// All damage labels come from the uploaded main server fireWeapon(), not a surrogate.
import {fireWeapon} from './source-main/server/combat.js';
import {makeWeaponState} from './source-main/shared/weaponstate.js';
import {WEAPONS} from './source-main/shared/weapons.js';
import {MOVE,PLAYER} from './source-main/shared/constants.js';
import {mulberry32} from './source-main/shared/geometry.js';
export const C28_ACTIONS=Object.freeze(['baseline','micro-left','micro-right']);
const finite=Number.isFinite;
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const hash32=n=>{n=(n+0x9e3779b9)>>>0;n=Math.imul(n^(n>>>16),0x85ebca6b);n=Math.imul(n^(n>>>13),0xc2b2ae35);return(n^(n>>>16))>>>0;};
const round=x=>+x.toFixed(6);
export function scenarioC28({seed,weaponId,distance,lagSeconds,tracking,baseVelocity,offset,aim}={}){
 if(!Number.isSafeInteger(seed)||seed<0||seed>0xffffffff||!WEAPONS[weaponId]||WEAPONS[weaponId].melee||WEAPONS[weaponId].laser||!finite(distance)||distance<8||distance>85||!finite(lagSeconds)||lagSeconds<0||lagSeconds>.25||!['track','lead','lock'].includes(tracking)||!finite(baseVelocity)||Math.abs(baseVelocity)>3||!finite(offset)||Math.abs(offset)>5||typeof aim!=='boolean')throw Error('invalid C28 scenario');
 return {seed,weaponId,distance,lagSeconds,tracking,baseVelocity,offset,aim};
}
function positionAt(s,action,t){
 const sign=action==='micro-left'?-1:action==='micro-right'?1:0;
 const earlyV=sign?clamp(s.baseVelocity+sign*MOVE.speed,-MOVE.speed,MOVE.speed):s.baseVelocity;
 const first=Math.min(Math.max(t,0),.16),rest=Math.max(0,t-.16);
 return s.offset+earlyV*first+s.baseVelocity*rest;
}
export function trialC28(raw,action,{shotsLimit=10}={}){
 const s=scenarioC28(raw);
 if(!C28_ACTIONS.includes(action)||!Number.isInteger(shotsLimit)||shotsLimit<1||shotsLimit>30)throw Error('invalid C28 action/shot limit');
 const w=WEAPONS[s.weaponId];
 const target={id:'target',x:s.offset,y:0,z:-s.distance,yaw:0,lean:0,stance:0,slideT:0,alive:true,history:[]};
 const shooter={id:'shooter',x:0,y:0,z:0,yaw:0,pitch:0,aim:s.aim,onGround:true,stance:0,lean:0,alive:true,ws:makeWeaponState(s.weaponId,'makarov','','')};
 let damage=0,hits=0,heads=0,shots=0;
 const game={now:0,players:new Map([['shooter',shooter],['target',target]]),mode:null,abil:{bodies:[]},streaks:null,
  hostile:(a,b)=>a!==b,worldBoxes:()=>[],emitAll(t){if(t==='shot')shots++;},
  damage(q,attacker,dmg,o){if(q===target&&attacker===shooter){hits++;damage+=dmg;heads+=Number(!!o.head);}}
 };
 // Predeclare one shared firing and noise schedule, not learned from an arm's outcome.
 const rng=mulberry32(hash32(s.seed^0x28bd5931));
 const noise=[];for(let i=0;i<shotsLimit;i++)noise.push((rng()-.5)*.018);
 const interval=Math.max(.03,w.interval||.18);
 const shotCount=Math.min(shotsLimit,w.magSize||shotsLimit,Math.floor((1.25-.12)/interval)+1);
 for(let i=0;i<shotCount;i++){
  const t=.12+i*interval,delayedTime=Math.max(0,t-s.lagSeconds);
  const trueX=positionAt(s,action,t),observedX=positionAt(s,action,delayedTime);
  // Shooter tracking policies model a *different opponent response*, never leak
  // true instantaneous action to 'track' or 'lock'. 'lead' extrapolates old motion.
  const aimedX=s.tracking==='lock'?s.offset:s.tracking==='lead'?
   observedX+(delayedTime>.06?s.baseVelocity*s.lagSeconds:0):observedX;
  const yaw=-Math.atan2(aimedX,s.distance)+noise[i];
  shooter.yaw=yaw;shooter.pitch=Math.atan2(PLAYER.bodyHeight*.68-1.6,Math.hypot(aimedX,s.distance));
  target.x=trueX;
  // Fire uses current authoritative server target hitbox. Lag is the shooter's
  // observational/aim reaction, not a fake future or invented server rewind.
  game.now=t;
  fireWeapon(game,shooter,{seq:hash32(s.seed+i*1009),lt:t});
 }
 return {action,shots,hits,headHits:heads,uncappedDamage:round(damage),
  // Hypothetical no-regen, armor+HP cap. Does NOT simulate actual death/respawn.
  cappedLoss:round(Math.min(PLAYER.maxHealth+PLAYER.maxArmor,damage)),anyHit:hits>0};
}
export function counterfactualC28(raw){
 const s=scenarioC28(raw);const arms=C28_ACTIONS.map(a=>trialC28(s,a));
 return {schema:'fpsarena-c28-same-seed-fireweapon-v1',scenario:s,
  observedBeforeChoice:{weaponId:s.weaponId,distance:s.distance,lagSeconds:s.lagSeconds,baseVelocity:s.baseVelocity,offset:s.offset},
  // tracking is held fixed but intentionally hidden from the model; nuisance.
  arms,commonRandomNumbers:true,worldBoxes:'empty',movement:'first 0.16s lateral override (6.9 m/s cap), then baseline',
  source:'uploaded main server/fireWeapon',isFullGame:false};
}
