import test from 'node:test';
import assert from 'node:assert/strict';
import {macroVantageCandidates,chooseMacroVantage} from '../macro-vantage.mjs';
import {cameraOccluded} from '../camera-tactics.mjs';
import {normaliseOptions} from '../aim-core.mjs';
import {gridRoute} from '../navigation-core.mjs';
const box={x0:11,x1:13,y0:0,y1:4,z0:-4,z1:4};
const game=()=>({map:{bound:80,boxes:[box]},local:{alive:true,hp:100,armor:100,mv:{x:0,y:0,z:0},ws:{reloading:false,plateT:0}}});
const target={id:'enemy',visible:false,point:{x:32,y:1.4,z:0}};
const phase={phase:'approach',distance:32,engageAt:12,weaponClass:'Shotgun',targetId:'enemy'};
const pursuit={x:1,z:0,reason:'pro-rotate'},reactive={x:-1,z:0,reason:'camera-peek-hide'};
const policy={route:(start,goal)=>[{x:4,y:0,z:6},{x:16,y:0,z:6},goal],
  shotClear:(eye,other)=>!cameraOccluded(game().map,eye,other),riskAt:()=>.2,
  canStep:()=>true};
test('candidate points are reachable-looking and have a real shot to the target',()=>{
 const result=macroVantageCandidates(game().map,game().local.mv,target.point,12,policy);
 assert.ok(result.length>0);
 assert.ok(result.every(c=>policy.shotClear({x:c.point.x,y:1.45,z:c.point.z},target.point)));
 assert.ok(result.every(c=>Math.abs(c.point.x)<80));
});
test('integration uses actual A* and 3-D LOS to find a shootable route around a wall',()=>{
 const g=game(),p={...policy,
   route:(start,goal)=>gridRoute(g.map,start,goal,{maxExpanded:450,riskWeight:0})};
 const r=chooseMacroVantage(g,target,phase,pursuit,reactive,1,{},p);
 assert.equal(r.reason,'macro-vantage-approach');
 assert.ok(r.goal.x>0);
 assert.equal(cameraOccluded(g.map,{x:r.goal.x,y:1.45,z:r.goal.z},target.point),false);
});
test('planner aims for a shootable goal and follows its waypoint without recomputing',()=>{
 let calls=0,m={};const p={...policy,route:(a,b)=>{calls++;return policy.route(a,b)}};
 const first=chooseMacroVantage(game(),target,phase,pursuit,reactive,1,m,p);
 assert.equal(first.reason,'macro-vantage-approach');assert.ok(first.goal);assert.ok(calls>=1&&calls<=2);
 const searched=calls;const second=chooseMacroVantage(game(),target,phase,pursuit,reactive,1.15,m,p);
 assert.equal(second.reason,'macro-vantage-approach');assert.equal(calls,searched);
});
test('no route is negatively cached, never forces a wall-crossing',()=>{
 let calls=0,m={};const p={...policy,route:()=>{calls++;return null}};
 assert.equal(chooseMacroVantage(game(),target,phase,pursuit,reactive,1,m,p),reactive);
 assert.equal(chooseMacroVantage(game(),target,phase,pursuit,reactive,1.3,m,p),reactive);
 assert.equal(calls,2);
});
test('a hidden target must have a real shot from the future destination',()=>{
 const p={...policy,shotClear:()=>false};
 assert.equal(chooseMacroVantage(game(),target,phase,pursuit,reactive,1,{},p),reactive);
});
test('never overrides visible engagement, reload, emergencies, or objective routing',()=>{
 for(const k of ['emergency','dodge','recovery','ring','objective','loot'])
   assert.equal(chooseMacroVantage(game(),target,phase,pursuit,reactive,1,{}, {...policy,[k]:true}),reactive,k);
 assert.equal(chooseMacroVantage(game(),{...target,visible:true},phase,pursuit,reactive,1,{},policy),reactive);
 const g=game();g.local.ws.reloading=true;
 assert.equal(chooseMacroVantage(g,target,phase,pursuit,reactive,1,{},policy),reactive);
});
test('bundled code includes planner but release is opt-out',async()=>{
 assert.equal(normaliseOptions({}).macroVantageLab,false);
 assert.equal(normaliseOptions({macroVantageLab:true}).macroVantageLab,true);
 const {readFileSync}=await import('node:fs');
 const code=readFileSync(new URL('../page-agent.js',import.meta.url),'utf8');
 assert.match(code,/function chooseMacroVantage\(/);
 assert.match(code,/macro-vantage-approach/);
});
