#!/usr/bin/env python3
"""Offline C35AG prefix model. NEVER valid for deciding the initial randomized ADS impulse.
At t=+1s, prefix flags are observed; target = eventual realized 6s factual combat reward.
No future segments/outcomes used as features and setups do not cross split boundaries.
"""
from pathlib import Path
from collections import Counter
import json,math,hashlib
import numpy as np
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import Ridge
from sklearn.neural_network import MLPRegressor
from sklearn.metrics import mean_squared_error
R=Path(__file__).resolve().parents[1]; O=R/'reports/c35ag/frozen-72';M=O/'matches'
GUNS=['hk_sl8','l115a3','m4a1','mp5sd','aa12','uzi']
FEATURES=['baselineADS','range100','angle14','speed10','lag250',*['gun-'+g for g in GUNS],'assignedToggle',
          'prefixADS','prefixMovement','prefixFire','prefixDirectionChanges','prefixADSChanges','prefixFireChanges']
def read(p):return json.loads(p.read_text())
def feats(q,c):
 pub=q['initialPublicFeatures'];seg=q['sequence']['segments'];first=[];t=0
 for s in seg:
  for _ in range(min(60-t,s['ticks'])):first.append(s['flags'])
  t=len(first)
  if t>=60:break
 assert len(first)>=58
 def trans(k):return sum(first[i][k]!=first[i-1][k] for i in range(1,len(first)))/60
 moving=lambda x: x['forward'] or x['backward'] or x['left'] or x['right']
 feat=[float(q['baselineADS']),min(float(pub['targetRange']),150)/100,min(float(pub['aimAngleDeg']),30)/14,
       float(pub['speed'])/10,float(c['lagMs'])/250,*[float(c['gun']==g) for g in GUNS],
       float(q['assignedArm']=='toggle'),
       sum(x['aim'] for x in first)/len(first),sum(moving(x) for x in first)/len(first),sum(x['fire'] for x in first)/len(first),
       sum(any(first[i][k]!=first[i-1][k] for k in ('forward','backward','left','right')) for i in range(1,len(first)))/60,
       trans('aim'),trans('fire')]
 assert len(feat)==len(FEATURES) and all(math.isfinite(v) for v in feat)
 return feat
cases=read(O/'FROZEN-DESIGN.json')['cases'];rows=[]
for c in cases:
 if c['arm']!='randomized':continue
 q=read(Path(str(M/c['id'])+'.sequence.json'))['traces'][0]
 for a in q['rows']:
  if not a['factual']['complete']:continue
  y=a['factual'];reward=(min(y['damageDealt'],300)-min(y['damageTaken'],300)+100*(y['ownKills']-y['deathCount']))/100
  feat=feats(a,c);sid=int(c['setupId'].split('-')[-1]);split='train' if sid%4 in (0,1) else 'validation' if sid%4==2 else 'holdout'
  rows.append(dict(split=split,setupId=c['setupId'],gun=c['gun'],features=feat,reward=reward))
sets={split:[r for r in rows if r['split']==split] for split in ('train','validation','holdout')}
assert len({r['setupId'] for r in rows})==24
assert all({r['setupId'] for r in sets[a]}.isdisjoint({r['setupId'] for r in sets[b]}) for a,b in (('train','validation'),('train','holdout'),('validation','holdout')))
A={k:np.asarray([r['features'] for r in v],dtype=float) for k,v in sets.items()}
Y={k:np.asarray([r['reward'] for r in v],dtype=float) for k,v in sets.items()}
sc=StandardScaler().fit(A['train']);X={k:sc.transform(a) for k,a in A.items()};npre=len(FEATURES)-6
models={'constant':None,'predecisionRidge':Ridge(alpha=10.0).fit(X['train'][:,:npre],Y['train']),
        'prefixRidge':Ridge(alpha=10.0).fit(X['train'],Y['train']),
        'prefixNeuralMLP':MLPRegressor(hidden_layer_sizes=(16,8),activation='tanh',solver='lbfgs',alpha=12.0,random_state=35035,max_iter=600).fit(X['train'],Y['train'])}
def predict(name,k):
 if name=='constant':return np.repeat(float(Y['train'].mean()),len(Y[k]))
 if name=='predecisionRidge':return models[name].predict(X[k][:,:npre])
 return models[name].predict(X[k])
metrics={name:{k:round(float(mean_squared_error(Y[k],predict(name,k))),7) for k in ('train','validation','holdout')} for name in models}
weights=models['prefixNeuralMLP'];out={'schema':'fpsarena-c35ag-frozen-prefix-neural-v1',
 'status':'OFFLINE_DESCRIPTIVE_NOT_DEPLOYABLE','task':'Predict factual 6s combat reward after seeing first 1s of post-treatment trajectory; cannot choose original ADS action',
 'featureNames':FEATURES,'trainingCases':len(rows),'splitSizes':{k:len(v) for k,v in sets.items()},
 'splitsBySetup':{k:sorted(set(r['setupId'] for r in v)) for k,v in sets.items()},
 'scalerMean':sc.mean_.tolist(),'scalerScale':sc.scale_.tolist(),
 'layers':[{'weights':w.tolist(),'bias':b.tolist()} for w,b in zip(weights.coefs_,weights.intercepts_)],
 'activation':'tanh','outputActivation':'identity','comparisonMSE':metrics,
 'nonCausalWarning':'Sequence prefix is POST-TREATMENT: do not use to learn counterfactual Q(s,a) for initial action; reward includes first second and must not use outcome counters as input.'}
p=O/'FROZEN-SEQUENCE-PREFIX-NEURAL.json';p.write_text(json.dumps(out,indent=2)+'\n')
# Export holdout features/predictions for independent pure-JS parity & forensic review.
prows=[]
for i,row in enumerate(sets['holdout']):
 prows.append(dict(setupId=row['setupId'],featureValues=row['features'],reward=row['reward'],neural=float(predict('prefixNeuralMLP','holdout')[i])))
(O/'HOLDOUT-PREDICTIONS.json').write_text(json.dumps(prows,indent=2)+'\n')
(O/'NEURAL-EVALUATION.json').write_text(json.dumps(dict(schema='fpsarena-c35ag-descriptive-neural-evaluation-v1',splitSizes={k:len(v) for k,v in sets.items()},mse=metrics,
 forecastTarget='Factual 6s return conditional on first 1s realized commands',
 caution='Not a policy score; predictor sees first 1s post-assignment actions; no causal Q or production promotion'),indent=2)+'\n')
print(json.dumps(dict(splitSizes={k:len(v) for k,v in sets.items()},mse=metrics),indent=2))
