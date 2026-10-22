import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const root=path.resolve(import.meta.dirname,'..');
const fakeEl=()=>({style:{},children:[],setAttribute(){},append(...x){this.children.push(...x);},remove(){},textContent:''});
test('Zombies does not permanently disable Autopilot after one tick failure; recorder tracks independent sessions',async()=>{
 const events=new EventTarget(),telemetry=[],errors=[];
 globalThis.document={addEventListener:(...a)=>events.addEventListener(...a),dispatchEvent:(...a)=>events.dispatchEvent(...a),
  createElement:()=>fakeEl(),body:{append(){}},querySelector:()=>null};
 globalThis.window={addEventListener:()=>{}};globalThis.innerWidth=1280;globalThis.innerHeight=720;
 events.addEventListener('fpsarena-aim:record',e=>telemetry.push(JSON.parse(e.detail)));
 events.addEventListener('fpsarena-aim:status',e=>{const x=JSON.parse(e.detail);if(x.state==='error')errors.push(x.message)});
 const dict={
  '/client/game.js':'tests/fixtures/client/game.mjs','/client/camera.js':'tests/fixtures/client/camera.mjs',
  '/shared/constants.js':'tests/fixtures/shared/constants.mjs','/shared/geometry.js':'tests/fixtures/shared/geometry.mjs',
  '/shared/movement.js':'tests/fixtures/shared/movement.mjs','/shared/skills.js':'tests/fixtures/shared/skills.mjs',
  '/shared/weapons.js':'tests/fixtures/shared/weapons.mjs','/shared/rarity.js':'tests/fixtures/shared/rarity.mjs'
 };
 let src=fs.readFileSync(path.join(root,'page-agent.js'),'utf8');
 for(const [specifier,relative] of Object.entries(dict))
  src=src.replaceAll(`import('${specifier}')`, `import(${JSON.stringify(pathToFileURL(path.join(root,relative)).href)})`);
 const loaded=new Promise((resolve,reject)=>{
  const tm=setTimeout(()=>reject(Error('agent initialization timeout')),2000);
  events.addEventListener('fpsarena-aim:status',e=>{if(JSON.parse(e.detail).message==='Connected to FPS Arena'){clearTimeout(tm);resolve();}});
 });
 await import('data:text/javascript;base64,'+Buffer.from(src).toString('base64'));await loaded;
 const {Game}=await import('./fixtures/client/game.mjs');
 const game=new Game();game.matchId='zombie-round-1';game.modeState={type:'zm'};game.local.hp=100;game.local.armor=50;
 game.local.ws={slot:0,guns:[{id:'m4a1',mag:30,reserve:90},{id:'g17',mag:15,reserve:45}],reloading:false,switchT:0,plateT:0,cd:0,wind:0,finite:true};
 game.local.weapon=(await import('./fixtures/game-shared/weapons.js')).WEAPONS.m4a1;
 game.zremotes.list=[{id:'z1',pos:{x:0,y:0,z:-12},alive:true,stance:0,sliding:false,yaw:0,data:{}}];
 events.dispatchEvent(new CustomEvent('fpsarena-aim:config',{detail:JSON.stringify({enabled:true,mode:'autopilot',recordMatches:true,autoLoot:false,dodge:false,fastAim:true})}));
 game.onSnap({pj:[]});
 assert.equal(telemetry.some(x=>x.kind==='start' && x.meta.mode==='zm'),true);
 assert.equal(telemetry.some(x=>x.kind==='sample'),true,'recorder emits real samples');
 globalThis.__fpsFixtureRayThrows=true;game.simTick();
 assert.ok(errors.length>0,'first unexpected raycast error is reported');
 globalThis.__fpsFixtureRayThrows=false;
 // Re-enabling or reapplying settings must immediately recover, not wait out cooldown.
 events.dispatchEvent(new CustomEvent('fpsarena-aim:config',{detail:JSON.stringify({enabled:true,mode:'autopilot',recordMatches:true,autoLoot:false,dodge:false,fastAim:true})}));
 game.simTick();
 assert.ok(game.sampled,'Zombies simulation keeps receiving input');
 assert.equal(game.sampled.fire,true,'Autopilot resumes close-range hip-fire without a permanent OFF state');
 game.matchId='zombie-round-2';game.onSnap({pj:[]});
 assert.equal(telemetry.some(x=>x.kind==='end' && x.matchId.includes('round-1')),true);
 assert.equal(telemetry.some(x=>x.kind==='start' && x.matchId.includes('round-2')),true);
});
