import test from 'node:test';
import assert from 'node:assert/strict';
import {macroOptionDecision,macroOptionObserve,macroOptionEnd} from '../macro-options-v3.mjs';
import {normaliseOptions} from '../aim-core.mjs';
const target={id:'enemy-1',visible:false,point:{x:40,y:1.5,z:0}};
const pursuit={x:1,z:0,reason:'pro-rotate'},cover={x:-1,z:0,reason:'camera-peek-hide'};
const game=()=>({local:{alive:true,hp:100,armor:100,weapon:{cat:'Shotgun'},ws:{reloading:false,plateT:0},mv:{x:0,y:0,z:0}}});
const opts={canStep:()=>true,exposureAllowed:()=>true,engageAt:12};
test('both new research profiles are disabled in the regular extension',()=>{
 assert.equal(normaliseOptions({}).macroOptionsShadow,false);
 assert.equal(normaliseOptions({}).macroOptionsActive,false);
 assert.equal(normaliseOptions({macroOptionsShadow:true}).macroOptionsShadow,true);
});
test('shadow option planning never modifies movement object or input controls',()=>{
 const m={},seen=[],g=game();const p={...opts,onDecision:x=>seen.push(x)};
 assert.strictEqual(macroOptionDecision(g,target,pursuit,cover,1,m,p),cover);
 assert.ok(seen.some(e=>e.state==='option-proposal'&&e.proposed==='APPROACH'&&e.executed==='TAKE_COVER'));
 macroOptionObserve(g,target,{fire:false},1.1,m,p);
 macroOptionEnd(m,1.3,p);
 assert.ok(seen.some(e=>e.state==='option-outcome'&&e.fireTicks===0&&e.durationMs>=299));
});
test('active option advances only along proven safe route when genuinely opposed',()=>{
 const g=game(),m={},seen=[];
 const d=macroOptionDecision(g,target,pursuit,cover,1,m,{...opts,active:true,onDecision:e=>seen.push(e)});
 assert.equal(d.reason,'macro-option-approach');assert.notStrictEqual(d,pursuit);
 assert.equal(m.option.type,'APPROACH');
 g.local.mv.x=.8;
 macroOptionObserve(g,target,{fire:true},1.1,m,{...opts,onDecision:e=>seen.push(e)});
 macroOptionDecision(g,{...target,visible:true},pursuit,cover,1.2,m,{...opts,active:true,onDecision:e=>seen.push(e)});
 assert.ok(seen.some(e=>e.state==='option-outcome'&&e.fireTicks===1&&e.rangeGainM>.5));
});
test('hard interrupts immediately invalidate option, regardless of progress',()=>{
 for(const f of ['emergency','dodge','ring','recovery','loot','objective','unready','weaponless','fire','shotOpportunity']){
  const m={},g=game();macroOptionDecision(g,target,pursuit,cover,1,m,{...opts,active:true});
  const r=macroOptionDecision(g,target,pursuit,cover,1.02,m,{...opts,active:true,[f]:true});
  assert.strictEqual(r,cover,f);
  assert.notEqual(m.option.type,'APPROACH',f);
 }
 const g=game();g.local.ws.reloading=true;
 assert.strictEqual(macroOptionDecision(g,target,pursuit,cover,1,{}, {...opts,active:true}),cover);
});
test('rejects invalid positions, absent safety proof, obstruction and exposure',()=>{
 const g=game();
 for(const p of [{...opts,canStep:undefined},{...opts,canStep:()=>false},{...opts,exposureAllowed:()=>false}])
  assert.strictEqual(macroOptionDecision(g,target,pursuit,cover,1,{}, {...p,active:true}),cover);
 assert.strictEqual(macroOptionDecision(g,{...target,point:{x:Infinity,z:0}},pursuit,cover,1,{}, {...opts,active:true}),cover);
 const neutral={x:0,z:1,reason:'camera-peek-hide'};
 assert.strictEqual(macroOptionDecision(g,target,pursuit,neutral,1,{}, {...opts,active:true}),neutral);
});
test('progress watchdog stops stalled approach, then permits retry after cooldown',()=>{
 const m={},g=game();
 const p={...opts,active:true};
 assert.equal(macroOptionDecision(g,target,pursuit,cover,1,m,p).reason,'macro-option-approach');
 assert.strictEqual(macroOptionDecision(g,target,pursuit,cover,1.75,m,p),cover);
 assert.strictEqual(macroOptionDecision(g,target,pursuit,cover,2.0,m,p),cover);
 assert.equal(macroOptionDecision(g,target,pursuit,cover,2.7,m,p).reason,'macro-option-approach');
});
test('SMG, AR, sniper and priority movement are never commandeered',()=>{
 for(const cat of ['SMG','AR','Sniper']){
  const g=game();g.local.weapon.cat=cat;
  assert.strictEqual(macroOptionDecision(g,target,pursuit,cover,1,{}, {...opts,active:true}),cover);
 }
 const g=game();g.local.hp=34;
 assert.strictEqual(macroOptionDecision(g,target,pursuit,cover,1,{}, {...opts,active:true}),cover);
});

test('self-range gain excludes target motion toward a stationary player',()=>{
 const g=game(),m={},seen=[],p={...opts,onDecision:e=>seen.push(e)};
 macroOptionDecision(g,target,pursuit,cover,1,m,p);
 macroOptionObserve(g,target,{fire:false},1.1,m,p);
 macroOptionObserve(g,{...target,point:{x:30,y:1.5,z:0}},{fire:false},1.2,m,p);
 macroOptionEnd(m,1.3,p);
 const o=seen.find(e=>e.state==='option-outcome');
 assert.ok(o.rangeGainM>=9.9);
 assert.equal(o.selfRangeGainM,0);
});
