#!/usr/bin/env python3
"""Secondary exploratory, setup-cluster audit. Does not tune or retrain models."""
from __future__ import annotations
import json,math,random,sys
from pathlib import Path
from c35d_transition_model import load_split,probability

def audit(folder:Path):
 plan=json.loads((folder/'FROZEN-DESIGN.json').read_text())
 fitted=json.loads((folder/'C35D-SHADOW-EVALUATION.json').read_text())['models']
 rows=load_split(folder,plan)['holdout']
 by={}
 for row,p in zip(rows,probability(fitted['full'],rows)):
  sid=row['setupId'];y=row['futurePriority'];b=fitted['constant'];q=probability(fitted['quiet'],[row])[0]
  x=by.setdefault(sid,{'n':0,'events':0,'modelSq':0.,'constantSq':0.,'quietSq':0.})
  x['n']+=1;x['events']+=y;x['modelSq']+=(p-y)**2;x['constantSq']+=(b-y)**2;x['quietSq']+=(q-y)**2
 keys=sorted(by)
 def gain(picks,ref):
  total=sum(by[k]['n'] for k in picks)
  return (sum(by[k][ref+'Sq']-by[k]['modelSq'] for k in picks)/total)
 rng=random.Random(35395001);B=10000
 draws={ref:sorted(gain([rng.choice(keys) for _ in keys],ref) for _ in range(B)) for ref in ('constant','quiet')}
 result={'schema':'fpsarena-c35d-independent-holdout-cluster-audit-v1','posthocStatus':'DESCRIPTIVE_NO_PROMOTION',
  'holdoutIndependentMatches':len(keys),
  'perSetup':{k:{**v,'modelBrier':round(v['modelSq']/v['n'],8)} for k,v in by.items()},
  'improvementVsConstant':{'estimate':round(gain(keys,'constant'),8),
   'bootstrap95':[round(draws['constant'][249],8),round(draws['constant'][9749],8)]},
  'improvementVsQuietOnly':{'estimate':round(gain(keys,'quiet'),8),
   'bootstrap95':[round(draws['quiet'][249],8),round(draws['quiet'][9749],8)]}}
 out=folder/'C35D-HOLDOUT-CLUSTER-AUDIT.json';out.write_text(json.dumps(result,indent=2)+'\n')
 return result
if __name__=='__main__':print(json.dumps(audit(Path(sys.argv[1])),indent=2))
