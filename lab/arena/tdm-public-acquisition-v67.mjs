/** V67 research-only public-map route acquisition toward weapon-effective range.
 * Does not read authoritative Game state; no aim/fire/ADS/skills changes.
 */
import {publicHostilesC35K} from './public-target-los-c35k.mjs';
import {movementUnitC35T} from './target-relative-motion-c35t.mjs';
import {WEAPONS} from './source-main/shared/weapons.js';
import {V64TacticalTrial} from './tdm-context-trial-v64.mjs';
export const V67_ARMS=Object.freeze(['keep','direct','route','flank']);
export const V67_SCHEMA='fpsarena-v67-public-map-range-acquisition-v1';
const KEYS=['forward','backward','left','right'];
const BUTTONS=Object.freeze([{forward:true},{forward:true,right:true},{right:true},{right:true,backward:true},{backward:true},{backward:true,left:true},{left:true},{left:true,forward:true}]);
const finite=Number.isFinite;
const round=x=>finite(x)?+x.toFixed(4):null;
const eye=({x,y,z})=>[x,y+1.4,z];
const validBoxes=boxes=>Array.isArray(boxes)&&boxes.length<=2000&&boxes.every(b=>
 ['x0','x1','y0','y1','z0','z1'].every(k=>finite(b?.[k]))&&b.x0<=b.x1&&b.y0<=b.y1&&b.z0<=b.z1);
function obstacle(b,p,r=.75) {
 return b.x0<=p.x+r&&b.x1>=p.x-r&&b.z0<=p.z+r&&b.z1>=p.z-r&&
  b.y0<=p.y+1.65&&b.y1>=p.y+.15;
}
function occupancy(pos,boxes,bound,r=.7){
 return !finite(bound)||Math.abs(pos.x)>bound-1.3||Math.abs(pos.z)>bound-1.3||
 boxes.some(b=>obstacle(b,pos,r));
}
function sweptFree(from,to,boxes,bound){
 for(let i=1;i<=7;i++){
  const a=i/7,p={x:from.x+(to.x-from.x)*a,z:from.z+(to.z-from.z)*a,y:from.y};
  if(occupancy(p,boxes,bound))return false;
 }
 return true;
}
function effectiveRange(weapon){
 const w=WEAPONS[weapon];
 if(!w)return null;
 return Math.min(w.maxRange,(w.range?.[1]??w.maxRange)*.9);
}
export function publicFarRangeV67(client,now,weapon,command={}){
 const p=client?.pos, hp=client?.local?.hp, boxes=client?.map?.boxes,bound=client?.map?.bound;
 const eff=effectiveRange(weapon);
 if(!finite(now)||!finite(p?.x)||!finite(p?.y)||!finite(p?.z)||!finite(hp)||
   client?.local?.alive!==true||hp<58)return {valid:false,reason:'dead-or-low-hp'};
 if(command.fire||command.skill||command.reload)return {valid:false,reason:'combat-interrupt'};
 if(!validBoxes(boxes)||!finite(bound)||bound<=15)return {valid:false,reason:'invalid-public-map'};
 const s=publicHostilesC35K(client,now,{maxAge:.275});
 if(!s.valid)return {valid:false,reason:s.reason};
 if(!finite(eff)||eff<=3)return {valid:false,reason:'unknown-weapon'};
 if(!s.hostiles.length)return {valid:false,reason:'no-public-hostile'};
 const t=s.hostiles[0],d=Math.hypot(t.pos.x-p.x,t.pos.z-p.z);
 // Finite, exposed public far-target trigger; no "must fire" dependency.
 if(d<=Math.max(19,eff*1.15)||d>Math.min(220,2*bound))
   return {valid:false,reason:'target-not-far',distance:round(d)};
 return {valid:true,reason:'far-target',targetId:String(t.id),
  targetPos:{x:t.pos.x,z:t.pos.z},distance:round(d),
  effectiveRange:round(eff),targetRadius:round(Math.max(7,eff*.7)),
  hp:round(hp),visibleHostiles:s.hostiles.length,
  noPrivilegedState:true};
}

