import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=fileURLToPath(new URL('../',import.meta.url));
const data=f=>readFileSync(resolve(root,f));
const obj=f=>JSON.parse(data(f));
const hash=f=>createHash('sha256').update(data(f)).digest('hex');
const reg=obj('research/tdm-v69-cover-frozen-registry.json');
const audit=obj('research/tdm-v69-cover-independent-audit.json');
const report=obj('research/tdm-v69-cover-fullmatch-evaluation.json');
test('v69 frozen source and all registries preserved',()=>{
 assert.equal(audit.passGroups,12);
 assert.deepEqual(audit.failedGroups,[]);
 assert.deepEqual(audit.missingGroups,[]);
 assert.equal(audit.triggeredGroups,12);
 assert.equal(audit.naturalFourArmGroups,11);
 assert.equal(audit.eligiblePairedGroups,11);
 assert.equal(audit.registrySHA256,hash('research/tdm-v69-cover-frozen-registry.json'));
 for(const [file,h] of Object.entries(reg.sourceSHA256))
  assert.equal(hash(file),h,'source '+file);
});
test('48 raw arm trials have grounded independent matching SHA',()=>{
 for(const g of audit.groups){
  assert.equal(g.status,'PASS');
  for(const a of ['keep','route','cover-escape','cover-support'])
   assert.equal(hash('data/v69/'+g.id+'-'+a+'.json'),g.arms[a].sha256,g.id+' '+a);
 }
});
test('two censored matches not treated as natural wins or paired outcomes',()=>{
 const group=audit.groups.find(g=>g.id==='v69-n-aa12-02');
 assert.ok(group);
 assert.equal(group.eligible,false);
 assert.equal(group.allNatural,false);
 assert.equal(group.arms.keep.natural,true);
 assert.equal(group.arms.route.natural,true);
 assert.equal(group.arms['cover-escape'].natural,false);
 assert.equal(group.arms['cover-support'].natural,false);
 assert.equal(report.matchedEligibleGroups,11);
 assert.equal(report.naturalMatches,46);
 assert.equal(report.censoredMatches,2);
 assert.equal(report.promotionAllowed,false);
 assert.equal(report.holdoutsSealed,true);
});
test('both Keep control matches exactly reproduce 105 original metrics with no observer',()=>{
 for(const c of ['calibration-441109','v69-n-aa12-01']){
  const original=obj('data/v69/'+c+'-uninstrumented.json').results[0];
  const withObserve=obj('data/v69/'+c+'-keep.json').results[0];
  const {tdmV69,...clean}=withObserve;
  assert.equal(Object.keys(original).length,105);
  assert.deepEqual(clean,original,c);
  assert.equal(original.finishedNaturally,true);
 }
});
