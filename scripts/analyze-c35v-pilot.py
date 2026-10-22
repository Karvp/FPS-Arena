#!/usr/bin/env python3
"""Matched factual 2-arm analysis. Clustered setup bootstrap; no causal claims for unselected alternatives."""
from pathlib import Path
import hashlib,random,json,csv,collections
R=Path(__file__).resolve().parents[1];O=R/'reports/c35v/factual-value-24-v1'
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def read(p):return json.loads(Path(p).read_text())
def main():
 design=read(O/'FROZEN-DESIGN.json');exe=read(O/'EXECUTION-AUDIT.json')
 assert exe['registrationSHA256']==sha(O/'FROZEN-DESIGN.json')
 for path,value in design['sourceSHA256'].items():assert sha(R/path)==value,path
 records={x['id']:x for x in exe['cases']};assert len(records)==len(design['cases'])==24
 stats=collections.defaultdict(lambda:collections.Counter());pairs=collections.defaultdict(dict);rows=[]
 for c in design['cases']:
  pref=O/'matches'/c['id'];z=records[c['id']]
  for name,digest in z['sha256'].items():assert sha(str(pref)+'.'+name+'.json')==digest,(c['id'],name)
  a=read(str(pref)+'.result.json')['aggregate'];v=read(str(pref)+'.value.json')['traces'][0];m=read(str(pref)+'.motion.json')['traces'][0]
  assert a['agentErrors']==0 and v['counts']['changedFire']==0
  d={**c,**{k:a[k] for k in ['kills','deaths','shots','hits','meters','agentErrors']},
     'modifiedTicks':m['counts']['modifiedTicks'],**{k:v['counts'][k] for k in ['sampled','eligible','completed','censored']}}
  stats[c['arm']].update({k:d[k] for k in ['kills','deaths','shots','hits','modifiedTicks','sampled','eligible','completed','censored']})
  pairs[c['setupId']][c['arm']]=d;rows.append(d)
 assert len(pairs)==12 and all(set(p)=={'observe','balance'} for p in pairs.values())
 rng=random.Random(20263551);setup=list(pairs.values());ci={}
 for k in ['kills','deaths','shots','hits']:
  sims=[]
  for _ in range(4000):
   pick=[setup[rng.randrange(len(setup))] for z in setup]
   b=sum(x['balance'][k] for x in pick);o=sum(x['observe'][k] for x in pick)
   if o:sims.append(b/o)
  sims.sort();ci[k]=[sims[int(.025*(len(sims)-1))],sims[int(.975*(len(sims)-1))]] if sims else None
 out=dict(schema='fpsarena-c35v-two-arm-observational-audit-v1',registrationSHA256=exe['registrationSHA256'],
  simulatedMinutes=sum(c['seconds'] for c in design['cases'])/60,setups=len(pairs),matches=len(rows),
  totals={k:dict(v) for k,v in stats.items()},pairedSetupBootstrap95BalanceOverObserve=ci,
  exposureNote='Action-value observer never actuated; C35-U balance vs observe is the only randomized arm-level distinction. Factual-window samples overlap.',
  counterfactualLimitation='Unselected movement directions have null factualOutcome; heuristic preference is NOT causal reward.',
  policyDecision='DO_NOT_PROMOTE_NO_PROVEN_SAFETY_OR_COMBAT_UPLIFT')
 (O/'C35V-ANALYSIS.json').write_text(json.dumps(out,indent=2,sort_keys=True)+'\n')
 keys=['setupId','arm','map','gun','lagMs','seed','opponents','seconds','kills','deaths','shots','hits','meters','modifiedTicks','sampled','eligible','completed','censored']
 with (O/'C35V-TDM-TWO-ARM.csv').open('w',newline='') as f:
  w=csv.DictWriter(f,fieldnames=keys);w.writeheader();w.writerows({k:r[k] for k in keys} for r in rows)
 print(json.dumps(out,indent=2,sort_keys=True))
if __name__=='__main__':main()
