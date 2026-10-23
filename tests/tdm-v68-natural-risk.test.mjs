import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const reg=JSON.parse(readFileSync(resolve(root,'research/tdm-v68-risk-frozen-registry.json')));
const arms=['keep','route','guarded-route','guarded-flank'];
const sha=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
test('frozen matched 4-arm risk cohort, sealed independent holdouts',()=>{
 assert.equal(reg.schema,'fpsarena-v68-predeclared-public-risk-guard-four-arm-v1');
 assert.deepEqual(reg.arms,arms);
 assert.equal(reg.cases.filter(c=>c.split==='discovery').length,12);
 assert.equal(reg.cases.filter(c=>c.split==='holdout').length,3);
 assert.equal(new Set(reg.cases.map(c=>c.seed)).size,15);
 assert.equal(reg.simulation.fullMatch,true);
 assert.equal(reg.simulation.teamKillTarget,50);
 assert.equal(reg.actor.maxInterventionTicks,1050);
 assert.equal(reg.actor.maxActualChangedTicksGuarded,520);
 assert.equal(reg.actor.privateServerInput,false);
 assert.equal(reg.promotionNeverAutomatic,true);
});
test('no V68 after-registration actor/protocol or older freeze changed',()=>{
 for(const [f,h] of Object.entries(reg.sourceSHA256))
  assert.equal(sha(resolve(root,f)),h,f);
 for(const [f,h] of Object.entries(reg.priorRegistrySHA256))
  assert.equal(sha(resolve(root,'research/'+f)),h,'prior '+f);
});
test('all full natural TDM matched four-arm forks audit the same pre-branch witness',()=>{
 for(const c of reg.cases.filter(c=>c.split==='discovery')){
  const trials=arms.map(arm=>{
   const p=resolve(root,'data/v68/'+c.id+'-'+arm+'.json');
   assert.equal(existsSync(p),true,c.id+' '+arm+' MISSING');
   const raw=JSON.parse(readFileSync(p));
   assert.equal(raw.fullMatch,true);
   const m=raw.results[0],v=m.tdmV68;
   assert.equal(m.map,c.map);
   assert.equal(m.weapon,c.weapon);
   assert.equal(m.errors,0);
   assert.equal(v.schema,'fpsarena-v68-public-exposure-capped-acquisition-v1');
   assert.equal(v.allNonWASDUnchanged,true);
   assert.equal(v.productionAllowed,false);
   assert.equal(v.noPrivilegedActorInput,true);
   assert.ok(v.activeTicks<=1050);
   assert.ok(v.changedTicks<=v.maxChangedTicks);
   if(arm.startsWith('guarded'))assert.equal(v.maxChangedTicks,520);
   assert.equal(m.finishedNaturally,m.termination!=='match');
   if(m.finishedNaturally){
    assert.equal(m.termination,'results');
    assert.ok(Math.max(m.modeState.scores.red,m.modeState.scores.blue)>=50);
   }
   if(v.triggerTick!==null){
    assert.equal(v.prestate.tick,v.triggerTick);
    assert.equal(typeof v.prestate.rngState,'number');
    assert.equal(v.triggerPublicFeatures.noPrivilegedState,true);
    if(v.complete){
     for(const [key,value] of Object.entries(v.initial))
      assert.equal(v.outcome[key],v.terminal[key]-value,c.id+' '+key);
    }
   }
   return v;
  });
  assert.equal(trials[0].changedTicks,0);
  for(const v of trials.slice(1))
   for(const key of ['prefixSHA256','prestate','triggerTick','triggerPublicFeatures','initial'])
    assert.deepEqual(v[key],trials[0][key],c.id+' '+key);
 }
});
test('all newly sealed holdout outputs remain unopened',()=>{
 for(const c of reg.cases.filter(c=>c.split==='holdout'))
  for(const arm of arms)
   assert.equal(existsSync(resolve(root,'data/v68/'+c.id+'-'+arm+'.json')),false);
});
