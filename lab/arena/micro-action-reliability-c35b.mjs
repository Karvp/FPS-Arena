// C35-B research ONLY. Diagnostic extension of the C35/C21/C16 experiment.
// Do not mutate C35-A registered code, C16 safety, weapon stats or production.
import {RandomizedSafeActionC35} from './randomized-safe-action-c35.mjs';
import {candidateSetC16} from './safe-action-explorer-c16.mjs';
const finite=Number.isFinite;
const round=x=>finite(x)?+x.toFixed(5):null;
const HORIZONS=[0.1,0.3,0.9];
export const C35B_DOSES=Object.freeze([80,120,160]);
export const C35B_SCHEMA='fpsarena-c35b-duration-reliability-match-v1';
export class MicroActionReliabilityC35B extends RandomizedSafeActionC35{
 constructor({doseMs,...options}={}){
  if(!C35B_DOSES.includes(doseMs))throw Error('C35B requires 80/120/160ms dose');
  super(options);this.actionSeconds=doseMs/1000;this.doseMs=doseMs;
  this.reasonCounts={};this.proximalSamples=0;
 }
 command(now,client,original){
  const wasActive=this.active&&now<this.activeUntil-1e-6?this.active:null;
  const before=this.offers.length;
  const applied=super.command(now,client,original);
  if(this.offers.length>before){
   const o=this.offers.at(-1);
   o.c35b={doseMs:this.doseMs,preassignment:true,
    interruption:null,proximals:{},
    displacementDefinition:'observed client local position minus preassignment public own position; not a counterfactual',
    perTickSafety:'unchanged candidateSetC16; priority action always overrides research micro-action'};
  }
  if(wasActive?.interrupted&&!wasActive.c35b?.interruption){
   // Diagnose ONLY after C21 has already refused to continue the action.
   // Never pass server truth, future state or this diagnosis into action assignment.
   const set=candidateSetC16(client,original,now,this.mode);
   const reasons=set.reasons.length?[...set.reasons]:['unknown-after-interrupt'];
   wasActive.c35b.interruption={t:round(now),sinceAssignmentMs:round((now-wasActive.time)*1000),
    ticksBeforeInterrupt:wasActive.executedTicks,reasons};
   for(const reason of reasons)this.reasonCounts[reason]=(this.reasonCounts[reason]||0)+1;
  }
  const o=this.open;
  if(o?.c35b&&finite(now)&&now>=o.time&&now<=o.time+1.8+1e-6){
   const from=o.public?.own,pos=client?.pos;
   if(from&&pos&&finite(pos.x)&&finite(pos.z))for(const h of HORIZONS){
    const name=String(h);
    if(!o.c35b.proximals[name]&&now>=o.time+h-1e-8){
     const dx=pos.x-from.x,dz=pos.z-from.z;
     o.c35b.proximals[name]={sampleAgeSeconds:round(now-o.time),dx:round(dx),dz:round(dz),
      distance:round(Math.hypot(dx,dz)),source:'delayed/local headless client predicted position; descriptive only'};
     this.proximalSamples++;
    }
   }
  }
  return applied;
 }
 finish(endTime){
  const r=super.finish(endTime);
  r.schema=C35B_SCHEMA;r.metadata.checkpoint='C35-B';
  r.metadata.actionDurationSeconds=this.actionSeconds;r.metadata.doseMs=this.doseMs;
  r.metadata.design+='; prospective dose-stratified engineering pilot; no policy efficacy analysis';
  r.metadata.interruptionDefinition='C21 per-tick C16 interruption; only micro actions eligible for interruption';
  r.metadata.analysisRestriction='do not condition ITT policy effects on observed dose, interruption or movement';
  r.diagnostics.c35b={doseMs:this.doseMs,interruptionReasonCounts:this.reasonCounts,proximalSamples:this.proximalSamples};
  for(const o of r.offers){
   if(!o.c35b)throw Error('C35B missing registered offer diagnostics');
   o.c35b.nominalTicks=this.doseMs/1000*60;
   o.c35b.deliveredFraction=o.assignedAction==='baseline'?null:round(Math.min(1,o.executedTicks/(this.doseMs/1000*60)));
   // C35-A finish hardcodes 0.16s; replace just the engineering duration label.
   o.actionDurationSeconds=round(Math.min(this.actionSeconds,o.executedTicks/60));
   if(o.assignedAction==='baseline'&&o.c35b.interruption)throw Error('baseline cannot be interrupted');
   if(o.interrupted&&!o.c35b.interruption)throw Error('missing post-interruption diagnostics');
  }
  return r;
 }
}
