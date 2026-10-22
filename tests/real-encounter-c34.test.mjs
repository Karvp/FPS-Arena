import test from 'node:test';
import assert from 'node:assert/strict';
import {RealEncounterObserverC34,C34_SCHEMA} from '../lab/arena/real-encounter-observer-c34.mjs';
const build=()=>new RealEncounterObserverC34({seed:34170001,map:'arena',loadout:'m4a1',lagMs:65});
const mock=(t=2,box=true)=>({pos:{x:2,y:0,z:30},local:{team:1,hp:100,armor:50,alive:true,mv:{vx:0.4,vz:0.2}},
 remotes:{list:[{id:'bot2',team:2,alive:true,pos:{x:7,y:0,z:45},yaw:.3,data:{w:'aa12'},buf:[{t:t-.07}]}]},
 map:{boxes:box?[{x0:0,x1:4,y0:0,y1:3,z0:27,z1:28}]:[]}});
const server=()=>({tick:45,map:{boxes:[{}]},players:new Map([['bot2',{id:'bot2',x:8,y:0,z:45.5,yaw:.32,ws:{guns:[{id:'aa12'}],slot:0},alive:true}]])});
const trainee={x:2,y:0,z:30};
test('invalid configuration is rejected',()=>{assert.throws(()=>new RealEncounterObserverC34({seed:1,map:'void',lagMs:65}));assert.throws(()=>new RealEncounterObserverC34({seed:1,map:'arena',lagMs:-1}));});
test('does not return an action override',()=>{const r=build(),id=r.preDecision(2,mock(),{});assert.equal(typeof id,'string');assert.equal(r.windows.length,1);});
test('predecision excludes authoritative world state',()=>{const r=build();r.preDecision(2,mock(),{});assert.equal(r.windows[0].serverAfterDecision,null);assert.equal(JSON.stringify(r.windows[0].public).includes('serverAfterDecision'),false);});
test('public enemy snapshot may lag server truth and is not silently rewritten',()=>{const r=build(),id=r.preDecision(2,mock(),{});r.postDecision(id,server(),trainee,{});assert.equal(r.windows[0].public.enemy.position.x,7);assert.equal(r.windows[0].serverAfterDecision.enemy.position.x,8);});
test('observed static boxes are copied, not referenced',()=>{const r=build(),c=mock();r.preDecision(2,c,{});c.map.boxes[0].x0=42;assert.equal(r.windows[0].public.staticMap.nearbyBoxes[0].x0,0);});
test('server truth attached once only',()=>{const r=build(),id=r.preDecision(2,mock(),{});r.postDecision(id,server(),trainee,{});assert.throws(()=>r.postDecision(id,server(),trainee,{}));});
test('server damage only after opening window and before close',()=>{const r=build(),id=r.preDecision(2,mock(),{});r.postDecision(id,server(),trainee,{});r.serverWeaponHit(1.9,10);r.serverWeaponHit(2.1,7);r.serverWeaponHit(3.8,9);assert.equal(r.windows[0].outcome.hostileDamage,7);assert.equal(r.windows[0].outcome.hostileWeaponHits,1);});
test('nonpositive and nonfinite damage excluded',()=>{const r=build();r.preDecision(2,mock(),{});[0,-1,NaN,Infinity].forEach(x=>r.serverWeaponHit(2.2,x));assert.equal(r.windows[0].outcome.hostileWeaponHits,0);});
test('nonoverlapping grid and maximum record cap',()=>{const r=new RealEncounterObserverC34({seed:1,map:'arena',lagMs:65,period:1.8,horizon:1.8,maxRecords:1});r.preDecision(2,mock(),{});assert.equal(r.preDecision(2.1,mock(),{}),null);assert.equal(r.preDecision(4,mock(4),{}),null);assert.equal(r.windows.length,1);});
test('last window censored at early end without fabricating zero-hit complete label',()=>{const r=build();r.preDecision(2,mock(),{});const x=r.finish(3);assert.equal(x.windows[0].complete,false);assert.equal(x.windows[0].censored,true);});
test('finalized complete window and metadata',()=>{const r=build();r.preDecision(2,mock(),{});const x=r.finish(4);assert.equal(x.schema,C34_SCHEMA);assert.equal(x.metadata.productionActuation,false);assert.equal(x.diagnostics.complete,1);});
test('invalid client state skips without creating synthetic observations',()=>{const r=build();const c=mock();delete c.pos;assert.equal(r.preDecision(2,c,{}),null);assert.equal(r.windows.length,0);assert.equal(r.finish(4).diagnostics.skipped.noLocal,1);});
test('out-of-range local geometry is not included',()=>{const r=build(),c=mock();c.map.boxes.push({x0:100,x1:103,y0:0,y1:4,z0:80,z1:88});r.preDecision(2,c,{});assert.equal(r.windows[0].public.staticMap.count,1);});
