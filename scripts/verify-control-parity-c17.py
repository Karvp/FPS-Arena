#!/usr/bin/env python3
"""Compare C17 no-op control to release without C17 instrumentation, by fixed game seed."""
import json, subprocess, sys, pathlib
root=pathlib.Path(__file__).resolve().parent.parent
study=root/'reports/c17/study/study-rows.json'
rows=json.loads(study.read_text())
control=[r for r in rows if r['arm']=='control']
# Fixed, deterministic, six distinct strata, no selecting on post-treatment outcome.
selected=[]
for r in control:
    s=r['observation']['metadata']['assignment']['stratum']
    if s not in [a['observation']['metadata']['assignment']['stratum'] for a in selected]:selected.append(r)
assert len(selected)==6
fields=['kills','deaths','shots','hits','headHits','damageDealt','damageTaken','distance','score','errors','finalHp','finalArmor','accuracy']
report=[]
for r in selected:
    a=r['result'];dest=root/f"reports/c17/parity-baseline-{a['map']}-{a['primaryLoadout']}.json"
    args=['node','lab/arena/train-main.mjs','--profile','release','--modes','tdm','--seconds','32',
          '--seed',str(a['seed']),'--classic-maps',a['map'],'--trainee-primary',a['primaryLoadout'],
          '--bots','5','--opponents','stress','--lag-ms','65','--out',str(dest)]
    subprocess.run(args,cwd=root,check=True,capture_output=True,text=True)
    b=json.loads(dest.read_text())['results'][0]
    mismatches={k:[a.get(k),b.get(k)] for k in fields if a.get(k)!=b.get(k)}
    report.append({'stratum':r['observation']['metadata']['assignment']['stratum'],
                   'seed':a['seed'],'identical':not mismatches,'mismatches':mismatches})
print(json.dumps(report,indent=2))
path=root/'reports/c17/control-parity.json'
path.write_text(json.dumps({'schema':'fpsarena-c17-control-release-parity-v1',
                            'comparisons':len(report),'allIdentical':all(x['identical'] for x in report),
                            'fields':fields,'rows':report},indent=2)+'\n')
sys.exit(0 if all(x['identical'] for x in report) else 1)
