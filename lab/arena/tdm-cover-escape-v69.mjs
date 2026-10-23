/** V69: Public-state cover-seeking escape, separate immutable research actor.
 * Frozen V67 navigation and V68 exposure detector remain untouched.
 * No privileged server state in decisions; only client map, remote snapshots,
 * own HP, own movement command. WASD-only, bounded duration and stalled escape.
 */
import {V67AcquisitionTrial} from './tdm-public-acquisition-v67.mjs';
import {publicExposureV68} from './tdm-exposure-guard-v68.mjs';
import {publicHostilesC35K} from './public-target-los-c35k.mjs';
import {movementUnitC35T} from './target-relative-motion-c35t.mjs';
import {rayWorld} from './source-main/shared/geometry.js';

export const V69_ARMS=Object.freeze(['keep','route','cover-escape','cover-support']);
export const V69_SCHEMA='fpsarena-v69-public-active-cover-egress-v1';
const MOVE=Object.freeze(['forward','backward','left','right']);
const VECTORS=[{forward:true},{forward:true,right:true},{right:true},
 {backward:true,right:true},{backward:true},{backward:true,left:true},
 {left:true},{forward:true,left:true}];
const finite=Number.isFinite;
const boxFields=['x0','x1','y0','y1','z0','z1'];
const validBoxes=boxes=>Array.isArray(boxes)&&boxes.length<=2200&&
 boxes.every(b=>boxFields.every(k=>finite(b?.[k]))&&b.x0<=b.x1&&b.y0<=b.y1&&b.z0<=b.z1);
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const inside=(p,b,r=.75)=>p.x+r>b.x0&&p.x-r<b.x1&&p.z+r>b.z0&&p.z-r<b.z1&&
 p.y+1.7>b.y0&&p.y+.15<b.y1;
