import test from 'node:test';
import assert from 'node:assert/strict';
import {choosePublicObjective,objectiveRoutePlan} from '../objective-tactics.mjs';
const game=(type='snd',extra={},self={x:0,y:0,z:0})=>({
  local:{mv:self,team:'red'},net:{id:'trainee'},map:{boxes:[],bound:68},
  modeState:type==='hp'?{type:'hp',zone:{id:'1',x:25,z:0,r:6},...extra}
   :{type:'snd',phase:'active',attackers:'red',bomb:{state:'carried',pid:'trainee'},
      sites:[{id:'A',x:25,z:0},{id:'B',x:-32,z:0}],...extra}
});
test('S&D: carrier plants; defending team guards a site until bomb is planted',()=>{
  assert.equal(choosePublicObjective(game()).kind,'plant');
  assert.equal(choosePublicObjective(game('snd',{phase:'freeze'})),null);
  const def=game('snd',{bomb:{state:'carried',pid:'trainee'}});def.local.team='blue';
  assert.equal(choosePublicObjective(def).kind,'defend-site');
});
test('S&D: bomb defuse / defend / recovery use public state without reading server',()=>{
  const planted={phase:'planted',bomb:{state:'planted',x:11,z:9,site:'B'}};
  const attacker=game('snd',planted),defender=game('snd',planted);defender.local.team='blue';
  assert.deepEqual([choosePublicObjective(attacker).kind,choosePublicObjective(defender).kind],['guard-bomb','defuse']);
  assert.equal(choosePublicObjective(defender).interact,true);
  assert.equal(choosePublicObjective(game('snd',{bomb:{state:'dropped',x:5,z:6}})).kind,'recover-bomb');
});
test('Hardpoint: zone plan moves toward public objective and holds inside radius',()=>{
  const go=game('hp');const memory={};let routed=0;
  const planners={route:()=>{routed++;return [{x:10,z:0},{x:25,z:0}];},clear:()=>true};
  const a=objectiveRoutePlan(go,{},1,memory,null,planners);
  assert.equal(a.direction.reason,'mode-objective-capture');assert.equal(routed,1);
  const b=objectiveRoutePlan(go,{},1.1,memory,null,planners);
  assert.equal(routed,1,'route caching must not recompute 60 times per second');
  go.local.mv.x=21.0;
  const c=objectiveRoutePlan(go,{},1.5,memory,null,planners);
  assert.equal(c.hold,true);assert.equal(c.interact,false);
});
test('S&D: no risky bomb plant when a hostile is visibly at close range',()=>{
  const g=game();const planners={route:()=>[{x:4,z:0}],clear:()=>true};
  assert.equal(objectiveRoutePlan(g,{},2,{}, {visible:true,distance:8},planners),null);
  const far=objectiveRoutePlan(g,{},2,{}, {visible:true,distance:70},planners);
  assert.equal(far.direction.reason,'mode-objective-plant');
});
test('Goal selector preserves a committed site, rejects bad map state, and does not add target limitations',()=>{
  const g=game(),mem={siteId:'B'};
  assert.equal(choosePublicObjective(g,mem).siteId,'B');
  g.modeState.sites=[{id:'A',x:NaN,z:0}];
  assert.equal(choosePublicObjective(g),null);
  assert.equal(choosePublicObjective({modeState:{type:'zm'},local:{mv:{x:0,z:0}}}),null);
});
test('S&D: hold F within plant radius instead of strafing off point',()=>{
  const g=game('snd',{}, {x:24,y:0,z:0});
  const p=objectiveRoutePlan(g,{},3,{},null,{});
  assert.equal(p.kind,'plant');assert.equal(p.interact,true);assert.equal(p.hold,true);
});
