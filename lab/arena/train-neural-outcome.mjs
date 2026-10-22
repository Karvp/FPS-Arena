#!/usr/bin/env node
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {trainNeuralShotPredictor} from './neural-outcome-research.mjs';
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 const [, ,input,output]=process.argv;
 if(!input||!output){console.error('Usage: node lab/arena/train-neural-outcome.mjs trajectories.ndjson report.json');process.exit(2);}
 const rows=readFileSync(input,'utf8').split(/\r?\n/).filter(Boolean).map(line=>JSON.parse(line));
 const result=trainNeuralShotPredictor(rows);
 mkdirSync(path.dirname(path.resolve(output)),{recursive:true});writeFileSync(output,JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify({status:result.status,readiness:result.readiness,evaluation:result.evaluation??null},null,2));
 if(result.status!=='research-only')process.exitCode=3;
}
