import test from 'node:test';
import assert from 'node:assert/strict';
import {RiskAwareRandomizerC22,pressureBandC22} from '../lab/arena/risk-aware-encounters-c22.mjs';
import {assignedActionC21,C21_ACTIONS} from '../lab/arena/encounter-randomization-c21.mjs';
import {validateC22,evaluateC22} from '../lab/arena/evaluate-risk-aware-c22.mjs';
const mkClient=()=>({pos:{x:0,y:0,z:0},map:{bound:68,boxes:[]},rig:{yaw:0},
 local:{team:'red',alive:true,hp:100,armor:50,maxArmor:100,weapon:{magSize:30},ws:{slot:0,guns:[{id:'mp5sd',mag:20}]},
  mv:{x:0,y:0,z:0,onGround:true,stance:0}},
 remotes:{list:[{id:'enemy',team:'blue',alive:true,pos:{x:40,z:0},buf:[{t:.9,x:39.8,z:0},{t:1,x:40,z:0}]}]}});
const fresh=(c,t)=>{c.remotes.list[0].buf=[{t:t-.15,x:39.8,z:0},{t:t-.04,x:40,z:0}];};
const mk=(seed=22022000)=>new RiskAwareRandomizerC22({seed,mode:'tdm',map:'arena',loadout:'mp5sd'});
function fixture(){const c=mkClient(),r=mk();for(let i=0;i<400;i++){const t=1.065+i/60;fresh(c,t);r.command(t,c,{});if(i===10)r.serverEvent(t,'hit',{dmg:24});}
 const m=r.finish(8);return {schema:'fpsarena-c22-risk-aware-dataset-v1',engine:'uploaded-main',matches:[m]};}
test('C22 pressure audit is observational; pressure is based only on pre-action public features',()=>{
 assert.equal(pressureBandC22({distance:32,observedHostiles:3,healthFraction:.8,armorFraction:.1,radialSpeed:5}),'elevated');
 assert.equal(pressureBandC22({distance:75,observedHostiles:1,healthFraction:1,armorFraction:.8,radialSpeed:1}),'low');
 assert.equal(pressureBandC22({distance:null,observedHostiles:0,healthFraction:1,armorFraction:1,radialSpeed:0}),'unobserved');
});
test('C22 retains unchanged safety: priority commands, low HP, and wall veto',()=>{
 const c=mkClient(),r=mk();fresh(c,1.065);
 assert.deepEqual(r.command(1.065,c,{fire:true}),{fire:true});
 c.local.hp=40;fresh(c,1.3);r.command(1.3,c,{});
 c.local.hp=100;c.map.boxes=[{x0:-1,x1:1,z0:-2,z1:2,y0:-.5,y1:2}];fresh(c,1.5);r.command(1.5,c,{});
 assert.equal(r.offers.length,0);assert.ok(r.skipped['low-health']);assert.ok(r.skipped['public-static-geometry']);
 assert.equal(r.audits.sampled,r.audits.eligible+r.audits.ineligible);
});
test('C22 uses C21 exact seeded 1/3 action assignment without game RNG',()=>{
 const c=mkClient(),r=mk();const random=Math.random;Math.random=()=>{throw Error('RNG leakage');};
 try{fresh(c,1.065);r.command(1.065,c,{});assert.equal(r.offers[0].selectedAction,assignedActionC21(r.seed,1));
 assert.deepEqual(r.offers[0].horizonSeconds,[.9,1.8]);}finally{Math.random=random;}
});
test('C22 0.9s/1.8s server outcomes are cumulative and omit events after 1.8s',()=>{
 const r=mk(),c=mkClient();r.command(1.065,c,{});
 r.serverEvent(1.11,'shot',{id:'trainee'});r.serverEvent(1.11,'hit',{dmg:13});
 r.serverEvent(2.01,'hit',{dmg:20});r.serverEvent(2.90,'hit',{dmg:800});
 const row=r.finish(3).offers[0];assert.equal(row.horizons['0.9'].damageDealt,13);
 assert.equal(row.horizons['1.8'].damageDealt,33);assert.equal(row.outcome.damageDealt,33);
 assert.equal(row.horizons['0.9'].censored,false);assert.equal(row.horizons['1.8'].censored,false);
});
test('C22 labels correctly censored if match ends before a horizon completes',()=>{
 const r=mk(),c=mkClient();r.command(1.065,c,{});const row=r.finish(2.1).offers[0];
 assert.equal(row.horizons['0.9'].censored,false);assert.equal(row.horizons['1.8'].censored,true);
});
test('C22 no overlapping primary assignment windows and no op on blocked priority',()=>{
 const r=mk(),c=mkClient();r.command(1.065,c,{});r.command(1.98,c,{fire:true});
 assert.equal(r.offers.length,1);for(let t=2.2;t<3.1;t+=.2){fresh(c,t);r.command(t,c,{});}
 assert.ok(r.offers.length>1);for(let i=1;i<r.offers.length;i++)assert.ok(r.offers[i].time>=r.offers[i-1].windowEnd-.00011);
});
test('C22 validator and evaluation deterministic; real-data neural gate is blocked by small sample',()=>{
 const d=fixture(),checked=validateC22(d);assert.ok(checked.rows.length>0);
 assert.deepEqual(evaluateC22(d,{bootstraps:50}),evaluateC22(d,{bootstraps:50}));
 const e=evaluateC22(d,{bootstraps:50});assert.equal(e.trainingGate.passes,false);
 assert.ok(e.horizons['1.8'].complete<=e.horizons['0.9'].complete);
});
test('C22 rejects forged actions, changed pressure groups and overlapping labels',()=>{
 const d=fixture(),r=d.matches[0].offers[0];r.selectedAction=C21_ACTIONS.find(x=>x!==r.selectedAction);
 assert.throws(()=>validateC22(d),/randomization\/probability/);
 r.selectedAction=assignedActionC21(r.seed,1);r.pressureBand='invented';assert.throws(()=>validateC22(d),/pre-action pressure band/);
 r.pressureBand=pressureBandC22(r.publicFeatures);assert.ok(validateC22(d));
 if(d.matches[0].offers.length>1){d.matches[0].offers[1].time=r.time+.1;assert.throws(()=>validateC22(d),/nonoverlapping offers/);}
});
test('C22 rejects forged 1.8 second server label and future-leaked feature flag',()=>{
 const d=fixture(),r=d.matches[0].offers[0];r.horizons['1.8'].damageDealt+=8;
 assert.throws(()=>validateC22(d),/non-cumulative server outcome|1.8 server parity/);
 r.horizons['1.8'].damageDealt-=8;r.validity.preActionPublicFeaturesOnly=false;
 assert.throws(()=>validateC22(d),/features\/actuation/);
});
test('C22 rejects malformed period, duplicate matches and made-up producer',()=>{
 assert.throws(()=>new RiskAwareRandomizerC22({seed:1,mode:'tdm',map:'arena',loadout:'mp5sd',auditPeriod:0}));
 const d=fixture();d.matches[0].metadata.producer='production';assert.throws(()=>validateC22(d),/research provenance/);
 d.matches[0].metadata.producer='headless-simulator';d.matches.push(structuredClone(d.matches[0]));assert.throws(()=>validateC22(d),/duplicate match/);
});
