import {enemyCameraRisk,cameraOccluded} from './camera-tactics.mjs';
// Bounded 2-D time-aware tactical escape planner. Predicts exposure along the
// route, NOT only at the destination. Works on the locally known static map.
// It never presumes opponents have zero ammo or that a predicted shot is certain.
const tacClamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const tacNorm=(x,z)=>{const d=Math.hypot(x,z)||1;return [x/d,z/d]};
const tacFinite=Number.isFinite;
const tacDirs=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
function lineCutsBox(ax,az,bx,bz,box,pad=0){
  let enter=0,leave=1;const dx=bx-ax,dz=bz-az;
  for(const [v,d,lo,hi] of [[ax,dx,box.x0-pad,box.x1+pad],[az,dz,box.z0-pad,box.z1+pad]]){
    if(Math.abs(d)<1e-9){if(v<lo||v>hi)return false;continue;}
    let t1=(lo-v)/d,t2=(hi-v)/d;if(t1>t2)[t1,t2]=[t2,t1];
    enter=Math.max(enter,t1);leave=Math.min(leave,t2);if(enter>leave)return false;
  }
  return enter<=leave&&leave>=0&&enter<=1;
}
export function hardCoverBetween(map,a,b,y){
  return (map?.boxes||[]).some(box=>box&&box.y0<y+1.35&&box.y1>y+.95 &&
    lineCutsBox(a.x,a.z,b.x,b.z,box,.03));
}
export function projectedExposure(map,point,enemies=[],projectiles=[],arrival=.3,{zombies=[]}={}){
  const y=point.y||0;let risk=0,cover=0;
  for(const e of enemies){
    if(!tacFinite(e.x)||!tacFinite(e.z))continue;
    const t=tacClamp(arrival,0,1.1);
    const ex=e.x+tacClamp(e.vx||0,-12,12)*t*.65,ez=e.z+tacClamp(e.vz||0,-12,12)*t*.65;
    const dx=point.x-ex,dz=point.z-ez,d=Math.hypot(dx,dz);
    if(d>Math.max(70,Math.min(410,e.maxRange||70))||d<.05)continue;
    const blocking=cameraOccluded(map,{x:ex,y:(e.y||0)+1.5,z:ez},{x:point.x,y:y+1.3,z:point.z});
    if(blocking){cover++;risk+=.05*tacClamp(1-d/70,.15,1);continue;}
    // The server supplies yaw AND pitch. Look-direction uncertainty and
    // snapshot latency are represented by non-zero exposure behind the player.
    risk+=enemyCameraRisk({...e,x:ex,z:ez,vx:0,vz:0},
      {x:point.x,y:y+1.3,z:point.z},0);
  }
  for(const p of projectiles){
    if(!tacFinite(p.x)||!tacFinite(p.z)||p.fuse<0||p.fuse>2.2)continue;
    const t=tacClamp(Math.min(arrival,p.fuse),0,1.4);
    const px=p.x+(p.stuck?0:(p.vx||0)*t),pz=p.z+(p.stuck?0:(p.vz||0)*t);
    const d=Math.hypot(point.x-px,point.z-pz);
    const radius=p.kind==='frag'?9.5:p.kind==='impact'?6.2:5;
    if(d<radius+3)risk+=(p.fuse<1.25?9:3)*tacClamp((radius+3-d)/radius,0,1);
  }
  for(const z of zombies){const d=Math.hypot(point.x-z.x,point.z-z.z);
    if(d<17)risk+=Math.pow((17-d)/8,2)*1.5;
  }
  return {risk,cover};
}
// Goal planning is intentionally bounded; long distance and multi-floor
// destinations should continue using the existing ring/loot route planners.
export function planTacticalEscapeRoute(map,start,enemies=[],projectiles=[],options={}){
  if(!map?.boxes||![start?.x,start?.z,start?.y].every(tacFinite))return null;
  const speed=tacClamp(options.speed||6,2.5,9),step=2,radius=14,R=Math.round(radius/step),N=2*R+1,total=N*N;
  const center=R, id=(x,z)=>z*N+x, coord=(x,z)=>({x:start.x+(x-R)*step,z:start.z+(z-R)*step,y:start.y}),
    xy=(i)=>[i%N,Math.floor(i/N)], bound=map.bound||68;
  const relevant=map.boxes.filter(b=>b&&b.y0<start.y+1.25&&b.y1>start.y+.2 &&
    b.x0<start.x+radius+1 && b.x1>start.x-radius-1 &&
    b.z0<start.z+radius+1 && b.z1>start.z-radius-1);
  const blocked=new Uint8Array(total),cellRisk=new Float64Array(total),covers=new Uint8Array(total);
  // A scoped 250 m contact outranks a distracted 12 m passer-by. Limit
  // per-search candidates to preserve the v2.8.1 frame-time budget.
  const maximumThreats=[...enemies].filter(e=>Math.hypot(e.x-start.x,e.z-start.z)<Math.max(70,e.maxRange||0))
    .sort((a,b)=>{
      const risk=e=>enemyCameraRisk(e,{x:start.x,y:start.y+1.3,z:start.z},0);
      return risk(b)-risk(a);
    }).slice(0,6);
  const maximumProjectiles=[...projectiles].filter(p=>p&&p.fuse>=0).slice(0,12);
  for(let z=0;z<N;z++)for(let x=0;x<N;x++){
    const i=id(x,z),p=coord(x,z);
    blocked[i]=(Math.abs(p.x)>bound-.9||Math.abs(p.z)>bound-.9||
      relevant.some(b=>p.x>b.x0-.68&&p.x<b.x1+.68&&p.z>b.z0-.68&&p.z<b.z1+.68))?1:0;
    // Arrival time approximated from the direct distance (actual path arrival
    // is re-evaluated by replanning, not believed as an exact estimate).
    const e=projectedExposure({boxes:relevant},p,maximumThreats,maximumProjectiles,
      Math.hypot(p.x-start.x,p.z-start.z)/speed,{zombies:options.zombies||[]});
    cellRisk[i]=e.risk;covers[i]=Math.min(255,e.cover);
  }
  const source=id(R,R);blocked[source]=0;
  const dist=new Float64Array(total);dist.fill(Infinity);dist[source]=0;
  const parent=new Int32Array(total);parent.fill(-1);
  const closed=new Uint8Array(total),queue=[{id:source,score:0}];
  let explored=0;
  while(queue.length&&explored++<total){
    // 225 nodes maximum, simple bounded priority queue avoids heap complexity.
    let best=0;for(let k=1;k<queue.length;k++)if(queue[k].score<queue[best].score)best=k;
    const cur=queue.splice(best,1)[0];if(closed[cur.id])continue;closed[cur.id]=1;
    const [x,z]=xy(cur.id);
    for(const [dx,dz] of tacDirs){const nx=x+dx,nz=z+dz;
      if(nx<0||nz<0||nx>=N||nz>=N)continue;
      const j=id(nx,nz);if(blocked[j]||closed[j])continue;
      if(dx&&dz&&(blocked[id(nx,z)]||blocked[id(x,nz)]))continue;
      const gain=Math.hypot(dx,dz)*step;
      const c=dist[cur.id]+gain*(1+tacClamp((cellRisk[cur.id]+cellRisk[j])*.5,0,16)*.38);
      if(c+1e-9<dist[j]){dist[j]=c;parent[j]=cur.id;queue.push({id:j,score:c});}
    }
  }
  const initial=cellRisk[source], urgent=options.urgent===true;
  if(!urgent && initial<.65)return null;
  let best=-1,bestScore=Infinity;
  for(let i=0;i<total;i++){
    if(!tacFinite(dist[i])||blocked[i]||i===source)continue;
    const [x,z]=xy(i),dd=Math.hypot(x-R,z-R)*step;
    if(dd<3||dd>13.5)continue;
    const relative=Math.max(-2,initial-cellRisk[i]);
    // Risk, path exposure, travel time, and distance to nearest open ground.
    const score=cellRisk[i]*3.8+dist[i]*.42-dd*.04-covers[i]*.08;
    if(relative < -.6 && !urgent)continue;
    if(score<bestScore){bestScore=score;best=i;}
  }
  if(best<0||(!urgent && cellRisk[best]>=initial*.91 && initial<2))return null;
  const route=[];let at=best;
  for(let n=0;n<total&&at!==source;n++){if(at<0)return null;const [x,z]=xy(at);route.push(coord(x,z));at=parent[at];}
  if(at!==source)return null;route.reverse();
  return {path:route,goal:route.at(-1),riskStart:initial,riskEnd:cellRisk[best],score:bestScore,expanded:explored};
}
export function planTacticalEscape(game,helpers,contacts,projectiles,now=0,memory={},options={}){
  const mv=game?.local?.mv;if(!mv||!game?.map)return null;
  if(memory.path?.length)while(memory.path.length&&Math.hypot(memory.path[0].x-mv.x,memory.path[0].z-mv.z)<1.2)memory.path.shift();
  const expired=now-(memory.time??-Infinity)>.42;
  const stuck=memory.path?.length&&now-(memory.progressTime||now)>1.05;
  if(Math.hypot(mv.x-(memory.progressX??mv.x),mv.z-(memory.progressZ??mv.z))>.6){
    memory.progressX=mv.x;memory.progressZ=mv.z;memory.progressTime=now;
  }
  if(expired||stuck||(!memory.path?.length && !memory.noRoute)){
    const result=planTacticalEscapeRoute(game.map,mv,contacts,projectiles,options);
    memory.path=result?.path||[];memory.noRoute=!result;memory.time=now;memory.goal=result?.goal||null;
    memory.lastRisk=result?.riskStart??0;memory.progressTime=now;memory.progressX=mv.x;memory.progressZ=mv.z;
  }
  const waypoint=memory.path?.[0];if(!waypoint)return null;
  const dx=waypoint.x-mv.x,dz=waypoint.z-mv.z;
  if(helpers?.rayWorld && !options.skipValidation){
    const len=Math.hypot(dx,dz);if(len>.05){
      const ux=dx/len,uz=dz/len;
      for(const h of [.6,1.2]){
        const d=helpers.rayWorld([mv.x,mv.y+h,mv.z],[ux,0,uz],game.map.boxes,Math.min(1.1,len)+.15);
        if(d<Math.min(1.1,len)+.02){memory.path=[];return null;}
      }
    }
  }
  return {x:dx,z:dz,reason:'threat-aware-route',sprint:options.urgent===true,routeGoal:memory.goal};
}

