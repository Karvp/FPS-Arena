import test from 'node:test';import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';import {spawnSync} from 'node:child_process';import path from 'node:path';import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const f=n=>JSON.parse(readFileSync(path.join(root,'reports/c27/study36',n),'utf8'));
const plan=f('PRE-REGISTERED-PLAN.json'),frozen=f('FROZEN-MODELS.json'),hold=f('COMBINED-DATASET.json');
const sha=b=>createHash('sha256').update(b).digest('hex');
test('C27 locked 36 all-new independent seeds with full 6 x 3 x 2 factorial',()=>{
 assert.equal(plan.jobs.length,36);assert.equal(new Set(plan.jobs.map(j=>j.seed)).size,36);
 assert.equal(new Set(plan.jobs.map(j=>`${j.map}/${j.weapon}/${j.opponents}/${j.lagMs}`)).size,36);
 assert.deepEqual(plan.opponents,['stress','mixed','official']);assert.deepEqual(plan.lagsMs,[35,125]);
});
test('C27 registration commits source, frozen model and development before outcomes',()=>{
 const {registrationSHA256,...unsigned}=plan;assert.equal(sha(JSON.stringify(unsigned)),registrationSHA256);
 assert.equal(sha(readFileSync(path.join(root,plan.frozenArtifactPath))),plan.frozenArtifactSHA256);
 assert.equal(sha(readFileSync(path.join(root,plan.developmentDataPath))),plan.developmentDataSHA256);
 // C29 extends train-main; verify C27 against the frozen pre-C29 runner,
 // not against its mutable successor. Original preregistration hash is immutable.
 assert.equal(sha(plan.sourcePaths.map(p=>sha(readFileSync(path.join(root,p==='lab/arena/train-main.mjs'
   ?'lab/arena/frozen-history/train-main.pre-c29.mjs':p)))).join('|')),plan.sourceSHA256);
});
test('C27 frozen model actually trained GRU and selected only by validation',()=>{
 const net=frozen.candidates.find(m=>m.kind==='gru');assert.ok(net?.state['gru.weight_ih_l0']);
 assert.equal(net.state['gru.weight_ih_l0'].length,24);
 const best=frozen.validationScores.reduce((a,b,i,arr)=>b.validation.logLoss<arr[a].validation.logLoss?i:a,0);
 assert.equal(frozen.selectedIndex,best);assert.equal(frozen.selectedKind,frozen.candidates[best].kind);
 assert.equal(frozen.trainMatches,12);assert.equal(frozen.validationMatches,6);assert.equal(frozen.previousC25TestExcluded,6);
});
test('C27 cohort has complete server-observed release samples and no injected intervention',()=>{
 assert.equal(hold.matches.length,36);assert.equal(hold.matches.reduce((s,m)=>s+m.windows.filter(w=>w.complete).length,0),715);
 for(const m of hold.matches){assert.equal(m.metadata.profile,'release');assert.equal(m.metadata.productionActuation,false);assert.equal(m.metadata.observerOnly,true);}
});
test('C27 is explicit about observations vs outcomes; public cues do not contain server labels',()=>{
 for(const m of hold.matches)for(const w of m.windows){
  assert.deepEqual(Object.keys(w.publicCueBeforeWindow).sort(),['cueDefinition','lookbackSeconds','nearestReceivedTracerMeters','receivedNearTracerCount','receivedShotCount']);
  assert.deepEqual(Object.keys(w.publicStatus).sort(),['alive','armorFraction','healthFraction']);
  assert.deepEqual(Object.keys(w.label).sort(),['hostileNearTracerEvents','hostileShotEvents','hostileWeaponDamage','hostileWeaponHitEvents']);
 }
});
test('C27 result proves opponent policy and latency from raw server runs',()=>{
 for(const j of plan.jobs){const r=f(j.id+'.result.json'),d=f(j.id+'.dataset.json');
  assert.equal(r.opponentPolicy,j.opponents);assert.equal(r.snapshotLagMs,j.lagMs);assert.equal(r.results[0].opponentPolicy,j.opponents);
  assert.equal(r.results[0].errors,0);assert.equal(d.matches[0].metadata.seed,j.seed);
 }
});
test('C27 selected test score was not used for model choice or deployment',()=>{
 const e=f('EVALUATION.json');assert.equal(e.selectedByDevelopmentValidation,frozen.selectedKind);
 assert.equal(e.newSeedHoldout.windows,715);assert.equal(e.newSeedHoldout.positives,29);
 assert.equal(e.byOpponentAndLag.length,6);assert.match(e.decision,/DO NOT DEPLOY/);
 assert.ok(e.clusterBootstrap.baselineMinusSelectedBrier95[0]<0);
});
test('C27 Python focused unit tests enforce causal history and leak firewall',()=>{
 const p=spawnSync('python',['scripts/test-c27-temporal.py'],{cwd:root,encoding:'utf8',timeout:40000});
 assert.equal(p.status,0,p.stderr||p.stdout);assert.match(p.stderr,/Ran 9 tests/);
});
