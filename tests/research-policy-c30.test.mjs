import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readFrozenC30,neuralLossC30,publicModelFeaturesC30,ResearchPolicyC30} from '../lab/arena/research-policy-c30.mjs';
import {counterfactualC30,scenarioC30} from '../lab/arena/counterfactual-fire-c30.mjs';
const model=readFrozenC30(new URL('../reports/c30/encounters/FROZEN-POLICY.json',import.meta.url));
const vec=JSON.parse(readFileSync(new URL('./fixture-c30-pytorch-vectors.json',import.meta.url)));
function client({gun='mp5sd',yaw=0,t=10,offset=27,vx=6,vz=0}={}){
 return {pos:{x:offset,z:-34},local:{team:0,mv:{vx,vz},alive:true},remotes:{list:[
  {id:'enemy',team:1,alive:true,yaw,pos:{x:0,z:0},data:{w:gun},buf:[{t:t-.05}]}]}};
}
test('C30 JS neural inference matches independently exported PyTorch on 20 C30 development vectors',()=>{
 for(const v of vec){const p=neuralLossC30(model,v.x);p.forEach((y,i)=>assert.ok(Math.abs(y-v.y[i])<1e-6,`${y} vs ${v.y[i]}`));}
});
test('C30 model selected policy is correctly recorded as always-left, not neural',()=>{
 assert.equal(model.preselectedPolicy,'always-left');assert.throws(()=>neuralLossC30(model,[1]),/invalid C30 features/);
});
test('C30 supports 27m lateral offset with normalised public body-yaw ratio',()=>{
 const a=publicModelFeaturesC30(client(),10,65);assert.equal(a.ok,true);assert.equal(a.features.length,10);
 assert.ok(a.features[3]>.45&&a.features[3]<.8);assert.ok(a.features.every(Number.isFinite));
});
test('C30 rejects stale, unknown gun, missing public state, nonphysical speed',()=>{
 assert.equal(publicModelFeaturesC30(client({gun:'invalid'}),10,65).reason,'unrepresented-weapon');
 assert.equal(publicModelFeaturesC30(client({t:9}),10,65).reason,'stale-remote');
 assert.equal(publicModelFeaturesC30({},10,65).reason,'missing-own-public-motion');
 assert.equal(publicModelFeaturesC30(client({vx:35}),10,65).reason,'outside-transfer-kinematics');
});
test('C30 refuses nonfinite and bad training scenarios',()=>{
 const s={seed:321,weaponId:'mp5sd',distance:48,offset:22,baseVelocity:3,lagSeconds:.065,tracking:'track',aim:true};
 assert.equal(scenarioC30(s),s);
 assert.throws(()=>scenarioC30({...s,offset:49}),/Invalid C30/);
 assert.throws(()=>scenarioC30({...s,baseVelocity:13}),/Invalid C30/);
 assert.throws(()=>counterfactualC30({...s,tracking:'future-aim'}),/Invalid C30/);
});
test('C30 counterfactual uses 3 shared-seed server firing arms and deterministic replay',()=>{
 const s={seed:9001,weaponId:'aa12',distance:37,offset:5,baseVelocity:1.5,lagSeconds:.125,tracking:'lead',aim:true};
 const a=counterfactualC30(s),b=counterfactualC30(s);
 assert.deepEqual(a,b);assert.equal(a.arms.length,3);assert.deepEqual(a.arms.map(x=>x.action),['baseline','micro-left','micro-right']);
 for(const x of a.arms)assert.ok(x.shots>0&&x.cappedLoss>=0);
});
test('C30 invalid client never introduces unsafe movement and leaves incumbent command unchanged',()=>{
 const bot=new ResearchPolicyC30({seed:3,mode:'tdm',map:'arena',loadout:'m4a1',policy:'neural',model,lagMs:65});
 const command={forward:true};const out=bot.command(1,{},command);
 assert.deepEqual(out,command);assert.notStrictEqual(out,command);
});
test('C30 model provenance is mandatory',()=>{
 assert.ok(model.modelSourceSHA256.length===64);assert.ok(model.trainingRegistration.length===64);
});
