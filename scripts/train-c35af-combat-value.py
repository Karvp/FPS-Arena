#!/usr/bin/env python3
"""Offline-only factual 3s combat utility. Do not use for action control."""
from pathlib import Path
import json,csv,numpy as np,hashlib
from sklearn.linear_model import Ridge
from sklearn.neural_network import MLPRegressor
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import mean_squared_error,mean_absolute_error
R=Path(__file__).resolve().parents[1];O=R/'reports/c35af/frozen-54'
raw=list(csv.DictReader((O/'LONG-HORIZON-FACTUAL.csv').open()))
GUNS=['hk_sl8','l115a3','m4a1','mp5sd','aa12','uzi']
sets=sorted(set(r['setupId'] for r in raw));assert len(sets)==18
# Preregistered cohort has 3 setups per gun: index mod 3 gives train 0, val 1, heldout 2.
# This tiny 6-cluster holdout is for assessing predictive feasibility only.
partition=lambda r:('train' if int(r['setupId'][-2:])%3==0 else 'validation' if int(r['setupId'][-2:])%3==1 else 'holdout')
def vec(r,action=False):
 ads=1. if r['baselineADS']=='True' else 0.
 w=[float(r['gun']==g) for g in GUNS]
 x=[ads,min(120,float(r['targetRange'] or 0))/100,min(90,float(r['aimAngleDeg'] or 0))/90,min(12,float(r['speed'] or 0))/12,float(r['lagMs'])/250]+w
 if action:
  t=float(r['arm']=='toggle');x += [t,t*ads,t*(1-ads)]
 return x
# Exploratory utility: cap extreme L115A3 sniper headshots, retain kill/death signal.
# Not preregistered as primary estimand; raw damage remains unchanged in the audit.
def reward(r):
 dealt=float(r['damageDealt']);taken=float(r['damageTaken']);kills=float(r['kills']);deaths=float(r['deaths'])
 return (np.clip(dealt,0,300)-np.clip(taken,0,300)+100*(kills-deaths))/100
X={arm:np.array([vec(r,arm=='action') for r in raw]) for arm in ('state','action')}
y=np.array([reward(r) for r in raw]);splits={s:np.array([partition(r)==s for r in raw]) for s in ('train','validation','holdout')}
def score(model,x,mask):
 pred=model.predict(x[mask]);true=y[mask]
 return dict(n=int(mask.sum()),mse=round(float(mean_squared_error(true,pred)),6),mae=round(float(mean_absolute_error(true,pred)),6),meanTruth=round(float(true.mean()),6),meanPrediction=round(float(pred.mean()),6))
class Constant:
 def __init__(self,c):self.c=c
 def predict(self,x):return np.full(len(x),self.c)
base=Constant(float(y[splits['train']].mean()));scalers={};models={};metrics={}
metrics['constant']={'validation':score(base,X['state'],splits['validation']),'holdout':score(base,X['state'],splits['holdout'])}
for name,space,model in [('state_ridge','state',Ridge(alpha=50)),('action_ridge','action',Ridge(alpha=50)),('action_mlp','action',MLPRegressor(hidden_layer_sizes=(16,8),activation='tanh',solver='lbfgs',alpha=20.0,max_iter=700,random_state=20261014))]:
 sc=StandardScaler().fit(X[space][splits['train']]);scalers[name]=sc
 m=model.fit(sc.transform(X[space][splits['train']]),y[splits['train']]);models[name]=m
 metrics[name]={s:score(m,sc.transform(X[space]),splits[s]) for s in ('validation','holdout')}
chosen=min(('action_ridge','action_mlp'),key=lambda k:metrics[k]['validation']['mse'])
def serialize(name):
 model=models[name];sc=scalers[name]
 common={'featureSpace':'state' if name=='state_ridge' else 'action','scalerMean':sc.mean_.tolist(),'scalerScale':sc.scale_.tolist()}
 if isinstance(model,Ridge):return dict(common,type='ridge',coefficients=model.coef_.tolist(),intercept=float(model.intercept_))
 return dict(common,type='mlp-tanh',weights=[w.tolist() for w in model.coefs_],biases=[b.tolist() for b in model.intercepts_])
# run independent pure-numpy forward inference to confirm frozen exported model numerics
def forward(artifact,vector):
 z=(np.array(vector)-artifact['scalerMean'])/artifact['scalerScale']
 if artifact['type']=='ridge':return float(np.dot(z,artifact['coefficients'])+artifact['intercept'])
 for w,b in zip(artifact['weights'],artifact['biases']):
  z=z@np.array(w)+np.array(b)
  if len(b)!=1:z=np.tanh(z)
 return float(z.reshape(-1)[0])
arts={name:serialize(name) for name in models}
maxerr={name:max(abs(float(models[name].predict(scalers[name].transform(X['state' if name=='state_ridge' else 'action'][i:i+1]))[0])-forward(arts[name],X['state' if name=='state_ridge' else 'action'][i])) for i in np.where(splits['holdout'])[0]) for name in models}
assert max(maxerr.values())<1e-8,maxerr
out={'schema':'fpsarena-c35af-frozen-factual-three-second-models-v1','status':'OFFLINE_ONLY','trainingUnit':'factual nonoverlapping three-second ADS windows, clustered within setup','setupSplit':{'train':sorted({r['setupId'] for r in raw if partition(r)=='train'}),'validation':sorted({r['setupId'] for r in raw if partition(r)=='validation'}),'holdout':sorted({r['setupId'] for r in raw if partition(r)=='holdout'})},
 'sourceDatasetSHA256':hashlib.sha256((O/'LONG-HORIZON-FACTUAL.csv').read_bytes()).hexdigest(),'reward':'(clip(serverDamageDealt,0,300)-clip(serverDamageTaken,0,300)+100*(serverKills-serverDeaths))/100; EXPLORATORY; sniper damage capped',
 'stateFeatures':['initialADS','targetRangeOver100','aimAngleOver90','speedOver12','lagOver250']+['gun_'+g for g in GUNS],'actionExtraFeatures':['toggle','toggleTimesInitialADS','toggleTimesInitialHip'],
 'selectedByValidationMSE':chosen,'models':arts,'neverUseForProduction':True,
 'limitations':['Action model learned only from factual randomized assignments','Very small setup-level validation/holdout (6 each)','Reward is exploratory; not registered as causal primary endpoint','Within-match temporal dependence persists','Not a validated replacement for production controller']}
eval={'schema':'fpsarena-c35af-long-horizon-predictive-evaluation-v1','n':{k:int(v.sum()) for k,v in splits.items()},'scores':metrics,'selected':chosen,'serializationParityMaxAbsoluteError':maxerr,
 'actionValueSuperiorityOnHoldout':bool(metrics[chosen]['holdout']['mse']<metrics['state_ridge']['holdout']['mse']),
 'caveat':'Factual prediction error does not establish a counterfactual action advantage, even if lower; no policy played Game.step matches.'}
(O/'FROZEN-3S-COMBAT-MODELS.json').write_text(json.dumps(out,indent=2)+'\n')
(O/'NEURAL-EVALUATION.json').write_text(json.dumps(eval,indent=2)+'\n')
print(json.dumps(eval,indent=2))
