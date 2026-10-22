// Conservative opponent fire-pressure inference from observable server shot events.
// No opponent magazine/reserve is sent by the server. Never infer guaranteed empty.
import {opponents} from './aim-core.mjs';
const intelClamp=(x,a,b)=>Math.min(b,Math.max(a,x));
export function observeEnemyShot(state, event, now, catalog={}){
  if(!state || !event?.id || !Number.isFinite(now))return null;
  const gun=catalog[event.w]||{};
  const old=state.get(event.id);
  const changed=old && old.weapon!==event.w;
  const gap=old ? now-old.lastShot : Infinity;
  // A sufficiently long gap can contain a reload; even a short gap may contain
  // unobserved events. Track shot counts as observations, not authoritative ammo.
  const reset=changed || gap>Math.max(2.5,(gun.reload||2.2)+.65) || gap<0;
  const count=reset?1:Math.min(999,(old?.count||0)+1);
  const info={weapon:event.w,count,lastShot:now,firstShot:reset?now:old.firstShot,
    gap,confidence:intelClamp((reset?0.32:(old?.confidence||.32)+.09),.3,.85),
    magSize:gun.magSize||0,reloadSeconds:gun.reload||2.2,interval:gun.interval||.12};
  state.set(event.id,info);return info;
}
export function ammoPressure(info, weapon, now){
  if(!info || !Number.isFinite(now))return {pressure:1,confidence:0,estimatedShots:0,estimate:'unknown'};
  const mag=weapon?.magSize||info.magSize||0,age=now-info.lastShot;
  if(age<0||age>9||!mag)return {pressure:1,confidence:0,estimatedShots:info.count,estimate:'unknown'};
  const possibleReload=age>(weapon?.reload||info.reloadSeconds)+.35;
  if(possibleReload)return {pressure:1,confidence:.1,estimatedShots:info.count,estimate:'may-have-reloaded'};
  const share=intelClamp(info.count/mag,0,1);
  // A low-pressure estimate must NEVER imply a safe path across visible LOS.
  return {pressure:intelClamp(1-.35*share*.65,.77,1.05),confidence:info.confidence*.65,
    estimatedShots:info.count,estimate:share>.8?'magazine-may-be-low':'firing'};
}
export function collectThreatIntel(game,state,now,catalog={}){
  return opponents(game).filter(o=>o.remote?.alive&&!o.remote?.invisible&&o.remote?.pos)
    .map(({id,remote:r})=>{
      const id0=r.id,weapon=catalog[r.data?.w]||{};
      const observed=state?.get(id0);
      // Weapon switch may occur between shot events. Old counts never carry across weapons.
      const ammo=observed?.weapon===r.data?.w ? ammoPressure(observed,weapon,now) : ammoPressure(null,weapon,now);
      const samples=r.buf||[];
      let vx=0,vz=0;
      if(samples.length>1){const a=samples.at(-2),b=samples.at(-1),dt=b.t-a.t;
        if(dt>.008&&dt<.8){vx=(b.x-a.x)/dt;vz=(b.z-a.z)/dt;
          if(Math.hypot(vx,vz)>24){vx=0;vz=0;}}
      }
      return {id,id0,x:r.pos.x,y:r.pos.y,z:r.pos.z,vx,vz,
        yaw:r.yaw||0,pitch:r.data?.pitch,aim:!!r.data?.aim,
        recentFire:!!observed && now-observed.lastShot>=0 && now-observed.lastShot<.58,
        weapon:r.data?.w,weaponCategory:weapon.cat||null,weaponStats:weapon.id?weapon:null,maxRange:weapon.maxRange||null,pressure:ammo.pressure,ammo};
    });
}
