import test from 'node:test';
import assert from 'node:assert/strict';
import {skillDecision} from '../skill-tactics.mjs';
import {SKILLS} from '../lab/arena/source/shared/skills.js';
import {Game as ServerGame} from '../lab/arena/source/server/game.js';

function game(id,energy=100,opts={}){
  const enemies=opts.enemies??[{id:'enemy',alive:true,team:1,pos:{x:10,z:0}}];
  return {phase:'match',modeState:{type:opts.mode||'tdm'},running:true,
    you:{tm:0,sk:{id,e:energy,ch:0,a:0},fxs:{}},
    local:{alive:true,down:false,frozen:false,hp:opts.hp??100,armor:opts.armor??50,
      mv:{x:0,y:0,z:0,onGround:true},ws:{slot:0,guns:[{mag:12,id:'m4a1'},{mag:8,id:'makarov'}],reloading:false}},
    remotes:{list:enemies},zremotes:{list:opts.zombies||[]},map:{boxes:[],bound:70}};
}
const base={skill:false,slot:-1,fire:false,reload:false,use:false,plate:false,interact:false,aim:true};
function decide(g,extra={},memo={},opts={}){return skillDecision(g,{...base,...extra},{now:10,targetDistance:opts.targetDistance??18,
    targetVisible:opts.targetVisible??false,ringUrgent:!!opts.ringUrgent,
    direction:opts.direction||{x:1,z:0}},memo,SKILLS,{safeDirection:()=>true,
    ringAllowed:()=>true,rayWorld:()=>9});}

