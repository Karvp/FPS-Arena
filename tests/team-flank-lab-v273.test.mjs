import test from 'node:test';
import assert from 'node:assert/strict';
import {squadFlank} from '../squad-tactics.mjs';
import {squadFlankLegacy} from '../squad-legacy.mjs';
import {normaliseOptions} from '../aim-core.mjs';
const g=()=>({modeState:{type:'tdm'},local:{mv:{x:0,y:0,z:0},hp:100,armor:50,ws:{slot:0,reloading:false,guns:[{id:'m4a1',mag:30}]}},you:{tm:0},net:{id:'me'},map:{bound:80,boxes:[]},remotes:{list:[{id:'ally',team:0,alive:true,pos:{x:9,y:0,z:-8},yaw:0,data:{aim:true}}]}});
const target={id:'p:bad',visible:true,point:{x:0,y:1.6,z:-30},remote:{yaw:0,pos:{x:0,y:0,z:-30}}};
const helper={rayWorld:(_o,_d,_boxes,length)=>length};
test('team positioning experiment is disabled by default; legacy policy remains available',()=>{
 assert.equal(normaliseOptions({}).teamFlankExperiment,false);
 assert.equal(normaliseOptions({teamFlankExperiment:true}).teamFlankExperiment,true);
 assert.equal(squadFlankLegacy(g(),target,helper,5,{})?.reason,'squad-crossfire');
});
test('experimental squad repositions to the ally-opposite flank and commits across ticks',()=>{
 const game=g(),memory={};const a=squadFlank(game,target,helper,5,memory);
 assert.equal(a?.reason,'squad-crossfire');assert.ok(a.x<0);
 const b=squadFlank(game,target,helper,5.1,memory);
 assert.deepEqual(a,b);
});
test('experimental squad does not risk weak, reloading or out-of-ammo player',()=>{
 const game=g();game.local.hp=35;
 assert.equal(squadFlank(game,target,helper,5,{}),null);
 game.local.hp=100;game.local.ws.reloading=true;
 assert.equal(squadFlank(game,target,helper,5,{}),null);
 game.local.ws.reloading=false;game.local.ws.guns[0].mag=0;
 assert.equal(squadFlank(game,target,helper,5,{}),null);
});
test('experimental squad refuses a lane aimed toward the player and blocked geometry',()=>{
 const game=g();const facing={...target,remote:{...target.remote,yaw:Math.PI}};
 assert.equal(squadFlank(game,facing,helper,5,{}),null);
 assert.equal(squadFlank(game,target,{rayWorld:()=>0},5,{}),null);
});
test('no friendly support, Zombie mode or urgent proximity cannot initiate flank',()=>{
 const game=g();game.remotes.list[0].data.aim=false;
 assert.equal(squadFlank(game,target,helper,5,{}),null);
 game.remotes.list[0].data.aim=true;game.modeState.type='zm';
 assert.equal(squadFlank(game,target,helper,5,{}),null);
 game.modeState.type='tdm';game.local.mv.z=-18;
 assert.equal(squadFlank(game,target,helper,5,{}),null);
});
