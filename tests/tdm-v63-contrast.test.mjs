import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {scoreV63Shadow,proposeV63ResearchOnly} from '../lab/arena/tdm-v63-contrast-inference.mjs';
const bytes=readFileSync(new URL('../research/tdm-v63-contrast-model.json',import.meta.url));
const model=JSON.parse(bytes);
const refs=JSON.parse(readFileSync(new URL('../research/tdm-v63-python-js-parity-fixtures.json',import.meta.url),'utf8'));
test('model SHA and pre-branch public-only shadow contract',()=>{
 assert.equal(createHash('sha256').update(bytes).digest('hex'),refs.modelSha256);
 assert.equal(model.policyPromotionAllowed,false);
 assert.equal(model.researchOnly,true);
 assert.equal(refs.references.length,5);
});
test('frozen Python Ridge and JavaScript match on 20 independent arm probes',()=>{
 for(const ref of refs.references){
  const result=scoreV63Shadow(model,{publicState:ref.publicState,map:ref.map,weapon:ref.weapon});
  assert.equal(result.utility.length,4);
  for(let i=0;i<4;i++){
   assert.ok(Math.abs(result.utility[i]-ref.expectedUtility[i])<1e-7,
    `utility ${ref.id} ${i}: ${result.utility[i]} != ${ref.expectedUtility[i]}`);
   assert.ok(Math.abs(result.hazard[i]-ref.expectedHazard[i])<1e-7,
    `hazard ${ref.id} ${i}: ${result.hazard[i]} != ${ref.expectedHazard[i]}`);
  }
 }
});
test('research proposal is only a label, never a command to the game',()=>{
 const sel=proposeV63ResearchOnly({utility:[0,1,0,0],hazard:[.10,.11,.2,.2]});
 assert.deepEqual(sel,{arm:'close',shadow:true,mayApplyToGame:false});
 const abstain=proposeV63ResearchOnly({utility:[0,.1,.4,-.1],hazard:[.1,.11,.3,.1]});
 assert.equal(abstain.arm,'keep');
});
test('rejected model and nonpublic snapshot cannot invoke shadow scoring',()=>{
 const x=refs.references[0];
 assert.throws(()=>scoreV63Shadow({...model,policyPromotionAllowed:true},{publicState:x.publicState,map:x.map,weapon:x.weapon}),/V63_RESEARCH_SHADOW_ONLY/);
 assert.throws(()=>scoreV63Shadow(model,{publicState:{...x.publicState,valid:false},map:x.map,weapon:x.weapon}),/V62_INVALID_PUBLIC_INPUT/);
});
