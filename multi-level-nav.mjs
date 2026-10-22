// Surface-aware A* for the actual FPS Arena step/collision model.  Each
// search state is (x,z,standing height), not a flattened world cell.
// Runs only for elevated start/goal or a failed ordinary 2-D search.
const mlClamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const ML_STEP=.9, ML_R=.38, ML_HEIGHT=1.78;
// Static map geometry belongs to a single game/map.  Index it once instead of
// scanning hundreds of boxes for every stair-state expansion or LOS sample.
// Invalidate when a different box array is installed (new map / match).
const mlSpatialIndexes=new WeakMap();
const ML_BUCKET=6;
function mlSpatialIndex(map){
  const cached=mlSpatialIndexes.get(map);
  if(cached && cached.boxes===map.boxes && cached.length===map.boxes.length)return cached;
  const bins=new Map(),pad=ML_STEP+1.2;
  const cell=v=>Math.floor(v/ML_BUCKET);
  for(const b of map.boxes){
    const loX=cell(b.x0-pad),hiX=cell(b.x1+pad);
    const loZ=cell(b.z0-pad),hiZ=cell(b.z1+pad);
    for(let x=loX;x<=hiX;x++)for(let z=loZ;z<=hiZ;z++){
      const id=x+':'+z, list=bins.get(id);
      if(list)list.push(b);else bins.set(id,[b]);
    }
  }
  const result={boxes:map.boxes,length:map.boxes.length,bins};
  mlSpatialIndexes.set(map,result);
  return result;
}
function mlNearby(map,x,z){
  const idx=mlSpatialIndex(map);
  return idx.bins.get(Math.floor(x/ML_BUCKET)+':'+Math.floor(z/ML_BUCKET))||[];
}

