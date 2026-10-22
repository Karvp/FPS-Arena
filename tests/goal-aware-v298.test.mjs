import test from 'node:test';
import assert from 'node:assert/strict';
import {goalSource,goalConflict,validLowYieldEvidence,goalAwareDecision,goalAwareObserve} from '../goal-aware-arbiter.mjs';
import {normaliseOptions} from '../aim-core.mjs';
import {macroOptionReconcile} from '../macro-options-v3.mjs';
const route={x:1,z:0,reason:'pathfinding'},cover={x:-1,z:0,reason:'camera-peek-hide'};
const target={id:'opponent',visible:false,point:{x:38,y:0,z:0}};
const game=()=>({local:{alive:true,mv:{x:0,y:0,z:0},weapon:{cat:'Shotgun'},hp:100,armor:80,ws:{reloading:false,plateT:0}}});
const evidence={time:1,label:'candidate-low-yield',sequence:['APPROACH','TAKE_COVER','APPROACH'],targetId:'opponent',intermediateDurationMs:190,intermediateFireTicks:0,intermediateShotOpportunities:0,intermediateHpLoss:0,intermediateArmorLoss:0,intermediateSelfRangeGainM:0};
const policy={evidence,engageAt:12,canStep:()=>true,exposureAllowed:()=>true};
test('lab feature defaults off and cannot be activated without opt-in',()=>{
 assert.equal(normaliseOptions({}).goalAwareActive,false);
 assert.equal(normaliseOptions({}).goalAwareShadow,false);
 assert.equal(normaliseOptions({goalAwareShadow:true}).goalAwareShadow,true);
});
test('goal attribution distinguishes cover, routes and hard priorities',()=>{
 assert.equal(goalSource('pathfinding'),'PURSUIT');
 assert.equal(goalSource('camera-peek-hide'),'CAMERA_COVER');
 assert.equal(goalSource('br-ring-path'),'PRIORITY');
 assert.equal(goalSource('pro-combat-strafe'),'COMBAT_MOVE');
 assert.equal(goalConflict(route,cover).opposed,true);
 assert.equal(goalConflict(route,{x:0,z:1,reason:'camera-peek-hide'}).opposed,false);
 assert.equal(goalConflict(route,{...cover,reason:'br-ring-path'}),null);
});
test('evidence must be target-matched, recent, zero-benefit and never a damage episode',()=>{
 assert.equal(validLowYieldEvidence(evidence,1.4,'opponent'),true);
 for(const e of [{...evidence,time:-3},{...evidence,targetId:'new'},
  {...evidence,intermediateFireTicks:1},{...evidence,intermediateHpLoss:1},
  {...evidence,intermediateShotOpportunities:2},{...evidence,sequence:['APPROACH','EVADE','APPROACH']},
  {...evidence,intermediateSelfRangeGainM:1.2}])
  assert.equal(validLowYieldEvidence(e,1.4,'opponent'),false);
});
test('shadow preserves the same object reference and records rejected counterfactuals',()=>{
 const m={},events=[],g=game();
 assert.strictEqual(goalAwareDecision(g,target,route,cover,1.4,m,{...policy,onDecision:e=>events.push(e)}),cover);
 assert.ok(events.some(e=>e.state==='goal-proposal'));
 assert.equal(m.conflicts,1);
 goalAwareObserve(target,{fire:false},1.5,m,{shotOpportunity:true,onDecision:e=>events.push(e)});
 assert.ok(events.some(e=>e.state==='goal-unfired-opportunity'&&e.note==='observational-not-counterfactual'));
});
test('active lab can issue one short safe approach for proven low-yield cover loop',()=>{
 const m={},events=[],g=game();
 const o=goalAwareDecision(g,target,route,cover,1.4,m,{...policy,active:true,onDecision:e=>events.push(e)});
 assert.equal(o.reason,'goal-aware-range-route');
 assert.ok(events.some(e=>e.state==='goal-intervention'));
 assert.strictEqual(goalAwareDecision(g,target,route,cover,1.42,m,{...policy,active:true}),cover);
 assert.strictEqual(goalAwareDecision(g,target,route,cover,3,m,{...policy,active:true}),cover);
});
test('emergencies, recovery, objectives, dangerous exposure and available firing override evidence',()=>{
 for(const f of ['emergency','dodge','ring','recovery','loot','objective','unready','weaponless','fire','shotOpportunity'])
  assert.strictEqual(goalAwareDecision(game(),target,route,cover,1.4,{}, {...policy,active:true,[f]:true}),cover,f);
 for(const p of [{canStep:()=>false},{exposureAllowed:()=>false}])
  assert.strictEqual(goalAwareDecision(game(),target,route,cover,1.4,{}, {...policy,...p,active:true}),cover);
 const g=game();g.local.hp=70;
 assert.strictEqual(goalAwareDecision(g,target,route,cover,1.4,{}, {...policy,active:true}),cover);
 g.local.hp=100;g.local.ws.reloading=true;
 assert.strictEqual(goalAwareDecision(g,target,route,cover,1.4,{}, {...policy,active:true}),cover);
 assert.strictEqual(goalAwareDecision(game(),{...target,visible:true},route,cover,1.4,{}, {...policy,active:true}),cover);
});
test('SMG, out-of-range evidence, different target, positive cover outcome never override',()=>{
 const g=game();g.local.weapon.cat='SMG';
 assert.strictEqual(goalAwareDecision(g,target,route,cover,1.4,{}, {...policy,active:true}),cover);
 assert.strictEqual(goalAwareDecision(game(),{...target,id:'other'},route,cover,1.4,{}, {...policy,active:true}),cover);
 assert.strictEqual(goalAwareDecision(game(),target,route,cover,1.4,{}, {...policy,evidence:{...evidence,intermediateFireTicks:3},active:true}),cover);
});
test('transition events attribute source changes without affecting any input',()=>{
 const m={},events=[],g=game(),p={...policy,onDecision:e=>events.push(e)};
 goalAwareDecision(g,target,route,route,1.0,m,p);
 goalAwareDecision(g,target,route,cover,1.2,m,p);
 goalAwareDecision(g,target,route,route,1.3,m,p);
 assert.ok(events.some(e=>e.state==='goal-transition'&&e.from==='PURSUIT'&&e.to==='CAMERA_COVER'));
 assert.ok(events.some(e=>e.state==='goal-transition'&&e.from==='CAMERA_COVER'&&e.to==='PURSUIT'));
});

