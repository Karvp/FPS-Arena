import {gunThreatScale} from './weapon-duel.mjs';
// FPS Arena camera-aware cover, reload and unpredictable peek planning.
// Opponent yaw/pitch come from snapshots; these are estimates, not guarantees.
const camClamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
const camDistance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const camFinite=(p)=>p&&Number.isFinite(p.x)&&Number.isFinite(p.z);
const camClearPoint=(p,map,pad=.78)=>{
  const bound=map?.bound||68;
  return camFinite(p)&&Math.abs(p.x)<bound-pad&&Math.abs(p.z)<bound-pad&&
    !(map?.boxes||[]).some(b=>b&&b.y0<(p.y||0)+1.5&&b.y1>(p.y||0)+.3&&
      p.x>b.x0-pad&&p.x<b.x1+pad&&p.z>b.z0-pad&&p.z<b.z1+pad);
};
const camSegmentCuts=(a,b,box)=>{
  // True 3-D segment / solid AABB intersection, not a 2-D silhouette with a
  // coarse height check. Low street obstacles and overhead roofs must not be
  // counted as hard cover when the enemy can shoot over or under them.
  let lo=0,hi=1;
  for(const [start,step,min,max] of [
    [a.x,b.x-a.x,box.x0,box.x1],
    [a.y||0,(b.y||0)-(a.y||0),box.y0,box.y1],
    [a.z,b.z-a.z,box.z0,box.z1]
  ]){
    if(Math.abs(step)<1e-9){if(start<min||start>max)return false;continue;}
    let u=(min-start)/step,v=(max-start)/step;
    if(u>v)[u,v]=[v,u];lo=Math.max(lo,u);hi=Math.min(hi,v);if(lo>hi)return false;
  }
  return lo<1&&hi>0;
};
export function cameraOccluded(map,eye,target){
  if(!camFinite(eye)||!camFinite(target))return false;
  // Broad-phase is a necessary, not sufficient, obstruction test. The final
  // decision still uses the same exact 3D segment/AABB slab intersection.
  const x0=Math.min(eye.x,target.x),x1=Math.max(eye.x,target.x);
  const z0=Math.min(eye.z,target.z),z1=Math.max(eye.z,target.z);
  const y0=Math.min(eye.y||0,target.y||0),y1=Math.max(eye.y||0,target.y||0);
  return (map?.boxes||[]).some(b=>b &&
    b.x1>=x0 && b.x0<=x1 && b.z1>=z0 && b.z0<=z1 &&
    b.y1>=y0 && b.y0<=y1 && camSegmentCuts(eye,target,b));
}
export function enemyCameraRisk(enemy,point,seconds=0,config={}){
  if(!camFinite(enemy)||!camFinite(point))return 0;
  const t=camClamp(seconds,0,1.3),ex=enemy.x+camClamp(enemy.vx||0,-12,12)*t*.7,
    ez=enemy.z+camClamp(enemy.vz||0,-12,12)*t*.7;
  const dx=point.x-ex,dz=point.z-ez,dy=(point.y??1.25)-(enemy.y??0)-1.5;
  const range=Math.hypot(dx,dz),length=Math.hypot(dx,dy,dz);
  if(length<.1)return 7;
  const yaw=enemy.yaw,pitch=enemy.pitch;
  if(!Number.isFinite(yaw))return 1.3;
  const cp=Math.cos(Number.isFinite(pitch)?pitch:0);
  const dot=camClamp((-Math.sin(yaw)*cp*dx + Math.sin(Number.isFinite(pitch)?pitch:0)*dy - Math.cos(yaw)*cp*dz)/length,-1,1);
  const angle=Math.acos(dot);
  const aiming=enemy.aim===true;
  const half= (aiming?18:34)*Math.PI/180;
  const uncertain=!Number.isFinite(pitch);
  // Lower floor = blind side is a *preference*, not absolute safety.
  let factor=angle<half?3.1:angle<half+22*Math.PI/180?1.8:angle<Math.PI*.58?.68:.30;
  if(uncertain)factor=Math.max(.48,factor*.83);
  if(!aiming)factor=.5+factor*.54;
  const distanceFactor=camClamp(1.6-range/155,.4,1.5);
  // Opponent weapons have different engagement envelopes. Do not zero risk
  // outside their preferred range: they might switch gun or move unexpectedly.
  const cat=enemy.weaponCategory;
  const threat=cat==='Shotgun' ? (range<12?1.85:range<25?1.06:.28) :
    cat==='SMG' ? (range<18?1.45:range<45?1.07:.45) :
    cat==='Pistol' ? (range<16?1.35:range<36?.85:.44) :
    cat==='Sniper' ? (range<18?.62:range<155?1.55:1.20) :
    cat==='Marksman' ? (range<16?.85:range<130?1.42:1.08) :
    cat==='LMG' ? (range<9?.8:range<100?1.43:.85) : 1;
  return factor*distanceFactor*threat*gunThreatScale(enemy.weaponStats,range)*camClamp(enemy.pressure??1,.77,1.1);
}
export function cameraExposure(map,p,contacts=[],seconds=.25){
  let sum=0,blocked=0;
  for(const c of contacts){
    if(!camFinite(c))continue;
    const eye={x:c.x,y:(c.y||0)+1.5,z:c.z};
    const target={x:p.x,y:(p.y||0)+1.3,z:p.z};
    if(cameraOccluded(map,eye,target)){blocked++;sum+=.045;}
    else sum+=enemyCameraRisk(c,target,seconds);
  }
  return {risk:sum,blocked};
}
function camCandidates(map,origin,maxRadius=13){
  const pts=[],level=origin.y||0;
  const relevant=(map?.boxes||[]).filter(b=>b&&b.y0<level+1.25&&b.y1>level+.45&&
    b.x0<origin.x+maxRadius+2&&b.x1>origin.x-maxRadius-2&&
    b.z0<origin.z+maxRadius+2&&b.z1>origin.z-maxRadius-2);
  for(const b of relevant){
    const pad=1.2,mx=(b.x0+b.x1)/2,mz=(b.z0+b.z1)/2;
    for(const p of [
      {x:b.x0-pad,z:mz},{x:b.x1+pad,z:mz},
      {x:mx,z:b.z0-pad},{x:mx,z:b.z1+pad},
      {x:b.x0-pad,z:b.z0-pad},{x:b.x0-pad,z:b.z1+pad},
      {x:b.x1+pad,z:b.z0-pad},{x:b.x1+pad,z:b.z1+pad}]){
      const point={...p,y:level};if(camDistance(point,origin)<=maxRadius&&camClearPoint(point,map))pts.push(point);
    }
  }
  return pts;
}
export function selectCameraCover(map,origin,contacts=[],target=null,{maxRadius=13,ringCheck=null}={}){
  if(!map||!camFinite(origin)||!contacts.length)return null;
  const start=cameraExposure(map,origin,contacts,0).risk;
  let best=null,bestScore=Infinity;
  const candidates=camCandidates(map,origin,maxRadius);
  if(camClearPoint(origin,map))candidates.push({x:origin.x,y:origin.y||0,z:origin.z});
  for(const point of candidates){
    if(ringCheck&&!ringCheck(point))continue;
    const dist=camDistance(origin,point);
    const c=cameraExposure(map,point,contacts,dist/6.5);
    // Only use locations with actual hard protection against one attacker;
    // merely being outside a guessed FoV is not enough to initiate a peek cycle.
    if(c.blocked<1)continue;
    const score=c.risk*4+dist*.24-c.blocked*.9;
    if(score<bestScore){best={point,risk:c.risk,blocked:c.blocked,startRisk:start};bestScore=score;}
  }
  // Multiple attackers can see different sides of a wall. Refuse 'cover'
  // that does not materially reduce total risk; default combat takes over.
  if(best && start>.8 && best.risk>=Math.min(start*.86,2.4))return null;
  return best;
}
// Given a hard-cover point, find both accessible left/right attack exposures.
export function selectPeekPoints(map,cover,enemy,contacts=[]){
  if(!camFinite(cover)||!camFinite(enemy))return [];
  const dx=enemy.x-cover.x,dz=enemy.z-cover.z,d=Math.hypot(dx,dz);
  if(d<.5)return [];
  const side={x:-dz/d,z:dx/d},result=[];
  for(const sign of [-1,1])for(const distance of [2.0,3.2,4.4]){
    const p={x:cover.x+side.x*distance*sign,y:cover.y||0,z:cover.z+side.z*distance*sign};
    if(!camClearPoint(p,map)||cameraOccluded(map,{x:enemy.x,y:(enemy.y||0)+1.5,z:enemy.z},{x:p.x,y:p.y+1.3,z:p.z}))continue;
    // The lane must be open from the candidate to its intended target.
    const risk=cameraExposure(map,p,contacts,.3).risk;
    result.push({point:p,sign,risk,distance});break;
  }
  return result;
}
function peekRand(memory){
  let x=memory.seed>>>0||0x9e3779b9;
  x^=x<<13;x^=x>>>17;x^=x<<5;memory.seed=x>>>0;
  return (memory.seed>>>0)/4294967296;
}
export function peekCycle(memory,now,availableSides=[],settings={}){
  if(!memory||!Array.isArray(availableSides)||!availableSides.length)return null;
  if(!Number.isFinite(memory.until)||now>=memory.until){
    const phase=memory.phase==='hidden'?'expose':memory.phase==='expose'?'retreat':'hidden';
    memory.phase=phase;
    if(phase==='expose'){
      // Sample by danger, prior exposure and side-history. Alternation is
      // predictable, so an occasional same-side repeat must remain possible.
      const history=memory.sideHistory||[];
      const weights=availableSides.map(p=>{
        const recent=history.slice(-4).filter(s=>s===p.sign).length;
        const last=history.at(-1)===p.sign ? .80 : 1;
        const safe=1/Math.max(.45,1+(p.risk||0)*.35);
        return Math.max(.09,safe*last/(1+recent*.6));
      });
      const total=weights.reduce((a,b)=>a+b,0);
      let pick=peekRand(memory)*total,index=0;
      while(index<weights.length-1 && (pick-=weights[index])>=0)index++;
      memory.selected=availableSides[index];
      history.push(memory.selected.sign);if(history.length>8)history.shift();
      memory.sideHistory=history;memory.lastSide=memory.selected.sign;
      // Travel time varies independently of the exposed shooting window.
      memory.until=now+.78+peekRand(memory)*.66;
      memory.exposureStarted=null;
    }else if(phase==='retreat'){
      memory.until=now+.22+peekRand(memory)*.66;
    }else{
      memory.cycle=(memory.cycle||0)+1;
      const roll=peekRand(memory);
      // 18% genuinely long waits, 13% medium, other waits short. No fixed
      // every-fourth-peek rhythm that a player could learn and pre-fire.
      const span=roll<.18 ? 2.2+peekRand(memory)*5.8 :
        roll<.31 ? 1.15+peekRand(memory)*2.0 : .32+peekRand(memory)*1.25;
      memory.until=now+(settings.longDelay===false?Math.min(1.35,span):span);
      memory.selected=null;
    }
  }
  return {phase:memory.phase,until:memory.until,selected:memory.selected||null};
}
// Engage when a reachable shot exists and the trainee can afford short exposure.
// Keep hard-cover/reload behaviour when damaged, severely outnumbered or exposed
// to a close ADS threat. This policy acts on visible client observations only.
export function shouldUseCombatPeek(game,target,combatState,contacts=[],now=0,settings={}){
  if(!target || !Array.isArray(contacts) || !contacts.length)return false;
  if(!settings?.adaptivePeek)return true; // explicit legacy A/B policy
  const local=game?.local||{}, mv=local.mv||{}, ws=local.ws||{};
  const loaded=ws.guns?.[ws.slot]?.mag ?? 0;
  if(ws.reloading || loaded<=0 || (ws.switchT||0)>0)return true;
  const hp=Number.isFinite(local.hp)?local.hp:100;
  if(hp<58 || (hp<77 && (local.armor||0)<8))return true;
  if(!target.visible)return true; // seek the lane only when needed
  const risk=combatState?.risk||{};
  if(risk.visible>=2 && (hp<91 || risk.aiming>0))return true;
  const recentDamage=Number.isFinite(combatState?.lastDamage) && now-combatState.lastDamage<1.5;
  if(recentDamage && hp<85)return true;
  // If a target is visible and the weapon is able to fire, an ordinary
  // engagement shouldn't be postponed by repeated hidden/peek intervals.
  return false;
}

