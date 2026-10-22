// C35-P public-only, pre-Game.step passive confidence scorer.
// No ballistic ledger, server player objects or target-hit labels may enter this module.
import {snapshotForShotC35O} from './public-track-freshness-c35o.mjs';
export const C35P_SCHEMA='fpsarena-c35p-public-candidate-confidence-v1';
const finite=Number.isFinite;
const EXPECTED=['age100ms','angle10deg','available','motionMeters','hasProjection'];
function features(c){
 if(!c?.eligible||!finite(c.age)||c.age<0||!finite(c.aimAngleDeg)||!Number.isInteger(c.available)||c.available<1)return null;
 const motion=finite(c.projectedDisplacement)&&c.projectedDisplacement>=0?c.projectedDisplacement:0;
 return [Math.min(4,c.age*10),Math.min(18,Math.max(0,c.aimAngleDeg/10)),Math.min(12,c.available),Math.min(2,motion),Number(c.projectedAimId!=null)];
}
export function validateC35PModel(model){
 if(model?.schema!==C35P_SCHEMA||!Array.isArray(model.features)||model.features.join('|')!==EXPECTED.join('|')||model.noPolicyPromotion!==true)throw Error('C35P unapproved model');
 for(const head of ['hit','identity']){
  const m=model.heads?.[head];if(!m||!Array.isArray(m.columns)||!m.columns.length||new Set(m.columns).size!==m.columns.length||m.columns.some(i=>!Number.isInteger(i)||i<0||i>=EXPECTED.length)||
   m.mu?.length!==m.columns.length||m.sd?.length!==m.columns.length||m.coef?.length!==m.columns.length+1||
   ![...m.mu,...m.sd,...m.coef].every(finite)||m.sd.some(n=>n<=0))throw Error('C35P malformed model head '+head);
 }
 return true;
}
const prob=(m,x)=>{
 let y=m.coef[0];for(let j=0;j<m.columns.length;j++)y+=m.coef[j+1]*(x[m.columns[j]]-m.mu[j])/m.sd[j];
 return +(1/(1+Math.exp(-Math.max(-35,Math.min(35,y))))).toFixed(6);
};
export function publicConfidenceC35P(client,now,model){
 validateC35PModel(model);
 // C35-O is public-only: no authoritative shot truth or server objects enter this call.
 const c=snapshotForShotC35O(client,now).thresholdsMs['350'];const x=features(c);
 if(!x)return {eligible:false,reason:c.reason??'missing-public-cues',aimId:null,pHit:null,pIdCorrectGivenHit:null};
 return {eligible:true,reason:null,aimId:c.aimId,publicAgeMs:+(1000*c.age).toFixed(3),
   pHit:prob(model.heads.hit,x),pIdCorrectGivenHit:prob(model.heads.identity,x)};
}
export class PublicConfidenceObserverC35P{
 constructor({matchId,model,maxRows=3000}){
  if(!matchId||!Number.isSafeInteger(maxRows)||maxRows<1)throw Error('C35P bad observer configuration');validateC35PModel(model);
  this.matchId=matchId;this.model=model;this.maxRows=maxRows;this.rows=[];this.pending=null;this.last=-Infinity;
  this.counts={ticks:0,fireIntentTicks:0,confirmedShots:0,fireModified:0,storedDropped:0};
 }
 beforeStep({now,client,incumbent,applied,serverShots}){
  if(this.pending||!finite(now)||now<=this.last||!Number.isSafeInteger(serverShots))throw Error('C35P bad pre-step ordering');
  this.last=now;this.counts.ticks++;
  if(!!incumbent?.fire!==!!applied?.fire)this.counts.fireModified++;
  const row=incumbent?.fire?{t:+now.toFixed(6),publicBeforeStep:publicConfidenceC35P(client,now,this.model)}:null;
  if(row)this.counts.fireIntentTicks++;
  this.pending={row,serverShots};
 }
 afterStep({serverShots}){
  const p=this.pending;
  if(!p||!Number.isSafeInteger(serverShots)||serverShots<p.serverShots)throw Error('C35P bad afterStep');
  const shots=serverShots-p.serverShots;this.counts.confirmedShots+=shots;
  if(shots&&!p.row)throw Error('C35P server shot without public fire intent');
  if(p.row){if(this.rows.length<this.maxRows)this.rows.push({...p.row,serverLabelsAfterStep:{shots}});else this.counts.storedDropped++;}
  this.pending=null;
 }
 finish(){
  if(this.pending||this.counts.fireModified||this.counts.storedDropped||this.counts.fireIntentTicks!==this.rows.length)throw Error('C35P observer audit');
  return {schema:C35P_SCHEMA,matchId:this.matchId,scope:'passive: public-only probabilities, observed BEFORE step; shot-count AFTER step only',
    caveat:'pIdCorrectGivenHit applies ONLY if a server-confirmed hit occurs; misses have NO true target identity',counts:this.counts,rows:this.rows};
 }
}
