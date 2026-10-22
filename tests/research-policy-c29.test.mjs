import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readFrozenC28,neuralLossC29,publicModelFeaturesC29,ResearchPolicyC29,C29_WEAPONS} from '../lab/arena/research-policy-c29.mjs';
const model=readFrozenC28(new URL('../reports/c28/micro-v1/FROZEN-POLICY.json',import.meta.url));
const vectors=JSON.parse(readFileSync(new URL('./fixture-c29-pytorch-vectors.json',import.meta.url)));
test('C29 JS MLP matches frozen PyTorch model on development vectors',()=>{
 for(const v of vectors){const p=neuralLossC29(model,v.x);p.forEach((z,i)=>assert.ok(Math.abs(z-v.y[i])<1e-6,`${v.index}/${i}: ${z} vs ${v.y[i]}`));}
});
test('C29 source model exact definition, six permitted weapons',()=>{
 assert.equal(model.model,'MLP 10→24→12→3 sigmoid');assert.equal(C29_WEAPONS.length,6);
 assert.throws(()=>neuralLossC29(model,[1]),/Invalid neural features/);
});
function client({gun='mp5sd',yaw=Math.PI,t=10,offset=1,vx=0,vz=0}={}){
 return {pos:{x:offset,z:35},local:{team:0,mv:{vx,vz},alive:true},remotes:{list:[{id:'a',team:1,alive:true,yaw,
  pos:{x:0,z:0},data:{w:gun},buf:[{t:t-.05,x:0,z:0}]}]}};
}
test('C29 client features are public-only and use no future label',()=>{
 const a=publicModelFeaturesC29(client(),10,65);assert.equal(a.ok,true);assert.equal(a.features.length,10);
 assert.equal(a.enemyWeapon,'mp5sd');assert.equal(a.features.at(-6),1);
});
test('C29 refuses out-of-domain weapon, offset, stale and missing state',()=>{
 assert.equal(publicModelFeaturesC29(client({gun:'mystery'}),10,65).reason,'unsupported-enemy-weapon');
 assert.equal(publicModelFeaturesC29(client({offset:4}),10,65).reason,'out-of-c28-motion-support');
 assert.equal(publicModelFeaturesC29(client({t:9}),10,65).reason,'stale-enemy-snapshot');
 assert.equal(publicModelFeaturesC29({},10,65).reason,'missing-public-snapshot');
});
test('C29 fallback leaves command unchanged without unsafe active override',()=>{
 const ex=new ResearchPolicyC29({seed:1,mode:'tdm',map:'neon',loadout:'mp5sd',policy:'neural',model,lagMs:65});
 const base={forward:true}; const returned=ex.command(1,{},base);
 assert.deepEqual(returned,base);assert.notStrictEqual(returned,base);
});
