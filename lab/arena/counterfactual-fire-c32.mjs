// C32 RESEARCH ONLY. All shot/hit labels from official server fireWeapon.
// Both movement and wall collision use authoritative shared stepMove.
// Public inputs: weapon, lag, body-yaw-relative range/lateral position,
// initial target velocity, and STATIC map visibility from observer position.
// Opponent tracking and error are nuisance variables, never model features.
import {fireWeapon} from './source-main/server/combat.js';
import {newMoveState,stepMove,eyeHeightOf} from './source-main/shared/movement.js';
import {makeWeaponState} from './source-main/shared/weaponstate.js';
import {WEAPONS} from './source-main/shared/weapons.js';
import {MOVE,PLAYER} from './source-main/shared/constants.js';
import {mulberry32,rayWorld} from './source-main/shared/geometry.js';
import {C30_WEAPONS} from './counterfactual-fire-c30.mjs';
export const ACTIONS_C32=Object.freeze(['baseline','micro-left','micro-right']);
export const COVER_C32=Object.freeze(['none','low','thin-left','thin-right','center','offset-left','offset-right']);
const finite=Number.isFinite,clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const hash32=n=>{n=(n+0x9e3779b9)>>>0;n=Math.imul(n^(n>>>16),0x85ebca6b);n=Math.imul(n^(n>>>13),0xc2b2ae35);return(n^(n>>>16))>>>0;};
function round(n){return +n.toFixed(6);}
export function checkC32(s){
 if(!s||!Number.isSafeInteger(s.seed)||s.seed<0||s.seed>0xffffffff||!C30_WEAPONS.includes(s.weaponId)||
 ![s.distance,s.offset,s.baseVelocity,s.lagSeconds,s.bodyYawRelative,s.aimError,s.coverShift].every(finite)||
 s.distance<24||s.distance>100||Math.abs(s.offset)>Math.min(s.distance*.92,65)||Math.abs(s.baseVelocity)>9||
 s.lagSeconds<0||s.lagSeconds>.25||Math.abs(s.bodyYawRelative)>1.1||Math.abs(s.aimError)>.20||Math.abs(s.coverShift)>4||
 !COVER_C32.includes(s.cover)||!['track','lead','lock','partial'].includes(s.tracking)||typeof s.aim!=='boolean')
 throw Error('invalid C32 scenario');
 return s;
}
function layout(s){
 if(s.cover==='none')return [];
 const d=s.distance,near=s.cover==='thin-left'||s.cover==='thin-right', frac=near?.94:.40, z=-Math.sqrt(Math.max(0,d*d-s.offset*s.offset))*frac, targetProjection=s.offset*frac;
 let x=targetProjection+s.coverShift,height=2.25,hw=.65;
 if(s.cover==='low')height=1.05;
 if(s.cover==='thin-left'){x-=1.35;hw=.42;}
 if(s.cover==='thin-right'){x+=1.35;hw=.42;}
 if(s.cover==='offset-left')x-=1.5;
 if(s.cover==='offset-right')x+=1.5;
 return [{x0:x-hw,x1:x+hw,z0:z-.36,z1:z+.36,y0:0,y1:height}];
}
function los(s,boxes,x,z){
 const from=[0,1.6,0],dest=[x,1.0,z];
 const v=dest.map((e,i)=>e-from[i]),dist=Math.hypot(...v),direction=v.map(e=>e/dist);
 return Number(rayWorld(from,direction,boxes,dist)>=dist-.25);
}
export const FEATURE_NAMES_C32=Object.freeze(['distance/100','lagSeconds/.25','baseLateralVelocity/9','bodyYawLateralRatio',
 'publicBodyYawBearing/1.1','coverLineOfSightBaseline','coverLineOfSightLeft','coverLineOfSightRight',
 ...C30_WEAPONS.map(w=>`weapon=${w}`)]);
