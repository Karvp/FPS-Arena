import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const root=path.resolve(import.meta.dirname,'..');
function fakeElement(id='') {
  return {id,style:{},children:[],setAttribute(){},append(...items){this.children.push(...items);},remove(){},textContent:''};
}
test('page world integration patches actual Game/CameraRig module identities',async()=>{
  const events=new EventTarget();
  const elements=new Map();
  globalThis.document={
    addEventListener:(...args)=>events.addEventListener(...args),
    dispatchEvent:(...args)=>events.dispatchEvent(...args),
    querySelector:(selector)=>selector==='#screen-game.active'?{}:null,
    createElement:()=>fakeElement(),
    body:{append:(...items)=>items.forEach(item=>elements.set(item.id,item))},
    getElementById:(id)=>elements.get(id),
  };
  globalThis.window={addEventListener:()=>{}};
  globalThis.innerWidth=1280;
  globalThis.innerHeight=720;
  const URLs={
    "'/client/game.js'": pathToFileURL(path.join(root,'tests/fixtures/client/game.mjs')).href,
    "'/client/camera.js'": pathToFileURL(path.join(root,'tests/fixtures/client/camera.mjs')).href,
    "'/shared/constants.js'": pathToFileURL(path.join(root,'tests/fixtures/shared/constants.mjs')).href,
    "'/shared/geometry.js'": pathToFileURL(path.join(root,'tests/fixtures/shared/geometry.mjs')).href,
    "'/shared/movement.js'": pathToFileURL(path.join(root,'tests/fixtures/shared/movement.mjs')).href,
    "'/shared/weaponstate.js'": pathToFileURL(path.join(root,'tests/fixtures/shared/weaponstate.mjs')).href,
    "'/shared/skills.js'": pathToFileURL(path.join(root,'tests/fixtures/shared/skills.mjs')).href,
    "'/shared/weapons.js'": pathToFileURL(path.join(root,'tests/fixtures/shared/weapons.mjs')).href,
    "'/shared/rarity.js'": pathToFileURL(path.join(root,'tests/fixtures/shared/rarity.mjs')).href,
  };
  let agent=fs.readFileSync(path.join(root,'page-agent.js'),'utf8');
  for(const [specifier, url] of Object.entries(URLs)) agent=agent.replaceAll(`import(${specifier})`, `import(${JSON.stringify(url)})`);
  const ready = new Promise((resolve,reject)=>{
    const tm=setTimeout(()=>reject(Error('Agent did not connect in 2 seconds')),2000);
    events.addEventListener('fpsarena-aim:status',(e)=>{
      const d=JSON.parse(e.detail);
      if(d.state==='ready'&&d.message==='Connected to FPS Arena') {clearTimeout(tm);resolve(d);}
      if(d.state==='error') {clearTimeout(tm);reject(Error(d.message));}
    });
  });
  await import('data:text/javascript;base64,'+Buffer.from(agent).toString('base64'));
  await ready;
  const {Game}=await import('./fixtures/client/game.mjs');
  const game=new Game();
  game.frame(.016,true,false);
  assert.equal(game.rig.yaw,0,'disabled by default');
  events.dispatchEvent(new CustomEvent('fpsarena-aim:config',{detail:JSON.stringify({enabled:true,activation:'ads',fov:20,smoothing:0,maxDistance:100})}));
  game.frame(.016,true,false);
  assert.ok(game.rig.yaw < -0.09 && game.rig.yaw > -0.11,`expected negative yaw, got ${game.rig.yaw}`);
  assert.ok(game.rig.pitch>0,'head aim raises pitch');
  assert.ok(elements.has('fpsarena-aim-ui'),'overlay created');
  const firstYaw=game.rig.yaw;
  game.input.aimHeld=false;
  game.frame(.016,true,false);
  assert.equal(game.rig.yaw,firstYaw,'releasing ADS pauses aim');
  game.input.aimHeld=true;game.local.alive=false;game.rig.yaw=0;
  game.frame(.016,true,false);
  assert.equal(game.rig.yaw,0,'eliminated player cannot aim');
  game.local.alive=true;
  game.rig.yaw=0;game.rig.pitch=0;
  game.remotes.list=[{id:'enemy',pos:{x:0,y:0,z:18},team:1,alive:true,invisible:false,yaw:0,stance:0,sliding:false,data:{aim:1,pitch:0}}];
  events.dispatchEvent(new CustomEvent('fpsarena-aim:config',{detail:JSON.stringify({enabled:true,activation:'ads',dodge:true,esp:true})}));
  game.simTick();
  assert.equal(game.sampled.left,true,'predictive evasion affects actual sampled movement');
  assert.equal(game.sampled.fire,true,'firing preserved');
  assert.equal(game.input.sample().forward,true,'sample method restored after tick');
  game.rig.camera.matrixWorldInverse={elements:[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]};
  game.rig.camera.projectionMatrix={elements:[1,0,0,0,0,1,0,0,0,0,-1,-1,0,0,-.2,0]};
  game.remotes.list[0].pos.z=-18;
  game.frame(.016,true,false);
  const overlay=elements.get('fpsarena-aim-ui');
  assert.ok(overlay.children.some(el=>el.children?.some?.(child=>child.__label)), 'ESP built a DOM element for a projected enemy');
  // Opt-in Autopilot must aim, supply ADS and fire through ordinary sampled input.
  game.remotes.list[0].pos={x:0,y:0,z:-14};
  game.remotes.list[0].data={hp:100,aim:0,pitch:0};
  game.rig.yaw=1.7;game.rig.pitch=0;
  game.input.aimHeld=false;
  game.local.ws={slot:0,guns:[{id:'rifle',mag:25},{id:'sidearm',mag:8}],switchT:0,plateT:0,cd:0,wind:0,reloading:false,finite:false};
  game.local.weapon={magSize:30,infinite:false,auto:true};
  events.dispatchEvent(new CustomEvent('fpsarena-aim:config',{detail:JSON.stringify({
    enabled:true,mode:'autopilot',smoothing:0,maxDistance:100,trigger:true,tactical:true,autoPeek:true
  })}));
  game.frame(.016,true,false);
  assert.ok(Math.abs(game.rig.yaw)<.002,'autopilot turns toward enemy even with ADS released');
  assert.equal(game.input.aimHeld,false,'forced ADS is restored outside frame');
  game.simTick();
  assert.equal(game.sampled.fire,true,'autopilot trigger fires on valid LOS');
  assert.equal(game.sampled.aim,false,'close autopilot shot may be hip-fired; ADS is not mandatory');
  // Early BR rotation must not turn off an otherwise legal self-defense shot.
  game.modeState={type:'br',ring:{cx:0,cz:0,r:70,phase:'wait',next:18,nxt:{cx:-26,cz:0,r:18}}};
  game.you={tm:0,ringRate:0};game.map={boxes:[],bound:90};
  game.local.hp=100;game.local.armor=50;
  game.local.mv={x:0,y:0,z:0,lean:0,onGround:true,vx:0,vz:0};
  game.pos={x:0,y:0,z:0};
  game.remotes.list[0].pos={x:0,y:0,z:-14};
  game.rig.yaw=0;game.rig.pitch=0;
  events.dispatchEvent(new CustomEvent('fpsarena-aim:config',{detail:JSON.stringify({
    enabled:true,mode:'autopilot',autoLoot:false,brAggression:80,brLeadSeconds:24,fastAim:true
  })}));
  game.simTick();
  assert.equal(game.sampled.fire,true,'soft BR pre-rotation maintains defensive shooting');
  assert.equal(game.sampled.left,true,'soft BR rotation progresses toward next-circle center');
  // Sniper must retain proactive scope/target lock during non-urgent rotation,
  // including enemies outside the previous universal 130 m acquisition cap.
  const {WEAPONS}=await import('./fixtures/game-shared/weapons.js');
  game.map={boxes:[],bound:240};
  game.modeState={type:'br',ring:{cx:0,cz:0,r:200,phase:'wait',next:18,nxt:{cx:-25,cz:0,r:18}}};
  game.local.weapon=WEAPONS.l115a3;
  game.local.ws={slot:0,guns:[{id:'l115a3',mag:5,reserve:20},{id:'g17',mag:17,reserve:30}],switchT:0,plateT:0,cd:0,wind:0,reloading:false,finite:true,prevFire:false};
  game.remotes.list[0].pos={x:0,y:0,z:-155};
  game.rig.yaw=1.9;game.rig.pitch=0;
  game.frame(.016,true,false);
  assert.ok(Math.abs(game.rig.yaw)<.002,'soft rotation must not clear sniper camera lock');
  game.simTick();
  assert.equal(game.sampled.fire,true,'sniper can fire distant enemy during pre-rotation');
  assert.equal(game.sampled.aim,true,'sniper ADS is active during safe pre-rotation');
  // v2.6.0 regression: a hidden sniper target can produce a precision cache
  // entry with goal:null; generic pathfinding must not access goal.x.
  game.modeState={type:'tdm'};
  game.map={boxes:[{x0:-2,x1:2,y0:0,y1:5,z0:-11,z1:-8}],bound:240};
  game.remotes.list[0].pos={x:0,y:0,z:-155};
  globalThis.__fpsFixtureRayBlocked=true;
  events.dispatchEvent(new CustomEvent('fpsarena-aim:config',{detail:JSON.stringify({
    enabled:true,mode:'autopilot',autoLoot:false,pathfinding:true,dodge:false,
    autoReload:false,autoSwitch:false,autoArmor:false,fastAim:true
  })}));
  assert.doesNotThrow(()=>game.simTick(),
    'no available precision sightline must not crash the simulation input sampler');
  assert.equal(typeof game.sampled,'object','sampled input remains usable with occluded sniper target');
  // Repeated ticks reuse the null-goal precision entry and must also survive.
  assert.doesNotThrow(()=>game.simTick(),'repeat hidden-target tick cannot reuse a null navigation goal');
  globalThis.__fpsFixtureRayBlocked=false;
  // Even unforeseen future agent exceptions must leave Game.simTick running and
  // preserve unmodified human input, then suspend autopilot.
  const faultMessages=[];
  events.addEventListener('fpsarena-aim:status', e=>{
    const data=JSON.parse(e.detail);if(data.state==='error')faultMessages.push(data.message);
  });
  globalThis.__fpsFixtureRayThrows=true;
  assert.doesNotThrow(()=>game.simTick(),'extension raycast failure must not break game tick');
  assert.equal(game.sampled.forward,true,'fail-open fallback preserves original input');
  assert.ok(faultMessages.some(message=>message.includes('Synthetic raycast failure')),
    'failure is explicitly reported rather than silently swallowed');
  globalThis.__fpsFixtureRayThrows=false;
  events.dispatchEvent(new CustomEvent('fpsarena-aim:config',{detail:JSON.stringify({
    enabled:true,mode:'autopilot',pathfinding:false,recoil:true
  })}));
  game.map={boxes:[],bound:240};
  game.modeState={type:'br',ring:{cx:0,cz:0,r:200,phase:'wait',next:18,nxt:{cx:-25,cz:0,r:18}}};
  game.local.weapon={magSize:30,infinite:false,auto:true};
  game.local.ws={slot:0,guns:[{id:'rifle',mag:25},{id:'sidearm',mag:8}],switchT:0,plateT:0,cd:0,wind:0,reloading:false,finite:false};
  game.remotes.list[0].pos={x:0,y:0,z:-14};
  game.rig.yaw=0;game.rig.pitch=0;
  // Actual ring loss must preempt shooting and prioritise running instead.
  game.local.mv.x=73;game.pos.x=73;
  game.simTick();
  assert.equal(game.sampled.fire,false,'hard BR escape suppresses shots');
  assert.equal(game.sampled.reload,false,'hard BR escape suppresses reloads');
  game.modeState={type:'tdm'};game.local.mv.x=0;game.pos.x=0;
  // Recoil compensation should affect the visual camera only, without changing the shot.
  events.dispatchEvent(new CustomEvent('fpsarena-aim:config',{detail:JSON.stringify({
    enabled:true,mode:'autopilot',recoil:true
  })}));
  const before=[game.rig.yaw,game.rig.pitch];
  game.onFire();
  assert.ok(Math.abs(game.rig.yaw-before[0])<1e-8,'camera yaw recoil compensated');
  assert.ok(Math.abs(game.rig.pitch-before[1])<1e-8,'camera pitch recoil compensated');
  assert.equal(game.recoilPool,0,'deferred recoil recovery removed');
  // Latest game scorestreak views override the normal camera and input stream.
  // While controlling the chopper the Suite must not steal 1/2/3 streak inputs,
  // force ADS, rotate the player camera, or mutate attack commands.
  game.local.inView=true;
  game.you={tm:0,ss:{view:{k:'chopper',x:5,y:20,z:5}}};
  game.rig.yaw=1.25;
  game.input.aimHeld=false;
  game.input.sample=()=>({streak:2,fire:true,aim:false,forward:true});
  game.frame(.016,true,false);
  assert.equal(game.rig.yaw,1.25,'vehicle view does not use aimbot');
  assert.equal(game.input.aimHeld,false,'vehicle view does not force ADS');
  game.simTick();
  assert.deepEqual(game.sampled,{streak:2,fire:true,aim:false,forward:true},'scorestreak controls are left intact');
  game.local.inView=false;game.you.ss.view=null;
  delete globalThis.document; delete globalThis.window;
});
