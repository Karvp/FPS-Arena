import {estimateEngagementBallistics} from './engagement-ballistics.mjs';
import {estimateMotionEngagement} from './engagement-motion.mjs';
// FPS Arena Tactical Director 3.x — bounded, outcome-aware, receding-horizon movement planning.
// Designed for public client state. NO server internals, no aim/fire/ADS writes.
// All active actuation is additionally gated by the headless lab in agent-entry.js.
const tdFinite=Number.isFinite;
const tdClamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const tdDist=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const tdLen=v=>Math.hypot(v.x,v.z);
const tdTypes=new Set(['ENGAGE','APPROACH','FLANK','TAKE_COVER','RETREAT','RECOVER','OBJECTIVE','EVADE','HOLD']);
const tdSafety=new Set(['EVADE','RECOVER','OBJECTIVE','RING_ESCAPE']);
const tdROUTE=/^(?:pathfinding|pro-rotate|pro-long-range-close|precision-find-sightline|engagement-sightline|threat-aware-route|macro-range-approach|macro-vantage-approach|macro-covered-approach|macro-safe-advance|goal-aware-range-route)$/;
const tdCOVER=/^(?:camera-peek-hide|peek-reposition-cover|camera-cover-path|camera-peek-hold)$/;
const tdEmit=(p,e)=>{if(typeof p.onDecision==='function')p.onDecision(e);};
const tdValidPoint=p=>p&&[p.x,p.z].every(tdFinite);
const tdVec=(a,b)=>({x:b.x-a.x,z:b.z-a.z});
const tdNorm=v=>{const n=tdLen(v);return n>1e-5?{x:v.x/n,z:v.z/n}:null;};
const tdWaypoints=(p,start,end)=>{
  const path=p.route?.(start,end);
  if(!Array.isArray(path)||path.length===0||path.length>160||!path.every(tdValidPoint))return null;
  return path;
};
/** A tactical *preference* band, not the weapon's actual hit limit.
 * Main engine exposes effective weapon stats through curWeapon(ws) (including
 * validated attachments). Keep the historical category proxy as default so
 * pinned pre-main experiments remain exactly reproducible. Opt-in is headless.
 * A bounded ADS-angular-dispersion geometry proxy avoids treating the damage
 * falloff endpoint as a hard hit cutoff. Not a calibrated hit probability.
 */
export function tacticalWeaponBand(weapon,effectiveStats=false){
 const cat=weapon?.cat||'';
 const legacy=cat==='Shotgun'?{ideal:10.5,min:3,max:16,speed:7.1}:
   cat==='SMG'?{ideal:18,min:5,max:32,speed:7.2}:
   cat==='Sniper'?{ideal:55,min:24,max:120,speed:6.8}:
   cat==='DMR'?{ideal:42,min:14,max:90,speed:7.0}:
   cat==='Pistol'?{ideal:13,min:4,max:29,speed:7.0}:
   {ideal:28,min:7,max:70,speed:7.0};
 if(effectiveStats!==true)return legacy;
 const shotMax=weapon?.maxRange;
 if(weapon?.melee===true&&tdFinite(shotMax)&&shotMax>1&&shotMax<=10){
   const reach=tdFinite(weapon.reach)?Math.min(shotMax,weapon.reach):shotMax;
   if(reach<=1)return legacy;
   return {min:1,ideal:reach*.8,max:reach,physicalMax:shotMax,
     speed:legacy.speed*(tdFinite(weapon.move)?tdClamp(weapon.move,.5,1.4):1),source:'effective'};
 }
 const r=weapon?.range,d=weapon?.dmg;
 if(!Array.isArray(r)||r.length!==2||!r.every(tdFinite)||
    r[0]<0||r[1]<=r[0]||r[1]>1000||
    !Array.isArray(d)||d.length!==2||!d.every(tdFinite)||
    d[0]<=0||d[1]<0||d[0]>10000)return legacy;
 if(!tdFinite(shotMax)||shotMax<=0||shotMax>2000)return legacy;
 const near=r[0],far=Math.min(r[1],shotMax);
 if(far<=1.5)return legacy;
 const min=tdClamp(near*(cat==='Sniper'?.7:cat==='Shotgun'?.35:.3),
   cat==='Sniper'?4:1.5,Math.max(1.5,far-1));
 const ratio=tdClamp(d[1]/d[0],.15,1);
 // Damage at the far falloff point is a *floor*, not a firing cutoff:
 // damageAt() holds d[1] beyond r[1]. A sniper with precise ADS spread
 // can still engage much farther away than its damage-falloff endpoint.
 // The angular dispersion gives a *geometry proxy* using 0.52 m radius,
 // not an actual hit probability (recoil, pose, motion and latency excluded).
 const ads=weapon.spreadAds;
 const angular=tdFinite(ads)&&ads>=0&&ads<45?
   (ads<.001?shotMax:.52/Math.tan(ads*Math.PI/180)):null;
 const referenceFar=cat==='Shotgun'?18:cat==='SMG'?34:
   cat==='Sniper'?60:cat==='Marksman'||cat==='DMR'?90:
   cat==='Pistol'?28:60;
 const falloffScale=tdClamp(Math.sqrt(far/referenceFar),.7,1.2);
 const spreadLimited=angular===null?far*1.12:
   angular*(.68+.32*ratio)*falloffScale;
 const max=tdClamp(Math.max(far,spreadLimited),min+.5,shotMax);
 const weight=cat==='Shotgun'?.44:cat==='SMG'?.42:
   cat==='Sniper'?.62:cat==='Marksman'||cat==='DMR'?.54:.5;
 const nearGoal=near+(far-near)*weight;
 const reachGoal=cat==='Sniper'?Math.max(nearGoal,110):
   cat==='Marksman'||cat==='DMR'?Math.max(nearGoal,85):
   Math.max(nearGoal,far*(cat==='Shotgun'?.65:1.1));
 const ideal=tdClamp(cat==='Shotgun'?nearGoal:
   Math.min(reachGoal,max*(cat==='Sniper'?.44:.5)),min+.25,max-.25);
 const move=tdFinite(weapon.move)?tdClamp(weapon.move,.5,1.4):1;
 return {ideal,min,max,physicalMax:shotMax,speed:legacy.speed*move,
   source:'effective'};
}
/** Estimate target at time of arrival; velocity and uncertainty use ONLY public snapshots. */
export function tacticalTargetForecast(target,seconds){
 const b=target?.remote?.buf,pt=target?.point;
 if(!tdValidPoint(pt))return null;
 const out={x:pt.x,y:pt.y,z:pt.z,confidence:0,uncertainty:2.5,displacement:0};
 if(!Array.isArray(b)||b.length<2)return out;
 const a=b.at(-2),c=b.at(-1),dt=c?.t-a?.t;
 if(!(dt>=.025&&dt<=.35)||![a?.x,a?.z,c?.x,c?.z].every(tdFinite))return out;
 const v={x:(c.x-a.x)/dt,z:(c.z-a.z)/dt},speed=tdLen(v);
 if(speed>12.5||tdDist(pt,c)>3.5||speed<.3)return out;
 const horizon=tdClamp(tdFinite(seconds)?seconds:0,0,1.0);
 const confidence=tdClamp((.35-dt)/.35,0,.8);
 const fraction=.5*confidence;
 const dx=v.x*horizon*fraction,dz=v.z*horizon*fraction;
 return {...out,x:out.x+dx,z:out.z+dz,displacement:Math.hypot(dx,dz),confidence,
   uncertainty:tdClamp(1.0+(1-confidence)*2.3+speed*horizon*.35,1,6)};
}
/** Explicit, testable priority shield — higher priority than every tactical score. */
export function tacticalPriority(game,policy={}){
 const L=game?.local;
 if(!L?.alive||!tdValidPoint(L.mv)||policy.unready||policy.weaponless)return 'uncontrollable';
 if(policy.emergency||policy.dodge)return 'emergency';
 if(policy.ring)return 'ring';
 if(policy.objective||policy.loot)return 'objective';
 if(policy.recovery||L.ws?.reloading||L.ws?.plateT>0)return 'recovery';
 if(policy.fire||policy.shotOpportunity)return 'combat-window';
 if((L.hp??100)<85||(L.armor??50)<26)return 'low-resources';
 if(tdFinite(policy.lastDamage)&&policy.now-policy.lastDamage<1.8)return 'recent-damage';
 return null;
}
export function tacticalRouteRisk(waypoints,start,policy={}){
 if(!Array.isArray(waypoints)||!tdValidPoint(start))return null;
 let from=start,length=0,risk=0,samples=0,peak=0;
 const allowed=Math.min(waypoints.length,160);
 for(let j=0;j<allowed;j++){
   const p=waypoints[j];if(!tdValidPoint(p))return null;
   length+=tdDist(from,p);from=p;
   // Sample every third path vertex, and always the terminal vertex.
   if(j%3===0||j===allowed-1){
     const x=policy.riskAt?.(p,length/7);
     if(!tdFinite(x)||x<0)return null;
     const r=Math.min(20,x);risk+=r;samples++;peak=Math.max(peak,r);
   }
 }
 return {length,meanRisk:risk/Math.max(samples,1),peakRisk:peak,samples};
}
/** Find the first *reachable* potential firing window along a verified route.
 * The planner must not blindly push to the terminal vantage if it can fire earlier.
 * Samples are bounded and ordered by walking distance; this is geometry feasibility,
 * NOT a prediction of a hit or a license to override combat/defense priorities.
 */
