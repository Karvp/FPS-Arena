import {test} from 'node:test';
import assert from 'node:assert/strict';
import {C35CExperimentCoordinator} from '../lab/arena/c35c-experiment-coordinator.mjs';
function packet(nowMs=500) { return {nowMs, publicSnapshot:{observedAtMs:nowMs-65},
  incumbent:{source:'public-local',fire:false,reload:false,skill:false,objective:false,emergency:false},
  macro:{source:'public-prediction',kind:'engage',nextPriorityEtaMs:280},
  symmetricC16:{baseline:true,'micro-left':true,'micro-right':true},
  threat:{source:'public-c34',score:.8,observedAtMs:nowMs-65}}; }
function coordinator(mode='hierarchical80', assignments=[]){return new C35CExperimentCoordinator({mode,
 legacyPreoffer:p=>({eligible:p.symmetricC16['micro-left']===true,reason:'real-c35b-callback-fixture'}),
 c21Assign:q=>{assignments.push(q);return {arm:'micro-left',propensity:{baseline:1/3,'micro-left':1/3,'micro-right':1/3}};}});}
function attempt(c,nowMs=500,id='a',p=packet(nowMs),ordinal=0){return c.attempt({attemptId:id,offerId:`offer-${id}`,matchId:'match',setupId:'setup',ordinal,packet:p});}
const permitted={isC16Safe:()=>true,isMacroFree:()=>true,applyMicroTick:()=>{}};
test('blocked prospective macro never calls historical randomizer',()=>{
 const assignments=[];const c=coordinator('hierarchical80',assignments);
 const p=packet();p.incumbent.fire=true;
 const result=attempt(c,500,'a',p);
 assert.equal(result.status,'blocked');assert.equal(assignments.length,0);
 assert.equal(c.preofferRows()[0].eligible,false);assert.equal(c.offerRows().length,0);
});
test('legacy vs hierarchical same dose but distinct preoffer selection',()=>{
 for (const mode of ['legacy80','hierarchical80']){
  const c=coordinator(mode);const p=packet();p.macro.nextPriorityEtaMs=1;
  const r=attempt(c,500,`x-${mode}`,p);
  assert.equal(r.status,mode==='legacy80'?'assigned':'blocked');
 }
});
test('tick c16 veto prevents writing and persists interruption',()=>{
 const c=coordinator();attempt(c);let applied=0;
 assert.equal(c.tick({offerId:'offer-a',nowMs:505,isC16Safe:()=>false,
 isMacroFree:()=>true,applyMicroTick:()=>applied++}).status,'interrupted');
 assert.equal(c.tick({offerId:'offer-a',nowMs:506,...permitted}).status,'interrupted');
 assert.equal(applied,0);
 const row=c.finalize({offerId:'offer-a',completed:true,plannedTicks:5,hitPositive:false,hostileHits:0});
 assert.equal(row.interruptReason,'authoritative-c16-refusal');
});
test('macro tick veto prevents actuation even when original C16 passes',()=>{
 const c=coordinator();attempt(c);let applied=0;
 assert.equal(c.tick({offerId:'offer-a',nowMs:505,isC16Safe:()=>true,isMacroFree:()=>false,
 applyMicroTick:()=>applied++}).reason,'incumbent-priority-command');
 assert.equal(applied,0);
});
test('successful tick is bounded by 80ms action horizon',()=>{
 const c=coordinator();attempt(c);let applied=0;
 for (const ms of [505,520,560,579,580,610]) c.tick({offerId:'offer-a',nowMs:ms,
 isC16Safe:()=>true,isMacroFree:()=>true,applyMicroTick:()=>applied++});
 assert.equal(applied,4);
 const row=c.finalize({offerId:'offer-a',completed:true,plannedTicks:5,hitPositive:false,hostileHits:0});
 assert.equal(row.executedTicks,4);assert.equal(row.policy,'hierarchical80');
 assert.equal(row.attemptId,'a');
 assert.throws(()=>c.finalize({offerId:'offer-a',completed:false,plannedTicks:5}),/finalized/);
});
test('baseline never overrides incumbent or calls C16',()=>{
 const c=new C35CExperimentCoordinator({c21Assign:()=>({arm:'baseline',propensity:{baseline:1/3,'micro-left':1/3,'micro-right':1/3}})});
 attempt(c);const r=c.tick({offerId:'offer-a',nowMs:520});assert.equal(r.status,'baseline-untouched');
});
test('nonoverlapping assignment does not consume another C21 draw while window active',()=>{
 const calls=[];const c=coordinator('hierarchical80',calls);attempt(c);
 const r=attempt(c,800,'b',packet(800),1);
 assert.equal(r.status,'deferred-window');assert.equal(calls.length,1);
 assert.equal(c.preofferRows().length,2);
});
test('no fabricated outcome or unsafe re-finalization',()=>{
 const c=coordinator();attempt(c);
 assert.throws(()=>c.finalize({offerId:'offer-a',completed:true,plannedTicks:5,
   hostileHits:0,hitPositive:null}),/complete window/);
 assert.equal(c.pendingCount(),1);
 const row=c.finalize({offerId:'offer-a',completed:false,plannedTicks:5});
 assert.equal(row.outcome.hitPositive,null);
});
test('malformed propensities and assigned arm are rejected',()=>{
 for(const ret of [null,{arm:'left',propensity:{baseline:1/3,'micro-left':1/3,'micro-right':1/3}},
  {arm:'micro-left',propensity:{baseline:1,'micro-left':0,'micro-right':0}}]) {
  const c=new C35CExperimentCoordinator({c21Assign:()=>ret});
  assert.throws(()=>attempt(c),/C21/);
 }
});
test('deterministic 2000-attempt safety contract under diverse priority and lag',()=>{
 let draws=0;let applied=0;const c=new C35CExperimentCoordinator({c21Assign:()=>{
  draws++;return {arm:'micro-left',propensity:{baseline:1/3,'micro-left':1/3,'micro-right':1/3}};
 }});
 let assigned=0,blocked=0;
 for(let i=0;i<2000;i++){
  const ms=500+i*2000;const p=packet(ms);
  p.publicSnapshot.observedAtMs=ms-(i%6===0?220:65);
  p.incumbent.fire=i%5===0;
  p.macro.nextPriorityEtaMs=i%7===0?50:280;
  p.symmetricC16['micro-left']=i%11!==0;
  const result=c.attempt({attemptId:`a${i}`,offerId:`o${i}`,matchId:'m',
   setupId:'s',ordinal:i,packet:p});
  if(result.status==='blocked'){blocked++;continue;}
  assigned++;
  const allow=i%3!==0;
  const t=c.tick({offerId:`o${i}`,nowMs:ms+1,
   isC16Safe:()=>allow,isMacroFree:()=>true,applyMicroTick:()=>applied++});
  assert.equal(t.status,allow?'executed':'interrupted');
  c.finalize({offerId:`o${i}`,completed:false,plannedTicks:5});
 }
 assert.equal(draws,assigned);assert.equal(assigned+blocked,2000);
 assert.ok(assigned>100);assert.ok(blocked>100);assert.ok(applied<assigned);
 assert.equal(c.offerRows().length,assigned);
 assert.equal(c.preofferRows().length,2000);
});

test('legacy80 cannot run without genuine legacy preoffer callback',()=>{
 assert.throws(()=>new C35CExperimentCoordinator({mode:'legacy80',
   c21Assign:()=>({arm:'baseline',propensity:{baseline:1/3,'micro-left':1/3,'micro-right':1/3}})}),/genuine C35-B/);
});
