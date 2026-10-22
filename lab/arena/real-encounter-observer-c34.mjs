// C34: passive, PUBLIC-predecision versus SERVER-postdecision world-frame observation.
// Research-only; does not alter the command, Game.step, safety gates, or packet delivery.
import {candidateSetC16} from './safe-action-explorer-c16.mjs';
const fin=Number.isFinite;
const fixed=(x)=>fin(x)?+x.toFixed(5):null;
const trimBox=b=>({x0:fixed(b.x0),x1:fixed(b.x1),y0:fixed(b.y0),y1:fixed(b.y1),z0:fixed(b.z0),z1:fixed(b.z1)});
const pos=o=>o&&[o.x,o.y,o.z].every(fin)?{x:fixed(o.x),y:fixed(o.y),z:fixed(o.z)}:null;
const copyCommand=c=>Object.fromEntries(['forward','backward','left','right','fire','aim','reload','jump','crouch','slide','prone','skill','use','throw','plate','interact'].map(k=>[k,!!c?.[k]]));
const dist2=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
export const C34_SCHEMA='fpsarena-c34-real-game-observation-v1';
export class RealEncounterObserverC34 {
 constructor({seed,map,loadout,lagMs,period=1.8,horizon=1.8,maxRecords=256}={}){
  if(!Number.isSafeInteger(seed)||!['arena','foundry','neon'].includes(map)||!fin(lagMs)||lagMs<0||lagMs>250||!(period>=horizon)||!(horizon>=.3)||!(maxRecords>0))throw Error('invalid C34 collector config');
  this.seed=seed;this.map=map;this.loadout=loadout;this.lagMs=lagMs;this.period=period;this.horizon=horizon;this.maxRecords=maxRecords;
  this.nextAt=0;this.windows=[];this.ignored={noLocal:0,noEnemy:0,noSnapshotTime:0};
 }
 // Called only AFTER all delivery packets and incumbent command calculation, BEFORE server read.
 preDecision(now,client,cmd){
  if(!fin(now)||now+1e-8<this.nextAt||this.windows.length>=this.maxRecords)return null;
  this.nextAt=now+this.period;
  const own=pos(client?.pos), remotes=(client?.remotes?.list||[]).filter(r=>r?.alive&&r.team!==client?.local?.team&&pos(r.pos));
  if(!own){this.ignored.noLocal++;return null;}
  if(!remotes.length){this.ignored.noEnemy++;return null;}
  remotes.sort((a,b)=>dist2(a.pos,own)-dist2(b.pos,own)||String(a.id).localeCompare(String(b.id)));
  const e=remotes[0], stamp=e.buf?.at(-1)?.t;
  if(!fin(stamp)){this.ignored.noSnapshotTime++;return null;}
  const localBoxes=(client?.map?.boxes||[]).filter(b=>
   [b.x0,b.x1,b.y0,b.y1,b.z0,b.z1].every(fin)&&
   own.x>=b.x0-9&&own.x<=b.x1+9&&own.z>=b.z0-9&&own.z<=b.z1+9);
  const gate=candidateSetC16(client,cmd,now,'tdm');
  const mv=client.local?.mv;
  const window={id:`${this.seed}:${this.windows.length}`,start:fixed(now),end:fixed(now+this.horizon),
   complete:null,censored:false,public:{
    now:fixed(now),own,ownVelocity:{vx:fixed(mv?.vx),vz:fixed(mv?.vz)},
    health:fixed(client.local?.hp),armor:fixed(client.local?.armor),weapon:client.local?.weapon?.id||null,
    enemy:{id:String(e.id),position:pos(e.pos),bodyYaw:fixed(e.yaw),weapon:String(e.data?.w||'').toLowerCase()||null,
      snapshotTime:fixed(stamp),snapshotAge:fixed(now-stamp)},
    incumbent:copyCommand(cmd),staticMap:{map:this.map,nearbyBoxes:localBoxes.slice(0,48).map(trimBox),count:localBoxes.length},
    eligibility:{eligible:gate.eligible,reasons:gate.reasons,clearance:gate.clearance}
   },
   // Server truth is filled by postDecision() ONLY; never passed back into client/controller.
   serverAfterDecision:null,
   outcome:{hostileWeaponHits:0,hostileDamage:0},
   actualCommand:null};
  this.windows.push(window);return window.id;
 }
 postDecision(id,world,trainee,command){
  if(id==null)return;
  const w=this.windows.at(-1);
  if(!w||w.id!==id||w.serverAfterDecision)throw Error('C34 postdecision ordering');
  const enemy=world.players.get(w.public.enemy.id);
  w.actualCommand=copyCommand(command);
  w.serverAfterDecision={own:pos(trainee),enemy:enemy?{id:enemy.id,position:pos(enemy),bodyYaw:fixed(enemy.yaw),
    weapon:enemy.ws?.guns?.[enemy.ws.slot]?.id||null,alive:!!enemy.alive}:null,
   mapBoxCount:world.map?.boxes?.length||0, tick:world.tick,
   note:'authoritative coordinates are retrospective audit only, NEVER pre-action input'};
 }
 serverWeaponHit(now,amount){
  if(!fin(now)||!fin(amount)||amount<=0)return;
  // Windows are non-overlapping. Do not attribute other-player damage or non-weapon damage.
  const w=this.windows.at(-1);
  if(w&&now>=w.start-1e-6&&now<w.end-1e-6){w.outcome.hostileWeaponHits++;w.outcome.hostileDamage=fixed(w.outcome.hostileDamage+amount);}
 }
 finish(now){
  if(!fin(now))throw Error('invalid finish timestamp');
  for(const w of this.windows){w.complete=now>=w.end-1e-6;w.censored=!w.complete;}
  return {schema:C34_SCHEMA,metadata:{seed:this.seed,map:this.map,loadout:this.loadout,snapshotLagMs:this.lagMs,
    period:this.period,horizon:this.horizon,observationOnly:true,productionActuation:false,
    independenceUnit:'game seed',infoBoundary:'PUBLIC before incumbent action; server truth AFTER command; no causal counterfactual labels',
    knownLimits:['local predicted own state is server-synchronized in this headless adapter','remote snapshots delayed but headless rendering interpolation differs from browser','no actual alternative-arm counterfactual']},
   windows:this.windows,diagnostics:{attempts:this.windows.length+Object.values(this.ignored).reduce((a,b)=>a+b,0),
    skipped:this.ignored,complete:this.windows.filter(w=>w.complete).length,eligible:this.windows.filter(w=>w.public.eligibility.eligible).length}};
 }
}
