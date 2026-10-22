#!/usr/bin/env python3
"""C30: train only development, lock model before holdout. All results research-only."""
import json,hashlib,random,argparse,math
from pathlib import Path
import numpy as np
import torch
from torch import nn
ROOT=Path(__file__).resolve().parents[1];D=ROOT/'reports/c30/encounters'
WEAPONS=['mp5sd','m4a1','aa12','hk_sl8','uzi','l115a3']
FEATURE_NAMES=['distance/100','lagSeconds/.25','baseLateralVelocity/12','bodyYawLateralRatio']+[f'weapon={x}' for x in WEAPONS]
ACTIONS=['baseline','micro-left','micro-right']
def sha(b):return hashlib.sha256(b).hexdigest()
def load():
 p=json.loads((D/'PRE-REGISTERED-PLAN.json').read_text());idx=json.loads((D/'INDEX.json').read_text());
 f=D/'DEVELOPMENT.json';assert sha(f.read_bytes())==idx['developmentSHA256']
 d=json.loads(f.read_text());assert d['registrationSHA256']==p['registrationSHA256'];rows=d['rows'];
 assert len(rows)==864 and {r['scenario']['seed'] for r in rows}.isdisjoint({x['scenario']['seed'] for x in json.loads((D/'SEALED-HOLDOUT.json').read_text())['rows']})
 assert sum(x['split']=='train' for x in rows)==648 and sum(x['split']=='validation' for x in rows)==216
 return p,idx,rows
def features(s):
 d=s['distance'];assert d>0
 x=[d/100,s['lagSeconds']/.25,s['baseVelocity']/12,s['offset']/d]+[float(s['weaponId']==w) for w in WEAPONS]
 assert len(x)==10 and all(math.isfinite(z) for z in x)
 return x
def tensors(rows):
 return torch.tensor(np.array([features(x['scenario']) for x in rows]),dtype=torch.float32),torch.tensor(np.array([[a['cappedLoss']/150 for a in x['arms']] for x in rows]),dtype=torch.float32)
class Net(nn.Module):
 def __init__(self):
  super().__init__();self.net=nn.Sequential(nn.Linear(10,24),nn.Tanh(),nn.Linear(24,12),nn.Tanh(),nn.Linear(12,3),nn.Sigmoid())
 def forward(self,x):return self.net(x)
def policy_score(rows,choices):return float(np.mean([r['arms'][int(i)]['cappedLoss'] for r,i in zip(rows,choices)]))
def choice_away(rows):return [1 if r['scenario']['offset']<=0 else 2 for r in rows]
def run():
 p,idx,rows=load();tr=[r for r in rows if r['split']=='train'];val=[r for r in rows if r['split']=='validation']
 torch.set_num_threads(1);torch.manual_seed(300030);np.random.seed(300030);random.seed(300030);torch.use_deterministic_algorithms(True)
 xt,yt=tensors(tr);xv,yv=tensors(val);net=Net();opt=torch.optim.AdamW(net.parameters(),lr=.004,weight_decay=.003)
 bestLoss=float('inf');bestState=None;bestEpoch=0;patience=0;history=[]
 for epoch in range(1,601):
  opt.zero_grad();pred=net(xt);loss=nn.functional.smooth_l1_loss(pred,yt,beta=.12);loss.backward();opt.step()
  with torch.no_grad(): v=float(nn.functional.mse_loss(net(xv),yv))
  if epoch==1 or epoch%25==0:history.append({'epoch':epoch,'trainHuber':float(loss.detach()),'validationMSE':v})
  if v<bestLoss-1e-7:
   bestLoss=v;bestState={k:t.detach().clone() for k,t in net.state_dict().items()};bestEpoch=epoch;patience=0
  else:patience+=1
  if patience>=85:break
 net.load_state_dict(bestState)
 def neural(x):
  with torch.no_grad():return torch.argmin(net(tensors(x)[0]),dim=1).tolist()
 candidate={'baseline':[0]*len(val),'always-left':[1]*len(val),'always-right':[2]*len(val),
  'away-from-lateral':[1 if r['scenario']['offset']<=0 else 2 for r in val], 'neural':neural(val)}
 score={name:{'validationCappedLoss':policy_score(val,choices),'counts':{a:choices.count(i) for i,a in enumerate(ACTIONS)}} for name,choices in candidate.items()}
 chosen=min(score,key=lambda k:score[k]['validationCappedLoss'])
 weights={k:v.detach().tolist() for k,v in net.state_dict().items()}
 frozen={'schema':'fpsarena-c30-observable-state-value-v1','model':'MLP 10→24→12→3 sigmoid',
   'featureNames':FEATURE_NAMES,'weights':weights,'preselectedPolicy':chosen,
   'validation':score,'training':{'seed':300030,'bestEpoch':bestEpoch,'bestValidationMSE':bestLoss,
   'trainingRows':len(tr),'validationRows':len(val),'source':'independent server fireWeapon controlled encounters',
   'histogramCalibrationOnly':'C29 public features; NEVER C29 outcomes','history':history},
   'registrationSHA256':p['registrationSHA256'],'developmentSHA256':idx['developmentSHA256'],
   'sealedTestSHA256':idx['sealedHoldoutSHA256'],'isProductionPolicy':False}
 out=D/'FROZEN-POLICY.json';out.write_text(json.dumps(frozen,indent=2)+'\n')
 print(json.dumps({'chosen':chosen,'validationLoss':score,'frozen':str(out),'sha256':sha(out.read_bytes()),'bestEpoch':bestEpoch},indent=2))
if __name__=='__main__':run()