export function tacticalFirstShotWindow(waypoints,start,target,band,policy={}){
 if(!Array.isArray(waypoints)||!tdValidPoint(start)||!tdValidPoint(target)||
    !band||typeof policy.shotClear!=='function')return null;
 const budget=tdClamp(policy.maxShotProbes??8,0,12);
 if(!budget)return null;
 const spacing=tdClamp(policy.shotProbeSpacing??5,2.5,12);
 // Experimental coverage scan: collect an ordered, geometry-only subset before
 // spending a *fixed* LOS budget. Sequential scans can spend every raycast on
 // the first occluded wall and never inspect a later safe opening. We retain
 // four earliest samples then stratify the rest of the verified A* corridor.
 // No extra A*, at most 96 interpolation samples and 12 LOS raycasts; this is
 // a sampling strategy, NOT a proof that an unprobed interval is obstructed.
 if(policy.shotProbeCoverage===true){
   const candidates=[];
   let at=start,travel=0,geometrySamples=0;
   for(const [segmentIndex,wp] of waypoints.entries()){
     if(!tdValidPoint(wp))return null;
     const length=tdDist(at,wp);
     if(length>=.001){
       const steps=Math.min(32,Math.max(1,Math.ceil(length/spacing)));
       for(let j=1;j<=steps&&geometrySamples<96;j++){
         geometrySamples++;
         const f=j/steps;
         const point={x:at.x+(wp.x-at.x)*f,
           y:tdFinite(at.y)&&tdFinite(wp.y)?at.y+(wp.y-at.y)*f:(wp.y??at.y??0),
           z:at.z+(wp.z-at.z)*f};
         const range=tdDist(point,target);
         if(range<band.min||range>band.max)continue;
         candidates.push({point,travel:travel+length*f,range,segmentIndex,
           segmentFraction:f});
       }
       travel+=length;
     }
     at=wp;
     if(geometrySamples>=96)break;
   }
   if(!candidates.length)return null;
   const n=candidates.length,k=Math.min(budget,n),front=Math.min(4,k);
   const inspected=new Set();
   for(let i=0;i<front;i++)inspected.add(i);
   // Spread the remaining probes across the remaining corridor, including
   // the final sampled point. The same start/end cannot spend twice.
   if(k>front){
     const remaining=k-front,range=n-front;
     for(let j=0;j<remaining;j++)
       inspected.add(front+Math.min(range-1,Math.floor((j+.5)*range/remaining)));
   }
   let probes=0,first=null;
   for(const i of [...inspected].sort((a,b)=>a-b)){
     const c=candidates[i];
     if(policy.walkable&&!policy.walkable(c.point))continue;
     probes++;
     if(!policy.shotClear({x:c.point.x,y:c.point.y+1.45,z:c.point.z},target))continue;
     if(!first||c.travel<first.travel)first={...c,probes};
   }
   return first?{...first,timeToFire:first.travel/Math.max(1,band.speed),
     probes,coverageSampled:candidates.length}:null;
 }
 let at=start,travel=0,probes=0,geometrySamples=0;
 for(let segmentIndex=0;segmentIndex<waypoints.length;segmentIndex++){
   const wp=waypoints[segmentIndex];
   if(!tdValidPoint(wp))return null;
   const length=tdDist(at,wp);
   if(length<.001){at=wp;continue;}
   const steps=Math.min(32,Math.max(1,Math.ceil(length/spacing)));
   for(let j=1;j<=steps&&probes<budget&&geometrySamples<96;j++){
     geometrySamples++;
     const f=j/steps;
     const point={x:at.x+(wp.x-at.x)*f,
       y:tdFinite(at.y)&&tdFinite(wp.y)?at.y+(wp.y-at.y)*f:(wp.y??at.y??0),
       z:at.z+(wp.z-at.z)*f};
     const walked=travel+length*f;
     const range=tdDist(point,target);
     if(range<band.min||range>band.max)continue;
     probes++;
     if(policy.walkable&&!policy.walkable(point))continue;
     const eye={x:point.x,y:point.y+1.45,z:point.z};
     if(!policy.shotClear(eye,target))continue;
     return {point,travel:walked,timeToFire:walked/Math.max(1,band.speed),
       range,probes,segmentIndex,segmentFraction:f};
   }
   travel+=length;at=wp;
   if(probes>=budget||geometrySamples>=96)break;
 }
 return null;
}
/** A risk-sensitive, finite, side-effect-free option score; larger is better. */
export function tacticalUtility(candidate,context,weights={}){
 const w={opportunity:4.0,progress:1.2,travel:.34,exposure:2.6,uncertainty:1.0,
   range:1.3,switch:1.4,damage:1.7,...weights};
 const c=candidate;
 if(!c||!tdFinite(c.travel)||!tdFinite(c.risk)||!tdFinite(c.progress)||!tdFinite(c.rangeError))return -Infinity;
 const timeToFire=Math.max(0,c.timeToFire??c.travel/Math.max(1,context.speed));
 const opportunity=tdClamp((c.shootable?1:0)*Math.exp(-timeToFire/5)*(c.confidence??1),0,1);
 const uncertainty=tdClamp(c.uncertainty??0,0,8);
 const switchCost=c.type===context.currentType?0:w.switch;
 const damagePenalty=tdClamp(context.lastDamageRate??0,0,50)/15;
 const score=opportunity*w.opportunity + tdClamp(c.progress,0,30)/10*w.progress -
   c.travel*w.travel/10 - c.risk*w.exposure - uncertainty*w.uncertainty/3 -
   c.rangeError*w.range/10 - switchCost - damagePenalty*w.damage;
 return Number.isFinite(score)?score:-Infinity;
}
/** Plan only once every >= 0.45s. A* callbacks get at most 3 calls per search. */
/** Two-stage reachable fire-position search. The expensive A* budget is used
 * on the best geometry-screened sites, NOT merely the first two fixed angles.
 * No use of server-only state; supplied callbacks observe public geometry.
 */