// Fight-or-escape arbitration. Only skips routine evasive pathing when there is
// an actionable shot, healthy reserves, and no close/multi-angle attacker.
// Explosives and emergency ring routing are handled above this predicate.
export function shouldContestSightline(game,target,contacts=[],memory={},now=0){
  const local=game?.local,ws=local?.ws;
  if(!local?.alive||!target?.visible||!target?.hitboxVisible||!ws)return false;
  const gun=ws.guns?.[ws.slot];
  if(!gun||gun.mag<=0||ws.reloading||ws.switchT>0||ws.plateT>0)return false;
  if((local.hp??0)<66||(local.armor??0)<24)return false;
  if(Number.isFinite(memory.lastDamage)&&now-memory.lastDamage<1.1)return false;
  const mv=local.mv;if(!mv)return false;
  let close=0;
  for(const c of contacts){
    if(!Number.isFinite(c?.x)||!Number.isFinite(c?.z))continue;
    const dist=Math.hypot(c.x-mv.x,c.z-mv.z);
    if(dist<13)return false;
    if(dist<32 && c.aim)close++;
    if(close>1)return false;
  }
  return true;
}

// Follow an occluded pursuit waypoint only if it is not an exposed push.
// A single visible frame or a recently damaged player retains defensive cover.
export function shouldFollowOccludedRoute(game,target,direction,contacts=[],memory={},now=0){
  if(!target || target.visible || !direction || !['pathfinding','precision-find-sightline','engagement-sightline'].includes(direction.reason))return false;
  const local=game?.local,mv=local?.mv;
  if(!mv||!game?.map?.boxes||local.hp<76||local.armor<22)return false;
  if(!Number.isFinite(memory.lastDamage)||now-memory.lastDamage<2)return false;
  if(!Array.isArray(contacts))return false;
  const norm=Math.hypot(direction.x,direction.z);
  if(norm<.2)return false;
  const projected={x:mv.x+direction.x/norm*2.7,z:mv.z+direction.z/norm*2.7,y:mv.y};
  if(contacts.some(c=>Math.hypot(c.x-mv.x,c.z-mv.z)<24 ||
      (c.aim && Math.hypot(c.x-mv.x,c.z-mv.z)<68)))return false;
  const riskNow=projectedExposure(game.map,mv,contacts,[],0).risk;
  const riskNext=projectedExposure(game.map,projected,contacts,[],.4).risk;
  return riskNext<2.0 && riskNext <= Math.max(.65,riskNow*1.08+.12);
}

