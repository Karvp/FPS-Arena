import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {tacticalCandidates,tacticalEligibleEngagementCandidates,tacticalDirectorDecision} from '../tactical-director.mjs';
import {normaliseOptions} from '../aim-core.mjs';
const game=()=>({local:{alive:true,mv:{x:0,y:0,z:0},hp:100,armor:80,weapon:{cat:'Shotgun'},ws:{reloading:false,plateT:0}}});
const target=()=>({id:'enemy',point:{x:34,y:0,z:0},visible:false});
const base={x:1,z:0,reason:'pathfinding'};
const config=(o={})=>({engagementWindow:true,opportunityExpansion:true,
 maxRoutes:3,maxProbes:28,walkable:()=>true,canStep:()=>true,
 route:(a,b)=>[{x:20,y:0,z:0},{x:40,y:0,z:0},{x:0,y:0,z:0},b],
 shotClear:()=>true,riskAt:()=>0,threshold:-20,...o});
test('frontier is disabled by default; only explicit true enables it',()=>{
 assert.equal(normaliseOptions({}).tacticalDirectorOpportunityExpansion,false);
 assert.equal(normaliseOptions({tacticalDirectorOpportunityExpansion:true}).tacticalDirectorOpportunityExpansion,true);
 const agent=readFileSync(new URL('../agent-entry.js',import.meta.url),'utf8');
 assert.match(agent,/opportunityExpansion:options\.tacticalDirectorOpportunityExpansion===true &&/);
 assert.match(agent,/globalThis\.__FPSARENA_HEADLESS_LAB__===true/);
 const simulator=readFileSync(new URL('../lab/arena/train.mjs',import.meta.url),'utf8');
 assert.match(simulator,/director-engagement-frontier-lab/);
});
test('a safe early firing prefix can rescue a long winding terminal detour only in frontier lab',()=>{
 let searches=0, audit;
 const p=config({onCandidateAudit:a=>{audit=a;searches++;}});
 const standard=tacticalCandidates(game(),target(),{...p,opportunityExpansion:false});
 const expanded=tacticalCandidates(game(),target(),p);
 assert.equal(standard.length,0);
 assert.ok(expanded.length>=1);
 assert.ok(expanded.every(c=>c.earlyShotWindow&&c.timeToFire<c.terminalTimeToFire));
 assert.ok(expanded.some(c=>c.travel<25));
 assert.ok(audit.detourSalvaged>=1);
 assert.ok(searches===2);
 assert.ok(audit.sites<=14&&audit.routesAttempted<=3);
});
test('dangerous prefix cannot be rescued even with clear distant terminal goal',()=>{
 const p=config({riskAt:(x)=>x.x>=18&&x.x<=22?10:0});
 const o=tacticalCandidates(game(),target(),p);
 assert.ok(o.every(c=>c.risk<=3.5&&c.travel>=0));
 assert.equal(o.length,0);
});
test('feasibility filter promotes eligible lower-ranked route and rejects invalid numeric inputs',()=>{
 const good={earlyShotWindow:true,timeToFire:2.4,terminalTimeToFire:4.3,risk:.6,utility:1};
 const bad={earlyShotWindow:true,timeToFire:5,terminalTimeToFire:10,risk:.1,utility:7};
 const v=tacticalEligibleEngagementCandidates([bad,good]);
 assert.deepEqual(v,[good]);
 assert.deepEqual(tacticalEligibleEngagementCandidates([{...good,risk:NaN},{...good,timeToFire:-1},{...good,terminalTimeToFire:Infinity}]),[]);
 assert.deepEqual(tacticalEligibleEngagementCandidates([good],'trial'),[good]);
});
test('hard priority shield still preserves exact original movement reference',()=>{
 const original={...base};
 for(const condition of ['emergency','fire','recovery','ring','objective']){
  const result=tacticalDirectorDecision(game(),target(),original,3,{},
   {...config(),active:true,engagementProbe:true,[condition]:true});
  assert.strictEqual(result,original);
 }
});
test('frontier screening stays within strict endpoint and A* budgets',()=>{
 let paths=0,checks=0,audit;
 tacticalCandidates(game(),target(),config({
  route:(from,to)=>{paths++;return [{x:19,y:0,z:0},to];},
  shotClear:()=>{checks++;return true;},
  onCandidateAudit:a=>audit=a,
 }));
 assert.ok(audit.sites<=14);
 assert.ok(paths<=3&&checks<=28+3*12);
 assert.ok(audit.routesAttempted<=3);
});
test('owned A* plan retains actuation after the initial reuse interval while moving along a sideways detour',()=>{
 const g=game(),m={},events=[],p=config({active:true,opportunityGuard:false,
  opportunityExpansion:false,
  route:(start,goal)=>[{x:0,y:0,z:12},{x:20,y:0,z:12},goal],
  onDecision:e=>events.push(e)});
 let result=tacticalDirectorDecision(g,target(),base,2,m,p);
 assert.ok(result.reason.startsWith('director-'));
 const initialPlan=m.plan;
 for(let i=1;i<=8;i++){
   g.local.mv={x:0,y:0,z:i*1.1};
   result=tacticalDirectorDecision(g,target(),base,2+i*.2,m,p);
   assert.equal(m.plan,initialPlan,`plan ownership at frame ${i}`);
   assert.ok(result.reason.startsWith('director-'));
 }
 assert.ok(m.plan.waypointProgressTicks>0);
 assert.ok(!events.some(e=>e.state==='director-outcome'&&e.reason==='stalled'));
});
test('recovery-only ETA relaxation does not weaken route risk, gains or regular probe mode',()=>{
 const baseCandidate={earlyShotWindow:true,timeToFire:4.8,terminalTimeToFire:6,
  risk:1.02,utility:-2};
 assert.equal(tacticalEligibleEngagementCandidates([baseCandidate],'probe').length,0);
 assert.equal(tacticalEligibleEngagementCandidates([baseCandidate],'recovery').length,1);
 assert.equal(tacticalEligibleEngagementCandidates([{...baseCandidate,risk:1.2}],'recovery').length,0);
 assert.equal(tacticalEligibleEngagementCandidates([{...baseCandidate,terminalTimeToFire:4.9}],'recovery').length,0);
 assert.equal(normaliseOptions({}).tacticalDirectorEngagementRecovery,false);
});
test('stale baseline pursuit evidence cannot cancel an already-authorized director plan',()=>{
 const g=game(),m={pursuitSpeed:10,pursuitSample:{targetId:'enemy',me:{x:0,z:0},enemy:{x:34,z:0},now:2}},
   p=config({active:true,opportunityGuard:true,engagementWindow:true,engagementProbe:true,
   engagementRecovery:true,threshold:-20,route:(a,b)=>[{x:18,y:0,z:0},b]});
 // Produce a plan under the normal probe stall requirements.
 assert.strictEqual(tacticalDirectorDecision(g,target(),base,3,m,p),base);
 const proposed=tacticalDirectorDecision(g,target(),base,4,m,p);
 assert.ok(proposed.reason.startsWith('director-'));
 const plan=m.plan;
 // Baseline shows progress, but a previously owned plan must keep actuator
 // authority unless a true priority, threat or route guard interrupts it.
 m.pursuitSpeed=10;
 g.local.mv={x:.5,y:0,z:0};
 const still=tacticalDirectorDecision(g,target(),base,4.0167,m,p);
 assert.equal(m.plan,plan);
 assert.ok(still.reason.startsWith('director-'));
 assert.strictEqual(tacticalDirectorDecision(g,target(),base,4.04,m,{...p,fire:true}),base);
 assert.equal(m.plan,null);
});
test('plan identity persists through real ownership and termination without claiming causal hits',()=>{
 const m={},events=[],p=config({active:true,opportunityGuard:false,
  opportunityExpansion:false,route:(a,b)=>[{x:20,y:0,z:0},b],onDecision:e=>events.push(e)});
 const output=tacticalDirectorDecision(game(),target(),base,2,m,p);
 assert.ok(output.reason.startsWith('director-'));
 const id=m.plan.planId;
 assert.equal(typeof id,'number');
 const blocked=tacticalDirectorDecision(game(),target(),base,2.1,m,{...p,emergency:true});
 assert.strictEqual(blocked,base);
 const end=events.find(e=>e.state==='director-outcome');
 assert.equal(end.planId,id);
 assert.equal(end.reason,'emergency');
 assert.equal(end.executed,true);
 const train=readFileSync(new URL('../lab/arena/train.mjs',import.meta.url),'utf8');
 assert.match(train,/directorPlanSelectionCount/);
 assert.match(train,/shotsDuring/);
});
