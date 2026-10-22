import {safeDirection,isAirborneOpponent} from './combat-core.mjs';
import {gridRoute,zombieMotionContacts,zombieInterceptRisk} from './navigation-core.mjs';
import {pickupUpgradeValue,brPickupDecision} from './weapon-policy.mjs';
import {zombiePickupDecision} from './zombie-weapon-choice.mjs';
// Server-authoritative BR / Zombies loot planner. Navigation and interaction use normal player inputs.
// Never invent loot or bypass the server's item ownership / pickup checks.
// A weaponless BR/Zombies player is not a combatant. In particular, the
// game's "fists" weapon is infinite but deals zero damage: infinite != armed.
// A knife is useful at point blank, but a melee-only loadout still urgently
// needs a firearm and must not initiate fake ranged duels.
export function weaponLootState(game, weaponCatalog={}) {
  const ws=game?.local?.ws, guns=ws?.guns;
  if(!Array.isArray(guns) || !guns.length)return {needsWeapon:false, switchSlot:-1, activeArmed:false};
  const firearm=(g)=>{
    const w=g && (weaponCatalog[g.id] || (g.id===guns[ws.slot]?.id?game?.local?.weapon:null));
    return !!(w && !w.unarmed && !w.melee && !w.skillWeapon);
  };
  const active=firearm(guns[ws.slot]), otherIndex=guns.findIndex((g,i)=>i!==ws.slot && firearm(g));
  const armed=guns.some(firearm);
  const usable=guns.some(g=>firearm(g) && ((g.mag??0)>0 ||
    weaponCatalog[g.id]?.infinite || !ws.finite || (g.reserve??0)>0));
  return {needsWeapon:!armed,needsAmmo:armed && !usable,activeArmed:active,
    switchSlot:!active && otherIndex>=0 ? otherIndex : -1};
}

