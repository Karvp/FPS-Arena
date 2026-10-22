// C13 research-only recorder. All features are frozen from client-visible state
// BEFORE Game.step() and must never inspect enemy positions on ServerGame.
// The selected command is a behavior-cloning label, NOT an optimal-action label.
import {publicShotFeatures} from './match-engagement-recorder-c12.mjs';
const finite=Number.isFinite;
const round=(x)=>finite(x)?+x.toFixed(5):null;
export const C13_ACTIONS=['hold','advance','retreat','strafe-left','strafe-right'];
export const C13_FEATURES=['distance','lateralSpeed','radialSpeed','snapshotAge','observedHostiles','onGround','healthFraction','armorFraction','ammoFraction'];
export function commandAction(cmd={}){
 const fw=!!cmd.forward,back=!!cmd.backward,l=!!cmd.left,r=!!cmd.right;
 if(fw!==back)return fw?'advance':'retreat';
 if(l!==r)return l?'strafe-left':'strafe-right';
 return 'hold';
}
export function publicPolicyState(client,now){
 const obs=publicShotFeatures(client,now,{}),f=obs?.features,local=client?.local;
 const gun=local?.ws?.guns?.[local?.ws?.slot],weapon=local?.weapon;
 const magazine=Number(weapon?.magSize);
 const ammo=Number(gun?.mag);
 const hp=Number(local?.hp),armor=Number(local?.armor),maxArmor=Number(local?.maxArmor);
 const frac=(x,d)=>finite(x)&&finite(d)&&d>0?Math.min(1,Math.max(0,x/d)):null;
 const features={distance:f?.distance??null,lateralSpeed:f?.lateralSpeed??null,
  radialSpeed:f?.radialSpeed??null,snapshotAge:f?.snapshotAge??null,
  observedHostiles:f?.observedHostiles??null,onGround:f?.onGround??null,
  healthFraction:round(frac(hp,100)),armorFraction:round(frac(armor,maxArmor)),
  ammoFraction:round(frac(ammo,magazine))};
 // Do not substitute missing speed with zero: a stationary opponent is not
 // equivalent to insufficient observation history.
 const eligible=!!(obs?.targetId&&local?.alive!==false&&
   C13_FEATURES.every(k=>finite(features[k]))&&features.snapshotAge<=.5);
 return {features,eligible,targetId:obs?.targetId??null,
   provenance:{source:'delayed-public-snapshot-plus-local-player',hasMotionHistory:obs?.provenance?.motionHistoryAvailable===true},
   weaponId:String(gun?.id||'unknown')};
}
export class EncounterPolicyRecorderC13{
 constructor({matchId,mode,map,seed,profile,stepSeconds=.5,maximumDecisions=4000}={}){
  if(!matchId||!Number.isSafeInteger(seed)||!finite(stepSeconds)||stepSeconds<.1||
     !Number.isInteger(maximumDecisions)||maximumDecisions<1)throw Error('bad C13 metadata');
  this.matchId=String(matchId);this.mode=mode;this.map=map;this.seed=seed;this.profile=profile;
  this.stepSeconds=stepSeconds;this.maximumDecisions=maximumDecisions;
  this.decisions=[];this.dropped=0;this.lastTime=-Infinity;this.open=null;
 }
 observe(now,client,cmd){
  if(!finite(now)||now-this.lastTime<this.stepSeconds-1e-6)return;
  this.lastTime=now;
  if(this.decisions.length>=this.maximumDecisions){this.dropped++;return;}
  if(this.open)this.open.outcome.windowEnd=round(now);
  const state=publicPolicyState(client,now);
  const row={schema:'fpsarena-c13-observed-decision-v1',matchId:this.matchId,
   decisionId:`${this.matchId}/d${this.decisions.length+1}`,mode:this.mode,map:this.map,
   seed:this.seed,profile:this.profile,time:round(now),weaponId:state.weaponId,targetId:state.targetId,
   features:state.features,eligibility:{complete:state.eligible,source:state.provenance.source,
    motionHistory:state.provenance.hasMotionHistory,independentCounterfactual:false},
   // Label is the *existing* autopilot's selected movement direction in view-space.
   chosenAction:commandAction(cmd),commandContext:{fire:!!cmd?.fire,aim:!!cmd?.aim},
   outcome:{windowStart:round(now),windowEnd:null,shots:0,hits:0,damageDealt:0,
    kills:0,damageTaken:0,deaths:0,censored:true}};
  this.decisions.push(row);this.open=row;
 }
 serverEvent(now,type,data){
  const row=this.open;if(!row||!finite(now)||now+1e-5<row.time||
    now>=row.time+this.stepSeconds+1e-4)return;
  const o=row.outcome;
  if(type==='shot'&&data?.id==='trainee')o.shots++;
  else if(type==='hit'){o.hits++;o.damageDealt+=Math.max(0,finite(data?.dmg)?data.dmg:0);}
  else if(type==='dmg')o.damageTaken+=Math.max(0,Number(data?.h)||0)+Math.max(0,Number(data?.a)||0);
  else if(type==='kill'){if(data?.k==='trainee')o.kills++;if(data?.v==='trainee')o.deaths++;}
 }
 finish(endTime){
  if(this.open){this.open.outcome.windowEnd=round(endTime);
   this.open.outcome.censored=!finite(endTime)||endTime-this.open.time<this.stepSeconds-.02;}
  for(let i=0;i<this.decisions.length-1;i++)this.decisions[i].outcome.censored=false;
  return {schema:'fpsarena-c13-encounter-decisions-match-v1',matchId:this.matchId,
   mode:this.mode,map:this.map,seed:this.seed,profile:this.profile,
   stepSeconds:this.stepSeconds,counts:{decisions:this.decisions.length,
    eligible:this.decisions.filter(x=>x.eligibility.complete).length,dropped:this.dropped},
   decisions:this.decisions};
 }
}
