import test from 'node:test';
import assert from 'node:assert/strict';
import {tacticalDirectorDecision,tacticalCandidates,tacticalRepeatedLowYield} from '../tactical-director.mjs';
const g=()=>({local:{alive:true,mv:{x:0,y:0,z:0},hp:100,armor:70,weapon:{cat:'Shotgun'},ws:{reloading:false,plateT:0}}});
const target={id:'enemy',point:{x:34,y:0,z:0},visible:false,hitboxVisible:false};
const cover={x:-1,z:0,reason:'camera-peek-hide'};
const policy={active:true,opportunityGuard:true,conservative:true,engagementWindow:true,
  route:(from,goal)=>[{x:goal.x*.4,y:0,z:goal.z*.4},goal],shotClear:()=>true,
  walkable:()=>true,riskAt:()=>0,canStep:()=>true,threshold:-20};
const evidence=time=>({targetId:'enemy',label:'candidate-low-yield',sequence:['APPROACH','TAKE_COVER','APPROACH'],
  time,intermediateShotOpportunities:0,intermediateFireTicks:0,intermediateHpLoss:0,
  intermediateArmorLoss:0,intermediateSelfRangeGainM:0});
test('once authorized, an actuated plan survives stale evidence until priority shield intervenes',()=>{
  const memory={},events=[];
  assert.strictEqual(tacticalDirectorDecision(g(),target,cover,2,memory,{...policy,evidence:evidence(2),onDecision:e=>events.push(e)}),cover);
  const authorized=tacticalDirectorDecision(g(),target,cover,2.2,memory,{...policy,evidence:evidence(2.2),onDecision:e=>events.push(e)});
  assert.ok(authorized.reason.startsWith('director-'));
  assert.equal(memory.plan?.actuated,true);
  assert.equal(memory.lowYieldConfirmations,null);
  assert.deepEqual(memory.lowYieldConsumed,{targetId:'enemy',time:2.2});
  const continued=tacticalDirectorDecision(g(),target,cover,2.3,memory,{...policy,evidence:evidence(2.2),onDecision:e=>events.push(e)});
  assert.ok(continued.reason.startsWith('director-'));
  assert.equal(memory.plan?.actuated,true);
  assert.strictEqual(tacticalDirectorDecision(g(),target,cover,2.4,memory,{...policy,emergency:true,onDecision:e=>events.push(e)}),cover);
  assert.equal(memory.plan,null);
  assert.ok(events.some(e=>e.state==='director-outcome'&&e.executed===true));
  assert.strictEqual(tacticalDirectorDecision(g(),target,cover,2.8,memory,{...policy,evidence:evidence(2.2)}),cover);
  assert.equal(tacticalRepeatedLowYield(memory,evidence(2.2),2.8,'enemy'),false);
});
test('two fresh independent events can authorize another plan after evidence consumption',()=>{
  const memory={lowYieldConsumed:{targetId:'enemy',time:2.2}};
  assert.equal(tacticalRepeatedLowYield(memory,evidence(2.2),3,'enemy'),false);
  assert.equal(tacticalRepeatedLowYield(memory,evidence(3),3,'enemy'),false);
  assert.equal(tacticalRepeatedLowYield(memory,evidence(3.3),3.3,'enemy'),true);
});
test('candidate audit is aggregated and matches candidate count with bounded A*',()=>{
  const snapshots=[];
  let routed=0;
  const options=tacticalCandidates(g(),target,{...policy,route:(a,b)=>{routed++;return [b];},
    onCandidateAudit:e=>snapshots.push(e)});
  assert.equal(snapshots.length,1);
  const a=snapshots[0];
  assert.equal(a.accepted,options.length);
  assert.equal(a.routesAttempted,routed);
  assert.ok(a.sites<=5&&a.routesAttempted<=2&&a.routesValid<=a.routesAttempted);
  assert.ok(a.earlyWindows<=a.initialStepsValid);
});
test('invalid LOS reveals geometry bottleneck without unnecessary routes',()=>{
  let routed=0;const audits=[];
  const options=tacticalCandidates(g(),target,{...policy,shotClear:()=>false,
    route:()=>{routed++;return[];},onCandidateAudit:x=>audits.push(x)});
  assert.deepEqual(options,[]);assert.equal(routed,0);
  assert.equal(audits.length,1);assert.equal(audits[0].losValid,0);
  assert.equal(audits[0].routesAttempted,0);
});
