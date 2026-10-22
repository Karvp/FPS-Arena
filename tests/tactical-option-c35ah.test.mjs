import test from 'node:test';
import assert from 'node:assert/strict';
import {assignC35AH,C35AH_ARMS,C35AH_P,TacticalOptionRandomizerC35AH} from '../lab/arena/tactical-option-randomizer-c35ah.mjs';
const c=()=>new TacticalOptionRandomizerC35AH({seed:17,matchId:'match',setupId:'setup',weapon:'m4a1',doseSeconds:.4,horizonSeconds:3,cooldownSeconds:4});
const metrics=()=>({shots:0,hits:0,damageDealt:0,damageTaken:0,ownKills:0,deathCount:0});
const cmd=()=>({forward:true,backward:false,left:false,right:false,aim:true,fire:false,reload:false});
test('C35AH deterministic three arms and nondegenerate propensity',()=>{
 const a=Array.from({length:800},(_,i)=>assignC35AH(71,i+1));
 assert.deepEqual(a,Array.from({length:800},(_,i)=>assignC35AH(71,i+1)));
 for(const k of C35AH_ARMS)assert.ok(a.filter(x=>x===k).length>100);
 assert.deepEqual([...C35AH_P],[.5,.25,.25]);
 assert.throws(()=>assignC35AH(-1,1),/assignment/);assert.throws(()=>assignC35AH(1,0),/assignment/);
});
test('C35AH invalid settings rejected',()=>{
 assert.throws(()=>new TacticalOptionRandomizerC35AH({seed:5,matchId:'x',setupId:'y',weapon:'m4a1',doseSeconds:7}),/design/);
 assert.throws(()=>new TacticalOptionRandomizerC35AH({seed:5,matchId:'x',setupId:'y',weapon:'m4a1',cooldownSeconds:5}),/design/);
});
test('C35AH observe mode leaves all commands byte-invariant',()=>{
 const o=new TacticalOptionRandomizerC35AH({seed:17,matchId:'match',setupId:'setup',weapon:'m4a1',policy:'observe'}),m=metrics(),a=cmd();
 for(let i=0;i<20;i++){const t=i/60;const b=o.command(t,{},a,a);assert.equal(b,a);o.beforeStep({now:t,incumbent:a,applied:b,metrics:m});o.afterStep({now:t,metrics:m,alive:true});}
 const r=o.finish();assert.equal(r.rows.length,0);assert.equal(r.counts.fireMutations,0);
});
test('C35AH fail-closed without public state',()=>{
 const o=c(),m=metrics(),a=cmd();for(let i=0;i<10;i++){
  const t=i/60,b=o.command(t,{},a,a);assert.equal(b,a);o.beforeStep({now:t,incumbent:a,applied:b,metrics:m});o.afterStep({now:t,metrics:m,alive:true});}
 assert.equal(o.finish().rows.length,0);
});
test('C35AH rejects upstream fire changes and improper clock/phase',()=>{
 const o=c(),m=metrics(),a=cmd();assert.throws(()=>o.command(0,{},a,{...a,fire:true}),/fire/);
 const z=c(),b=z.command(0,{},a,a);assert.throws(()=>z.command(.01,{},a,a),/phase/);
 z.beforeStep({now:0,incumbent:a,applied:b,metrics:m});z.afterStep({now:0,metrics:m,alive:true});assert.throws(()=>z.command(0,{},a,a),/phase/);
});
test('C35AH rejects unauthorized nonmotor difference on pre-step audit',()=>{
 const o=c(),m=metrics(),a=cmd(),b=o.command(0,{},a,a);
 assert.throws(()=>o.beforeStep({now:0,incumbent:a,applied:{...b,aim:false},metrics:m}),/integrity/);
});
test('C35AH refuses reverse server counters',()=>{
 const o=c(),m=metrics(),a=cmd(),b=o.command(0,{},a,a);
 o.beforeStep({now:0,incumbent:a,applied:b,metrics:m});m.shots=4;o.afterStep({now:0,metrics:m,alive:true});
 const z=o.command(1/60,{},a,a);o.beforeStep({now:1/60,incumbent:a,applied:z,metrics:m});m.shots=3;
 assert.throws(()=>o.afterStep({now:1/60,metrics:m,alive:true}),/reversal/);
});
test('C35AH leaves unknown potential outcomes null in every row',()=>{
 const o=c();assert.equal(o.finish().counts.offers,0);
});
