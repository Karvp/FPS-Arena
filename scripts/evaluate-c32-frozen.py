#!/usr/bin/env python3
"""Sealed-test evaluation after model/choice is frozen. No post-test selection.

The same scenario supplies all three counterfactual outcomes; bootstrap resamples
whole independent scenario seeds, not individual arms or shots.
"""
import json,hashlib,math,sys
from pathlib import Path
import numpy as np
import torch

ROOT=Path(__file__).resolve().parents[1]
WEAPONS=['mp5sd','m4a1','aa12','hk_sl8','uzi','l115a3']
ACTIONS=['baseline','micro-left','micro-right']
def sha(b):return hashlib.sha256(b).hexdigest()
def neural(weights,x):
 w=weights
 for layer,nonlinear in [(0,'tanh'),(2,'tanh'),(4,'sigmoid')]:
  ww=np.asarray(w[f'net.{layer}.weight']);bb=np.asarray(w[f'net.{layer}.bias']);x=x@ww.T+bb
  x=np.tanh(x) if nonlinear=='tanh' else 1/(1+np.exp(-np.clip(x,-60,60)))
 return x

def choices(rows,name,frozen):
 n=len(rows);x=np.array([r['publicFeatures'] for r in rows]);assert x.shape==(n,14)
 if name=='baseline':return np.zeros(n,dtype=int)
 if name=='always-left':return np.ones(n,dtype=int)
 if name=='always-right':return np.full(n,2,dtype=int)
 if name=='cover-visibility':return np.where(x[:,6]<x[:,7],1,np.where(x[:,7]<x[:,6],2,0))
 if name=='away-from-body-bearing':return np.where(x[:,3]<=0,1,2)
 return np.argmin(neural(frozen['diagnosticNeuralWeights'][name],x),axis=1)
def metrics(rows,choose):
 y=np.array([[a['cappedLoss'] for a in r['arms']] for r in rows]);result=y[np.arange(len(rows)),choose]
 oracle=y.min(1);return {'count':len(rows),'cappedLossMean':float(np.mean(result)),
  'oracleMean':float(np.mean(oracle)),'regretMean':float(np.mean(result-oracle)),
  'actionCounts':{k:int(sum(choose==i)) for i,k in enumerate(ACTIONS)},
  'nonTiedFraction':float(np.mean(y.max(1)>y.min(1)))},result

def evaluate(group):
 d=ROOT/f'reports/c32/{group}';plan=json.loads((d/'PRE-REGISTERED-PLAN.json').read_text());index=json.loads((d/'INDEX.json').read_text());
 frozen=json.loads((d/'FROZEN-MODEL.json').read_text());testFile=d/'SEALED-HOLDOUT.json'
 assert index['registrationSHA256']==plan['registrationSHA256']==frozen['registrationSHA256']
 assert sha((d/'DEVELOPMENT.json').read_bytes())==index['developmentSHA256']==frozen['developmentSHA256']
 assert sha(testFile.read_bytes())==index['sealedTestSHA256']==frozen['sealedTestSHA256']
 obj=json.loads(testFile.read_text());assert obj['registrationSHA256']==plan['registrationSHA256'];rows=obj['rows']
 assert len(rows)==index['counts']['test']==(216 if group=='encounters' else 288)
 assert len({r['scenario']['seed'] for r in rows})==len(rows)
 assert set(r['scenario']['seed'] for r in rows).isdisjoint(set(x['scenario']['seed'] for x in json.loads((d/'DEVELOPMENT.json').read_text())['rows']))
 for r in rows:
  assert r['split']=='test' and len(r['arms'])==3 and len(r['publicFeatures'])==14
  assert [a['action'] for a in r['arms']]==ACTIONS
  assert all(0<=a['cappedLoss']<=150 for a in r['arms'])
 chosen=frozen['selection'];nnames=[k for k in frozen['candidates'] if k.startswith('neural-')]
 bestNeural=min(nnames,key=lambda k:frozen['candidates'][k]['damage'])
 names=['baseline','always-left','always-right','cover-visibility',chosen,bestNeural]
 names=list(dict.fromkeys(names))
 scores={};predictions={};outcomes={}
 for name in names:
  act=choices(rows,name,frozen);predictions[name]=act;scores[name],outcomes[name]=metrics(rows,act)
 selected=outcomes[chosen]
 comparisons={}
 rng=np.random.default_rng(320320)
 B=5000;n=len(rows)
 for name in ['baseline','always-left','always-right',bestNeural]:
  dif=outcomes[name]-selected # positive = frozen selected better (lower damage)
  resample=rng.integers(0,n,(B,n));interval=np.quantile(dif[resample].mean(1),[.025,.975]);
  comparisons[f'{chosen}-versus-{name}']={'selectedImprovementMean':float(dif.mean()),
   'bootstrap95':interval.tolist(),'unit':'independently seeded scenario; three arms paired'}
 perWeapon={}
 for w in WEAPONS:
  ids=np.array([i for i,r in enumerate(rows) if r['scenario']['weaponId']==w]);
  perWeapon[w]={'n':len(ids), 'selectedMean':float(selected[ids].mean()),
   'selectedActionCounts':{a:int(np.sum(predictions[chosen][ids]==k)) for k,a in enumerate(ACTIONS)},
   'bestNeuralActionCounts':{a:int(np.sum(predictions[bestNeural][ids]==k)) for k,a in enumerate(ACTIONS)},
   'bestNeuralMean':float(outcomes[bestNeural][ids].mean())}
 summary={'schema':'fpsarena-c32-sealed-evaluation-v1','group':group,
  'registrationSHA256':plan['registrationSHA256'], 'frozenSHA256':sha((d/'FROZEN-MODEL.json').read_bytes()),
  'selectionLockedBeforeTest':chosen,'bestNeuralByValidationLockedBeforeTest':bestNeural,
  'scores':scores,'pairedBootstrap':comparisons,'perWeapon':perWeapon,
  'neuralPromotionAllowed':False,'reason':'neural did not pass validation selection, independent full-game test not authorized',
  'limitations':['synthetic static covers and 1v1','per scenario random seeds; shared C31 calibration pool',
   'test data never used for model or policy selection']}
 path=d/'SEALED-EVALUATION.json';path.write_text(json.dumps(summary,indent=2)+'\n');return summary
if __name__=='__main__':
 results=[evaluate(s) for s in ['encounters','balanced']]
 # Distinct seed spaces for independent generated studies.
 pa=[json.loads((ROOT/f'reports/c32/{s}/PRE-REGISTERED-PLAN.json').read_text()) for s in ['encounters','balanced']]
 assert not ({x['scenario']['seed'] for x in pa[0]['scenarios']}&{x['scenario']['seed'] for x in pa[1]['scenarios']})
 for x in results:
  print(json.dumps({'group':x['group'],'locked':x['selectionLockedBeforeTest'],
   'diagnosticNeural':x['bestNeuralByValidationLockedBeforeTest'],'test':x['scores'],
   'selectedVsNeural':x['pairedBootstrap'][x['selectionLockedBeforeTest']+'-versus-'+x['bestNeuralByValidationLockedBeforeTest']]},indent=2))
