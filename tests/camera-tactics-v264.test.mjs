import test from 'node:test';
import assert from 'node:assert/strict';
import {
  enemyCameraRisk,cameraOccluded,cameraExposure,selectCameraCover,
  selectPeekPoints,peekCycle,planCameraMovement
} from '../camera-tactics.mjs';
import {projectedExposure} from '../tactical-nav.mjs';

const origin={x:0,y:0,z:0};
const enemy={id:'enemy',x:0,y:0,z:14,yaw:0,pitch:0,aim:true,pressure:1};
const boxes=[{x0:-.8,x1:.8,y0:0,y1:4,z0:6,z1:8}];
const map={boxes,bound:55};

test('correct FPS Arena yaw sign: zero aims down -Z; blind side retains nonzero uncertainty',()=>{
 const front=enemyCameraRisk(enemy,origin,0);
 const rear=enemyCameraRisk({...enemy,yaw:Math.PI},origin,0);
 assert.ok(front>rear*3,`front=${front}, rear=${rear}`);
 assert.ok(rear>.1);
});
test('pitch change greatly reduces danger from low target',()=>{
 const center=enemyCameraRisk({...enemy,aim:true,pitch:0},origin,0);
 const above=enemyCameraRisk({...enemy,aim:true,pitch:1.05},origin,0);
 assert.ok(center>above*2,`${center} ${above}`);
});
test('unknown pitch remains dangerous instead of becoming an invisible blind spot',()=>{
 const p=enemyCameraRisk({...enemy,pitch:undefined},origin);
 assert.ok(p>0.45);
});
test('prediction reacts to moving enemy and never presumes bullets exhausted',()=>{
 const e={...enemy,x:15,vx:-10,z:14};
 const open=enemyCameraRisk(e,origin,1);
 const staticEnemy=enemyCameraRisk({...e,vx:0},origin,1);
 assert.ok(Math.abs(open-staticEnemy)>.1);
 assert.ok(enemyCameraRisk({...enemy,pressure:.77},origin)>1);
});
test('hard cover is confirmed by obstacle LOS rather than only camera cone',()=>{
 assert.equal(cameraOccluded(map,{x:0,y:1.5,z:14},{x:0,y:1.3,z:0}),true);
 assert.equal(cameraOccluded({boxes:[],bound:55},{x:0,y:1.5,z:14},{x:0,y:1.3,z:0}),false);
 assert.ok(cameraExposure(map,origin,[enemy]).risk<cameraExposure({boxes:[],bound:55},origin,[enemy]).risk);
});
test('cover selector finds a valid hard-covered position',()=>{
 const c=selectCameraCover(map,{x:0,y:0,z:-1},[enemy]);
 assert.ok(c?.point,'should have hard cover');
 assert.ok(c.blocked>=1);
 assert.ok(c.risk<.1);
});
test('peeking must be collision-free and have an actual line of fire',()=>{
 const p=selectPeekPoints(map,origin,enemy,[enemy]);
 assert.equal(p.length,2);
 assert.deepEqual(new Set(p.map(q=>q.sign)),new Set([-1,1]));
 for(const side of p)assert.equal(cameraOccluded(map,{x:enemy.x,y:1.5,z:enemy.z},{...side.point,y:1.3}),false);
});
test('cycle uses aperiodic sides, varied exposure and occasional long holds',()=>{
 const sides=[{sign:-1,point:{x:-3,z:0}},{sign:1,point:{x:3,z:0}}];
 const s={phase:'retreat',until:0,seed:12345678,cycle:0};
 const signs=[],holds=[],exposures=[];
 let time=0;
 for(let i=0;i<45;i++){
   const a=peekCycle(s,time,sides,{longDelay:true});
   if(a.phase==='hidden')holds.push(a.until-time);
   if(a.phase==='expose'){signs.push(a.selected.sign);exposures.push(a.until-time);}
   time=a.until+.001;
 }
 assert.ok(holds.some(n=>n>=2.3));
 assert.ok(holds.some(n=>n<1.3));
 assert.ok(new Set(holds.map(x=>x.toFixed(2))).size>=4);
 assert.ok(exposures.every(n=>n>=.78 && n<=1.45));
 assert.ok(signs.some((sign,i)=>i>0 && sign===signs[i-1]),'repeating a side is allowed, not forced alternation');
 assert.equal(new Set(signs).size,2);
});
test('reload plans cover even without a selected target',()=>{
 const game={local:{mv:{x:0,y:0,z:-2}},map};
 const mem={};
 const a=planCameraMovement(game,[enemy],null,3,mem,{reloading:true});
 assert.ok(a?.direction && a.holdFire);
 assert.equal(a.phase,'reload');
 assert.match(a.direction.reason,/reload/);
});
test('safe attack cycle is allowed only after finding hard cover and valid peek lanes',()=>{
 const game={local:{mv:{...origin}},map},mem={};
 const target={id:'enemy',point:{x:0,y:1.3,z:14}};
 const a=planCameraMovement(game,[enemy],target,1,mem,{peek:true});
 assert.equal(a?.phase,'approach'===a?.phase?'approach':'hidden'); // either safely approach or begin hiding
 // Open terrain with no cover must not force artificial hiding/delayed shooting.
 const empty={local:{mv:{...origin}},map:{boxes:[],bound:55}};
 assert.equal(planCameraMovement(empty,[enemy],target,1,{}, {peek:true}),null);
});
test('tactical routing uses 3D pitch direction rather than yaw only',()=>{
 const flat={boxes:[],bound:80};
 const face=projectedExposure(flat,origin,[enemy],[],0).risk;
 const high=projectedExposure(flat,origin,[{...enemy,pitch:1.1}],[],0).risk;
 assert.ok(face>high*2,`${face} ${high}`);
});
test('two-sided crossfire refuses a false cover that does not materially protect',()=>{
 const enemies=[enemy,{...enemy,id:'reverse',x:0,z:-16,yaw:Math.PI}];
 const bounded={boxes:[{x0:-.8,x1:.8,y0:0,y1:4,z0:6,z1:8}],bound:18};
 const c=selectCameraCover(bounded,origin,enemies,null,{maxRadius:5});
 if(c)assert.ok(c.risk<c.startRisk*.86);
});
test('a stable cover anchor preserves a long hidden interval across tactical replanning',()=>{
 const game={local:{mv:{...origin}},map};
 const target={id:'enemy',point:{x:0,y:1.3,z:14}};
 const mem={};
 const a=planCameraMovement(game,[enemy],target,10,mem,{peek:true});
 assert.ok(a?.cover);
 mem.cycleState={phase:'hidden',until:15,cycle:4,seed:77,lastSide:-1};
 const b=planCameraMovement(game,[enemy],target,11.3,mem,{peek:true});
 assert.equal(mem.cycleState.until,15);
 assert.equal(b.phase,'hidden');
});
test('peek retreat is requested shortly after shooting from a reached angle',()=>{
 const game={local:{mv:{...origin}},map};
 const target={id:'enemy',point:{x:0,y:1.3,z:14}};
 const mem={};
 planCameraMovement(game,[enemy],target,1,mem,{peek:true});
 mem.cycleState={phase:'expose',until:3,seed:2345,cycle:1,
   selected:selectPeekPoints(map,origin,enemy,[enemy])[0],
   lastSide:-1,exposureStarted:null};
 game.local.mv={...mem.cycleState.selected.point};
 const p=planCameraMovement(game,[enemy],target,1.15,mem,{peek:true,hasShot:true});
 assert.equal(p.phase,'expose');
 const b=planCameraMovement(game,[enemy],target,1.22,mem,{peek:true,hasShot:true});
 assert.equal(b.phase,'retreat');
 assert.equal(b.holdFire,true);
});
