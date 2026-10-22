#!/usr/bin/env node
// Review user-exported Match Recorder bundles without modifying/replaying private game state.
import {readFileSync,writeFileSync} from 'node:fs';
const [filename,outfile]=process.argv.slice(2);
if(!filename)throw Error('Usage: node lab/arena/analyze-br-record.mjs <bundle.json> [report.json]');
const src=JSON.parse(readFileSync(filename,'utf8'));
if(src.format!=='fpsarena-record-bundle-v2'||!Array.isArray(src.records))throw Error('Unsupported recorder format');
const runs=[];
for(const r of src.records){if(r?.meta?.mode!=='br')continue;
 const samples=r.samples||[];const reasons={};const types=[];let last=null,changes=0,known=0,outside=0;
 for(const v of samples){
  const reason=v?.decision?.reason||'unknown';reasons[reason]=(reasons[reason]||0)+1;
  const type=reason.includes('ring')?'ring':reason.includes('loot')||reason==='weapon-search'?'loot':null;
  if(type){if(last&&type!==last)changes++;last=type;types.push({t:v.t,type,reason});}
  const ring=v.ring,pos=v.p;
  if(ring && Array.isArray(pos) && [ring.cx,ring.cz,ring.r,pos[0],pos[2]].every(Number.isFinite)){
   known++;if(Math.hypot(pos[0]-ring.cx,pos[2]-ring.cz)>ring.r)outside++;
  }
 }
 runs.push({matchId:r.matchId,map:r.meta.map,durationSeconds:samples.at(-1)?.t??0,
  samples:samples.length,recordedDecisions:types.length,lootRingTransitions:changes,
  outsideRingSamples:outside,observedRingSamples:known,
  ringReasons:Object.entries(reasons).filter(([k])=>k.includes('ring')),
  lootReasons:Object.entries(reasons).filter(([k])=>k.includes('loot')||k==='weapon-search'),
  note:'Decision sampling is sparse (2 Hz), transitions are a lower bound and not causal proof.'});
}
const result={format:'fpsarena-br-record-diagnostics-v1',source:filename,rounds:runs.length,runs};
if(outfile)writeFileSync(outfile,JSON.stringify(result,null,2)+'\n');
else process.stdout.write(JSON.stringify(result,null,2)+'\n');
