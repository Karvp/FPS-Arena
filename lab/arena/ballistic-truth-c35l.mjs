// C35-L research-side, non-actuating, firing-time ballistic truth ledger.
// Import policy-side public C35K projection only; authoritative data stays here.
import {publicLOSStratumC35K} from './public-target-los-c35k.mjs';
export const C35L_SCHEMA='fpsarena-c35l-firing-time-ballistic-truth-v1';
const finite=v=>typeof v==='number'&&Number.isFinite(v);
export class BallisticTruthObserverC35L {
 constructor({matchId,maxRows=3000}={}){
  if(!matchId||!Number.isInteger(maxRows)||maxRows<1)throw Error('C35L invalid configuration');
  this.matchId=matchId;this.maxRows=maxRows;this.rows=[];this.pending=null;this.last=-Infinity;
  this.counts={ticks:0,fireIntentTicks:0,confirmedShots:0,confirmedPellets:0,
   hitPlayerPellets:0,hitZombiePellets:0,hitAbilityPellets:0,hitEntityPellets:0,
   worldPellets:0,rangePellets:0,staticBlockedPellets:0,dynamicFoamBlockedPellets:0,
   rewoundShots:0,publicTargetDisagreesWithHit:0,comparableTargetHits:0,
   serverShotEvents:0,serverHitEvents:0,fireModified:0,storedDropped:0};
 }
 beforeStep({now,client,incumbent,applied,serverShots,serverHits}){
  if(this.pending||!finite(now)||now<=this.last||!Number.isSafeInteger(serverShots)||!Number.isSafeInteger(serverHits))throw Error('C35L invalid beforeStep');
  this.last=now;this.counts.ticks++;
  if(!!incumbent?.fire!==!!applied?.fire)this.counts.fireModified++;
  const pub=incumbent?.fire?publicLOSStratumC35K(client,now,incumbent):null;
  if(pub)this.counts.fireIntentTicks++;
  // JSON serialization is an intentional immutable public feature boundary.
  this.pending={row:pub?{t:+now.toFixed(6),publicBeforeStep:JSON.parse(JSON.stringify(pub)),shots:[]}:null,
   serverShots,serverHits,shots:[]};
 }
 onShot(shot){
  if(!this.pending)throw Error('C35L shot outside step');
  if(shot?.schema!=='fpsarena-c35l-authoritative-ballistics-v1'||!Array.isArray(shot.pellets)||
    shot.pellets.length!==shot.pelletCount||!Number.isSafeInteger(shot.seq)||!finite(shot.rewindSeconds)||shot.rewindSeconds<0)
    throw Error('C35L malformed authoritative shot');
  // Never expose this sink or its rows to public clients, controls or policy logic.
  this.pending.shots.push(JSON.parse(JSON.stringify(shot)));
 }
 afterStep({serverShots,serverHits}){
  const p=this.pending;
  if(!p||!Number.isSafeInteger(serverShots)||!Number.isSafeInteger(serverHits)||serverShots<p.serverShots||serverHits<p.serverHits)
   throw Error('C35L invalid afterStep');
  const count=serverShots-p.serverShots;
  if(p.shots.length!==count)throw Error(`C35L shot ledger mismatch ${p.shots.length} != ${count}`);
  if(count&&!p.row)throw Error('C35L server fired without pre-step fire-intent (review special modes)');
  this.counts.serverShotEvents+=count;this.counts.serverHitEvents+=serverHits-p.serverHits;
  for(const s of p.shots){
   this.counts.confirmedShots++;this.counts.confirmedPellets+=s.pellets.length;
   if(s.rewindSeconds>1e-6)this.counts.rewoundShots++;
   for(const pellet of s.pellets){
    switch(pellet.hitKind){
     case 'player':this.counts.hitPlayerPellets++;break;
     case 'zombie':this.counts.hitZombiePellets++;break;
     case 'ability-body':this.counts.hitAbilityPellets++;break;
     case 'streak-entity':this.counts.hitEntityPellets++;break;
     case 'world':this.counts.worldPellets++;break;
     case 'range':this.counts.rangePellets++;break;
     default:throw Error('C35L unknown pellet class');
    }
    if(pellet.hitKind==='world'){
     if(pellet.worldKind==='static')this.counts.staticBlockedPellets++;
     else if(pellet.worldKind==='dynamic-foam')this.counts.dynamicFoamBlockedPellets++;
     else throw Error('C35L world pellet missing obstacle provenance');
    }
    if(pellet.hitKind==='player'&&p.row?.publicBeforeStep?.valid){
     this.counts.comparableTargetHits++;
     if(String(pellet.targetId)!==String(p.row.publicBeforeStep.targetId))this.counts.publicTargetDisagreesWithHit++;
    }
   }
  }
  if(p.row){
   const row={...p.row,serverLabelsAfterStep:{shots:count,hits:serverHits-p.serverHits},
    authoritativeFiringTimeShots:p.shots};
   if(this.rows.length<this.maxRows)this.rows.push(row);else this.counts.storedDropped++;
  }
  this.pending=null;
 }
 finish(){
  const c=this.counts;
  if(this.pending||c.fireModified||c.fireIntentTicks!==this.rows.length+c.storedDropped||c.serverShotEvents!==c.confirmedShots||
   c.confirmedPellets!==c.hitPlayerPellets+c.hitZombiePellets+c.hitAbilityPellets+c.hitEntityPellets+c.worldPellets+c.rangePellets||
   c.worldPellets!==c.staticBlockedPellets+c.dynamicFoamBlockedPellets)throw Error('C35L invariant failed');
  return {schema:C35L_SCHEMA,matchId:this.matchId,
   safety:'Server shot truth emitted only after authoritative fireWeapon; never used as an agent input',
   limitation:'Player hit is after rewind and pellet spread; distance is first collision not full path. No counterfactual causal claim.',
   counts:{...c},rows:this.rows};
 }
}
