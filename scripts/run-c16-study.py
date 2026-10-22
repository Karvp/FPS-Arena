#!/usr/bin/env python3
"""Predeclared deterministic C15-v-C16 paired replay plus match-randomized study.
Only research headless main snapshot. Never select seeds using match outcomes.
"""
import argparse, concurrent.futures, json, subprocess, time
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'reports/c16/study'
MAPS=('arena','foundry','neon')
WEAPONS=('mp5sd','m4a1','aa12','hk_sl8')
# Disjoint from C15 development/research seeds 14xxxx/15xxxx.
PAIRS=[{'seed':160101+i,'map':MAPS[i%3],'weapon':WEAPONS[i%4]} for i in range(8)]
RANDOM=[{'seed':160301+i,'map':MAPS[(i+1)%3],'weapon':WEAPONS[(i+2)%4]} for i in range(40)]
def run(job):
    cohort,variant,arm,case=job
    seed,mapname,weapon=case['seed'],case['map'],case['weapon']
    key=f'{cohort}-{variant}-{arm}-{seed}-{mapname}-{weapon}'
    prefix=OUT/key
    dataset=prefix.with_suffix('.dataset.json')
    report=prefix.with_suffix('.run.json')
    cmd=['node','lab/arena/train-main.mjs','--profile','release','--seconds',str(32 if cohort=='pair' else 45),
         '--episodes','1','--modes','tdm','--seed',str(seed),'--classic-maps',mapname,
         '--trainee-primary',weapon,'--opponents','stress','--lag-ms','65',
         f'--c{variant}-dataset',str(dataset.relative_to(ROOT)),
         '--profile-exploration','--out',str(report.relative_to(ROOT))]
    if arm!='randomized':cmd+=['--c14-force-arm',arm]
    t=time.monotonic()
    if not (dataset.is_file() and report.is_file()):
        proc=subprocess.run(cmd,cwd=ROOT,capture_output=True,text=True,timeout=110)
        if proc.returncode:raise RuntimeError(f'{key}: {proc.stdout[-600:]} {proc.stderr[-1700:]}')
    result=json.loads(report.read_text())['results']
    observations=json.loads(dataset.read_text())['matches']
    if len(result)!=1 or len(observations)!=1:raise ValueError('incomplete match '+key)
    a,b=result[0],observations[0]
    if (a['errors'] or a['seed']!=seed or a['map']!=mapname or a['primaryLoadout']!=weapon or
        b['metadata']['assignment']['arm'] not in ('control','treatment')):raise ValueError('inconsistent match '+key)
    return {'cohort':cohort,'variant':variant,'arm':arm,'seed':seed,'map':mapname,'weapon':weapon,
            'wallSeconds':round(time.monotonic()-t,3),'result':a,'observation':b,
            'files':{'run':str(report.relative_to(ROOT)),'dataset':str(dataset.relative_to(ROOT))}}
def main():
    p=argparse.ArgumentParser()
    p.add_argument('--workers',type=int,default=4)
    p.add_argument('--quick',action='store_true')
    args=p.parse_args()
    OUT.mkdir(parents=True,exist_ok=True)
    paircases=PAIRS[:2] if args.quick else PAIRS
    randcases=RANDOM[:4] if args.quick else RANDOM
    jobs=[('pair',v,a,c) for c in paircases for a in ('control','treatment') for v in ('15','16')]
    jobs += [('randomized','16','randomized',c) for c in randcases]
    rows=[];errors=[]
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures={pool.submit(run,j):j for j in jobs}
        for fut in concurrent.futures.as_completed(futures):
            try:
                v=fut.result();rows.append(v)
                print(f"{v['cohort']} C{v['variant']} {v['arm']} seed={v['seed']} {v['weapon']} offers={v['observation']['diagnostics']['eligibleOffers']} k={v['result']['kills']} errors={v['result']['errors']}",flush=True)
            except Exception as exc:
                v={'job':futures[fut],'exception':str(exc)};errors.append(v)
                print('ERROR',str(v)[:1500],flush=True)
    rows.sort(key=lambda x:(x['cohort'],x['seed'],x['arm'],x['variant']))
    dest=OUT/'study-index.json'
    dest.write_text(json.dumps({'schema':'fpsarena-c16-study-predeclared-v1','snapshot':'C7-uploaded-main',
        'pairedSeeds':paircases,'randomizedSeeds':randcases,'pairedDurationSeconds':32,
        'randomizedDurationSeconds':45,'profileExploration':True,'completed':rows,'errors':errors},indent=2)+'\n')
    print('COMPLETED',len(rows),'ERRORS',len(errors),'INDEX',dest)
    if errors:raise SystemExit(1)
if __name__=='__main__':main()
