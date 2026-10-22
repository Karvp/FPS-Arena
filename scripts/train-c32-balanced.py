#!/usr/bin/env python3
"""Freeze a C32 model exclusively from development data; sealed test not loaded.

Selection metric is per-scenario validation capped damage, across predeclared
simple baselines + neural candidates; the test is read only after frozen weights.
"""
import hashlib,json,math,random
from pathlib import Path
import numpy as np
import torch
from torch import nn
ROOT=Path(__file__).resolve().parents[1];D=ROOT/'reports/c32/balanced'
WEAPONS=['mp5sd','m4a1','aa12','hk_sl8','uzi','l115a3']
FEATURE_NAMES=['distance/100','lagSeconds/.25','baseLateralVelocity/9','bodyYawLateralRatio',
 'publicBodyYawBearing/1.1','coverLineOfSightBaseline','coverLineOfSightLeft','coverLineOfSightRight']+[f'weapon={w}' for w in WEAPONS]
ACTIONS=['baseline','micro-left','micro-right']
def sha(x):return hashlib.sha256(x).hexdigest()
class Net(nn.Module):
 def __init__(self):
  super().__init__();self.net=nn.Sequential(nn.Linear(14,32),nn.Tanh(),nn.Linear(32,24),nn.Tanh(),nn.Linear(24,3),nn.Sigmoid())
 def forward(self,x):return self.net(x)
def features(r):
 x=r['publicFeatures']
 assert len(x)==14 and all(math.isfinite(n) for n in x)
 return x
def tensors(rows):
 return torch.tensor(np.array([features(r) for r in rows]),dtype=torch.float32),torch.tensor(np.array([[a['cappedLoss']/150 for a in r['arms']] for r in rows]),dtype=torch.float32)
def losses(rows):return np.array([[a['cappedLoss'] for a in r['arms']] for r in rows])
def evaluate(y,pred):return dict(damage=float(np.mean(y[np.arange(len(y)),pred])),regret=float(np.mean(y[np.arange(len(y)),pred]-y.min(axis=1))),
  counts={a:int(np.sum(pred==i)) for i,a in enumerate(ACTIONS)})
def deterministic_baselines(rows):
 n=len(rows);x=np.array([features(r) for r in rows]);g=np.array([r['scenario']['weaponId'] for r in rows]);
 return {'baseline':np.zeros(n,dtype=int),'always-left':np.ones(n,dtype=int),'always-right':np.full(n,2,dtype=int),
  'cover-visibility':np.where(x[:,6]<x[:,7],1,np.where(x[:,7]<x[:,6],2,0)),
  'away-from-body-bearing':np.where(x[:,3]<=0,1,2)}
def run():
 plan=json.loads((D/'PRE-REGISTERED-PLAN.json').read_text());idx=json.loads((D/'INDEX.json').read_text());dev=D/'DEVELOPMENT.json'
 assert sha(dev.read_bytes())==idx['developmentSHA256']
 obj=json.loads(dev.read_text());assert obj['registrationSHA256']==plan['registrationSHA256'];rows=obj['rows']
 train=[r for r in rows if r['split']=='train'];val=[r for r in rows if r['split']=='validation']
 assert len(train)==864 and len(val)==288
 assert len(set(r['scenario']['seed'] for r in train+val))==1152
 torch.set_num_threads(1);torch.use_deterministic_algorithms(True)
 xt,yt=tensors(train);xv,yv=tensors(val);y=np.array(losses(val));records=[]
 choices=deterministic_baselines(val)
 for seed in (322032,322132,322232,322332):
  torch.manual_seed(seed);np.random.seed(seed);random.seed(seed)
  net=Net();opt=torch.optim.AdamW(net.parameters(),lr=.004,weight_decay=.003)
  best=(float('inf'),None,None);patience=0
  for epoch in range(1,501):
   net.train();opt.zero_grad();p=net(xt)
   # Emphasize differences among actions; near-ties add no ranking signal.
   relative=p-p.mean(dim=1,keepdim=True);real=yt-yt.mean(dim=1,keepdim=True)
   weight=(yt.max(dim=1).values-yt.min(dim=1).values).clamp(min=.05)
   loss=nn.functional.smooth_l1_loss(p,yt,beta=.08)+.65*torch.mean(weight[:,None]*(relative-real)**2)
   loss.backward();opt.step()
   with torch.no_grad():
    net.eval();q=net(xv);v=float(nn.functional.mse_loss(q,yv))
   if v<best[0]-1e-8:
    best=(v,{k:z.detach().clone() for k,z in net.state_dict().items()},epoch);patience=0
   else:patience+=1
   if patience>=75:break
  net.load_state_dict(best[1]);net.eval()
  with torch.no_grad():pred=net(xv).argmin(dim=1).numpy()
  name=f'neural-{seed}';choices[name]=pred
  records.append({'seed':seed,'bestEpoch':best[2],'bestValMSE':best[0], 'weights':{k:v.tolist() for k,v in best[1].items()},'name':name})
 scores={name:evaluate(y,pred) for name,pred in choices.items()}
 # Compare selection on validation only, tie broken toward simpler baseline.
 preference=['baseline','always-left','always-right','cover-visibility','away-from-body-bearing']+[x['name'] for x in records]
 selected=min(preference,key=lambda name:(scores[name]['damage'],preference.index(name)))
 selectedNet=next((r for r in records if r['name']==selected),None)
 frozen={'schema':'fpsarena-c32-cover-value-v1','registrationSHA256':plan['registrationSHA256'],
  'developmentSHA256':idx['developmentSHA256'],'sealedTestSHA256':idx['sealedTestSHA256'],
  'features':FEATURE_NAMES,'architecture':'MLP 14→32→24→3 sigmoid',
  'modelSelection':'lowest mean validation capped loss; explicit simpler-baseline tie break',
  'candidates':{k:{**v} for k,v in scores.items()},'selection':selected,
  'neuralChosen':bool(selectedNet),'modelWeights':selectedNet['weights'] if selectedNet else None,
  'neuralCandidateTraining':[{k:v for k,v in r.items() if k!='weights'} for r in records],
  'trainingOnly':'C32 DEVELOPMENT.json, no C32 sealed test ever read for selection',
  'source':'actual official fireWeapon() + shared stepMove(), synthetic controlled encounter',
  'notForProduction':True}
 # Preserve all candidate weights for diagnostic frozen validation tests, never
 # select a new winner with sealed test outcome later.
 frozen['diagnosticNeuralWeights']={r['name']:r['weights'] for r in records}
 path=D/'FROZEN-MODEL.json';path.write_text(json.dumps(frozen,indent=2)+'\n')
 print(json.dumps({'chosen':selected,'meanValidationLoss':scores[selected]['damage'],
  'baselines':scores,'registrationSHA256':plan['registrationSHA256'],'frozenSHA256':sha(path.read_bytes())},indent=2))
if __name__=='__main__':run()
