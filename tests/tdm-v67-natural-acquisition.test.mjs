import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const reg=JSON.parse(readFileSync(resolve(root,'research/tdm-v67-acquisition-frozen-registry.json')));
const sha=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const arms=['keep','direct','route','flank'];
test('preregistered public acquisition groups and sealed holdouts',()=>{
 assert.equal(reg.schema,'fpsarena-v67-public-weapon-aware-navigation-frozen-v1');
 assert.deepEqual(reg.arms,arms);
 assert.equal(reg.cases.filter(c=>c.split==='discovery').length,12);
 assert.equal(reg.cases.filter(c=>c.split==='holdout').length,3);
 assert.equal(new Set(reg.cases.map(c=>c.seed)).size,15);
 assert.equal(reg.actor.noPrivilegedServerInput,true);
 assert.equal(reg.actor.modifiesWASDOnly,true);
 assert.equal(reg.actor.treatmentTicks,1050);
 assert.equal(reg.actor.outcomeTicks,1230);
 assert.equal(reg.promotion.automaticPromotionForbidden,true);
});
test('all pre-frozen source, engine and older registry hashes intact',()=>{
 for(const [file,digest] of Object.entries(reg.sourceSHA256))
  assert.equal(sha(resolve(root,file)),digest,'source '+file);
 for(const [file,digest] of Object.entries(reg.priorRegistriesSHA256))
  assert.equal(sha(resolve(root,'research/'+file)),digest,'parent '+file);
});
test('natural 4-arm matches have identical pre-intervention RNG and public state',()=>{
 for(const c of reg.cases.filter(c=>c.split==='discovery')){
  const results=arms.map(arm=>{
   const file=resolve(root,'data/v67/'+c.id+'-'+arm+'.json');
   assert.equal(existsSync(file),true,'missing '+file);
   const data=JSON.parse(readFileSync(file));
   assert.equal(data.fullMatch,true);
   const m=data.results[0],v=m.tdmV67;
   assert.equal(m.map,c.map);
   assert.equal(m.weapon,c.weapon);
   assert.equal(m.errors,0);
   assert.equal(m.finishedNaturally,m.termination!=='match');
   if(m.finishedNaturally){
    assert.equal(m.termination,'results');
    assert.ok(Math.max(m.modeState.scores.red,m.modeState.scores.blue)>=50);
   }
   assert.ok(m.duration<=600.2);
   assert.equal(v.schema,'fpsarena-v67-public-map-range-acquisition-v1');
   assert.equal(v.productionAllowed,false);
   assert.equal(v.fireAimAdsSkillsModified,false);
   assert.equal(v.onlyMovementModified,true);
   assert.equal(v.farPublicTargetCapturedBeforeIntervention,true);
   assert.ok(v.changedTicks<=1050);
   assert.ok(v.activeTicks<=1050);
   if(v.triggerTick!==null){
    assert.equal(v.prestate.tick,v.triggerTick);
    assert.equal(typeof v.prestate.rngState,'number');
    assert.equal(v.triggerPublicFeatures.noPrivilegedState,true);
    if(v.complete)for(const [key,value] of Object.entries(v.initial))
      assert.equal(v.outcome[key],v.terminal[key]-value);
   }
   return v;
  });
  assert.equal(results[0].changedTicks,0,c.id+' Keep moved');
  for(const trial of results.slice(1)){
   for(const field of ['triggerTick','prefixSHA256','prestate','triggerPublicFeatures','initial'])
    assert.deepEqual(trial[field],results[0][field],c.id+': '+field);
  }
 }
});
test('no v67 new holdout was opened',()=>{
 for(const c of reg.cases.filter(c=>c.split==='holdout'))
  for(const arm of arms)
   assert.equal(existsSync(resolve(root,'data/v67/'+c.id+'-'+arm+'.json')),false);
});