/** Rank only physically feasible actuation plans; a higher-utility infeasible
 * candidate must not hide a safe lower-ranked plan. Input already utility-sorted.
 * This filter is *additional* to geometry, walkability and priority shields.
 */
export function tacticalEligibleEngagementCandidates(scored,mode='probe'){
 if(!Array.isArray(scored))return [];
 const maxEta=mode==='recovery'?5.2:mode==='probe'?3.5:3.3;
 const maxRisk=mode==='recovery'||mode==='probe'?1.1:1.4;
 const minGain=mode==='recovery'||mode==='probe'?.5:.65;
 return scored.filter(c=>c?.earlyShotWindow===true&&
   tdFinite(c.timeToFire)&&c.timeToFire>=0&&c.timeToFire<=maxEta&&
   tdFinite(c.risk)&&c.risk>=0&&c.risk<=maxRisk&&
   tdFinite(c.terminalTimeToFire)&&
   c.terminalTimeToFire-c.timeToFire>=minGain);
}
export function tacticalCandidates(game,target,policy={}){
 const L=game?.local,me=L?.mv,enemy=target?.point,band=tacticalWeaponBand(L?.weapon,policy.effectiveWeaponBand===true);
 if(!tdValidPoint(me)||!tdValidPoint(enemy))return [];
 const planar=tdDist(me,enemy),maxExpanded=policy.maxExpanded??200;
 const options=[];let routes=0,probes=0;
 // Per-search, aggregated diagnostics: no unbounded per-waypoint event stream.
 const audit={stage:'candidate-screen',weaponId:String(L?.weapon?.id??'').slice(0,48),
   bandSource:band.source??'legacy',bandIdeal:+band.ideal.toFixed(3),
   bandMax:+band.max.toFixed(3),physicalMax:band.physicalMax??null,
   sites:0,losValid:0,riskValid:0,
   routesAttempted:0,routeMissing:0,detourRejected:0,detourSalvaged:0,
   unsafeRoutes:0,routesValid:0,initialStepsValid:0,earlyWindows:0,accepted:0,
   ballisticSites:0,ballisticQualitySum:0,ballisticQualityMax:0,
   motionSites:0,motionFallback:0,motionQualityMin:1};
 const frontier=policy.opportunityExpansion===true&&policy.engagementWindow===true;
 const budget={maxRoutes:tdClamp(policy.maxRoutes??2,0,3),
   maxProbes:tdClamp(policy.maxProbes??12,0,40),maxSites:frontier?14:5};
 const horizon=tdClamp(planar/Math.max(3,band.speed)*.3,.15,.95);
 const forecast=tacticalTargetForecast(target,horizon)||enemy;
 const ref=(forecast?.confidence&&forecast.displacement<3.5)?forecast:enemy;
 const angle=Math.atan2(me.z-ref.z,me.x-ref.x);
 const radial=band.ideal;
 const sites=[{type:'APPROACH',angle,range:radial},
   {type:'FLANK',angle:angle+Math.PI/3,range:radial},
   {type:'FLANK',angle:angle-Math.PI/3,range:radial},
   {type:'FLANK',angle:angle+Math.PI/2,range:radial},
   {type:'FLANK',angle:angle-Math.PI/2,range:radial}];
 // Headless-only research mode: screen extra *geometry-verified* endpoints
 // at different radial bands. No extra unbounded A* budget, and every
 // expanded endpoint still passes all old LOS / risk / surface checks.
 if(frontier){
   const near=Math.max(band.min+1.3,radial*.72);
   const far=Math.min(band.max-1.3,radial*1.3);
   for(const r of [near,far])for(const offset of [0,Math.PI/3,-Math.PI/3])
     sites.push({type:offset===0?'APPROACH':'FLANK',angle:angle+offset,range:r});
   for(const offset of [Math.PI/6,-Math.PI/6,2*Math.PI/3])
     sites.push({type:'FLANK',angle:angle+offset,range:radial});
 }
 const dy=Math.abs((enemy.y??me.y)-(me.y??0));
 if(dy>3.3&&(!policy.allowVertical||typeof policy.verticalSurface!=='function'))return [];
 // Stage 1: inspect ALL bounded candidates before consuming route budget.
 const viable=[];
 for(const [ordinal,item] of sites.entries()){
   if(probes>=budget.maxProbes||audit.sites>=budget.maxSites)break;
   audit.sites++;
   const goal={x:ref.x+Math.cos(item.angle)*item.range,
     y:me.y,z:ref.z+Math.sin(item.angle)*item.range};
   if(dy>3.3){
     const surface=policy.verticalSurface({...goal,y:enemy.y});
     if(!tdFinite(surface))continue;goal.y=surface;
   }
   const direct=tdDist(me,goal);
   if(direct<1.8||direct>95)continue;
   if(typeof policy.walkable==='function'&&!policy.walkable(goal))continue;
   const eye={x:goal.x,y:(goal.y??0)+1.45,z:goal.z};
   probes++;
   if(typeof policy.shotClear!=='function'||!policy.shotClear(eye,enemy))continue;
   audit.losValid++;
   if(forecast.confidence>.4&&forecast.displacement>1.25){
     if(probes>=budget.maxProbes)break;
     probes++;
     if(!policy.shotClear(eye,ref))continue;
   }
   const endpointRisk=policy.riskAt?.(goal,direct/band.speed);
   if(!tdFinite(endpointRisk)||endpointRisk<0||endpointRisk>3.5)continue;
   audit.riskValid++;
   // Endpoint quality is a *cheap estimate*, never a substitute for route risk.
   // Stable ordinal tie-breaking makes the lab deterministic for paired seeds.
   const ballistic=policy.ballisticScoring===true&&policy.effectiveWeaponBand===true ?
     estimateEngagementBallistics(L.weapon,tdDist(goal,ref),{samples:32,aimPoint:policy.ballisticAimPoint}):null;
   // Bounded preference only. Geometry and all safety gates remain authoritative.
   if(ballistic){audit.ballisticSites++;audit.ballisticQualitySum+=ballistic.quality;
     audit.ballisticQualityMax=Math.max(audit.ballisticQualityMax,ballistic.quality);}
   const ballisticDiscount=ballistic?Math.min(12,ballistic.quality*12):0;
   viable.push({item,goal,direct,ordinal,endpointRisk,ballistic,
     cheapCost:direct+endpointRisk*10+Math.abs(tdDist(goal,ref)-band.ideal)*1.5-ballisticDiscount});
 }
 viable.sort((a,b)=>a.cheapCost-b.cheapCost||a.ordinal-b.ordinal);
 // Stage 2: verify the best viable routes with strictly bounded A* calls.
 for(const c of viable){
   if(routes>=budget.maxRoutes)break;
   routes++;audit.routesAttempted++;
   const waypoints=tdWaypoints(policy,me,c.goal);
   if(!waypoints){audit.routeMissing++;continue;}
   const route=tacticalRouteRisk(waypoints,me,policy);
   if(!route){audit.unsafeRoutes++;continue;}
   const terminalTime=route.length/band.speed;
   const shotWindow=policy.engagementWindow===true ?
     tacticalFirstShotWindow(waypoints,me,ref,band,policy):null;
   const shortened=shotWindow&&shotWindow.travel+1<route.length;
   // A long *terminal* detour is not automatically a bad route when an early,
   // LOS-verified firing site has a short, safe prefix. Only frontier research
   // mode can salvage it, and it must pass the prefix route-risk checks below.
   const excessiveDetour=route.length>c.direct*1.9+8;
   if(excessiveDetour&&(!frontier||!shortened)){
     audit.detourRejected++;continue;
   }
   const actionGoal=shortened?shotWindow.point:c.goal;
   const actionWaypoints=shortened?
     [...waypoints.slice(0,shotWindow.segmentIndex),shotWindow.point]:waypoints;
   const actionRisk=shortened?tacticalRouteRisk(actionWaypoints,me,policy):route;
   if(!actionRisk||actionRisk.peakRisk>8||actionRisk.meanRisk>3.5){
     audit.unsafeRoutes++;continue;
   }
   audit.routesValid++;
   const firstAction=actionWaypoints.find(p=>tdDist(me,p)>1.25);
   if(!firstAction)continue;
   const firstActionStep=tdNorm(tdVec(me,firstAction));
   if(!firstActionStep||!policy.canStep?.(firstActionStep.x,firstActionStep.z,1.3))continue;
   audit.initialStepsValid++;
   if(shortened)audit.earlyWindows++;
   if(excessiveDetour)audit.detourSalvaged++;
   const predictedDistance=tdDist(actionGoal,ref);
   // Motion sensitivity is only applied AFTER route, LOS, risk and step gates.
   // At most three 32-direction scenario evaluations per verified path.
   const motion=policy.motionScoring===true&&policy.ballisticScoring===true&&
       policy.effectiveWeaponBand===true ? estimateMotionEngagement(L.weapon,actionGoal,target,
       predictedDistance,{samples:32,aimPoint:policy.ballisticAimPoint,
        lagSeconds:policy.motionLagSeconds??.065}):null;
   if(policy.motionScoring===true){
     if(motion){audit.motionSites++;audit.motionQualityMin=Math.min(audit.motionQualityMin,motion.robustQuality);}
     else audit.motionFallback++;
   }
   audit.accepted++;
   options.push({type:c.item.type,goal:actionGoal,waypoints:actionWaypoints,first:firstAction,
     travel:actionRisk.length,risk:actionRisk.meanRisk,
     confidence:tdClamp(1-forecast.uncertainty/9,.3,1),
     uncertainty:forecast.uncertainty,shootable:true,
     progress:planar-predictedDistance,timeToFire:actionRisk.length/band.speed,
     terminalTimeToFire:terminalTime,earlyShotWindow:!!shortened,
     shotProbeCount:shotWindow?.probes??0,
     rangeError:Math.abs(predictedDistance-band.ideal),motion,
     ballistic:policy.ballisticScoring===true&&policy.effectiveWeaponBand===true ?
       estimateEngagementBallistics(L.weapon,predictedDistance,{samples:32,aimPoint:policy.ballisticAimPoint}):null,
     routeBudget:{routes,probes,maxExpanded,screened:viable.length}});
 }
 if(typeof policy.onCandidateAudit==='function')policy.onCandidateAudit({...audit,
   ballisticMeanQuality:audit.ballisticSites?+(audit.ballisticQualitySum/audit.ballisticSites).toFixed(4):null,
   motionMinimumQuality:audit.motionSites?+audit.motionQualityMin.toFixed(4):null});
 return options;
}
function tdOutcome(memory,now,policy,reason){
 const plan=memory.plan;if(!plan)return;
 // Online feedback is deliberately weak and only updates on actual actuator
 // ownership; observing a shadow plan is not a counterfactual success label.
 const score=tdClamp((plan.selfProgress||0)/8+Math.min(1,(plan.fireTicks||0)/4)-
   (plan.hpLoss||0)/55,-2,2);
 if(plan.actuated){
   const h=memory.history||(memory.history={});
   const prev=h[plan.type]||{n:0,ema:0};
   h[plan.type]={n:Math.min(20,prev.n+1),ema:tdClamp(prev.ema*.85+score*.15,-1.5,1.5)};
 }
 tdEmit(policy,{state:'director-outcome',planId:plan.planId??null,type:plan.type,targetId:plan.targetId,
   executed:plan.actuated===true,observationalOnly:plan.actuated!==true,
   feedbackProxy:+score.toFixed(3),
   durationMs:Math.round(Math.max(0,now-plan.since)*1000),
   initialDistance:plan.initialDistance,lastDistance:plan.lastDistance,
   selfProgress:plan.selfProgress||0,waypointsReached:plan.waypointsReached||0,
   waypointProgressTicks:plan.waypointProgressTicks||0,observedFire:plan.fireTicks||0,
   hpLoss:plan.hpLoss||0,reason});
 memory.plan=null;
}
/** Hierarchical intent attribution for all five modes. This does not
 * compete with the existing movement, weapon or objective controllers.
 */
