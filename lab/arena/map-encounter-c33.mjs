// C33 RESEARCH ONLY: controlled 1v1 counterfactuals at actual game-map boxes.
// Own and remote public features plus static map geometry; hidden shooter aim
// and future server outcomes are forbidden from model inputs.
import {MAPS} from './source-main/maps/index.js';
import {fireWeapon} from './source-main/server/combat.js';
import {newMoveState,stepMove,blockedAt} from './source-main/shared/movement.js';
import {makeWeaponState} from './source-main/shared/weaponstate.js';
import {WEAPONS} from './source-main/shared/weapons.js';
import {MOVE,PLAYER} from './source-main/shared/constants.js';
import {mulberry32,rayWorld} from './source-main/shared/geometry.js';
import {C30_WEAPONS} from './counterfactual-fire-c30.mjs';
export const ACTIONS_C33=Object.freeze(['baseline','micro-left','micro-right']);
export const MAPS_C33=Object.freeze(['arena','foundry','neon']);
const hash32=n=>{n=(n+0x9e3779b9)>>>0;n=Math.imul(n^(n>>>16),0x85ebca6b);n=Math.imul(n^(n>>>13),0xc2b2ae35);return(n^(n>>>16))>>>0;};
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const fin=Number.isFinite;
const r6=x=>+x.toFixed(6);
function mapBoxes(map){return MAPS[map].boxes;}
export function validateScenarioC33(s){
 if(!s||!Number.isSafeInteger(s.seed)||s.seed<0||s.seed>0xffffffff||!MAPS_C33.includes(s.map)||
 !C30_WEAPONS.includes(s.weaponId)||![s.sx,s.sz,s.tx,s.tz,s.vx,s.vz,s.bodyYaw,s.aimError,s.lagSeconds].every(fin)||
 !['track','lead','partial','lock'].includes(s.tracking)||typeof s.aim!=='boolean'||
 ![s.sx,s.sz,s.tx,s.tz].every(v=>Math.abs(v)<80)||Math.hypot(s.sx-s.tx,s.sz-s.tz)<15||Math.hypot(s.sx-s.tx,s.sz-s.tz)>103||
 Math.abs(s.vx)>9||Math.abs(s.vz)>9||Math.abs(s.aimError)>.21||s.lagSeconds<0||s.lagSeconds>.25)throw Error('bad C33 scenario');
 return s;
}
function clearLine(boxes,from,to){let d=to.map((v,i)=>v-from[i]);const length=Math.hypot(...d);if(length<.01)return 0;
 const t=rayWorld(from,d.map(v=>v/length),boxes,length);return Number(t>=length-.12);
}
function positions(s){return {from:[s.sx,1.6,s.sz],z:s.tz, boxes:mapBoxes(s.map)};}
export const FEATURE_NAMES_C33=Object.freeze(['distance/100','snapshotLag/.25','publicVx/9','publicVz/9','publicBodyYawToTarget/pi',
 'LOS-now','LOS-left-projection','LOS-right-projection','collision-clear-left','collision-clear-right',
 ...C30_WEAPONS.map(w=>`enemyWeapon=${w}`)]);
