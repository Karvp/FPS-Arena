import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {tacticalFirstShotWindow,tacticalCandidates,tacticalDirectorDecision} from '../tactical-director.mjs';
import {normaliseOptions} from '../aim-core.mjs';
const makeGame=(cat='Shotgun')=>({local:{alive:true,mv:{x:0,y:0,z:0},hp:100,armor:80,weapon:{cat},ws:{reloading:false,plateT:0}}});
const makeTarget=()=>({id:'target',point:{x:34,y:0,z:0},visible:false});
const band={min:3,max:16,speed:7};
const policy=(extras={})=>({engagementWindow:true,maxShotProbes:8,route:(from,goal)=>[{x:goal.x*.4,y:0,z:goal.z*.4},goal],walkable:()=>true,shotClear:()=>true,riskAt:()=>0,canStep:()=>true,threshold:-20,...extras});
test('lab flag defaults off and normalizes only explicit true',()=>{
 assert.equal(normaliseOptions({}).tacticalDirectorEngagementWindow,false);
 assert.equal(normaliseOptions({tacticalDirectorEngagementWindow:true}).tacticalDirectorEngagementWindow,true);
});
test('first reachable shot on verified path precedes terminal vantage',()=>{
 const w=tacticalFirstShotWindow([{x:15,y:0,z:0},{x:25,y:0,z:0}],{x:0,y:0,z:0},
  {x:34,y:0,z:0},band,policy());
 assert.ok(w);assert.ok(w.travel>=18&&w.travel<25);assert.equal(w.segmentIndex,1);
});
test('occluded intermediate site never creates false firing window',()=>{
 const w=tacticalFirstShotWindow([{x:25,y:0,z:0}],{x:0,y:0,z:0},
  {x:34,y:0,z:0},band,policy({shotClear:()=>false}));
 assert.equal(w,null);
});
test('early-shot search bounds expensive LOS probes and handles empty budget',()=>{
 let probes=0;const p=policy({shotClear:()=>{probes++;return false;}});
 const waypoints=[{x:25,y:0,z:0}];
 assert.equal(tacticalFirstShotWindow(waypoints,{x:0,y:0,z:0},{x:34,y:0,z:0},band,{...p,maxShotProbes:2}),null);
 assert.ok(probes<=2);
 assert.equal(tacticalFirstShotWindow(waypoints,{x:0,y:0,z:0},{x:34,y:0,z:0},band,{...p,maxShotProbes:0}),null);
});
test('first-shot scan rejects malformed geometry, preserving strict fallback',()=>{
 assert.equal(tacticalFirstShotWindow([{x:NaN,z:0}],{x:0,z:0},{x:20,z:0},band,policy()),null);
 assert.equal(tacticalFirstShotWindow(null,{x:0,z:0},{x:20,z:0},band,policy()),null);
});
test('early-shot planning shortens path but does not spend extra A*',()=>{
 let routes=0;const P=policy({route:(start,goal)=>{routes++;return [{x:18,y:0,z:0},{x:23,y:0,z:0},goal];}});
 const base=tacticalCandidates(makeGame(),makeTarget(),{...P,engagementWindow:false});
 const newOptions=tacticalCandidates(makeGame(),makeTarget(),P);
 assert.ok(newOptions.length>0);
 assert.ok(routes<=4,'at most two routes per invocation');
 assert.ok(newOptions.some(o=>o.earlyShotWindow===true));
 assert.ok(newOptions.some(o=>o.timeToFire<o.terminalTimeToFire));
 assert.ok(newOptions.some(o=>o.travel<base[0].travel));
});
test('winding route prefix stays ordered; no distance-based waypoint filtering',()=>{
 const route=(a,goal)=>[{x:8,y:0,z:8},{x:4,y:0,z:15},{x:18,y:0,z:0},goal];
 const P=policy({route,shotClear:(eye)=>eye.x>=18});
 const out=tacticalCandidates(makeGame(),makeTarget(),P);
 if(out.some(o=>o.earlyShotWindow)){
  for(const o of out.filter(o=>o.earlyShotWindow)){
   assert.equal(o.waypoints[0].x,8);
   assert.ok(o.waypoints.length>=3);
  }
 }
});
test('combat opportunity and emergency remain immutable even with early-window mode',()=>{
 const old={x:-1,z:0,reason:'camera-peek-hide'};
 for(const key of ['fire','shotOpportunity','emergency','recovery','ring','objective'])
  assert.strictEqual(tacticalDirectorDecision(makeGame(),makeTarget(),old,3,{}, {...policy(),active:true,[key]:true}),old);
});
test('shadow early-window plan never changes movement object',()=>{
 const old={x:0,z:1,reason:'camera-peek-hide'};
 const result=tacticalDirectorDecision(makeGame(),makeTarget(),old,3,{}, {...policy(),active:false});
 assert.strictEqual(result,old);
});
test('built extension and authoritative simulator include window flag and first-shot metrics',()=>{
 const page=readFileSync(new URL('../page-agent.js',import.meta.url),'utf8');
 const train=readFileSync(new URL('../lab/arena/train.mjs',import.meta.url),'utf8');
 assert.ok(page.includes('function tacticalFirstShotWindow('));
 assert.ok(page.includes('engagementWindow:options.tacticalDirectorEngagementWindow===true'));
 assert.ok(train.includes('firstShotAt'));assert.ok(train.includes('director-engagement-lab'));
});
test('experimental trial remains opt-in and cannot override a visible target or non-shotgun',()=>{
 assert.equal(normaliseOptions({}).tacticalDirectorEngagementTrial,false);
 const P={...policy(),active:true,opportunityGuard:true,engagementTrial:true};
 const cover={x:-1,z:0,reason:'camera-peek-hide'};
 assert.strictEqual(tacticalDirectorDecision(makeGame('SMG'),makeTarget(),cover,2,{},P),cover);
 assert.strictEqual(tacticalDirectorDecision(makeGame(),{...makeTarget(),visible:true},cover,2,{},P),cover);
 assert.strictEqual(tacticalDirectorDecision(makeGame(),makeTarget(),{...cover,reason:'pathfinding'},2,{},P).reason,'pathfinding');
});
test('trial does not override short-range, non-early, or emergency proposals',()=>{
 const c={x:-1,z:0,reason:'camera-peek-hide'};
 const g=makeGame();
 assert.strictEqual(tacticalDirectorDecision(g,{...makeTarget(),point:{x:12,y:0,z:0}},c,2,{},
  {...policy(),active:true,opportunityGuard:true,engagementTrial:true}),c);
 assert.strictEqual(tacticalDirectorDecision(g,makeTarget(),c,2,{},
  {...policy({shotClear:()=>false}),active:true,opportunityGuard:true,engagementTrial:true}),c);
});
test('geometry scanner has bounded samples even for enormous malformed path segments',()=>{
 const start={x:0,y:0,z:0},end={x:1e12,y:0,z:0};
 assert.equal(tacticalFirstShotWindow([end],start,{x:20,y:0,z:0},band,policy()),null);
});
