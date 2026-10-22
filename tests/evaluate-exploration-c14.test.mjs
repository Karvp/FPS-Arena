import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeExplorationC14,analyzePairedDiagnosticsC14} from '../lab/arena/evaluate-exploration-c14.mjs';
import {matchAssignmentC14} from '../lab/arena/safe-action-explorer-c14.mjs';
const create=(arm,seed,forced=false)=>{
 const ass=matchAssignmentC14(seed,{forcedArm:forced?arm:null});
 // In tests override seed until its randomized arm matches requested arm.
 if(!forced&&ass.arm!==arm)throw Error('seed has wrong randomized arm');
 const r={mode:'tdm',map:'arena',seed,primaryLoadout:'mp5sd',kills:1,deaths:2,shots:5,damageDealt:100,damageTaken:80,errors:0};
 const m={metadata:{mode:'tdm',map:'arena',seed,loadout:'mp5sd',assignment:ass},diagnostics:{interventionTicks:arm==='control'?0:3},
  offers:[{seed,mode:'tdm',arm,selectedAction:arm==='control'?'baseline':'micro-left',candidateSet:['baseline','micro-left','micro-right'],
   validity:{serverOnlyFeaturesUsed:false,counterfactualOutcomeObserved:false}}]};
 return [r,m];
};
test('C14 insufficient randomized match units block policy training',()=>{
 const a=Array.from({length:60},(_,i)=>create(matchAssignmentC14(i).arm,i));
 const out=analyzeExplorationC14({results:a.map(x=>x[0])},{matches:a.map(x=>x[1])});
 assert.equal(out.promotionEligible,false);
 assert.equal(out.randomizedDesign,true);
 assert.equal(out.status,'sufficient-for-further-statistical-review');
 assert.equal(out.control.matches+out.treatment.matches,60);
});
test('C14 forced diagnostics never masquerade as randomized RCT',()=>{
 const a=Array.from({length:24},(_,i)=>create(i%2?'control':'treatment',i,true));
 const out=analyzeExplorationC14({results:a.map(x=>x[0])},{matches:a.map(x=>x[1])});
 assert.equal(out.randomizedDesign,false);assert.equal(out.promotionEligible,false);
 assert.ok(out.reasonCodes.includes('includes-forced-diagnostic-arms'));
});
test('C14 evaluator rejects mixed mismatched state and repeated seed',()=>{
 const a=create('control',1,true);assert.throws(()=>analyzeExplorationC14({results:[a[0],a[0]]},{matches:[a[1],a[1]]}));
 const b=structuredClone(a[1]);b.metadata.seed=999;
 assert.throws(()=>analyzeExplorationC14({results:[a[0]]},{matches:[b]}));
 const c=structuredClone(a[1]);c.diagnostics.interventionTicks=1;
 assert.throws(()=>analyzeExplorationC14({results:[a[0]]},{matches:[c]}));
});
test('C14 paired diagnostics match keys and never call outcomes causal',()=>{
 const a=create('control',123,true),b=create('treatment',123,true);
 const out=analyzePairedDiagnosticsC14({results:[a[0]]},{results:[b[0]]},{matches:[a[1]]},{matches:[b[1]]});
 assert.equal(out.pairs.length,1);assert.equal(out.pairs[0].killDelta,0);
 assert.equal(out.promotionEligible,false);assert.equal(out.status,'diagnostic-only-not-randomized');
 const c=create('treatment',124,true);assert.throws(()=>analyzePairedDiagnosticsC14({results:[a[0]]},{results:[c[0]]},{matches:[a[1]]},{matches:[c[1]]}));
});