function pathToRing(pos,target,boxes,bound,radius,{flank=false}={}){
 const cell=2.75;
 const width=Math.floor((2*bound)/cell)+1;
 if(width>170)return null;
 const cx=x=>Math.max(0,Math.min(width-1,Math.round((x+bound)/cell)));
 const world=k=>-bound+k*cell;
 const sx=cx(pos.x),sz=cx(pos.z),start=sz*width+sx;
 const total=width*width;
 const closed=new Uint8Array(total),g=new Float64Array(total),parent=new Int32Array(total);
 g.fill(Infinity);parent.fill(-1);
 g[start]=0;
 const tx=target.x,tz=target.z;
 const dx=tx-pos.x,dz=tz-pos.z,d=Math.max(1,Math.hypot(dx,dz));
 const px=-dz/d,pz=dx/d,side=flank?Math.min(18,Math.max(8,radius*.75)):0;
 const aim={x:tx+px*side,z:tz+pz*side};
 const heur=(i)=>Math.max(0,Math.hypot(world(i%width)-aim.x,world(Math.floor(i/width))-aim.z)-radius);
 const heap=[];
 const push=(key,cost)=>{let i=heap.length;heap.push({key,cost});while(i>0){let pi=Math.floor((i-1)/2);if(heap[pi].cost<=cost)break;heap[i]=heap[pi];i=pi;}heap[i]={key,cost}};
 const pop=()=>{const top=heap[0],last=heap.pop();if(heap.length){let k=0;while(2*k+1<heap.length){let c=2*k+1;if(c+1<heap.length&&heap[c+1].cost<heap[c].cost)c++;if(heap[c].cost>=last.cost)break;heap[k]=heap[c];k=c;}heap[k]=last;}return top};
 push(start,heur(start));let found=-1,expanded=0;
 const walkable=(i)=>!occupancy({x:world(i%width),z:world(Math.floor(i/width)),y:pos.y},boxes,bound);
 const offsets=[[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1]];
 while(heap.length&&expanded<9500){
  const item=pop(),i=item.key;
  if(closed[i])continue;closed[i]=1;expanded++;
  const ax=world(i%width),az=world(Math.floor(i/width));
  const dist=Math.hypot(ax-aim.x,az-aim.z);
  if(dist<=radius&&dist>=Math.max(3,radius*.3)){found=i;break;}
  const ix=i%width,iz=Math.floor(i/width);
  for(const [vx,vz] of offsets){
   const nx=ix+vx,nz=iz+vz;
   if(nx<=0||nz<=0||nx>=width-1||nz>=width-1)continue;
   const next=nz*width+nx;
   if(closed[next]||!walkable(next))continue;
   const diagonal=!!(vx&&vz),cost=diagonal?1.414:1;
   // Diagonal corner-cut prevention.
   if(diagonal&&(!walkable(iz*width+nx)||!walkable(nz*width+ix)))continue;
   const score=g[i]+cost;
   if(score<g[next]){
    parent[next]=i;g[next]=score;
    push(next,score+heur(next)/cell);
   }
  }
 }
 if(found<0)return null;
 let idx=found,route=[];
 for(let n=0;n<total&&idx>=0;n++){
  route.push({x:world(idx%width),z:world(Math.floor(idx/width))});
  if(idx===start)break;
  idx=parent[idx];
 }
 if(idx!==start)return null;
 route.reverse();
 return {route,expanded,goal:route.at(-1)};
}
const candidates=(client,direction)=>{
 const p=client.pos,boxes=client.map.boxes,bound=client.map.bound,yaw=client.rig.yaw;
 const d=Math.hypot(direction.x,direction.z);
 if(d<.1)return null;
 const ux=direction.x/d,uz=direction.z/d,choices=[];
 for(let i=0;i<BUTTONS.length;i++){
  const key=BUTTONS[i],mv=movementUnitC35T(key,yaw);
  if(!mv||![mv.x,mv.z].every(finite))continue;
  const dot=mv.x*ux+mv.z*uz;
  if(dot<.18)continue;
  const end={x:p.x+mv.x*1.4,z:p.z+mv.z*1.4,y:p.y};
  if(!sweptFree(p,end,boxes,bound))continue;
  choices.push({key,dot,i});
 }
 choices.sort((a,b)=>b.dot-a.dot||a.i-b.i);
 return choices[0]?.key??null;
};
export class V67AcquisitionTrial extends V64TacticalTrial {
 constructor({arm='keep',weapon='aa12',seed=1,earliestTick=650,latestTick=6500,
    treatmentTicks=1050,outcomeTicks=1230,confirmationSamples=2,sampleEvery=6}={}){
  if(!V67_ARMS.includes(arm)||!Number.isSafeInteger(treatmentTicks)||
    treatmentTicks<120||treatmentTicks>1800||outcomeTicks<treatmentTicks)
   throw Error('V67_BAD_CONFIG');
  // Parent is NOT called for trigger/control, but supplies the stable independent audit recorder.
  super({arm:'keep',stratum:'post-fire',weapon,seed,earliestTick,latestTick,
    treatmentTicks:300,outcomeTicks:480,confirmationSamples,sampleEvery});
  this.arm=arm;this.stratum='far-public-target';this.treatmentTicks=treatmentTicks;
  this.outcomeTicks=outcomeTicks;this.routeCache=null;
  this.stops={};this.publicSamples=0;this.pathPlans=0;this.pathFound=0;
  this.inRangeTicks=0;this.initialFarDistance=null;this.finalDistance=null;
  this.routeWaypointExamples=[];
 }
 beforeStep({tick,now,client,command}){
  if(!Number.isSafeInteger(tick))throw Error('V67_BAD_TICK');
  const cmd={...command};
  const hp=client?.local?.hp;
  if(finite(hp)&&finite(this.lastHp)&&hp<this.lastHp-.1)this.damageUntil=tick+90;
  if(finite(hp))this.lastHp=hp;
  if(this.triggerTick===null){
   this.prefix.update(JSON.stringify({tick,command:cmd})+'\n');
   if(tick>=this.nextEligibleTick&&tick<=this.latestTick&&
     (tick-this.nextEligibleTick)%this.sampleEvery===0){
    this.publicSamples++;
    const f=publicFarRangeV67(client,now,this.weapon,cmd);
    this.lastSampleTick=tick;
    if(f.valid){
     if(this.firstEligibleTick===null)this.firstEligibleTick=tick;
     this.streak++;
     if(this.streak>=this.confirmationSamples){
      this.triggerTick=tick;this.triggerFeature=f;this.initialFarDistance=f.distance;
      this.prefixSHA256=this.prefix.digest('hex');
     }
    }else{
     this.streak=0;this.rejectionCounts[f.reason]=(this.rejectionCounts[f.reason]??0)+1;
    }
   }
   return cmd; // immutable pre-branch trigger command
  }
  if(tick<=this.triggerTick||tick>this.triggerTick+this.treatmentTicks)return cmd;
  if(!this.prestate)throw Error('V67_NO_PRESTEP_WITNESS');
  this.activeTicks++;
  // The Keep arm must reproduce the exact uninstrumented original result.
  if(this.arm==='keep'){this.stops.keep=(this.stops.keep??0)+1;return cmd;}
  if(!finite(hp)||hp<58||client?.local?.alive!==true||
     cmd.fire||cmd.skill||cmd.reload){
   this.stops['combat-or-hp']=(this.stops['combat-or-hp']??0)+1;
   return cmd;
  }
  const observed=publicHostilesC35K(client,now,{maxAge:.275});
  if(!observed.valid||!observed.hostiles.length){
   this.stops['stale-or-missing-target']=(this.stops['stale-or-missing-target']??0)+1;return cmd;
  }
  const p=client.pos,t=observed.hostiles[0].pos,dist=Math.hypot(t.x-p.x,t.z-p.z);
  const eff=effectiveRange(this.weapon);
  this.finalDistance=round(dist);
  if(!validBoxes(client?.map?.boxes)||!finite(client.map.bound)){
   this.stops['invalid-map']=(this.stops['invalid-map']??0)+1;return cmd;
  }
  if(dist<=Math.max(7,eff*.74)){
   this.inRangeTicks++;this.stops.inRange=(this.stops.inRange??0)+1;return cmd;
  }
  let waypoint={x:t.x,z:t.z};
  if(this.arm==='route'||this.arm==='flank'){
   const stale=this.routeCache===null||tick-this.routeCache.tick>=65||
    Math.hypot(this.routeCache.target.x-t.x,this.routeCache.target.z-t.z)>10;
   if(stale){
    this.pathPlans++;
    const candidate=pathToRing(p,t,client.map.boxes,client.map.bound,Math.max(7,eff*.72),
     {flank:this.arm==='flank'});
    if(candidate)this.pathFound++;
    this.routeCache={tick,target:{x:t.x,z:t.z},path:candidate?.route??null};
   }
   const path=this.routeCache.path;
   if(path?.length){
    // Greedy progress through waypoints, never emit non-WASD commands.
    while(path.length>1&&Math.hypot(path[0].x-p.x,path[0].z-p.z)<3.15)path.shift();
    waypoint=path[0];
    if(this.routeWaypointExamples.length<8)
     this.routeWaypointExamples.push({tick,to:{x:round(waypoint.x),z:round(waypoint.z)}});
   }else{
    this.stops['no-route']=(this.stops['no-route']??0)+1;return cmd;
   }
  }
  const keys=candidates(client,{x:waypoint.x-p.x,z:waypoint.z-p.z});
  if(!keys){
   this.stops['no-safe-heading']=(this.stops['no-safe-heading']??0)+1;
   if(this.arm!=='direct')this.routeCache=null;
   return cmd;
  }
  const out={...cmd};
  for(const k of KEYS)out[k]=!!keys[k];
  for(const k of Object.keys(cmd))
   if(!KEYS.includes(k)&&out[k]!==cmd[k])throw Error('V67_NON_WASD_MUTATION');
  this.commandChecks++;
  this.eligibleTicks++;
  if(KEYS.some(k=>!!cmd[k]!==!!out[k])){
   this.changedTicks++;
   if(this.examples.length<8)this.examples.push({tick,from:KEYS.map(k=>+!!cmd[k]).join(''),
       to:KEYS.map(k=>+!!out[k]).join('')});
  }
  return out;
 }
 finish(){
  const base=super.finish();
  return {...base,schema:V67_SCHEMA,arm:this.arm,stratum:this.stratum,
   publicTriggerProvenance:'delayed public hostile + public map + own HP and weapon range',
   publicMapPathfinding:true,router:'bounded-grid-static-2d-Astar-plus-swept-collision',
   contextCapturedBeforeIntervention:false,farPublicTargetCapturedBeforeIntervention:true,
   initialFarDistance:this.initialFarDistance,finalDistance:this.finalDistance,
   publicSamples:this.publicSamples,routePlans:this.pathPlans,routeFound:this.pathFound,
   inRangeTicks:this.inRangeTicks,stops:this.stops,routeWaypointExamples:this.routeWaypointExamples,
   acquisitionOnly:true,fireAimAdsSkillsModified:false,
   productionAllowed:false};
 }
}
