// Deterministic, offline training-room benchmark for FPS Arena.
// It does NOT open a real network room or measure live server headshot rates.
// It reuses the shipped source's ballistics, head/body geometry and weapon tick.
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {WEAPONS,spreadFor} from '../tests/fixtures/game-shared/weapons.js';
import {PLAYER,LEAN} from '../tests/fixtures/game-shared/constants.js';
import {forwardVec,spreadDir,mulberry32,hashSeq,raySphere,rayAABB,rayWorld} from '../tests/fixtures/game-shared/geometry.js';
import {makeGunsState,stepWeapons} from '../tests/fixtures/game-shared/weaponstate.js';
import {acquireCombatTarget} from '../aim-core.mjs';
import {autoFireInput,manageResources} from '../combat-core.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const rng=mulberry32(0x1946A26);
const rand=(a,b)=>a+(b-a)*rng();
const pick=x=>x[Math.floor(rng()*x.length)];
const modeLoadouts={tdm:['m4a1','g17'],snd:['l115a3','g17'],hp:['fn_scar','g17'],br:['m4a1','makarov'],zm:['m249','g17']};
const distances={tdm:[5,10,18,30,48],snd:[12,22,45,65,90],hp:[5,9,17,27,42],br:[6,14,25,45,72],zm:[3.5,5,8,12,18,27]};
const options={enabled:true,mode:'autopilot',target:'head',priority:'threat',prediction:true,predictionMs:65,
 maxDistance:250,fov:180,visibility:true,sticky:false,autoReload:true,autoSwitch:true,weaponTactics:true,
 sidearmEmergencyRange:10};
