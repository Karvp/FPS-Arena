import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pathToFileURL,fileURLToPath} from 'node:url';
import path from 'node:path';
import {Game} from '../lab/arena/headless-client.mjs';
import {WEAPONS} from '../lab/arena/source/shared/weapons.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),dir=path.join(root,'lab','arena');
function fake(tag=''){return {tagName:tag,style:{},children:[],append(...a){this.children.push(...a)},remove(){},setAttribute(){},getContext(){return null}};}
const bus=new EventTarget();
globalThis.document={addEventListener:(...a)=>bus.addEventListener(...a),dispatchEvent:(...a)=>bus.dispatchEvent(...a),
  querySelector:selector=>selector==='#hud.active'?{}:null,
  createElement:tag=>fake(tag),body:{append(){}}};
globalThis.window={addEventListener(){}};globalThis.innerWidth=1280;globalThis.innerHeight=720;
let agent=readFileSync(path.join(root,'page-agent.js'),'utf8');
for(const [p,to] of Object.entries({
 '/client/game.js':'./headless-client.mjs','/client/camera.js':'./headless-camera.mjs',
 ...Object.fromEntries(['constants','geometry','movement','skills','weapons','rarity'].map(k=>['/shared/'+k+'.js','./source/shared/'+k+'.js']))
}))agent=agent.replaceAll(`import('${p}')`,`import(${JSON.stringify(pathToFileURL(path.join(dir,to)).href)})`);
let installed=false;
bus.addEventListener('fpsarena-aim:status',e=>{try{if(JSON.parse(e.detail).state==='ready')installed=true;}catch{}});
await import('data:text/javascript;base64,'+Buffer.from(agent).toString('base64'));
for(let i=0;!installed&&i<150;i++)await new Promise(r=>setTimeout(r,5));
assert.equal(installed,true,'could not mount bundled page-agent.js');
function key(code,tag='BODY',repeat=false){const e=new Event('keydown',{cancelable:true});
 Object.defineProperties(e,{code:{value:code},repeat:{value:repeat},target:{value:{tagName:tag}}});
 bus.dispatchEvent(e);return e;
}
function makeGame(){const g=new Game();g.local.alive=true;g.local.weapon=WEAPONS.m4a1;
 g.local.ws={slot:0,guns:[{id:'m4a1',mag:30,reserve:90},{id:'g17',mag:15,reserve:30}],cd:0,plateT:0,switchT:0};
 return g;}
test('pressing V while aim assistant disabled still generates server-valid slot input',()=>{
 const g=makeGame();key('KeyV');const s=g.simTick();assert.equal(s.slot,1);
 assert.equal(g.simTick().slot,-1,'must be single input edge, not endless toggling');
});
test('typing, repeats and mouse-unlocked states do not hijack the weapon',()=>{
 const g=makeGame();key('KeyV','INPUT');assert.equal(g.simTick().slot,-1);
 key('KeyV','BODY',true);assert.equal(g.simTick().slot,-1);
 g.local.ws.plateT=1;key('KeyV');assert.equal(g.simTick().slot,-1);
});
test('Autopilot is never overridden by a human weapon hotkey',()=>{
 bus.dispatchEvent(new CustomEvent('fpsarena-aim:config',{detail:JSON.stringify({mode:'autopilot',enabled:false,switchWeaponKey:'KeyV'})}));
 const g=makeGame();key('KeyV');assert.equal(g.simTick().slot,-1);
});