export function tacticalIntent(game,target,baseline,policy={}){
 const priority=tacticalPriority(game,{...policy,now:policy.now??0});
 const mapping={uncontrollable:'HOLD',emergency:'EVADE',ring:'RING_ESCAPE',
   objective:'OBJECTIVE',recovery:'RECOVER',lowResources:'RETREAT',
   'low-resources':'RETREAT','recent-damage':'RETREAT','combat-window':'ENGAGE'};
 if(priority)return {type:mapping[priority]||'HOLD',protected:true,why:priority};
 if(!tdValidPoint(target?.point))return {type:'HOLD',protected:false,why:'no-target'};
 const band=tacticalWeaponBand(game.local.weapon,policy.effectiveWeaponBand===true),distance=tdDist(game.local.mv,target.point);
 if(target.visible===true&&distance<=(band.physicalMax??band.max))return {type:'ENGAGE',protected:true,why:'shootable-range'};
 if(tdCOVER.test(baseline?.reason||''))return {type:'TAKE_COVER',protected:false,why:'baseline-cover'};
 if(tdROUTE.test(baseline?.reason||''))return {type:'APPROACH',protected:false,why:'baseline-pursuit'};
 return {type:'REPOSITION',protected:false,why:'baseline-other'};
}
/** An optional mid-option veto may only relax a same-target low-yield cycle.
 * This remains independent from the old arbiter and excludes any observed
 * shot, visibility or damage benefit from the interrupted action.
 */
