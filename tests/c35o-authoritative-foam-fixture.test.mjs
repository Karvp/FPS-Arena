import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../lab/arena/source-main/server/game.js';
import {fireWeapon,setBallisticTruthSinkC35L} from '../lab/arena/source-main/server/combat.js';
function socket(id){return {id,on(){},emit(){}};}
test('authoritative server pellet collides with live foam box and is labeled dynamic-foam',()=>{
 const game=new Game({emit(){}},'classic');
 const shooter=game.addPlayer(socket('p1'),{name:'Shooter'});
 const target=game.addPlayer(socket('p2'),{name:'Target'});
 shooter.team='red';target.team='blue';shooter.nextPrimary='m4a1';
 game.startMatch();game.step();
 for(const p of [shooter,target]){p.alive=true;p.protectUntil=0;p.y=0;p.vx=p.vy=p.vz=0;p.onGround=true;}
 shooter.x=6;shooter.z=60;shooter.yaw=0;shooter.pitch=0;
 target.x=6;target.z=40;
 game.abil.foamBoxes=[{x0:0,x1:12,z0:49.5,z1:50.5,y0:0,y1:4,k:'foam'}];
 assert.equal(game.worldBoxes().length,game.map.boxes.length+1);
 const shots=[];
 setBallisticTruthSinkC35L(game,s=>shots.push(s));
 try{fireWeapon(game,shooter,{seq:700123,lt:game.now});}
 finally{setBallisticTruthSinkC35L(game,null);}
 assert.equal(shots.length,1);
 assert.ok(shots[0].pellets.some(p=>p.hitKind==='world'&&p.worldKind==='dynamic-foam'),JSON.stringify(shots[0].pellets));
});