// Optional v2.8.7 lab: resolve a specific contradiction between blind pursuit
// and a new camera cover anchor pointing backward. It is NOT a global heading
// lock; immediate visibility, damage, low resources or a newly exposed ray
// cancels it before the next input command.
export function shouldMaintainOccludedPursuit(game,contacts,target,pursuit,coverPlan,{now=0,lastDamage=-Infinity}={}){
  const mv=game?.local?.mv,ws=game?.local?.ws||{};
  if(!mv || !Array.isArray(contacts) || !contacts.length || !target || target.visible ||
      !pursuit || pursuit.reason!=='pro-rotate' ||
      coverPlan?.direction?.reason!=='peek-reposition-cover' ||
      ws.reloading || ws.plateT>0 || (ws.guns?.[ws.slot]?.mag??1)<=0 ||
      (game.local.hp??100)<75 || (game.local.armor??0)<12 ||
      now-lastDamage<1.5)return false;
  const px=pursuit.x,pz=pursuit.z,cx=coverPlan.direction.x,cz=coverPlan.direction.z;
  const pl=Math.hypot(px,pz),cl=Math.hypot(cx,cz);
  if(pl<.1 || cl<.5 || (px*cx+pz*cz)/(pl*cl)>-.40)return false;
  if(!camFinite(target.point)||camDistance(target.point,mv)<36)return false;
  const future={x:mv.x+px/pl*1.6,y:mv.y||0,z:mv.z+pz/pl*1.6};
  for(const c of contacts){
    if(!camFinite(c))return false;
    const eye={x:c.x,y:(c.y||0)+1.5,z:c.z};
    if(camDistance(c,mv)<12 ||
        !cameraOccluded(game.map,eye,{x:mv.x,y:(mv.y||0)+1.3,z:mv.z}) ||
        !cameraOccluded(game.map,eye,{x:future.x,y:future.y+1.3,z:future.z}))return false;
  }
  return true;
}
export function planCameraMovement(game,contacts,target,now,memory={},config={}){
  const pos=game?.local?.mv,map=game?.map;
  if(!camFinite(pos)||!map||!contacts.length)return null;
  const reloading=!!config.reloading;
  const nearest=contacts.reduce((best,c)=>!best||camDistance(c,pos)<camDistance(best,pos)?c:best,null);
  const intended=target?.remote?.pos || (target?.point ? {x:target.point.x,y:target.point.y-1.3,z:target.point.z}:nearest);
  const movingTarget=target?.id||nearest?.id||'unknown';
  const old=memory.cover;
  // Track ACTUAL distance-to-goal progress, not raw displacement. A bot
  // oscillating around the same wall should never refresh its progress timer.
  const sameIntent=memory.enemyId===movingTarget && memory.reloadCover===reloading;
  const contactIds=contacts.map(c=>String(c.id??'?')).sort().join('|');
  const sameContacts=memory.contactIds===contactIds;
  const oldDist=old?.point&&camFinite(old.point)?camDistance(pos,old.point):Infinity;
  if(!sameIntent || !sameContacts || !Number.isFinite(memory.coverBestDistance)){
    memory.coverBestDistance=oldDist;
    memory.coverProgressAt=now;
  }else if(oldDist<memory.coverBestDistance-.27){
    memory.coverBestDistance=oldDist;
    memory.coverProgressAt=now;
  }
  // Keep a valid cover goal during APPROACH only. Combat peek/exposure is
  // deliberately untouched: locking its waypoint suppresses valid shots.
  // Escape immediately when new opponents are seen, cover is lost, movement
  // stalls, or a battle-royale ring invalidates the old destination.
  // Do not hold combat repositioning against an actually visible target:
  // long matches showed this traded away too many shots on Arena.
  const approachEligible=reloading;
  const approaching=approachEligible && oldDist>=1.95 &&
    (!memory.cycleState || memory.cycleState.phase!=='expose');
  const progressRecent=now-(memory.coverProgressAt??now)<1.35;
  const coverValid=!!(old?.point && (!config.ringCheck||config.ringCheck(old.point)) &&
    // Static collision geometry needs full validation only when approaching;
    // this avoids adding a map-wide scan to every combat/peek frame.
    (!approaching || camClearPoint(old.point,map)));
  const coverOccludes=coverValid && approaching && progressRecent && sameIntent && sameContacts &&
    contacts.some(c=>camFinite(c)&&cameraOccluded(map,
    {x:c.x,y:(c.y||0)+1.5,z:c.z},
    {x:old.point.x,y:(old.point.y||0)+1.3,z:old.point.z}));
  const keepApproach=!!(sameIntent&&sameContacts&&approaching&&progressRecent&&coverOccludes&&
    now-(memory.coverCommitAt??now)<3.2);
  // Retain the 1.2s cadence for normal peek cycles, and cache negative results
  // to avoid expensive cover scans on open ground.
  const searchedRecently=Number.isFinite(memory.updated) && now-memory.updated<.8;
  const replan=!sameIntent||!sameContacts||(!old && !searchedRecently)||
    (!!old && (!coverValid || (!keepApproach && now-memory.updated>1.2)));
  if(replan){
    const nextCover=selectCameraCover(map,pos,contacts,intended,{maxRadius:14,ringCheck:config.ringCheck});
    const stable=old?.point && nextCover?.point && sameIntent && sameContacts &&
      camDistance(old.point,nextCover.point)<1.05;
    // Equivalent candidates often drift as the bot moves. Preserve the exact
    // validated waypoint to avoid point-chasing without changing peek timing.
    // Only preserve when the previous cover is still geometrically usable.
    const preserveAnchor=stable && coverValid && camClearPoint(old.point,map) &&
      contacts.some(c=>camFinite(c)&&cameraOccluded(map,
        {x:c.x,y:(c.y||0)+1.5,z:c.z},
        {x:old.point.x,y:(old.point.y||0)+1.3,z:old.point.z}));
    memory.cover=preserveAnchor?old:nextCover;memory.updated=now;memory.enemyId=movingTarget;
    memory.reloadCover=reloading;memory.contactIds=contactIds;
    if(!preserveAnchor){
      memory.path=null;memory.cycleState=null;memory.coverReadyAt=null;
      memory.coverBestDistance=nextCover?.point?camDistance(pos,nextCover.point):Infinity;
      memory.coverProgressAt=now;memory.coverCommitAt=now;
    }
  }
  const cover=memory.cover;if(!cover)return null;
  const delta={x:cover.point.x-pos.x,z:cover.point.z-pos.z};
  const distance=Math.hypot(delta.x,delta.z);
  // Avoid crossing the approach/peek boundary back and forth at ~1.35 m
  // due to movement latency. Hysteresis is legal ONLY if enemy bullet LOS
  // remains blocked by real 3D geometry at our present position.
  const reached=distance<1.35;
  if(reached)memory.coverReadyAt=now;
  const withinDwell=Number.isFinite(memory.coverReadyAt) && now-memory.coverReadyAt<1.1;
  const hasHardCover=withinDwell && distance<1.95 &&
    contacts.some(c=>camFinite(c) && cameraOccluded(map,
      {x:c.x,y:(c.y||0)+1.5,z:c.z},{x:pos.x,y:(pos.y||0)+1.3,z:pos.z}));
  const coverReady=reached || hasHardCover;
  if(!coverReady && distance>=1.95)memory.coverReadyAt=null;
  if(reloading){
    return {direction:coverReady?{x:0,z:0,reason:'reload-cover-hold',crouch:true}: {...delta,reason:'reload-take-cover'},
      holdFire:true,phase:'reload',cover:cover.point};
  }
  if(!config.peek || !camFinite(intended))return null;
  if(!coverReady && memory.cycleState?.phase!=='expose')return {direction:{...delta,reason:'peek-reposition-cover'},holdFire:false,phase:'approach',cover:cover.point};
  // Experimental peek-lane cache. Disabled by default: extended matches
  // showed reduced turns in some maps but uneven kills and CPU spikes.
  // The normal planner remains authoritative without this explicit lab flag.
  const cached=config.peekCacheLab===true?memory.peekCache:null;
  const useCache=cached && cached.map===map && cached.ids===contactIds &&
    now>=cached.at && now-cached.at<.12 &&
    camDistance(cover.point,cached.cover)<.08 &&
    camDistance(intended,cached.target)<.35;
  const peeks=useCache?cached.points:selectPeekPoints(map,cover.point,intended,contacts);
  if(config.peekCacheLab===true && !useCache)memory.peekCache={map,ids:contactIds,at:now,
    cover:{...cover.point},target:{...intended},points:peeks};
  if(!peeks.length)return null;
  const state=memory.cycleState||(memory.cycleState={phase:'retreat',until:now,cycle:0,seed:
    (String(movingTarget).split('').reduce((acc,c)=>Math.imul(acc,33)+c.charCodeAt(0)|0,0)^(Math.floor(now*1000)|0))>>>0});
  const cycle=peekCycle(state,now,peeks,{longDelay:config.longDelay});
  if(cycle.phase==='expose' && cycle.selected){
    const pt=cycle.selected.point;
    const risk= cameraExposure(map,pt,contacts,.25).risk;
    // If the predicted cone swings toward this peek location, abort exposure.
    if(risk>cover.risk+5.5){state.phase='retreat';state.until=now+.4;}
    else {
      const atLane=camDistance(pos,pt)<.95;
      if(atLane && state.exposureStarted===null){
        state.exposureStarted=now;
        state.until=now+.12+peekRand(state)*.42;
      }
      // Once a burst actually fires, leave after a brief confirmation interval.
      if(atLane && config.hasShot && state.exposureStarted!==null && now-state.exposureStarted>.05){
        state.phase='retreat';state.until=now+.19+peekRand(state)*.39;
      }else return {direction:{x:pt.x-pos.x,z:pt.z-pos.z,reason:'camera-surprise-peek',lean:cycle.selected.sign,peek:true},
        phase:'expose',holdFire:false,cover:cover.point};
    }
  }
  // Stop micro-correcting around the *exact* waypoint once every observed
  // opponent's eye-to-hitbox ray is blocked. Peek timing still advances and
  // urgent dodges override this plan at a higher priority.
  const protectedAtRest=distance<.85 && contacts.every(c=>!camFinite(c)||cameraOccluded(map,
    {x:c.x,y:(c.y||0)+1.5,z:c.z},
    {x:pos.x,y:(pos.y||0)+1.3,z:pos.z}));
  return {direction:protectedAtRest?{x:0,z:0,reason:'camera-hide-hold',crouch:true}:
    {x:delta.x,z:delta.z,reason:'camera-peek-hide',crouch:true},
    holdFire:true,phase:state.phase,cover:cover.point};
}
