// V2.7.9: Recovery and respawn positioning using only public observations.
import {cameraExposure, cameraOccluded, selectCameraCover} from './camera-tactics.mjs';
import {projectedExposure} from './tactical-nav.mjs';
import {gridRoute} from './navigation-core.mjs';
const dist=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const defFinite=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.z);
function directionTo(origin,point,why,extra={}){
  return {x:point.x-origin.x,z:point.z-origin.z,reason:why,...extra};
}
// A cover objective is only useful if the FIRST steps don't cross a worse firing lane.
// Score entire routes rather than selecting the geometrically closest protected tile.
export function routeToProtectedCover(map,origin,contacts=[],{maxRadius=19,limit=9}={}){
  if(!map?.boxes||!defFinite(origin)||!contacts.length)return null;
  const ranked=[];
  // Reuse angle-aware cover generation; examine multiple candidates rather than
  // trusting its single lowest end-point-risk choice.
  const subsets=[contacts, ...contacts.slice(0,Math.min(5,contacts.length)).map(e=>[e])];
  const keys=new Set();
  for(const set of subsets){
    const entry=selectCameraCover(map,origin,set,null,{maxRadius});
    if(!entry?.point)continue;
    const key=`${entry.point.x.toFixed(2)}:${entry.point.z.toFixed(2)}`;
    if(keys.has(key))continue;keys.add(key);
    const exposure=cameraExposure(map,entry.point,contacts,Math.min(1,dist(origin,entry.point)/6));
    if(exposure.blocked<1)continue;
    ranked.push({...entry,risk:exposure.risk,blocked:exposure.blocked});
  }
  ranked.sort((a,b)=>a.risk-b.risk+(.1*(dist(origin,a.point)-dist(origin,b.point))));
  let best=null;
  for(const c of ranked.slice(0,Math.min(limit,5))){
    const route=gridRoute(map,origin,c.point,{riskWeight:1.25,threats:contacts,maxExpanded:1800});
    if(!route?.length)continue;
    let length=0,integral=0,worst=0,prev=origin;
    for(const point of route){const delta=dist(prev,point);length+=delta;
      const risk=projectedExposure(map,{...point,y:origin.y||0},contacts,[],length/5).risk;
      integral+=risk*delta;worst=Math.max(worst,risk);prev=point;
    }
    if(length>maxRadius*2.3)continue;
    const current=cameraExposure(map,origin,contacts,0).risk;
    // The destination must offer a real improvement unless we're already in cover.
    if(c.risk>Math.max(.3,current*.88) && current>.55)continue;
    const score=c.risk*6+integral*.43+length*.28+worst*.38-c.blocked*.4;
    if(!best||score<best.score)best={...c,route,score,travelExposure:integral,routeLength:length};
  }
  return best;
}
export function planProtectedRecovery(game,contacts=[],now=0,memory={},input={}){
  const local=game?.local,origin=local?.mv,ws=local?.ws;
  if(!defFinite(origin)||!ws||!game?.map?.boxes)return null;
  const plating=(ws.plateT||0)>0||!!input.plate;
  const reloading=!!ws.reloading||!!input.reload;
  if(!plating&&!reloading){memory.active=false;return null;}
  if(contacts.length){memory.lastContacts=contacts;memory.contactsAt=now;}
  else if(now-(memory.contactsAt??-Infinity)<2.5)contacts=memory.lastContacts||[];
  if(!contacts.length){
    memory.active=plating;
    // Armor cannot be cancelled for three seconds: stop routine pursuit into
    // the street when threat snapshots temporarily disappear.
    return plating?{x:0,z:0,reason:'armor-stay-concealed',crouch:true,emergency:true}:null;
  }
  const current=cameraExposure(game.map,origin,contacts,0);
  // No route search when already safely behind cover. A fresh enemy angle
  // invalidates this hold on the next tick through current camera exposure.
  if(current.blocked===contacts.length && current.risk<.35){
    memory.active=true;return {x:0,z:0,reason:'recovery-hold-hard-cover',crouch:true,emergency:true};
  }
  // Refresh cached paths as shooter angle/position changes, not just on a timer.
  const signature=contacts.slice(0,4).map(c=>`${c.id}:${Math.round(c.x/4)}:${Math.round(c.z/4)}:${Math.round((c.yaw||0)*3)}`).join('|');
  const stale=memory.signature!==signature || now-(memory.updated||0)>.8 || !memory.goal;
  if(stale){
    memory.cover=routeToProtectedCover(game.map,origin,contacts);
    memory.goal=memory.cover?.point||null;
    memory.path=memory.cover?.route?.slice()||[];
    memory.updated=now;memory.signature=signature;
  }
  if(memory.path?.length){while(memory.path.length&&dist(origin,memory.path[0])<1.15)memory.path.shift();}
  // If concealed, NEVER leave actual hard cover simply to chase another cover marker.
  if(memory.goal && dist(origin,memory.goal)<1.25){
    memory.active=true;return {x:0,z:0,reason:'recovery-cover-hold',crouch:true,emergency:true};
  }
  if(memory.path?.length){
    memory.active=true;
    return directionTo(origin,memory.path[0],'recovery-covered-route',{emergency:true,crouch:false});
  }
  // No verified hard-cover route: avoid committing to an exposed sprint across
  // the arena. The existing short-horizon evasion planner may take over.
  memory.active=false;return null;
}
const teamName=(t)=>t===0?'red':t===1?'blue':t===2?'green':t===3?'gold':null;
// Remember observed death transitions; does not read hidden respawn timers.
export function observeRespawnWindow(game,now,memory={}){
  if(game?.modeState?.type!=='tdm')return null;
  const roster=(game.remotes?.list||[]).filter(r=>r && r.team!==game.you?.tm && r.id!==game.net?.id);
  memory.deathTimes??=new Map();
  memory.wasAlive??=new Map();
  for(const r of roster){
    if(r.alive===false && memory.wasAlive.get(r.id)!==false)memory.deathTimes.set(r.id,now);
    if(r.alive===true)memory.deathTimes.delete(r.id);
    memory.wasAlive.set(r.id,!!r.alive);
  }
  const candidates=roster.filter(r=>r.alive===false && Number.isFinite(memory.deathTimes.get(r.id)) &&
    now-memory.deathTimes.get(r.id)<4.65);
  if(!candidates.length)return null;
  const live=roster.filter(r=>r.alive===true);
  // Do not sacrifice an ongoing encounter to chase the enemy spawn.
  if(live.some(r=>defFinite(r.pos) && dist(r.pos,game.local.mv)<46))return null;
  const map=game.map,spawnKey=teamName(candidates[0].team);
  const spawns=map?.spawns?.[spawnKey];
  if(!Array.isArray(spawns)||!spawns.length)return null;
  return {spawns:spawns.filter(defFinite),until:Math.max(...candidates.map(r=>memory.deathTimes.get(r.id)+4.65)),count:candidates.length};
}
export function planRespawnAdvantage(game,now,memory={},contacts=[]){
  const pos=game?.local?.mv,map=game?.map;
  if(!defFinite(pos)||!map?.boxes)return null;
  const wait=observeRespawnWindow(game,now,memory);
  if(!wait){memory.route=null;memory.target=null;return null;}
  const spawns=wait.spawns,centroid={x:spawns.reduce((a,p)=>a+p.x,0)/spawns.length,z:spawns.reduce((a,p)=>a+p.z,0)/spawns.length,y:pos.y||0};
  // Stage outside the protected spawn area, near existing hard cover. Do not
  // camp inside spawn or assume a fixed spawn location (server randomizes it).
  // Negative results are cached too: a blocked spawn lane must not rerun
  // multiple A* searches on every 60 Hz tick during the respawn window.
  if(!Number.isFinite(memory.planAt)||now-memory.planAt>1.4){
    const obstacles=(map.boxes||[]).filter(b=>b.y1>(pos.y||0)+1.2&&b.y0<(pos.y||0)+1.1);
    const choices=[];
    for(const b of obstacles){const cx=(b.x0+b.x1)/2,cz=(b.z0+b.z1)/2;
      if(Math.hypot(cx-centroid.x,cz-centroid.z)>38)continue;
      for(const p of [{x:b.x0-1.35,z:cz},{x:b.x1+1.35,z:cz},{x:cx,z:b.z0-1.35},{x:cx,z:b.z1+1.35}]){
        p.y=pos.y||0;const toward=dist(p,centroid);
        if(toward<15||toward>37||Math.abs(p.x)>map.bound-1||Math.abs(p.z)>map.bound-1)continue;
        if(obstacles.some(o=>p.x>o.x0-.8&&p.x<o.x1+.8&&p.z>o.z0-.8&&p.z<o.z1+.8))continue;
        const lines=spawns.filter(s=>!cameraOccluded(map,{...p,y:p.y+1.5},{...s,y:(s.y||0)+1.3})).length;
        if(!lines)continue;
        const exposure=projectedExposure(map,p,contacts,[],.4).risk;
        choices.push({point:p,score:Math.abs(toward-23)*.25+dist(pos,p)*.2+exposure*4-lines*.3});
      }
    }
    choices.sort((a,b)=>a.score-b.score);
    memory.target=null;memory.route=null;
    for(const c of choices.slice(0,3)){
      const route=gridRoute(map,pos,c.point,{maxExpanded:1800,riskWeight:.6,threats:contacts});
      if(route?.length){memory.target=c.point;memory.route=route;break;}
    }
    memory.planAt=now;
  }
  if(!memory.target)return null;
  while(memory.route?.length&&dist(pos,memory.route[0])<1.25)memory.route.shift();
  if(dist(pos,memory.target)<1.8)return {x:0,z:0,reason:'respawn-advantage-hold',crouch:true};
  const next=memory.route?.[0];
  return next?directionTo(pos,next,'respawn-advantage-route',{goal:memory.target}):null;
}
