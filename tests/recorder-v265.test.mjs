import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {matchSample,safeMatchMeta} from '../match-recorder.mjs';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
test('telemetry captures gameplay but no credentials, page content or names',()=>{
 const g={matchId:'test123',modeState:{type:'zm'},local:{alive:true,hp:72,armor:20,
   mv:{x:2,y:1,z:3},ws:{slot:1,reloading:true,guns:[{id:'p08',mag:2,reserve:12},{id:'m4a1',mag:18,reserve:75}]}},
   rig:{yaw:1.4,pitch:.3},remotes:{list:[{id:'enemy123',alive:true,pos:{x:6,y:1,z:8},data:{w:'g17'}}]},
   zremotes:{list:[{alive:true,pos:{x:7,y:0,z:8}}]},loot:{data:{crates:[{id:12,x:5,y:0,z:3}]}}};
 const a=matchSample(g,{fire:true,slot:-1},null,{reason:'loot-route'},1.5);
 assert.equal(a.ws.guns[1].id,'m4a1');assert.equal(a.enemies.length,1);
 assert.equal(a.zombies.length,1);assert.equal(a.crates.length,1);
 assert.equal(a.decision.reason,'loot-route');
 assert.equal(safeMatchMeta(g).format,'fpsarena-match-telemetry-v1');
 const json=JSON.stringify(a);assert.ok(!json.includes('token'));assert.ok(!json.includes('password'));
});
test('background match records opt-in, persist, export, cap, close & clear',async()=>{
 const saved=new Map([['options',{recordMatches:true}],['customDomains',[]]]);
 const listeners={};
 const browser={
  storage:{local:{get:async names=>Object.fromEntries((typeof names==='string'?[names]:names).map(k=>[k,saved.get(k)])),
    set:async data=>{for(const [k,v] of Object.entries(data))saved.set(k,v);}},
    onChanged:{addListener:fn=>{listeners.storage=fn}}},
  permissions:{contains:async()=>false,onAdded:{addListener(){}},onRemoved:{addListener(){}}},
  contentScripts:{register:async()=>({unregister:async()=>{}})},
  tabs:{query:async()=>[],onRemoved:{addListener:fn=>{listeners.closed=fn}}},
  runtime:{onMessage:{addListener:fn=>{listeners.message=fn}}}
 };
 const ctx=vm.createContext({browser,URL,console,setInterval:()=>0,Date,JSON,Promise});
 vm.runInContext(readFileSync(path.join(root,'domain-utils.js'),'utf8'),ctx);
 vm.runInContext(readFileSync(path.join(root,'background.js'),'utf8'),ctx);
 const sender={tab:{id:99},url:'https://fps-arena-rosy.vercel.app/'};
 const append=(payload,s=sender)=>listeners.message({type:'fpsarena:record:append',payload},s);
 assert.equal((await append({kind:'start',matchId:'t1',meta:{mode:'zm',map:'arena'}})).ok,true);
 await append({kind:'sample',matchId:'t1',sample:{t:0,p:[0,0,0]}});
 await append({kind:'event',matchId:'t1',event:{type:'fire',t:.2}});
 assert.equal((await listeners.message({type:'fpsarena:record:export'})).record.samples.length,1);
 await append({kind:'end',matchId:'t1'});
 assert.equal((await listeners.message({type:'fpsarena:record:list'})).records.length,1);
 assert.ok(saved.get('fpsarenaMatchRecordsV1').length);
 assert.equal((await append({kind:'start',matchId:'evil'}, {tab:{id:20},url:'https://evil.example/'})).ok,false);
 await listeners.message({type:'fpsarena:record:clear'});
 assert.equal((await listeners.message({type:'fpsarena:record:list'})).records.length,0);
});
