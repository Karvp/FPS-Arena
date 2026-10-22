import test from 'node:test';
import assert from 'node:assert/strict';
import {shouldMaintainOccludedPursuit as preserve} from '../camera-tactics.mjs';
const wall={x0:-3,x1:3,y0:0,y1:5,z0:5,z1:6};
const build=()=>({local:{mv:{x:0,y:0,z:0},hp:100,armor:50,ws:{reloading:false,plateT:0,slot:0,guns:[{mag:25}]}},map:{boxes:[wall],bound:80}});
const c={id:'sniper',x:0,y:0,z:52,yaw:0,pitch:0,aim:true};
const target={id:'sniper',visible:false,point:{x:0,y:1.3,z:52}};
const advance={x:0,z:1,reason:'pro-rotate'};
const cover={direction:{x:0,z:-7,reason:'peek-reposition-cover'},phase:'approach'};
test('occluded forward travel defeats unnecessary opposite cover retreat',()=>assert.equal(preserve(build(),[c],target,advance,cover,{now:10}),true));
test('visible target and nearby opponent disable forward override',()=>{
 assert.equal(preserve(build(),[c],{...target,visible:true},advance,cover,{now:10}),false);
 assert.equal(preserve(build(),[{...c,z:8}],target,advance,cover,{now:10}),false);
});
test('uncovered side angle disables forward override',()=>{
 const flank={...c,id:'flank',x:20,z:0};
 assert.equal(preserve(build(),[c,flank],target,advance,cover,{now:10}),false);
});
test('step becoming exposed disables override',()=>{
 const g=build();g.local.mv.z=4.6;
 assert.equal(preserve(g,[c],target,advance,cover,{now:10}),false);
});
test('low health, plating, reloading, missing ammo and recent damage disable override',()=>{
 const g=build();g.local.hp=45;assert.equal(preserve(g,[c],target,advance,cover,{now:10}),false);
 g.local.hp=100;g.local.ws.plateT=.5;assert.equal(preserve(g,[c],target,advance,cover,{now:10}),false);
 g.local.ws.plateT=0;g.local.ws.reloading=true;assert.equal(preserve(g,[c],target,advance,cover,{now:10}),false);
 g.local.ws.reloading=false;g.local.ws.guns[0].mag=0;assert.equal(preserve(g,[c],target,advance,cover,{now:10}),false);
 g.local.ws.guns[0].mag=25;assert.equal(preserve(g,[c],target,advance,cover,{now:10,lastDamage:9}),false);
});
test('other tactical orders never receive this override',()=>{
 assert.equal(preserve(build(),[c],target,{...advance,reason:'pathfinding'},cover,{now:10}),false);
 assert.equal(preserve(build(),[c],target,advance,{direction:{...cover.direction,reason:'camera-peek-hide'}},{now:10}),false);
 assert.equal(preserve(build(),[c],target,advance,{direction:{...cover.direction,z:7}},{now:10}),false);
});
