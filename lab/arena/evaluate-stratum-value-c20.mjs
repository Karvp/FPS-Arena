#!/usr/bin/env node
// Offline research diagnostic from a completed, preregistered matched-seed experiment.
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {analyzeMatchedSeedC20} from './matched-seed-study-c20.mjs';
import {evaluateDiagnosticC20} from './stratum-value-diagnostic-c20.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const dir=path.resolve(process.argv[2]||path.join(root,'reports/c20/study24'));
const plan=JSON.parse(readFileSync(path.join(dir,'PRE-REGISTERED-PLAN.json'),'utf8'));
const rows=JSON.parse(readFileSync(path.join(dir,'STUDY-ROWS.json'),'utf8'));
const verified=analyzeMatchedSeedC20(plan,rows);
const diag=evaluateDiagnosticC20(verified);
writeFileSync(path.join(dir,'NEURAL-DIAGNOSTIC.json'),JSON.stringify(diag,null,2)+'\n');
console.log(JSON.stringify({pairs:diag.pairs,strata:diag.strata,models:diag.models,actionValueModelEligible:diag.actionValueModelEligible}));
