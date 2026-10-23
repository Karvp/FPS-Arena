import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const reg=JSON.parse(readFileSync(resolve(root,'research/tdm-v66-natural-frozen-registry.json')));
const arms=['keep','close','strafe','withdraw'];
const hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');

test('V66 preregistered multiple maps/weapons, fresh grouped seed design',()=>{
 assert.equal(reg.schema,'fpsarena-v66-diverse-natural-fullmatch-preregistered-v1');
 assert.deepEqual(reg.arms,arms);
 assert.equal(reg.matchConfig.fullMatch,true);
 assert.equal(reg.matchConfig.capSeconds,600);
 assert.equal(reg.matchConfig.serverTeamScoreLimit,50);
 assert.equal(reg.researchOnly,true);
 assert.equal(reg.productionModified,false);
 assert.equal(reg.noTraining,true);
 assert.equal(reg.holdoutsCannotBeRunFromProtocol,true);
 assert.equal(reg.cases.filter(c=>c.split==='discovery').length,16);
 assert.equal(reg.cases.filter(c=>c.split==='holdout').length,3);
 assert.equal(new Set(reg.cases.map(c=>c.seed)).size,reg.cases.length);
 assert.deepEqual([...new Set(reg.cases.filter(c=>c.split==='discovery').map(c=>c.map))].sort(),
   ['arena','foundry','neon']);
 assert.deepEqual([...new Set(reg.cases.filter(c=>c.split==='discovery').map(c=>c.weapon))].sort(),
   ['aa12','m4a1','mp5sd','uzi']);
});
test('v66 frozen code and prior research registries did not change',()=>{
 for(const [file,expected] of Object.entries({...reg.frozenSourceSha256,
        ...Object.fromEntries(Object.entries(reg.priorRegistrySha256).map(([f,v])=>['research/'+f,v]))})){
  assert.equal(hash(resolve(root,file)),expected,file);
 }
});
test('16 four-arm matches have matching pre-action public state and RNG; no fabricated natural end',()=>{
 for(const c of reg.cases.filter(c=>c.split==='discovery')){
  const obs=arms.map(a=>{
   const file=resolve(root,'data/v66/'+c.id+'-'+a+'.json');
   assert.equal(existsSync(file),true,'missing '+file);
   const raw=JSON.parse(readFileSync(file,'utf8'));
   assert.equal(raw.fullMatch,true);
   assert.equal(raw.snapshotLagMs,45);
   const m=raw.results[0],trial=m.tdmV64;
   assert.equal(m.map,c.map);
   assert.equal(m.weapon,c.weapon);
   assert.equal(m.errors,0);
   assert.equal(m.finishedNaturally,m.termination!=='match');
   assert.ok(m.duration<=600.2);
   if(m.finishedNaturally){
    assert.equal(m.termination,'results');
    assert.ok(Math.max(m.modeState.scores.red,m.modeState.scores.blue)>=50);
   }
   assert.equal(trial.onlyMovementModified,true);
   assert.equal(trial.productionAllowed,false);
   assert.equal(trial.contextCapturedBeforeIntervention,true);
   assert.ok(trial.changedTicks<=150);
   if(trial.triggerTick!=null){
    assert.equal(trial.prestate.tick,trial.triggerTick);
    assert.equal(typeof trial.prestate.rngState,'number');
    assert.equal(trial.contextV64.noPrivateServerInput,true);
    if(trial.complete){
     for(const [key,val] of Object.entries(trial.initial))
      assert.equal(trial.outcome[key],trial.terminal[key]-val);
    }
   }
   return trial;
  });
  assert.equal(obs[0].changedTicks,0);
  for(const o of obs.slice(1)){
   for(const k of ['triggerTick','prestate','prefixSHA256','contextV64','triggerPublicFeatures','initial'])
    assert.deepEqual(o[k],obs[0][k],c.id+' '+k);
  }
 }
});
test('v66 holdout files are sealed, no hidden outputs generated',()=>{
 for(const c of reg.cases.filter(c=>c.split==='holdout'))
  for(const arm of arms)
   assert.equal(existsSync(resolve(root,'data/v66/'+c.id+'-'+arm+'.json')),false);
});


test('two fully natural uninstrumented match controls reproduce Keep fields exactly',()=>{
 const controls=['v66-a-mp5-01','v66-n-aa12-09'];
 for(const id of controls){
  const raw=JSON.parse(readFileSync(resolve(root,'data/v66/'+id+'-uninstrumented.json')));
  const fullKeep=JSON.parse(readFileSync(resolve(root,'data/v66/'+id+'-keep.json')));
  const {tdmV64,...keep}=fullKeep.results[0];
  assert.equal(Object.keys(raw.results[0]).length,105);
  assert.deepEqual(keep,raw.results[0],id+' has different baseline results');
  assert.equal(raw.results[0].finishedNaturally,true);
 }
});
