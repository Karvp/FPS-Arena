// Reachability-first Zombies escape planner. A single bounded Dijkstra search
// scores *reachable* open ground instead of blindly running away from the nearest
// zombie (which leads straight into corners and dead ends).
// Ground-level 2D only; unlike a navmesh, it does not assert vertical links.
import {zombieKite} from './loot-core.mjs';
import {safeDirection} from './combat-core.mjs';
const EPS=1e-9;
const hypot=Math.hypot;
const finite=(n)=>Number.isFinite(n);
function zombiesOf(game){return (game?.zremotes?.list||[]).filter(z=>z?.alive && z.pos && finite(z.pos.x) && finite(z.pos.z)).map(z=>z.pos);}
export function planZombieEscape(game,helpers,options={},now=0,memory={}) {
  const mv=game?.local?.mv, map=game?.map;
  if(game?.modeState?.type!=='zm'||!mv||!map?.boxes || ![mv.x,mv.y,mv.z].every(finite))return null;
  const zombies=zombiesOf(game);if(!zombies.length)return null;
  const nearest=Math.min(...zombies.map(z=>hypot(z.x-mv.x,z.z-mv.z)));
  const spacing=Math.max(12,Math.min(34,options.zombieSpacing??22));
  if(nearest>=spacing+(game.local.ws?.reloading?10:5))return null;
  // Persistent progress watchdog: if inputs were moving but actual player did not,
  // invalidate the cached route instead of indefinitely pushing against a wall.
  if(!finite(memory.progressAt)){memory.progressAt=now;memory.progressX=mv.x;memory.progressZ=mv.z;}
  if(hypot(mv.x-memory.progressX,mv.z-memory.progressZ)>.65){
    memory.progressAt=now;memory.progressX=mv.x;memory.progressZ=mv.z;
  }
  const stuck=now-memory.progressAt>.55 && memory.path?.length;
  const closestChanged=finite(memory.lastNearest) && Math.abs(memory.lastNearest-nearest)>5;
  const desiredGoal=options.escapeGoal;
  const goalChanged=desiredGoal && (!memory.lastEscapeGoal ||
    hypot(desiredGoal.x-memory.lastEscapeGoal.x,desiredGoal.z-memory.lastEscapeGoal.z)>4);
  if(memory.path){while(memory.path.length && hypot(memory.path[0].x-mv.x,memory.path[0].z-mv.z)<1.05)memory.path.shift();}
  // Cache a failed search for half a second. Without this, a completely
  // enclosed spawn would rerun the whole search at every 60Hz input tick.
  const expired=now-(memory.time??-Infinity)>(nearest<7?.35:.85);
  let replan=expired || closestChanged || goalChanged || !!stuck || !finite(memory.time);
  if(!replan && memory.path?.length && !safeDirection(game,memory.path[0].x-mv.x,
      memory.path[0].z-mv.z,helpers,Math.min(1.1,hypot(memory.path[0].x-mv.x,memory.path[0].z-mv.z))))replan=true;
  if(replan){
    const route=findZombieEscapeRoute(map,mv,zombies,{avoid:memory.stuckDirection && stuck?memory.stuckDirection:null,
      goal:desiredGoal});
    memory.lastEscapeGoal=desiredGoal?{x:desiredGoal.x,z:desiredGoal.z}:null;
    memory.path=route?.path||[];
    memory.goal=route?.goal||null;
    memory.time=now;memory.lastNearest=nearest;
    if(stuck){memory.progressAt=now;memory.progressX=mv.x;memory.progressZ=mv.z;}
  }
  if(memory.path?.length){
    const wp=memory.path[0],dx=wp.x-mv.x,dz=wp.z-mv.z;
    if(safeDirection(game,dx,dz,helpers,Math.min(1.05,hypot(dx,dz)))){
      memory.stuckDirection={x:dx,z:dz};
      return {x:dx,z:dz,reason:'zombie-kite',sprint:true,slide:false,routeGoal:memory.goal};
    }
  }
  // For maps with an inaccessible level / no suitable 2D route, retain the
  // original local avoider rather than walking toward an invalid waypoint.
  return zombieKite(game,helpers,options,now);
}