export function featuresC32(raw){
 const s=checkC32(raw),boxes=layout(s),z=-Math.sqrt(Math.max(0,s.distance**2-s.offset**2));
 // Visibility is computed from STATIC, publicly knowable map geometry and a
 // projected lateral position. It is NOT a future server-hit label.
 const shift=MOVE.speed*.16;
 const x=[s.distance/100,s.lagSeconds/.25,s.baseVelocity/9,s.offset/s.distance,
 s.bodyYawRelative/1.1,los(s,boxes,s.offset,z),los(s,boxes,s.offset-shift,z),los(s,boxes,s.offset+shift,z),
 ...C30_WEAPONS.map(w=>Number(w===s.weaponId))];
 if(x.length!==FEATURE_NAMES_C32.length||!x.every(finite))throw Error('bad C32 feature');
 return x;
}
export function trialC32(raw,action){
 const s=checkC32(raw);if(!ACTIONS_C32.includes(action))throw Error('invalid C32 action');
 const weapon=WEAPONS[s.weaponId],boxes=layout(s),z=-Math.sqrt(Math.max(0,s.distance**2-s.offset**2));
 const state=newMoveState(s.offset,0,z);state.vx=s.baseVelocity;
 const target={id:'target',x:state.x,y:state.y,z:state.z,yaw:0,lean:0,stance:0,slideT:0,alive:true,history:[]};
 const shooter={id:'shooter',x:0,y:0,z:0,yaw:s.bodyYawRelative,pitch:0,aim:s.aim,onGround:true,
  stance:0,lean:0,alive:true,ws:makeWeaponState(s.weaponId,'makarov','','')};
 let damage=0,hits=0,shots=0,blockedTicks=0,simulationTicks=0;
 const game={now:0,players:new Map([['shooter',shooter],['target',target]]),mode:null,abil:{bodies:[]},streaks:null,
  hostile:(a,b)=>a!==b,worldBoxes:()=>boxes,emitAll(type){if(type==='shot')shots++;},
  damage(q,a,d){if(q===target&&a===shooter){damage+=d;hits++;}}};
 const r=mulberry32(hash32(s.seed^0xc32ace01));const noise=Array.from({length:16},()=> (r()-.5)*.022);
 const interval=Math.max(.03,weapon.interval||.18),shotCount=Math.min(12,weapon.magSize||12,Math.floor((1.27-.12)/interval)+1);
 const dt=1/60;let now=0,ti=0;const sampled=[{t:0,x:state.x,z:state.z}];
 for(let i=0;i<shotCount;i++){
  const fireAt=.12+i*interval;
  while(now+dt*.5<fireAt){
   const short=Math.min(dt,fireAt-now);const before=state.x;
   const key=now<.16&&action!=='baseline'?action:'baseline';
   stepMove(state,{yaw:0,left:key==='micro-left',right:key==='micro-right'},short,1,boxes);
   if(key!=='baseline'&&Math.abs(state.x-before)<.00001)blockedTicks++;
   now+=short;ti++;simulationTicks++;
   sampled.push({t:now,x:state.x,z:state.z});
  }
  const delayed=Math.max(0,fireAt-s.lagSeconds);let older=sampled[0];
  for(let j=sampled.length-1;j>=0;j--)if(sampled[j].t<=delayed+1e-8){older=sampled[j];break;}
  // Shooter tracking is intentionally hidden and may differ from body yaw.
  let aimX=s.tracking==='lock'?s.offset:s.tracking==='partial'?(s.offset+older.x)*.5:
   s.tracking==='lead'?older.x+state.vx*s.lagSeconds*.6:older.x;
  const err=s.aimError;
  shooter.yaw=-Math.atan2(aimX,-z)+err+noise[i];
  shooter.pitch=Math.atan2(PLAYER.bodyHeight*.68-1.6,Math.hypot(aimX,z));
  target.x=state.x;target.y=state.y;target.z=state.z;target.stance=state.stance;
  game.now=fireAt;fireWeapon(game,shooter,{seq:hash32(s.seed+i*1009),lt:fireAt});
 }
 return {action,shots,hits,cappedLoss:round(Math.min(150,damage)),blockedTicks,simulationTicks,anyHit:hits>0};
}
export function counterfactualC32(raw){
 const s=checkC32(raw);return {schema:'fpsarena-c32-server-cover-movement-counterfactual-v1',scenario:s,
  // Keep nuisance variables out of model inputs.
  publicFeatures:featuresC32(s),arms:ACTIONS_C32.map(a=>trialC32(s,a)),
  commonRandomNumbers:true,worldBoxes:layout(s),source:'server fireWeapon and shared stepMove; controlled 1v1',
  caveat:'not a complete multiplayer match; body yaw is not authoritative aim; cover is static' };
}
