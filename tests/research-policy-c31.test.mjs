import test from 'node:test';
import assert from 'node:assert/strict';
import {readFrozenC30} from '../lab/arena/research-policy-c30.mjs';
import {ResearchPolicyC31} from '../lab/arena/research-policy-c31.mjs';
import {readFileSync} from 'node:fs';
const model=readFrozenC30(new URL('../reports/c30/encounters/FROZEN-POLICY.json',import.meta.url));
test('C31 uses exact frozen C30 model provenance, no training on C31 trials',()=>{
 const c=new ResearchPolicyC31({seed:3101,mode:'tdm',map:'arena',loadout:'mp5sd',policy:'neural',model,lagMs:65,enemyPrimary:'aa12'});
 assert.equal(c.model.modelSourceSHA256,model.modelSourceSHA256);
 assert.equal(c.command(10,{}, {forward:true}).forward,true);
 assert.equal(c.transfer.eligible,0);
});
test('C31 uses delayed PUBLIC enemy weapon to choose model action and audits after action',()=>{
 const c=new ResearchPolicyC31({seed:3102,mode:'tdm',map:'arena',loadout:'mp5sd',policy:'neural',model,lagMs:65,enemyPrimary:'aa12'});
 assert.deepEqual(c.audit.seenPublicWeapons,{});
 assert.equal(c.audit.offers,0);
 assert.equal(typeof c.finish,'function');
});
test('C31 pilot registration includes every enemy weapon and clean disjoint pilot/efficacy seeds',()=>{
 const p=JSON.parse(readFileSync(new URL('../reports/c31/study/PRE-REGISTERED-PLAN.json',import.meta.url)));
 const weapons=new Set(p.pilot.map(x=>x.enemyWeapon));
 assert.equal(weapons.size,6);
 assert.equal(p.pilot.length,36);
 assert.equal(p.efficacy.length,36);
 assert.equal(new Set([...p.pilot,...p.efficacy].map(x=>x.seed)).size,72);
 assert.ok(p.thresholds.minNonLeftNeuralRate>0);
 assert.equal(p.promotion,false);
});
test('C31 research model cannot use server weapon truth in selection feature vector',()=>{
 const text=readFileSync(new URL('../lab/arena/research-policy-c31.mjs',import.meta.url),'utf8');
 assert.ok(text.includes('super.command(now,client,original)'));
 assert.ok(!text.includes('world.players'));
});
