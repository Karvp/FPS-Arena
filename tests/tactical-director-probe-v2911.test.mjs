import test from 'node:test';
import assert from 'node:assert/strict';
import {tacticalProbeStall,tacticalDirectorDecision} from '../tactical-director.mjs';
import {normaliseOptions} from '../aim-core.mjs';
import {readFileSync} from 'node:fs';
const g=()=>({local:{alive:true,mv:{x:0,y:0,z:0},hp:100,armor:70,weapon:{cat:'Shotgun'},ws:{reloading:false,plateT:0}}});
const t=()=>({id:'enemy',point:{x:34,y:0,z:0},visible:false,hitboxVisible:false});
const base={x:1,z:0,reason:'pathfinding'};
const P={active:true,engagementProbe:true,engagementWindow:true,opportunityGuard:true,
 route:(a,b)=>[{x:23,y:0,z:0},b],walkable:()=>true,shotClear:()=>true,
 riskAt:()=>0,canStep:()=>true,threshold:-20};
test('probe is off by default and opt-in only',()=>{
 assert.equal(normaliseOptions({}).tacticalDirectorEngagementProbe,false);
 assert.equal(normaliseOptions({tacticalDirectorEngagementProbe:true}).tacticalDirectorEngagementProbe,true);
 const source=readFileSync(new URL('../agent-entry.js',import.meta.url),'utf8');
 assert.ok(source.includes('globalThis.__FPSARENA_HEADLESS_LAB__===true'));
 assert.ok(source.includes('engagementProbe:options.tacticalDirectorEngagementProbe===true'));
});
test('stalled pursuit excludes enemy motion and requires elapsed observation',()=>{
 const memory={},a={x:0,z:0},enemy={x:34,z:0};
 assert.equal(tacticalProbeStall(memory,a,enemy,'x',2,base),false);
 assert.equal(tacticalProbeStall(memory,a,enemy,'x',2.3,base),false);
 assert.equal(tacticalProbeStall(memory,a,enemy,'x',2.9,base),true);
 assert.equal(tacticalProbeStall(memory,{x:3,z:0},enemy,'x',3,base),false,'productive own motion resets anchor');
 assert.equal(tacticalProbeStall(memory,{x:3,z:0},{x:44,z:0},'x',4,base),false,'target motion invalidates');
});
test('headless-probe can actuate a verified earlier shot only after sustained stall',()=>{
 const memory={},events=[],policy={...P,onDecision:e=>events.push(e)};
 assert.strictEqual(tacticalDirectorDecision(g(),t(),base,2,memory,policy),base);
 assert.strictEqual(tacticalDirectorDecision(g(),t(),base,2.5,memory,policy),base);
 const out=tacticalDirectorDecision(g(),t(),base,3,memory,policy);
 assert.ok(out.reason.startsWith('director-'));
 assert.equal(memory.plan?.actuated,true);
 assert.equal(memory.probeAnchor,null);
 assert.ok(memory.probeSuspendUntil>3);
 assert.ok(events.some(e=>e.state==='director-planned'&&e.earlyShotWindow===true));
 const again=tacticalDirectorDecision(g(),t(),base,3.1,memory,policy);
 assert.ok(again.reason.startsWith('director-'),'owned plan remains under priority shield');
 assert.strictEqual(tacticalDirectorDecision(g(),t(),base,3.2,memory,{...policy,emergency:true}),base);
});
test('probe cannot actuate if target visible, no early shot, or fire is protected',()=>{
 for(const override of [{fire:true},{emergency:true}]){
  const m={};tacticalDirectorDecision(g(),t(),base,2,m,{...P,...override});
  assert.strictEqual(tacticalDirectorDecision(g(),t(),base,3,m,{...P,...override}),base);
 }
 const m={};tacticalDirectorDecision(g(),t(),base,2,m,P);
 assert.strictEqual(tacticalDirectorDecision(g(),{...t(),visible:true},base,3,m,P),base);
 const m2={};tacticalDirectorDecision(g(),t(),base,2,m2,{...P,shotClear:()=>false});
 assert.strictEqual(tacticalDirectorDecision(g(),t(),base,3,m2,{...P,shotClear:()=>false}),base);
});
