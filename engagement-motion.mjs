// C10 — bounded public-snapshot motion-sensitivity envelope.
// Not a learned hit likelihood or a server-rewind simulation. Uses no hidden
// target velocity and does not modify aim/shot/ADS. Assumes the original aim
// line remains fixed during a short delayed observation/aim response interval.
import {estimateEngagementBallistics} from './engagement-ballistics.mjs';
const emFinite=Number.isFinite;
const emClamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const emNorm=(x,z)=>Math.hypot(x,z);
/** Returns null for absent, stale, teleport-like or malformed public motion. */
export function publicTargetMotion(target){
 const b=target?.remote?.buf,p=target?.point;
 if(!Array.isArray(b)||b.length<2||!p||![p.x,p.z].every(emFinite))return null;
 const a=b[b.length-2],c=b[b.length-1],dt=c?.t-a?.t;
 if(!emFinite(dt)||dt<.025||dt>.35||![a?.x,a?.z,c?.x,c?.z].every(emFinite))return null;
 if(emNorm(p.x-c.x,p.z-c.z)>3.5)return null;
 const vx=(c.x-a.x)/dt,vz=(c.z-a.z)/dt,speed=emNorm(vx,vz);
 if(!emFinite(speed)||speed>12.5)return null;
 let turn=0;
 if(b.length>=3){
  const h=b[b.length-3],oldDt=a?.t-h?.t;
  if(emFinite(oldDt)&&oldDt>=.025&&oldDt<=.35&&[h?.x,h?.z].every(emFinite)){
   const prevX=(a.x-h.x)/oldDt,prevZ=(a.z-h.z)/oldDt;
   const prevSpeed=emNorm(prevX,prevZ);
   if(prevSpeed<=12.5)turn=emClamp(emNorm(vx-prevX,vz-prevZ)*Math.min(dt,oldDt),0,3);
   else return null;
  }
 }
 return {vx,vz,speed,turn,dt,source:'public-remote-buffer'};
}
/** Scenario envelope under *bounded* latency and aim-response time.
 * Candidate viewpoint is a public route endpoint; current target is the
 * nominal aim point. Three equally indexed perturbations are sensitivity
 * probes, NOT weighted probabilities of player behaviour. No extra raycasts.
 */
export function estimateMotionEngagement(weapon,goal,target,distance,opts={}){
 if(!goal||!target?.point||![goal.x,goal.z,target.point.x,target.point.z,distance].every(emFinite)||distance<.1)return null;
 const motion=publicTargetMotion(target);
 if(!motion)return null; // exact C9 fallback when public history is untrusted
 const lag=opts.lagSeconds??.065,response=opts.responseSeconds??.11;
 if(!emFinite(lag)||lag<0||lag>.3||!emFinite(response)||response<0||response>.3)return null;
 const rX=target.point.x-goal.x,rZ=target.point.z-goal.z,rl=emNorm(rX,rZ);
 if(rl<.1)return null;
 const ux=rX/rl,uz=rZ/rl;
 const tangent=-uz*motion.vx+ux*motion.vz;
 const radial=ux*motion.vx+uz*motion.vz;
 // A emFinite short horizon: route arrival ETA is NOT extrapolated as an
 // assumed perfect target prediction. Aim reacquisition is unknown.
 const horizon=emClamp(lag+response,.025,.45);
 const change=emClamp(motion.turn*.28,0,.7);
 const candidateOffsets=[
  [tangent*horizon,-radial*horizon], // constant-velocity motion
  [tangent*horizon*.25,-radial*horizon*.25], // early stop / reacquisition
  [-tangent*horizon*.5,radial*horizon*.5] // reversal within observation lag
 ];
 const scenarios=[];
 for(const [x,z] of candidateOffsets){
  const estimate=estimateEngagementBallistics(weapon,distance,{samples:opts.samples??32,
   aimPoint:opts.aimPoint,targetOffsetX:emClamp(x,-8,8),targetOffsetZ:emClamp(z,-8,8)});
  if(!estimate)return null;
  scenarios.push({lateral:+x.toFixed(4),radial:+(-z).toFixed(4),
   damage:estimate.expectedDamagePerTrigger,quality:estimate.quality,
   pelletHitFraction:estimate.pelletHitFraction});
 }
 const lower=Math.min(...scenarios.map(s=>s.quality));
 const upper=Math.max(...scenarios.map(s=>s.quality));
 const mean=scenarios.reduce((sum,s)=>sum+s.quality,0)/scenarios.length;
 return {model:'public-motion-latency-sensitivity-v1',calibrated:false,
  source:motion.source,speed:motion.speed,turn:motion.turn,horizonSeconds:horizon,
  lateralSpeed:tangent,radialSpeed:radial,
  scenarios,qualityMin:lower,qualityMax:upper,qualityMean:mean,
  // Penalize scenarios sensitive to unobserved reversal; not a likelihood.
  robustQuality:emClamp(lower*(1-.15*change),0,1),
  assumptions:['fixed-nominal-aim','bounded-public-velocity','hypothetical-motion-scenarios',
   'no-latency-jitter-calibration','no-world-occlusion','no-route-arrival-extrapolation']};
}
