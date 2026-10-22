import test from 'node:test';
import assert from 'node:assert/strict';
import {tacticalWeaponBand,tacticalTargetForecast,tacticalPriority,tacticalRouteRisk,
 tacticalUtility,tacticalCandidates,tacticalDirectorDecision} from '../tactical-director.mjs';
import {normaliseOptions} from '../aim-core.mjs';
import {readFileSync} from 'node:fs';
const g=(cat='Shotgun')=>({local:{alive:true,mv:{x:0,y:0,z:0},hp:100,armor:80,
 weapon:{cat},ws:{reloading:false,plateT:0}}});
const enemy=(point={x:34,y:0,z:0})=>({id:'e1',visible:false,point});
const input={x:-1,z:0,reason:'camera-peek-hide'};
const routeInput={x:1,z:0,reason:'pathfinding'};
const path=(start,finish)=>[{
 x:start.x+(finish.x-start.x)*.4,y:finish.y,z:start.z+(finish.z-start.z)*.4},finish];
const p=()=>({route:path,canStep:()=>true,riskAt:()=>0,
 shotClear:()=>true,walkable:()=>true});
test('feature flags default off and are explicitly normalized',()=>{
 assert.equal(normaliseOptions({}).tacticalDirectorShadow,false);
 assert.equal(normaliseOptions({}).tacticalDirectorActive,false);
 assert.equal(normaliseOptions({tacticalDirectorShadow:true,tacticalDirectorActive:true}).tacticalDirectorActive,true);
});
test('weapon ranges encode distinct engagement bands',()=>{
 assert.ok(tacticalWeaponBand({cat:'SMG'}).ideal>tacticalWeaponBand({cat:'Shotgun'}).ideal);
 assert.ok(tacticalWeaponBand({cat:'Sniper'}).ideal>tacticalWeaponBand({cat:'SMG'}).ideal);
});
test('bounded forecast rejects teleports, stale histories, invalid samples',()=>{
 const t=enemy(); t.remote={buf:[{t:2,x:33,z:0},{t:2.1,x:33.5,z:0}]};
 const f=tacticalTargetForecast(t,100);
 assert.ok(f.displacement>0&&f.displacement<4&&f.uncertainty>0);
 const bad=enemy();bad.remote={buf:[{t:2,x:0,z:0},{t:2.1,x:99,z:0}]};
 assert.equal(tacticalTargetForecast(bad,2).displacement,0);
});
test('strict priority shield prevents planning during all emergencies and objectives',()=>{
 const G=g();for(const key of ['emergency','dodge','ring','objective','loot','recovery','shotOpportunity','fire'])
  assert.ok(tacticalPriority(G,{[key]:true,now:2}),key);
 G.local.ws.reloading=true;assert.equal(tacticalPriority(G,{now:2}),'recovery');
});
test('safety shield retains original reference including under active mode',()=>{
 for(const key of ['emergency','ring','recovery','objective','dodge','shotOpportunity'])
  assert.strictEqual(tacticalDirectorDecision(g(),enemy(),input,2,{}, {...p(),active:true,[key]:true}),input,key);
});
test('shadow mode never edits original movement and still logs a plan',()=>{
 const events=[],memory={};const result=tacticalDirectorDecision(g(),enemy(),input,2,memory,{...p(),
 onDecision:e=>events.push(e)});
 assert.strictEqual(result,input);
 assert.ok(events.some(e=>e.state==='director-planned')||events.some(e=>e.state==='director-veto'));
});
test('cannot plan through occluded firing lane',()=>{
 assert.equal(tacticalCandidates(g(),enemy(),{...p(),shotClear:()=>false}).length,0);
});
test('no invented planar cross-floor attack route',()=>{
 assert.deepEqual(tacticalCandidates(g(),enemy({x:30,y:11,z:0}),p()),[]);
});
test('risky path rejects shelter endpoint reached via exposed route',()=>{
 assert.equal(tacticalCandidates(g(),enemy(),{...p(),riskAt:()=>12}).length,0);
});
test('risk sampler rejects non-finite ray penalty without unsafe coercion',()=>{
 assert.equal(tacticalRouteRisk([{x:2,z:0}],{x:0,z:0},{riskAt:()=>NaN}),null);
});
test('route search bounded to <=3 calls',()=>{
 let calls=0;const opts=tacticalCandidates(g(),enemy(),{...p(),route:(...args)=>{calls++;return path(...args);}});
 assert.ok(calls<=3);assert.ok(opts.length<=3);
});
test('blocked step rejects dangerous movement',()=>{
 assert.equal(tacticalCandidates(g(),enemy(),{...p(),canStep:()=>false}).length,0);
});
test('utility always prefers feasible faster, safer firing option',()=>{
 const base={type:'APPROACH',travel:15,risk:0,progress:20,rangeError:0,
 uncertainty:1,shootable:true,timeToFire:2,confidence:.8};
 const context={speed:7,currentType:'APPROACH'};
 assert.ok(tacticalUtility(base,context)>tacticalUtility({...base,risk:4,timeToFire:9},context));
 assert.equal(tacticalUtility({...base,risk:NaN},context),-Infinity);
});
test('active option routes to visible firing vantage, does not control aim or fire',()=>{
 const G=g(),m={},s={...routeInput,fire:false,aim:true};
 const o=tacticalDirectorDecision(G,enemy(),s,2,m,{...p(),active:true,threshold:-20});
 assert.ok(o.reason.startsWith('director-'));assert.equal(s.fire,false);assert.equal(s.aim,true);
 const again=tacticalDirectorDecision(G,enemy(),s,2.1,m,{...p(),active:true,threshold:-20});
 assert.ok(again.reason.startsWith('director-'));
});
test('target change and damage terminate owned plan immediately',()=>{
 const m={},G=g(),P={...p(),active:true,threshold:-20};
 tacticalDirectorDecision(G,enemy(),routeInput,2,m,P);assert.ok(m.plan);
 assert.strictEqual(tacticalDirectorDecision(G,enemy({x:45,y:0,z:0}),input,2.2,m,{...P,emergency:true}),input);
 assert.equal(m.plan,null);
 tacticalDirectorDecision(G,enemy(),routeInput,4,m,P);
 assert.strictEqual(tacticalDirectorDecision(G,{...enemy(),id:'e2'},input,4.25,m,{...P,shotOpportunity:true}),input);
});
test('invalid geometry fails safely without exceptions',()=>{
 const o=tacticalDirectorDecision(g(),{id:'x',point:{x:NaN,z:2}},input,1,{}, {...p(),active:true});
 assert.strictEqual(o,input);
 assert.deepEqual(tacticalCandidates(g(),enemy(),{...p(),route:()=>null}),[]);
});
test('built page-agent must include director integration and profile guard',()=>{
 const src=readFileSync(new URL('../page-agent.js',import.meta.url),'utf8');
 assert.ok(src.includes('function tacticalDirectorDecision('));
 assert.ok(src.includes("globalThis.__FPSARENA_HEADLESS_LAB__===true"));
});

