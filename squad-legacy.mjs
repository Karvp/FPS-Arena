// Low-risk teammate crossfire positioning for FPS Arena PvP modes.
// Uses ONLY rendered teammates in the snapshot, never their hidden ammunition
// or opponents' unpublished state. Never overrides ring, dodge, loot, or reload.
export function squadFlankLegacy(game,target,helpers,now=0,memory={}) {
 const mode=game?.modeState?.type;
 if(!['tdm','snd','hp','br'].includes(mode)||!target?.visible || !game?.local?.mv || !target.point)return null;
 const own=game.you?.tm;
 if(!Number.isInteger(own))return null;
 const {x,y,z}=game.local.mv;
 const enemy=target.remote?.pos||target.point;
 const dx=enemy.x-x,dz=enemy.z-z,dist=Math.hypot(dx,dz);
 if(dist<17||dist>65||game.local.ws?.reloading)return null;
 const allies=(game.remotes?.list||[]).filter(r=>r?.alive&&r.team===own&&r.id!==game.net?.id&&r.pos&&r.data?.aim);
 let ally=null,best=Infinity;
 for(const r of allies){
   const ad=Math.hypot(r.pos.x-x,r.pos.z-z),ted=Math.hypot(r.pos.x-enemy.x,r.pos.z-enemy.z);
   if(ad<4||ad>26||ted>80)continue;
   const fy=-Math.sin(r.yaw||0),fz=-Math.cos(r.yaw||0),edx=enemy.x-r.pos.x,edz=enemy.z-r.pos.z,ed=Math.hypot(edx,edz);
   if(ed<.001||(fy*edx+fz*edz)/ed<.75)continue; // teammate is firing at THIS lane
   if(ad<best){ally=r;best=ad;}
 }
 if(!ally)return null;
 const fx=dx/dist,fz=dz/dist,sideX=-fz,sideZ=fx;
 const allySide=(ally.pos.x-enemy.x)*sideX+(ally.pos.z-enemy.z)*sideZ;
 const opposite=allySide>=0?-1:1;
 if(memory.target!==target.id || now>memory.until){memory.target=target.id;memory.side=opposite;memory.until=now+1.8;}
 const side=memory.side||opposite;
 const forward=dist>29?.35:0;
 const xdir=side*sideX+forward*fx,zdir=side*sideZ+forward*fz;
 if(typeof helpers?.rayWorld!=='function')return null;
 const len=Math.hypot(xdir,zdir)||1,ux=xdir/len,uz=zdir/len;
 // Probe a short path with game geometry, no direct LOS teleport.
 const from=[x,(Number.isFinite(y)?y:0)+.9,z];
 const safe=helpers.rayWorld(from,[ux,0,uz],game.map?.boxes||[],2.1);
 if(safe<1.6)return null;
 return {x:ux,z:uz,reason:'squad-crossfire',sprint:false};
}