test('downstream intervention repairs executed-option attribution, not merely proposals',()=>{
 const memory={option:{id:'o1',type:'TAKE_COVER',targetId:'opponent',start:1,startRange:38,lastRange:38,moved:0,selfRangeGain:0,
 fireTicks:0,shotOpportunities:0,newLos:false,hpLoss:0,armorLoss:0},recentOutcomes:[],currentDecision:{executed:'TAKE_COVER'}};
 const events=[];
 assert.equal(macroOptionReconcile(memory,target,{x:1,z:0,reason:'goal-aware-range-route'},1.2,{onDecision:e=>events.push(e)}),true);
 assert.equal(memory.option.type,'APPROACH');
 assert.equal(memory.currentDecision.executed,'APPROACH');
 assert.equal(events.find(e=>e.state==='option-outcome')?.interrupt,'goal-arbiter-executed');
 assert.equal(macroOptionReconcile(memory,target,cover,1.3,{}),false);
});
test('bundled extension actually includes the new arbiter and reconciler (integration guard)',async()=>{
 const fs=await import('node:fs');
 const src=fs.readFileSync(new URL('../page-agent.js',import.meta.url),'utf8');
 assert.ok(src.includes('function goalAwareDecision('));
 assert.ok(src.includes('function goalAwareObserve('));
 assert.ok(src.includes('function macroOptionReconcile('));
});