// Explicit exploration fallback when the snapshot contains no reachable guns.
// Picks stable sector waypoints, rather than circling an imaginary enemy.
export function searchForWeapon(game,helpers,previous={},now=0) {
  const mv=game?.local?.mv, map=game?.map;
  if(!mv || !map?.boxes || !helpers?.rayWorld)return null;
  const bound=Math.max(14,(map.bound||68)-10), ring=game?.modeState?.type==='br'?game.modeState?.ring:null;
  // Hold safe ground rather than sweeping arbitrary search sectors out of the final ring.
  if(ring && (ring.phase==='closing' || ring.r<25) && !ringSafetyPlan(game))
    return {direction:{x:0,z:0,reason:'br-endgame-hold',sprint:false},
      goal:{x:mv.x,z:mv.z},searchSector:previous.searchSector??0,searchUpdated:now};
  const center=ring&&Number.isFinite(ring.cx)&&Number.isFinite(ring.cz)?{x:ring.cx,z:ring.cz}:{x:0,z:0};
  const radius=ring&&Number.isFinite(ring.r)?Math.max(5,Math.min(bound*.5,ring.r-13)):bound*.5;
  const sectors=[{x:center.x+radius,z:center.z},{x:center.x,z:center.z+radius},
    {x:center.x-radius,z:center.z},{x:center.x,z:center.z-radius},center];
  let i=Number.isInteger(previous.searchSector)?previous.searchSector:0;
  if(!Number.isFinite(previous.searchUpdated)||now-previous.searchUpdated>9 ||
     Math.hypot(mv.x-sectors[i%5].x,mv.z-sectors[i%5].z)<5)i=(i+1)%sectors.length;
  const index=i%sectors.length;
  const goal=sectors[index];
  const x=goal.x-mv.x,z=goal.z-mv.z;
  if(!safeDirection(game,x,z,helpers,1.4)){
    for(const side of [{x:z,z:-x},{x:-z,z:x},{x:-x,z:-z}])
      if(safeDirection(game,side.x,side.z,helpers,1.4))
        return {direction:{...side,reason:'weapon-search',sprint:true},searchSector:index,searchUpdated:now,goal};
    return null;
  }
  return {direction:{x,z,reason:'weapon-search',sprint:true},goal,searchSector:index,
    searchUpdated:now};
}
export function nearestZombie(game) {
  if(game?.modeState?.type!=='zm' || !game.local?.mv) return null;
  const {x,z}=game.local.mv;
  let best=null;
  for(const r of game.zremotes?.list || []) {
    if(!r?.alive || !r.pos || !Number.isFinite(r.pos.x) || !Number.isFinite(r.pos.z)) continue;
    const dx=r.pos.x-x,dz=r.pos.z-z,d=Math.hypot(dx,dz);
    if(!best||d<best.distance)best={id:r.id,point:r.pos,distance:d,remote:r};
  }
  return best;
}
export function zombieKite(game,helpers,options,now=0) {
  const zombie=nearestZombie(game),mv=game?.local?.mv;
  if(!zombie||!mv)return null;
  const spacing=Math.max(12,Math.min(34,options?.zombieSpacing??22));
  // Zombie attack is melee and speed ~7.25m/s: ensure an ample reaction buffer.
  const margin=game.local.ws?.reloading?10:5;
  if(zombie.distance>=spacing+margin)return null;
  const dx=mv.x-zombie.point.x,dz=mv.z-zombie.point.z;
  const d=Math.max(.01,Math.hypot(dx,dz)),away={x:dx/d,z:dz/d};
  const side={x:-away.z,z:away.x},sign=Math.floor(now/1.6)%2?-1:1;
  const can=(v)=>helpers?.rayWorld && safeDirection(game,v.x,v.z,helpers,Math.min(2.1,Math.max(.9,d*.15)));
  // When threatened by several zombies, maximize minimum separation rather than reversing into a pack.
  const others=(game.zremotes?.list||[]).filter(r=>r?.alive&&r.pos);
  const choices=[away,{x:away.x*.8+side.x*sign*.65,z:away.z*.8+side.z*sign*.65},
    {x:away.x*.8-side.x*sign*.65,z:away.z*.8-side.z*sign*.65},side,{x:-side.x,z:-side.z}];
  let best=null;
  for(const v of choices){
    if(!can(v))continue;
    let score=0;
    for(const r of others){const nextD=Math.hypot(mv.x+v.x*2-r.pos.x,mv.z+v.z*2-r.pos.z);
      score+=Math.min(nextD,spacing)*.025 + (nextD<10?-10/(nextD+1):0);
    }
    score+=v.x*away.x+v.z*away.z;
    if(!best||score>best.score)best={...v,score};
  }
  return best?{x:best.x,z:best.z,reason:'zombie-kite',sprint:true,slide:false}: {x:0,z:0,reason:'zombie-no-safe-exit'};
}
const d2=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
// Battle Royale ring planner based on authoritative modeState.ring snapshots.
// The server deals escalating pure damage outside the CURRENT ring and publishes
// the next circle in ring.nxt. Do not treat the current ring as safe if it is
// about to shrink away from the player.
export function ringSafetyPlan(game, settings={}) {
  if(game?.modeState?.type!=='br' || !game.local?.mv || !game.local.alive)return null;
  const r=game.modeState.ring, mv=game.local.mv;
  if(!r || ![r.cx,r.cz,r.r,mv.x,mv.z].every(Number.isFinite) || r.r<=0)return null;
  const dist=(c)=>Math.hypot(mv.x-c.cx,mv.z-c.cz);
  const margin=(c)=>Math.min(10,Math.max(1.25,Math.min(c.r*.24,10)));
  const inward=(c)=>Math.max(0,c.r-margin(c));
  const currentDist=dist(r);
  const outside=currentDist>=r.r-.6 || (game.you?.ringRate||0)>0;
  const tooClose=currentDist>inward(r);
  const next=r.nxt;
  const hasNext=next && [next.cx,next.cz,next.r].every(Number.isFinite) && next.r>0;
  const phase=r.phase||'wait';
  let target=r, reason='br-ring-escape', urgent=outside || phase==='closing';
  if(hasNext){
    const nextDist=dist(next), outsideNext=nextDist>inward(next);
    // Conservatively estimate 5 m/s for mud, water, corners and latency;
    // player can usually sprint at 8.28 m/s on level terrain.
    const travelTime=Math.max(0,nextDist-inward(next))/3.8;
    const countdown=Number.isFinite(r.next)?r.next:0;
    // Start deliberately early: account for detours, movement acceleration, and an ambush.
    const buffer=Math.max(10,Math.min(42,settings.brLeadSeconds??24));
    const rotateEarly=phase==='shrinking' || phase==='closing' || countdown<=travelTime+buffer+7;
    if(outsideNext && (outside || rotateEarly)){
      target=next;reason=outside?'br-ring-escape':'br-next-ring';
      urgent=outside || phase==='shrinking' || phase==='closing' || countdown<=travelTime+8 || (game.you?.ringRate||0)>0;
    }
  }
  if(target===r && !tooClose && !outside && phase!=='closing')return null;
  // During final closure the circle tends to zero: no algorithm can promise
  // survival, but seek its center rather than stop at the dissolving rim.
  const d=dist(target), safeRadius=phase==='closing'?0:inward(target);
  let gx=target.cx,gz=target.cz;
  if(d>1e-5){
    const radial=Math.max(0,Math.min(safeRadius*.68,d));
    gx=target.cx+(mv.x-target.cx)*radial/d;
    gz=target.cz+(mv.z-target.cz)*radial/d;
  }
  if(Math.hypot(gx-mv.x,gz-mv.z)<.55)return null;
  return {goal:{x:gx,y:mv.y,z:gz},reason,urgent,
    outside, target, phase, nextSeconds:Number.isFinite(r.next)?r.next:0};
}
// Low-cost directional fallback. Actual waypoint A* is selected by the input
// arbiter, not here, so it can cache paths and avoid recomputing every tick.
export function battleRoyaleRingEscape(game,helpers,settings={}) {
  const plan=ringSafetyPlan(game,settings);
  if(!plan)return null;
  const mv=game.local.mv,dx=plan.goal.x-mv.x,dz=plan.goal.z-mv.z;
  if(safeDirection(game,dx,dz,helpers,1.55))
    return {x:dx,z:dz,reason:plan.reason,sprint:true,ringPlan:plan};
  const n=Math.max(.001,Math.hypot(dx,dz)),ux=dx/n,uz=dz/n;
  // Search diagonals as well as perpendiculars; use consistent preferred side.
  const pref=settings.ringDetourSide===-1?-1:1;
  for(const angle of [.30,.55,.82,1.12,1.45,1.80,2.15,2.55,Math.PI]){
    for(const side of [pref,-pref]){
      const a=angle*side,ca=Math.cos(a),sa=Math.sin(a);
      const v={x:ux*ca-uz*sa,z:ux*sa+uz*ca};
      if(safeDirection(game,v.x,v.z,helpers,1.55))return {...v,reason:'br-ring-detour',sprint:true,ringPlan:plan,detourSide:side};
    }
  }
  return {x:0,z:0,reason:'br-ring-route-needed',ringPlan:plan};
}
// Budget an opportunistic detour before the next circle closes.
export function brLootTimeBudget(game,options={},item=null,knownPlan=null) {
  if(game?.modeState?.type!=='br')return {allowed:true,slack:Infinity};
  const plan=knownPlan || ringSafetyPlan(game,options);
  if(!plan)return {allowed:true,slack:Infinity};
  const ring=game.modeState.ring,mv=game.local?.mv;
  if(!mv||plan.urgent||plan.reason!=='br-next-ring'||ring?.phase!=='wait'||
     !Number.isFinite(ring.next)||ring.next<=0)return {allowed:false,slack:-Infinity};
  const circle=plan.target;
  const reach=(p)=>Math.max(0,d2(p,{x:circle.cx,z:circle.cz})-
      Math.max(0,circle.r-Math.max(5,Math.min(11,circle.r*.24))));
  const toItem=item?d2(mv,item):0,toSafety=reach(item||mv),direct=reach(mv);
  const detour=toItem+toSafety-direct;
  const slack=ring.next-(toItem+toSafety*1.25)/3.8-17;
  return {allowed:slack>6&&detour<Math.max(15,Math.min(32,ring.next*.48)),slack,detour};
}
export function lootSafe(game,threat,options,weaponCatalog={}) {
  if(!['zm','br'].includes(game?.modeState?.type) || !game?.local?.alive || !game.local.mv || !game.loot?.data) return false;
  if(game.local.ws?.plateT>0 || game.local.down || game.local.frozen || game.local.mv.air || game.local.mv.heli)return false;
  const loadout=weaponLootState(game,weaponCatalog);
  const urgent=loadout.needsWeapon||loadout.needsAmmo;
  if(game.modeState.type==='br'){
    // Weaponless players cannot win a duel; nearby enemies must not freeze looting.
    // Truly point-blank contact is handled by the emergency escape controller.
    const nearest=threat?.nearest??Infinity;
    // A faraway visible opponent should not veto every weapon upgrade in BR.
    // Reject imminent/aimed close pressure and let path/route exposure choose
    // between otherwise safe opportunistic items.
    if(!urgent && (nearest<22 || (nearest<34 && (threat?.aiming||0)>0)))return false;
    // A visible scoped marksman or LMG at long range can still punish a loot
    // interaction. Do not interpret distance alone as cover.
    if(!urgent && (threat?.visible||0)>0){
      const watchers=[...(game.remotes?.list||[]),...(game.bremotes?.list||[])];
      if(watchers.some(r=>r?.alive && r.pos && !isAirborneOpponent(r,game.local.mv,10) && r.data?.aim &&
        ['Sniper','Marksman','LMG'].includes(weaponCatalog[r.data?.w]?.cat) &&
        Math.hypot(r.pos.x-game.local.mv.x,r.pos.z-game.local.mv.z)<105 &&
        (game.you?.tm==null || r.team!==game.you.tm)))return false;
    }
    // Evaluate time to reach an actual loot candidate below, not a fictitious
    // detour to the current position. The old global time-budget veto skipped
    // valuable opening crates even when they lay directly along the safe route.
    const ringPlan=ringSafetyPlan(game,options);
    if((game.local.gas||0)>0 || (game.you?.ringRate||0)>0 || ringPlan?.urgent)return false;
    // During soft rotation only candidates that preserve enough travel time are
    // eligible. Keep this probe bounded; reuse the ring calculation per tick.
    if(!brLootTimeBudget(game,options,null,ringPlan).allowed){
      const mv=game.local.mv, entities=[...(game.loot.data.crates||[]).filter(c=>!c.open),
        ...(game.loot.data.items||[])];
      if(!entities.sort((a,b)=>d2(a,mv)-d2(b,mv)).slice(0,6)
        .some(c=>brLootTimeBudget(game,options,c,ringPlan).allowed))return false;
    }
  }else{
    const closest=nearestZombie(game);
    // A visible zombie at 30m cannot block all crates for the entire wave.
    // The candidate's *route* is evaluated against the full horde below.
    if(closest && closest.distance < (urgent?5.5:8)) return false;
  }
  return true;
}
export function lootCandidates(game,options,weaponCatalog={},ammoClassOf=()=>null) {
  if(!['zm','br'].includes(game?.modeState?.type)||!game.loot?.data||!game.local?.mv)return [];
  const mv=game.local.mv, ws=game.local.ws, guns=ws?.guns||[], maxDist=options?.lootRange??55;
  const loadout=weaponLootState(game,weaponCatalog);
  const urgent=loadout.needsWeapon||loadout.needsAmmo;
  const candidates=[];
  const ring=game.modeState?.type==='br'?game.modeState?.ring:null;
  const ringPlan=ring?ringSafetyPlan(game,options):null;
  const add=(entity,kind,value,dist,interact,swapSlot=null)=>{
    if(dist>maxDist || Math.abs(entity.y-mv.y)>2.6)return;
    if(game.modeState?.type==='zm' && (game.zremotes?.list||[]).some(r=>r?.alive && r.pos && d2(r.pos,entity)<(urgent?5.5:7)))return;
    if(urgent && game.modeState?.type==='br' && [...(game.remotes?.list||[]),...(game.bremotes?.list||[])].some(r=>r?.alive&&r.pos&&r.team!==game.you?.tm &&
      !isAirborneOpponent(r,entity,10) && d2(r.pos,entity)<10))return;
    // Stay inside the active BR ring and leave a safety margin for return movement.
    if(ring && d2(entity,{x:ring.cx,z:ring.cz})>Math.max(0,ring.r-5))return;
    if(ringPlan && !brLootTimeBudget(game,options,entity,ringPlan).allowed)return;
    candidates.push({id:`${kind}:${entity.id}`,entity,kind,interact,distance:dist,
      score:value-dist*.8,swapSlot,point:{x:entity.x,y:entity.y,z:entity.z}});
  };
  const occupied=guns.filter(g=>g && weaponCatalog[g.id] && !weaponCatalog[g.id].unarmed && !weaponCatalog[g.id].melee && !weaponCatalog[g.id].skillWeapon);
  const rarityOf=(id)=>weaponCatalog[id]?.rarity??0;
  const worstRarity=occupied.length?Math.min(...occupied.map(g=>rarityOf(g.id))):-1;
  const lowSupplies=guns.some(g=>{const w=weaponCatalog[g?.id];return w && !w.unarmed && !w.melee && !w.infinite &&
    (g.mag??0)+(g.reserve??0)<Math.max(8,(w.magSize||30)*1.25);});
  for(const c of game.loot.data.crates||[]){
    if(c.open)continue;
    const dist=d2(c,mv), quality=Math.max(0,c.rar||0);
    add(c,'crate',(urgent?210:lowSupplies?150:60)+quality*7,dist,true);
  }
  for(const it of game.loot.data.items||[]){
    const dist=d2(it,mv);
    let value=0, interact=false, swapSlot=null;
    if(it.kind===0){ // gun: prevent swapping away a good weapon for junk
      const w=weaponCatalog[it.wid];
      if(!w || w.unarmed || w.melee || w.skillWeapon)continue;
      const rarity=it.rar??w.rarity??0;
      if(loadout.needsWeapon)value=270+rarity*5;
      else if(loadout.needsAmmo)value=140+rarity*5;
      else if(occupied.length<2)value=75+rarity*5;
      else {
        // The server replaces the EQUIPPED gun, not the weakest rarity slot.
        // In particular, never drop a strong primary while holding slot 0.
        const upgrade=game.modeState?.type==='zm'?zombiePickupDecision(game,w,weaponCatalog):
          game.modeState?.type==='br'?brPickupDecision(game,w,weaponCatalog):null;
        if(upgrade){value=upgrade.score+rarity*2;swapSlot=upgrade.slot;}
        else {const existing=pickupUpgradeValue(game,w,weaponCatalog);
          if(existing!==null)value=existing+rarity*2;}
      }
      interact=true;
    }else if(loadout.needsWeapon)continue; // No firearm: do not divert to ammo, plates or consumables.
    else if(it.kind===1){ // ammo: only if the player has a compatible weapon
      const matches=guns.filter(g=>g && !weaponCatalog[g.id]?.unarmed && ammoClassOf(g.id)===it.wid);
      if(!matches.length)continue;
      const depleted=matches.some(g=>(g.reserve??0)<(weaponCatalog[g.id]?.magSize||30)*2);
      value=loadout.needsAmmo?235:depleted?135:10;
    }else if(it.kind===2) value=loadout.needsAmmo?0:game.local.plates>= (game.you?.maxPlates??5)?0:50;
    else if(it.kind===3)value=loadout.needsAmmo?0:(game.local.thr?.n||0)>=2?0:26;
    else if(it.kind===4)value=loadout.needsAmmo?0:(game.local.energy||0)>85?0:25;
    else if(it.kind===5)value=loadout.needsAmmo?0:(game.you?.kits||0)>=2?0:55;
    if(value>0)add(it,'item',value,dist,interact,swapSlot);
  }
  return candidates.sort((a,b)=>b.score-a.score);
}
// Select a reachable crate/item using detour length and crowd exposure,
// instead of selecting by Euclidean distance then marching into a wall.
// Routes are cached for 1.2 s in per-game memory to avoid 60 Hz A* spikes.
export function rankZombieLoot(game,choices,prev={},now=0) {
  if(!choices?.length)return null;
  const mv=game.local.mv, contacts=zombieMotionContacts(game.zremotes?.list||[]);
  // Recheck the NEXT SEGMENT instead of blindly trusting a cached static route.
  // A pair of flankers can close a previously open corridor in under a second.
  const corridorRisk=(route)=>{
    let risk=0,prevPoint=mv,meters=0,shortRisk=0;
    for(const wp of route){
      meters+=Math.hypot(wp.x-prevPoint.x,wp.z-prevPoint.z);
      const hazard=zombieInterceptRisk(wp,contacts,meters/6.3);
      risk+=hazard*Math.min(2.4,Math.hypot(wp.x-prevPoint.x,wp.z-prevPoint.z));
      if(meters<13)shortRisk=Math.max(shortRisk,hazard);
      prevPoint=wp;
    }
    return {risk,shortRisk,meters};
  };
  if(prev.routeCache && now-prev.routeCache.time<.65){
    const kept=choices.find(c=>c.id===prev.routeCache.id);
    const path=prev.routeCache.path||[];
    if(kept && path.length && corridorRisk(path).shortRisk<24)
      return {...kept,route:path,routeCost:prev.routeCache.cost,routeCached:true};
  }
  let best=null,score=-Infinity;
  const eligible=choices.filter(c=>!(c.id===prev.avoidTarget && now<(prev.avoidUntil??0)));
  const pool=[...(eligible.length?eligible:choices)]
    .sort((a,b)=>(b.score-a.score)*.2+(a.distance-b.distance))
    .slice(0,4);
  for(const c of pool){
    // Keep the most relevant pursuers, including flankers on the approach.
    // This bounds CPU usage during 70+ zombie waves on low-end systems.
    const relevant=contacts.map(z=>{
      const dx=c.point.x-mv.x,dz=c.point.z-mv.z;
      const t=Math.max(0,Math.min(1,((z.x-mv.x)*dx+(z.z-mv.z)*dz)/Math.max(.01,dx*dx+dz*dz)));
      return {z,range:Math.hypot(z.x-mv.x-dx*t,z.z-mv.z-dz*t)};
    }).sort((a,b)=>a.range-b.range).slice(0,36).map(v=>v.z);
    // Dynamic A*: being surrounded on two sides does not mean every loot
    // destination is unreachable. Allow a longer flank through open space.
    const path=gridRoute(game.map,mv,c.point,{maxExpanded:4600,
      zombieRiskWeight:.20,zombieContacts:relevant,speed:6.3});
    if(!path?.length)continue;
    const measured=corridorRisk(path);
    // Prefer reachable supplies rather than choosing a static-distance winner.
    // Penalize interception *over the complete journey*, including pinches.
    const utility=c.score-measured.meters*.84-measured.risk*.19;
    if(utility>score){score=utility;best={...c,route:path,routeCost:measured.meters,routeScore:utility};}
  }
  return best;
}

