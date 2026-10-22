import test from 'node:test';
import assert from 'node:assert/strict';
import {shouldFollowOccludedRoute,exposureAwareStrafe} from '../tactical-nav.mjs';
import {normaliseOptions} from '../aim-core.mjs';
import {readFileSync} from 'node:fs';
const root=new URL('../',import.meta.url);
const open={map:{boxes:[],bound:100},local:{alive:true,hp:100,armor:50,mv:{x:0,y:0,z:0}}};
const target={id:'enemy',visible:false,point:{x:0,y:1.62,z:35}};
const route={x:0,z:-12,reason:'pathfinding'};
const memo={lastDamage:0};
test('TDM safe occluded pursuit can advance when health and exposure permit',()=>{
 assert.equal(shouldFollowOccludedRoute(open,target,route,[],memo,10),true);
});
test('occluded route never supplants an acquired visible shot or a non-route tactic',()=>{
 assert.equal(shouldFollowOccludedRoute(open,{...target,visible:true},route,[],memo,10),false);
 assert.equal(shouldFollowOccludedRoute(open,target,{...route,reason:'br-ring-path'},[],memo,10),false);
});
test('damage, missing armor, low health, and close contact stop exposure-optimized pursuit',()=>{
 assert.equal(shouldFollowOccludedRoute(open,target,route,[],{lastDamage:9.1},10),false);
 assert.equal(shouldFollowOccludedRoute({...open,local:{...open.local,hp:63}},target,route,[],memo,10),false);
 assert.equal(shouldFollowOccludedRoute({...open,local:{...open.local,armor:6}},target,route,[],memo,10),false);
 assert.equal(shouldFollowOccludedRoute(open,target,route,[{x:5,z:0,aim:false}],memo,10),false);
});
test('ADS attacker inside 68m blocks route commitment even when path appears geometrically safe',()=>{
 assert.equal(shouldFollowOccludedRoute(open,target,route,[{x:45,z:0,yaw:0,pitch:0,aim:true}],memo,10),false);
});
test('safe-pursuit requires map geometry; no invented routes with incomplete coordinates',()=>{
 assert.equal(shouldFollowOccludedRoute({...open,map:null},target,route,[],memo,10),false);
 assert.equal(shouldFollowOccludedRoute(open,target,{...route,x:0,z:0},[],memo,10),false);
});
test('ADS-aware strafe does not flip without evidence or a valid covering obstacle',()=>{
 const visible={...target,visible:true};
 const move={x:0,z:-1,reason:'pro-combat-strafe'};
 assert.deepEqual(exposureAwareStrafe(open,visible,move,[{x:30,z:0,aim:false}],10,{},()=>true),move);
 assert.deepEqual(exposureAwareStrafe(open,visible,move,[{x:30,z:0,aim:true}],10,{},()=>true),move);
 assert.deepEqual(exposureAwareStrafe(open,visible,move,[{x:30,z:0,aim:true}],10,{},()=>false),move);
});
test('routing toggle defaults enabled in extension while simulator can explicitly disable it',()=>{
 assert.equal(normaliseOptions({enabled:true,mode:'autopilot'}).routeCommitment,true);
 assert.equal(normaliseOptions({enabled:true,mode:'autopilot',routeCommitment:false}).routeCommitment,false);
 const agent=readFileSync(new URL('../page-agent.js',import.meta.url),'utf8');
 assert.match(agent,/game\.modeState\?\.type==='tdm'/);
 assert.match(agent,/shouldFollowOccludedRoute/);
 assert.match(readFileSync(new URL('../popup.html',import.meta.url),'utf8'),/id="routeCommitment"/);
});