// Exposed separately for deterministic geometric tests. Search uses a local
// ~78m square and at most 2900 cells; no server state and no random choices.
export function findZombieEscapeRoute(map,start,zombies,options={}){
  if(!map?.boxes||!start||!zombies?.length)return null;
  const step=1.5,R=25,N=R*2+1,total=N*N,center=R,
    bound=finite(map.bound)?map.bound:68, margin=.9;
  const id=(x,z)=>z*N+x,ix=i=>i%N,iz=i=>Math.floor(i/N),
    wx=x=>start.x+(x-center)*step,wz=z=>start.z+(z-center)*step;
  const relevant=map.boxes.filter(b=>b && b.y1>start.y+.16 && b.y0<start.y+1.32 &&
    b.x0<start.x+R*step+1 && b.x1>start.x-R*step-1 &&
    b.z0<start.z+R*step+1 && b.z1>start.z-R*step-1);
  const blocked=new Uint8Array(total), clearance=.72;
  for(let z=0;z<N;z++)for(let x=0;x<N;x++){
    const X=wx(x),Z=wz(z),i=id(x,z);
    if(Math.abs(X)>bound-margin || Math.abs(Z)>bound-margin ||
      relevant.some(b=>X>b.x0-clearance && X<b.x1+clearance && Z>b.z0-clearance && Z<b.z1+clearance))blocked[i]=1;
  }
  // Start may be close to a wall (cell inflated due to collision radius).
  // Never start on a different side of a wall just because it is nearby.
  const source=id(center,center);
  if(blocked[source])blocked[source]=0;
  const dist=new Float64Array(total);dist.fill(Infinity);
  const parents=new Int32Array(total);parents.fill(-1);
  const closed=new Uint8Array(total),heap=[];
  const push=(i,c)=>{const n={i,c};let k=heap.length;heap.push(n);while(k){const p=(k-1)>>1;if(heap[p].c<=c)break;heap[k]=heap[p];k=p;}heap[k]=n;};
  const pop=()=>{const first=heap[0],last=heap.pop();if(heap.length){let k=0;while(k*2+1<heap.length){let ch=k*2+1;if(ch+1<heap.length&&heap[ch+1].c<heap[ch].c)ch++;if(heap[ch].c>=last.c)break;heap[k]=heap[ch];k=ch;}heap[k]=last;}return first;};
  const neighbors=(x,z)=>{let open=0;for(const [dx,dz] of [[0,1],[0,-1],[1,0],[-1,0]]){
    const a=x+dx,b=z+dz;if(a>=0&&b>=0&&a<N&&b<N&&!blocked[id(a,b)])open++;
  }return open;};
  const danger=(x,z)=>{
    const X=wx(x),Z=wz(z);let nearest=Infinity,crowding=0;
    for(const p of zombies){const d=hypot(X-p.x,Z-p.z);nearest=Math.min(nearest,d);
      if(d<16)crowding+=Math.pow((16-d)/16,2);
    }return {nearest,crowding};
  };
  // Precompute danger and openness once per replanning pass. Zombie waves can
  // contain dozens of actors; doing all-pairs distance work per Dijkstra edge
  // would otherwise cause visible frame spikes.
  const dangerCache=Array.from({length:total},(_,i)=>danger(ix(i),iz(i)));
  const degreeCache=Uint8Array.from({length:total},(_,i)=>neighbors(ix(i),iz(i)));
  const startRisk=dangerCache[source].nearest;
  dist[source]=0;push(source,0);
  let best=-1,bestScore=-Infinity,expanded=0;
  const escapeBias=options.avoid;
  const escapeGoal=options.goal;
  const goalDistance=escapeGoal?hypot(start.x-escapeGoal.x,start.z-escapeGoal.z):0;
  while(heap.length && expanded<2600){
    const {i,c}=pop();if(closed[i]||c>dist[i]+EPS)continue;closed[i]=1;expanded++;
    const x=ix(i),z=iz(i),open=degreeCache[i],risk=dangerCache[i],fromStart=hypot(x-center,z-center)*step;
    if(fromStart>5 && risk.nearest>3.3 && open>=2){
      // Prefer free, reachable SPACE over a locally optimal but enclosed corner.
      // Penalize deep zombie crowds, long/unsafe routes and low-degree dead ends.
      const open2=neighbors(Math.max(1,Math.min(N-2,x+2)),z)+neighbors(x,Math.max(1,Math.min(N-2,z+2)));
      const escapeGain=Math.min(40,risk.nearest)-Math.min(40,startRisk);
      const towardLoot=escapeGoal ? Math.max(-15,Math.min(15,
        goalDistance-hypot(wx(x)-escapeGoal.x,wz(z)-escapeGoal.z))) : 0;
      const score=escapeGain*2.5 + Math.min(risk.nearest,38)*.65 +
        open*2.1 +open2*.45 -risk.crowding*15 -dist[i]*.43 + towardLoot*.48;
      if(score>bestScore){best=i;bestScore=score;}
    }
    if(fromStart>39)continue;
    for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++){
      if(!dx&&!dz)continue;const nx=x+dx,nz=z+dz;
      if(nx<0||nz<0||nx>=N||nz>=N)continue;
      const j=id(nx,nz);if(closed[j]||blocked[j])continue;
      if(dx&&dz&&(blocked[id(nx,z)]||blocked[id(x,nz)]))continue;
      const risk2=dangerCache[j],degree=degreeCache[j];
      let dangerCost=risk2.nearest<4?14:(risk2.nearest<9?(9-risk2.nearest)*.85:0);
      dangerCost+=risk2.crowding*1.5;
      const awayPenalty=escapeBias && fromStart<5 &&
        dx*escapeBias.x+dz*escapeBias.z>0 ? 4:0;
      const cost=dist[i]+(dx&&dz?Math.SQRT2:1)*(1+dangerCost+Math.max(0,3-degree)*.7)+awayPenalty;
      if(cost<dist[j]){dist[j]=cost;parents[j]=i;push(j,cost);}
    }
  }
  if(best===-1)return null;
  const trace=[];let walk=best;
  while(walk!==source&&walk>=0&&trace.length<total){trace.push({x:wx(ix(walk)),z:wz(iz(walk))});walk=parents[walk];}
  if(walk!==source)return null;trace.reverse();
  // Do not abruptly steer at sub-meter nodes; preserve full path at 1.5m
  // resolution to guarantee every diagonal avoids obstacle corners.
  return {path:trace,goal:trace.at(-1),expanded,score:bestScore};
}
