#!/usr/bin/env python3
"""C35-V observational (factual only) action-hit probability, no off-policy Q labels.
Selection/early-stopping on separate setup clusters, sealed holdout clusters.
This model is not eligible for online controller use.
"""
from pathlib import Path
import json,math,hashlib,argparse
import numpy as np
R=Path(__file__).resolve().parents[1];DEFAULT=R/'reports/c35v/factual-value-24-v1'
F=['distance','ageMs','angleDeg','hp','enemyCount','fire','aim','near','far','incumbentRadial','incumbentHeuristic']
C=['Shotgun','SMG','Assault Rifle'];A=['forward','backward','left','right']
def logistic(z):return 1/(1+np.exp(-np.clip(z,-30,30)))
def feats(x):
 f=x['features'];return [float(f[k]) for k in F]+[float(f['weaponCat']==c) for c in C]+[float(x['applied'][k]) for k in A]
def split(i):return 'test' if i%4==3 else 'val' if i%4==2 else 'train'
def load(root):
 design=json.loads((root/'FROZEN-DESIGN.json').read_text());rows=[];seen=set()
 for case in design['cases']:
  path=root/'matches'/f"{case['id']}.value.json"
  payload=json.loads(path.read_text());assert payload['schema']=='fpsarena-c35v-factual-value-traces-v1'
  for tr in payload['traces']:
   assert tr['counts']['changedFire']==0
   assert tr['counts']['eligible']==tr['counts']['completed']+tr['counts']['censored']
   for x in tr['rows']:
    assert x['setupId']==case['setupId'] and x['arm']==case['arm']
    assert all(v['factualOutcome'] is None for v in x['actions']),'COUNTERFACTUAL LABEL LEAK'
    if x['factual'] is None:continue
    assert x['factual']['source']=='SERVER_AFTER_STEP_OBSERVED_ACTION_ONLY'
    key=(x['setupId'],x['arm'],x['tick']);assert key not in seen;seen.add(key)
    v=feats(x);assert all(math.isfinite(n) for n in v)
    rows.append((split(int(x['setupId'][-2:])),x['setupId'],x['arm'],np.array(v),int(x['factual']['hitWindow'])))
 return rows,design

def evaluate(y,p):
 p=np.clip(p,1e-6,1-1e-6)
 return {'n':len(y),'positives':int(y.sum()),'baseRate':float(y.mean()),
  'brier':float(np.mean((p-y)**2)),'logLoss':float(-np.mean(y*np.log(p)+(1-y)*np.log(1-p)))}
