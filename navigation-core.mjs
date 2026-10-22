import {multiLevelRoute,multiLevelRouteProgressive,walkableSurface} from './multi-level-nav.mjs';
import {projectedExposure} from './tactical-nav.mjs';
// Build bounded velocity observations from the same two interpolation snapshots
// the game receives for each zombie.  Do not assume a remote's `speed` alone
// is a reliable direction vector (it is animation-dependent).
export function zombieMotionContacts(remotes=[]) {
  const result=[];
  for(const z of remotes){
    if(!z?.alive || !z.pos || !Number.isFinite(z.pos.x) || !Number.isFinite(z.pos.z))continue;
    let vx=Number.isFinite(z.vx)?z.vx:0,vz=Number.isFinite(z.vz)?z.vz:0;
    const buf=z.buf;
    if(Array.isArray(buf) && buf.length>1){
      const a=buf.at(-1),b=buf.at(-2),dt=a?.t-b?.t;
      if(dt>.02 && dt<1.5){vx=(a.x-b.x)/dt;vz=(a.z-b.z)/dt;}
    }
    const v=Math.hypot(vx,vz);
    if(v>7.25){vx*=7.25/v;vz*=7.25/v;}
    result.push({x:z.pos.x,z:z.pos.z,vx,vz});
  }
  return result;
}
// Estimated contact risk at a future route waypoint. Distance uncertainty
// grows with arrival time, so moving zombies cannot be treated as exact dots.
export function zombieInterceptRisk(point,contacts=[],arrival=0){
  let total=0;
  const t=Math.min(3,Math.max(0,arrival));
  for(const z of contacts){
    const now=Math.hypot(point.x-z.x,point.z-z.z);
    const future=Math.hypot(point.x-z.x-(z.vx||0)*t,point.z-z.z-(z.vz||0)*t);
    const dist=Math.min(future,now+.65*t),uncertainty=Math.min(2,0.55*t);
    if(dist<16+uncertainty){
      const d=Math.max(0,dist-uncertainty);
      total+=d<3 ? 22+(3-d)*9 : d<8 ? 4+(8-d)*2.3 : Math.max(0,(16-d)*.28);
    }
  }
  return total;
}
// Convert a navigation destination's sight/loot position to the standing
// surface underneath it when it is a *verified* hitbox-height observation.
// A verified elevated platform is never flattened to sea/ground level.
export function standingRouteLevel(map,point){
  if(!map?.boxes || !Number.isFinite(point?.x) || !Number.isFinite(point?.z))return null;
  const y=Number.isFinite(point.y)?point.y:0;
  if(walkableSurface(map,point.x,point.z,y))return y;
  // Ground-level aiming and loot positions have y≈1-2 even if feet are at 0.
  if(y>=0 && y<=2.25 && walkableSurface(map,point.x,point.z,0))return 0;
  if(y<.65)return null;
  // A tall, stacked map may have an aim point at y=9.5 on an 8m deck.
  // Check only locally overlapping boxes, not all map geometry globally.
  let best=null,bestDelta=Infinity;
  for(const box of map.boxes){
    if(point.x<box.x0-.04||point.x>box.x1+.04||point.z<box.z0-.04||point.z>box.z1+.04)continue;
    const delta=y-box.y1;
    if(delta>=.75 && delta<=2.2 && Math.abs(delta-1.4)<bestDelta &&
       walkableSurface(map,point.x,point.z,box.y1)){
       best=box.y1;bestDelta=Math.abs(delta-1.4);
    }
  }
  return best;
}
// Explicitly annotated combat aim point: choose a support surface near
// headHeight (rather than treating the 1.15m-tall top of cover as a deck).
export function standingRouteAimLevel(map,point){
 if(!point || !Number.isFinite(point.y))return standingRouteLevel(map,point);
 const footGuess=point.y-1.45;
 if(Math.abs(footGuess)<.8 && walkableSurface(map,point.x,point.z,0))return 0;
 let best=null,score=Infinity;
 for(const b of map.boxes||[]){
   if(point.x<b.x0-.05||point.x>b.x1+.05||point.z<b.z0-.05||point.z>b.z1+.05)continue;
   const delta=Math.abs(b.y1-footGuess);
   if(delta<.78 && delta<score && walkableSurface(map,point.x,point.z,b.y1)){
     best=b.y1;score=delta;
   }
 }
 return best??standingRouteLevel(map,point);
}
// Bounded ground-level 2D A* for tactical waypoint planning around static map boxes.
// The world has multi-level platforms: route validity is checked locally at every step,
// and multi-floor navigation is intentionally not inferred by a 2D grid.
export function gridRoute(map, start, goal, options={}) {
  if(!map?.boxes || !start || !goal || ![start.x,start.z,goal.x,goal.z].every(Number.isFinite))return null;
  if ((Number.isFinite(start.y) && start.y>.7) || (Number.isFinite(goal.y) && goal.y>.7)) {
    return multiLevelRoute(map,{...start,y:start.y||0},{...goal,y:goal.y||0},options);
  }
  const bound=Math.min(250,Math.max(10,map.bound || 68)), size=2;
  const n=Math.ceil(2*bound/size), total=n*n;
  if(total>80000 || total<1)return null;
  const idx=(x,z)=>z*n+x, xy=i=>[i%n,Math.floor(i/n)];
  const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
  const cell=(p)=>[clamp(Math.floor((p.x+bound)/size),0,n-1),clamp(Math.floor((p.z+bound)/size),0,n-1)];
  const blocked=new Uint8Array(total), level=Number.isFinite(start.y)?start.y:0, radius=.44;
  for(const b of map.boxes){
    if (!b || b.y0>level+.95 || b.y1<level+1.15 || b.y1-b.y0<.65)continue;
    const loX=clamp(Math.ceil((b.x0-radius+bound)/size-.5),0,n-1), hiX=clamp(Math.floor((b.x1+radius+bound)/size-.5),0,n-1);
    const loZ=clamp(Math.ceil((b.z0-radius+bound)/size-.5),0,n-1), hiZ=clamp(Math.floor((b.z1+radius+bound)/size-.5),0,n-1);
    for(let z=loZ;z<=hiZ;z++)for(let x=loX;x<=hiX;x++)blocked[idx(x,z)]=1;
  }
  const nearestFree=(point)=>{
    const [x,z]=cell(point);
    if(!blocked[idx(x,z)])return idx(x,z);
    for(let r=1;r<=3;r++){
      let best=null,score=Infinity;
      for(let zz=Math.max(0,z-r);zz<=Math.min(n-1,z+r);zz++)for(let xx=Math.max(0,x-r);xx<=Math.min(n-1,x+r);xx++){
        if(blocked[idx(xx,zz)])continue;
        const distance=(xx-x)*(xx-x)+(zz-z)*(zz-z);
        if(distance<score){best=idx(xx,zz);score=distance;}
      }
      if(best!==null)return best;
    }
    return null;
  };
  const source=nearestFree(start),destination=nearestFree(goal);
  if(source===null||destination===null)return null;
  // Memoized per-cell dynamic exposure. Optional: omitted for normal A* and
  // urgent gas escape, where minimizing arrival time outranks shootout risks.
  const riskWeight=Math.max(0,Math.min(2,Number(options.riskWeight)||0));
  const dynamicWeight=Math.max(0,Math.min(2,Number(options.zombieRiskWeight)||0));
  const dynamicContacts=dynamicWeight?(options.zombieContacts||[]):[];
  const riskCache=(riskWeight||dynamicWeight)?new Float32Array(total).fill(-1):null;
  const riskAt=(i)=>{
    if(!riskCache)return 0;
    if(riskCache[i]>=0)return riskCache[i];
    const [x,z]=xy(i),point={x:-bound+(x+.5)*size,y:level,z:-bound+(z+.5)*size};
    const sec=Math.hypot(point.x-start.x,point.z-start.z)/Math.max(3,options.speed||6);
    const combatRisk=riskWeight ? projectedExposure(map,point,options.threats||[],options.projectiles||[],sec,
      {zombies:options.zombies||[]}).risk*riskWeight : 0;
    const intercept=dynamicWeight ? zombieInterceptRisk(point,dynamicContacts,sec)*dynamicWeight : 0;
    return riskCache[i]=combatRisk+intercept;
  };
  const costs=new Float64Array(total);costs.fill(Infinity);
  const parents=new Int32Array(total);parents.fill(-1);
  const closed=new Uint8Array(total), heap=[];
  const heuristic=(i)=>{const [x,z]=xy(i),[gx,gz]=xy(destination);return Math.hypot(x-gx,z-gz);};
  const push=(id,score)=>{
    const node={id,score};let i=heap.length;heap.push(node);
    while(i>0){const p=(i-1)>>1;if(heap[p].score<=score)break;heap[i]=heap[p];i=p;}heap[i]=node;
  };
  const pop=()=>{
    const first=heap[0],last=heap.pop();
    if(heap.length){let i=0;while(true){let c=i*2+1;if(c>=heap.length)break;
      if(c+1<heap.length&&heap[c+1].score<heap[c].score)c++;
      if(heap[c].score>=last.score)break;heap[i]=heap[c];i=c;
    }heap[i]=last;}return first;
  };
  costs[source]=0;push(source,heuristic(source));
  let explored=0,found=false;
  while(heap.length && explored++<(options.maxExpanded || 3600)){
    const cur=pop(),id=cur.id;
    if(closed[id])continue;
    if(id===destination){found=true;break;}
    closed[id]=1;
    const [x,z]=xy(id);
    for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++){
      if(!dx&&!dz)continue;
      const X=x+dx,Z=z+dz;
      if(X<0||Z<0||X>=n||Z>=n)continue;
      const v=idx(X,Z);
      if(blocked[v]||closed[v])continue;
      if(dx&&dz &&(blocked[idx(x+dx,z)]||blocked[idx(x,z+dz)]))continue;
      const travel=(dx&&dz?Math.SQRT2:1);
      const newCost=costs[id]+travel*(1+(riskAt(v)+riskAt(id))*.5);
      if(newCost<costs[v]){costs[v]=newCost;parents[v]=id;push(v,newCost+heuristic(v));}
    }
  }
  if(!found)return null;
  const ids=[];let walk=destination;
  while(walk>=0 && ids.length<=total){ids.push(walk);if(walk===source)break;walk=parents[walk];}
  if(ids.at(-1)!==source)return null;
  ids.reverse();
  const route=[];
  for(let j=0;j<ids.length;j++){
    const [cx,cz]=xy(ids[j]);
    if(j===0)continue;
    route.push({x:-bound+(cx+.5)*size,z:-bound+(cz+.5)*size});
  }
  return route.length?route:[{x:goal.x,z:goal.z}];
}

// Cooperative path requests for the live 60 Hz agent: the costly elevation
// search is resumable while ordinary 2D requests retain their fast behavior.
export function gridRouteCooperative(map,start,goal,state={},options={}){
  if(!map?.boxes||!start||!goal)return {status:'unreachable',path:null};
  if((Number.isFinite(start.y)&&start.y>.7)||(Number.isFinite(goal.y)&&goal.y>.7))
    return multiLevelRouteProgressive(map,{...start,y:start.y||0},
      {...goal,y:goal.y||0},state,options);
  return {status:'ready',path:gridRoute(map,start,goal,options)};
}

// Path arc-length progress, not raw displacement. Motion back and forth in a
// narrow corridor cannot refresh the navigation stall timer indefinitely.
export function pathRemainingDistance(position,path){
 if(!position||!Array.isArray(path)||!path.length)return Infinity;
 let out=0,last=position;
 for(const next of path){
   if(![next.x,next.z,last.x,last.z].every(Number.isFinite))return Infinity;
   const rise=Number.isFinite(next.y)&&Number.isFinite(last.y)?next.y-last.y:0;
   out+=Math.hypot(next.x-last.x,next.z-last.z,rise);last=next;
 }
 return out;
}
