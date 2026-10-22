// Predictive hitscan evasion using *observable, delayed* opponent pose and fire events.
// The game has no bullet travel time: all actions are taken BEFORE the next shot.
// No privileged server state, artificial invulnerability, or modified weapon rules.
import {hardCoverBetween} from './tactical-nav.mjs';
import {enemyCameraRisk,cameraOccluded} from './camera-tactics.mjs';
const evadeClamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const evadeLen=(x,z)=>Math.hypot(x,z);
const evadeNormalize=(x,z)=>{const l=evadeLen(x,z)||1;return {x:x/l,z:z/l};};
export function visibleFireThreats(map,local,contacts=[],now=0,maxRange=65){
  if(!local)return [];
  return contacts.filter(e=>{
    if(!Number.isFinite(e.x)||!Number.isFinite(e.z)||!Number.isFinite(e.yaw))return false;
    const dx=local.x-e.x,dz=local.z-e.z,d=evadeLen(dx,dz);
    if(d<1||d>Math.max(maxRange,Math.min(410,e.maxRange||maxRange)) || cameraOccluded(map,{x:e.x,y:(e.y||0)+1.5,z:e.z},{x:local.x,y:(local.y||0)+1.25,z:local.z}))return false;
    const facing=(-Math.sin(e.yaw)*dx-Math.cos(e.yaw)*dz)/d;
    // Official opponents hip-fire without ADS. Observed recent gunfire matters.
    // Include near contacts regardless of aim, but never assume blind enemies cannot rotate.
    return (e.aim&&facing>.48) || (e.recentFire&&facing>.32) || d<13&&facing>-.25;
  });
}
function evadeCanRun(map,origin,dx,dz,helpers,reach){
  const bound=map?.bound||68,finish={x:origin.x+dx*reach,z:origin.z+dz*reach};
  if(Math.abs(finish.x)>bound-.95||Math.abs(finish.z)>bound-.95)return false;
  if(!Array.isArray(map?.boxes))return false;
  // Open maps need legal lateral dodges too; empty collision lists are valid.
  if(!map.boxes.length)return true;
  // Current ground height and physical player radius, test corridor in 3 bands.
  for(const height of [.3,.92,1.52])for(const offset of [-.39,0,.39]){
    const start=[origin.x-dz*offset,origin.y+height,origin.z+dx*offset];
    if(helpers.rayWorld(start,[dx,0,dz],map.boxes,reach+.12)<reach+.04)return false;
  }
  return true;
}
export function predictiveEvasion(game,helpers,contacts=[],now=0,memory={},opts={}){
  const origin=game?.local?.mv,map=game?.map;
  if(!origin||!map||!helpers?.rayWorld)return null;
  const threats=visibleFireThreats(map,origin,contacts,now,opts.range||65).sort((a,b)=>{const da=Math.hypot(a.x-origin.x,a.z-origin.z),db=Math.hypot(b.x-origin.x,b.z-origin.z);return da-db;}).slice(0,4);
  if(!threats.length){memory.direction=null;return null;}
  const speed=evadeClamp(opts.speed|| (game.local?.mv?.stance===1?3.6:4.7),2.3,7);
  const candidates=[];
  // Threat bearing is useful for exact perpendicular moves, not just 8 cardinal headings.
  for(const e of threats){const d=evadeNormalize(origin.x-e.x,origin.z-e.z);
    candidates.push({x:-d.z,z:d.x},{x:d.z,z:-d.x});
  }
  for(let i=0;i<16;i++){const a=i*Math.PI/8;candidates.push({x:Math.cos(a),z:Math.sin(a)});}
  if(memory.direction)candidates.push(memory.direction);
  const evalAt=(x,z,h)=>{
    const p={x:origin.x+x*speed*h,z:origin.z+z*speed*h,y:origin.y};
    let risk=0;
    for(const e of threats){
      if(hardCoverBetween(map,e,p,origin.y))continue;
      const dist=evadeLen(e.x-p.x,e.z-p.z),d0=evadeLen(e.x-origin.x,e.z-origin.z);
      // Visible shots do not reveal the next weapon spread; nonzero back-facing floor.
      const R=enemyCameraRisk(e,{x:p.x,y:p.y+1.2,z:p.z},Math.min(h,.35));
      risk+=R * (e.recentFire?1.6:1) * (e.aim?1.25:1);
      // Penalize remaining on the CURRENT firing ray for the next few frames.
      const vx=-Math.sin(e.yaw),vz=-Math.cos(e.yaw),along=(p.x-e.x)*vx+(p.z-e.z)*vz;
      if(along>0 && along<d0+8){
        const miss=Math.abs((p.x-e.x)*vz-(p.z-e.z)*vx);
        if(miss<1.15)risk+=(1.15-miss)*2.8*(e.aim?1.3:1);
      }
      if(dist<9)risk+=(9-dist)*.22;
    }
    return risk;
  };
  const base=(evalAt(0,0,.12)+evalAt(0,0,.36)+evalAt(0,0,.62))/3;
  let winner=null,best=-Infinity;
  for(const raw of candidates){
    const unit=evadeNormalize(raw.x,raw.z),dx=unit.x,dz=unit.z;
    if(!evadeCanRun(map,origin,dx,dz,helpers,Math.min(2.9,speed*.62)))continue;
    const r1=evalAt(dx,dz,.12),r2=evalAt(dx,dz,.36),r3=evalAt(dx,dz,.62);
    const improvement=base-(r1*.25+r2*.45+r3*.3);
    // Hold one effective direction long enough to cross a hitbox and avoid a
    // tick-to-tick oscillation; never keep commitment through a collision.
    const continuity=memory.direction ? dx*memory.direction.x+dz*memory.direction.z : 0;
    const committed=now<(memory.until||0);
    const score=improvement+(committed?.65:.25)*continuity;
    if(score>best){best=score;winner={x:dx,z:dz};}
  }
  if(!winner || best<.15){memory.direction=null;return null;}
  const old=memory.direction;
  if(!old || old.x*winner.x+old.z*winner.z<.85){memory.direction=winner;memory.until=now+.46;}
  else memory.direction=winner;
  return {...winner,reason:'predictive-hitscan-evasion',emergency:true,sprint:false,
    threatCount:threats.length,estimatedRiskReduction:Math.max(0,Math.min(1,best/Math.max(1,base)))};
}

