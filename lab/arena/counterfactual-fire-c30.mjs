// C30: server fireWeapon counterfactual lab, calibrated to OBSERVED (not server-hidden)
// kinematic support. No full-game efficacy or causal claim is made from these scenes.
import {fireWeapon} from './source-main/server/combat.js';
import {makeWeaponState} from './source-main/shared/weaponstate.js';
import {WEAPONS} from './source-main/shared/weapons.js';
import {MOVE,PLAYER} from './source-main/shared/constants.js';
import {mulberry32} from './source-main/shared/geometry.js';
export const C30_ACTIONS=Object.freeze(['baseline','micro-left','micro-right']);
export const C30_WEAPONS=Object.freeze(['mp5sd','m4a1','aa12','hk_sl8','uzi','l115a3']);
const finite=Number.isFinite;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const h32=n=>{n=(n+0x9e3779b9)>>>0;n=Math.imul(n^(n>>>16),0x85ebca6b);n=Math.imul(n^(n>>>13),0xc2b2ae35);return(n^(n>>>16))>>>0;};
export function scenarioC30(s){
 if(!s||!Number.isSafeInteger(s.seed)||s.seed<0||!C30_WEAPONS.includes(s.weaponId)||
 !finite(s.distance)||s.distance<24||s.distance>100||!finite(s.offset)||Math.abs(s.offset)>s.distance+1e-5||
 !finite(s.baseVelocity)||Math.abs(s.baseVelocity)>12||!finite(s.lagSeconds)||s.lagSeconds<0||s.lagSeconds>.25||
 !['track','lead','lock','body','partial'].includes(s.tracking)||typeof s.aim!=='boolean')
 throw Error('Invalid C30 simulation scenario');
 return s;
}
function lateral(s,action,t){
 const sign=action==='micro-left'?-1:action==='micro-right'?1:0;
 const delta=clamp(s.baseVelocity+sign*MOVE.speed,-12,12);
 return s.offset+delta*Math.min(.16,Math.max(0,t))+s.baseVelocity*Math.max(0,t-.16);
}
export function trialC30(raw,action){
 const s=scenarioC30(raw);if(!C30_ACTIONS.includes(action))throw Error('Invalid C30 action');
 const weapon=WEAPONS[s.weaponId],z=-Math.sqrt(Math.max(0,s.distance**2-s.offset**2));
 const target={id:'target',x:s.offset,y:0,z,yaw:0,lean:0,stance:0,slideT:0,alive:true,history:[]};
 const shooter={id:'shooter',x:0,y:0,z:0,yaw:0,pitch:0,aim:s.aim,onGround:true,stance:0,lean:0,alive:true,
  ws:makeWeaponState(s.weaponId,'makarov','','')};
 let damage=0,hits=0,shots=0;
 const game={now:0,players:new Map([['shooter',shooter],['target',target]]),mode:null,abil:{bodies:[]},streaks:null,
  hostile:(a,b)=>a!==b,worldBoxes:()=>[],emitAll(t){if(t==='shot')shots++;},
  damage(q,a,d){if(q===target&&a===shooter){hits++;damage+=d;}}};
 const rand=mulberry32(h32(s.seed^0xc30bd593));const noise=Array.from({length:12},()=> (rand()-.5)*.018);
 const interval=Math.max(.03,weapon.interval||.18);
 const count=Math.min(12,weapon.magSize||12,Math.floor((1.3-.12)/interval)+1);
 for(let i=0;i<count;i++){
  const t=.12+i*interval,lagT=Math.max(0,t-s.lagSeconds),realX=lateral(s,action,t),olderX=lateral(s,action,lagT);
  const aimed=s.tracking==='body'?0:s.tracking==='lock'?s.offset:s.tracking==='partial'?
   olderX*.5:s.tracking==='lead'?olderX+(lagT>.06?s.baseVelocity*s.lagSeconds:0):olderX;
  shooter.yaw=-Math.atan2(aimed,-z)+noise[i];
  shooter.pitch=Math.atan2(PLAYER.bodyHeight*.68-1.6,Math.hypot(aimed,z));
  target.x=realX;game.now=t;
  fireWeapon(game,shooter,{seq:h32(s.seed+i*1009),lt:t});
 }
 return {action,shots,hits,cappedLoss:+Math.min(150,damage).toFixed(6),anyHit:hits>0};
}
export function counterfactualC30(s){
 scenarioC30(s);
 return {scenario:s,arms:C30_ACTIONS.map(a=>trialC30(s,a)),commonShotSeed:true,
  source:'server/main fireWeapon',worldBoxes:'empty',isFullMatch:false,
  aimDirection:'nuisance opponent response, hidden from policy'};
}
