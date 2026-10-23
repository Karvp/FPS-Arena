import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const ref=(f)=>readFileSync(resolve(root,f));
const obj=f=>JSON.parse(ref(f));
const hash=f=>createHash('sha256').update(ref(f)).digest('hex');
const registry=obj('research/tdm-v67-acquisition-frozen-registry.json');
const report=obj('research/tdm-v67-acquisition-independent-audit.json');
test('independent erratum auditor preserves original frozen protocol hash',()=>{
 assert.equal(report.frozenProtocolSourceSHA256,
  registry.sourceSHA256['scripts/tdm_v67_acquisition.py']);
 assert.equal(hash('scripts/tdm_v67_acquisition.py'),report.frozenProtocolSourceSHA256);
 assert.match(report.frozenProtocolAuditKnownFailure,/UnboundLocalError/);
 assert.equal(report.auditImplementedInIndependentUnfrozenAddendum,true);
});
test('12 groups pass and 48 actual authoritative full-match records have grounded SHA',()=>{
 assert.equal(report.passGroups,12);
 assert.equal(report.allPass,true);
 assert.equal(report.groups.length,12);
 assert.equal(report.triggeredGroups,12);
 assert.equal(report.naturalFourArmGroups,12);
 assert.equal(report.eligiblePairedGroups,12);
 assert.deepEqual(report.failedGroups,[]);
 for(const g of report.groups){
  assert.equal(g.status,'PASS');
  assert.equal(g.naturalFourArm,true);
  for(const arm of ['keep','direct','route','flank']){
   const expected=g.arms[arm].sha256;
   assert.equal(hash('data/v67/'+g.id+'-'+arm+'.json'),expected,g.id+' '+arm);
  }
 }
});
test('frozen sources unaffected and promotion prohibited',()=>{
 for(const [file,h] of Object.entries(registry.sourceSHA256))
  assert.equal(hash(file),h,file);
 const ev=obj('research/tdm-v67-acquisition-evaluation.json');
 assert.equal(ev.promoteToProduction,false);
 assert.equal(ev.allHoldoutsSealed,true);
 for(const arm of ['direct','route','flank'])assert.equal(ev.safetyGateByArm[arm],false);
});
test('2 no-observer baseline controls equal passive Keep in 105 original fields',()=>{
 for(const group of ['calibration-441109','v67-n-aa12-01']){
  const raw=obj('data/v67/'+group+'-uninstrumented.json');
  const keep=obj('data/v67/'+group+'-keep.json');
  const {tdmV67,...stripped}=keep.results[0];
  assert.equal(Object.keys(raw.results[0]).length,105);
  assert.deepEqual(stripped,raw.results[0],group+' parity mismatch');
  assert.equal(raw.results[0].finishedNaturally,true);
 }
});
