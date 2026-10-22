// C9 — public-state, deterministic ballistic envelope for headless Tactical Director.
// Geometry follows fps-arena-main/shared/geometry.js spreadDir + rayAABB/raySphere
// and server/combat.js hit arbitration, without reading server-only positions/seed.
// This is a conditional static-target estimate, NOT a calibrated hit probability
// for moving enemies in a live match (no recoil, occlusion, interpolation or buffs).
const ebFinite=Number.isFinite;
const ebClamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const ebPI=Math.PI;
const ebBODY_H=[1.4,.95,.5], ebHEAD_Y=[1.62,1.15,.55];
function ebAabb(o,d,lo,hi,max=Infinity){
 let mn=0,mx=max;
 for(let k=0;k<3;k++){
  if(Math.abs(d[k])<1e-9){if(o[k]<lo[k]||o[k]>hi[k])return Infinity;continue;}
  let a=(lo[k]-o[k])/d[k],b=(hi[k]-o[k])/d[k];
  if(a>b)[a,b]=[b,a];mn=Math.max(mn,a);mx=Math.min(mx,b);
  if(mn>mx)return Infinity;
 }
 return mn;
}
function ebSphere(o,d,c,r,max=Infinity){
 const m=c.map((v,i)=>o[i]-v);
 const b=m.reduce((s,v,i)=>s+v*d[i],0),q=m.reduce((s,v)=>s+v*v,0)-r*r;
 if(q>0&&b>0)return Infinity;
 const disc=b*b-q;
 if(disc<0)return Infinity;
 const t=Math.max(0,-b-Math.sqrt(disc));return t<=max?t:Infinity;
}
function ebDamageAt(w,dist){
 const [lo,hi]=w.dmg,[r0,r1]=w.range;
 return dist<=r0?lo:dist>=r1?hi:lo+(hi-lo)*(dist-r0)/(r1-r0);
}
export function validBallisticWeapon(w){
 return !!(w&&w.melee!==true&&w.laser!==true&&!w.unarmed&&
  Array.isArray(w.dmg)&&w.dmg.length===2&&w.dmg.every(x=>ebFinite(x)&&x>=0&&x<=10000)&&w.dmg[0]>0&&
  Array.isArray(w.range)&&w.range.length===2&&w.range.every(x=>ebFinite(x)&&x>=0&&x<=2000)&&w.range[1]>w.range[0]&&
  ebFinite(w.maxRange)&&w.maxRange>0&&w.maxRange<=2000&&
  ebFinite(w.spreadAds)&&w.spreadAds>=0&&w.spreadAds<=40&&
  ebFinite(w.spreadHip)&&w.spreadHip>=0&&w.spreadHip<=45&&
  Number.isInteger(w.pellets)&&w.pellets>=1&&w.pellets<=32&&
  ebFinite(w.headMul)&&w.headMul>=1&&w.headMul<=150&&
  ebFinite(w.interval)&&w.interval>=.015&&w.interval<=10);
}
/** Simulates a fixed low-discrepancy disk of shot directions through engine-style
 * boxes and head spheres. Origin/target translated/rotated into a +Z aim frame;
 * real game geometry is NOT queried. Exact spreadDir cone and test priority.
 * Samples: 16..96, default 48. No RNG or shared mutable state.
 */
export function estimateEngagementBallistics(w,distance,opts={}){
 if(!validBallisticWeapon(w)||!ebFinite(distance)||distance<.1||distance>2000)return null;
 const count=Number.isInteger(opts.samples)?ebClamp(opts.samples,16,96):48;
 // C10 motion perturbation is applied to the target hit geometry, not the sight
 // direction. A centred shot against a displaced target is intentionally harder.
 // Non-finite offsets fail closed; no unbounded world/private target state.
 const lateral=opts.targetOffsetX??0,longitudinal=opts.targetOffsetZ??0;
 if(!ebFinite(lateral)||!ebFinite(longitudinal)||
    Math.abs(lateral)>12||Math.abs(longitudinal)>12)return null;
 const stance=Number.isInteger(opts.stance)?ebClamp(opts.stance,0,2):0;
 const bh=ebBODY_H[stance],hy=ebHEAD_Y[stance],hw=stance===2?.55:.36;
 const shooterStance=Number.isInteger(opts.shooterStance)?ebClamp(opts.shooterStance,0,2):0;
 const eye=[1.6,1.1,.5][shooterStance],origin=[0,eye,0];
 const aim=opts.aim!==false,onGround=opts.onGround!==false;
 const spreadDeg=(aim?w.spreadAds:w.spreadHip)*(onGround?1:1.6);
 const aimPoint=opts.aimPoint==='head'?'head':'torso';
 const spread=Math.tan(spreadDeg*ebPI/180),cy=aimPoint==='head'?hy:bh*.60;
 const centre=[0,cy,-distance];
 const u=[centre[0],centre[1]-eye,centre[2]];
 const len=Math.hypot(...u),dir=u.map(x=>x/len);
 // yaw=0 points -Z; engine rightVec(0)=(1,0,0), up=right x dir.
 const right=[1,0,0],up=[0,-dir[2],dir[1]];
 const lo=[lateral-hw,0,-distance+longitudinal-hw],hi=[lateral+hw,bh,-distance+longitudinal+hw];
 let hits=0,heads=0,total=0;
 for(let i=0;i<count;i++){
  // Stratification in equal-area disk, angular golden step, deterministic.
  const rad=Math.sqrt((i+.5)/count)*spread;
  const a=2.399963229728653*i;
  const ca=Math.cos(a)*rad,sa=Math.sin(a)*rad;
  const d0=dir.map((v,k)=>v+right[k]*ca+up[k]*sa);
  const n=Math.hypot(...d0),d=d0.map(x=>x/n);
  const body=ebAabb(origin,d,lo,hi,w.maxRange);
  const head=ebSphere(origin,d,[lateral,hy,-distance+longitudinal],.24,w.maxRange);
  let hit=Infinity,isHead=false;
  if(head<Infinity&&head<=body+.2){hit=head;isHead=true;}
  else if(body<Infinity)hit=body;
  if(hit<Infinity){hits++;if(isHead)heads++;total+=ebDamageAt(w,hit)*(isHead?w.headMul:1);}
 }
 const pelletChance=hits/count,headChance=heads/count;
 const expectedDamagePerTrigger=total/count*w.pellets;
 // Uninterrupted rate ONLY, not sustainable DPS: cooldown, reload, magazine,
 // buffs, burst cadence and aim compensation can materially differ.
 const cyclicDamagePerSecond=expectedDamagePerTrigger/w.interval;
 const theoreticalNear=w.dmg[0]*w.pellets*(1+.2*Math.min(2,w.headMul-1));
 return {distance,aim,aimPoint,onGround,stance,shooterStance,samples:count,pellets:w.pellets,
  pelletHitFraction:pelletChance,pelletHeadFraction:headChance,
  expectedDamagePerTrigger,cyclicDamagePerSecond,
  quality:ebClamp(expectedDamagePerTrigger/Math.max(1,theoreticalNear),0,1),
  model:'static-unoccluded-angular-envelope-v1',calibrated:false,
  assumptions:['stationary-standing-or-selected-stance','centre-torso-aim','no-recoil-or-lead',
   'no-world-occlusion','no-latency','no-ability-modifiers']};
}
