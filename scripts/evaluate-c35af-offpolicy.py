#!/usr/bin/env python3
"""Strict frozen-model off-policy evaluation on withheld six setup clusters."""
from pathlib import Path
import csv,hashlib,json,numpy as np,random
R=Path(__file__).resolve().parents[1];O=R/'reports/c35af/frozen-54'
model=json.loads((O/'FROZEN-3S-COMBAT-MODELS.json').read_text())
assert hashlib.sha256((O/'LONG-HORIZON-FACTUAL.csv').read_bytes()).hexdigest()==model['sourceDatasetSHA256']
allrows=list(csv.DictReader((O/'LONG-HORIZON-FACTUAL.csv').open()))
rows=[r for r in allrows if r['setupId'] in model['setupSplit']['holdout']]
GUNS=['hk_sl8','l115a3','m4a1','mp5sd','aa12','uzi']
def X(r,toggle):
 ads=float(r['baselineADS']=='True');g=[float(r['gun']==gun) for gun in GUNS]
 return np.array([ads,min(120,float(r['targetRange']))/100,min(90,float(r['aimAngleDeg']))/90,min(12,float(r['speed']))/12,float(r['lagMs'])/250]+g+[float(toggle),float(toggle)*ads,float(toggle)*(1-ads)])
def score(model,vec):
 z=(vec-np.array(model['scalerMean']))/np.array(model['scalerScale'])
 if model['type']=='ridge':return float(z@np.array(model['coefficients'])+model['intercept'])
 for w,b in zip(model['weights'],model['biases']):
  z=z@np.array(w)+np.array(b)
  if len(b)!=1:z=np.tanh(z)
 return float(z.reshape(-1)[0])
def reward(r):return float((np.clip(float(r['damageDealt']),0,300)-np.clip(float(r['damageTaken']),0,300)+100*(float(r['kills'])-float(r['deaths'])))/100)
m=model['models'][model['selectedByValidationMSE']];dataset=[]
for r in rows:
 scores={'control':score(m,X(r,False)),'toggle':score(m,X(r,True))};action='toggle' if scores['toggle']>scores['control'] else 'control'
 dataset.append(dict(setupId=r['setupId'],observedArm=r['arm'],learnedArm=action,reward=reward(r),controlPred=scores['control'],togglePred=scores['toggle']))
def IPS(arr,pol):
 # Correct unconditional (unnormalized) Horvitz-Thompson, 50/50 propensities.
 return sum(2*r['reward']*(r['observedArm']==(r['learnedArm'] if pol=='model' else pol)) for r in arr)/len(arr)
sets=sorted(set(r['setupId'] for r in dataset));assert len(sets)==6
rng=random.Random(20261014);diffs=[]
for _ in range(5000):
 s=[rng.choice(sets) for j in sets];a=[r for k in s for r in dataset if r['setupId']==k];diffs.append(IPS(a,'model')-IPS(a,'control'))
diffs.sort()
out=dict(schema='fpsarena-c35af-holdout-offpolicy-v1',holdoutSetups=sets,windows=len(dataset),policyArms={'modelControl':sum(r['learnedArm']=='control' for r in dataset),'modelToggle':sum(r['learnedArm']=='toggle' for r in dataset)},
 estimates={'alwaysControl':IPS(dataset,'control'),'alwaysToggle':IPS(dataset,'toggle'),'greedyFrozenModel':IPS(dataset,'model')},
 modelMinusControl=IPS(dataset,'model')-IPS(dataset,'control'),setupClusterBootstrap95=[diffs[125],diffs[4875]],
 dataSourceSHA256=model['sourceDatasetSHA256'],modelSourceSHA256=hashlib.sha256((O/'FROZEN-3S-COMBAT-MODELS.json').read_bytes()).hexdigest(),
 conclusion='Exploratory randomized single-eligible-decision 3s return IPS; no actual learned policy Game.step. No promotion from only six heldout setups / any interval spanning zero.',
 limitations=['Policy selection computed from public pre-step features only','Unnormalized HT estimates have high variance and may show imbalance','Random assignment repeated within a match; residual carryover/interference','Reward is exploratory and clips 10000-point sniper critical damage'])
(O/'OFFPOLICY-HOLDOUT.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps(out,indent=2))
