import {readFileSync,writeFileSync} from 'node:fs';
import {compareC16Replay,reviewRandomizedC16} from '../lab/arena/evaluate-optimized-exploration-c16.mjs';
const src=process.argv[2]||'reports/c16/study/study-index.json';
const dst=process.argv[3]||'reports/c16/study/analysis.json';
const data=JSON.parse(readFileSync(src,'utf8'));
if(data.errors?.length)throw Error('Incomplete study: cannot assess missing episodes');
const replay=compareC16Replay(data.completed.filter(x=>x.cohort==='pair'));
if(!replay.gameplayAndOffersIdentical)throw Error('C16 parity FAILED');
const random=reviewRandomizedC16(data.completed.filter(x=>x.cohort==='randomized'));
const out={schema:'fpsarena-c16-evaluation-v1',sourceIndex:src,replay,randomized:random,
 decision:{productionPromotion:false,neuralPolicyTraining:false,
  rationale:'C16 optimizes scan cost while preserving C15 behavior; random holdout does not prove combat benefit; observe independent match-level assignment'} };
writeFileSync(dst,JSON.stringify(out,null,2)+'\n');
console.log(JSON.stringify({replay:{status:replay.status,arms:replay.pairedReplayArms,
   offers:replay.eligibleOffers,probes:replay.probeAttempts,geometrySkips:replay.skippedGeometryEvaluations,
   c15TotalMs:replay.c15CommandTotalMs,c16TotalMs:replay.c16CommandTotalMs,
   speedup:replay.speedupOfExplorerOnly},
 randomized:{status:random.status,reasons:random.reasonCodes,control:random.control,treatment:random.treatment},
 decision:out.decision},null,2));
