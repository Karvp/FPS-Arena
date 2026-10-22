#!/usr/bin/env node
// Analyze observed world displacement from FPS Arena replay samples.
// The observations are at the replay sampling cadence (normally 500 ms),
// not every authoritative 60 Hz game tick. A reversal may be legitimate.
import {readFileSync,writeFileSync} from 'node:fs';
export function analyzeMotionReplay(bundle){
  const records=Array.isArray(bundle?.records)?bundle.records:[];
  const episodes=records.map(record=>{
    const s=Array.isArray(record.samples)?record.samples:[];
    let reversals=0,shuttleCandidates=0;
    const reasons={};
    for(let i=2;i<s.length;i++){
      const [a,b,c]=[s[i-2],s[i-1],s[i]];
      const p=a?.p,q=b?.p,r=c?.p;
      if(![p,q,r].every(v=>Array.isArray(v)&&Number.isFinite(v[0])&&Number.isFinite(v[2])))continue;
      const vx=q[0]-p[0],vz=q[2]-p[2],wx=r[0]-q[0],wz=r[2]-q[2];
      const norm=Math.hypot(vx,vz)*Math.hypot(wx,wz);
      if(norm<=.4||(vx*wx+vz*wz)/norm>=-.65)continue;
      reversals++;
      const reason=String(c.decision?.reason||'unspecified');
      reasons[reason]=(reasons[reason]||0)+1;
      if(Number.isFinite(a.t)&&Number.isFinite(c.t)&&c.t-a.t<=1.5 &&
        Math.hypot(r[0]-p[0],r[2]-p[2])<2.2)shuttleCandidates++;
    }
    return {map:record.meta?.map||'unknown',seed:record.meta?.seed??null,
      durationSeconds:s.length?Number(s.at(-1)?.t||0):0,
      samples:s.length,worldReversalsSampled:reversals,
      returnNearPreviousPosition:shuttleCandidates,reasons};
  });
  return {format:'fpsarena-motion-review-v1',definition:'3-point world displacement change: cosine < -0.65, product of two sample-step distances > 0.4 m². Return-near-previous-position is a candidate oscillation, not proof of a bug.',episodes,
    total:{worldReversalsSampled:episodes.reduce((v,e)=>v+e.worldReversalsSampled,0),
      returnNearPreviousPosition:episodes.reduce((v,e)=>v+e.returnNearPreviousPosition,0)}};
}
if(process.argv[1] && import.meta.url===new URL(`file://${process.argv[1]}`).href){
 const [input,output]=process.argv.slice(2);
 if(!input){console.error('Usage: node tools/analyze-motion-replay.mjs <replay.json> [output.json]');process.exitCode=2;}
 else {const data=analyzeMotionReplay(JSON.parse(readFileSync(input,'utf8')));
  if(output)writeFileSync(output,JSON.stringify(data,null,2)+'\n');
  console.log(JSON.stringify(data.total));}
}
