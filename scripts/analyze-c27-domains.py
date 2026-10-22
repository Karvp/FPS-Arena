#!/usr/bin/env python3
"""Post-hoc descriptive domain breakdown; not model selection."""
import importlib.util,json,pathlib,collections,numpy as np
root=pathlib.Path(__file__).resolve().parents[1];base=root/'reports/c27/study36'
spec=importlib.util.spec_from_file_location('model',root/'scripts/temporal-threat-gru-c27.py');mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
read=lambda p:json.loads(pathlib.Path(p).read_text())
plan=read(base/'PRE-REGISTERED-PLAN.json');frozen=read(base/'FROZEN-MODELS.json');dev=read(root/'reports/c25/study24/COMBINED-DATASET.json');devplan=read(root/'reports/c25/study24/PRE-REGISTERED-PLAN.json');data=read(base/'COMBINED-DATASET.json')
rows,stats=mod.validate_study(data,plan,frozen,dev,devplan)
trainJobs={str(j['seed']):j for j in devplan['jobs'] if j['split']=='train'}
train,_=mod.dataset_rows({'schema':dev['schema'],'matches':[m for m in dev['matches'] if str(m['metadata']['seed']) in trainJobs]})
globalrate=(sum(r['y'] for r in train)+.5)/(len(train)+1)
counts=collections.defaultdict(lambda:[0,0])
for r in train:
 k=r['meta']['map']+'/'+r['meta']['loadout'];counts[k][0]+=1;counts[k][1]+=r['y']
def shrink(r):
 n,pos=counts[r['meta']['map']+'/'+r['meta']['loadout']];return (pos+20*globalrate)/(n+20)
sel=mod.prediction(frozen['candidates'][frozen['selectedIndex']],rows)
fixed=[shrink(r) for r in rows]
seedJob={str(j['seed']):j for j in plan['jobs']}
by=[]
for domain in ('stress','mixed','official'):
 ix=[i for i,r in enumerate(rows) if seedJob[r['matchId']]['opponents']==domain]
 subset=[rows[i] for i in ix]
 by.append({'opponents':domain,'matches':len({r['matchId'] for r in subset}),'constant':mod.metric(subset,[globalrate]*len(ix)),
            'mapWeaponSmoothed':mod.metric(subset,[fixed[i] for i in ix]),'validationSelectedTemporal':mod.metric(subset,[sel[i] for i in ix])})
byStratum=[]
for mapname,gun in mod.STRATA:
 ix=[i for i,r in enumerate(rows) if r['meta']['map']==mapname and r['meta']['loadout']==gun]
 group=[rows[i] for i in ix]
 byStratum.append({'map':mapname,'weapon':gun,'matches':len({r['matchId'] for r in group}),'windows':len(group),
   'positive':sum(r['y'] for r in group),'baselineBrier':mod.metric(group,[globalrate]*len(group))['brier'],
   'selectedBrier':mod.metric(group,[sel[i] for i in ix])['brier']})
summary={'schema':'fpsarena-c27-descriptive-domain-diagnostics-v1','disclaimer':'POST-HOC domain breakdown; does not select/promo any model',
         'selectedKind':frozen['selectedKind'],'baselinePrevalence':globalrate,
         'overallMapWeaponSmoothed':mod.metric(rows,fixed),'overallSelectedTemporal':mod.metric(rows,sel),
         'byOpponent':by,'byMapWeapon':byStratum}
mod.dump(base/'DOMAIN-DIAGNOSTICS.json',summary)
print(json.dumps(summary,indent=2))
