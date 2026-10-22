import test from 'node:test';
import assert from 'node:assert/strict';
import {macroTargetForecast,chooseMacroVantage} from '../macro-vantage.mjs';
import {normaliseOptions} from '../aim-core.mjs';

const target=(a={x:10,z:0,t:1},b={x:11,z:0,t:1.1},point={x:11,y:1.4,z:0})=>({
  id:'player:p',point,remote:{buf:[a,b]},visible:false
});
const box={x0:11,x1:13,y0:0,y1:4,z0:-4,z1:4};
const game=()=>({map:{bound:80,boxes:[box]},local:{alive:true,hp:100,armor:100,mv:{x:0,y:0,z:0},ws:{reloading:false,plateT:0}}});
const targetFar={...target(),point:{x:32,y:1.4,z:0}};
const phase={phase:'approach',distance:32,engageAt:12,weaponClass:'Shotgun',targetId:'player:p'};
const pursuit={x:1,z:0,reason:'pro-rotate'},reactive={x:-1,z:0,reason:'camera-peek-hide'};
const policy={route:(start,goal)=>[{x:4,y:0,z:6},{x:16,y:0,z:6},goal],
 shotClear:()=>true,riskAt:()=>.1,canStep:()=>true};

test('fresh public snapshots produce a damped, bounded target forecast',()=>{
  const r=macroTargetForecast(target(),.7);
  assert.ok(r.confidence>0&&r.displacement>0);
  assert.ok(r.x>11&&r.x<15);
});
test('teleport, excessively rapid motion, malformed buffer or stale snapshot never extrapolate',()=>{
  const fast=target({x:0,z:0,t:1},{x:50,z:0,t:1.1},{x:50,y:1.4,z:0});
  assert.equal(macroTargetForecast(fast,.9).confidence,0);
  const stale=target({x:10,z:0,t:1},{x:11,z:0,t:2});
  assert.equal(macroTargetForecast(stale,.9).confidence,0);
  const invalid=target({x:10,z:0,t:1},{x:11,z:NaN,t:1.1});
  assert.equal(macroTargetForecast(invalid,.9).confidence,0);
  assert.equal(macroTargetForecast({...target(),remote:{buf:[]}},.9).displacement,0);
  assert.equal(macroTargetForecast(null,.9),null);
});
test('old vantage mode is unchanged while temporal mode checks future plus present firing visibility',()=>{
  const g=game(),first=chooseMacroVantage(g,targetFar,phase,pursuit,reactive,1,{},policy);
  assert.equal(first.reason,'macro-vantage-approach');
  const t={...targetFar,remote:{buf:[{x:31,z:0,t:1},{x:32,z:0,t:1.1}]}};
  let shots=0;
  const second=chooseMacroVantage(g,t,phase,pursuit,reactive,1,{}, {...policy,temporal:true,shotClear:()=>{shots++;return true;}});
  assert.equal(second.reason,'macro-vantage-approach');
  assert.ok(shots>0);
});
test('diagnostics contain actionable rejection and planning states',()=>{
  const events=[],p={...policy,onDecision:d=>events.push(d)};
  const mem={};chooseMacroVantage(game(),targetFar,phase,pursuit,reactive,1,mem,p);
  assert.ok(events.some(e=>e.state==='planned'));
  chooseMacroVantage(game(),{...targetFar,visible:true},phase,pursuit,reactive,2,mem,p);
  assert.ok(events.some(e=>e.state==='ineligible'&&e.reason==='target-visible'));
});
test('unopted autopilot behavior retains disabled temporal routing',()=>{
  assert.equal(normaliseOptions({}).macroTemporalLab,false);
  assert.equal(normaliseOptions({macroTemporalLab:true}).macroTemporalLab,true);
  const noTemporal=normaliseOptions({macroVantageLab:true});
  assert.equal(noTemporal.macroVantageLab,true);
  assert.equal(noTemporal.macroTemporalLab,false);
});