export function tacticalLowYieldEvidence(e,now,targetId){
 return !!(e&&e.targetId===targetId&&e.label==='candidate-low-yield'&&
   e.sequence?.[1]==='TAKE_COVER'&&tdFinite(e.time)&&now>=e.time&&now-e.time<=2.4&&
   e.intermediateShotOpportunities===0&&e.intermediateFireTicks===0&&
   e.intermediateHpLoss===0&&e.intermediateArmorLoss===0&&
   Math.abs(e.intermediateSelfRangeGainM??Infinity)<.3);
}
/** Deduplicated independent evidence, not repeated sampling of one event.
 * Called for active opt-in actuation only. Evidence cannot be older than the
 * observation window and does not persist across target switches.
 */
export function tacticalRepeatedLowYield(memory,e,now,targetId){
 if(!tacticalLowYieldEvidence(e,now,targetId))return false;
 // A consumed evidence pair is never reusable for a new plan. New evidence
 // for another target has independent provenance and remains eligible.
 if(memory.lowYieldConsumed?.targetId===targetId &&
    e.time<=memory.lowYieldConsumed.time+.001)return false;
 const series=memory.lowYieldConfirmations;
 if(!series||series.targetId!==targetId)
   memory.lowYieldConfirmations={targetId,times:[e.time]};
 else{
   series.times=series.times.filter(t=>tdFinite(t)&&now-t<=6&&t<=now);
   if(!series.times.some(t=>Math.abs(t-e.time)<.03))series.times.push(e.time);
 }
 return memory.lowYieldConfirmations.times.length>=2;
}
/** One output direction, hard priority shield, negative cache, bounded replanning,
 * outcome termination and hysteresis. Shadow is object-identity preserving.
 */
/** An independently measured movement contribution, excluding enemy motion.
 * This is used only by the opt-in opportunity-guarded lab profile.
 * A progressive existing pursuit should not be hijacked by a speculative flank.
 */
export function tacticalObservePursuit(memory,me,enemy,targetId,now,baseline){
 const previous=memory.pursuitSample;
 let speed=0;
 if(previous?.targetId===targetId&&now>previous.now&&now-previous.now<.4){
   const dt=now-previous.now;
   const progress=tdDist(previous.me,previous.enemy)-tdDist(me,previous.enemy);
   speed=tdClamp(progress/dt,-12,12);
   memory.pursuitSpeed=tdClamp((memory.pursuitSpeed??0)*.75+speed*.25,-12,12);
 }else memory.pursuitSpeed=0;
 memory.pursuitSample={me:{x:me.x,z:me.z},enemy:{x:enemy.x,z:enemy.z},targetId,now};
 return tdROUTE.test(baseline?.reason||'')&&(memory.pursuitSpeed??0)>1.1;
}
export function tacticalOpportunityVeto(game,target,baseline,now,memory,policy={}){
 const me=game?.local?.mv,enemy=target?.point;
 if(!tdValidPoint(me)||!tdValidPoint(enemy))return 'invalid-position';
 const id=String(target?.id??''),band=tacticalWeaponBand(game.local.weapon,policy.effectiveWeaponBand===true),d=tdDist(me,enemy);
 const advancing=tacticalObservePursuit(memory,me,enemy,id,now,baseline);
 if(target.hitboxVisible===true&&d<=(band.physicalMax??band.max)*1.5)return 'hitbox-firing-window';
 if(target.visible===true&&d<=(band.physicalMax??band.max)*1.35)return 'imminent-range-window';
 if(advancing&&policy.ownedPlan!==true)return 'progressing-pursuit';
 return null;
}
/** Headless-only exploration eligibility based on observed own lack of progress.
 * A target standing still is not itself evidence of movement failure; compare
 * the bot to the same anchor target location over a bounded observation window.
 * Returning false never affects production or an already-authorized plan.
 */
export function tacticalProbeStall(memory,me,enemy,targetId,now,baseline){
 if(!tdValidPoint(me)||!tdValidPoint(enemy)||!tdFinite(now)||
    !(tdROUTE.test(baseline?.reason||'')||tdCOVER.test(baseline?.reason||''))){
   memory.probeAnchor=null;return false;
 }
 const a=memory.probeAnchor;
 if(!a||a.targetId!==targetId||now<a.at||now-a.at>2.2||tdDist(a.enemy,enemy)>5){
   memory.probeAnchor={targetId,at:now,me:{x:me.x,z:me.z},enemy:{x:enemy.x,z:enemy.z}};
   return false;
 }
 const selfProgress=tdDist(a.me,a.enemy)-tdDist(me,a.enemy);
 const travel=tdDist(a.me,me);
 if(selfProgress>1.3||travel>4){
   memory.probeAnchor={targetId,at:now,me:{x:me.x,z:me.z},enemy:{x:enemy.x,z:enemy.z}};
   return false;
 }
 return now-a.at>=.85&&selfProgress<.7&&travel<2.5;
}
/** Reproducible Bernoulli assignment independent of the game's Math.random.
 * The seed is set only by the headless experiment runner. Assignments are
 * diagnostic randomized intentions, NOT proof of actual command selection.
 * The probability is the conditional action propensity at the safe offer gate.
 */
