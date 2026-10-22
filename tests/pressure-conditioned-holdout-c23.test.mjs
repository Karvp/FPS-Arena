import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {RiskAwareRandomizerC22} from '../lab/arena/risk-aware-encounters-c22.mjs';
import {C23_FIXED_ENDPOINT,validateC23,evaluateC23} from '../lab/arena/evaluate-pressure-holdout-c23.mjs';
const mkClient=()=>({pos:{x:0,y:0,z:0},map:{bound:68,boxes:[]},rig:{yaw:0},
 local:{team:'red',alive:true,hp:100,armor:50,maxArmor:100,weapon:{magSize:30},ws:{slot:0,guns:[{id:'mp5sd',mag:20}]},mv:{x:0,y:0,z:0,onGround:true,stance:0}},
 remotes:{list:[{id:'enemy',team:'blue',alive:true,pos:{x:40,z:0},buf:[{t:.9,x:39.8,z:0},{t:1,x:40,z:0}]}]}});
const fresh=(c,t)=>{c.remotes.list[0].buf=[{t:t-.15,x:39.8,z:0},{t:t-.04,x:40,z:0}];};
function match(seed=23023000,{blocked=false}={}){
 const c=mkClient(),r=new RiskAwareRandomizerC22({seed,mode:'tdm',map:'arena',loadout:'mp5sd'});
 for(let i=0;i<400;i++){const t=1.065+i/60;fresh(c,t);r.command(t,c,blocked?{fire:true}:{});
  if(i===10)r.serverEvent(t,'hit',{dmg:24});}
 return r.finish(8);
}
function fixture(seeds=[23023000],options={}){
 const matches=seeds.map(seed=>match(seed,options));
 const unsigned={schema:'fpsarena-c23-pressure-holdout-plan-v1',version:1,
  design:'fixed pressure holdout',sourceSHA256:'f'.repeat(64),endpoint:C23_FIXED_ENDPOINT,
  baseSeed:23023000,repetitions:seeds.length,seconds:75,snapshotLagMs:65,bots:5,opponents:'stress',profile:'release',
  jobs:seeds.map((seed,i)=>({id:`arena-mp5sd-${i.toString().padStart(2,'0')}`,map:'arena',weapon:'mp5sd',seed}))};
 const plan={...unsigned,registrationSHA256:createHash('sha256').update(JSON.stringify(unsigned)).digest('hex')};
 return {dataset:{schema:'fpsarena-c22-risk-aware-dataset-v1',engine:'uploaded-main',matches},plan};
}
const clone=x=>structuredClone(x);
test('C23 unchanged C22 randomized controller passes match and prereg validation',()=>{
 const {dataset,plan}=fixture();const v=validateC23(dataset,plan);assert.equal(v.matches,1);assert.ok(v.rows.length);
});
test('C23 evaluates 1.8s only and refuses neural policy training on tiny cohort',()=>{
 const {dataset,plan}=fixture();const e=evaluateC23(dataset,plan,{bootstraps:30});
 assert.equal(e.predeclaredEndpoint.horizonSeconds,1.8);assert.equal(e.trainingGate.passes,false);
 assert.equal(e.actionCoverage.baseline.windows+e.actionCoverage['micro-left'].windows+e.actionCoverage['micro-right'].windows,e.complete);
 assert.match(e.cohort,/NEW SEEDS ONLY/);
});
test('C23 evaluation is deterministic for identical data and seed',()=>{
 const {dataset,plan}=fixture([23023000,23023001]);
 assert.deepEqual(evaluateC23(dataset,plan,{bootstraps:50}),evaluateC23(dataset,plan,{bootstraps:50}));
});
test('C23 refuses pressure-specific intervals when arm coverage is sparse',()=>{
 const {dataset,plan}=fixture();const e=evaluateC23(dataset,plan,{bootstraps:30});
 for(const band of ['low','moderate','elevated','unobserved'])for(const arm of ['micro-left','micro-right']){
  assert.equal(e.pressureCohorts[band].contrasts[arm].matchBootstrap95,null);
  assert.equal(e.pressureCohorts[band].contrasts[arm].sufficientlyCoveredForInterval,false);
 }
});
test('C23 rejects a holdout seed already present in exploratory C22 data',()=>{
 const {dataset,plan}=fixture();assert.throws(()=>validateC23(dataset,plan,{exploratorySeeds:[23023000]}),/seed collision/);
});
test('C23 rejects duplicated jobs and missing or extra dataset matches',()=>{
 const {dataset,plan}=fixture();const two=fixture([23023000,23023001]);
 assert.throws(()=>validateC23(two.dataset,plan),/missing or extra match/);
 two.plan.jobs[1].seed=23023000;assert.throws(()=>validateC23(two.dataset,two.plan),/registration hash changed/);
});
test('C23 rejects mismatched map, weapon, seed, and invented source hashes',()=>{
 const {dataset,plan}=fixture();const changed=clone(plan);changed.sourceSHA256='a'.repeat(64);
 assert.throws(()=>validateC23(dataset,changed),/registration hash changed/);
 const forged=clone(dataset);forged.matches[0].metadata.map='neon';
 assert.throws(()=>validateC23(forged,plan),/unregistered observation|row identity|offer identity/);
});
test('C23 refuses unregistered endpoint, changed horizon or altered pressure classes',()=>{
 const {dataset,plan}=fixture();const bad=clone(plan);bad.endpoint.horizonSeconds=.9;
 assert.throws(()=>validateC23(dataset,bad),/endpoint tampering/);
 const changed=clone(dataset);changed.matches[0].offers[0].pressureBand='elevated';
 assert.throws(()=>validateC23(changed,plan),/pre-action pressure band/);
});
test('C23 can include completely blocked zero-offer matches in denominator',()=>{
 const {dataset,plan}=fixture([23023000,23023001],{blocked:true});
 const e=evaluateC23(dataset,plan,{bootstraps:30});assert.equal(e.matches,2);assert.equal(e.offers,0);
 assert.equal(e.complete,0);assert.equal(e.trainingGate.passes,false);
});
test('C23 samples entire matches not individual encounter rows when computing intervals',()=>{
 const {dataset,plan}=fixture([23023000,23023001,23023002]);
 const e=evaluateC23(dataset,plan,{bootstraps:40});assert.equal(e.matches,3);
 assert.equal(e.pressureAudits.low.sampled+e.pressureAudits.moderate.sampled+e.pressureAudits.elevated.sampled+e.pressureAudits.unobserved.sampled,
 dataset.matches.reduce((s,m)=>s+m.diagnostics.publicPressureAudit.sampled,0));
});
