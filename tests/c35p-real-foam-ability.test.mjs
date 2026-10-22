import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../lab/arena/source-main/server/game.js';
import {fireWeapon,setBallisticTruthSinkC35L} from '../lab/arena/source-main/server/combat.js';
function socket(id){return{id,on(){},emit(){}};}
function shotWithFoam(enable){
 const game=new Game({emit(){}},'classic');const shooter=game.addPlayer(socket('shooter'),{name:'S'}),target=game.addPlayer(socket('target'),{name:'T'});
 shooter.team='red';target.team='blue';shooter.nextPrimary='m4a1';game.startMatch();game.step();
 for(const p of [shooter,target]){p.alive=true;p.protectUntil=0;p.y=0;p.vx=p.vy=p.vz=0;p.onGround=true;}
 shooter.x=6;shooter.z=60;shooter.yaw=0;shooter.pitch=0;target.x=6;target.z=40;
 // This uses the actual game throwable effect creator, not a manually inserted fake box.
 if(enable)game.abil.explode({kind:'foam',owner:shooter,x:6,y:.4,z:50,hd:[0,-1]},null);
 const shots=[];setBallisticTruthSinkC35L(game,s=>shots.push(s));
 try{fireWeapon(game,shooter,{seq:700123,lt:game.now});}finally{setBallisticTruthSinkC35L(game,null);}
 return {shots,game};
}
test('official foam throwable materializes a timed dynamic obstruction',()=>{
 const {game}=shotWithFoam(true);assert.equal(game.abil.zones.length,1);assert.equal(game.abil.zones[0].kind,'foam');
 assert.equal(game.abil.foamBoxes.length,1);assert.equal(game.abil.foamBoxes[0].k,'foam');
});
test('same authoritative shot hits player without foam but is blocked after official foam explosion',()=>{
 const baseline=shotWithFoam(false).shots[0],covered=shotWithFoam(true).shots[0];
 assert.equal(baseline.pellets.length,1);assert.equal(baseline.pellets[0].hitKind,'player');
 assert.equal(covered.pellets.length,1);assert.equal(covered.pellets[0].hitKind,'world');
 assert.equal(covered.pellets[0].worldKind,'dynamic-foam');
 assert.deepEqual(baseline.pellets[0].dir,covered.pellets[0].dir);
});