function mlInside(x,z,b,pad=0){return x>b.x0-pad&&x<b.x1+pad&&z>b.z0-pad&&z<b.z1+pad;}
export function walkableSurface(map,x,z,y,{radius=ML_R,height=ML_HEIGHT}={},nearby=null){
  if(!map?.boxes||Math.abs(x)>=(map.bound||68)-radius||Math.abs(z)>=(map.bound||68)-radius)return false;
  if(y<-.01)return false;
  for(const b of nearby||mlNearby(map,x,z)){
    if(!mlInside(x,z,b,radius))continue;
    if(b.y0<y+height-.01 && b.y1>y+.015)return false;
  }
  if(y<.05)return true;
  return (nearby||mlNearby(map,x,z)).some(b=>mlInside(x,z,b,.03)&&Math.abs(b.y1-y)<.065);
}
function surfaceChoices(map,x,z,reference,nearby=null,maxUp=.60,maxDown=1.25){
  const choices=[];
  if(reference<=maxDown+.01)choices.push(0);
  for(const b of nearby||mlNearby(map,x,z)){
    if(!mlInside(x,z,b,.03))continue;
    const h=b.y1;
    if(h<reference-maxDown-.01||h>reference+maxUp+.01)continue;
    if(!choices.some(v=>Math.abs(v-h)<.07))choices.push(h);
  }
  return choices.filter(y=>walkableSurface(map,x,z,y,{},nearby)).sort((a,b)=>Math.abs(a-reference)-Math.abs(b-reference));
}
function mlPathClear(map,from,to,nearby=null){
  const dx=to.x-from.x,dz=to.z-from.z,d=Math.hypot(dx,dz);
  const steps=Math.max(2,Math.ceil(d/.24));
  for(let k=1;k<=steps;k++){
    const t=k/steps, x=from.x+dx*t,z=from.z+dz*t;
    // At an upward step the movement physics tests the *top of the obstacle*;
    // a low step is legal. It must not be confused with a tall enclosing wall.
    const y=from.y+(to.y-from.y)*t;
    for(const b of nearby||mlNearby(map,x,z)){
      if(!mlInside(x,z,b,ML_R))continue;
      if(b.y0<y+ML_HEIGHT-.02&&b.y1>y+.6 &&
         !(Math.abs(b.y1-to.y)<.07 && to.y>=from.y))return false;
    }
  }
  return true;
}
export function directSurfaceRoute(map,start,goal){
  if(![start?.x,start?.z,start?.y,goal?.x,goal?.z,goal?.y].every(Number.isFinite) ||
     Math.abs(start.y-goal.y)>.08)return null;
  const dist=Math.hypot(goal.x-start.x,goal.z-start.z);
  if(dist<.75 || dist>90)return null;
  const segments=Math.ceil(dist/.55);
  for(let i=1;i<=segments;i++){
    const t=i/segments,p={x:start.x+(goal.x-start.x)*t,y:start.y,z:start.z+(goal.z-start.z)*t};
    if(!walkableSurface(map,p.x,p.z,p.y))return null;
  }
  return [{x:goal.x,y:goal.y,z:goal.z}];
}
function* multiLevelRouteSteps(map,start,goal,options={}){
  if(!map?.boxes||![start?.x,start?.z,start?.y,goal?.x,goal?.z,goal?.y].every(Number.isFinite))return null;
  const direct=directSurfaceRoute(map,start,goal);if(direct)return direct;
  const bound=map.bound||68,step=ML_STEP,maxExpanded=mlClamp(options.maxExpanded||13000,200,22000);
  const padding=Math.max(22,Math.min(48,Math.abs(goal.y-start.y)*2.15+17));
  const minX=Math.max(-bound,Math.min(start.x,goal.x)-padding);
  const maxX=Math.min(bound,Math.max(start.x,goal.x)+padding);
  const minZ=Math.max(-bound,Math.min(start.z,goal.z)-padding);
  const maxZ=Math.min(bound,Math.max(start.z,goal.z)+padding);
  const nx=Math.ceil((maxX-minX)/step)+1,nz=Math.ceil((maxZ-minZ)/step)+1;
  if(nx*nz>45000)return null;
  const xAt=i=>minX+i*step,zAt=i=>minZ+i*step;
  const ix=mlClamp(Math.round((start.x-minX)/step),0,nx-1),iz=mlClamp(Math.round((start.z-minZ)/step),0,nz-1);
  const state=new Map(),heap=[];let visited=0,serial=0;
  // On broad multilevel maps the same narrow stair cells are expanded many
  // times at different heights. Cache horizontal box overlap independently
  // from elevation; the route still checks all real collision boxes nearby.
  const boxesAt=new Map(), surfaceCache=new Map();
  const nearby=(x,z)=>{
    const k=x+':'+z;if(boxesAt.has(k))return boxesAt.get(k);
    const xx=xAt(x),zz=zAt(z),pad=step+1.0;
    const boxes=mlNearby(map,xx,zz).filter(b=>b.x0<xx+pad&&b.x1>xx-pad&&b.z0<zz+pad&&b.z1>zz-pad);
    boxesAt.set(k,boxes);return boxes;
  };
  // Reuse legal standing heights: diagonal checks commonly revisit the same
  // (cell, stair-height) combinations hundreds of times within one search.
  const levels=(x,z,reference)=>{
    const k=x+':'+z+':'+Math.round(reference*20);
    if(surfaceCache.has(k))return surfaceCache.get(k);
    const result=surfaceChoices(map,xAt(x),zAt(z),reference,nearby(x,z));
    surfaceCache.set(k,result);return result;
  };
  const key=(x,z,y)=>`${x}:${z}:${Math.round(y*20)}`;
  const heuristic=n=>Math.hypot(n.x-goal.x,n.z-goal.z)+Math.abs(n.y-goal.y)*4;
  const add=(x,z,y,g,prev)=>{
    const k=key(x,z,y);if(state.has(k)&&state.get(k).g<=g)return;
    const n={x:xAt(x),z:zAt(z),y,g,prev,gridX:x,gridZ:z,closed:false,token:++serial};
    state.set(k,n);const item={node:n,token:n.token,f:g+heuristic(n)};
    let i=heap.length;heap.push(item);
    while(i>0){const p=(i-1)>>1;if(heap[p].f<=item.f)break;heap[i]=heap[p];i=p;}heap[i]=item;
  };
  const pop=()=>{
    const out=heap[0],end=heap.pop();if(heap.length){let i=0;while(true){let k=i*2+1;if(k>=heap.length)break;
      if(k+1<heap.length&&heap[k+1].f<heap[k].f)k++;
      if(end.f<=heap[k].f)break;heap[i]=heap[k];i=k;
    }heap[i]=end;}return out;
  };
  if(!walkableSurface(map,start.x,start.z,start.y))return null;
  // The first discretized cell need not lie on the same stair. Treat the
  // physical starting position as an anchor for first-step validity.
  add(ix,iz,start.y,0,null);
  const dirs=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
  let last=null;
  while(heap.length&&visited++<maxExpanded){
    // Cooperative planner can resume the same exact search on the next input
    // frame. The synchronous API consumes all slices for deterministic tests.
    if(visited>1 && visited%64===0)yield null;
    const {node:n,token}=pop();if(n.closed||n.token!==token)continue;n.closed=true;
    if(Math.hypot(n.x-goal.x,n.z-goal.z)<1.45&&Math.abs(n.y-goal.y)<.65){last=n;break;}
    for(const [dx,dz] of dirs){const X=n.gridX+dx,Z=n.gridZ+dz;
      if(X<0||Z<0||X>=nx||Z>=nz)continue;
      const xx=xAt(X),zz=zAt(Z);
      const near=nearby(X,Z),ys=levels(X,Z,n.y);
      for(const yy of ys){
        const dest={x:xx,y:yy,z:zz};
        if(Math.hypot(xx-n.x,zz-n.z)>step*1.6||!mlPathClear(map,n,dest,near))continue;
        if(dx&&dz){ // Prevent diagonals cutting through walls or stair risers.
          if(!levels(n.gridX+dx,n.gridZ,n.y).length ||
             !levels(n.gridX,n.gridZ+dz,n.y).length)continue;
        }
        const dist=step*Math.hypot(dx,dz),gain=dist+Math.abs(yy-n.y)*2.4+(yy<n.y-.62?.9:0);
        add(X,Z,yy,n.g+gain,n);
      }
    }
  }
  if(!last)return null;
  const route=[];for(let p=last;p?.prev;p=p.prev){route.push({x:p.x,y:p.y,z:p.z});if(route.length>maxExpanded)return null;}
  route.reverse();
  if(Math.hypot(last.x-goal.x,last.z-goal.z)<1.45 && Math.abs(last.y-goal.y)<.65 &&
     walkableSurface(map,goal.x,goal.z,goal.y))route.push({x:goal.x,y:goal.y,z:goal.z});
  return route;
}
export function multiLevelRoute(map,start,goal,options={}){
  const task=multiLevelRouteSteps(map,start,goal,options);
  for(let result=task.next();;result=task.next())if(result.done)return result.value;
}
// Caller owns state; no global loop/task leaks between game instances.
// Return pending rather than blocking the rendering/simulation loop for a
// full several-thousand-node search. Success uses the identical A* path.
export function multiLevelRouteProgressive(map,start,goal,state={},options={}){
  if(!map||!start||!goal)return {status:'unreachable',path:null};
  const saved=state.request;
  if(!saved||saved.map!==map ||
    Math.hypot(saved.start.x-start.x,saved.start.z-start.z)>2.25 ||
    Math.abs(saved.start.y-start.y)>.8 ||
    Math.hypot(saved.goal.x-goal.x,saved.goal.z-goal.z)>1.1 ||
    Math.abs(saved.goal.y-goal.y)>.35){
    state.request={map,start:{x:start.x,y:start.y,z:start.z},goal:{x:goal.x,y:goal.y,z:goal.z},
      task:multiLevelRouteSteps(map,start,goal,options),done:false,path:null};
  }
  const request=state.request;
  if(request.done)return {status:request.path?'ready':'unreachable',path:request.path};
  const result=request.task.next();
  if(result.done){request.done=true;request.path=result.value;
    delete request.task;
    return {status:request.path?'ready':'unreachable',path:request.path};
  }
  return {status:'pending',path:null};
}
// Keep a persistent path and look through unobstructed waypoints, but never
// erase steps needed to transition between floors.
export function followRoute3D(game,route,helpers,limit=3){
  const mv=game?.local?.mv;if(!mv||!Array.isArray(route)||!route.length)return null;
  while(route.length && Math.hypot(route[0].x-mv.x,route[0].z-mv.z)<
        (Number.isFinite(route[0].y)&&Math.abs(route[0].y-mv.y)>.22?.45:1.05) &&
        (!Number.isFinite(route[0].y)||Math.abs(route[0].y-mv.y)<.2))route.shift();
  if(!route.length)return null;
  let selected=route[0];
  for(let i=1;i<Math.min(route.length,limit+1);i++){
    const w=route[i];
    if(Number.isFinite(w.y)&&Math.abs(w.y-mv.y)>.55)break;
    const dx=w.x-mv.x,dz=w.z-mv.z,d=Math.hypot(dx,dz);
    if(d>3.7)break;
    if(helpers?.rayWorld){
      const v=[dx/d,0,dz/d];
      const a=helpers.rayWorld([mv.x,mv.y+.48,mv.z],v,game.map.boxes,d+.2);
      const b=helpers.rayWorld([mv.x,mv.y+1.2,mv.z],v,game.map.boxes,d+.2);
      if(a<d-.1||b<d-.1)break;
    }
    selected=w;
  }
  return {x:selected.x-mv.x,z:selected.z-mv.z,waypoint:selected};
}

export function routeDirectionSafe(map,start,waypoint){
  if(!map?.boxes||!start||!waypoint||!Number.isFinite(waypoint.y))return false;
  if(Math.abs((start.y||0)-waypoint.y)>.65)return false;
  if(!walkableSurface(map,waypoint.x,waypoint.z,waypoint.y))return false;
  return mlPathClear(map,start,waypoint);
}
