import test from 'node:test';
import assert from 'node:assert/strict';
import { decideC35CPreoffer as decide, publicRiskBin, C35COfferLedger,
  C35C_ARMS, C35CPreofferAudit, validateC35CConfig } from '../lab/arena/c35c-option-arbitration.mjs';

const packet = () => ({
  nowMs: 500,
  publicSnapshot: { observedAtMs: 435 },
  incumbent: { source: 'public-local', fire: false, reload: false, skill: false, objective: false, emergency: false },
  macro: { source: 'public-prediction', kind: 'engage', nextPriorityEtaMs: 300 },
  symmetricC16: { baseline: true, 'micro-left': true, 'micro-right': true },
  threat: { source: 'public-c34', score: 0.75, observedAtMs: 435 },
});
const eligible = () => decide(packet());
const baseAssign = (decision=eligible(), matchId='m1', offerId='o1', startMs=500) => ({
  offerId, matchId, setupId: 'neon/mp5sd/0', startMs,
  assignment: 'micro-left', decision,
  propensity: { baseline: 1/3, 'micro-left': 1/3, 'micro-right': 1/3 },
});

test('valid public packet yields symmetric three-arm eligibility', () => {
  const decision=eligible(); assert.equal(decision.eligible,true);
  assert.deepEqual([...decision.availableArms],C35C_ARMS);
  assert.equal(decision.riskBin,'high');
  assert.equal(decision.requiresAuthoritativePerTickC16,true);
});
for (const key of ['fire','reload','skill','objective','emergency']) {
  test(`incumbent ${key} takes priority over micro`, () => {
    const p=packet(); p.incumbent[key]=true;
    assert.deepEqual({eligible:decide(p).eligible,reason:decide(p).reason},
      {eligible:false,reason:'incumbent-priority-command'});
  });
}
test('imminent transition denies the offer before randomization', () => {
  const p=packet(); p.macro.nextPriorityEtaMs=110;
  assert.equal(decide(p).reason,'macro-transition-imminent');
});
test('prediction exactly on guard boundary is eligible', () => {
  const p=packet(); p.macro.nextPriorityEtaMs=120;
  assert.equal(decide(p).eligible,true);
});
test('no macro prediction fails closed', () => {
  const p=packet(); delete p.macro.nextPriorityEtaMs;
  assert.equal(decide(p).reason,'macro-priority-forecast-unavailable');
});
test('unknown command keys fail closed', () => {
  const p=packet(); delete p.incumbent.reload;
  assert.equal(decide(p).reason,'unknown-incumbent-command');
});
test('stale and future snapshots fail closed', () => {
  let p=packet(); p.publicSnapshot.observedAtMs=120;
  assert.equal(decide(p).reason,'stale-or-incomplete-public-snapshot');
  p=packet(); p.publicSnapshot.observedAtMs=600;
  assert.equal(decide(p).reason,'stale-or-incomplete-public-snapshot');
});
for(const arm of C35C_ARMS){
  test(`C16 symmetric safety gate refuses if ${arm} is not safe`, () => {
    const p=packet(); p.symmetricC16[arm]=false;
    assert.equal(decide(p).reason,'c16-symmetric-safety-refusal');
  });
}
test('unknown/stale C34 score does not filter safe offers', () => {
  let p=packet(); p.threat={source:'server-truth',score:1,observedAtMs:500};
  const result=decide(p); assert.equal(result.eligible,true); assert.equal(result.riskBin,'unknown');
  p=packet(); p.threat={source:'public-c34',score:1,observedAtMs:0};
  assert.equal(decide(p).riskBin,'unknown');
});
test('fixed risk bins are strictly descriptive',()=>{
  assert.equal(publicRiskBin({source:'public-c34',score:0,observedAtMs:500},undefined,500),'low');
  assert.equal(publicRiskBin({source:'public-c34',score:.4,observedAtMs:500},undefined,500),'middle');
  assert.equal(publicRiskBin({source:'public-c34',score:1,observedAtMs:500},undefined,500),'high');
});
test('invalid config and undefined feature controls fail closed',()=>{
  assert.throws(()=>validateC35CConfig({durationMs:5}),/durationMs/);
  assert.equal(decide({...packet(),nowMs:Infinity}).eligible,false);
});
test('ledger records ITT assignment and postdecision outcomes separately',()=>{
  const ledger=new C35COfferLedger(); ledger.recordAssignment(baseAssign());
  assert.equal(ledger.pendingCount(),1);
  const result=ledger.recordPostdecision({offerId:'o1',completed:true,executedTicks:3,
    plannedTicks:5,interruptReason:'incumbent-priority-command',
    hitPositive:false,hostileHits:0,shotsFired:1,shotsLost:0});
  assert.equal(result.outcome.hitPositive,false); assert.equal(result.complete,true);
  assert.equal(ledger.pendingCount(),0);
});
test('censored windows cannot be mislabeled as observed no-hits',()=>{
  const ledger=new C35COfferLedger(); ledger.recordAssignment(baseAssign());
  assert.throws(()=>ledger.recordPostdecision({offerId:'o1',completed:false,
    executedTicks:0,plannedTicks:2,hitPositive:false,hostileHits:0}),/censored/);
  const row=ledger.recordPostdecision({offerId:'o1',completed:false,
    executedTicks:0,plannedTicks:2});
  assert.equal(row.censored,true); assert.equal(row.outcome.hitPositive,null);
});
test('overlap, duplicate and impossible propensities are rejected',()=>{
  const ledger=new C35COfferLedger(); ledger.recordAssignment(baseAssign());
  assert.throws(()=>ledger.recordAssignment(baseAssign()),/duplicate/);
  assert.throws(()=>ledger.recordAssignment(baseAssign(eligible(),'m1','o2',600)),/overlap/);
  assert.throws(()=>ledger.recordAssignment({...baseAssign(eligible(),'m2','o3'),
    propensity:{baseline:0,'micro-left':0.5,'micro-right':0.5}}),/positive propensities/);
});
test('after-window assignment is valid; duplicate assignment never recorded',()=>{
  const ledger=new C35COfferLedger(); ledger.recordAssignment(baseAssign());
  ledger.recordAssignment(baseAssign(eligible(),'m1','o2',2300));
  assert.equal(ledger.pendingCount(),2);
});
test('postdecision cause must not get exposed through predecision decision',()=>{
  const p=packet(); p.postDecisionReason='hit-confirmed-server';
  const decision=decide(p);
  assert.equal('postDecisionReason' in decision,false);
  assert.equal('serverTruth' in decision,false);
});

