// C16 — equivalent safety gates, lazy public static geometry, C15 retry timings.
// Headless research only. Ineligible probes never run expensive collision sweeps.
// Same acceptance/candidate/command/offer schedule as C15 for identical inputs.
import {SafeActionExplorerC15,matchAssignmentC15} from './safe-action-explorer-c15.mjs';
import {candidateSetC14,publicClearanceC14} from './safe-action-explorer-c14.mjs';
import {publicPolicyState,commandAction} from './encounter-policy-recorder-c13.mjs';
export {matchAssignmentC15 as matchAssignmentC16};
const finite=Number.isFinite;
const blockedCommand=cmd=>!!(cmd?.fire||cmd?.skill||cmd?.reload||cmd?.use||cmd?.interact||
 cmd?.plate||cmd?.throw||cmd?.jump||cmd?.crouch||cmd?.slide||cmd?.prone||cmd?.lean||
 cmd?.left||cmd?.right||cmd?.backward||cmd?.slot>=0&&cmd.slot!==-1);
export function candidateSetC16(client,cmd,now,mode='tdm'){
 const state=publicPolicyState(client,now),reasons=[];
 if(mode!=='tdm')reasons.push('mode');
 if(!state.eligible||state.features.snapshotAge>.22)reasons.push('stale-or-incomplete-public-state');
 if(state.eligible&&(state.features.distance<24||state.features.distance>100))reasons.push('distance');
 if(state.eligible&&state.features.healthFraction<.75)reasons.push('low-health');
 if(state.eligible&&state.features.onGround!==1)reasons.push('not-grounded');
 if(!client?.local?.alive||client.local.down||client.local.frozen||client.local.mv?.heli||
    client.local.mv?.air||client.local.mv?.slideT>0||client.local.mv?.hk>0||client.local.mv?.gs>0)
  reasons.push('movement-state');
 if(blockedCommand(cmd))reasons.push('incumbent-priority-command');
 // These checks are all deterministic and independent of static geometry.
 // On an already-invalid offer, no geometric result can make it valid.
 // The first rejection reason remains identical to C14/C15; the (expensive)
 // secondary geometry diagnosis is intentionally omitted for rejected probes.
 if(reasons.length)return {eligible:false,reasons,candidates:['baseline'],
  clearance:{left:null,right:null},state,originalAction:commandAction(cmd)};
 const left=publicClearanceC14(client,cmd,-1),right=publicClearanceC14(client,cmd,1);
 if(!left||!right)reasons.push('public-static-geometry');
 return {eligible:reasons.length===0,reasons,
  candidates:reasons.length?['baseline']:['baseline','micro-left','micro-right'],
  clearance:{left,right},state,originalAction:commandAction(cmd)};
}
export class SafeActionExplorerC16 extends SafeActionExplorerC15{
 constructor(options={}){
  super(options);
  this.candidateSet=(client,cmd,now,mode)=>{
   const set=candidateSetC16(client,cmd,now,mode);
   if(set.clearance.left===null)this.skippedGeometryWhenBlocked++;
   else this.fullGeometryChecks++;
   return set;
  };
  this.skippedGeometryWhenBlocked=0;
  this.fullGeometryChecks=0;
 }
 finish(endTime){
  const result=super.finish(endTime);
  result.schema='fpsarena-c16-lazy-geometry-match-v1';
  result.metadata.explorationAlgorithm='c16-lazy-geometry-c15-scheduler';
  // Diagnostics only; authoritative opportunity eligibility is governed by
  // candidateSetC16 and exact C14/C15 unchanged thresholds.
  result.diagnostics.lazyGeometry={earlyRejectedEvaluations:this.skippedGeometryWhenBlocked,
   geometryEvaluations:this.fullGeometryChecks};
  return result;
 }
}
export {candidateSetC14};