def learn(root):
 rows,design=load(root);group={s:[r for r in rows if r[0]==s] for s in ['train','val','test']}
 assert all(group.values()),'empty split'
 def arr(s):return np.stack([r[3] for r in group[s]]),np.array([r[4] for r in group[s]],dtype=float)
 Xt,yt=arr('train');Xv,yv=arr('val');Xh,yh=arr('test');mu=Xt.mean(axis=0);std=Xt.std(axis=0);std=np.where(std<1e-6,1,std)
 Xt=(Xt-mu)/std;Xv=(Xv-mu)/std;Xh=(Xh-mu)/std
 baseline=yt.mean();pconst=np.full_like(yh,baseline,dtype=float)
 # Prior to seeing holdout: epochs and min_val_loss from setup-blocked validation.
 rng=np.random.default_rng(3512026);w1=rng.normal(0,.14,(Xt.shape[1],16));b1=np.zeros(16)
 w2=rng.normal(0,.14,(16,1));b2=np.zeros(1)
 params=[w1,b1,w2,b2];ms=[np.zeros_like(p) for p in params];vs=[np.zeros_like(p) for p in params]
 best=None;bestLoss=float('inf');bad=0;history=[]
 for epoch in range(1,251):
  for ids in np.array_split(rng.permutation(len(yt)),max(1,math.ceil(len(yt)/64))):
   xx=Xt[ids];yy=yt[ids,None];h=np.tanh(xx@w1+b1);p=logistic(h@w2+b2)
   delta=(p-yy)/len(ids);g2=h.T@delta+.002*w2;gb2=delta.sum(axis=0)
   z=(delta@w2.T)*(1-h*h);g1=xx.T@z+.002*w1;gb1=z.sum(axis=0)
   for param,grad,m,v in zip(params,[g1,gb1,g2,gb2],ms,vs):
    m[:]=.9*m+.1*grad;v[:]=.999*v+.001*grad**2
    param-=.008*(m/(1-.9**epoch))/(np.sqrt(v/(1-.999**epoch))+1e-8)
  pval=logistic(np.tanh(Xv@w1+b1)@w2+b2).ravel();valLoss=evaluate(yv,pval)['brier']
  if valLoss<bestLoss-1e-6:
   bestLoss=valLoss;best=[p.copy() for p in params];bestEpoch=epoch;bad=0
  else:bad+=1
  if epoch in [1,5,10,25,50,100,200]:history.append({'epoch':epoch,'validationBrier':valLoss})
  if bad>=35:break
 w1,b1,w2,b2=best
 pmlp=logistic(np.tanh(Xh@w1+b1)@w2+b2).ravel()
 # Frozen group-bootstrap test set, resampling SETUPS not rows (windows overlap).
 setups=sorted(set(r[1] for r in group['test']));idx={k:np.array([j for j,r in enumerate(group['test']) if r[1]==k]) for k in setups}
 rng=np.random.default_rng(601026);imp=[]
 for _ in range(4000):
  ids=np.concatenate([idx[k] for k in rng.choice(setups,len(setups),replace=True)])
  imp.append(float(np.mean((pconst[ids]-yh[ids])**2)-np.mean((pmlp[ids]-yh[ids])**2)))
 summary=dict(schema='fpsarena-c35v-factual-model-eval-v1',
  warning='OBSERVATIONAL factual returns only; no unbiased Q(s,a) or evidence of policy gain. Overlapping windows clustered by setup.',
  sources={'registrationSHA256':hashlib.sha256((root/'FROZEN-DESIGN.json').read_bytes()).hexdigest()},
  splits={s:{'setups':sorted(set(r[1] for r in group[s])), 'rows':len(group[s]),'positive':sum(r[4] for r in group[s])} for s in group},
  baseline={'holdout':evaluate(yh,pconst),'trainRate':float(baseline)},
  mlp={'holdout':evaluate(yh,pmlp),'bestEpoch':bestEpoch,'validationBrier':bestLoss},
  holdoutDifferenceBrier={'constantMinusMlp':float(np.mean((pconst-yh)**2)-np.mean((pmlp-yh)**2)),
   'bootstrap95':list(np.quantile(imp,[.025,.975])),'setups':len(setups)},
  history=history,promotion='BLOCKED: factual labels and heuristic alternatives do not identify counterfactual causal reward')
 model=dict(schema='fpsarena-c35v-factual-mlp-v1',features=F+[f'weapon-{c}' for c in C]+A,
  mean=mu.tolist(),std=std.tolist(),w1=w1.tolist(),b1=b1.tolist(),w2=w2.tolist(),b2=b2.tolist(),
  inference='OFFLINE DIAGNOSTIC ONLY; do not read in page-agent or controller')
 out=root/'models';out.mkdir(exist_ok=True)
 (out/'FROZEN-MLP.json').write_text(json.dumps(model,indent=2,sort_keys=True)+'\n')
 (out/'EVALUATION.json').write_text(json.dumps(summary,indent=2,sort_keys=True)+'\n')
 print(json.dumps({'splits':summary['splits'],'baseline':summary['baseline'],'mlp':summary['mlp'],
  'holdoutDifferenceBrier':summary['holdoutDifferenceBrier']},indent=2))
 return summary
if __name__=='__main__':
 ap=argparse.ArgumentParser();ap.add_argument('--root',type=Path,default=DEFAULT);learn(ap.parse_args().root)
