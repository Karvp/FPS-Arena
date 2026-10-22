#!/usr/bin/env node
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import {trainEncounterPolicyC13} from '../lab/arena/encounter-policy-learner-c13.mjs';
const files=[],ix=process.argv.indexOf('--out');
if(ix<0||!process.argv[ix+1])throw Error('Usage: train-c13-encounter-policy.mjs dataset.json [...more] --out result.json');
for(let i=2;i<ix;i++)files.push(process.argv[i]);
if(!files.length)throw Error('Missing dataset');
const matches=[];for(const file of files){const d=JSON.parse(readFileSync(file,'utf8'));
 if(d.schema!=='fpsarena-c13-encounter-dataset-v1'||!Array.isArray(d.matches))throw Error('Invalid C13 dataset '+file);
 matches.push(...d.matches);
}
const result=trainEncounterPolicyC13({matches}),dst=path.resolve(process.argv[ix+1]);
mkdirSync(path.dirname(dst),{recursive:true});writeFileSync(dst,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({status:result.status,summary:result.summary,holdout:result.holdout,majorityBaseline:result.majorityBaseline},null,2));