test('cover is protected without proven low-yield evidence, even when active',()=>{
 const m={},events=[];
 assert.strictEqual(tacticalDirectorDecision(g(),enemy(),input,2,m,{...p(),active:true,onDecision:e=>events.push(e)}),input);
 assert.ok(events.some(e=>e.reason==='protected-action-without-evidence'));
});

test('conservative policy rejects movement actuation until same-target evidence exists',()=>{
 const out=tacticalDirectorDecision(g(),enemy(),routeInput,2,{}, {...p(),active:true,conservative:true});
 assert.strictEqual(out,routeInput);
});
test('elevated destination requires verified surface and a real path',()=>{
 const T=enemy({x:32,y:9,z:0});
 assert.deepEqual(tacticalCandidates(g(),T,{...p(),allowVertical:true,verticalSurface:()=>null}),[]);
 const candidates=tacticalCandidates(g(),T,{...p(),allowVertical:true,
   verticalSurface:()=>8,route:(start,goal)=>[{x:start.x+5,y:0,z:0},{...goal}]} );
 assert.ok(candidates.every(c=>c.goal.y===8));
});
test('bounded fuzz: invalid or rapidly moving target never bypasses emergency shield',()=>{
 let z=12345;const next=()=>{z=(Math.imul(z,1664525)+1013904223)>>>0;return z/2**32;};
 for(let i=0;i<200;i++){
  const G=g(['Shotgun','SMG','AR','Sniper'][Math.floor(next()*4)]),P=p();
  const target={id:'t'+Math.floor(next()*5),visible:next()<.5,
   point:{x:(next()-.5)*160,y:0,z:(next()-.5)*160}};
  const original={x:next()-.5,z:next()-.5,reason:'pathfinding'};
  const out=tacticalDirectorDecision(G,target,original,i*.017,{}, {...P,active:true,emergency:true});
  assert.strictEqual(out,original);
  const choices=tacticalCandidates(G,target,P);
  assert.ok(choices.length<=3);
  for(const c of choices)assert.ok(Number.isFinite(tacticalUtility(c,{speed:7,currentType:'HOLD'})));
 }
});
test('outcome reports are explicitly observational when the director is in shadow mode',()=>{
 const M={},events=[],P={...p(),onDecision:e=>events.push(e)};
 tacticalDirectorDecision(g(),enemy(),routeInput,2,M,P);
 tacticalDirectorDecision(g(),enemy(),routeInput,3.7,M,{...P,emergency:true});
 const e=events.find(e=>e.state==='director-outcome');
 assert.ok(e);assert.equal(e.executed,false);assert.equal(e.observationalOnly,true);
});
