// C12: in-match observational labels, entirely outside the browser agent.
// Features are frozen BEFORE the server steps and drawn only from the public,
// delayed HeadlessGame remote snapshots. The authoritative server supplies labels.
const ok=Number.isFinite;
const trim=(x,p=4)=>ok(x)?+x.toFixed(p):null;
function motion(remote){
 const b=remote?.buf;if(!Array.isArray(b)||b.length<2)return null;
 const a=b[b.length-2],z=b[b.length-1],dt=z?.t-a?.t;
 if(!ok(dt)||dt<.025||dt>.35||![a?.x,a?.z,z?.x,z?.z].every(ok))return null;
 const vx=(z.x-a.x)/dt,vz=(z.z-a.z)/dt;
 if(!ok(vx)||!ok(vz)||Math.hypot(vx,vz)>12.5)return null;
 return {vx,vz};
}
export function publicShotFeatures(client,now,cmd={}){
 if(!ok(now)||now<0)return null;
 const p=client?.pos,r=client?.remotes?.list;
 if(!p||![p.x,p.z].every(ok)||!Array.isArray(r))return null;
 const candidates=r.filter(v=>v&&v.alive&&v.team!==client?.local?.team&&
  [v?.pos?.x,v?.pos?.z].every(ok)).sort((a,b)=>{
   const da=Math.hypot(a.pos.x-p.x,a.pos.z-p.z),db=Math.hypot(b.pos.x-p.x,b.pos.z-p.z);
   return da-db||String(a.id).localeCompare(String(b.id));
  });
 const t=candidates[0],mv=t&&motion(t);
 const dx=t?.pos.x-p.x,dz=t?.pos.z-p.z,distance=t?Math.hypot(dx,dz):null;
 const ux=distance>1e-6?dx/distance:0,uz=distance>1e-6?dz/distance:0;
 const stamp=t?.buf?.at(-1)?.t,age=ok(stamp)?Math.max(0,now-stamp):null;
 const ws=client?.local?.ws;
 return {targetId:t?String(t.id):null,weaponId:String(ws?.guns?.[ws.slot]?.id||'unknown'),
  features:{distance:trim(distance),lateralSpeed:mv?trim(-uz*mv.vx+ux*mv.vz):null,
   radialSpeed:mv?trim(ux*mv.vx+uz*mv.vz):null,aim:cmd.aim===true?1:0,
   snapshotAge:trim(age),observedHostiles:candidates.length,
   onGround:client?.local?.mv?.onGround===true?1:0},
  provenance:{featureSource:'delayed-public-client-snapshot',targetAvailable:!!t,
   motionHistoryAvailable:!!mv}};
}
export class MatchEngagementRecorderC12 {
 constructor({matchId,mode,map,seed,profile,maximumShots=3000,encounterGapSeconds=4}={}){
  if(!matchId||!Number.isSafeInteger(seed)||maximumShots<1)throw Error('Invalid match recorder metadata');
  this.matchId=String(matchId);this.meta={mode,map,seed,profile};this.maximumShots=maximumShots;
  this.encounterGapSeconds=encounterGapSeconds;
  this.rows=[];this.lastObservation=null;this.byTick=new Map();this.lastShot=null;
  this.dropped=0;this.unpairedHitEvents=0;this.sequence=0;this.encounterSequence=0;
 }
 observe(now,client,cmd){this.lastObservation={time:now,shot:publicShotFeatures(client,now,cmd)};}
 serverEvent(time,tick,type,data){
  if(!ok(time)||!Number.isInteger(tick))return;
  if(type==='shot'&&data?.id==='trainee'){
   if(this.rows.length>=this.maximumShots){this.dropped++;return;}
   const seen=this.lastObservation;
   const state=seen?.shot||null;
   const sameEncounter=!!(this.lastShot&&time-this.lastShot.time<=this.encounterGapSeconds&&
    this.lastShot.targetId===state?.targetId);
   if(!sameEncounter)this.encounterSequence++;
   const row={schema:'fpsarena-c12-in-match-shot-v1',matchId:this.matchId,
    encounterId:`${this.matchId}/e${this.encounterSequence}`,shotId:`${this.matchId}/s${++this.sequence}`,
    mode:this.meta.mode,map:this.meta.map,seed:this.meta.seed,profile:this.meta.profile,
    time:trim(time,3),tick,weaponId:String(data?.w||state?.weaponId||'unknown'),
    targetId:state?.targetId??null,features:state?.features??null,
    provenance:state?.provenance??{featureSource:'missing'},
    labels:{serverShot:1,serverHit:0,serverHitEvents:0,serverDamage:0,serverKill:0},
    eligibility:{featureComplete:false,ambiguousShot:false,observationAgeSeconds:seen?trim(Math.max(0,time-seen.time)):null,
     labelSource:'server-hit-events',causal:false}};
   row.eligibility.featureComplete=!!(row.features&&row.targetId!==null&&
    Object.values(row.features).every(ok)&&row.features.snapshotAge<=.5&&
    row.eligibility.observationAgeSeconds<=.25);
   const previous=this.byTick.get(tick);
   if(previous){row.eligibility.ambiguousShot=true;previous.eligibility.ambiguousShot=true;}
   this.rows.push(row);this.byTick.set(tick,row);this.lastShot={time,targetId:row.targetId};
  } else if(type==='hit'){
   const row=this.byTick.get(tick);
   if(!row){this.unpairedHitEvents++;return;}
   row.labels.serverHit=1;row.labels.serverHitEvents++;
   row.labels.serverDamage+=Math.max(0,ok(data?.dmg)?data.dmg:0);
   if(data?.kill===true)row.labels.serverKill=1;
  }
 }
 finish(){return {schema:'fpsarena-c12-match-shot-collection-v1',matchId:this.matchId,...this.meta,
  counts:{serverShots:this.rows.length,eligibleShots:this.rows.filter(x=>x.eligibility.featureComplete&&!x.eligibility.ambiguousShot).length,
   hitShots:this.rows.filter(x=>x.labels.serverHit).length,encounters:new Set(this.rows.map(x=>x.encounterId)).size,
   dropped:this.dropped,unpairedHitEvents:this.unpairedHitEvents},shots:this.rows};}
}
