import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {tacticalExplorationAssignment,tacticalDirectorDecision} from '../tactical-director.mjs';
import {normaliseOptions} from '../aim-core.mjs';
const game=()=>({local:{alive:true,mv:{x:0,y:0,z:0},hp:100,armor:80,weapon:{cat:'Shotgun'},ws:{reloading:false,plateT:0}}});
const target=()=>({id:'enemy',point:{x:34,y:0,z:0},visible:false,hitboxVisible:false});
const baseline={x:1,z:0,reason:'pathfinding'};
const policy=(o={})=>({active:true,opportunityGuard:true,engagementProbe:true,
 engagementRecovery:true,engagementWindow:true,engagementExploration:true,
 explorationSeed:12345,explorationProbability:.5,
 route:(a,b)=>[{x:23,y:0,z:0},b],walkable:()=>true,
 canStep:()=>true,shotClear:()=>true,riskAt:()=>0,threshold:-20,...o});
test('exploration disabled in normal options and headless-gated in agent',()=>{
 assert.equal(normaliseOptions({}).tacticalDirectorExplorationLab,false);
 assert.equal(normaliseOptions({tacticalDirectorExplorationLab:true}).tacticalDirectorExplorationLab,true);
 const source=readFileSync(new URL('../agent-entry.js',import.meta.url),'utf8');
 assert.match(source,/engagementExploration:options\.tacticalDirectorExplorationLab===true &&\s*globalThis\.__FPSARENA_HEADLESS_LAB__===true/);
 const profiles=readFileSync(new URL('../lab/arena/train.mjs',import.meta.url),'utf8');
 assert.match(profiles,/director-engagement-exploration-lab/);
});
test('deterministic Bernoulli sampling has exact logged conditional propensities without game RNG',()=>{
 const old=Math.random;Math.random=()=>{throw Error('must not consume game rng');};
 try{
  const a=tacticalExplorationAssignment(123456,1,'target',.5);
  assert.deepEqual(a,tacticalExplorationAssignment(123456,1,'target',.5));
  assert.equal(a.actionProbability,.5);
  assert.equal(a.controlProbability,.5);
  assert.ok(a.draw>=0&&a.draw<1);
  assert.equal(tacticalExplorationAssignment(123456,1,'target',0).actuate,false);
  assert.equal(tacticalExplorationAssignment(123456,1,'target',1).actuate,true);
  const selected=Array.from({length:1000},(_,n)=>tacticalExplorationAssignment(111+n,1,'target',.5).actuate).filter(Boolean).length;
  assert.ok(selected>400&&selected<600,'sanity only, not statistical calibration');
 }finally{Math.random=old;}
 for(const [s,a,t,p] of [[NaN,1,'x',.5],[2,-1,'x',.5],[2,1,'',.5],[2,1,'x',1.5]])
   assert.throws(()=>tacticalExplorationAssignment(s,a,t,p),/Invalid/);
});
test('control assignment retains baseline exact identity and emits logged offer; full arm executes',()=>{
 const m={},events=[],ctrl=policy({explorationProbability:0,onDecision:e=>events.push(e)});
 assert.strictEqual(tacticalDirectorDecision(game(),target(),baseline,2,m,ctrl),baseline);
 const control=tacticalDirectorDecision(game(),target(),baseline,3,m,ctrl);
 assert.strictEqual(control,baseline);
 assert.equal(m.plan,undefined);
 const assignment=events.find(e=>e.state==='director-exploration-assignment');
 assert.equal(assignment?.actuate,false);
 assert.equal(assignment?.actionProbability,0);
 assert.ok(assignment.eligibleOptions.length>0);
 assert.equal(m.explorationAttempts,1);
 assert.ok(m.probeSuspendUntil>=6);
 const n={},events2=[],treated=policy({explorationProbability:1,onDecision:e=>events2.push(e)});
 tacticalDirectorDecision(game(),target(),baseline,2,n,treated);
 const outcome=tacticalDirectorDecision(game(),target(),baseline,3,n,treated);
 assert.match(outcome.reason,/^director-/);
 assert.equal(n.plan.exploration?.actionProbability,1);
 assert.equal(n.plan.actuated,true);
 assert.equal(events2.find(e=>e.state==='director-exploration-assignment')?.actuate,true);
 assert.equal(events2.find(e=>e.state==='director-planned')?.actionProbability,1);
});
test('unsafe situations never get randomized; priority shield persists for owned exploration',()=>{
 for(const override of [{fire:true},{emergency:true},{objective:true},{recovery:true},{ring:true},{shotClear:()=>false}]){
  const m={},events=[],p=policy({...override,explorationProbability:1,onDecision:e=>events.push(e)});
  tacticalDirectorDecision(game(),target(),baseline,2,m,p);
  assert.strictEqual(tacticalDirectorDecision(game(),target(),baseline,3,m,p),baseline);
  assert.equal(events.some(e=>e.state==='director-exploration-assignment'),false);
 }
 const m={},p=policy({explorationProbability:1});
 tacticalDirectorDecision(game(),target(),baseline,2,m,p);
 assert.match(tacticalDirectorDecision(game(),target(),baseline,3,m,p).reason,/^director-/);
 assert.strictEqual(tacticalDirectorDecision(game(),target(),baseline,3.1,m,{...p,emergency:true}),baseline);
});
test('invalid randomization setting fails closed and does not authorize plan',()=>{
 const m={},events=[],p=policy({explorationSeed:undefined,onDecision:e=>events.push(e)});
 tacticalDirectorDecision(game(),target(),baseline,2,m,p);
 assert.strictEqual(tacticalDirectorDecision(game(),target(),baseline,3,m,p),baseline);
 assert.ok(events.some(e=>e.reason==='invalid-exploration-configuration'));
 assert.equal(m.plan,undefined);
});
