import test from 'node:test';import assert from 'node:assert/strict';
import {squadFlank} from '../squad-tactics.mjs';
const g=()=>({modeState:{type:'tdm'},local:{mv:{x:0,y:0,z:0},ws:{reloading:false}},you:{tm:0},net:{id:'me'},map:{boxes:[]},remotes:{list:[{id:'ally',team:0,alive:true,pos:{x:9,y:0,z:-8},yaw:0,data:{aim:true}}]}});
const t={id:'p:enemy',visible:true,point:{x:0,y:1.62,z:-30},remote:{pos:{x:0,y:0,z:-30}}};
const helpers={rayWorld:(_from,_dir,_bs,d)=>d};
test('two allies on the same lane do not move as one when a safe lateral path exists',()=>{
 const game=g();const mem={};const d=squadFlank(game,t,helpers,10,mem);
 assert.equal(d?.reason,'squad-crossfire');assert.ok(d.x<0,'flank opposite the teammate');
 assert.deepEqual(squadFlank(game,t,helpers,10.1,mem),d,'commit to one flank before changing direction');
});
test('teammate not aiming, wrong team, reloading, occupied route or urgent distance disables flank',()=>{
 const game=g();game.remotes.list[0].data.aim=false;
 assert.equal(squadFlank(game,t,helpers,10),null);
 game.remotes.list[0].data.aim=true;game.local.ws.reloading=true;
 assert.equal(squadFlank(game,t,helpers,10),null);
 game.local.ws.reloading=false;assert.equal(squadFlank(game,t,{rayWorld:()=>0},10),null);
 game.modeState={type:'zm'};assert.equal(squadFlank(game,t,helpers,10),null);
});
