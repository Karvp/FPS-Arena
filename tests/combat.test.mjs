import test from 'node:test';
import assert from 'node:assert/strict';
import {normaliseOptions,findTarget} from '../aim-core.mjs';
import {remoteVelocity,predictedPoint,targetThreat,lineClear,sightError,shouldTrigger,
  safeDirection,nearCover,planMovement,movementFromWorld,manageResources,grenadeGuide,radarContacts} from '../combat-core.mjs';
const h={player:{headYs:[1.62,1.15,.55],slideHeadY:1.02,slideBodyHeight:.9,bodyH:[1.4,.95,.5]},
  eyeHeightOf:()=>1.6,leanOffset:.35,rayWorld:(_o,_d,_bs,lim)=>lim};
function mock() {
  return {running:true,phase:'match',net:{id:'me'},pos:{x:0,y:0,z:0},map:{boxes:[],bound:50},modeState:{type:'tdm'},
    input:{locked:true,enabled:true},rig:{yaw:0,pitch:0},local:{alive:true,team:'red',hp:100,armor:40,maxArmor:50,plates:2,
      mv:{x:0,y:0,z:0,lean:0},weapon:{id:'rifle',magSize:30,infinite:false,auto:true},
      ws:{slot:0,guns:[{id:'rifle',mag:16,reserve:80},{id:'pistol',mag:8,reserve:32}],finite:true,cd:0,reloading:false,switchT:0,plateT:0,wind:0},
      thr:{id:'frag',n:2}},remotes:{list:[]},bremotes:{list:[]},zremotes:{list:[]}};
}
function enemy(id,x,z,extra={}) {return {id,alive:true,team:1,pos:{x,y:0,z},yaw:0,stance:0,data:{hp:100},...extra};}
test('v2 config enum and range guards prevent invalid config',()=>{
  const a=normaliseOptions({mode:'super',priority:'h4x',radar:'true',trigger:1,radarRange:999,predictionMs:-10});
  assert.equal(a.mode,'assist');assert.equal(a.priority,'crosshair');assert.equal(a.radar,false);
  assert.equal(a.trigger,false);assert.equal(a.radarRange,250);assert.equal(a.predictionMs,0);
});
test('prediction extrapolates buffered velocity but never teleport impulses',()=>{
  const r=enemy('a',0,-10,{buf:[{x:0,y:0,z:-10,t:1},{x:1,y:0,z:-10,t:1.1}]});
  assert.ok(Math.abs(remoteVelocity(r).x-10)<1e-9);
  assert.ok(Math.abs(predictedPoint({x:1,y:1,z:-10},r,.08).x-1.8)<1e-8);
  r.buf[1].x=900;assert.equal(remoteVelocity(r).x,0);
});
test('threat target priority and nearest differ from crosshair',()=>{
  const g=mock();g.remotes.list=[enemy('front',0,-25),enemy('near',3,-8,{data:{aim:1,hp:20}})];
  const base={...normaliseOptions({enabled:true,fov:45,maxDistance:120}),sticky:false};
  assert.equal(findTarget(g,base,h)?.id,'p:front');
  assert.equal(findTarget(g,{...base,priority:'threat'},h)?.id,'p:near');
  assert.equal(findTarget(g,{...base,priority:'nearest'},h)?.id,'p:near');
});
test('predictive targeting tracks moving enemies, never changes actual position',()=>{
  const g=mock(),r=enemy('moving',0,-20,{buf:[{x:-1,y:0,z:-20,t:2},{x:0,y:0,z:-20,t:2.1}]});g.remotes.list=[r];
  const base={...normaliseOptions({enabled:true,fov:30})};
  const old=findTarget(g,base,h);const lead=findTarget(g,{...base,prediction:true,predictionMs:100},h);
  assert.ok(lead.point.x>old.point.x);assert.equal(r.pos.x,0);
});
test('trigger requires valid gun, crosshair, clear LOS and active input',()=>{
  const g=mock(),target={point:{x:0,y:1.6,z:-10},yaw:0,pitch:0};
  assert.equal(sightError(0,0,target),0);
  assert.equal(shouldTrigger(g,target,h),true);
  assert.equal(shouldTrigger(g,{...target,yaw:.1},h),false);
  assert.equal(shouldTrigger(g,target,{...h,rayWorld:()=>2}),false);
  g.local.ws.reloading=true;assert.equal(shouldTrigger(g,target,h),false);
  g.local.ws.reloading=false;g.local.ws.guns[0].mag=0;assert.equal(shouldTrigger(g,target,h),false);
  g.local.ws.guns[0].mag=1;g.input.locked=false;assert.equal(shouldTrigger(g,target,h),false);
});
test('short horizon movement avoids solid cover, outer bound and backwards input',()=>{
  const g=mock();assert.equal(safeDirection(g,1,0,h),true);
  assert.equal(safeDirection(g,1,0,{...h,rayWorld:()=>.4}),false);
  g.local.mv.x=49.7;assert.equal(safeDirection(g,1,0,h),false);
  const input=movementFromWorld({x:1,z:0},0,{fire:true,skill:true,forward:true});
  assert.equal(input.right,true);assert.equal(input.forward,false);assert.equal(input.skill,true);
});
test('planner approaches distant target then strafes near target',()=>{
  const g=mock(),opt=normaliseOptions({engageRange:16});
  const distant=planMovement(g,{point:{x:0,z:-35}},h,opt,2);
  assert.equal(distant.reason,'advance');
  const near=planMovement(g,{point:{x:0,z:-25}},h,opt,2);
  assert.match(near.reason,/strafe/);
  assert.equal(planMovement(g,null,h,opt,2),null);
});
test('peek chooses nearby tall cover and tolerates no cover',()=>{
  const g=mock(),target={point:{x:0,y:1,z:-20}};
  assert.equal(nearCover(g,target,h),null);
  g.map.boxes=[{x0:1,x1:3,z0:-7,z1:-5,y0:0,y1:2,k:'cover'}];
  const cover=nearCover(g,target,h);assert.ok(cover);
  assert.ok(Number.isFinite(cover.x) && Number.isFinite(cover.z));
});
test('reload, slot switch and armor logic preserves manual actions',()=>{
  const g=mock(),o=normaliseOptions({autoReload:true,autoSwitch:true,autoArmor:true});
  g.local.ws.guns[0].mag=4;
  const safe={now:20,memory:{lastDanger:0,lastDamage:0,lastFire:0,risk:{hot:false,nearest:Infinity}}};
  assert.equal(manageResources(g,{fire:false,slot:-1},o,null,h,safe).reload,true);
  g.local.ws.guns[0].mag=0;
  assert.equal(manageResources(g,{fire:false,slot:-1},o,null,h,safe).reload,true); // only after quiet window
  assert.equal(manageResources(g,{fire:false,slot:-1},o,{point:{x:0,y:1.6,z:-5}},h).slot,1); // threat close: switch
  g.local.ws.guns[0].mag=8;g.local.armor=10;
  assert.equal(manageResources(g,{fire:false,slot:-1},o).plate,undefined); // Unknown risk history MUST block auto armor.
  g.local.ws.guns[0].mag=16; // sufficient ammo: only the armor decision remains
  const quiet={now:30,memory:{lastDanger:20,lastDamage:20,lastFire:20,risk:{hot:false,nearest:Infinity}}};
  assert.equal(manageResources(g,{fire:false,slot:-1},o,null,h,quiet).plate,true);
  assert.equal(manageResources(g,{fire:true,slot:-1,skill:true},o).skill,true);
  assert.equal(manageResources(g,{fire:true,slot:-1},o).plate,undefined);
});
test('grenade guidance uses server gravity and speed without modifying throws',()=>{
  const g=mock();
  const target={point:{x:0,y:1.6,z:-18}};
  const result=grenadeGuide(g,target,h,{frag:{speed:31}},25);
  assert.ok(result && result.error<1.5 && result.pitch>=0);
  assert.equal(g.local.thr.n,2);
  assert.equal(grenadeGuide(g,{point:{x:0,y:1,z:-100}},h,{frag:{speed:31}}),null);
});
test('radar respects teams and range and threat ordering',()=>{
  const g=mock();g.remotes.list=[enemy('ally',0,-6,{team:0}),enemy('hostile',0,-20,{data:{aim:1}}),enemy('far',0,-110)];
  const contacts=radarContacts(g,45);
  assert.deepEqual(contacts.map(x=>x.id),['p:hostile']);
  assert.ok(contacts[0].threat>0);
  g.modeState.type='zm';g.zremotes.list=[enemy('z',5,-3)];
  assert.deepEqual(radarContacts(g,45).map(x=>x.id),['z:z']);
});

