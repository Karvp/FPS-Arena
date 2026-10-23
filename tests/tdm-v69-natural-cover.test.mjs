import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const reg=JSON.parse(readFileSync(resolve(root,'research/tdm-v69-cover-frozen-registry.json')));
const arms=['keep','route','cover-escape','cover-support'];
const hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
test('v69 frozen seed split excludes calibration/holdouts and retains 4 matching arms',()=>{
 assert.equal(reg.schema,'fpsarena-v69-public-active-cover-frozen-prospective-v1');
 assert.deepEqual(reg.arms,arms);
 assert.equal(reg.cases.filter(c=>c.split==='discovery').length,12);
 assert.equal(reg.cases.filter(c=>c.split==='holdout').length,3);
 assert.equal(new Set(reg.cases.map(c=>c.seed)).size,15);
 assert.equal(reg.match.fullMatch,true);
 assert.equal(reg.match.naturalScoreTarget,50);
 assert.equal(reg.actor.maxChangedTicksEscapeArms,620);
 assert.equal(reg.actor.privateActorInput,false);
 assert.equal(reg.calibrationSeed441109Excluded,true);
 assert.equal(reg.promotionNeverAutomatic,true);
});
test('every old registry and every registered source hash identical',()=>{
 for(const [f,h] of Object.entries(reg.sourceSHA256))
  assert.equal(hash(resolve(root,f)),h,f);
 for(const [f,h] of Object.entries(reg.parentRegistrySHA256))
  assert.equal(hash(resolve(root,'research/'+f)),h,'prior '+f);
});
test('all 48 real four-arm matches preserve pre-branch RNG/public prefix, report true censoring',()=>{
 for(const c of reg.cases.filter(c=>c.split==='discovery')){
  const trials=arms.map(arm=>{
   const filename=resolve(root,'data/v69/'+c.id+'-'+arm+'.json');
   assert.equal(existsSync(filename),true,c.id+' '+arm+' MISSING');
   const raw=JSON.parse(readFileSync(filename));
   assert.equal(raw.fullMatch,true);
   const m=raw.results[0],v=m.tdmV69;
   assert.equal(m.errors,0);
   assert.equal(m.map,c.map);
   assert.equal(m.weapon,c.weapon);
   assert.equal(v.schema,'fpsarena-v69-public-active-cover-egress-v1');
   assert.equal(v.productionAllowed,false);
   assert.equal(v.noPrivilegedActorInput,true);
   assert.equal(v.allNonWASDUnchanged,true);
   assert.ok(v.activeTicks<=1050);
   assert.ok(v.changedTicks<=v.maxChangedTicks);
   if(arm.startsWith('cover-'))assert.equal(v.maxChangedTicks,620);
   assert.equal(m.finishedNaturally,m.termination!=='match');
   assert.ok(m.duration<=600.25);
   if(m.finishedNaturally){
    assert.equal(m.termination,'results');
    assert.ok(Math.max(m.modeState.scores.red,m.modeState.scores.blue)>=50);
   }
   if(v.triggerTick!==null){
    assert.equal(v.prestate.tick,v.triggerTick);
    assert.equal(typeof v.prestate.rngState,'number');
    assert.equal(v.triggerPublicFeatures.noPrivilegedState,true);
    if(v.complete)for(const [key,val] of Object.entries(v.initial))
     assert.equal(v.outcome[key],v.terminal[key]-val,c.id+' '+arm+' '+key);
   }
   return v;
  });
  assert.equal(trials[0].changedTicks,0,c.id+' Keep must stay passive');
  for(const v of trials.slice(1))
   for(const f of ['triggerTick','prestate','prefixSHA256','initial','triggerPublicFeatures'])
    assert.deepEqual(v[f],trials[0][f],c.id+' '+f);
 }
});
test('all three new sealed holdout outputs are absent',()=>{
 for(const c of reg.cases.filter(c=>c.split==='holdout'))
  for(const arm of arms)
   assert.equal(existsSync(resolve(root,'data/v69/'+c.id+'-'+arm+'.json')),false);
});
