import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {stabilizeMovement} from '../motion-stabilizer.mjs';
import {ringSafetyPlan} from '../loot-core.mjs';
const root=path.resolve(import.meta.dirname,'..');
const input={forward:false,backward:false,left:false,right:false,fire:true,aim:true};

test('movement stabilizer avoids 60Hz forward/backward oscillation and preserves fire',()=>{
 const mem={}; let s=stabilizeMovement(input,{x:0,z:-1,reason:'pro-brake'},0,1,mem);
 assert.equal(s.forward,true);assert.equal(s.fire,true);
 for(let i=0;i<6;i++){
  s=stabilizeMovement(input,{x:0,z:i%2===0?1:-1,reason:'pro-brake'},0,1+i/60,mem,{safePrevious:()=>true});
  assert.notEqual(s.backward,true,'do not key flip-flop each tick');
 }
 const now=stabilizeMovement(input,{x:0,z:1,reason:'br-ring-escape'},0,1.11,mem);
 assert.equal(now.backward,true,'ring must immediately override the movement hysteresis');
 assert.equal(now.forward,false);
});

test('motion zero target stops moving instead of reusing raw keyboard movement',()=>{
 const out=stabilizeMovement({...input,forward:true},{x:0,z:0,reason:'pro-hold-no-exit'},0,1,{});
 assert.deepEqual([out.forward,out.backward,out.left,out.right],[false,false,false,false]);
 const absent=stabilizeMovement({...input,backward:true},null,0,1,{});
 assert.deepEqual([absent.forward,absent.backward,absent.left,absent.right],[false,false,false,false]);
});

test('next BR barrier is selected earlier and becomes urgent on shrink',()=>{
 const g={modeState:{type:'br',ring:{cx:0,cz:0,r:95,phase:'wait',next:29,nxt:{cx:65,cz:0,r:21}}},local:{alive:true,mv:{x:0,y:0,z:0}},you:{ringRate:0}};
 const soft=ringSafetyPlan(g,{brLeadSeconds:24});assert.ok(soft?.goal.x>40,'move ahead of shrink');
 g.modeState.ring.phase='shrinking';const hard=ringSafetyPlan(g,{brLeadSeconds:24});
 assert.equal(hard?.urgent,true);
 g.local.mv.x=100;assert.equal(ringSafetyPlan(g)?.outside,true);
});

test('generated page agent embeds recorder code and references live functions',()=>{
 const source=readFileSync(path.join(root,'page-agent.js'),'utf8');
 assert.match(source,/function matchSample\(/);
 assert.match(source,/function safeMatchMeta\(/);
 assert.match(source,/function stabilizeMovement\(/);
 assert.match(source,/recordEmit\('sample'/);
 assert.match(source,/faultEpoch\+\+/);
});

test('Match Recorder retains multiple Classic/Zombies/BR sessions and exports all with restart persistence',async()=>{
 const saved=new Map([['options',{recordMatches:true}],['customDomains',[]]]);
 const setup=()=>{
  const hooks={};
  const browser={
   storage:{local:{get:async keys=>Object.fromEntries((typeof keys==='string'?[keys]:keys).map(k=>[k,saved.get(k)])),
     set:async pairs=>{for(const [k,v] of Object.entries(pairs))saved.set(k,v);}},
     onChanged:{addListener(fn){hooks.changed=fn;}}},
   permissions:{contains:async()=>false,onAdded:{addListener(){}},onRemoved:{addListener(){}}},
   contentScripts:{register:async()=>({unregister:async()=>{}})},
   tabs:{query:async()=>[],onRemoved:{addListener(fn){hooks.close=fn;}}},
   runtime:{onMessage:{addListener(fn){hooks.message=fn;}}}
  };
  const ctx=vm.createContext({browser,URL,console,setInterval:()=>0,Date,JSON,Promise});
  vm.runInContext(readFileSync(path.join(root,'domain-utils.js'),'utf8'),ctx);
  vm.runInContext(readFileSync(path.join(root,'background.js'),'utf8'),ctx);
  return hooks;
 };
 let hooks=setup();
 const sender={tab:{id:41},url:'https://fps-arena-rosy.vercel.app/'};
 const send=p=>hooks.message({type:'fpsarena:record:append',payload:p},sender);
 for(let i=0;i<9;i++){
  const id='session-'+i,mode=['tdm','zm','br'][i%3];
  assert.equal((await send({kind:'start',matchId:id,meta:{mode,map:'arena'}})).ok,true);
  await send({kind:'sample',matchId:id,sample:{t:i,p:[i,0,0]}});
  await send({kind:'event',matchId:id,event:{t:i,type:'combat'}});
  await send({kind:'end',matchId:id});
 }
 const all=(await hooks.message({type:'fpsarena:record:export-all'})).records;
 assert.equal(all.length,9,'do not lose prior matches');
 assert.deepEqual(Array.from(new Set(all.map(r=>r.meta.mode))).sort(),['br','tdm','zm']);
 assert.ok(all.every(r=>r.samples.length===1&&r.events.length===1));
 hooks=setup();
 const again=(await hooks.message({type:'fpsarena:record:export-all'})).records;
 assert.equal(again.length,9,'persistent across background restart');
 await hooks.message({type:'fpsarena:record:clear'});
 assert.equal(saved.get('options').recordMatches,true,'clear history must not unexpectedly turn recorder off');
 assert.equal((await hooks.message({type:'fpsarena:record:list'})).records.length,0);
});