test('Kinetic Armor activates under pressure with armor deficit and single T edge',()=>{
 const g=game('kinetic',100,{armor:20}),mem={};
 const a=decide(g,{},mem);assert.equal(a.input.skill,true);assert.equal(a.skill,'kinetic');
 assert.equal(decide(g,{},mem).input.skill,false,'release T after a cast');
 assert.equal(decide(g,{},mem).input.skill,false,'do not spam while server snapshot is stale');
 assert.equal(decide({...g,you:{...g.you,fxs:{ka:true}}}).input.skill,false,'active effect blocks recast');
});
test('Exoskeleton pre-engagement but never with enemy in melee',()=>{
 const g=game('exo',100,{enemies:[{id:'e',alive:true,team:1,pos:{x:29,z:0}}]});
 assert.equal(decide(g,{},{}).input.skill,true);
 g.remotes.list[0].pos.x=4;
 assert.equal(decide(g,{},{}).input.skill,false);
});
test('Poltergeist favors escape when weak; avoids breaking invisibility immediately',()=>{
 const g=game('polter',100,{hp:30,enemies:[{id:'e',alive:true,team:1,pos:{x:19,z:0}}]});
 assert.equal(decide(g,{},{}).input.skill,true);
 assert.equal(decide(g,{fire:true},{}).input.skill,false);
 g.you.sk.a=3;assert.equal(decide(g,{},{}).input.skill,false);
});
test('Scout Pulse chooses unseen close enemies, not empty air or far enemies',()=>{
 const g=game('pulse',100);
 assert.equal(decide(g,{},{}).input.skill,true);
 g.remotes.list[0].pos.x=35;assert.equal(decide(g,{},{}).input.skill,false);
});
test('Annihilator only when finisher is sensible and 3s unarmed cooldown is acceptable',()=>{
 const g=game('annih',100,{hp:40});
 assert.equal(decide(g,{}, {},{targetVisible:true,targetDistance:16}).input.skill,true);
 assert.equal(decide(g,{}, {},{targetVisible:false,targetDistance:16}).input.skill,false);
 assert.equal(decide(g,{}, {},{targetVisible:true,targetDistance:80}).input.skill,false);
 g.modeState.type='zm';assert.equal(decide(g,{}, {},{targetVisible:true,targetDistance:16}).input.skill,false);
});
test('Pad leaps in verified escape corridor but never into a wall or outside ring',()=>{
 const g=game('pad',100,{hp:50,enemies:[{id:'e',alive:true,team:1,pos:{x:6,z:0}}]});
 const on=decide(g,{},{});assert.equal(on.input.skill,true);assert.ok(Number.isFinite(on.input.__skillYaw));
 assert.equal(skillDecision(g,base,{now:10,direction:{x:1,z:0}}, {},SKILLS,{safeDirection:()=>false,ringAllowed:()=>true}).input.skill,false);
 assert.equal(skillDecision(g,base,{now:10,direction:{x:1,z:0}}, {},SKILLS,{safeDirection:()=>true,ringAllowed:()=>false}).input.skill,false);
});
test('Grappling hook uses a reachable wall and respects ring',()=>{
 const g=game('hook',100,{hp:40,enemies:[{id:'e',alive:true,team:1,pos:{x:7,z:0}}]});
 const c={now:10,direction:{x:1,z:0},targetDistance:8,targetVisible:false};
 assert.equal(skillDecision(g,base,c,{},SKILLS,{rayWorld:()=>12,ringAllowed:()=>true}).input.skill,true);
 assert.equal(skillDecision(g,base,c,{},SKILLS,{rayWorld:()=>40,ringAllowed:()=>true}).input.skill,false);
 assert.equal(skillDecision(g,base,c,{},SKILLS,{rayWorld:()=>12,ringAllowed:()=>false}).input.skill,false);
});
test('invalid state, energy, airborne, ongoing interactions never activate; manual inputs stay outside policy',()=>{
 for(const id of Object.keys(SKILLS)){
   const g=game(id,0,{hp:20});assert.equal(decide(g,{},{}).input.skill,false,id+' empty energy');
   g.you.sk.e=100;g.local.mv.air=true;assert.equal(decide(g,{},{}).input.skill,false,id+' airborne');
   g.local.mv.air=false;assert.equal(decide(g,{use:true},{}).input.skill,false,id+' interaction');
   g.local.alive=false;assert.equal(decide(g,{},{}).input.skill,false,id+' dead');
 }
});
test('real server accepts a skill input through normal queue and deducts energy',()=>{
 const g=new ServerGame({to(){return {emit(){}};}},'classic');g.config.mode='tdm';g.config.map='neon';
 const emitted=[];const p=g.addPlayer({id:'trainee',emit:(event,data)=>emitted.push({event,data})},{name:'Tester'});
 p.nextSkill='kinetic';g.startMatch();p.energy=100;p.armor=10;
 const before=p.energy;g.queueInput(p,{seq:1,ep:p.epoch,skill:true,slot:-1,lt:0});g.step();
 assert.equal(p.kaT>0,true);assert.ok(Math.abs(p.energy-(before-SKILLS.kinetic.cost))<.1,'energy deducted with passive regeneration');
 assert.equal(emitted.some(e=>e.event==='skill'&&e.data.id==='kinetic'),true);
 g.queueInput(p,{seq:2,ep:p.epoch,skill:true,slot:-1,lt:0});g.step();
 assert.equal(emitted.filter(e=>e.event==='skill').length,1,'held T never double-casts');
});
test('authoritative server spends energy for all non-travel skills through legal T-key input',()=>{
 for(const id of ['exo','kinetic','polter','annih','pulse','pad']){
   const events=[];const g=new ServerGame({to(){return {emit(){}};}},'classic');
   g.config.mode='tdm';g.config.map='neon';
   const p=g.addPlayer({id:'p',emit:(e,d)=>events.push({e,d})},{name:'Skill Tester'});
   p.nextSkill=id;g.startMatch();p.energy=100;
   g.queueInput(p,{seq:1,ep:p.epoch,skill:true,slot:-1,yaw:0,pitch:0,lt:0});g.step();
   assert.equal(events.filter(e=>e.e==='skill'&&e.d.id===id).length,1,id+' consumed by game');
   assert.ok(p.energy<100,id+' energy decremented');
 }
});
test('authoritative Grappling Hook requires a real wall and can activate through queue',async()=>{
 const {rayWorld,forwardVec}=await import('../lab/arena/source/shared/geometry.js');
 const {eyeOf}=await import('../lab/arena/source/server/combat.js');
 const events=[];const g=new ServerGame({to(){return {emit(){}};}},'classic');
 g.config.mode='tdm';g.config.map='neon';
 const p=g.addPlayer({id:'p',emit:(e,d)=>events.push({e,d})},{name:'Hook Tester'});
 p.nextSkill='hook';g.startMatch();p.energy=100;
 let chosen=null;
 for(let j=0;j<48;j++){
   const yaw=j*2*Math.PI/48,pitch=0,ray=forwardVec(yaw,pitch),d=rayWorld(eyeOf(p),ray,g.map.boxes,45);
   if(d>5&&d<36){chosen={yaw,pitch,d};break;}
 }
 assert.ok(chosen,'map has a reachable hook anchor');
 g.queueInput(p,{seq:1,ep:p.epoch,skill:true,slot:-1,yaw:chosen.yaw,pitch:0,lt:0});g.step();
 assert.equal(events.some(e=>e.e==='skill'&&e.d.id==='hook'),true,'hook server activation');
 assert.ok(p.energy<100,'energy spent only after a valid hit');
});

test('match telemetry records current skill energy and T presses without changing other input',async()=>{
 const {matchSample}=await import('../match-recorder.mjs');
 const g=game('exo',69);
 const sample=matchSample(g,{...base,skill:true},{id:'target',point:{x:10,y:1,z:0}}, {skill:'exo'},10);
 assert.deepEqual(sample.skill,{id:'exo',energy:69,active:0});
 assert.equal(sample.actions.skill,true);assert.equal(sample.decision.skill,'exo');
});
