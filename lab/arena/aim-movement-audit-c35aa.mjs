/** C35-AA: public-before-step aim/movement + authoritative AFTER-decision shot audit.
 * Completely passive. Features never accept server shot truth. Shot truth is not
 * fed to actions, randomization, public target selection, or any neural policy.
 * Individual pellets are dependent inside a shot; group by setup/match/shot.
 */
import {publicHostilesC35K} from './public-target-los-c35k.mjs';
import {WEAPONS,spreadFor} from './source-main/shared/weapons.js';
import {forwardVec} from './source-main/shared/geometry.js';
import {eyeHeightOf} from './source-main/shared/movement.js';
import {PLAYER} from './source-main/shared/constants.js';
export const C35AA_SCHEMA='fpsarena-c35aa-aim-movement-shot-audit-v1';
const finite=Number.isFinite;
const n=v=>finite(v)?+v.toFixed(5):null;
const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
const clamp=v=>Math.min(1,Math.max(-1,v));
const motorKeys=['forward','backward','left','right'];
const freeze=data=>JSON.parse(JSON.stringify(data));
export function publicAimMovementFeaturesC35AA(now,client,cmd,{weapon,maxAge=.275}={}){
 const m=client?.local?.mv,p=client?.pos,rig=client?.rig,w=WEAPONS[weapon];
 if(!finite(now)||!w||!m||!p||!rig||![p.x,p.y,p.z,rig.yaw,rig.pitch,m.vx,m.vz].every(finite))
  return {valid:false,reason:'missing-public-local-state'};
 const speed=Math.hypot(m.vx,m.vz),look=forwardVec(rig.yaw,rig.pitch);
 const q=publicHostilesC35K(client,now,{maxAge});
 let best=null;
 if(q.valid)for(const t of q.hostiles){
  const height=t.sliding?PLAYER.slideBodyHeight:(PLAYER.bodyH[t.stance??0]??PLAYER.bodyHeight);
  const v=[t.pos.x-p.x,t.pos.y+height*.5-p.y-eyeHeightOf(m),t.pos.z-p.z],range=Math.hypot(...v);
  if(range<=.001)continue;
  const angle=180/Math.PI*Math.acos(clamp(dot(v,look)/range));
  if(!best||angle<best.angle||(angle===best.angle&&String(t.id)<best.id)){
   const horizontal=Math.hypot(v[0],v[2]),radial=horizontal>1e-6?(m.vx*v[0]+m.vz*v[2])/horizontal:0;
   const lateral=horizontal>1e-6?(-m.vx*v[2]+m.vz*v[0])/horizontal:0;
   best={id:String(t.id),angle,range,radial,lateral,age:now-t.buf.at(-1).t};
  }
 }
 return {valid:true,provenance:'PUBLIC_BEFORE_GAME_STEP_ONLY',weapon,weaponCat:w.cat,
  aim:!!cmd?.aim,fireIntent:!!cmd?.fire,onGround:!!m.onGround,
  movementInput:Object.fromEntries(motorKeys.map(k=>[k,!!cmd?.[k]])),
  speed:n(speed),movementClass:speed<.5?'still':speed<2.5?'slow':'fast',
  expectedSpreadDeg:n(spreadFor(w,!!cmd?.aim,!!m.onGround)),
  targetId:best?.id??null,aimAngleDeg:n(best?.angle),targetRange:n(best?.range),
  targetAgeMs:n(best?best.age*1000:null),radialSpeed:n(best?.radial),lateralSpeed:n(best?.lateral),
  targetStatus:q.valid?(best?'fresh':'no-fresh-hostile'):q.reason};
}
export class AimMovementAuditC35AA{
 constructor({matchId,setupId,weapon,maxRows=2000}={}){
  if(!matchId||!setupId||!WEAPONS[weapon]||!Number.isInteger(maxRows)||maxRows<1)throw Error('C35AA config');
  Object.assign(this,{matchId,setupId,weapon,maxRows,tick:0,lastNow:-Infinity,pending:null,rows:[],
   counts:{ticks:0,fireIntentTicks:0,shots:0,pellets:0,playerHitPellets:0,worldPellets:0,rangePellets:0,
    staticBlockedPellets:0,dynamicFoamBlockedPellets:0,adsShots:0,movingShots:0,
    fireModified:0,serverShotMismatches:0,droppedRows:0}});
 }
 beforeStep({now,client,incumbent,applied,serverShots}){
  if(this.pending||!finite(now)||now<=this.lastNow||!Number.isSafeInteger(serverShots))throw Error('C35AA clock/phase');
  this.tick++;this.lastNow=now;this.counts.ticks++;
  if(!!incumbent?.fire!==!!applied?.fire){this.counts.fireModified++;throw Error('C35AA forbidden fire change');}
  const features=incumbent?.fire?publicAimMovementFeaturesC35AA(now,client,applied,{weapon:this.weapon}):null;
  if(features)this.counts.fireIntentTicks++;
  this.pending={serverShots,features:features?freeze(features):null,shots:[]};
 }
 onShot(shot){
  if(!this.pending||shot?.schema!=='fpsarena-c35l-authoritative-ballistics-v1'||!Array.isArray(shot.pellets)||
   shot.pellets.length!==shot.pelletCount)throw Error('C35AA malformed after-decision shot');
  this.pending.shots.push(freeze(shot));
 }
 afterStep({serverShots}){
  const p=this.pending;if(!p||!Number.isSafeInteger(serverShots)||serverShots<p.serverShots)throw Error('C35AA phase');
  const delta=serverShots-p.serverShots;
  if(p.shots.length!==delta){this.counts.serverShotMismatches++;throw Error('C35AA shot mismatch');}
  if(delta&&!p.features)throw Error('C35AA shot without public fire intent');
  for(const s of p.shots){
   this.counts.shots++;this.counts.pellets+=s.pellets.length;
   if(s.ads)this.counts.adsShots++;
   if(p.features?.speed>=.5)this.counts.movingShots++;
   for(const pellet of s.pellets){
    if(pellet.hitKind==='player')this.counts.playerHitPellets++;
    if(pellet.hitKind==='world'){
     this.counts.worldPellets++;
     if(pellet.worldKind==='static')this.counts.staticBlockedPellets++;
     if(pellet.worldKind==='dynamic-foam')this.counts.dynamicFoamBlockedPellets++;
    }
    if(pellet.hitKind==='range')this.counts.rangePellets++;
   }
   const row={schema:C35AA_SCHEMA,matchId:this.matchId,setupId:this.setupId,tick:this.tick,t:n(this.lastNow),
    publicBeforeStep:p.features,serverLabelsAfterStep:{shot:1,ads:!!s.ads,spreadDegrees:s.spreadDegrees,
     rewindSeconds:s.rewindSeconds,pelletCount:s.pelletCount,playerHitPellets:s.pellets.filter(z=>z.hitKind==='player').length,
     playerHit:+s.pellets.some(z=>z.hitKind==='player'),worldPellets:s.pellets.filter(z=>z.hitKind==='world').length,
     rangePellets:s.pellets.filter(z=>z.hitKind==='range').length,
     dynamicFoamPellets:s.pellets.filter(z=>z.worldKind==='dynamic-foam').length},
    outcomesOnlyAfterStep:true};
   if(this.rows.length<this.maxRows)this.rows.push(row);else this.counts.droppedRows++;
  }
  this.pending=null;
 }
 finish(){if(this.pending||this.counts.fireModified||this.counts.serverShotMismatches||
  this.counts.shots!==this.rows.length+this.counts.droppedRows||
  this.counts.worldPellets!==this.counts.staticBlockedPellets+this.counts.dynamicFoamBlockedPellets)
   throw Error('C35AA invariant');
  return {schema:C35AA_SCHEMA,matchId:this.matchId,setupId:this.setupId,weapon:this.weapon,
   caveat:'No counterfactual ADS or movement labels. Selection/confounding and latency remain; shot-level cluster bootstrap required.',
   engineSpreadRule:'spreadFor(weapon, aim, onGround): movement SPEED is not an explicit spread input',counts:this.counts,rows:this.rows};}
}
