#!/usr/bin/env python3
"""Reproducible C15 headless evaluation, restricted to local authoritative main engine.
Run python scripts/run-c15-study.py --workers 3. Full research-only dataset.
"""
import argparse, concurrent.futures, json, subprocess, time
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'reports/c15/study'
# Fixed before evaluating the C15 data; never choose seeds based on outcomes.
PAIRED=[
    (140404,'arena','mp5sd'),(140413,'foundry','m4a1'),(140422,'neon','aa12'),
    (150101,'arena','mp5sd'),(150102,'foundry','m4a1'),(150103,'neon','aa12'),
    (150104,'arena','hk_sl8'),(150105,'foundry','mp5sd'),(150106,'neon','m4a1'),
    (150107,'arena','aa12'),(150108,'foundry','hk_sl8'),(150109,'neon','mp5sd'),
]
RANDOMIZED=[
    (151201,'arena','mp5sd'),(151202,'foundry','m4a1'),
    (151203,'neon','aa12'),(151204,'arena','hk_sl8'),
    (151205,'foundry','mp5sd'),(151206,'neon','m4a1'),
    (151207,'arena','aa12'),(151208,'foundry','hk_sl8'),
]
def run(entry):
    cohort,variant,seed,mapname,weapon=entry
    prefix=OUT/f'{cohort}-{variant}-{seed}-{mapname}-{weapon}'
    dataset=prefix.with_suffix('.dataset.json')
    report=prefix.with_suffix('.run.json')
    datasetflag='--c14-dataset' if variant=='c14' else '--c15-dataset'
    cmd=['node','lab/arena/train-main.mjs','--profile','release','--seconds','32','--episodes','1',
         '--modes','tdm','--seed',str(seed),'--classic-maps',mapname,
         '--trainee-primary',weapon,'--opponents','stress','--lag-ms','65',
         datasetflag,str(dataset.relative_to(ROOT)),'--out',str(report.relative_to(ROOT))]
    if cohort in ('paired','diagnostic'):
        cmd+=['--c14-force-arm','control' if cohort=='paired' else 'treatment']
    started=time.monotonic()
    if not (dataset.is_file() and report.is_file()):
        x=subprocess.run(cmd,cwd=ROOT,text=True,capture_output=True,timeout=100)
        if x.returncode:raise RuntimeError(f'{entry}: {x.stdout[-500:]} {x.stderr[-2000:]}')
    result=json.loads(report.read_text());observations=json.loads(dataset.read_text())
    if len(result['results'])!=1 or len(observations['matches'])!=1:raise ValueError('incomplete data')
    return {'cohort':cohort,'variant':variant,'seed':seed,'map':mapname,'weapon':weapon,
            'secondsElapsed':round(time.monotonic()-started,3),'result':result['results'][0],
            'observation':observations['matches'][0]}
def main():
    parser=argparse.ArgumentParser();parser.add_argument('--workers',type=int,default=3);parser.add_argument('--quick',action='store_true');a=parser.parse_args()
    OUT.mkdir(parents=True,exist_ok=True)
    pairs=PAIRED[:4] if a.quick else PAIRED
    randoms=RANDOMIZED[:4] if a.quick else RANDOMIZED
    work=[('paired',arm,*scenario) for scenario in pairs for arm in ('c14','c15')]
    work += [('randomized','c15',*scenario) for scenario in randoms]
    work += [('diagnostic','c15',*scenario) for scenario in pairs]
    rows=[];errors=[]
    with concurrent.futures.ThreadPoolExecutor(max_workers=a.workers) as pool:
        tasks={pool.submit(run,e):e for e in work}
        for f in concurrent.futures.as_completed(tasks):
            try:
                row=f.result();rows.append(row)
                d=row['observation']['diagnostics'];r=row['result']
                print(f"{row['cohort']} {row['variant']} seed={row['seed']} {row['weapon']} offers={d['recordedOffers']} kill={r['kills']} err={r['errors']}",flush=True)
            except Exception as e:errors.append({'scenario':tasks[f],'error':str(e)});print(str(e),flush=True)
    rows.sort(key=lambda v:(v['cohort'],v['seed'],v['variant']))
    (OUT/'study-index.json').write_text(json.dumps({'schema':'fpsarena-c15-predeclared-scenario-study-v1',
        'durationSeconds':32,'engine':'C7 uploaded-main snapshot','paired':pairs,'randomized':randoms,
        'completed':rows,'errors':errors},indent=2)+'\n')
    print('COMPLETED',len(rows),'ERRORS',len(errors))
    if errors:raise SystemExit(1)
if __name__=='__main__':main()
