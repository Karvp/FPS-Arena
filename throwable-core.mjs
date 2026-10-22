// Server-conformant throwable decisions. Only uses locally visible snapshot state.
const td=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const tf=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.z);
function teamIndex(game){return Number.isInteger(game?.you?.tm)?game.you.tm:({red:0,blue:1})[game?.local?.team];}
const dangerous=new Set(['frag','impact','gas','cryo','discharger']);
function unsafeForAllies(game,point,radius){
  return (game.remotes?.list||[]).some(r=>r.alive && r.team===teamIndex(game) && tf(r.pos) && td(r.pos,point)<radius+2);
}
function cleanArc(map,start,vx,vy,vz,t){
  const boxes=map?.boxes||[];const steps=Math.max(8,Math.ceil(t*36));
  for(let i=1;i<steps;i++){
    const u=i*t/steps,p={x:start.x+vx*u,y:start.y+vy*u-10*u*u,z:start.z+vz*u};
    if(p.y<.12)return false;
    if(boxes.some(b=>p.x>b.x0-.17&&p.x<b.x1+.17&&p.y>b.y0-.17&&p.y<b.y1+.17&&p.z>b.z0-.17&&p.z<b.z1+.17))return false;
  }
  return true;
}
export function ballisticThrow(game,point,config,eyeHeight=1.65){
  const m=game?.local?.mv;if(!tf(point)||!tf(m))return null;
  const dx=point.x-m.x,dz=point.z-m.z,d=Math.hypot(dx,dz),speed=config.speed||25;
  if(d<2.8||d>43)return null;
  const yaw=Math.atan2(-dx,-dz),start={x:m.x,y:m.y+eyeHeight-.1,z:m.z};
  let best=null;
  for(let degrees=-5;degrees<=75;degrees+=.75){
    const pitch=degrees*Math.PI/180,hv=speed*Math.cos(pitch);
    if(hv<1)continue;
    const t=(d-.5)/hv;if(t<=0||t>3.6)continue;
    const vy=speed*Math.sin(pitch)+4.5;
    const height=start.y+vy*t-10*t*t;
    const error=Math.abs(height-((point.y||0)+.6));
    if(error>1.15)continue;
    if(!cleanArc(game.map,start,-Math.sin(yaw)*hv,vy,-Math.cos(yaw)*hv,t))continue;
    const cost=error+degrees*.001;
    if(!best||cost<best.cost)best={yaw,pitch,error,time:t,cost};
  }
  return best;
}
export function autoThrowableDecision(game,input,target,contacts=[],now=0,memory={},catalog={}){
  const local=game?.local,mv=local?.mv,thr=game?.you?.thr || local?.thr;
  if(!local?.alive||local.down||local.frozen||mv?.air||mv?.heli||local.inView||game?.you?.ss?.view || !thr?.id||thr.n<=0 || !tf(mv))return null;
  if(input.throw||input.use||input.interact||input.slot===0||input.slot===1||input.skill||input.plate||input.reload)return null;
  // Always send a false edge after G; respect the authoritative ammo decrement.
  if(memory.lastCount!==thr.n||memory.lastId!==thr.id){memory.lastCount=thr.n;memory.lastId=thr.id;memory.awaitRelease=false;}
  if(memory.awaitRelease){memory.awaitRelease=false;return null;}
  if(now-(memory.lastAt??-Infinity)<2.4)return null;
  const kind=thr.id,def=catalog[kind];if(!def)return null;
  if(kind==='discharger')return null; // no authoritative owner/stuck identity in snapshots
  const hp=local.hp??100;
  if(kind==='stim'){
    if(hp>65 || (local.stimT||0)>0)return null;
    memory.lastAt=now;memory.awaitRelease=true;return {throw:true,reason:'stim-recovery'};
  }
  const opponents=contacts.filter(c=>tf(c)&&td(c,mv)<36);
  const focal=target?.remote?.pos||target?.point;
  let enemy=opponents.find(c=>target?.id===c.id || target?.id===c.id0)||
    opponents.sort((a,b)=>td(a,mv)-td(b,mv))[0];
  if(!enemy && !tf(focal))return null;
  let point=enemy?{x:enemy.x,y:enemy.y||0,z:enemy.z}:
    {x:focal.x,y:(focal.y||1.3)-1.3,z:focal.z};
  let distance=td(point,mv);
  if(kind==='foam'){
    // Foam protects a recovering player against an exposed shooter.
    if(!(local.ws?.reloading||local.ws?.plateT>0||input.fire===false&&hp<42) || distance<9||distance>34)return null;
    const fraction=Math.min(.65,Math.max(.28,8/distance));
    point={x:mv.x+(point.x-mv.x)*fraction,y:mv.y||0,z:mv.z+(point.z-mv.z)*fraction};
  }else{
    if(distance<(kind==='impact'?9:12)||distance>(kind==='frag'?33:29))return null;
    if(dangerous.has(kind) && (distance<(def.radius||6)+6 || unsafeForAllies(game,point,def.radius||7)))return null;
  }
  if(!tf(point))return null;
  const solution=ballisticThrow(game,point,def);
  if(!solution)return null;
  memory.lastAt=now;memory.awaitRelease=true;
  return {throw:true,yaw:solution.yaw,pitch:solution.pitch,reason:`throw-${kind}`,point};
}
