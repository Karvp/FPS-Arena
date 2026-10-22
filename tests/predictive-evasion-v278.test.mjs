import test from 'node:test';
import assert from 'node:assert/strict';
import {visibleFireThreats,predictiveEvasion,adaptiveDefensiveStance} from '../evasion-core.mjs';
import {normaliseOptions} from '../aim-core.mjs';
const map={bound:68,boxes:[]};
const sighted={x:0,z:-12,yaw:Math.PI,aim:true,recentFire:true};
const make=()=>({local:{mv:{x:0,y:0,z:0,stance:0,onGround:true,slideT:0}},map});
const rayWorld=()=>Infinity;
test('observed hitscan LOS threat is identified even when server has no ADS data',()=>{
 assert.equal(visibleFireThreats(map,make().local.mv,[{...sighted,aim:false}],1).length,1);
 assert.equal(visibleFireThreats(map,make().local.mv,[{...sighted,yaw:0}],1).length,0);
});
test('valid open-map evasion steers laterally out of firing line without engine privilege',()=>{
 const memory={};const out=predictiveEvasion(make(),{rayWorld},[sighted],5,memory,{range:60});
 assert.ok(out && Math.abs(out.x)>.8,JSON.stringify(out));
 assert.ok(out.estimatedRiskReduction>0);
 assert.equal(out.sprint,false);
});
test('evasion never directs beyond the legal map edge',()=>{
 const g=make();g.local.mv.x=67.5;g.map={bound:68,boxes:[]};
 const a={...sighted,x:67.5};const out=predictiveEvasion(g,{rayWorld},[a],5,{},{});
 if(out)assert.ok(Math.abs(g.local.mv.x+out.x*4.7*.62)<67.05);
});
test('blocked hard-cover line removes immediate aim threat',()=>{
 const wall={x0:-1,x1:1,z0:-7,z1:-5,y0:0,y1:3};
 const g=make();g.map={bound:68,boxes:[wall]};
 assert.equal(visibleFireThreats(g.map,g.local.mv,[sighted],1).length,0);
});
test('opt-in evasion has safe defaults, explicit config enables it',()=>{
 const old=normaliseOptions({enabled:true});
 assert.equal(old.predictiveEvasion,false);assert.equal(old.combatCoverPressure,false);
 const enabled=normaliseOptions({enabled:true,predictiveEvasion:true,combatCoverPressure:true});
 assert.equal(enabled.predictiveEvasion,true);assert.equal(enabled.combatCoverPressure,true);
});
test("defensive pose does not affect idle actions or disabled state",()=>{
 const g=make(),input={fire:true,aim:true,crouch:false};
 const pose=adaptiveDefensiveStance(g,input,[],2,{});
 assert.equal(pose,input);
});
