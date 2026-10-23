import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';

const root=fileURLToPath(new URL('../',import.meta.url));
const reg=JSON.parse(readFileSync(resolve(root,'research/tdm-v65-fullmatch-frozen-registry.json')));
const arms=['keep','close','strafe','withdraw'];
const shaFile=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const canonical=o=>JSON.stringify(o,Object.keys(o??{}).sort());
test('v65 frozen registry is natural-only, never an old holdout',()=>{
 assert.equal(reg.schema,'fpsarena-v65-preregistered-authoritative-natural-tdm-v1');
 assert.deepEqual(reg.arms,arms);
 assert.equal(reg.simulation.fullMatch,true);
 assert.equal(reg.simulation.matchCapSeconds,600);
 assert.equal(reg.simulation.scoreTarget,50);
 assert.equal(reg.noModelTrainingOrTuning,true);
 assert.equal(reg.noProductionPromotion,true);
 assert.equal(reg.allCases.length,8);
 assert.equal(reg.allCases.filter(c=>c.split==='holdout').length,2);
 assert.equal(new Set(reg.allCases.map(c=>c.seed)).size,reg.allCases.length);
});
test('frozen server/runner/model hashes remained intact',()=>{
 for(const [relative,hash] of Object.entries(reg.sourceSHA256)){
  assert.equal(shaFile(resolve(root,relative)),hash,relative);
 }
});
test('all 24 raw matched arms are available, classified and audit witnesses agree',()=>{
 const groups=reg.allCases.filter(c=>c.split==='discovery');
 for(const c of groups){
  const rows=arms.map(arm=>{
   const file=resolve(root,'data/v65/'+c.id+'-'+arm+'.json');
   assert.ok(existsSync(file),'missing '+file);
   const x=JSON.parse(readFileSync(file));
   assert.equal(x.fullMatch,true);
   const m=x.results[0];
   assert.equal(m.map,c.map);
   assert.equal(m.weapon,c.weapon);
   assert.equal(m.errors,0);
   assert.equal(m.finishedNaturally,m.termination!=='match');
   assert.ok(m.duration<=600.2);
   if(m.finishedNaturally){
    assert.equal(m.termination,'results');
    const scores=m.modeState.scores;
    assert.ok(Math.max(scores.red,scores.blue)>=50);
   }
   return {m,v:m.tdmV64};
  });
  const keep=rows[0].v;
  assert.equal(keep.changedTicks,0);
  for(const {m,v} of rows){
   assert.equal(v.triggerTick,keep.triggerTick,c.id);
   assert.deepEqual(v.prestate,keep.prestate,c.id+' prestate');
   assert.equal(v.prefixSHA256,keep.prefixSHA256,c.id+' command prefix');
   assert.deepEqual(v.contextV64,keep.contextV64,c.id+' context');
   assert.deepEqual(v.triggerPublicFeatures,keep.triggerPublicFeatures,c.id+' public features');
   assert.deepEqual(v.initial,keep.initial,c.id+' initial counters');
   assert.ok(v.changedTicks<=150);
   assert.equal(v.onlyMovementModified,true);
   assert.equal(v.contextCapturedBeforeIntervention,true);
   assert.equal(v.productionAllowed,false);
   if(v.triggerTick!==null){
    assert.equal(v.prestate.tick,v.triggerTick);
    assert.equal(typeof v.prestate.rngState,'number');
    if(v.complete)for(const [key,value] of Object.entries(v.initial)){
     assert.equal(v.outcome[key],v.terminal[key]-value);
    }
   }
  }
 }
});
test('no v65 holdout output exists',()=>{
 for(const c of reg.allCases.filter(c=>c.split==='holdout')){
  for(const arm of arms){
   assert.equal(existsSync(resolve(root,'data/v65/'+c.id+'-'+arm+'.json')),false);
  }
 }
});
