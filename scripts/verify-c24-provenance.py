#!/usr/bin/env python3
"""Independent C24 audit for source registration, result/dataset pairs, seed isolation.
Only verification, no match execution; deliberately separate from Node evaluator.
"""
import hashlib
import json
from pathlib import Path
from collections import Counter

ROOT = Path(__file__).resolve().parents[1]
STUDY = ROOT / 'reports/c24/study18'
SOURCE_PATHS = [
    'lab/arena/train-main.mjs',
    'lab/arena/run-threat-study-c24.mjs',
    'lab/arena/evaluate-threat-cues-c24.mjs',
    'lab/arena/threat-trace-observer-c24.mjs',
    'lab/arena/risk-aware-encounters-c22.mjs',
    'lab/arena/evaluate-risk-aware-c22.mjs',
    'lab/arena/encounter-randomization-c21.mjs',
    'lab/arena/safe-action-explorer-c16.mjs',
    'lab/arena/source-main/server/game.js',
    'page-agent.js',
]

def h(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()

def load(p: Path):
    with p.open(encoding='utf-8') as f:
        return json.load(f)

def demand(ok, message):
    if not ok:
        raise ValueError('C24 independent audit failed: ' + message)

plan = load(STUDY / 'PRE-REGISTERED-PLAN.json')
unsigned = {k: v for k, v in plan.items() if k != 'registrationSHA256'}
asserted_hash = h(json.dumps(unsigned, ensure_ascii=False, separators=(',', ':')).encode('utf-8'))
demand(plan['registrationSHA256'] == asserted_hash, 'registration SHA mismatch')
src = '|'.join(h((ROOT / p).read_bytes()) for p in SOURCE_PATHS)
demand(plan['sourceSHA256'] == h(src.encode()), 'source fingerprint differs from preregistered source')

study = load(STUDY / 'COMBINED-DATASET.json')
evaluation = load(STUDY / 'EVALUATION.json')
demand(study['schema'] == 'fpsarena-c24-threat-dataset-v1', 'dataset schema')
demand(evaluation['registrationSHA256'] == plan['registrationSHA256'], 'evaluation not tied to plan')
demand(len(plan['jobs']) == len(study['matches']) == evaluation['matches'], 'job/match count')
demand(len(set(j['id'] for j in plan['jobs'])) == len(plan['jobs']), 'duplicate job ID')
seeds = [j['seed'] for j in plan['jobs']]
demand(len(set(seeds)) == len(seeds), 'reused seed inside C24')

previous = {}
for cohort in ('c22/study18', 'c23/holdout18'):
    p = ROOT / 'reports' / cohort / 'COMBINED-DATASET.json'
    if p.exists():
        previous[cohort] = {m['metadata']['seed'] for m in load(p)['matches']}
        demand(not set(seeds) & previous[cohort], 'reused seed from prior cohort ' + cohort)

for index, job in enumerate(plan['jobs']):
    result = load(STUDY / (job['id'] + '.result.json'))
    dataset = load(STUDY / (job['id'] + '.dataset.json'))
    demand(len(result['results']) == len(dataset['matches']) == 1, 'episode count ' + job['id'])
    r = result['results'][0]
    m = dataset['matches'][0]
    demand(r['seed'] == m['metadata']['seed'] == job['seed'], 'seed mismatch ' + job['id'])
    demand(r['map'] == m['metadata']['map'] == job['map'], 'map mismatch ' + job['id'])
    demand(r['primaryLoadout'] == m['metadata']['loadout'] == job['weapon'], 'weapon mismatch ' + job['id'])
    demand(r['errors'] == 0 and r['mode'] == 'tdm', 'error or wrong mode ' + job['id'])
    demand(result['seconds'] == plan['seconds'] and result['profile'] == plan['profile'], 'condition mismatch ' + job['id'])
    demand(study['matches'][index] == m, 'combined dataset changed ' + job['id'])
    demand(m['metadata']['threatLabelsAfterAssignmentOnly'] is True and m['metadata']['productionActuation'] is False,
           'provenance mismatch ' + job['id'])
    for offer in m['offers']:
        demand(offer['publicCueBeforeAction']['cueDefinition'].startswith('delivered public'),
               'invalid public cue provenance ' + job['id'])
        demand(offer['threatOutcome']['validity'].startswith('AFTER action'),
               'server label in preaction cue ' + job['id'])

agent_hash = h((ROOT / 'page-agent.js').read_bytes())
prior_agent_hash = h((Path('/mnt/data/fps-c23-work') / 'page-agent.js').read_bytes())
demand(agent_hash == prior_agent_hash, 'production page-agent.js changed')
replay = load(ROOT / 'reports/c24/parity-check.json')
demand(replay['validNoPerturbation'] is True, 'instrumentation perturbation')

out = {
    'schema': 'fpsarena-c24-independent-provenance-v1',
    'matchesVerified': len(plan['jobs']),
    'matchedResultDatasetPairs': len(plan['jobs']),
    'matchedCombinedEntries': len(plan['jobs']),
    'registrationSHA256': plan['registrationSHA256'],
    'sourceSHA256': plan['sourceSHA256'],
    'newSeedsVersus': {k: len(v) for k, v in previous.items()},
    'productionPageAgentSHA256': agent_hash,
    'unchangedProductionAgent': True,
    'controlParityFields': replay['fieldsCompared'],
    'controlParityMatched': replay['validNoPerturbation'],
    'passed': True,
}
(STUDY / 'PROVENANCE-VERIFICATION.json').write_text(json.dumps(out, indent=2) + '\n', encoding='utf-8')
print(json.dumps(out, indent=2))
