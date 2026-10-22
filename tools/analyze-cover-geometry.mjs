#!/usr/bin/env node
// Offline diagnostics only: uses the bundled authoritative map AABBs and
// recorded 0.5s poses. "Open ground" is geometric proximity, NOT proof of
// enemy visibility or an unjustified direction reversal.
import {readFileSync,writeFileSync} from 'node:fs';
import {MAPS} from '../lab/arena/source/maps/index.js';
export function analyzeCoverGeometry(bundle,{openThreshold=3}={}){
 const episodes=[];
 for(const r of bundle?.records||[]){
  const map=MAPS[r.meta?.map],boxes=map?.boxes||[],samples=r.samples||[];
  let reversals=0,open=0,returnLoops=0,openLoops=0;
  const byReason={},reasonTransitions={},examples=[];
  for(let i=2;i<samples.length;i++){
   const [a,b,c]=samples.slice(i-2,i+1),p=a?.p,q=b?.p,t=c?.p;
   if(![p,q,t].every(v=>Array.isArray(v)&&v.length>=3&&v.every(Number.isFinite)))continue;
   const v=[q[0]-p[0],q[2]-p[2]],w=[t[0]-q[0],t[2]-q[2]];
   const norm=Math.hypot(...v)*Math.hypot(...w);
   if(norm<=.4 || (v[0]*w[0]+v[1]*w[1])/norm>=-.65)continue;
   const reason=String(c?.decision?.reason||'unknown');
   const prevReason=String(b?.decision?.reason||'unknown');
   byReason[reason]=(byReason[reason]||0)+1;
   const transition=`${prevReason} -> ${reason}`;
   reasonTransitions[transition]=(reasonTransitions[transition]||0)+1;
   const y=t[1];let distance=Infinity;
   for(const box of boxes){
    if(box.y1<=y+.3||box.y0>=y+1.7)continue;
    const dx=Math.max(box.x0-t[0],0,t[0]-box.x1);
    const dz=Math.max(box.z0-t[2],0,t[2]-box.z1);
    distance=Math.min(distance,Math.hypot(dx,dz));
   }
   reversals++;
   const isOpen=Number.isFinite(distance)&&distance>openThreshold;
   if(isOpen)open++;
   const returns=Number.isFinite(a?.t)&&Number.isFinite(c?.t)&&c.t-a.t<=1.5&&Math.hypot(t[0]-p[0],t[2]-p[2])<2.2;
   if(returns){returnLoops++;if(isOpen)openLoops++;}
   if(examples.length<50)examples.push({t:c.t,position:t,reason,previousReason:prevReason,nearestObstacleMeters:Number.isFinite(distance)?+distance.toFixed(2):null,open:isOpen,returnsNearPrior:returns});
  }
  episodes.push({map:r.meta?.map||'unknown',seed:r.meta?.seed??null,durationSeconds:samples.at(-1)?.t??0,samples:samples.length,
   reversals,openGroundReversals:open,nearbyReturnLoops:returnLoops,openGroundReturnLoops:openLoops,
   byReason,topTransitions:Object.entries(reasonTransitions).sort((a,b)=>b[1]-a[1]).slice(0,15),examples});
 }
 const sum=k=>episodes.reduce((v,e)=>v+e[k],0);
 return {format:'fpsarena-cover-geometry-review-v1',definition:'Three-sample reversal: cosine < -0.65 and displacement product > 0.4m²; open ground = >3m from nearest height-overlapping static collision AABB. 0.5s replay may alias faster motion. Not a bullet-LOS or useless-reversal label.',openThreshold,episodes,
 total:{reversals:sum('reversals'),openGroundReversals:sum('openGroundReversals'),nearbyReturnLoops:sum('nearbyReturnLoops'),openGroundReturnLoops:sum('openGroundReturnLoops')}};
}
if(process.argv[1] && import.meta.url===new URL(`file://${process.argv[1]}`).href){
 const [input,output]=process.argv.slice(2);if(!input){console.error('Usage: node tools/analyze-cover-geometry.mjs <replay.json> [out.json]');process.exitCode=2;}
 else{const result=analyzeCoverGeometry(JSON.parse(readFileSync(input,'utf8')));if(output)writeFileSync(output,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result.total));}
}
