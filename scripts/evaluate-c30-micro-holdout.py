#!/usr/bin/env python3
"""One-time C30 sealed micro-lab test, freeze-before-test policy selection."""
import json,hashlib,sys,statistics,random
from pathlib import Path
import torch,numpy as np
ROOT=Path(__file__).resolve().parents[1];D=ROOT/'reports/c30/encounters'
W=['mp5sd','m4a1','aa12','hk_sl8','uzi','l115a3']
def sha(b):return hashlib.sha256(b).hexdigest()
def q(x,p):return sorted(x)[min(len(x)-1,int((len(x)-1)*p))]
def main():
 ix=json.loads((D/'INDEX.json').read_text());f=json.loads((D/'FROZEN-POLICY.json').read_text())
 assert f['developmentSHA256']==ix['developmentSHA256'];assert f['sealedTestSHA256']==ix['sealedHoldoutSHA256']
 assert sha((D/'SEALED-HOLDOUT.json').read_bytes())==ix['sealedHoldoutSHA256']
 data=json.loads((D/'SEALED-HOLDOUT.json').read_text());rows=data['rows'];assert len(rows)==216
 x=[]
 for r in rows:
  s=r['scenario'];x.append([s['distance']/100,s['lagSeconds']/.25,s['baseVelocity']/12,s['offset']/s['distance']]+[float(s['weaponId']==z) for z in W])
 p=torch.tensor(np.array(x),dtype=torch.float32);weights=f['weights'];
 with torch.no_grad():
  for i in [0,2,4]:
   p=p@torch.tensor(weights[f'net.{i}.weight'],dtype=torch.float32).T+torch.tensor(weights[f'net.{i}.bias'],dtype=torch.float32)
   p=torch.tanh(p) if i<4 else torch.sigmoid(p)
  choices=p.argmin(dim=1).tolist()
 policies={'baseline':[0]*len(rows),'always-left':[1]*len(rows),'always-right':[2]*len(rows),
  'away-from-lateral':[1 if r['scenario']['offset']<=0 else 2 for r in rows],'neural':choices}
 score={k:statistics.mean(row['arms'][a]['cappedLoss'] for row,a in zip(rows,ids)) for k,ids in policies.items()}
 rg=random.Random(3048);dif=[r['arms'][1]['cappedLoss']-r['arms'][a]['cappedLoss'] for r,a in zip(rows,choices)]
 bs=[statistics.mean(rg.choices(dif,k=len(dif))) for _ in range(8000)]
 out={'schema':'fpsarena-c30-sealed-micro-holdout-v1','testCount':len(rows),'meanCappedLoss':score,
  'validationWinner':f['preselectedPolicy'],'neuralVsValidationWinnerImprovement':statistics.mean(dif),
  'neuralVsWinnerBootstrap95':[q(bs,.025),q(bs,.975)],'noPostTestModelSelection':True,
  'labelSource':'server/main fireWeapon, simplified nuisance model; NOT full match'}
 (D/'MICRO-HOLDOUT-EVALUATION.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps(out,indent=2))
if __name__=='__main__':main()