export function zombieLootMustEvade(game,lootPlan,nearest=null,settings={}) {
  const zombie=nearest||nearestZombie(game);
  if(!zombie)return false;
  if(zombie.distance<8)return true;
  if(!lootPlan)return zombie.distance<Math.max(11,(settings.zombieSpacing??22)*.75);
  // Crate path can be followed if the zombie is not actively cutting off the
  // player's NEXT step. Distance to the loot must not be mistaken for Infinity.
  const next=lootPlan.route?.[0] || lootPlan.goal;
  if(next && zombie.distance<12){
    const mv=game.local.mv;
    const d=Math.hypot(next.x-mv.x,next.z-mv.z);
    if(d>.001){
      const px=mv.x+(next.x-mv.x)/d*Math.min(4,d);
      const pz=mv.z+(next.z-mv.z)/d*Math.min(4,d);
      if(Math.hypot(px-zombie.point.x,pz-zombie.point.z)<6.5)return true;
    }
  }
  return false;
}
export function planLoot(game,threat,options,helpers,weaponCatalog={},ammoClassOf=()=>null,prev={},now=0) {
  const state=weaponLootState(game,weaponCatalog);
  const urgent=state.needsWeapon||state.needsAmmo;
  if((!options?.autoLoot && !urgent) || !lootSafe(game,threat,options,weaponCatalog))return null;
  const choices=lootCandidates(game,options,weaponCatalog,ammoClassOf);
  if(!choices.length)return null;
  const target=game.modeState.type==='zm' ? rankZombieLoot(game,choices,prev,now) :
    ((prev.targetId&&choices.find(v=>v.id===prev.targetId && v.score>0))||choices[0]);
  if(!target || target.score < -4)return null;
  if(game.modeState.type==='zm' && target.route)prev.routeCache={
    time:target.routeCached && prev.routeCache?.id===target.id?prev.routeCache.time:now,
    id:target.id,path:target.route,cost:target.routeCost};
  const mv=game.local.mv, distance=target.distance;
  if(target.kind==='crate' && distance<2.5 || target.kind==='item' && target.interact && distance<2.1){
    const h=helpers.eyeHeightOf?.(mv)??1.6;
    const cy=target.point.y+(target.kind==='crate'?.45:.35);
    const dx=target.point.x-mv.x,dz=target.point.z-mv.z,dy=cy-(mv.y+h);
    return {targetId:target.id,kind:target.kind,distance, direction:null,interact:true,prepareSlot:target.swapSlot,
      yaw:Math.atan2(-dx,-dz),pitch:Math.atan2(dy,Math.hypot(dx,dz)),reason:'loot-interact',
      // Pulse F: server requires a new rising edge.
      use:now-(prev.lastUse??-Infinity)>.55};
  }
  if(target.kind==='item'&&!target.interact && distance<1.35)
    return {targetId:target.id,kind:target.kind,distance,direction:null,interact:false,reason:'loot-auto-pickup'};
  if(distance<.1)return null;
  return {targetId:target.id,kind:target.kind,distance,direction:{x:target.point.x-mv.x,z:target.point.z-mv.z,reason:'loot-travel'},
    goal:target.point,route:target.route,prepareSlot:target.swapSlot,interact:false,reason:'loot-travel'};
}