export function publicFeaturesC33(raw){const s=validateScenarioC33(raw), {from,boxes}=positions(s);
 const d=Math.hypot(s.tx-s.sx,s.tz-s.sz);
 const aimBearing=Math.atan2(s.sx-s.tx,-(s.tz-s.sz));
 let relative=(aimBearing-s.bodyYaw+Math.PI*3)%(Math.PI*2)-Math.PI;
 const los=(dx)=>clearLine(boxes,from,[s.tx+dx,1.0,s.tz]);
 const safe=(right)=>{const state=newMoveState(s.tx,0,s.tz);state.vx=s.vx;state.vz=s.vz;
  const xx=state.x;for(let i=0;i<10;i++)stepMove(state,{yaw:0,left:!right,right},.016,1,boxes);
  return Number(right?state.x-xx>.18:xx-state.x>.18);};
 return [d/100,s.lagSeconds/.25,s.vx/9,s.vz/9,relative/Math.PI,
 los(0),los(-MOVE.speed*.16),los(MOVE.speed*.16),safe(false),safe(true),
 ...C30_WEAPONS.map(w=>Number(s.weaponId===w))];
}
export function trialC33(raw,action){const s=validateScenarioC33(raw);if(!ACTIONS_C33.includes(action))throw Error('invalid action');
 const boxes=mapBoxes(s.map),weapon=WEAPONS[s.weaponId],state=newMoveState(s.tx,0,s.tz);
 state.vx=s.vx;state.vz=s.vz;
 const target={id:'target',x:state.x,y:state.y,z:state.z,yaw:0,lean:0,stance:0,slideT:0,alive:true,history:[]};
 const shooter={id:'shooter',x:s.sx,y:0,z:s.sz,yaw:s.bodyYaw,pitch:0,aim:s.aim,onGround:true,
  stance:0,lean:0,alive:true,ws:makeWeaponState(s.weaponId,'makarov','','')};
 let hits=0,damage=0,shots=0,blockedTicks=0,collisionEdges=0;
 const game={now:0,players:new Map([['shooter',shooter],['target',target]]),mode:null,abil:{bodies:[]},streaks:null,
  hostile:(a,b)=>a!==b,worldBoxes:()=>boxes,emitAll(type){if(type==='shot')shots++;},
  damage(q,a,d){if(q===target&&a===shooter){damage+=d;hits++;}}};
 const rnd=mulberry32(hash32(s.seed^0xc330acd1)),noise=Array.from({length:24},()=>(rnd()-.5)*.022);
 const interval=Math.max(.03,weapon.interval||.18),count=Math.min(12,weapon.magSize||12,Math.floor((1.27-.12)/interval)+1);
 const samples=[{t:0,x:state.x,z:state.z}],dt=1/60;let now=0;
 for(let i=0;i<count;i++){
  const fireAt=.12+i*interval;
  while(now+dt*.5<fireAt){const short=Math.min(dt,fireAt-now),before=state.x;
   const active=now<.16&&action!=='baseline';
   const key=active?action:'baseline';
   stepMove(state,{yaw:0,left:key==='micro-left',right:key==='micro-right'},short,1,boxes);
   if(active){if(Math.abs(state.x-before)<.00001)blockedTicks++;if((key==='micro-left'?state.vx>=0:state.vx<=0))collisionEdges++;}
   now+=short;samples.push({t:now,x:state.x,z:state.z});
  }
  const delayed=fireAt-s.lagSeconds;
  let older=samples[0];for(let j=samples.length-1;j>=0;j--)if(samples[j].t<=delayed+1e-8){older=samples[j];break;}
  const predicted=s.tracking==='lock'?[s.tx,s.tz]:s.tracking==='partial'?[.5*(s.tx+older.x),.5*(s.tz+older.z)]:
   s.tracking==='lead'?[older.x+state.vx*s.lagSeconds*.6,older.z+state.vz*s.lagSeconds*.6]:[older.x,older.z];
  shooter.yaw=-Math.atan2(predicted[0]-s.sx,s.sz-predicted[1])+s.aimError+noise[i];
  shooter.pitch=Math.atan2(PLAYER.bodyHeight*.68-1.6,Math.hypot(predicted[0]-s.sx,predicted[1]-s.sz));
  target.x=state.x;target.y=state.y;target.z=state.z;target.stance=state.stance;
  game.now=fireAt;fireWeapon(game,shooter,{seq:hash32(s.seed+i*1009),lt:fireAt});
 }
 return {action,shots,hits,cappedLoss:r6(Math.min(150,damage)),blockedTicks,collisionEdges,anyHit:hits>0};
}
export function encounterC33(raw){const s=validateScenarioC33(raw);return {
 schema:'fpsarena-c33-real-map-controlled-counterfactual-v1',scenario:s,
 publicFeatures:publicFeaturesC33(s),arms:ACTIONS_C33.map(a=>trialC33(s,a)),
 mapSource:'source-main/maps/index.js',source:'actual server fireWeapon and shared stepMove on production map AABB',
 caveat:'controlled 1v1 with schematic adversary aiming; NOT logged encounter replay or full Game.step() counterfactual' };
}
// Sampling only uses canonical static map + seeded RNG; NO game outcome labels.
export function sampleScenarioC33(seed,map,weaponId){const rng=mulberry32(hash32(seed^0xc33f128a)),boxes=mapBoxes(map);
 const eligible=boxes.filter(b=>b.y1>1.35&&b.y0<.5&&(b.z1-b.z0)>.8&&(b.x1-b.x0)>.35&&
   Math.max(Math.abs(b.x0),Math.abs(b.x1),Math.abs(b.z0),Math.abs(b.z1))<63);
 for(let trial=0;trial<500;trial++){
  const b=eligible[Math.floor(rng()*eligible.length)],side=rng()<.5?-1:1;
  const gap=.04+rng()*.36;
  const tx=side<0?b.x0-MOVE.radius-gap:b.x1+MOVE.radius+gap;
  const tz=b.z0+.55+rng()*Math.max(.1,b.z1-b.z0-1.1);
  if(blockedAt(tx,tz,boxes))continue;
  const angle=rng()*Math.PI*2,distance=24+rng()*66;
  const sx=tx+Math.cos(angle)*distance,sz=tz+Math.sin(angle)*distance;
  if(Math.abs(sx)>64||Math.abs(sz)>64||blockedAt(sx,sz,boxes))continue;
  // Sampling strata from PRE-ACTION public map visibility only, never hit labels.
  const visible=clearLine(boxes,[sx,1.6,sz],[tx,1.0,tz]);
  const requireVisible=(seed%5)!==0;
  if(Boolean(visible)!==requireVisible)continue;
  const s={seed,map,weaponId,sx:r6(sx),sz:r6(sz),tx:r6(tx),tz:r6(tz),
   vx:r6((rng()-.5)*14),vz:r6((rng()-.5)*14),bodyYaw:r6((rng()*2-1)*Math.PI),
   aimError:r6((rng()-.5)*.18),lagSeconds:[.035,.065,.125,.2][Math.floor(rng()*4)],
   tracking:['track','lead','lock','partial'][Math.floor(rng()*4)],aim:rng()<.7};
  validateScenarioC33(s);return s;
 }
 throw Error(`cannot place scenario ${seed}/${map}/${weaponId}`);
}
