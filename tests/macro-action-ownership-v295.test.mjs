import test from 'node:test';
import assert from 'node:assert/strict';
import {macroActionOwnership} from '../macro-action-ownership.mjs';
import {normaliseOptions} from '../aim-core.mjs';

const game=()=>({local:{alive:true,hp:100,armor:100,weapon:{cat:'Shotgun'},mv:{x:0,z:0,y:0},ws:{reloading:false,plateT:0}}});
const target={id:'p1',point:{x:45,z:0},visible:false};
const route={x:1,z:0,reason:'pro-rotate'};
const cover={x:-1,z:0,reason:'camera-peek-hide'};
const options={canStep:()=>true,exposureAllowed:()=>true};

test('ownership is opt-in and never silently enabled in the normal profile',()=>{
 assert.equal(normaliseOptions({}).macroOwnershipLab,false);
 assert.equal(normaliseOptions({macroOwnershipLab:true}).macroOwnershipLab,true);
});
test('arbitrates a genuine reversed, safe blind-route versus camera cover conflict',()=>{
 const mem={},g=game();const seen=[];
 const r=macroActionOwnership(g,target,route,cover,1,mem,{...options,onDecision:v=>seen.push(v)});
 assert.equal(r.reason,'macro-owner-approach');
 assert.equal(r.goalId,'p1');assert.ok(seen.some(v=>v.state==='owner-applied'));
 g.local.mv.x=1;
 const next=macroActionOwnership(g,target,route,cover,1.14,mem,options);
 assert.equal(next.reason,'macro-owner-approach');
});
test('immediate preemption for threats, visible targets, recovery and objectives',()=>{
 for(const flag of ['emergency','dodge','ring','recovery','loot','objective','unready','weaponless','visibleShot']){
  const g=game(),mem={};
  macroActionOwnership(g,target,route,cover,1,mem,options);
  const r=macroActionOwnership(g,target,route,cover,1.01,mem,{...options,[flag]:true});
  assert.equal(r,cover,flag);assert.equal(mem.owner,null);
 }
 const g=game();g.local.ws.reloading=true;
 assert.equal(macroActionOwnership(g,target,route,cover,1,{},options),cover);
 assert.equal(macroActionOwnership(game(),{...target,visible:true},route,cover,1,{},options),cover);
});
test('refuses unsafe movement, absent risk proof and non-conflicting reactive directions',()=>{
 assert.equal(macroActionOwnership(game(),target,route,cover,1,{}, {canStep:()=>true}),cover);
 assert.equal(macroActionOwnership(game(),target,route,cover,1,{}, {...options,exposureAllowed:()=>false}),cover);
 assert.equal(macroActionOwnership(game(),target,route,cover,1,{}, {...options,canStep:()=>false}),cover);
 assert.equal(macroActionOwnership(game(),target,route,{...route,reason:'camera-peek-hide'},1,{},options).reason,'camera-peek-hide');
 assert.equal(macroActionOwnership(game(),target,route,{...cover,reason:'pro-hold-sightline'},1,{},options).reason,'pro-hold-sightline');
});
test('stale ownership expires; blocked paths do not resume immediately',()=>{
 const g=game(),mem={};assert.equal(macroActionOwnership(g,target,route,cover,1,mem,options).reason,'macro-owner-approach');
 assert.equal(macroActionOwnership(g,target,route,cover,1.61,mem,options),cover);
 assert.equal(macroActionOwnership(g,target,route,cover,1.7,mem,options),cover);
 assert.equal(macroActionOwnership(g,target,route,cover,2.5,mem,options).reason,'macro-owner-approach');
});
test('switching targets or entering weapon range does not reuse prior ownership',()=>{
 const mem={},g=game();macroActionOwnership(g,target,route,cover,1,mem,options);
 assert.equal(macroActionOwnership(g,{...target,id:'other',point:{x:12,z:0}},route,cover,1.05,mem,options),cover);
 assert.equal(mem.goalId,null);
});

test('non-shotgun combat is unchanged even when experimental profile is enabled',()=>{
 const g=game();g.local.weapon={cat:'SMG'};
 assert.equal(macroActionOwnership(g,target,route,cover,1,{},options),cover);
 g.local.weapon={cat:'AR'};
 assert.equal(macroActionOwnership(g,target,route,cover,1,{},options),cover);
});