const helpers={player:PLAYER,leanOffset:LEAN.offset,eyeHeightOf:()=>1.6,rayWorld,raySphere,rayAABB};
const ctx={alive:true,frozen:false,armor:50,maxArmor:50,plates:0};
const cmd=()=>({fire:false,aim:false,slot:-1,reload:false,plate:false});
function fixture(mode,weaponId,remote){
  const id2=modeLoadouts[mode][1];
  const ws=makeGunsState([{id:weaponId,mag:WEAPONS[weaponId].magSize,reserve:120},
    {id:id2,mag:WEAPONS[id2].magSize,reserve:30}],!['tdm','snd','hp'].includes(mode));
  const local={alive:true,hp:100,armor:50,plates:0,frozen:false,mv:{x:0,y:0,z:0,lean:0,onGround:true},ws};
  Object.defineProperty(local,'weapon',{get:()=>WEAPONS[ws.guns[ws.slot].id]});
  return {running:true,phase:'match',net:{id:'self'},local,pos:{x:0,y:0,z:0},
    map:{boxes:[],bound:200},modeState:{type:mode,ring:{cx:0,cz:0,r:40}},
    input:{locked:true,enabled:true},ads:{e:1},rig:{yaw:0,pitch:0},
    you:{tm:0},remotes:{list:mode==='zm'?[]:[remote]},bremotes:{list:[]},
    zremotes:{list:mode==='zm'?[remote]:[]}};
}
function hitClassification(actual,shot,mode,w){
  const o=[0,1.6,0],d=shot,lenLimit=w.maxRange;
  const h=actual.sliding?PLAYER.slideHeadY:PLAYER.headYs[actual.stance],
    bh=actual.sliding?PLAYER.slideBodyHeight:PLAYER.bodyH[actual.stance],
    hw=actual.stance===2?.55:PLAYER.bodyHalf;
  const sx=Math.cos(actual.yaw)*actual.lean*LEAN.offset,
        sz=-Math.sin(actual.yaw)*actual.lean*LEAN.offset;
  const head=raySphere(o,d,actual.pos.x+sx,actual.pos.y+h,actual.pos.z+sz,PLAYER.headRadius,lenLimit);
  const body=rayAABB(o,d,actual.pos.x+sx*.5-hw,actual.pos.y,actual.pos.z+sz*.5-hw,
    actual.pos.x+sx*.5+hw,actual.pos.y+bh,actual.pos.z+sz*.5+hw,lenLimit);
  return head<Infinity && head<=body+.2 ? 'head' : body<Infinity ? 'body' : 'miss';
}
function makeOpponent(index,d,latency,mode){
  const x=rand(-5,5),z=-d,
   vx=rand(-4.2,4.2),vz=rand(-3.2,3.2),vy=0;
  const stance=pick([0,0,0,1,2]);const lean=pick([-1,-.6,0,.6,1]);
  // Current client snapshot is latency seconds behind the authoritative pose.
  const historical={x:x-vx*latency,y:0,z:z-vz*latency};
  const t=20;
  const remote={id:'bot'+index,alive:true,invisible:false,pos:historical,stance,
    lean,yaw:rand(-Math.PI,Math.PI),sliding:Math.floor(index/14)%9===0,team:1,
    data:{ln:lean,hp:100,w:'m4a1'},buf:[
      {t:t-.05,x:historical.x-vx*.05,y:0,z:historical.z-vz*.05},
      {t,x:historical.x,y:0,z:historical.z}
    ]};
  const actual={...remote,pos:{x,y:0,z},lean};
  return {remote,actual};
}
function scenario(mode,index,stress=false){
 const weaponId=modeLoadouts[mode][0], w=WEAPONS[weaponId];
 const distance=pick(distances[mode]), latency=pick([.020,.035,.065,.09,.12]);
 const {remote,actual}=makeOpponent(index,distance,latency,mode);
 if(stress){
   // Unobserved target acceleration, abrupt Q/E lean change and occasional
   // unknown input latency.  No oracle data is made available to the aimer.
   if(rng()<.50)actual.pos.x+=rand(-.48,.48);
   if(rng()<.25)actual.pos.z+=rand(-.35,.35);
   if(rng()<.38)actual.lean=pick([-1,1]);
 }
 const game=fixture(mode,weaponId,remote);
 const goal=acquireCombatTarget(game,options,helpers);
 if(!goal || !goal.visible)return {acquired:false,mode,weaponId,distance};
 game.rig.yaw=goal.yaw;game.rig.pitch=goal.pitch;
 const planned=autoFireInput(game,cmd(),goal,helpers,options);
 const tick=stepWeapons(game.local.ws,planned,1/60,ctx);
 if(!tick.fired)return {acquired:true,fired:false,mode,weaponId,distance,reason:'not-triggered'};
 // Same spreading and head/body collision as server/combat.js (snapshot actual pose).
 const base=forwardVec(game.rig.yaw,game.rig.pitch);
 const impact=spreadDir(base,game.rig.yaw,spreadFor(w,planned.aim,true),mulberry32(hashSeq(index+9,0)));
 const hit=hitClassification(actual,impact,mode,w);
 return {acquired:true,fired:true,hit,mode,weaponId,distance};
}
const results=[];
for(const stress of [false,true])for(const mode of Object.keys(modeLoadouts)){
 const cases=400,shots=[];
 for(let n=0;n<cases;n++)shots.push(scenario(mode,n+mode.length*1000,stress));
 const acquired=shots.filter(x=>x.acquired).length,fired=shots.filter(x=>x.fired).length,
  hit=shots.filter(x=>x.hit&&x.hit!=='miss').length,head=shots.filter(x=>x.hit==='head').length;
 results.push({tier:stress?'stress':'controlled',mode,weapon:modeLoadouts[mode][0],cases,acquired,fired,hits:hit,headshots:head,
  firedRate:Math.round(100*fired/cases*100)/100,
  hitRateFired:fired?Math.round(100*hit/fired*100)/100:null,
  headshotRateHits:hit?Math.round(100*head/hit*100)/100:null,
  headshotRateFired:fired?Math.round(100*head/fired*100)/100:null});
}
let recordSummary={source:'none',matches:0,recordedZombieMatches:0,containsHeadLabels:false};
const argv=process.argv.slice(2),input=argv.includes('--record')?argv[argv.indexOf('--record')+1]:null;
if(input){
 const raw=JSON.parse(readFileSync(input,'utf8'));
 const records=raw.records||[];
 recordSummary={source:path.basename(input),records:records.length,matches:records.filter(r=>['tdm','snd','hp','br','zm'].includes(r?.meta?.mode)).length,
  byMode:Object.fromEntries(['tdm','snd','hp','br','zm'].map(m=>[m,records.filter(r=>r?.meta?.mode===m).length])),
  samples:records.reduce((a,r)=>a+(r.samples?.length||0),0),
  events:records.reduce((a,r)=>a+(r.events?.length||0),0),
  ownFireEvents:records.reduce((a,r)=>a+(r.events||[]).filter(e=>e.type==='own-fire').length,0),
  hitEvents:records.reduce((a,r)=>a+(r.events||[]).filter(e=>e.type==='hit').length,0),
  knownHeadshotEvents:records.reduce((a,r)=>a+(r.events||[]).filter(e=>e.data?.head===true).length,0),
  labeledHeadshots:records.some(r=>(r.events||[]).some(e=>Object.hasOwn(e.data||{},'head')))};
}
const totals=Object.fromEntries(['controlled','stress'].map(tier=>{
 const group=results.filter(r=>r.tier===tier);
 const t={cases:group.reduce((a,r)=>a+r.cases,0),fired:group.reduce((a,r)=>a+r.fired,0),
 hits:group.reduce((a,r)=>a+r.hits,0),headshots:group.reduce((a,r)=>a+r.headshots,0)};
 t.headshotRateHits=t.hits?Math.round(10000*t.headshots/t.hits)/100:null;
 return [tier,t];
}));
const payload={kind:'fpsarena-offline-simulation-v1',disclaimer:'Synthetic offline range, not an actual multiplayer room or observed PvP accuracy.',
 source:'FPS Arena shared weapons/movement/geometry, simulated latency+motion+lean, deterministic seed',
 targetHeadshotRateHitsPercent:90,realisticSpread:true,serverRewindApproximation:true,
 modes:results,totals,recordSummary};
