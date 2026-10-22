// Opportunistic teammate crossfire using only public, delayed client snapshots.
// A flank must improve separation at the enemy, be physically reachable and not
// expose a low-health player. Keep the chosen goal stable across decision ticks.
export function squadFlank(game,target,helpers,now=0,memory={},extra={}){
const d2=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
 const finite=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.z);
 const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
 const unit=(x,z)=>{const n=Math.hypot(x,z);return n>.01?{x:x/n,z:z/n}:null;};
 function angleGap(a,b,enemy){
  const a0=Math.atan2(a.z-enemy.z,a.x-enemy.x),b0=Math.atan2(b.z-enemy.z,b.x-enemy.x);
  return Math.abs(Math.atan2(Math.sin(a0-b0),Math.cos(a0-b0)));
 }
 function wallDistance(game,helpers,origin,destination){
  const ray=helpers?.rayWorld;
  if(typeof ray!=='function')return 0;
  const v=[destination.x-origin.x,destination.y-origin.y,destination.z-origin.z];
  const dist=Math.hypot(...v);
  if(!(dist>.05))return 0;
  const result=ray([origin.x,origin.y,origin.z],v.map(x=>x/dist),game.map?.boxes||[],dist);
  return Number.isFinite(result)?result:0;
 }
 function canMove(game,helpers,x,z,length=1.65,extra={}){
  const f=extra.safe;
  if(typeof f==='function')return f(game,x,z,helpers,length);
  const mv=game?.local?.mv;
  if(!finite(mv)||!game.map?.boxes)return false;
  const u=unit(x,z);if(!u)return false;
  const bound=game.map.bound||68;
  if(Math.abs(mv.x+u.x*length)>bound-1 || Math.abs(mv.z+u.z*length)>bound-1)return false;
  return wallDistance(game,helpers,{x:mv.x,y:(mv.y||0)+1,z:mv.z},
    {x:mv.x+u.x*length,y:(mv.y||0)+1,z:mv.z+u.z*length})>=length-.12;
 }
 function memberFacing(r,enemy){
  const f={x:-Math.sin(r.yaw||0),z:-Math.cos(r.yaw||0)};
  const to=unit(enemy.x-r.pos.x,enemy.z-r.pos.z);
  return !!to && (f.x*to.x+f.z*to.z)>.70;
 }
 function candidateValid(game,helpers,mv,enemy,ally,goal,extra){
  const bound=game.map?.bound||68;
  if(Math.abs(goal.x)>bound-2||Math.abs(goal.z)>bound-2)return false;
  if(d2(mv,goal)>11 || d2(mv,goal)<1.3)return false;
  // Candidate must actually improve the opening angle, not just move left/right.
  const before=angleGap(mv,ally.pos,enemy),after=angleGap(goal,ally.pos,enemy);
  if(after<before+.105||after<.30||after>1.25)return false;
  // Do not flank if the teammate is no longer participating in this lane.
  if(!memberFacing(ally,enemy))return false;
  const ey=(Number.isFinite(enemy.y)?enemy.y:(mv.y||0)+1.45);
  const canShoot=wallDistance(game,helpers,{x:goal.x,y:(mv.y||0)+1.55,z:goal.z},
     {x:enemy.x,y:ey,z:enemy.z}) >= Math.hypot(enemy.x-goal.x,ey-(mv.y||0)-1.55,enemy.z-goal.z)-.2;
  if(!canShoot)return false;
  // A point cannot be called safe merely because one enemy is looking away:
  // evaluate visible opponents' arcs and avoid a high-risk crossfire destination.
  let risk=0;
  for(const r of game.remotes?.list||[]){
    if(!r?.alive||!finite(r.pos)||r.team===game.you?.tm)continue;
    const range=d2(r.pos,goal);
    if(range<9)return false;
    const facing=memberFacing(r,goal);
    if(facing && range<34)risk+=1;
  }
  if(risk>1)return false;
  const delta={x:goal.x-mv.x,z:goal.z-mv.z};
  const first=canMove(game,helpers,delta.x,delta.z,Math.min(1.8,d2(goal,mv)),extra);
  if(!first)return false;
  return {score:(after-before)*11-d2(mv,goal)*.24-risk*2.0,delta};
 }
 
 const mode=game?.modeState?.type;
 if(!['tdm','snd','hp','br'].includes(mode) || !target?.visible || !finite(target?.point) || !finite(game?.local?.mv))return null;
 const team=game.you?.tm,mv=game.local.mv;
 if(!Number.isInteger(team)||game.local.ws?.reloading)return null;
 const enemy=target.remote?.pos||target.point;
 if(!finite(enemy))return null;
 const distance=d2(enemy,mv);
 if(distance<21||distance>55||Number(game.local.hp)<80||Number(game.local.armor)<20)return null;
 // If this enemy is already aiming toward us, holding the current firing lane
 // is usually preferable to crossing their sights to force a flank.
 const enemyYaw=target.remote?.yaw;
 if(Number.isFinite(enemyYaw)){
   const toSelf=unit(mv.x-enemy.x,mv.z-enemy.z);
   const facing={x:-Math.sin(enemyYaw),z:-Math.cos(enemyYaw)};
   if(toSelf && toSelf.x*facing.x+toSelf.z*facing.z>.65)return null;
 }
 const ownGun=game.local.ws?.guns?.[game.local.ws?.slot];
 if(ownGun && ownGun.mag<=0)return null;
 const friends=(game.remotes?.list||[]).filter(r=>r?.alive&&r.team===team&&r.id!==game.net?.id&&finite(r.pos)&&r.data?.aim);
 let ally=null,near=Infinity;
 for(const r of friends){
   const d=d2(mv,r.pos),ed=d2(enemy,r.pos);
   if(d<4||d>26||ed>80||!memberFacing(r,enemy))continue;
   if(d<near){ally=r;near=d;}
 }
 if(!ally){memory.plan=null;return null;}
 if(memory.plan && memory.plan.target===target.id && memory.plan.ally===ally.id &&
    now<memory.plan.expiry && d2(enemy,memory.plan.enemy)<4){
   const goal=memory.plan.goal;
   if(d2(mv,goal)<1.45){memory.plan=null;memory.completedUntil=now+1.5;return null;}
   const d={x:goal.x-mv.x,z:goal.z-mv.z};
   if(canMove(game,helpers,d.x,d.z,1.6,extra))return {...unit(d.x,d.z),reason:'squad-crossfire',sprint:false};
   memory.plan=null;
 }
 if(now<(memory.completedUntil||0)||now<(memory.retryAt||0))return null;
 const fw=unit(enemy.x-mv.x,enemy.z-mv.z);
 if(!fw)return null;
 const side={x:-fw.z,z:fw.x};
 const friendSide=(ally.pos.x-enemy.x)*side.x+(ally.pos.z-enemy.z)*side.z;
 const desired=friendSide>=0?-1:1;
 const candidates=[];
 // Multiple radii with the ally-opposite side favoured. No deterministic left-right oscillation.
 for(const sign of [desired,-desired])for(const lateral of [3.5,5.0,6.5])for(const forward of [0,2]){
   const goal={x:mv.x+side.x*sign*lateral+fw.x*forward,
     y:mv.y||0,z:mv.z+side.z*sign*lateral+fw.z*forward};
   const v=candidateValid(game,helpers,mv,enemy,ally,goal,extra);
   if(v)candidates.push({goal,score:v.score+(sign===desired?2:0)});
 }
 candidates.sort((a,b)=>b.score-a.score);
 if(!candidates.length){memory.retryAt=now+.55;return null;}
 const goal=candidates[0].goal;
 memory.plan={target:target.id,ally:ally.id,goal,enemy:{x:enemy.x,z:enemy.z},expiry:now+2.4};
 const delta={x:goal.x-mv.x,z:goal.z-mv.z};
 return {...unit(delta.x,delta.z),reason:'squad-crossfire',sprint:false};
}
