// Synthetic geometry sensitivity: NOT live PvP accuracy or a hit-rate estimate.
// Render pose trails authoritative snapshots by ~100ms; server future pose
// is measured at a hypothetical input arrival 65ms later.
import {remoteVelocity,predictedPoint} from '../combat-core.mjs';
const dt=1/30,pred=.065,lag=.1,at=3.0;
const cases=[{name:'normal glide',vy:-15},{name:'fast dive',vy:-34},{name:'slow glide',vy:-7}];
const results=cases.map(({name,vy})=>{
 const y=t=>180+vy*t;
 const r={data:{air:1},pos:{x:0,y:y(at-lag),z:-145},
  buf:[{t:at-2*dt,x:0,y:y(at-2*dt),z:-145},{t:at-dt,x:0,y:y(at-dt),z:-145}]};
 const observed=r.buf.at(-1),speed=remoteVelocity(r);
 // Historical 2.8.1 discarded >24 m/s and led from the delayed render pose.
 const oldSpeed=Math.abs(vy)>24?0:vy;
 const oldAim=r.pos.y+oldSpeed*pred;
 const nextAim=predictedPoint({x:0,y:observed.y,z:-145},r,pred).y;
 const actual=y(at+pred);
 return {scenario:name,fallSpeed:Math.abs(vy),legacyVerticalErrorM:+Math.abs(oldAim-actual).toFixed(3),
   updatedVerticalErrorM:+Math.abs(nextAim-actual).toFixed(3),
   legacyAngularErrorDeg:+(Math.abs(Math.atan2(oldAim-1.6,145)-Math.atan2(actual-1.6,145))*180/Math.PI).toFixed(3),
   updatedAngularErrorDeg:+(Math.abs(Math.atan2(nextAim-1.6,145)-Math.atan2(actual-1.6,145))*180/Math.PI).toFixed(3),
   chosenVelocity:Math.round(speed.y)};
});
console.log(JSON.stringify({testType:'synthetic-uniform-fall',targetHorizonMs:65,renderDelayMs:100,snapshotPeriodMs:1000/30,results},null,2));
