#!/usr/bin/env node
// Analyze paired seed/mode/map/opponent headless tests. Never auto-promote a policy
// based solely on headshots, kills, or one favourable seed.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import path from 'node:path';
const args=process.argv.slice(2);
const get=(k)=>{const i=args.indexOf('--'+k);return i>=0?args[i+1]:null;};
const baseline=get('baseline'),candidate=get('candidate'),out=get('out');
if(!baseline||!candidate)throw Error('Usage: node evaluate-team-flank.mjs --baseline baseline.json --candidate candidate.json [--out comparison.json]');
const a=JSON.parse(readFileSync(baseline,'utf8')),b=JSON.parse(readFileSync(candidate,'utf8'));
if(a.modeSelection.join()!=b.modeSelection.join()||a.classicMaps.join()!=b.classicMaps.join()||a.opponentPolicy!==b.opponentPolicy||a.snapshotLagMs!==b.snapshotLagMs)throw Error('Unpaired test environments');
const idx=new Map(a.results.map(r=>[`${r.mode}/${r.map}/${r.seed}`,r]));
const pairs=[];
for(const r of b.results){const old=idx.get(`${r.mode}/${r.map}/${r.seed}`);if(!old)throw Error('Candidate has unmatched seed');
 const duration=Math.min(Number(r.duration)||0,Number(old.duration)||0);
 if(duration<1)throw Error('Invalid duration');
 pairs.push({seed:r.seed,map:r.map,mode:r.mode,opponents:r.opponentPolicy,baseline:{kills:old.kills,deaths:old.deaths,shots:old.shots,hits:old.hits,accuracy:old.accuracy,crossfireRate:old.crossfireRate,reversals:old.reversals,errors:old.errors},candidate:{kills:r.kills,deaths:r.deaths,shots:r.shots,hits:r.hits,accuracy:r.accuracy,crossfireRate:r.crossfireRate,reversals:r.reversals,errors:r.errors}});
}
if(idx.size!==pairs.length)throw Error('Unmatched baseline episodes');
const sum=(side,k)=>pairs.reduce((x,r)=>x+(Number(r[side][k])||0),0);
const avg=(side,k)=>pairs.reduce((x,r)=>x+(Number(r[side][k])||0),0)/pairs.length;
const accuracy=side=>sum(side,'shots')?100*sum(side,'hits')/sum(side,'shots'):0;
const baseK=sum('baseline','kills'),newK=sum('candidate','kills');
const baseD=sum('baseline','deaths'),newD=sum('candidate','deaths');
const crossBase=avg('baseline','crossfireRate'),crossNew=avg('candidate','crossfireRate');
const wins=pairs.filter(p=>p.candidate.kills>p.baseline.kills).length;
const losses=pairs.filter(p=>p.candidate.kills<p.baseline.kills).length;
const errors=sum('candidate','errors');
const criteria={enoughPairs:pairs.length>=6,positiveKills:newK>=baseK*1.05&&newK>baseK,
  noMoreDeaths:newD<=baseD,accuracyRetained:accuracy('candidate')+2>=accuracy('baseline'),
  crossfireNotWorse:crossNew>=crossBase-2,majoritySeeds:wins>losses,noRuntimeErrors:errors===0};
const result={format:'fpsarena-team-flank-comparison-v1',pairCount:pairs.length,baselinePath:baseline,candidatePath:candidate,
 summary:{baseK,newK,baseD,newD,baseAccuracy:+accuracy('baseline').toFixed(2),candidateAccuracy:+accuracy('candidate').toFixed(2),
  baseCrossfire:+crossBase.toFixed(2),candidateCrossfire:+crossNew.toFixed(2),wins,losses,errors},criteria,
 promote:Object.values(criteria).every(Boolean),pairs};
if(out){mkdirSync(path.dirname(path.resolve(out)),{recursive:true});writeFileSync(out,JSON.stringify(result,null,2)+'\n');}
console.log(JSON.stringify({promote:result.promote,summary:result.summary,criteria},null,2));
