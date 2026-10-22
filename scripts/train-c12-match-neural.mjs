#!/usr/bin/env node
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import {trainMatchShotNeural} from '../lab/arena/match-shot-learner-c12.mjs';
const files=[];let output=null;
for(let i=2;i<process.argv.length;i++){
 if(process.argv[i]==='--out'){output=process.argv[++i];if(!output)throw Error('Missing --out path');}
 else files.push(process.argv[i]);
}
if(!files.length||!output)throw Error('Usage: node scripts/train-c12-match-neural.mjs <dataset.json> [...more datasets] --out <evaluation.json>');
const matches=[];
for(const file of files){const data=JSON.parse(readFileSync(file,'utf8'));
 if(data.schema!=='fpsarena-c12-match-shot-dataset-v1'||!Array.isArray(data.matches))throw Error('Invalid C12 dataset: '+file);
 matches.push(...data.matches);
}
const report=trainMatchShotNeural({matches});
const out=path.resolve(output);mkdirSync(path.dirname(out),{recursive:true});writeFileSync(out,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.status,summary:report.summary,holdout:report.holdout,baseline:report.constantRateBaseline},null,2));
