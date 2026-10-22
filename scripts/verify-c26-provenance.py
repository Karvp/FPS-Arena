#!/usr/bin/env python3
"""Independent fingerprint, jobs, result+dataset provenance verifier for frozen C26."""
import hashlib, json, pathlib, sys
ROOT = pathlib.Path(__file__).resolve().parent.parent
BASE = ROOT / 'reports/c26/study18'
DEV = ROOT / 'reports/c25/study24'
read = lambda f: json.loads(pathlib.Path(f).read_text(encoding='utf-8'))
compact = lambda x: json.dumps(x, ensure_ascii=False, separators=(',', ':')).encode()
sha = lambda b: hashlib.sha256(b).hexdigest()
p = read(BASE/'PRE-REGISTERED-PLAN.json')
dev = read(DEV/'COMBINED-DATASET.json')
dplan = read(DEV/'PRE-REGISTERED-PLAN.json')
dplan_hash = dplan['registrationSHA256']
assert p['developmentRegistrationSHA256'] == dplan_hash, 'development plan fingerprint'
assert p['developmentDatasetSHA256'] == sha(compact(dev)), 'development dataset fingerprint'
assert p['registrationSHA256'] == sha(compact({k:v for k,v in p.items() if k != 'registrationSHA256'})), 'plan signature'
paths = ['lab/arena/train-main.mjs','lab/arena/run-temporal-threat-c26.mjs',
         'lab/arena/evaluate-temporal-threat-c26.mjs','lab/arena/threat-calibration-observer-c25.mjs',
         'lab/arena/threat-trace-observer-c24.mjs','lab/arena/source-main/server/game.js','page-agent.js']
assert p['sourceSHA256'] == sha('|'.join(sha((ROOT/r).read_bytes()) for r in paths).encode()), 'source fingerprint changed'
assert len(p['jobs']) == 18
old_seeds = {m['metadata']['seed'] for m in dev['matches']}
seen=set(); matched=[]
for j in p['jobs']:
    a = read(BASE/(j['id']+'.result.json'))
    b = read(BASE/(j['id']+'.dataset.json'))
    assert len(a['results']) == len(b['matches']) == 1
    r=a['results'][0];m=b['matches'][0];z=m['metadata']
    assert j['seed'] not in old_seeds and j['seed'] not in seen, 'seed reuse'
    seen.add(j['seed'])
    assert r['seed']==z['seed']==j['seed']
    assert r['map']==z['map']==j['map']
    assert r['primaryLoadout']==z['loadout']==j['weapon']
    assert z['snapshotLagMs']==j['lagMs'] and r['errors']==0
    assert z['seconds']==a['seconds']==p['seconds']
    assert z['profile']=='release' and z['observerOnly'] is True and z['productionActuation'] is False
    matched.append(m)
all_data = read(BASE/'COMBINED-DATASET.json')
assert matched==all_data['matches'], 'combined data does not match independent raw files'
ev = read(BASE/'EVALUATION.json')
assert ev['registeredPlanSHA256']==p['registrationSHA256']
assert ev['data']['holdout']['matches']==18
assert ev['data']['holdout']['complete']==sum(w['complete'] for m in matched for w in m['windows'])
assert ev['data']['holdout']['positive']==sum(w['complete'] and w['label']['hostileWeaponHitEvents']>0 for m in matched for w in m['windows'])
assert ev['data']['excludedPreviouslySeenC25TestMatches']==6
checks={'valid':True,'jobs':18,'newUniqueSeeds':len(seen),'developmentMatches':len(dev['matches']),
        'holdoutWindows':ev['data']['holdout']['complete'],'holdoutPositive':ev['data']['holdout']['positive'],
        'latenciesMs':sorted({j['lagMs'] for j in p['jobs']}),'sourceSHA256':p['sourceSHA256'],
        'registrationSHA256':p['registrationSHA256'],'baselineBrier':ev['newSeedHoldout']['constant']['brier'],
        'selectedBrier':ev['newSeedHoldout']['selected']['brier']}
(BASE/'PROVENANCE-VERIFICATION.json').write_text(json.dumps(checks,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(checks,indent=2))
