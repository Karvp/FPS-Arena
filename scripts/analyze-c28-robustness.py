#!/usr/bin/env python3
"""Descriptive, post-hoc subgroup audit; never used to select policies."""
from pathlib import Path
from collections import defaultdict,Counter
import sys,json,torch
sys.path.insert(0,str(Path(__file__).resolve().parent))
from importlib import import_module
mod=import_module('train-encounter-value-c28')
base=mod.BASE
plan,index,split=mod.load_development()
f=mod.read(base/'FROZEN-POLICY.json')
rows=mod.load_holdout(plan,index)
model=mod.ValueNet()
model.load_state_dict({k:torch.tensor(v,dtype=torch.float32) for k,v in f['weights'].items()});model.eval()
with torch.no_grad(): choices=model(mod.record(rows)[0]).argmin(dim=1).tolist()
groupings={'weaponId':defaultdict(list),'trackingScriptHidden':defaultdict(list),'lagSeconds':defaultdict(list)}
for i,r in enumerate(rows):
 s=r['scenario'];
 for key in groupings:
  name=key if key!='trackingScriptHidden' else 'tracking'
  groupings[key][str(s[name])].append(i)
report={'schema':'fpsarena-c28-posthoc-diagnostics-v1','policyFrozen':f['preselectedPolicy'],'notUsedForPolicySelection':True,'groups':{}}
for key,groups in groupings.items():
 report['groups'][key]={}
 for value,ix in sorted(groups.items()):
  baseline=sum(rows[i]['arms'][0]['cappedLoss'] for i in ix)/len(ix)
  neural=sum(rows[i]['arms'][choices[i]]['cappedLoss'] for i in ix)/len(ix)
  away=sum(rows[i]['arms'][mod.rule_away(rows[i])]['cappedLoss'] for i in ix)/len(ix)
  report['groups'][key][value]={'scenarios':len(ix),'baseline':baseline,'neural':neural,'ruleAway':away,
    'neuralMinusRuleAway':neural-away,
    'chosenArms':dict(Counter(mod.ACTIONS[choices[i]] for i in ix))}
output=base/'POSTHOC-DIAGNOSTICS.json'
text=json.dumps(report,indent=2)+'\n'
if output.exists() and output.read_text()!=text:raise RuntimeError('C28 diagnostics overwrite refused')
output.write_text(text)
print(json.dumps(report['groups']['weaponId'],indent=2))
