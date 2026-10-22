#!/usr/bin/env node
// No statistical promotion from short or forced-arm experiments.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {analyzeProbeSchedulingC15,auditRandomizedC15} from '../lab/arena/evaluate-probe-scheduler-c15.mjs';
import {analyzePairedDiagnosticsC14} from '../lab/arena/evaluate-exploration-c14.mjs';
const input=process.argv[2]||'reports/c15/study/study-index.json';
const output=process.argv[3]||'reports/c15/study/analysis.json';
const index=JSON.parse(readFileSync(input,'utf8'));
if(index.errors?.length)throw Error('incomplete study; no evaluation');
const paired=index.completed.filter(r=>r.cohort==='paired'),random=index.completed.filter(r=>r.cohort==='randomized'),diagnostic=index.completed.filter(r=>r.cohort==='diagnostic');
const unpack=items=>[{results:items.map(x=>x.result)},{matches:items.map(x=>x.observation)}];
const [cr,cd]=unpack(paired.filter(x=>x.variant==='c14'));
const [tr,td]=unpack(paired.filter(x=>x.variant==='c15'));
const [rr,rd]=unpack(random);
const controlled=analyzeProbeSchedulingC15(cr,cd,tr,td);
const randomized=auditRandomizedC15(rr,rd);
const [dr,dd]=unpack(diagnostic);
const forcedDiagnostics=analyzePairedDiagnosticsC14(cr,dr,cd,dd);
const result={schema:'fpsarena-c15-scheduler-analysis-v1',
 summary:'Availability detection under exact control parity; no evidence of improved combat',
 pairedControl:controlled,randomized,forcedDiagnostics,decision:{neuralPolicyTraining:false,productionPromotion:false,
   limitation:'Randomized unit is match; exposed independent episodes too few, no causal per-offer labels'}};
writeFileSync(output,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({pairedScenarios:controlled.independentScenarios,
 c14Offers:controlled.c14Offers,c15Offers:controlled.c15Offers,delta:controlled.deltaOffers,
 gameParity:controlled.gameplayParity,c15Probes:controlled.c15ProbeAttempts,
 randomized:randomized.status,randomReasons:randomized.reasonCodes,
 forcedImproved:forcedDiagnostics.improved,forcedHarmed:forcedDiagnostics.harmed,
 forcedUnchanged:forcedDiagnostics.unchanged,forcedExposed:forcedDiagnostics.exposedPairs,
 randomControl:randomized.control,randomTreatment:randomized.treatment},null,2));
