#!/usr/bin/env python3
"""Source-locked observational pilot; source hashes sealed BEFORE outcomes.
Does NOT enable new policy or change original agent/physics.
"""
from __future__ import annotations
import hashlib,json,subprocess,concurrent.futures,time,sys
from pathlib import Path
BASE=Path(__file__).resolve().parents[1]
DEST=BASE/'reports/c35d/public-transition-pilot'
SOURCES=['page-agent.js','lab/arena/train-main.mjs','lab/arena/public-macro-transition-c35d.mjs',
 'lab/arena/source-main/server/game.js','lab/arena/source-main/server/bot.js',
 'lab/arena/safe-action-explorer-c16.mjs','lab/arena/encounter-randomization-c21.mjs',
 'scripts/c35d_transition_model.py','scripts/run-c35d-passive.py']
def sha(path):return hashlib.sha256(Path(path).read_bytes()).hexdigest()
def canon(o):return (json.dumps(o,sort_keys=True,indent=2)+'\n').encode()
def design():
    guns=['mp5sd','m4a1','aa12','hk_sl8','uzi','l115a3']; maps=['arena','neon','foundry']
    cases=[]
    for mi,mp in enumerate(maps):
     for gi,gun in enumerate(guns):
      # Both held-out weapons appear in each map; seed and opponent remain disjoint.
      split='holdout' if gi in (1,4) else 'validation' if gi==2 else 'train'
      i=mi*6+gi
      cases.append(dict(id=f'c35d-{i:02}',split=split,map=mp,gun=gun,seed=35395000+i*101,
       lag=[35,65,125][i%3],opponents=['official','mixed','stress'][(i+mi)%3],seconds=40,bots=5))
    return {'schema':'fpsarena-c35d-locked-passive-design-v1','study':'observational public command 120ms prediction; no actuation; no combat efficacy',
      'modelRule':'ridge logistic train only; no tuning on holdout; validation brier +0.001 vs constant and +0.0005 vs quiet-only; ece<=0.08; >=8 events',
      'parentC35C3SHA256':'7d98add084b460b7f153df07a148c0138a7239dbada2f29ba944f7ad1a2d7fa6',
      'sourceHashes':{p:sha(BASE/p) for p in SOURCES},'cases':cases}

def case_run(c):
    d=DEST/'traces';d.mkdir(parents=True,exist_ok=True)
    name=c['id'];data=d/f'{name}.json';out=d/f'{name}.result.json';log=d/f'{name}.log'
    args=['node','lab/arena/train-main.mjs','--profile','release','--modes','tdm',
      '--classic-maps',c['map'],'--seconds',str(c['seconds']),'--seed',str(c['seed']),
      '--bots',str(c['bots']),'--opponents',c['opponents'],'--lag-ms',str(c['lag']),
      '--trainee-primary',c['gun'],'--c35d-trace',str(data),'--c35d-setup-id',name,'--out',str(out)]
    res=subprocess.run(args,cwd=BASE,text=True,capture_output=True,timeout=150)
    log.write_text(res.stdout+'\n'+res.stderr)
    if res.returncode:raise RuntimeError(name+' '+res.stderr[-1200:])
    obj=json.loads(data.read_text());summary=json.loads(out.read_text())
    if summary['aggregate']['agentErrors']!=0:raise RuntimeError(name+' agent errors')
    return {'case':name,'split':c['split'],'traceSHA256':sha(data),'resultSHA256':sha(out),
            'rows':obj['traces'][0]['complete'], 'positive':sum(r['futurePriority'] for r in obj['traces'][0]['rows'])}
if __name__=='__main__':
    DEST.mkdir(parents=True,exist_ok=True)
    planfile=DEST/'FROZEN-DESIGN.json'; proposed=design()
    if planfile.exists():
        if json.loads(planfile.read_text())!=proposed:raise RuntimeError('FROZEN DESIGN/SOURCE DIFFER: refuse to reuse pilot')
    else:planfile.write_bytes(canon(proposed))
    print('prereg SHA',sha(planfile),flush=True)
    t=time.monotonic();results=[]
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
      futures={pool.submit(case_run,c):c for c in proposed['cases']}
      for f in concurrent.futures.as_completed(futures):
        res=f.result();results.append(res)
        print(f"{len(results)}/18 {res['case']} rows={res['rows']} future={res['positive']}",flush=True)
    if design()!=proposed:raise RuntimeError('source changed during pilot')
    manifest={'schema':'fpsarena-c35d-execution-audit-v1','registrationSHA256':sha(planfile),
      'wallSeconds':round(time.monotonic()-t,2),'matches':sorted(results,key=lambda x:x['case']),
      'sourceImmutable':True,'note':'independent train-validation-holdout public telemetry, no policy actuation'}
    (DEST/'EXECUTION-AUDIT.json').write_bytes(canon(manifest))
    subprocess.run([sys.executable,'scripts/c35d_transition_model.py',str(DEST)],cwd=BASE,check=True)
    print('DONE',round(time.monotonic()-t,2),'sec',flush=True)