test('macro cannot receive retrospective server priority forecast', () => {
  const p=packet(); p.macro.source='postdecision-server';
  assert.equal(decide(p).reason,'macro-priority-forecast-unavailable');
});
test('incumbent command cannot be supplied from server-only state', () => {
  const p=packet(); p.incumbent.source='server-truth';
  assert.equal(decide(p).reason,'unknown-incumbent-command');
});


test('blocked offers remain prospectively countable by risk without assignment',()=>{
  const p=packet(); p.incumbent.fire=true;
  const d=decide(p);
  assert.equal(d.riskBin,'high');
  const audit=new C35CPreofferAudit();
  const row=audit.record({attemptId:'a',matchId:'m1',setupId:'setup',nowMs:500,decision:d});
  assert.equal(row.eligible,false); assert.equal(row.predecisionReason,'incumbent-priority-command');
  assert.equal('assignment' in row,false);
  assert.throws(()=>audit.record({attemptId:'a',matchId:'m1',setupId:'setup',nowMs:500,decision:d}),/duplicate/);
});
test('preoffer logger cannot accept incomplete or asymmetric decisions',()=>{
  const audit=new C35CPreofferAudit();
  assert.throws(()=>audit.record({attemptId:'a',matchId:'m',setupId:'s',nowMs:0,
    decision:{eligible:true,reason:'unsafe',riskBin:'low',availableArms:['baseline']}}),/three-way/);
});
