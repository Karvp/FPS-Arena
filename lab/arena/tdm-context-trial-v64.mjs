/** V64 research-only per-trigger feature capture.
 * Uses unchanged V61 trigger/arms with augmented public pre-step observations.
 */
import {V61EngagementTrial} from './tdm-engagement-trigger-v61.mjs';
import {publicTacticalContextV64} from './tdm-public-tactics-v64.mjs';
export const V64_SCHEMA='fpsarena-v64-public-context-replay-v1';
export class V64TacticalTrial extends V61EngagementTrial {
 constructor(options={}) {
  super(options);
  this.contextV64=null;
 }
 beforeStep({tick,now,client,command}) {
  const result=super.beforeStep({tick,now,client,command});
  if(this.triggerTick===tick && this.contextV64===null) {
   // This is BEFORE Game.step and BEFORE any V64 action intervention.
   this.contextV64=publicTacticalContextV64(client,now);
   if(!this.contextV64.valid) {
    this.contextV64={...this.contextV64,featuresUnavailable:true};
   }
   this.triggerFeature={...this.triggerFeature,publicTacticsV64:this.contextV64};
  }
  return result;
 }
 finish() {
  return {...super.finish(),schema:V64_SCHEMA,contextV64:this.contextV64,
    contextCapturedBeforeIntervention:true,
    targetStatePrivacy:'public delayed snapshots and public static geometry ONLY',
    actorMayReadPrivilegedWitness:false,researchOnly:true,productionAllowed:false};
 }
}