const {gridRoute}=await import('../navigation-core.mjs');
test('A* static map path goes around wall rather than through it',()=>{
  const g=mock();g.map.bound=18;
  const wall={x0:-1.6,x1:1.6,z0:-13,z1:-2,y0:0,y1:3};
  g.map.boxes=[wall];
  const path=gridRoute(g.map,{x:0,y:0,z:0},{x:0,z:-17});
  assert.ok(path && path.length>3,'path exists');
  assert.ok(path.some(p=>Math.abs(p.x)>2.6),'path routes around the side of the wall');
  assert.ok(path.every(p=>!(p.x>wall.x0&&p.x<wall.x1&&p.z>wall.z0&&p.z<wall.z1)),'no node lies inside solid wall');
  assert.ok(gridRoute(g.map,{x:0,y:0,z:0},{x:0,z:-17},{maxExpanded:2})===null,'bounded path search fails safely');
});
test('A* handles invalid requests and inaccessible destinations',()=>{
  assert.equal(gridRoute(null,{x:0,z:0},{x:0,z:2}),null);
  const map={bound:10,boxes:[{x0:-10,x1:10,z0:-10,z1:10,y0:0,y1:3}]};
  assert.equal(gridRoute(map,{x:0,y:0,z:0},{x:8,z:8}),null);
});
