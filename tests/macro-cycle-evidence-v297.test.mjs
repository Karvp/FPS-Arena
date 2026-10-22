import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyOptionCycle,macroOptionDecision,macroOptionObserve,macroOptionEnd} from '../macro-options-v3.mjs';
const a={id:'o1',type:'APPROACH',targetId:'enemy',start:1,end:1.25,movedM:1,selfRangeGainM:.4,fireTicks:0,shotOpportunities:0,newLos:false,hpLoss:0,armorLoss:0};
const b={...a,id:'o2',type:'REPOSITION',start:1.25,end:1.55,movedM:.1,selfRangeGainM:0};
const c={id:'o3',type:'APPROACH',targetId:'enemy',time:1.8};
test('same target rapid ABA classifies evidence but does not claim useless actions',()=>{
  const r=classifyOptionCycle(a,b,c);assert.equal(r?.label,'candidate-low-yield');
  assert.equal(r?.elapsedMs,800);assert.deepEqual(r?.sequence,['APPROACH','REPOSITION','APPROACH']);
});
test('different target, window expiry, monotone action, or reversed time never yields a cycle',()=>{
  for(const next of [{...c,targetId:'new'}, {...c,time:3.0},{...c,type:'HOLD'}, {...c,time:1.4}]){
    assert.equal(classifyOptionCycle(a,b,next),null);
  }
  assert.equal(classifyOptionCycle({...a,targetId:''},b,c),null);
});
test('safety interruptions are not labeled low-yield even if no shots or movement',()=>{
  for(const type of ['EVADE','RING_ESCAPE','RECOVER','OBJECTIVE'])
    assert.equal(classifyOptionCycle(a,{...b,type},c)?.label,'protected-interrupt');
});
test('engagement and LOS evidence outrank zero movement',()=>{
  assert.equal(classifyOptionCycle(a,{...b,fireTicks:2},c)?.label,'combat-contact');
  assert.equal(classifyOptionCycle(a,{...b,shotOpportunities:1},c)?.label,'combat-contact');
  assert.equal(classifyOptionCycle(a,{...b,newLos:true},c)?.label,'visibility-gain');
  assert.equal(classifyOptionCycle(a,{...b,selfRangeGainM:1.1},c)?.label,'self-range-progress');
});
test('damage makes low-yield episode uncertain; very short episodes are not judged',()=>{
  assert.equal(classifyOptionCycle(a,{...b,hpLoss:15},c)?.label,'unresolved');
  assert.equal(classifyOptionCycle(a,{...b,start:1.54},c)?.label,'too-brief');
});
test('transition lifecycle emits an evidence-labeled cycle with correct target and stable shadow reference',()=>{
  const memory={},events=[];const emit=e=>events.push(e);
  const game={local:{alive:true,hp:100,armor:75,weapon:{cat:'Shotgun'},ws:{},mv:{x:0,z:0,y:0}}};
  const target={id:'enemy',visible:false,point:{x:40,z:0,y:0}};
  const cover={x:-1,z:0,reason:'camera-peek-hide'};
  const approach={x:1,z:0,reason:'pro-rotate'};
  const policy={onDecision:emit,engageAt:12,canStep:()=>true,exposureAllowed:()=>true};
  // APP -> COVER -> APP in shadow. Change eligibility with a temporary emergency.
  const baseline={x:1,z:0,reason:'pro-rotate'};
  assert.strictEqual(macroOptionDecision(game,target,approach,baseline,1,memory,policy),baseline);
  macroOptionObserve(game,target,{fire:false},1.1,memory,policy);
  assert.strictEqual(macroOptionDecision(game,target,approach,cover,1.2,memory,policy),cover);
  macroOptionObserve(game,target,{fire:false},1.25,memory,policy);
  assert.strictEqual(macroOptionDecision(game,target,approach,baseline,1.4,memory,policy),baseline);
  assert.equal(events.filter(e=>e.state==='option-cycle-evidence').length,1);
  assert.equal(events.find(e=>e.state==='option-cycle-evidence').label,'candidate-low-yield');
});
test('HP and armor losses are outcome measurements and cannot change movement in shadow',()=>{
  const mem={},events=[],game={local:{alive:true,hp:100,armor:50,weapon:{cat:'Shotgun'},ws:{},mv:{x:0,z:0,y:0}}};
  const target={id:'e',visible:false,point:{x:40,z:0,y:0}};
  const direction={x:-1,z:0,reason:'camera-peek-hide'};
  const policy={onDecision:e=>events.push(e),canStep:()=>true,exposureAllowed:()=>true};
  const result=macroOptionDecision(game,target,{x:1,z:0,reason:'pro-rotate'},direction,1,mem,policy);
  assert.strictEqual(result,direction);
  macroOptionObserve(game,target,{fire:false},1.02,mem,policy);
  game.local.hp=84;game.local.armor=38;
  macroOptionObserve(game,target,{fire:false},1.03,mem,policy);
  macroOptionEnd(mem,1.05,policy);
  const o=events.find(e=>e.state==='option-outcome');
  assert.equal(o.hpLoss,16);assert.equal(o.armorLoss,12);
  assert.ok(o.proxyValue<0);
});
