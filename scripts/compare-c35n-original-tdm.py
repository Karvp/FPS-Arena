#!/usr/bin/env python3
"""C35-N shadow80 vs v2.9.11 release, paired authoritative TDM.

No historical cohort is modified. No production code is altered.
Baseline is `--profile release` with no C35 research flag; both arms share
map, seed, weapon, lag, bots and opponent profile. 18 matches are paired units.
"""
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from collections import defaultdict
import argparse, csv, hashlib, json, math, random, subprocess, statistics
ROOT = Path(__file__).resolve().parents[1]
PRIOR = ROOT/'reports/c35n/new-seed-18'
OUT = ROOT/'reports/c35n/v2911-original-comparison'
METRICS = ['shots','hits','headHits','kills','deaths','damageDealt','damageTaken','distance','fireInputTicks','firstShotAt','firstHitAt']

def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def stored_metrics(p):
    o=json.loads(p.read_text())
    assert o['aggregate']['rounds']==1
    return o['results'][0]
def baseline(c, reuse):
    OUT.mkdir(parents=True,exist_ok=True)
    d=OUT/'matches';d.mkdir(parents=True,exist_ok=True)
    dest=d/(c['setupId']+'-release.json')
    log=d/(c['setupId']+'-release.log')
    if dest.exists() and reuse:
        o=stored_metrics(dest)
        if (o['seed'],o['map'],o['primaryLoadout'],o['opponentPolicy'],o['duration'])!=(c['seed'],c['map'],c['gun'],c['opponents'],c['seconds']):
            raise AssertionError('Cached baseline configuration mismatch '+c['setupId'])
        return (c['setupId'],dest)
    cmd=['node','lab/arena/train-main.mjs','--profile','release', '--modes','tdm','--classic-maps',c['map'],
        '--seconds',str(c['seconds']),'--seed',str(c['seed']),'--bots',str(c['bots']),
        '--opponents',c['opponents'],'--lag-ms',str(c['lagMs']),
        '--trainee-primary',c['gun'],'--out',str(dest)]
    p=subprocess.run(cmd,cwd=ROOT,capture_output=True,text=True,timeout=300)
    log.write_text(' '.join(cmd)+'\n'+p.stdout+'\n'+p.stderr)
    if p.returncode:raise RuntimeError(f'{c["setupId"]} exit {p.returncode}: {p.stderr[-1000:]}')
    o=stored_metrics(dest)
    assert o['profile']=='release' and o['duration']==c['seconds']
    return (c['setupId'],dest)

def audit(c,b,r):
    for o in [b,r]:
        assert o['mode']=='tdm' and o['map']==c['map'] and o['seed']==c['seed']
        assert o['primaryLoadout']==c['gun'] and o['opponentPolicy']==c['opponents']
        assert o['duration']==c['seconds'] and o['errors']==0
    assert b.get('c14') is None and b.get('c35') is None, 'release baseline is not intervention-free'
    assert r['c14'] is not None, 'C35-N comparison arm did not actually enable C35'

def percentiles(v):
    v.sort();return (round(v[int(.025*(len(v)-1))],4),round(v[int(.975*(len(v)-1))],4))
def main():
    parser=argparse.ArgumentParser();parser.add_argument('--workers',type=int,default=4)
    parser.add_argument('--no-run',action='store_true');a=parser.parse_args()
    design=json.loads((PRIOR/'FROZEN-DESIGN.json').read_text());cases=design['cases']
    assert len(cases)==18
    if not a.no_run:
        with ThreadPoolExecutor(max_workers=a.workers) as pool:
            tasks={pool.submit(baseline,c,True):c for c in cases}
            for t in as_completed(tasks):
                cid,p=t.result();print('BASELINE',cid,p.name,flush=True)
    rows=[];hashes={}
    for c in cases:
        bp=OUT/'matches'/(c['setupId']+'-release.json')
        rp=PRIOR/'matches'/(c['id']+'.result.json')
        b=stored_metrics(bp);r=stored_metrics(rp)
        audit(c,b,r)
        row={k:c[k] for k in ['setupId','map','gun','seed','opponents','lagMs','seconds']}
        for k in METRICS:
            row[k+'_release']=b[k];row[k+'_c35n']=r[k]
        rows.append(row)
        hashes[c['setupId']]={'releaseSHA256':sha(bp),'c35nSHA256':sha(rp)}
    totals={};boot={};rng=random.Random(350012)
    for k in METRICS:
        if k.startswith('first'):continue
        v0=sum(x[k+'_release'] for x in rows);v1=sum(x[k+'_c35n'] for x in rows)
        totals[k]={'release':round(v0,4),'c35n':round(v1,4),'delta':round(v1-v0,4),
                   'ratio':round(v1/v0,4) if v0 else None}
        values=[];differences=[]
        for _ in range(3000):
            xs=[rows[rng.randrange(18)] for _ in range(18)]
            aa=sum(x[k+'_release'] for x in xs)
            bb=sum(x[k+'_c35n'] for x in xs)
            if aa:values.append(bb/aa)
            differences.append(bb-aa)
        boot[k]={'ratio95':percentiles(values) if values else None,'delta95':percentiles(differences)}
    for k in ['firstShotAt','firstHitAt']:
        valid=[row for row in rows if row[k+'_release'] is not None and row[k+'_c35n'] is not None]
        totals[k]={'paired_n':len(valid),'release_mean':round(statistics.mean(x[k+'_release'] for x in valid),3) if valid else None,
                   'c35n_mean':round(statistics.mean(x[k+'_c35n'] for x in valid),3) if valid else None}
    totals['accuracy_percent']={'release':round(100*totals['hits']['release']/totals['shots']['release'],2) if totals['shots']['release'] else None,
         'c35n':round(100*totals['hits']['c35n']/totals['shots']['c35n'],2) if totals['shots']['c35n'] else None,
         'note':'hit events / authoritative shots; multiple hit events per shot possible'}
    maprows={}
    for m in ['arena','neon','foundry']:
        subset=[r for r in rows if r['map']==m]
        maprows[m]={k:{'release':sum(x[k+'_release'] for x in subset),'c35n':sum(x[k+'_c35n'] for x in subset)} for k in ['shots','hits','kills','deaths','damageDealt','damageTaken']}
    OUT.mkdir(parents=True,exist_ok=True)
    with (OUT/'PAIRED-18.csv').open('w',newline='') as f:
        w=csv.DictWriter(f,fieldnames=list(rows[0]));w.writeheader();w.writerows(rows)
    result={'schema':'fpsarena-c35n-v2911-original-paired-tdm-v1',
     'source':'C35-N frozen new-seed 18-match research cohort and paired v2.9.11 release baseline',
     'comparison':'v2.9.11 release/no research flags vs C35-N shadow80 + passive observers',
     'baselineCaveat':'Research shadow80 changes game states; this is not a comparison of upgraded production agents.',
     'pairedSetupCount':len(rows),'secondsEach':60,'seedSource':'reports/c35n/new-seed-18/FROZEN-DESIGN.json',
     'totalSecondsEachArm':sum(x['seconds'] for x in rows),
     'baselineUninstrumented':True,'sameProductionPageAgent':True,
     'totals':totals,'bootstrapBySetup':boot,'maps':maprows,'files':hashes}
    (OUT/'SUMMARY.json').write_text(json.dumps(result,indent=2,ensure_ascii=False)+'\n')
    print(json.dumps({'totals':totals,'byMap':maprows,'bootstrap':boot},indent=2,ensure_ascii=False),flush=True)
if __name__=='__main__':main()
