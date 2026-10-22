#!/usr/bin/env node
// Analyze *existing* C18 match artifacts without rerunning any combat simulation.
// Useful for independent reproduction and detection of missing/tampered records.
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {analyzeLongHorizonC18} from './long-horizon-study-c18.mjs';
const dir=path.resolve(process.argv[2]||'reports/c18/study');
const load=name=>JSON.parse(readFileSync(path.join(dir,name),'utf8'));
const plan=load('PRE-REGISTERED-PLAN.json'),rows=load('STUDY-ROWS.json'),previous=load('ANALYSIS.json');
const analysis=analyzeLongHorizonC18(plan,rows,{bootstrapReplicates:previous.bootstrapReplicates});
if(JSON.stringify(analysis)!==JSON.stringify(previous))throw Error('C18 preregistered analysis mismatch');
for(const job of plan.jobs){
 const result=load(job.id+'.result.json').results?.[0],
       obs=load(job.id+'.dataset.json').matches?.[0];
 const row=rows.find(r=>r.jobId===job.id);
 if(!row||JSON.stringify(result)!==JSON.stringify(row.result)||
    JSON.stringify(obs)!==JSON.stringify(row.observation))
   throw Error('C18 evidence differs from serialized study row: '+job.id);
}
console.log('C18 verification PASSED:',rows.length,'matches,',analysis.completeBlocks,
 'blocks, SHA256 preregistration',analysis.preregistrationSHA256);
