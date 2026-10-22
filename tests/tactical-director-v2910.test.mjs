import test from 'node:test';
import assert from 'node:assert/strict';
import {tacticalCandidates,tacticalDirectorDecision,tacticalObservePursuit,tacticalOpportunityVeto,tacticalRepeatedLowYield}
 from '../tactical-director.mjs';
import {normaliseOptions} from '../aim-core.mjs';
import {readFileSync} from 'node:fs';
const game=(cat='Shotgun')=>({local:{alive:true,mv:{x:0,y:0,z:0},hp:100,armor:70,
 weapon:{cat},ws:{reloading:false,plateT:0}}});
const target=(t={x:34,y:0,z:0})=>({id:'enemy',visible:false,hitboxVisible:false,point:t});
const pursuit={x:1,z:0,reason:'pathfinding'},cover={x:-1,z:0,reason:'camera-peek-hide'};
const route=(a,b)=>[{x:a.x+(b.x-a.x)*.4,y:b.y,z:a.z+(b.z-a.z)*.4},b];
const policy=()=>({route,shotClear:()=>true,walkable:()=>true,riskAt:()=>0,canStep:()=>true,maxRoutes:2,threshold:-20});
const evidence={targetId:'enemy',label:'candidate-low-yield',sequence:['APPROACH','TAKE_COVER','APPROACH'],
  time:2,intermediateShotOpportunities:0,intermediateFireTicks:0,intermediateHpLoss:0,intermediateArmorLoss:0,intermediateSelfRangeGainM:0};
test('opportunity guarded lab flag is normalized, and off by default',()=>{
 assert.equal(normaliseOptions({}).tacticalDirectorOpportunityGuard,false);
 assert.equal(normaliseOptions({tacticalDirectorOpportunityGuard:true}).tacticalDirectorOpportunityGuard,true);
});
test('screen all five LOS-valid sites before selecting bounded A* budget',()=>{
 const calls=[],P=policy();
 P.route=(a,b)=>{calls.push(b.z);return route(a,b)};
 P.riskAt=p=>p.z>2?8:0; // left flank unsafe; right flank viable
 const candidates=tacticalCandidates(game(),target(),P);
 assert.ok(candidates.length>=1);
 assert.ok(calls.every(z=>z<=2),'excluded exposed flank must not consume route call');
 assert.ok(calls.length<=2);
});
test('candidate search visits alternate flanks even when direct/first flank LOS blocked',()=>{
 const P=policy();let hits=0;
 P.shotClear=eye=>{hits++;return eye.z < -4};
 let routes=0;P.route=(a,b)=>{routes++;return route(a,b)};
 const candidates=tacticalCandidates(game(),target(),P);
 assert.ok(hits>=3,'must evaluate more than first two sites');
 assert.ok(candidates.some(c=>c.goal.z<0));
 assert.ok(routes<=2);
});
test('imminent hitbox firing window remains with the original controller',()=>{
 const g=game(),t=target({x:22,y:0,z:0});t.hitboxVisible=true;
 assert.equal(tacticalOpportunityVeto(g,t,cover,2,{},{}),'hitbox-firing-window');
 assert.strictEqual(tacticalDirectorDecision(g,t,cover,2,{}, {...policy(),active:true,opportunityGuard:true,evidence}),cover);
});
test('visible target just outside nominal effective range is protected',()=>{
 const g=game(),t=target({x:18,y:0,z:0});t.visible=true;
 assert.equal(tacticalOpportunityVeto(g,t,cover,2,{},{}),'imminent-range-window');
});
test('progress rate excludes target motion and protects productive baseline pursuit',()=>{
 const m={},g=game(),t=target();
 tacticalOpportunityVeto(g,t,pursuit,2,m,{});
 g.local.mv={x:1,y:0,z:0};
 assert.equal(tacticalOpportunityVeto(g,t,pursuit,2.1,m,{}),'progressing-pursuit');
 const m2={},g2=game(),t2=target();
 tacticalOpportunityVeto(g2,t2,pursuit,2,m2,{});
 t2.point={x:24,y:0,z:0};
 assert.equal(tacticalOpportunityVeto(g2,t2,pursuit,2.1,m2,{}),null,
   'enemy moving closer alone must not count as bot progress');
});
test('one low-yield observation is not enough for active movement',()=>{
 const g=game(),m={},t=target(),P={...policy(),active:true,conservative:true,opportunityGuard:true,evidence};
 assert.strictEqual(tacticalDirectorDecision(g,t,cover,2,m,P),cover);
});
test('distinct same-target evidence unlocks an experimental route; duplicate events do not',()=>{
 const g=game(),m={},t=target(),P={...policy(),active:true,conservative:true,opportunityGuard:true,evidence};
 assert.strictEqual(tacticalDirectorDecision(g,t,cover,2,m,P),cover);
 assert.strictEqual(tacticalDirectorDecision(g,t,cover,2.1,m,P),cover);
 const newEvidence={...evidence,time:2.22};
 const out=tacticalDirectorDecision(g,t,cover,2.22,m,{...P,evidence:newEvidence});
 assert.ok(out.reason.startsWith('director-'));
});
test('confirmation expires, and target switches cannot reuse prior failures',()=>{
 const m={},e1={...evidence,time:2},e2={...evidence,time:3};
 assert.equal(tacticalRepeatedLowYield(m,e1,2,'enemy'),false);
 assert.equal(tacticalRepeatedLowYield(m,e2,3,'enemy'),true);
 assert.equal(tacticalRepeatedLowYield(m,{...e2,time:11},11,'enemy'),false);
 assert.equal(tacticalRepeatedLowYield(m,{...e2,targetId:'different',time:12},12,'different'),false);
});
test('opportunity guard rejects speculative long time-to-fire route',()=>{
 const g=game(),t=target({x:80,y:0,z:0}),m={},events=[];
 const P={...policy(),active:true,opportunityGuard:true,route:(a,b)=>[
  {x:a.x+5,z:a.z,y:0},{x:a.x+16,z:a.z,y:0},b],
  threshold:-20,onDecision:e=>events.push(e)};
 tacticalDirectorDecision(g,t,pursuit,2,m,{...P,evidence});
 const o=tacticalDirectorDecision(g,t,pursuit,2.22,m,{...P,evidence:{...evidence,time:2.22}});
 assert.strictEqual(o,pursuit);
 assert.ok(events.some(e=>e.reason==='time-to-fire-too-long')||
  events.some(e=>e.reason==='no-profitable-route'));
});
test('all priority shield invariants remain immutable in opportunity guarded lab',()=>{
 for(const k of ['emergency','dodge','ring','objective','recovery','shotOpportunity','fire']){
  const old={...cover};
  assert.strictEqual(tacticalDirectorDecision(game(),target(),old,2,{},
   {...policy(),active:true,opportunityGuard:true,[k]:true}),old,k);
 }
});
test('built extension must include opportunity guard and headless-only actuation',()=>{
 const src=readFileSync(new URL('../page-agent.js',import.meta.url),'utf8');
 assert.ok(src.includes('function tacticalOpportunityVeto('));
 assert.ok(src.includes('opportunityGuard:options.tacticalDirectorOpportunityGuard===true'));
 assert.ok(src.includes('globalThis.__FPSARENA_HEADLESS_LAB__===true'));
});
