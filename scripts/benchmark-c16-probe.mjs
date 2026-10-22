#!/usr/bin/env node
// Small deterministic microbenchmark. Benchmarked function only: no Game.step,
// no rendering/network; NOT an estimate of browser FPS or causal game gains.
import {writeFileSync,mkdirSync} from 'node:fs';
import {candidateSetC14,candidateSetC16} from '../lab/arena/safe-action-explorer-c16.mjs';
const client=()=>({pos:{x:0,y:0,z:0},map:{bound:80,boxes:Array.from({length:220},(_,i)=>{
 const x=10+(i%20)*2,z=10+Math.floor(i/20)*2;
 return {x0:x,x1:x+1,z0:z,z1:z+1,y0:-1,y1:5};})},rig:{yaw:0},
 local:{team:'red',alive:true,hp:100,armor:50,maxArmor:100,
  weapon:{magSize:30},ws:{slot:0,guns:[{id:'mp5sd',mag:20}]},mv:{x:0,y:0,z:0,onGround:true,stance:0}},
 remotes:{list:[{id:'enemy',team:'blue',alive:true,pos:{x:40,z:0},
  buf:[{t:.9,x:39.8,z:0},{t:1,x:40,z:0}]}]}});
const c=client();
const modes=[{name:'priority-rejected',cmd:{fire:true}},{name:'distance-rejected',cmd:{},change:r=>{r.remotes.list[0].pos.x=105;r.remotes.list[0].buf=[{t:.9,x:105,z:0},{t:1,x:105,z:0}];}},
 {name:'eligible-clear',cmd:{}}];
const result=[];
const iterations=1800,rounds=5;
for(const mode of modes){
 const d=client();mode.change?.(d);
 const old=candidateSetC14(d,mode.cmd,1.065),now=candidateSetC16(d,mode.cmd,1.065);
 if(old.eligible!==now.eligible||old.reasons[0]!==now.reasons[0])throw Error('semantic mismatch '+mode.name);
 const measure=fn=>{
  const t0=process.hrtime.bigint();let n=0;
  for(let i=0;i<iterations;i++)n+=fn(d,mode.cmd,1.065).eligible?1:0;
  return {ms:Number(process.hrtime.bigint()-t0)/1e6,valid:n};
 };
 for(let i=0;i<100;i++){candidateSetC14(d,mode.cmd,1.065);candidateSetC16(d,mode.cmd,1.065);}
 const measurements=[];
 for(let k=0;k<rounds;k++){
  // Alternate order to reduce warm-up effect.
  const a=k%2?measure(candidateSetC16):measure(candidateSetC14);
  const b=k%2?measure(candidateSetC14):measure(candidateSetC16);
  measurements.push({c15Ms:(k%2?b:a).ms,c16Ms:(k%2?a:b).ms});
 }
 const med=a=>[...a].sort((x,y)=>x-y)[Math.floor(a.length/2)];
 const c15=med(measurements.map(x=>x.c15Ms)),c16=med(measurements.map(x=>x.c16Ms));
 result.push({scenario:mode.name,iterationsPerRound:iterations,rounds,c15MedianMs:c15,c16MedianMs:c16,
  speedup:c15/c16,semanticsEqual:true,measurements});
}
const file=process.argv[2]||'reports/c16/probe-microbenchmark.json';
mkdirSync(file.slice(0,file.lastIndexOf('/')),{recursive:true});
writeFileSync(file,JSON.stringify({schema:'fpsarena-c16-probe-microbench-v1',
 cpuMeasure:'process.hrtime.bigint',scope:'candidateSet only; static synthetic public geometry',
 excludes:['client frame','headless Game.step','GC-controlled benchmark','browser FPS'],result},null,2)+'\n');
console.log(JSON.stringify(result.map(x=>({scenario:x.scenario,speedup:x.speedup,c15Ms:x.c15MedianMs,c16Ms:x.c16MedianMs})),null,2));