const outDir=path.join(root,'reports');mkdirSync(outDir,{recursive:true});
writeFileSync(path.join(outDir,'SIMULATION_ALL_MODES.json'),JSON.stringify(payload,null,2)+'\n');
const md=['# FPS Arena v2.6.9 — Offline Match Lab','',
 '> **Not a live match.** Deterministic synthetic encounters with exact exported game geometry/spread/weaponstate; other engine components (network, full maps, physical bots, hit confirmation) are approximated.',
 '',`Target: **90% headshots among confirmed hits**, not a promised result.`,
 '', '| Mode | Weapon | Scenarios | Fired | Hits | Headshots | Hit / fired | Head / hit |',
 '|---|---|---:|---:|---:|---:|---:|---:|',
 ...results.map(r=>`| ${r.tier}/${r.mode} | ${r.weapon} | ${r.cases} | ${r.fired} | ${r.hits} | ${r.headshots} | ${r.hitRateFired}% | ${r.headshotRateHits}% |`),
 '',`Controlled: ${totals.controlled.headshots}/${totals.controlled.hits} hits were classified headshots (**${totals.controlled.headshotRateHits}%**).`,
 `Stress: ${totals.stress.headshots}/${totals.stress.hits} hits were classified headshots (**${totals.stress.headshotRateHits}%**).`,
 '', '## Method',
 '- 400 seeded encounters per mode PER TIER (controlled and stress). Opponents have varied distance, strafing velocity, stance, and Q/E lean.',
 '- Network snapshot delay sampled from 20, 35, 65, 90 and 120 ms. Extension uses 65 ms predictive aiming. Stress adds unobserved acceleration and abrupt lean changes.',
 '- Game engine head sphere/body AABB, ADS spread, seeded spread direction and weapon firing tick are reused.',
 '- Headshot classifications use the server rule `headIntersection <= bodyIntersection + 0.2`.',
 '- The purpose is comparative regression. There is no external live room, no server bot AI, no map occupancy/cover, and no verified headshot rate for real opponents.',
 '','## User Match Recorder evidence','',
 ...Object.entries(recordSummary).map(([k,v])=>`- ${k}: ${JSON.stringify(v)}`),
 '', '**Data gap:** This recording does not support a reliable 90% headshot measurement; use a server-acknowledged per-shot head/body result to validate in live tests.',
 ''];
writeFileSync(path.join(outDir,'SIMULATION_ALL_MODES.md'),md.join('\n'));
console.log(JSON.stringify({totals,results,recordSummary},null,2));