export function tacticalExplorationAssignment(seed,attempt,targetId,probability=.5){
 if(!Number.isSafeInteger(seed)||!Number.isSafeInteger(attempt)||attempt<1||
    typeof targetId!=='string'||!targetId.length||!tdFinite(probability)||
    probability<0||probability>1)throw Error('Invalid tactical exploration assignment');
 let h=(seed>>>0)^Math.imul(attempt,0x9e3779b1);
 for(let i=0;i<Math.min(targetId.length,128);i++){
   h=Math.imul(h^targetId.charCodeAt(i),16777619);
 }
 h=Math.imul(h^(h>>>16),0x7feb352d);
 h=Math.imul(h^(h>>>15),0x846ca68b);
 const draw=((h^(h>>>16))>>>0)/4294967296;
 return {attempt,draw,actuate:draw<probability,actionProbability:probability,
   controlProbability:1-probability,algorithm:'hash-bernoulli-v1'};
}
/** One randomized unit is a whole server episode, not a selected waypoint or
 * safety-qualified offer. Never advance the game RNG for the assignment.
 * Only the authoritative headless runner may use this research assignment.
 */
export function tacticalEpisodeExplorationAssignment(seed,probability=.5){
 if(!Number.isSafeInteger(seed)||!tdFinite(probability)||probability<0||probability>1)
   throw Error('Invalid tactical episode assignment');
 let h=(seed>>>0)^0x6d2b79f5;
 h=Math.imul(h^(h>>>16),0x7feb352d);
 h=Math.imul(h^(h>>>15),0x846ca68b);
 const draw=((h^(h>>>16))>>>0)/4294967296;
 return {unit:'episode',assignmentId:`episode-${seed}`,seed,draw,
   actuate:draw<probability,actionProbability:probability,
   controlProbability:1-probability,algorithm:'episode-hash-bernoulli-v1'};
}
export function tacticalDirectorDecision(game,target,baseline,now,memory={},policy={}){
 const original=baseline;
 if(!original||!tdFinite(now)||!game?.local?.alive||!tdValidPoint(game.local.mv))return original;
 const active=policy.active===true,me=game.local.mv,enemy=target?.point;
 const targetId=String(target?.id??'');
 const band=tacticalWeaponBand(game.local.weapon,policy.effectiveWeaponBand===true);
 // Two public-state opportunities are deliberately distinguished:
 // geometric LOS to a *remembered* target vs currently observed visibility.
 // Neither means aiming is ready or a real shot will hit.
 if(policy.engagementWindow===true&&targetId&&tdValidPoint(enemy)&&
    (memory.firstGeometricFiringWindowAt===undefined||
     (memory.firstVisibleFiringWindowAt===undefined&&target?.visible===true))&&
    !game.local.ws?.reloading&&!game.local.ws?.plateT&&
    tdDist(me,enemy)>=band.min&&tdDist(me,enemy)<=band.max&&
    typeof policy.shotClear==='function'&&
    policy.shotClear({x:me.x,y:(me.y??0)+1.45,z:me.z},enemy)){
   if(memory.firstGeometricFiringWindowAt===undefined){
     memory.firstGeometricFiringWindowAt=now;
     tdEmit(policy,{state:'director-first-geometric-window',targetId,
       active,geometryOnly:true,currentlyVisible:target?.visible===true});
   }
   if(memory.firstVisibleFiringWindowAt===undefined&&target?.visible===true){
     memory.firstVisibleFiringWindowAt=now;
     tdEmit(policy,{state:'director-first-visible-window',targetId,
       active,geometryOnly:true});
   }
 }
 if(memory.plan&&policy.fire)memory.plan.fireTicks=(memory.plan.fireTicks||0)+1;
 const intent=tacticalIntent(game,target,baseline,{...policy,now});
 const priority=intent.protected?intent.why:null;
 const emit=(state,info={})=>{
   // Separate each veto reason while rate-limiting per reason: oscillating
   // categories must not create a costly event stream at 60 Hz.
   const key=state+'|'+(info.reason??'')+'|'+(info.type??'');
   const notices=memory.noticeTimes||(memory.noticeTimes=new Map());
   if(now-(notices.get(key)??-Infinity)>=2){
     tdEmit(policy,{state,targetId,active,...info});
     notices.set(key,now);
     if(notices.size>32)for(const [k,t] of notices){if(now-t>8)notices.delete(k);}
   }
 };
 if(priority||!targetId||!tdValidPoint(enemy)){
   if(memory.plan)tdOutcome(memory,now,policy,priority||'target-lost');
   emit('director-veto',{reason:priority||'target-lost'});return original;
 }
 const dist=tdDist(me,enemy),plan=memory.plan;
 // An already actuated, same-target plan owns its movement until the usual
 // threat, route, damage and objective shields end it. Re-authenticating the
 // original evidence on every frame would spuriously cancel a valid plan.
 const ownedPlan=plan?.actuated===true&&plan.targetId===targetId&&
   plan.weapon===game.local.weapon?.cat;
 const probe=active&&policy.engagementProbe===true;
 if(probe&&!ownedPlan){
   const stalled=tacticalProbeStall(memory,me,enemy,targetId,now,original);
   if(now<(memory.probeSuspendUntil??-Infinity)||!stalled||
      target.visible===true||dist<=band.max*1.12||
      policy.engagementWindow!==true){
     emit('director-veto',{reason:'probe-awaiting-stalled-occluded-pursuit'});
     return original;
   }
 }
 if(active&&policy.opportunityGuard===true&&policy.engagementTrial!==true&&!probe&&!ownedPlan&&
    !tacticalRepeatedLowYield(memory,policy.evidence,now,targetId)){
   if(memory.plan)tdOutcome(memory,now,policy,'insufficient-repeated-evidence');
   emit('director-veto',{reason:'insufficient-repeated-evidence'});return original;
 }
 // Optional policy: avoid overriding productive pursuits or imminent hitbox
 // windows. The older active/shadow experiments remain intact for ablations.
 if(policy.opportunityGuard===true){
   const veto=tacticalOpportunityVeto(game,target,original,now,memory,{...policy,ownedPlan});
   if(veto){
     if(memory.plan)tdOutcome(memory,now,policy,veto);
     emit('director-veto',{reason:veto});return original;
   }
 }
 if(active&&policy.engagementTrial===true&&!memory.plan&&
    (game.local.weapon?.cat!=='Shotgun'||!tdCOVER.test(original.reason||'')||
     target.visible===true||dist<=band.max*1.35)){
   emit('director-veto',{reason:'trial-ineligible-cover-or-range'});return original;
 }
 if(active&&policy.engagementTrial!==true&&!probe&&
    (policy.conservative||intent.type==='TAKE_COVER')&&
    !tacticalLowYieldEvidence(policy.evidence,now,targetId)){
   if(memory.plan)tdOutcome(memory,now,policy,'cover-action-not-proven-low-yield');
   emit('director-veto',{reason:'protected-action-without-evidence'});return original;
 }
 if(plan && (plan.targetId!==targetId||plan.weapon!==game.local.weapon?.cat||tdDist(plan.targetAt,enemy)>5.5))tdOutcome(memory,now,policy,'target-or-weapon-change');
 // Observe the actual bot's movement contribution independently from enemy movement.
 const p=memory.plan;
 if(p){
   if(p.lastPose&&p.lastEnemy){
     const prev=tdDist(p.lastPose,p.lastEnemy),botOnly=tdDist(me,p.lastEnemy);
     p.selfProgress+=(prev-botOnly);
     if(dist<p.bestDistance-.6){p.bestDistance=dist;p.lastProgressAt=now;}
   }
   p.lastPose={x:me.x,z:me.z};p.lastEnemy={x:enemy.x,z:enemy.z};p.lastDistance=dist;
   p.hpLoss+=Math.max(0,(p.lastHp??game.local.hp)-game.local.hp);
   p.lastHp=game.local.hp;
   // Forward movement along the owned A* corridor is progress even when a
   // necessary flank temporarily increases distance to the enemy.
   const wp=p.waypoints?.[0];
   if(wp){
     const wpDist=tdDist(me,wp);
     if(!tdFinite(p.waypointBestDist)||wpDist<p.waypointBestDist-.22){
       p.waypointBestDist=wpDist;p.lastProgressAt=now;
       p.waypointProgressTicks=(p.waypointProgressTicks||0)+1;
     }
   }
   if(now-p.lastProgressAt>1.1){tdOutcome(memory,now,policy,'stalled');memory.suspendUntil=now+1.2;}
   else if(now-p.since>(p.recovery?Math.min(6,p.plannedETA+0.8):3.5))
     tdOutcome(memory,now,policy,'horizon-expired');
   else if(p.goal&&tdDist(me,p.goal)<1.7)tdOutcome(memory,now,policy,'reached-goal');
   else if(policy.currentOpportunity)tdOutcome(memory,now,policy,'shootable-now');
 }
 const live=memory.plan;
 if(live){
   // Keep the previously authorized route until its real termination guard;
   // the former .65s reuse cutoff caused an unintended actuator handoff.
   while(live.waypoints.length&&tdDist(me,live.waypoints[0])<1.3){
     live.waypoints.shift();live.waypointBestDist=undefined;
     live.lastProgressAt=now;live.waypointsReached=(live.waypointsReached||0)+1;
   }
   const wp=live.waypoints[0],unit=wp?tdNorm(tdVec(me,wp)):null;
   if(unit&&policy.canStep?.(unit.x,unit.z,1.3) && policy.riskAt?.({x:me.x+unit.x*1.7,y:me.y,z:me.z+unit.z*1.7})<=4){
     emit('director-reuse',{type:live.type,planId:live.planId});
     return active?{x:wp.x-me.x,z:wp.z-me.z,reason:'director-'+live.type.toLowerCase(),goal:live.goal}:original;
   }
   tdOutcome(memory,now,policy,'blocked-or-exposed');
 }
 if(now<(memory.nextSearch??-Infinity)||now<(memory.suspendUntil??-Infinity)){
   emit('director-veto',{reason:'cooldown'});return original;
 }
 memory.nextSearch=now+.65;
 if(dist<=(band.physicalMax??band.max)&&target.visible&&policy.shotClear?.({x:me.x,y:(me.y??0)+1.45,z:me.z},enemy)){
   emit('director-veto',{reason:'direct-engagement'});return original;
 }
 if(typeof policy.route!=='function'||typeof policy.riskAt!=='function'||typeof policy.canStep!=='function'||typeof policy.shotClear!=='function'){
   emit('director-veto',{reason:'missing-geometry'});return original;
 }
 const options=tacticalCandidates(game,target,{
   ...policy,onCandidateAudit:info=>tdEmit(policy,{state:'director-candidate-audit',targetId,active,...info})
 });
 const scored=options.map(c=>{
   const baselineScore=tacticalUtility(c,{speed:band.speed,currentType:memory.lastType,
     lastDamageRate:0},policy.weights);
   const history=memory.history?.[c.type];
   const evidenceBonus=history?tdClamp(history.ema,-1.5,1.5)*Math.min(.5,history.n/16):0;
   // C9 adds a *small* research-only ranking preference. This is not a hit
   // probability calibrated for player motion, and cannot defeat any veto.
   const damagePreference=policy.ballisticScoring===true&&c.ballistic?
     1.3*(c.ballistic.quality-.5):0;
   // Deliberately tiny bounded ranking adjustment, not an actuation veto.
   // Missing/malformed public motion leaves C9 ranking exactly unchanged.
   const motionPreference=policy.motionScoring===true&&c.motion&&c.ballistic?
     tdClamp(.65*(c.motion.robustQuality-c.ballistic.quality),-.65,.65):0;
   return {...c,utility:baselineScore+evidenceBonus+damagePreference+motionPreference};
 }).sort((a,b)=>b.utility-a.utility);
 // Actuation-specific feasibility comes *before* choosing the top utility.
 // Otherwise a high-scoring infeasible route masks a lower-ranked safe route.
 const restricted=active&&(probe||policy.engagementTrial===true);
 const eligible=restricted?tacticalEligibleEngagementCandidates(scored,probe?(policy.engagementRecovery?'recovery':'probe'):'trial'):scored;
 const best=eligible[0];
 if(restricted&&scored.length&&!best){
   emit('director-veto',{reason:probe?'probe-no-safe-earlier-shot':'trial-no-valuable-early-window',
     options:scored.length,eligible:0,
     sample:scored.slice(0,3).map(c=>({t:+c.timeToFire.toFixed(2),
       gain:+(c.terminalTimeToFire-c.timeToFire).toFixed(2),
       risk:+c.risk.toFixed(2),early:c.earlyShotWindow,
       utility:+c.utility.toFixed(2)}))});return original;
 }
 // A real shot opportunity is worth more than small routing smoothness gains.
 if(!best||best.utility<(policy.threshold??(probe&&policy.engagementRecovery?-2.5:-1.2))||best.risk>3.5){
   emit('director-veto',{reason:'no-profitable-route',options:options.length,
     bestUtility:tdFinite(best?.utility)?+best.utility.toFixed(3):null});return original;
 }
 const waypoint=best.first,step=tdNorm(tdVec(me,waypoint));
 // Shadow may plan any geometry-valid route, but trial actuation is permitted
 // only when a bounded *early* shot exists and saves meaningful travel time.
 // This is an ablation only; the full production guard remains untouched.
 if(probe&&!ownedPlan&&(!best.earlyShotWindow||best.timeToFire>(policy.engagementRecovery?5.2:3.5)||
    best.risk>1.1||best.terminalTimeToFire-best.timeToFire<.5)){
   emit('director-veto',{reason:'probe-no-safe-earlier-shot',
     timeToFire:+best.timeToFire.toFixed(2)});return original;
 }
 if(active&&policy.engagementTrial===true&&
    (!best.earlyShotWindow||best.timeToFire>3.3||best.risk>1.4||
     best.terminalTimeToFire-best.timeToFire<.65)){
   emit('director-veto',{reason:'trial-no-valuable-early-window',
     timeToFire:+best.timeToFire.toFixed(2)});return original;
 }
 // Reject long speculative travel times and violent reverse turns when the
 // baseline is already a pursuit. A low-yield cover detour is assessed using
 // explicit prior evidence, never merely a time-based commitment lock.
 if(policy.opportunityGuard===true){
   const maxEta=probe&&policy.engagementRecovery===true?5.2:(game.local.weapon?.cat==='Shotgun'?4.3:5.4);
   if(best.timeToFire>maxEta){
     emit('director-veto',{reason:'time-to-fire-too-long',seconds:+best.timeToFire.toFixed(2)});return original;
   }
   if(tdROUTE.test(original.reason||'')){
     const current=tdNorm(original);
     if(current&&step&&current.x*step.x+current.z*step.z<.4){
       emit('director-veto',{reason:'pursuit-heading-disagreement'});return original;
     }
   }
 }
 if(!step||!policy.canStep(step.x,step.z,1.3)){
   emit('director-veto',{reason:'first-step-blocked'});return original;
 }
 // C5 randomized intervention gate. All geometry, deadline, heading,
 // priority, fire/reload, risk and first-step checks have ALREADY passed.
 // A control assignment returns the unmodified baseline without claiming a
 // plan; the next offer requires fresh stall evidence after a cooldown.
 let exploration=null;
 if(active&&probe&&policy.engagementExploration===true){
   const chance=policy.explorationProbability??.5;
   const seed=policy.explorationSeed;
   if(!Number.isSafeInteger(seed)||seed<0||!tdFinite(chance)||chance<0||chance>1){
     emit('director-veto',{reason:'invalid-exploration-configuration'});
     return original;
   }
   const attempt=memory.explorationAttempts=(memory.explorationAttempts??0)+1;
   exploration=tacticalExplorationAssignment(seed,attempt,targetId,chance);
   tdEmit(policy,{state:'director-exploration-assignment',targetId,active:true,
     ...exploration,at:now,eligibleCount:eligible.length,
     eligibleOptions:eligible.slice(0,3).map(c=>({type:c.type,
       utility:+c.utility.toFixed(3),risk:+c.risk.toFixed(3),
       timeToFire:+c.timeToFire.toFixed(3),
       earlyGain:+(c.terminalTimeToFire-c.timeToFire).toFixed(3)}))});
   if(!exploration.actuate){
     memory.probeAnchor=null;
     memory.probeSuspendUntil=now+3;
     return original;
   }
 }
 // Consume the *source timestamps*, not just the current plan state. The
 // next intervention must observe two new independent low-yield events.
 if(active&&policy.opportunityGuard===true&&policy.engagementTrial!==true&&!probe){
   const e=policy.evidence;
   memory.lowYieldConsumed={targetId,time:Math.max(e?.time??-Infinity,
     ...(memory.lowYieldConfirmations?.times??[]))};
   memory.lowYieldConfirmations=null;
 }
 if(probe&&!ownedPlan){
   // Every exploration consumes its own observed stall; no permanent unlock.
   memory.probeAnchor=null;
   memory.probeSuspendUntil=now+2;
 }
 memory.lastType=best.type;
 memory.replanAt=now+.65;
 const planId=memory.nextPlanId=(memory.nextPlanId??0)+1;
 memory.plan={planId,type:best.type,targetId,weapon:game.local.weapon?.cat,
   since:now,actuated:active,initialDistance:dist,bestDistance:dist,lastDistance:dist,lastProgressAt:now,targetAt:{x:enemy.x,z:enemy.z},
   lastPose:{x:me.x,z:me.z},lastEnemy:{x:enemy.x,z:enemy.z},lastHp:game.local.hp,
   selfProgress:0,fireTicks:0,hpLoss:0,goal:best.goal,waypoints:[...best.waypoints],
   recovery:probe&&policy.engagementRecovery===true,plannedETA:best.timeToFire,
   exploration:exploration?{...exploration}:null,
   waypointBestDist:tdDist(me,best.waypoints[0]),waypointProgressTicks:0,waypointsReached:0};
 tdEmit(policy,{state:'director-planned',planId,targetId,active,type:best.type,
   utility:+best.utility.toFixed(3),risk:+best.risk.toFixed(3),
   timeToFire:+best.timeToFire.toFixed(3),uncertainty:+best.uncertainty.toFixed(3),
   routeLength:+best.travel.toFixed(3),options:options.length,budget:best.routeBudget,
   earlyShotWindow:best.earlyShotWindow===true,
   terminalTimeToFire:tdFinite(best.terminalTimeToFire)?+best.terminalTimeToFire.toFixed(3):null,
   shotProbeCount:best.shotProbeCount??0,
   ballisticQuality:tdFinite(best.ballistic?.quality)?+best.ballistic.quality.toFixed(4):null,
   ballisticExpectedDamage:tdFinite(best.ballistic?.expectedDamagePerTrigger)?
     +best.ballistic.expectedDamagePerTrigger.toFixed(3):null,
   ballisticCalibrated:false,
   motionQualityMin:tdFinite(best.motion?.qualityMin)?+best.motion.qualityMin.toFixed(4):null,
   motionRobustQuality:tdFinite(best.motion?.robustQuality)?+best.motion.robustQuality.toFixed(4):null,
   motionSpeed:tdFinite(best.motion?.speed)?+best.motion.speed.toFixed(3):null,
   motionCalibrated:false,rankedCandidates:scored.length,
   eligibleCandidates:eligible.length,selectedRank:scored.indexOf(best),
   explorationAttempt:exploration?.attempt??null,actionProbability:exploration?.actionProbability??null});
 return active?{x:waypoint.x-me.x,z:waypoint.z-me.z,goal:best.goal,
   reason:'director-'+best.type.toLowerCase()}:original;
}
