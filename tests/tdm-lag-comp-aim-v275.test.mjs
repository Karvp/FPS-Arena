import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULTS,normaliseOptions,findTarget,acquireCombatTarget} from '../aim-core.mjs';

const player={headYs:[1.62,1.15,.55],bodyH:[1.4,.95,.5],slideHeadY:1.02,slideBodyHeight:.9,bodyHalf:.36,headRadius:.24};
const helpers={player,leanOffset:.35,eyeHeightOf:()=>1.62,rayWorld:(_o,_d,_b,d)=>d};
function mk(mode='tdm',lean=0){
 const r={id:'foe',alive:true,team:1,pos:{x:1,y:0,z:-22},yaw:0,lean,stance:0,sliding:false,
   data:{ln:lean},buf:[{t:1,x:0,y:0,z:-22},{t:1.1,x:1,y:0,z:-22}]};
 const g={running:true,phase:'match',modeState:{type:mode},you:{tm:0},local:{alive:true,team:'red',mv:{lean:0}},
   pos:{x:0,y:0,z:0},rig:{yaw:0,pitch:0},map:{boxes:[]},net:{id:'self'},remotes:{list:[r]},zremotes:{list:[]},bremotes:{list:[]}};
 return {game:g,remote:r};
}
const base=()=>normaliseOptions({...DEFAULTS,enabled:true,mode:'autopilot',prediction:true,predictionMs:65,
 target:'head',maxDistance:250,fov:45,visibility:true});

test('TDM authoritative hitscan rewind turns off the extra target lead (head)',()=>{
 const {game,remote}=mk();const newTarget=findTarget(game,base(),helpers);
 const oldTarget=findTarget(game,{...base(),lagCompensatedAim:false},helpers);
 assert.ok(newTarget && oldTarget);
 assert.ok(Math.abs(newTarget.point.x-1)<1e-9);
 assert.ok(Math.abs(oldTarget.point.x-1.65)<1e-9);
 assert.equal(newTarget.hitRegion,'head');
 assert.equal(remote.pos.x,1); // Target proposal never mutates snapshots.
});

test('TDM zero extra lead respects the server lean geometry',()=>{
 const {game}=mk('tdm',-1);
 const option={...base(),target:'body'};
 const t=findTarget(game,option,helpers);
 assert.ok(t);
 assert.ok(Math.abs(t.point.x-(1-.35*.5))<1e-9);
 assert.equal(t.hitRegion,'body');
});

test('Lag compensated aim remains opt-out, other modes and assist are unaffected',()=>{
 assert.equal(normaliseOptions({}).lagCompensatedAim,true);
 assert.equal(normaliseOptions({lagCompensatedAim:false}).lagCompensatedAim,false);
 for(const mode of ['snd','hp','br','zm']){
   const {game,remote}=mk(mode);
   if(mode==='zm'){game.zremotes.list=[remote];game.remotes.list=[];}
   const t=findTarget(game,base(),helpers);
   assert.ok(t,mode);
   assert.ok(Math.abs(t.point.x-1.65)<1e-9,mode);
 }
 const {game}=mk('tdm');
 const t=findTarget(game,{...base(),mode:'assist'},helpers);
 assert.ok(Math.abs(t.point.x-1.65)<1e-9);
});

test('TDM visibility-first acquisition and obstacles remain enforced',()=>{
 const {game}=mk();
 const t=acquireCombatTarget(game,base(),helpers);
 assert.ok(t?.visible);
 assert.ok(Math.abs(t.point.x-1)<1e-9);
 const block={...helpers,rayWorld:()=>2};
 assert.equal(findTarget(game,base(),block),null);
 assert.equal(acquireCombatTarget(game,base(),block)?.visible,false);
});
