import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const obj=p=>JSON.parse(readFileSync(resolve(root,p),'utf8'));
const hash=p=>createHash('sha256').update(readFileSync(resolve(root,p))).digest('hex');
const frozen=obj('research/tdm-v68-risk-frozen-registry.json');
const audit=obj('research/tdm-v68-risk-independent-audit.json');
const evaluated=obj('research/tdm-v68-risk-fullmatch-evaluation.json');
test('12 verified matched groups and original source hash unchanged',()=>{
 assert.equal(audit.passGroups,12);
 assert.deepEqual(audit.missingGroups,[]);
 assert.deepEqual(audit.failedGroups,[]);
 assert.equal(audit.triggeredGroups,12);
 assert.equal(audit.naturalFourArmGroups,11);
 assert.equal(audit.eligibleGroups,11);
 assert.equal(audit.registrySHA256,hash('research/tdm-v68-risk-frozen-registry.json'));
 for(const [file,h] of Object.entries(frozen.sourceSHA256))
  assert.equal(hash(file),h,file);
});
test('48 raw JSON trial SHA hashes match independent audit',()=>{
 assert.equal(audit.groups.length,12);
 for(const g of audit.groups){
  assert.equal(g.status,'PASS',g.id);
  for(const arm of ['keep','route','guarded-route','guarded-flank']){
   const p='data/v68/'+g.id+'-'+arm+'.json';
   assert.equal(existsSync(resolve(root,p)),true);
   assert.equal(hash(p),g.arms[arm].sha256,p);
  }
 }
});
test('censored matches are excluded from paired bootstrap without inventing wins',()=>{
 const group=audit.groups.find(g=>g.id==='v68-n-aa12-02');
 assert.ok(group);
 assert.equal(group.eligible,false);
 assert.equal(group.naturalFour,false);
 assert.equal(group.arms['guarded-route'].natural,false);
 assert.equal(group.arms['guarded-flank'].natural,false);
 assert.equal(group.arms.keep.natural,true);
 assert.equal(evaluated.pairedGroups,11);
 assert.equal(evaluated.naturalMatchCount,46);
 assert.equal(evaluated.calibrationSeedExcluded,true);
 assert.equal(evaluated.promotionAllowed,false);
 assert.equal(evaluated.oldAndNewHoldoutsUntouched,true);
 for(const arm of ['route','guarded-route','guarded-flank'])
  assert.equal(evaluated.strictSafetyGate[arm],false);
});
test('two uninstrumented natural match controls match passive Keep 105/105 fields',()=>{
 for(const name of ['calibration-441109','v68-n-aa12-01']){
  const m=obj('data/v68/'+name+'-uninstrumented.json').results[0];
  const data=obj('data/v68/'+name+'-keep.json').results[0];
  const {tdmV68,...original}=data;
  assert.equal(Object.keys(m).length,105);
  assert.deepEqual(original,m,name);
  assert.equal(m.finishedNaturally,true);
 }
});