function clear(p,boxes,bound,r=.82){
 return [p?.x,p?.y,p?.z,bound].every(finite)&&
  Math.abs(p.x)<bound-r-1.2&&Math.abs(p.z)<bound-r-1.2&&
  !boxes.some(b=>inside(p,b,r));
}
function sweep(p,q,boxes,bound){
 for(let i=1;i<=9;i++){
  const t=i/9;
  if(!clear({x:p.x+(q.x-p.x)*t,y:p.y,z:p.z+(q.z-p.z)*t},boxes,bound))
   return false;
 }
 return true;
}
function visible(from,to,boxes){
 const d=[to.x-from.x,to.y-from.y,to.z-from.z],length=Math.hypot(...d);
 if(!(length>.12))return false;
 return rayWorld([from.x,from.y,from.z],d.map(v=>v/length),boxes,length)>=length-.001;
}
function blockingCover(threat,candidate,boxes,y){
 const eye={x:threat.x,y:threat.y+1.15,z:threat.z};
 const player={...candidate,y:y+1.3};
 return !visible(eye,player,boxes);
}
export function publicCoverCandidatesV69(client,now,{maxAge=.275,limit=32}={}){
 const p=client?.pos,boxes=client?.map?.boxes,bound=client?.map?.bound;
 if(![now,p?.x,p?.y,p?.z,bound].every(finite)||!validBoxes(boxes))
  return {valid:false,reason:'invalid-public-map',candidateCount:0,targets:[]};
 const obs=publicHostilesC35K(client,now,{maxAge});
 if(!obs.valid)return {valid:false,reason:obs.reason,candidateCount:0,targets:[]};
 if(!obs.hostiles.length)return {valid:false,reason:'no-public-threat',candidateCount:0,targets:[]};
 const threats=obs.hostiles.filter(q=>distance(p,q.pos)<=65).slice(0,3);
 if(!threats.length)return {valid:false,reason:'hostiles-too-far',candidateCount:0,targets:[]};
 const candidates=[];
 for(const box of boxes){
  // Ignore low furniture unlikely to block body-height line of sight.
  if(box.y1 < p.y+1.48||box.y0>p.y+1.1)continue;
  const cx=(box.x0+box.x1)/2,cz=(box.z0+box.z1)/2;
  if(Math.hypot(cx-p.x,cz-p.z)>40)continue;
  const offset=2.15;
  const corners=[
   {x:box.x0-offset,z:box.z0-offset},
   {x:box.x0-offset,z:box.z1+offset},
   {x:box.x1+offset,z:box.z0-offset},
   {x:box.x1+offset,z:box.z1+offset},
   {x:box.x0-offset,z:cz},{x:box.x1+offset,z:cz},
   {x:cx,z:box.z0-offset},{x:cx,z:box.z1+offset}
  ];
  for(const c of corners){
   const dest={...c,y:p.y};
   const travel=distance(p,c);
   if(travel<2.25||travel>43||!clear(dest,boxes,bound))continue;
   let occluded=0;
   for(const q of threats)if(blockingCover(q.pos,dest,boxes,p.y))occluded++;
   if(occluded===0)continue;
   const nearestEnemy=Math.min(...threats.map(q=>distance(q.pos,dest)));
   if(nearestEnemy<8.5)continue;
   const penalty=(threats.length-occluded)*9;
   const score=travel+penalty+Math.max(0,13-nearestEnemy)*2;
   candidates.push({x:c.x,z:c.z,occluded,score:+score.toFixed(4),travel:+travel.toFixed(4)});
  }
 }
 candidates.sort((a,b)=>a.score-b.score||b.occluded-a.occluded||
  a.x-b.x||a.z-b.z);
 return {valid:true,reason:candidates.length?'cover-candidates':'no-cover',
  candidateCount:candidates.length,targets:candidates.slice(0,Math.max(1,Math.min(64,limit))),
  threats:threats.length,noPrivateState:true};
}
function gridRoute(p,target,boxes,bound,{cell=2.9,maxExpand=5600}={}){
 const width=Math.floor(2*bound/cell)+1;
 if(width<4||width>165)return null;
 const toIndex=x=>Math.max(0,Math.min(width-1,Math.round((x+bound)/cell)));
 const fromIndex=i=>-bound+i*cell;
 const sx=toIndex(p.x),sz=toIndex(p.z),start=sz*width+sx;
 const tx=toIndex(target.x),tz=toIndex(target.z),goal=tz*width+tx;
 const n=width*width,g=new Float64Array(n),previous=new Int32Array(n),visited=new Uint8Array(n);
 g.fill(Infinity);previous.fill(-1);g[start]=0;
 const walkable=(x,z)=>clear({x:fromIndex(x),y:p.y,z:fromIndex(z)},boxes,bound);
 if(!walkable(tx,tz))return null;
 const h=i=>Math.hypot(i%width-tx,Math.floor(i/width)-tz);
 const heap=[];
 const push=(index,f)=>{let i=heap.length;heap.push({index,f});while(i>0){
  const parent=(i-1)>>1;if(heap[parent].f<=f)break;
  heap[i]=heap[parent];i=parent;}heap[i]={index,f};};
 const pop=()=>{const first=heap[0],last=heap.pop();if(heap.length){
  let i=0;while(2*i+1<heap.length){let j=2*i+1;
   if(j+1<heap.length&&heap[j+1].f<heap[j].f)j++;
   if(heap[j].f>=last.f)break;heap[i]=heap[j];i=j;
  }heap[i]=last;}return first;};
 push(start,h(start));let expanded=0,found=false;
 const directions=[[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1]];
 while(heap.length&&expanded++<maxExpand){
  const {index}=pop();
  if(visited[index])continue;visited[index]=1;
  if(index===goal){found=true;break;}
  const x=index%width,z=Math.floor(index/width);
  for(const [dx,dz] of directions){
   const nx=x+dx,nz=z+dz;
   if(nx<=0||nz<=0||nx>=width-1||nz>=width-1)continue;
   const next=nz*width+nx;
   if(visited[next]||!walkable(nx,nz))continue;
   if(dx&&dz&&(!walkable(nx,z)||!walkable(x,nz)))continue;
   const candidate=g[index]+(dx&&dz?1.41421356:1);
   if(candidate<g[next]){
    g[next]=candidate;previous[next]=index;push(next,candidate+h(next));
   }
  }
 }
 if(!found)return null;
 const route=[];let i=goal;
 for(let count=0;count<=n&&i>=0;count++){
  route.push({x:fromIndex(i%width),z:fromIndex(Math.floor(i/width))});
  if(i===start)break;i=previous[i];
 }
 if(i!==start)return null;
 route.reverse();
 // Start at next waypoint, not center of current cell.
 while(route.length>1&&distance(route[0],p)<3.25)route.shift();
 return {points:route,length:g[goal],expanded};
}
export function publicEscapePlanV69(client,now,{maxCandidates=10}={}){
 const found=publicCoverCandidatesV69(client,now,{limit:maxCandidates});
 if(!found.valid||found.candidateCount===0)
  return {valid:false,reason:found.reason,cover:false,waypoints:[],noPrivateState:true};
 const p=client.pos,boxes=client.map.boxes,bound=client.map.bound;
 let chosen=null;
 for(const t of found.targets){
  const r=gridRoute(p,t,boxes,bound);
  if(!r)continue;
  const score=r.length*2.9+(found.threats-t.occluded)*12;
  if(chosen===null||score<chosen.score)
   chosen={score,target:{x:t.x,z:t.z},waypoints:r.points,expanded:r.expanded};
 }
 if(!chosen)return {valid:false,reason:'cover-unreachable',cover:false,
  waypoints:[],noPrivateState:true,candidateCount:found.candidateCount};
 return {valid:true,reason:'cover-route',cover:true,goal:chosen.target,
  waypoints:chosen.waypoints,expanded:chosen.expanded,
  candidateCount:found.candidateCount,noPrivateState:true};
}
function steer(client,desired){
 const p=client?.pos,boxes=client?.map?.boxes,bound=client?.map?.bound,yaw=client?.rig?.yaw;
 const length=Math.hypot(desired.x,desired.z);
 if(!(length>.1)||!finite(yaw)||!validBoxes(boxes)||!finite(bound))return null;
 const dx=desired.x/length,dz=desired.z/length;
 const options=[];
 for(let i=0;i<VECTORS.length;i++){
  const keys=VECTORS[i],unit=movementUnitC35T(keys,yaw);
  if(!unit)continue;
  const alignment=unit.x*dx+unit.z*dz;
  if(alignment<.22)continue;
  const to={x:p.x+unit.x*1.4,z:p.z+unit.z*1.4,y:p.y};
  if(!sweep(p,to,boxes,bound))continue;
  options.push({keys,alignment,index:i});
 }
 options.sort((a,b)=>b.alignment-a.alignment||a.index-b.index);
 return options[0]?.keys??null;
}
function threatAway(client,now){
 const selection=publicHostilesC35K(client,now,{maxAge:.275});
 if(!selection.valid||!selection.hostiles.length)return null;
 const p=client.pos;
 let dx=0,dz=0;
 for(const enemy of selection.hostiles.slice(0,3)){
  const d=Math.max(2,distance(p,enemy.pos));
  if(d>65)continue;
  dx+=(p.x-enemy.pos.x)/(d*d);
  dz+=(p.z-enemy.pos.z)/(d*d);
 }
 return Math.hypot(dx,dz)>.0001?{x:dx,z:dz}:null;
}
export class V69CoverEscapeTrial extends V67AcquisitionTrial {
 constructor({arm='keep',weapon='aa12',seed=1,...options}={}){
  if(!V69_ARMS.includes(arm))throw Error('V69_BAD_ARM');
  super({arm:arm==='keep'?'keep':'route',weapon,seed,...options});
  this.v69Arm=arm;this.escapeEnabled=arm.startsWith('cover-');
  this.maxModified=this.escapeEnabled?620:1050;
  this.escapePlans=0;this.coverPlans=0;this.coverSuccess=0;
  this.coverTicks=0;this.escapeTicks=0;this.escapeChanged=0;this.awayFallback=0;
  this.publicRiskValid=0;this.dangerTicks=0;this.escapeCache=null;
  this.stuckChecks=0;this.stuckEvents=0;this.stallFallbackTicks=0;
  this.lastProgress=null;this.lastProgressTick=0;
  this.dangerBudget=0;this.antiStallUntil=0;
  this.coverExamples=[];this.escapeErrors={};
 }
 beforeStep({tick,now,client,command}){
  const active=this.triggerTick!==null&&tick>this.triggerTick&&
   tick<=this.triggerTick+this.treatmentTicks;
  if(!active||!this.escapeEnabled)return super.beforeStep({tick,now,client,command});
  if(!this.prestate)throw Error('V69_NO_PREBRANCH_WITNESS');
  if(this.changedTicks>=this.maxModified){
   this.activeTicks++;this.stallFallbackTicks++;return {...command};
  }
  // Fail open to original commands for combat priority and unknown public states.
  if(command.fire||command.skill||command.reload||client?.local?.alive!==true||
   !finite(client?.local?.hp)||client.local.hp<54){
   this.activeTicks++;return {...command};
  }
  const risk=publicExposureV68(client,now);
  if(!risk.valid){
   this.escapeErrors['public-risk-missing']=(this.escapeErrors['public-risk-missing']??0)+1;
   return {...command};
  }
  this.publicRiskValid++;
  const danger=risk.highRisk||risk.visibleClose>0&&risk.riskScore>.55;
  if(!danger){
   this.dangerBudget=Math.max(0,this.dangerBudget-2);
   this.escapeCache=null;this.lastProgress=null;
   // A much more conservative acquisition unless nearby teammate support.
   if(this.v69Arm==='cover-support'&&risk.nearbyAllies===0&&risk.visibleMid>0)
    return {...command};
   return super.beforeStep({tick,now,client,command});
  }
  this.dangerTicks++;this.dangerBudget++;
  const p=client.pos;
  // Progress failure is observed using only own pre-step position.
  if(!this.lastProgress||tick-this.lastProgressTick>=75){
   if(this.lastProgress&&distance(p,this.lastProgress)<.95){
    this.stuckChecks++;this.stuckEvents++;this.escapeCache=null;
    this.antiStallUntil=tick+38;
   }
   this.lastProgress={x:p.x,z:p.z};this.lastProgressTick=tick;
  }
  if(tick<=this.antiStallUntil){
   this.activeTicks++;this.stallFallbackTicks++;
   // Let original bot recover rather than forcing fixed WASD under a collision.
   return {...command};
  }
  // After 165 danger ticks, prevent indefinite chasing/standing: release control
  // for 30 ticks, then allow a new bounded cover plan.
  if(this.dangerBudget>180){
   this.activeTicks++;this.stallFallbackTicks++;
   if(this.dangerBudget>=210)this.dangerBudget=0;
   return {...command};
  }
  const refresh=this.escapeCache===null||tick-this.escapeCache.tick>75||
   distance(p,this.escapeCache.from)>18;
  if(refresh){
   this.escapePlans++;
   const found=publicEscapePlanV69(client,now);
   this.escapeCache={tick,from:{x:p.x,z:p.z},plan:found};
   if(found.valid){this.coverPlans++;this.coverSuccess++;}
   else this.escapeErrors[found.reason]=(this.escapeErrors[found.reason]??0)+1;
  }
  const plan=this.escapeCache.plan;
  let selected=null;
  if(plan.valid&&plan.waypoints.length){
   const route=plan.waypoints;
   while(route.length>1&&distance(route[0],p)<3.2)route.shift();
   selected=steer(client,{x:route[0].x-p.x,z:route[0].z-p.z});
   if(selected){
    this.coverTicks++;
    if(this.coverExamples.length<8)this.coverExamples.push({
     tick,goal:{...plan.goal},nearest:{...route[0]},hp:risk.hp,
     danger:risk.riskScore});
   }
  }
  if(!selected){
   const away=threatAway(client,now);
   if(away)selected=steer(client,away);
   if(selected)this.awayFallback++;
  }
  if(!selected){
   this.activeTicks++;this.stallFallbackTicks++;
   this.escapeErrors['no-swept-safe-exit']=(this.escapeErrors['no-swept-safe-exit']??0)+1;
   return {...command};
  }
  const out={...command};
  for(const key of MOVE)out[key]=!!selected[key];
  for(const k of Object.keys(command))
   if(!MOVE.includes(k)&&out[k]!==command[k])throw Error('V69_NON_WASD_MUTATION');
  this.activeTicks++;this.escapeTicks++;
  if(MOVE.some(k=>!!out[k]!==!!command[k])){
   this.changedTicks++;this.escapeChanged++;
   this.commandChecks++;
   if(this.examples.length<8)this.examples.push({tick,why:'active-cover-egress',
    before:MOVE.map(k=>+!!command[k]).join(''),after:MOVE.map(k=>+!!out[k]).join('')});
  }
  return out;
 }
 finish(){
  const original=super.finish();
  return {...original,schema:V69_SCHEMA,arm:this.v69Arm,
   coverResearchOnly:true,allNonWASDUnchanged:true,noPrivilegedActorInput:true,
   publicRiskBeforeGameStep:true,activeEscapeInsteadOfNeutralWASD:true,
   maxChangedTicks:this.maxModified,escapePlans:this.escapePlans,
   coverPlans:this.coverPlans,coverSuccess:this.coverSuccess,
   coverTicks:this.coverTicks,escapeTicks:this.escapeTicks,
   escapeChanged:this.escapeChanged,awayFallback:this.awayFallback,
   dangerTicks:this.dangerTicks,publicRiskValid:this.publicRiskValid,
   stuckChecks:this.stuckChecks,stuckEvents:this.stuckEvents,
   stallFallbackTicks:this.stallFallbackTicks,escapeErrors:this.escapeErrors,
   coverExamples:this.coverExamples,productionAllowed:false};
 }
}
