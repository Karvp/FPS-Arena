import test from 'node:test';
import assert from 'node:assert/strict';
import {observeEnemyShot,ammoPressure,collectThreatIntel} from '../threat-intel.mjs';
import {hardCoverBetween,projectedExposure,planTacticalEscapeRoute,planTacticalEscape} from '../tactical-nav.mjs';
import {gridRoute} from '../navigation-core.mjs';
const wall={x0:-2,x1:2,z0:-3,z1:-1,y0:0,y1:2.5};
const noWalls={boxes:[],bound:80};
const start={x:0,z:0,y:0};
const enemy={id:'foe',x:0,z:-16,vx:0,vz:0,aim:true,yaw:0,pressure:1};
const h={rayWorld:(_origin,_direction,_boxes,len)=>len};
test('server does not reveal enemy magazine; zero observed shots is unknown and dangerous',()=>{
 assert.equal(ammoPressure(null,{magSize:30},10).estimate,'unknown');
 assert.equal(ammoPressure(null,{magSize:30},10).pressure,1);
});
test('shot counter tracks observations and never marks enemy as guaranteed empty',()=>{
 const state=new Map(),gun={akm:{magSize:30,interval:.1,reload:2.4}};
 for(let n=0;n<32;n++)observeEnemyShot(state,{id:'foe',w:'akm'},1+n*.1,gun);
 const a=ammoPressure(state.get('foe'),gun.akm,4.3);
 assert.ok(a.pressure>=.77);assert.match(a.estimate,/firing|magazine-may-be-low/);
 const later=ammoPressure(state.get('foe'),gun.akm,9);
 assert.equal(later.pressure,1);
 const reset=observeEnemyShot(state,{id:'foe',w:'akm'},9.01,gun);
 assert.equal(reset.count,1);
});
test('switching observed weapon invalidates magazine shot counts',()=>{
 const s=new Map();observeEnemyShot(s,{id:'a',w:'m4a1'},0,{m4a1:{magSize:32}});
 const b=observeEnemyShot(s,{id:'a',w:'g17'},.2,{g17:{magSize:17}});
 assert.equal(b.count,1);assert.equal(b.weapon,'g17');
});
test('opponent intel has movement velocity and firearm but no fabricated magazine',()=>{
 const game={net:{id:'self'},you:{tm:0},modeState:{type:'tdm'},remotes:{list:[{
  id:'foo',alive:true,team:1,invisible:false,pos:{x:1,y:0,z:-5},yaw:0,
  data:{w:'m4a1',aim:1},buf:[{x:0,z:-5,t:1},{x:1,z:-5,t:1.2}]
 }]},bremotes:{list:[]}};
 const r=collectThreatIntel(game,new Map(),2,{m4a1:{magSize:32}});
 assert.equal(r.length,1);assert.ok(r[0].vx>4.9&&r[0].vx<5.1);
 assert.equal(r[0].pressure,1);assert.equal(r[0].ammo.estimate,'unknown');
});
test('hard cover blocks 2D chest-height exposure, low platform does not',()=>{
 assert.equal(hardCoverBetween({boxes:[wall]},{x:0,z:-8},{x:0,z:0},0),true);
 assert.equal(hardCoverBetween({boxes:[{...wall,y1:.4}]},{x:0,z:-8},{x:0,z:0},0),false);
});
test('moving enemy changes projected exposure and a barrier reduces danger',()=>{
 const e={...enemy,x:7,z:-15,vx:-9,vz:0};
 const open=projectedExposure(noWalls,start,[e],[],1).risk;
 const stopped=projectedExposure({boxes:[wall]},start,[e],[],1).risk;
 assert.ok(open>stopped*2,`${open} ${stopped}`);
});
test('grenade danger is included even without player contacts',()=>{
 const p={kind:'frag',x:1,z:1,stuck:true,fuse:.7};
 const close=projectedExposure(noWalls,start,[],[p],.4).risk;
 const far=projectedExposure(noWalls,{x:20,z:20,y:0},[],[p],.4).risk;
 assert.ok(close>6);assert.equal(far,0);
});
test('tactical route chooses a lower-risk reachable destination behind hard cover',()=>{
 const map={boxes:[wall],bound:80},uncovered=projectedExposure(map,start,[enemy],[],0).risk;
 const route=planTacticalEscapeRoute(map,start,[enemy],[],{speed:7,urgent:true});
 assert.ok(route?.path?.length);
 assert.ok(route.riskEnd<uncovered,`end ${route.riskEnd} start ${uncovered}`);
 assert.ok(route.path.every(p=>Math.abs(p.x)<80&&Math.abs(p.z)<80));
});
test('route does not pretend there is an escape through an enclosing barrier',()=>{
 const boxes=[{x0:-2,x1:-1,z0:-2,z1:2,y0:0,y1:3},{x0:1,x1:2,z0:-2,z1:2,y0:0,y1:3},{x0:-2,x1:2,z0:-2,z1:-1,y0:0,y1:3},{x0:-2,x1:2,z0:1,z1:2,y0:0,y1:3}];
 const q=planTacticalEscapeRoute({boxes,bound:80},start,[enemy],[],{urgent:true});
 assert.equal(q,null);
});
test('tactical dodge cache is time bounded, and rejects unsafe next waypoint',()=>{
 const game={local:{mv:{x:0,y:0,z:0}},map:{boxes:[],bound:80}};
 const memory={};
 const a=planTacticalEscape(game,h,[enemy],[],3,memory,{urgent:true});
 assert.ok(a?.x||a?.z);
 const time=memory.time;
 const b=planTacticalEscape(game,h,[enemy],[],3.1,memory,{urgent:true});
 assert.equal(memory.time,time);assert.equal(b.reason,'threat-aware-route');
 const blocked={rayWorld:(_o,_d,_b,len)=>len*.1};
 assert.equal(planTacticalEscape(game,blocked,[enemy],[],3.15,memory,{urgent:true}),null);
});
test('risk-weighted A* supports the same map and preserves ring speed priority when disabled',()=>{
 const map={boxes:[wall],bound:30};
 const fastest=gridRoute(map,{x:-7,y:0,z:0},{x:7,z:0},{riskWeight:0});
 const tactical=gridRoute(map,{x:-7,y:0,z:0},{x:7,z:0},{riskWeight:.4,threats:[enemy]});
 assert.ok(fastest?.length&&tactical?.length);
 assert.ok(tactical.every(p=>Math.abs(p.x)<30));
});
