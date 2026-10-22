#!/usr/bin/env node
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import {analyzeExplorationC14,analyzePairedDiagnosticsC14} from '../lab/arena/evaluate-exploration-c14.mjs';
const args=process.argv.slice(2);
if(args.length!==3&&args.length!==5){console.error('Usage: node scripts/analyze-c14-exploration.mjs run.json opportunities.json output.json [treatment-run.json treatment-opportunities.json]');process.exit(2);}
const read=x=>JSON.parse(readFileSync(path.resolve(x),'utf8'));
const result=args.length===3?analyzeExplorationC14(read(args[0]),read(args[1])):
 analyzePairedDiagnosticsC14(read(args[0]),read(args[3]),read(args[1]),read(args[4]));
mkdirSync(path.dirname(path.resolve(args[2])),{recursive:true});writeFileSync(args[2],JSON.stringify(result,null,2)+'\n');
console.log(result.status,result.pairs?`pairs=${result.pairs.length}`:`matches=${result.individualMatches.length}`);
