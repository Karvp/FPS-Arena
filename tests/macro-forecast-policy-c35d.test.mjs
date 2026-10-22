import test from 'node:test';import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateFrozenForecastC35D,probabilityC35D,PublicPriorityForecasterC35D} from '../lab/arena/macro-forecast-policy-c35d.mjs';
import {MacroMicroIntegrationC35C} from '../lab/arena/macro-micro-integration-c35c.mjs';
const model=JSON.parse(readFileSync(new URL('../reports/c35d2/FROZEN-FORECAST.json',import.meta.url),'utf8'));
function fake(now){return {pos:{x:2,y:0,z:30},local:{id:'trainee',team:'red',hp:100,armor:50,maxArmor:50,alive:true,mv:{vx:1,vz:1,onGround:true,y:0,stance:0},weapon:{id:'m4a1',magSize:30},ws:{slot:0,guns:[{id:'m4a1',mag:30}]}},remotes:{list:[{id:'bot2',team:'blue',alive:true,pos:{x:3,y:0,z:65},yaw:.3,data:{w:'aa12'},buf:[{t:now-.16,x:3,z:65},{t:now-.065,x:3,z:65}]}]},rig:{yaw:0},map:{bound:150,boxes:[]}};}
test('frozen public-only model validated and exact feature order enforced',()=>{
 assert.equal(validateFrozenForecastC35D(model).transitionHorizonMs,120);
 assert.throws(()=>validateFrozenForecastC35D({...model,featureNames:['futurePriority',...model.featureNames.slice(1)]}),/forecast/);
});
test('frozen score deterministic independent of future label',()=>{
 const f={quietMs:400,priorityFraction500:0,priorityEdges1000:1,aim:1,moving:1};
 const p=probabilityC35D(model,f);assert.ok(p>=0&&p<=1);assert.equal(probabilityC35D(model,{...f,futurePriority:1}),p);
});
test('forecast never overrides current priority command even if history low-risk',()=>{
 const x=new PublicPriorityForecasterC35D(model);
 for(let i=0;i<100;i++)x.observe(i*16.667,{});
 assert.equal(x.observe(1667,{fire:true}).nextPriorityEtaMs,0);
 assert.throws(()=>x.observe(1500,{}),/clock/);
});
test('c35d prediction dispatch preserves research C21/C16 baseline and micro arm audit',()=>{
 const x=new MacroMicroIntegrationC35C({seed:35370011,map:'arena',loadout:'m4a1',lagMs:65,
   matchId:'c35d-m',registrationSHA256:'1'.repeat(64),policy:'predictive80',setupId:'s',forecastModel:model});
 for(let i=0;i<140;i++){const now=2+i/60;x.command(now,fake(now),i%30===0?{fire:true}:{});}
 const data=x.finish(4.4);
 assert.equal(data.metadata.checkpoint,'C35-D2');
 assert.ok(data.c35c.preoffers.length>0);
 assert.ok(data.c35c.preoffers.some(r=>typeof r.predictedPriorityRisk120ms==='number'));
 assert.ok(data.c35c.offers.every(r=>r.policy==='predictive80'));
});