// Constant-time low/high pose mixup when weapon fire or ADS is actually observed.
// Regular stance changes can force a new line of aim, but do not grant immunity.
export function adaptiveDefensiveStance(game,input,contacts=[],now=0,state={}){
  const mv=game?.local?.mv;
  if(!mv||!mv.onGround||mv.slideT>0||mv.stance===2||mv.air||mv.heli ||
    game?.local?.frozen||game?.local?.down || input.plate||input.use||input.interact||input.prone||input.jump)return input;
  const threats=visibleFireThreats(game.map,mv,contacts,now,55);
  if(!threats.length){state.poseUntil=0;state.poseLow=false;return input;}
  const shooting=threats.some(x=>x.recentFire||x.aim);
  if(!shooting)return input;
  if(!Number.isFinite(state.poseUntil)||now>=state.poseUntil){
    const k=state.poseTick=(state.poseTick||0)+1;
    state.poseLow=!state.poseLow;
    // Variation in duration avoids a trivially periodic duck cadence.
    const jitter=(Math.sin(k*12.9898+Math.floor(now)*.17)*43758.5453)%1;
    const t=Math.abs(jitter);
    state.poseUntil=now+(state.poseLow ? .12+t*.11 : .15+t*.15);
  }
  if(mv.sprint&&!input.fire&&!input.aim)return input;
  return {...input,crouch:state.poseLow,slide:false,
    // Lean alternation shifts the hit sphere while maintaining aim/fire input.
    lean:state.poseLow ? (state.poseTick%2?1:-1):0};
}