// Prefer a legal, covered lateral step when two otherwise-equivalent combat
// strafes are possible. Never override committed objectives or emergency runs.
export function exposureAwareStrafe(game,target,direction,contacts=[],now=0,memory={},canStep=null){
  if(!target?.visible||!direction||!['pro-combat-strafe','pro-angle-clear','pro-reverse-strafe'].includes(direction.reason))return direction;
  const mv=game?.local?.mv,map=game?.map;if(!mv||!map?.boxes?.length||!contacts.length)return direction;
  // Only alter routine strafing against an observably aimed close gun.
  // Otherwise we disrupt productive baseline movement without a safety gain.
  if(!contacts.some(c=>c.aim===true && Math.hypot(c.x-mv.x,c.z-mv.z)<60))return direction;
  const length=Math.hypot(direction.x,direction.z);if(length<.25)return direction;
  const a={x:direction.x/length,z:direction.z/length};
  const b={x:-a.x,z:-a.z};
  const reachable=typeof canStep==='function'?canStep(b.x,b.z,1.65):true;
  if(!reachable)return direction;
  const to=(v)=>({x:mv.x+v.x*3.3,z:mv.z+v.z*3.3,y:mv.y});
  const risk=(v)=>projectedExposure(map,to(v),contacts,[],.52).risk;
  const current=risk(a),alt=risk(b);
  // Meaningful improvement only: avoid oscillation when two lanes are similar.
  if(alt+.4>=current*.82||alt>=2.2)return direction;
  if(memory.lastFlipAt!=null && now-memory.lastFlipAt<1.2)return direction;
  memory.lastFlipAt=now;
  return {x:-direction.x,z:-direction.z,reason:'exposure-aware-strafe'};
}
