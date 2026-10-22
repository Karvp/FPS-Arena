#!/usr/bin/env python3
"""Offline verification of C23 holdout, frozen preregistration and C22 seed isolation."""
from pathlib import Path
import hashlib,json,sys
root=Path(__file__).resolve().parents[1]
study=root/'reports/c23/holdout18'
old=root/'reports/c22/study18/COMBINED-DATASET.json'
read=lambda p:json.loads(p.read_text())
plan=read(study/'PRE-REGISTERED-PLAN.json')
source_paths=['lab/arena/train-main.mjs','lab/arena/run-pressure-holdout-c23.mjs','lab/arena/evaluate-pressure-holdout-c23.mjs','lab/arena/risk-aware-encounters-c22.mjs','lab/arena/evaluate-risk-aware-c22.mjs','lab/arena/encounter-randomization-c21.mjs','lab/arena/safe-action-explorer-c16.mjs','lab/arena/source-main/server/game.js','page-agent.js']
sha=lambda b:hashlib.sha256(b).hexdigest()
fingerprint=sha('|'.join(sha((root/p).read_bytes()) for p in source_paths).encode())
assert fingerprint==plan['sourceSHA256'],'C23 source drift since preregistration'
p=dict(plan);registration=p.pop('registrationSHA256')
assert sha(json.dumps(p,separators=(',',':')).encode())==registration,'C23 registration tampered'
old_seeds={m['metadata']['seed'] for m in read(old)['matches']}
assert old_seeds.isdisjoint(j['seed'] for j in plan['jobs']),'C22 seed collision'
dataset=read(study/'COMBINED-DATASET.json')
assert len(dataset['matches'])==len(plan['jobs'])==18,'incomplete preregistration'
seen=set()
for job in plan['jobs']:
 assert job['seed'] not in seen,'reused holdout seed';seen.add(job['seed'])
 result_file=study/(job['id']+'.result.json')
 data_file=study/(job['id']+'.dataset.json')
 assert result_file.is_file() and data_file.is_file(),'missing match or labels'
 envelope=read(result_file);sample=read(data_file)
 assert envelope['profile']=='release' and envelope['seconds']==75 and len(envelope['results'])==1
 assert len(sample['matches'])==1
 match=sample['matches'][0];result=envelope['results'][0]
 for a,b in ((match['metadata']['seed'],job['seed']),(match['metadata']['map'],job['map']),
             (match['metadata']['loadout'],job['weapon']),(result['seed'],job['seed']),
             (result['map'],job['map']),(result['primaryLoadout'],job['weapon']),
             (result['errors'],0)):
  assert a==b,'C23 job mismatches preregistered game settings'
 assert sha(json.dumps(match,sort_keys=True).encode()) in {sha(json.dumps(m,sort_keys=True).encode()) for m in dataset['matches']},'dataset row provenance mismatch'
assert len(list(study.glob('*.dataset.json')))==18 and len(list(study.glob('*.result.json')))==18
assert sha((root/'page-agent.js').read_bytes())==sha((Path('/mnt/data/fps-c22-work')/'page-agent.js').read_bytes()),'production bundle unexpectedly changed'
e=read(study/'EVALUATION.json')
assert e['matches']==18 and e['offers']==48 and e['complete']==47 and e['nonzero']==16 and e['incoming']==2
assert not e['trainingGate']['passes']
assert e['registrationSHA256']==registration
print(json.dumps({'status':'PASS','registered':len(seen),'C22C23SeedsDisjoint':True,
 'sourceFingerprint':fingerprint,'registrationSHA256':registration,'offers':e['offers'],
 'complete':e['complete'],'incoming':e['incoming'],'trainedNewNeuralPolicy':False},indent=2))
