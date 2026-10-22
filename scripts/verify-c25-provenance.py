#!/usr/bin/env python3
"""Independently verify a frozen C25 registered 24-match source and data plan."""
import hashlib, json
from pathlib import Path
BASE=Path(__file__).resolve().parents[1]
P=BASE/'reports/c25/study24'
load=lambda p:json.loads(p.read_text())
sha=lambda b:hashlib.sha256(b).hexdigest()
plan=load(P/'PRE-REGISTERED-PLAN.json')
unsigned={k:v for k,v in plan.items() if k!='registrationSHA256'}
assert sha(json.dumps(unsigned,separators=(',',':'),ensure_ascii=False).encode())==plan['registrationSHA256'],'plan hash mismatch'
paths=['lab/arena/train-main.mjs','lab/arena/run-threat-calibration-c25.mjs','lab/arena/evaluate-threat-calibration-c25.mjs','lab/arena/threat-calibration-observer-c25.mjs','lab/arena/threat-trace-observer-c24.mjs','lab/arena/source-main/server/game.js','page-agent.js']
source_hash=sha('|'.join(sha((BASE/p).read_bytes()) for p in paths).encode())
assert source_hash==plan['sourceSHA256'],'source hash mismatch'
dataset=load(P/'COMBINED-DATASET.json')
assert len(plan['jobs'])==len(dataset['matches'])==24
assert len({j['seed'] for j in plan['jobs']})==24
assert {j['split'] for j in plan['jobs']}=={'train','validation','test'}
records={f"{m['metadata']['map']}/{m['metadata']['loadout']}/{m['metadata']['seed']}":m for m in dataset['matches']}
results=[]
for j in plan['jobs']:
 key=f"{j['map']}/{j['weapon']}/{j['seed']}"
 single=load(P/(j['id']+'.dataset.json'))['matches'][0]
 r=load(P/(j['id']+'.result.json'))
 assert records[key]==single,'combined dataset mismatch '+j['id']
 assert r['results'][0]['seed']==j['seed'] and r['results'][0]['map']==j['map'] and r['results'][0]['primaryLoadout']==j['weapon'] and r['results'][0]['errors']==0
 assert r['profile']=='release' and r['seconds']==plan['seconds'] and not r['fullMatch']
 results.append({'id':j['id'],'seed':j['seed'],'split':j['split'],'windows':sum(w['complete'] for w in single['windows']),
                 'positive':sum(w['complete'] and w['label']['hostileWeaponHitEvents']>0 for w in single['windows'])})
ev=load(P/'EVALUATION.json')
assert ev['data']['matches']==24 and ev['data']['complete']==sum(r['windows'] for r in results)
assert ev['data']['positive']==sum(r['positive'] for r in results)
assert ev['registeredPlanSHA256']==plan['registrationSHA256']
out={'schema':'fpsarena-c25-independent-provenance-v1','passed':True,'registeredJobs':24,'sourceSHA256':source_hash,
 'registrationSHA256':plan['registrationSHA256'],'completeWindows':ev['data']['complete'],'positiveWindows':ev['data']['positive'],
 'trainMatches':sum(r['split']=='train' for r in results),'validationMatches':sum(r['split']=='validation' for r in results),'testMatches':sum(r['split']=='test' for r in results),
 'productionPageAgentSHA256':sha((BASE/'page-agent.js').read_bytes())}
(P/'PROVENANCE-VERIFICATION.json').write_text(json.dumps(out,indent=2)+'\n')
print(json.dumps(out,indent=2))
