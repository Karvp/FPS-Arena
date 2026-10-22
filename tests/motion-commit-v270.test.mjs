import test from 'node:test';
import assert from 'node:assert/strict';
import {stabilizeMovement} from '../motion-stabilizer.mjs';
const blank={forward:false,backward:false,left:false,right:false};
test('short non-emergency forward/backward flicker is suppressed for 380 ms',()=>{
 const m={};let x=stabilizeMovement(blank,{x:0,z:-1,reason:'pro-rotate'},0,1,m);
 assert.equal(x.forward,true);
 x=stabilizeMovement(blank,{x:0,z:1,reason:'pro-rotate'},0,1.12,m,{safePrevious:()=>true});
 assert.equal(x.forward,true);assert.equal(x.backward,false);
 x=stabilizeMovement(blank,{x:0,z:1,reason:'pro-rotate'},0,1.43,m,{safePrevious:()=>true});
 assert.equal(x.backward,true,'legitimate persistent turn is not blocked indefinitely');
});
test('wall and emergency exceptions bypass heading persistence',()=>{
 const m={};stabilizeMovement(blank,{x:0,z:-1,reason:'pro-rotate'},0,1,m);
 const wall=stabilizeMovement(blank,{x:0,z:1,reason:'pro-rotate'},0,1.08,m,{safePrevious:()=>false});
 assert.equal(wall.backward,true,'blocked previous direction must be abandoned');
 const emergency=stabilizeMovement(blank,{x:0,z:-1,reason:'br-ring-escape'},0,1.1,m,{safePrevious:()=>true});
 assert.equal(emergency.forward,true,'barrier escape always overrides smoothing');
});
