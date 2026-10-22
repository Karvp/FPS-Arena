import test from 'node:test';
import assert from 'node:assert/strict';
import {gridRoute,pathRemainingDistance} from '../navigation-core.mjs';
import {multiLevelRoute,walkableSurface,followRoute3D,routeDirectionSafe} from '../multi-level-nav.mjs';
import {projectedExposure} from '../tactical-nav.mjs';
import {alternateWeaponSlot,restoreActionableFire} from '../weapon-input.mjs';
import {autoFireInput} from '../combat-core.mjs';
import {WEAPONS} from '../lab/arena/source/shared/weapons.js';
import {stepMove,newMoveState} from '../lab/arena/source/shared/movement.js';
import oilrig from '../lab/arena/source/maps/oilrig.js';
const blank={fire:false,aim:false,slot:-1,reload:false,plate:false,use:false,interact:false,throw:false};
const H={eyeHeightOf:()=>1.55,leanOffset:.35,rayWorld:(_o,_v,_box,d)=>d};
function armed(id='m4a1'){
 const weapon=WEAPONS[id],ws={slot:0,guns:[{id,mag:weapon.magSize??10,reserve:99},{id:'g17',mag:12,reserve:20}],plateT:0,switchT:0,reloading:false,cd:0,prevFire:false};
 return {running:true,phase:'match',local:{alive:true,weapon,ws,mv:{x:0,y:0,z:0}},map:{bound:220,boxes:[]},pos:{x:0,y:0,z:0},rig:{yaw:0,pitch:0},input:{locked:true},ads:{e:1}};
}
test('multi-floor route climbs real Oil Rig sea-to-deck stairs without teleport or through-floor jumps',()=>{
 const start={x:-18,y:0,z:-45},goal={x:-18,y:8,z:-26};
 const planned=gridRoute(oilrig,start,goal,{maxExpanded:13000});
 assert.ok(planned?.length>10,`route ${JSON.stringify(planned)}`);
 assert.ok(planned.some(p=>p.y>1) && planned.some(p=>p.y>7));
 assert.equal(planned.at(-1).y,8);
 for(let i=0,prev=start;i<planned.length;i++){
   const p=planned[i];assert.ok(walkableSurface(oilrig,p.x,p.z,p.y),`unwalkable waypoint ${i}`);
   assert.ok(p.y-prev.y<=.6+.01,`illegal step ${prev.y} -> ${p.y}`);
   prev=p;
 }
});
test('full authoritative 60 Hz movement can follow Oil Rig sea-to-deck route',()=>{
 const mv=newMoveState(-18,0,-45),game={local:{mv},map:oilrig},goal={x:-18,y:8,z:-26};
 const path=multiLevelRoute(oilrig,mv,goal);
 assert.ok(path?.length);
 let steps=0,top=0;
 while(path.length&&steps++<500){
   const dir=followRoute3D(game,path,null);if(!dir)break;
   assert.ok(routeDirectionSafe(oilrig,mv,dir.waypoint),`unsafe step ${JSON.stringify(dir.waypoint)}`);
   const inp={yaw:Math.atan2(-dir.x,-dir.z),pitch:0,forward:true,backward:false,left:false,right:false,aim:false,fire:false,jump:false,crouch:false,slide:false,prone:false,lean:0,skill:false,use:false};
   stepMove(mv,inp,1/60,1,oilrig);top=Math.max(top,mv.y);
 }
 assert.ok(top>=7.9,`did not climb to 8m, ${JSON.stringify(mv)}`);
 assert.ok(Math.hypot(mv.x-goal.x,mv.z-goal.z)<2.0,`did not reach deck ${JSON.stringify(mv)}`);
});
test('Oil Rig upper deck path cannot flatten 16m goal onto lower deck',()=>{
 const p=gridRoute(oilrig,{x:0,y:8,z:-20},{x:0,y:16,z:0},{maxExpanded:14000});
 assert.ok(p?.some(n=>n.y>14),`missing elevation ${JSON.stringify(p?.at(-1))}`);
 assert.ok(p?.at(-1)?.y===16);
});
test('overhead floor occludes upper shooter to lower target but not a shot along same level',()=>{
 const m={boxes:[{x0:-10,x1:10,z0:-10,z1:10,y0:7.2,y1:8}],bound:30};
 const p={x:0,y:0,z:0},upper={x:4,y:9,z:0,yaw:1.57,aim:true},lower={...upper,y:0};
 assert.ok(projectedExposure(m,p,[upper]).risk<projectedExposure(m,p,[lower]).risk);
});
test('route follower does not skip necessary vertical step before physically climbing it',()=>{
 const path=[{x:.9,y:.5,z:0},{x:1.8,y:1,z:0}];
 const g={local:{mv:{x:0,y:0,z:0}},map:{boxes:[],bound:40}};
 const p=followRoute3D(g,path,null);
 assert.equal(path.length,2);
 assert.equal(p.waypoint.y,.5);
});
test('human alternate weapon key is edge-triggered and rejects missing slots or active plating',()=>{
 const w={slot:0,guns:[{id:'m4a1'},{id:'g17'}],plateT:0,switchT:0};
 assert.equal(alternateWeaponSlot(w),1);
 w.slot=1;assert.equal(alternateWeaponSlot(w),0);
 w.plateT=1;assert.equal(alternateWeaponSlot(w),-1);
 w.plateT=0;w.switchT=.3;assert.equal(alternateWeaponSlot(w),-1);
 w.switchT=0;w.guns[0]={id:'fists'};assert.equal(alternateWeaponSlot(w),-1);
});
test('final fire arbitration restores legitimate hitbox shot after peek suppressed fire',()=>{
 const g=armed(),target={point:{x:0,y:1.55,z:-16},visible:true,hitboxVisible:true,yaw:0,pitch:0};
 const out=restoreActionableFire(g,blank,target,H,{});
 assert.equal(out.fire,true);
 assert.equal(restoreActionableFire(g,{...blank,reload:true},target,H,{}).fire,false);
 assert.equal(restoreActionableFire(g,{...blank,throw:true},target,H,{}).fire,false);
 assert.equal(restoreActionableFire(g,blank,{...target,hitboxVisible:false},H,{}).fire,false);
});
test('visible head hitbox enables scope ready-up even if geometric center is occluded',()=>{
 const g=armed('l115a3');g.ads.e=.25;
 const h={...H,rayWorld:(_o,_v,_b,d)=>d*.6};
 const target={point:{x:0,y:1.55,z:-55},visible:true,hitboxVisible:true,yaw:0,pitch:0};
 const command=restoreActionableFire(g,{...blank,aim:false},target,h,{});
 assert.equal(command.aim,true,'must raise ADS to charge scope');assert.equal(command.fire,false);
 g.ads.e=.9;assert.equal(restoreActionableFire(g,blank,target,h,{}).fire,true);
});
test('longer accurate but physically valid AR shot is not suppressed by short preferred range',()=>{
 const g=armed(),target={point:{x:0,y:1.55,z:-88},visible:true,hitboxVisible:true,yaw:0,pitch:0};
 assert.equal(autoFireInput(g,blank,target,H,{}).fire,true);
 const beyond={...target,point:{...target.point,z:-250}};
 assert.equal(autoFireInput(g,blank,beyond,H,{}).fire,false);
});


test('meaningful navigation progress is measured by remaining arc length, not shuttling',()=>{
 const path=[{x:-3,y:8,z:23},{x:-3,y:8,z:26},{x:0,y:8,z:45}];
 const a=pathRemainingDistance({x:3,y:8,z:23},path);
 const b=pathRemainingDistance({x:-1,y:8,z:23},path);
 assert.ok(b<a-3.9);
 assert.ok(pathRemainingDistance({x:3,y:8,z:23},path)>b+3.9);
 assert.equal(pathRemainingDistance({x:0,y:8,z:0},null),Infinity);
});
