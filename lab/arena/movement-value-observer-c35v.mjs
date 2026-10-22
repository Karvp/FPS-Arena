/** C35-V: factual value labels + UNLABELLED counterfactual action menu.
 * Pre-step policy features are taken solely from the delayed public client.
 * Authoritative outcomes enter only after Game.step(), and never influence
 * candidate construction or an action. This observer does not return a command.
 */
import {publicHostilesC35K} from './public-target-los-c35k.mjs';
import {movementUnitC35T} from './target-relative-motion-c35t.mjs';
import {weaponBandC35U} from './weapon-aware-positioning-c35u.mjs';
import {precisionWeaponBandC35Z,precisionPrecheckC35Z} from './precision-exploration-c35z.mjs';
import {eyeHeightOf} from './source-main/shared/movement.js';
import {rayWorld} from './source-main/shared/geometry.js';
import {MOVE,STANCE_H} from './source-main/shared/constants.js';
export const C35V_SCHEMA='fpsarena-c35v-factual-value-proxy-v1';
const MOVES=[{forward:true},{forward:true,right:true},{right:true},{backward:true,right:true},
 {backward:true},{backward:true,left:true},{left:true},{forward:true,left:true}];
const K=['forward','backward','left','right'];
const finite=Number.isFinite;
const clamp=(n,a,b)=>Math.min(b,Math.max(a,n));
const n4=n=>finite(n)?+n.toFixed(4):null;
function staticPass(client,u,r=.65){
 const p=client?.pos,m=client?.local?.mv,map=client?.map;
 if(!u||!p||!m||!finite(map?.bound)||!Array.isArray(map?.boxes))return false;
 const rad=MOVE.radius+.15,h=STANCE_H[m.stance??0]??STANCE_H[0];
 if(![p.x,p.z,m.y].every(finite)||!map.boxes.every(b=>['x0','x1','y0','y1','z0','z1'].every(k=>finite(b?.[k]))))return false;
 for(let i=0;i<=8;i++){
  const x=p.x+u.x*r*i/8,z=p.z+u.z*r*i/8;
  if(Math.abs(x)>map.bound-rad-.2||Math.abs(z)>map.bound-rad-.2)return false;
  if(map.boxes.some(b=>x+rad>b.x0&&x-rad<b.x1&&z+rad>b.z0&&z-rad<b.z1&&m.y+h>b.y0&&m.y+.05<b.y1))return false;
 }
 return true;
}
function badPriority(cmd){return ['reload','skill','use','interact','plate','throw','jump','crouch','slide','prone','lean'].some(k=>!!cmd?.[k])||(finite(cmd?.slot)&&cmd.slot>=0);}
/** Heuristic preference is NOT an actual counterfactual outcome or a trained Q value. */
export function publicMovementMenuC35V(now,client,incumbent,applied,{weapon='m4a1',maxAge=.275,precisionResearch=false}={}){
 const band=precisionResearch?(precisionWeaponBandC35Z(weapon)??weaponBandC35U(weapon)):weaponBandC35U(weapon),p=client?.pos,m=client?.local?.mv,rig=client?.rig;
 const precisionReasons=precisionResearch?precisionPrecheckC35Z(now,client,incumbent,applied):[];
 const blocked=(precisionResearch&&precisionReasons.length>0)||!finite(now)||!band||!client?.local?.alive||client.local.down||client.local.frozen||
 !finite(client?.local?.hp)||client.local.hp<40||!m?.onGround||m.air||m.heli||m.slideT>0||m.stance!==0||
 badPriority(incumbent)||badPriority(applied)||!movementUnitC35T(applied,rig?.yaw)||
 ![p?.x,p?.y,p?.z,rig?.yaw,rig?.pitch].every(finite);
 if(blocked)return {valid:false,reason:precisionResearch?(precisionReasons[0]??(!band?'unsupported-weapon':'motion-or-priority')):'motion-or-priority',detailReasons:precisionReasons,actions:[],features:null};
 const selection=publicHostilesC35K(client,now,{maxAge});
 if(!selection.valid||selection.hostiles.length===0)return {valid:false,reason:'no-fresh-public-hostile',actions:[],features:null};
 const eye=[p.x,p.y+eyeHeightOf(m),p.z],look=[-Math.sin(rig.yaw)*Math.cos(rig.pitch),-Math.sin(rig.pitch),-Math.cos(rig.yaw)*Math.cos(rig.pitch)];
 const ts=selection.hostiles.map(q=>{
  const h=q.sliding?.65:q.stance===2?.6:q.stance===1?1.05:1.7;
  const dv=[q.pos.x-eye[0],q.pos.y+h*.55-eye[1],q.pos.z-eye[2]],l=Math.hypot(...dv);
  return {q,l,dv,angle:l>.001?Math.acos(clamp(dv.reduce((s,v,i)=>s+v*look[i],0)/l,-1,1))*180/Math.PI:Infinity};
 }).sort((a,b)=>a.angle-b.angle||String(a.q.id).localeCompare(String(b.q.id)));
 const t=ts[0],range=Math.hypot(t.q.pos.x-p.x,t.q.pos.z-p.z);
 if(!finite(t.angle)||t.angle>60||range<2||range>band.max||!Array.isArray(client.map?.boxes))
  return {valid:false,reason:'aim-range-or-map',actions:[],features:null};
 if(rayWorld(eye,t.dv.map(x=>x/t.l),client.map.boxes,t.l)<t.l-.01)
  return {valid:false,reason:'static-line-blocked',actions:[],features:null};
 const old=movementUnitC35T(applied,rig.yaw),radial={x:(t.q.pos.x-p.x)/range,z:(t.q.pos.z-p.z)/range};
 const want=precisionResearch?(range>band.far+2?.3:range<band.near-1?-.4:0):(range>band.far+2?.6:range<band.near-1?-.35:.05);
 const score=(u,continuity)=>-Math.abs(radial.x*u.x+radial.z*u.z-want)+.12*continuity;
 const observedScore=score(old,1),actions=MOVES.map((keys,i)=>{
  const u=movementUnitC35T(keys,rig.yaw),continuity=u.x*old.x+u.z*old.z;
  const safe=continuity>=.5&&staticPass(client,u);
  return {id:i,keys:Object.fromEntries(K.map(k=>[k,!!keys[k]])),safe,
    radial:n4(u.x*radial.x+u.z*radial.z),continuity:n4(continuity),
    heuristicValue:safe?n4(score(u,continuity)):null,
    factualOutcome:null};
 });
 const best=actions.filter(a=>a.safe).sort((a,b)=>b.heuristicValue-a.heuristicValue||a.id-b.id)[0]??null;
 const f={distance:n4(range),ageMs:n4((now-t.q.buf.at(-1).t)*1000),angleDeg:n4(t.angle),hp:n4(client.local.hp),
  enemyCount:selection.hostiles.length,fire:+!!incumbent.fire,aim:+!!incumbent.aim,
  weaponCat:band.cat,near:band.near,far:band.far,incumbentRadial:n4(radial.x*old.x+radial.z*old.z),
  incumbentHeuristic:n4(observedScore)};
 return {valid:true,reason:null,targetId:String(t.q.id),features:f,bestId:best?.id??null,
  suggestedDelta:best?n4(best.heuristicValue-observedScore):null,actions};
}
export class MovementValueObserverC35V{
 constructor({matchId,weapon,setupId,arm='observe',sampleEvery=6,horizonTicks=30}={}){
  if(!matchId||!setupId||!weapon||!Number.isInteger(sampleEvery)||sampleEvery<6||!Number.isInteger(horizonTicks)||horizonTicks<6)
   throw Error('C35V invalid config');
  Object.assign(this,{matchId,weapon,setupId,arm,sampleEvery,horizonTicks,tick:0,lastNow:-Infinity,lastServer:null,
   pending:[],rows:[],counts:{sampled:0,eligible:0,completed:0,censored:0,changedFire:0,stale:0}});
 }
 beforeStep({now,client,incumbent,applied}){
  if(!finite(now)||now<=this.lastNow)throw Error('C35V clock');this.lastNow=now;
  if(!!incumbent?.fire!==!!applied?.fire){this.counts.changedFire++;throw Error('C35V upstream fire boundary');}
  this.tick++;
  if(this.tick%this.sampleEvery!==0||!this.lastServer)return;
  this.counts.sampled++;
  const q=publicMovementMenuC35V(now,client,incumbent,applied,{weapon:this.weapon});
  if(!q.valid){this.counts.stale++;return;}
  this.counts.eligible++;
  const row={schema:C35V_SCHEMA,setupId:this.setupId,matchId:this.matchId,arm:this.arm,
   tick:this.tick,t:n4(now),weapon:this.weapon,targetId:q.targetId,features:q.features,
   applied:Object.fromEntries(K.map(k=>[k,!!applied[k]])),bestId:q.bestId,
   suggestedDelta:q.suggestedDelta,actions:q.actions,
   factual:null,explanation:'nonexecuted actions have UNKNOWN outcomes; heuristicValue is NOT actual value'};
  this.rows.push(row);this.pending.push({row,baseline:{...this.lastServer},targetTick:this.tick+this.horizonTicks-1});
 }
 afterStep({serverShots,serverHits,serverKills,serverHp,serverAlive,serverDamageTaken}){
  if(![serverShots,serverHits,serverKills,serverHp,serverDamageTaken].every(finite)||typeof serverAlive!=='boolean')throw Error('C35V invalid after-step truth');
  const snap={shots:serverShots,hits:serverHits,kills:serverKills,hp:serverHp,damageTaken:serverDamageTaken,alive:serverAlive};
  if(this.lastServer&&['shots','hits','kills','damageTaken'].some(k=>snap[k]<this.lastServer[k]))throw Error('C35V nonmonotone server counters');
  for(const p of this.pending)if(this.tick>=p.targetTick&&!p.row.factual){
   const b=p.baseline;p.row.factual={shotDelta:snap.shots-b.shots,hitDelta:snap.hits-b.hits,
    killDelta:snap.kills-b.kills,healthLost:snap.damageTaken-b.damageTaken,aliveEnd:snap.alive,
    hitWindow:+(snap.hits>b.hits),horizonTicks:this.horizonTicks,source:'SERVER_AFTER_STEP_OBSERVED_ACTION_ONLY'};
   this.counts.completed++;
  }
  this.pending=this.pending.filter(p=>!p.row.factual);
  this.lastServer=snap;
 }
 finish(){for(const p of this.pending){p.row.censored=true;this.counts.censored++;}this.pending=[];
  if(this.counts.changedFire||this.counts.completed+this.counts.censored!==this.counts.eligible)throw Error('C35V invariant');
  return {schema:C35V_SCHEMA,matchId:this.matchId,setupId:this.setupId,arm:this.arm,weapon:this.weapon,
    status:'OFFLINE FACTUAL SUPERVISION ONLY; NO IDENTIFIED COUNTERFACTUAL REWARDS',
    provenance:'public before Game.step; authoritative labels only after step; never motor controller',
    counts:this.counts,rows:this.rows};
 }
}
