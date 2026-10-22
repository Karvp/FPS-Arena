// Macro Combat 3.0 research: choose an *attacking vantage*, not just a sheltered
// direction. Public snapshots and static geometry only. No server/player internals.
// Bounded candidate evaluation and route recomputation. All emergency authority
// stays with the existing locomotion/resource controllers.
const mvgDistance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const mvgEligible=new Set(['camera-peek-hide','peek-reposition-cover','camera-cover-path','camera-peek-hold']);
const mvgPursuit=new Set(['pathfinding','pro-rotate','pro-long-range-close','duel-lateral-approach','engagement-sightline','macro-safe-advance']);
function mvgWalkable(map,p,eyeHeight){
  const bound=map?.bound??68,rad=.65;
  if(!Number.isFinite(p.x)||!Number.isFinite(p.z)||Math.abs(p.x)>bound-rad||Math.abs(p.z)>bound-rad)return false;
  return !(map?.boxes||[]).some(b=>b&&b.y0<eyeHeight-.3&&b.y1>eyeHeight-1.12 &&
    p.x>b.x0-rad&&p.x<b.x1+rad&&p.z>b.z0-rad&&p.z<b.z1+rad);
}
// Predict only from two fresh public interpolation samples. A hard displacement
// cap makes stale snapshots, respawns, and map teleports fail closed.
export function macroTargetForecast(target,horizon=0){
  const point=target?.point,buf=target?.remote?.buf;
  if(!point||!Number.isFinite(point.x)||!Number.isFinite(point.z))return null;
  const base={x:point.x,y:point.y,z:point.z};
  if(!Array.isArray(buf)||buf.length<2)return {...base,confidence:0,displacement:0};
  const a=buf.at(-2),b=buf.at(-1),dt=b?.t-a?.t;
  if(!(dt>=.025&&dt<=.35) || ![a?.x,a?.z,b?.x,b?.z].every(Number.isFinite))
    return {...base,confidence:0,displacement:0};
  const vx=(b.x-a.x)/dt,vz=(b.z-a.z)/dt,speed=Math.hypot(vx,vz);
  // This is tactical destination estimation, not an artificial aiming lead.
  if(speed<.35||speed>12.5||Math.hypot(b.x-point.x,b.z-point.z)>3.5)
    return {...base,confidence:0,displacement:0};
  const t=Math.max(0,Math.min(.9,Number.isFinite(horizon)?horizon:0));
  const fraction=.5; // moving targets can reverse before the bot arrives
  const dx=vx*t*fraction,dz=vz*t*fraction;
  return {...base,x:base.x+dx,z:base.z+dz,confidence:.5,displacement:Math.hypot(dx,dz)};
}
export function macroVantageCandidates(map,me,enemy,engageAt,params={}){
  if(!map||!me||!enemy||![me.x,me.y,me.z,enemy.x,enemy.z].every(Number.isFinite))return [];
  const out=[],range=Math.max(7,Math.min(24,engageAt-1.8));
  const dy=Math.abs((enemy.y??me.y+1.4)-(me.y+1.4));
  // Surface-aware fallback is handled by the existing multi-floor A*: do not
  // invent a cross-floor shooting perch from a planar projection.
  if(dy>3.6)return [];
  const gaze={x:enemy.x,y:enemy.y??me.y+1.4,z:enemy.z};
  for(let i=0;i<16;i++){
    const angle=i*Math.PI/8,p={x:enemy.x+Math.cos(angle)*range,y:me.y,z:enemy.z+Math.sin(angle)*range};
    if(!mvgWalkable(map,p,me.y+1.45))continue;
    const eye={x:p.x,y:p.y+1.45,z:p.z};
    if(params.shotClear && !params.shotClear(eye,gaze))continue;
    const d=mvgDistance(me,p),enemyDist=mvgDistance(enemy,p);
    // A real firing angle, not simply a low-risk hide position. Relative
    // path length is only a *cheap first pass*, final route is checked later.
    const risk=typeof params.riskAt==='function'?params.riskAt(p):0;
    if(!Number.isFinite(risk))continue;
    const routeAdvance=mvgDistance(me,enemy)-enemyDist;
    if(routeAdvance<3)continue;
    const score=d*.72+Math.max(0,risk)*1.55+Math.abs(enemyDist-engageAt)*.34;
    out.push({point:p,score,risk,planarDistance:d,approachGain:routeAdvance});
  }
  return out.sort((a,b)=>a.score-b.score);
}
export function chooseMacroVantage(game,target,phase,pursuit,reactive,now=0,memory={},policy={}){
  const mv=game?.local?.mv,local=game?.local;
  // A bounded event stream reports eligibility as well as successful actuation;
  // sampling prevents one telemetry object allocation per 60 Hz movement tick.
  const notify=(state,detail={})=>{
    if(typeof policy.onDecision!=='function')return;
    if(state==='ineligible'||state==='reuse'||state==='cooldown'){
      if(now-(memory.lastNotice??-Infinity)<.75)return;
      memory.lastNotice=now;
    }
    policy.onDecision({state,...detail});
  };
  const blocked=!mv||!game?.map||!target?.point?'missing-state':
    target.visible!==false?'target-visible':phase?.phase!=='approach'||phase.suspended?'not-approaching':
    !mvgEligible.has(reactive?.reason)?'other-reactive-action':
    !mvgPursuit.has(pursuit?.reason)?'other-pursuit-action':
    !local.alive||local.hp<72||local.armor<20||local.ws?.reloading||local.ws?.plateT>0?'unsafe-resources':
    phase.distance<phase.engageAt+7||phase.distance>(phase.weaponClass==='SMG'?78:46)||
    (phase.weaponClass==='SMG'&&phase.distance<60)?'out-of-planning-window':
    policy.emergency||policy.dodge||policy.recovery||policy.ring||policy.objective||policy.loot?'higher-priority':
    typeof policy.route!=='function'||typeof policy.shotClear!=='function'||
    typeof policy.canStep!=='function'||typeof policy.riskAt!=='function'?'missing-geometry-callback':null;
  if(blocked){notify('ineligible',{reason:blocked});return reactive;}
  const enemy=target.point,id=String(phase.targetId??target.id??'');
  const old=memory.plan;
  if(old && old.id===id && now-old.time<2.1 && mvgDistance(old.enemy,enemy)<4.2 &&
    old.waypoints?.length && now-(old.progressAt??old.time)<1.5){
    while(old.waypoints.length && mvgDistance(mv,old.waypoints[0])<1.35)old.waypoints.shift();
    if(old.waypoints.length){
      const wp=old.waypoints[0],dx=wp.x-mv.x,dz=wp.z-mv.z,len=Math.hypot(dx,dz);
      const remain=mvgDistance(mv,old.goal);
      if(remain<(old.bestRemain??Infinity)-.75){old.bestRemain=remain;old.progressAt=now;}
      if(len>.15 && policy.canStep(dx/len,dz/len,Math.min(1.6,len)) &&
         policy.riskAt({x:mv.x+dx/len*1.8,y:mv.y,z:mv.z+dz/len*1.8}) < 5.5)
        {notify('reuse');return {x:dx,z:dz,reason:'macro-vantage-approach',macroPhase:'approach',goal:old.goal};}
    }
  }
  // Negative-cache failures too, so a crowded map cannot force repeated A*.
  if(now-(memory.lastSearch??-Infinity)<1.6){notify('cooldown');return reactive;}
  memory.lastSearch=now;memory.plan=null;
  // Temporal mode is research-only: extrapolate fresh remote samples for no
  // more than 0.9 s, then require shooting geometry to remain viable.
  const estimate=policy.temporal ? macroTargetForecast(target,
    Math.min(.9,Math.max(.15,mvgDistance(mv,enemy)/9*.24))) : null;
  const future=estimate?.confidence?estimate:enemy;
  const candidates=macroVantageCandidates(game.map,mv,future,phase.engageAt,{
    shotClear:policy.shotClear,riskAt:policy.riskAt
  });
  if(!candidates.length)notify('no-shootable-site');
  // Only consider two shootable destinations. The candidate score includes
  // *integrated* travel exposure: a protected destination reached across an
  // open firing lane is not safer than a slightly longer flank.
  let best=null;
  for(const site of candidates.slice(0,2)){
    if(site.risk>4.5)continue;
    // Reject overly speculative destinations if the current target is not
    // also shootable from the chosen location. A target that might turn back
    // before arrival should not lure the bot into an exposed dead end.
    if(estimate?.confidence&&estimate.displacement>1.1 &&
      !policy.shotClear({x:site.point.x,y:site.point.y+1.45,z:site.point.z},enemy))continue;
    const waypoints=policy.route(mv,site.point);
    if(!Array.isArray(waypoints)||!waypoints.length)continue;
    const first=waypoints.find(p=>mvgDistance(mv,p)>1.3);
    if(!first)continue;
    const dx=first.x-mv.x,dz=first.z-mv.z,len=Math.hypot(dx,dz);
    if(len<.15||!policy.canStep(dx/len,dz/len,Math.min(1.6,len)))continue;
    let travel=0,last=mv,risk=0,sampled=0;
    for(let j=0;j<waypoints.length;j++){
      const p=waypoints[j];travel+=mvgDistance(last,p);last=p;
      if(j%3===0 || j===waypoints.length-1){
        const r=policy.riskAt(p);if(!Number.isFinite(r)){risk=Infinity;break;}
        risk+=Math.max(0,r);sampled++;
      }
    }
    if(travel>site.planarDistance*1.75+7||risk/Math.max(1,sampled)>2.8)continue;
    const score=site.score+travel*.25+risk/Math.max(1,sampled)*2.5;
    if(!best||score<best.score)best={site,waypoints,first,score};
  }
  if(best){
    const {site,waypoints,first}=best;
    memory.plan={id,enemy:{x:enemy.x,z:enemy.z},goal:site.point,
      time:now,progressAt:now,bestRemain:mvgDistance(mv,site.point),waypoints:[...waypoints]};
    notify('planned',{temporalDisplacement:+(estimate?.displacement||0).toFixed(2)});
    return {x:first.x-mv.x,z:first.z-mv.z,reason:'macro-vantage-approach',macroPhase:'approach',goal:site.point};
  }
  notify('no-safe-route',{candidateCount:candidates.length});
  return reactive;
}
