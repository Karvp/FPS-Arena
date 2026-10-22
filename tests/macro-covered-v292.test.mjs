import test from 'node:test';
import assert from 'node:assert/strict';
import {chooseCoveredApproach} from '../macro-cover-approach.mjs';
import {macroCombatPhase} from '../macro-combat-v2.mjs';
import {normaliseOptions} from '../aim-core.mjs';
import {WEAPONS} from '../lab/arena/source/shared/weapons.js';
const game=()=>({local:{alive:true,hp:100,armor:100,mv:{x:0,y:0,z:0},weapon:WEAPONS.benelli_m4,
 ws:{reloading:false,plateT:0,guns:[{id:'benelli_m4',mag:7}],slot:0}}});
const target={id:'enemy',visible:false,point:{x:60,y:0,z:0}};
const pursue={x:1,z:0,reason:'pro-rotate'},hide={x:-1,z:0,reason:'camera-peek-hide'};
const phase={phase:'approach',distance:60,engageAt:12,weaponClass:'Shotgun',targetId:'enemy'};
const contacts=[{x:50,z:0,y:0}];
const policy={canStep:()=>true,exposureAt:p=>Math.abs(p.z)<.5?3.8:.2,hardCoverAt:p=>Math.abs(p.z)>.5};
test('chooses a forward-progressing diagonal with lower corridor exposure',()=>{
 const r=chooseCoveredApproach(game(),target,phase,pursue,hide,contacts,1,{},policy);
 assert.equal(r.reason,'macro-covered-approach');assert.ok(r.x>.5);assert.ok(Math.abs(r.z)>.2);
});
test('never treats a blind camera spot as geometrically hard cover',()=>{
 const p={...policy,exposureAt:()=>.05,hardCoverAt:()=>false};
 assert.equal(chooseCoveredApproach(game(),target,phase,pursue,hide,contacts,1,{},p),hide);
});
test('never charges a fully exposed lane without better cover or contacts',()=>{
 const p={...policy,exposureAt:()=>2.4};
 assert.equal(chooseCoveredApproach(game(),target,phase,pursue,hide,contacts,1,{},p),hide);
 assert.equal(chooseCoveredApproach(game(),target,phase,pursue,hide,[],1,{},policy),hide);
});
test('respects collision, emergencies and recovery',()=>{
 const invalid={...policy,canStep:()=>false};
 assert.equal(chooseCoveredApproach(game(),target,phase,pursue,hide,contacts,1,{},invalid),hide);
 for(const k of ['emergency','dodge','recovery','ring','objective','loot'])
   assert.equal(chooseCoveredApproach(game(),target,phase,pursue,hide,contacts,1,{}, {...policy,[k]:true}),hide);
 const g=game();g.local.ws.reloading=true;
 assert.equal(chooseCoveredApproach(g,target,phase,pursue,hide,contacts,1,{},policy),hide);
});
test('preserves live visible engagement rather than forcing covered detour',()=>{
 assert.equal(chooseCoveredApproach(game(),{...target,visible:true},phase,pursue,hide,contacts,1,{},policy),hide);
});
test('does not override close-range engagement or assault rifle policy',()=>{
 assert.equal(chooseCoveredApproach(game(),target,{...phase,distance:12},pursue,hide,contacts,1,{},policy),hide);
 const g=game();g.local.weapon=WEAPONS.m4a1;
 assert.equal(macroCombatPhase(g,target,g.local.weapon,1,{}).phase,'idle');
});
test('hysteresis revalidates each held direction, and drops it at new threat',()=>{
 const g=game(),memory={};
 const a=chooseCoveredApproach(g,target,phase,pursue,hide,contacts,1,memory,policy);
 assert.equal(chooseCoveredApproach(g,target,phase,pursue,hide,contacts,1.1,memory,policy).reason,'macro-covered-approach');
 const blocked={...policy,canStep:()=>false};
 assert.equal(chooseCoveredApproach(g,target,phase,pursue,hide,contacts,1.2,memory,blocked),hide);
 assert.equal(chooseCoveredApproach(g,target,phase,pursue,hide,contacts,1.3,memory,{...policy,exposureAt:()=>9}),hide);
});
test('experimental profile can be enabled but is opt-out by default',async()=>{
 assert.equal(normaliseOptions({}).macroCoverApproach,false);
 assert.equal(normaliseOptions({macroCoverApproach:true}).macroCoverApproach,true);
 const {readFileSync}=await import('node:fs');const bundle=readFileSync(new URL('../page-agent.js',import.meta.url),'utf8');
 assert.ok(bundle.includes('function chooseCoveredApproach('));
 assert.ok(bundle.includes('macro-covered-approach'));
 assert.ok(!readFileSync(new URL('../popup.html',import.meta.url),'utf8').includes('id="macroCoverApproach"')); // failed experiment is simulator-only
});
