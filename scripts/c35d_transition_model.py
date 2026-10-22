#!/usr/bin/env python3
"""C35-D public-command transition research (NOT a combat/dodge policy).
Fit logistic ridge on TRAIN matches only; threshold chosen from VALIDATION; one sealed
HOLDOUT report. Future public-command labels never become input features.
"""
from __future__ import annotations
import argparse, hashlib, json, math
from collections import defaultdict
from pathlib import Path
import numpy as np
from scipy.optimize import minimize

FEATURES=['quietMs','priorityFraction500','priorityEdges1000','aim','moving']
SCHEMA='fpsarena-c35d-calibrated-public-priority-v1'

def vectors(rows, names=FEATURES):
    out=[]
    for r in rows:
        f=r['features']
        if not all(isinstance(f[k],(int,float)) and math.isfinite(f[k]) for k in FEATURES):
            raise ValueError('nonfinite/missing causal public feature')
        v=[math.log1p(min(5000,max(0,f['quietMs'])))/math.log1p(5000),
           min(1,max(0,f['priorityFraction500'])),
           min(10,max(0,f['priorityEdges1000']))/10,
           f['aim'],f['moving']]
        if not (0<=v[1]<=1 and v[3] in (0,1) and v[4] in (0,1)):
            raise ValueError('invalid features')
        out.append([1.]+[v[FEATURES.index(n)] for n in names])
    return np.asarray(out,dtype=float).reshape(-1,len(names)+1)

def sigmoid(z):
    return 1/(1+np.exp(-np.clip(z,-35,35)))

def fit(rows,names=FEATURES,regularization=5.):
    if not rows:raise ValueError('no train rows')
    x=vectors(rows,names); y=np.array([r['futurePriority'] for r in rows],dtype=float)
    if not np.isin(y,[0.,1.]).all():raise ValueError('future label must be binary')
    def objective(w):
        z=x@w; value=float(np.logaddexp(0,z).sum()-(z*y).sum()+.5*regularization*(w[1:]@w[1:]))
        grad=x.T@(sigmoid(z)-y)
        grad[1:]+=regularization*w[1:]
        return value,grad
    init=np.zeros(x.shape[1]);init[0]=math.log((sum(y)+.5)/(len(y)-sum(y)+.5))
    result=minimize(objective,init,jac=True,method='L-BFGS-B',options={'maxiter':600,'ftol':1e-12})
    if not result.success and np.linalg.norm(result.jac)>1e-4:raise RuntimeError('optimizer did not converge')
    return dict(featureNames=list(names),weights=[float(v) for v in result.x],n=len(rows),positives=int(sum(y)),ridge=regularization)

def probability(model,rows):
    return sigmoid(vectors(rows,model['featureNames'])@np.asarray(model['weights'])).tolist()

def metrics(rows,probs):
    if len(rows)!=len(probs) or not rows:raise ValueError('metric length or empty set')
    y=np.asarray([r['futurePriority'] for r in rows]);p=np.asarray(probs)
    if not np.isfinite(p).all() or np.any((p<0)|(p>1)):raise ValueError('invalid probabilities')
    bins=np.linspace(0,1,6); ece=0.
    for left,right in zip(bins[:-1],bins[1:]):
        select=(p>=left)&(p<right if right<1 else p<=right)
        if select.any():ece+=select.mean()*abs(float(p[select].mean()-y[select].mean()))
    return {'n':len(rows),'positives':int(sum(y)),'rate':round(float(y.mean()),6),
            'brier':round(float(np.mean((p-y)**2)),8),
            'logLoss':round(float(np.mean(-y*np.log(np.maximum(p,1e-9))-(1-y)*np.log(np.maximum(1-p,1e-9)))),8),
            'ece5':round(float(ece),8),'meanPrediction':round(float(p.mean()),8)}

def load_split(folder,plan):
    groups=defaultdict(list)
    for case in plan['cases']:
        fp=folder/'traces'/(case['id']+'.json')
        data=json.loads(fp.read_text())
        if data['schema']!='fpsarena-c35d-passive-public-traces-v1' or len(data['traces'])!=1:raise ValueError('dataset schema mismatch')
        t=data['traces'][0]
        if t['setupId']!=case['id'] or t['seed']!=case['seed'] or t['complete']!=len(t['rows']):raise ValueError('case mismatch')
        for r in t['rows']:
            if set(r['features'])!=set(FEATURES) or r['matchId']!=t['matchId'] or r['setupId']!=case['id'] or r['source']!='public-original-command-predecision':
                raise ValueError('feature provenance violation')
        groups[case['split']].extend(t['rows'])
    return groups

def analysis(folder):
    plan=json.loads((folder/'FROZEN-DESIGN.json').read_text())
    groups=load_split(folder,plan)
    train=groups['train'];val=groups['validation'];test=groups['holdout']
    full=fit(train);quiet=fit(train,['quietMs'])
    prevalence=(sum(r['futurePriority'] for r in train)+.5)/(len(train)+1)
    def check(rows):
        return {'constant':metrics(rows,[prevalence]*len(rows)),
                'quietOnly':metrics(rows,probability(quiet,rows)),
                'fullPublicHistory':metrics(rows,probability(full,rows))}
    validation=check(val)
    # This gate is preregistered; test is sealed and MUST NOT tune it.
    passed=(validation['fullPublicHistory']['brier']+0.001<validation['constant']['brier'] and
            validation['fullPublicHistory']['brier']+0.0005<validation['quietOnly']['brier'] and
            validation['fullPublicHistory']['ece5']<=0.08 and
            validation['fullPublicHistory']['positives']>=8)
    # Diagnostics only; no threshold tuning against holdout.
    ptest=probability(full,test)
    bands=[.02,.05,.1,.15,.25]
    coverage={str(t):{'n':sum(p<=t for p in ptest),
                      'fraction':round(sum(p<=t for p in ptest)/len(ptest),6),
                      'events':sum(r['futurePriority'] for r,p in zip(test,ptest) if p<=t)} for t in bands}
    return {'schema':'fpsarena-c35d-shadow-validation-v1','status':'RESEARCH_ONLY_PASSIVE_NO_CONTROL',
            'source':'future original/public commands from independent server Game.step traces',
            'splits':{k:len(v) for k,v in groups.items()},'models':{'full':full,'quiet':quiet,'constant':prevalence},
            'training':check(train),'validation':validation,'holdout':check(test),
            'lowRiskCoverageOnHoldout':coverage,'prospectiveArbitrationGate':'PASS_VALIDATION' if passed else 'FAIL_VALIDATION',
            'productionPromotion':'NO','neuralC36':'BLOCKED',
            'limitations':['future priority is an observable command proxy, not predicted hostile weapon hit',
             'sampled overlapping horizons require match-level uncertainty, not naive row confidence',
             'prediction risk alone does not show increased micro actuation or combat performance']}

if __name__=='__main__':
    a=argparse.ArgumentParser();a.add_argument('folder',type=Path);opt=a.parse_args()
    result=analysis(opt.folder)
    dest=opt.folder/'C35D-SHADOW-EVALUATION.json';dest.write_text(json.dumps(result,indent=2)+'\n')
    print('validation:',result['validation']);print('holdout:',result['holdout']);print('gate:',result['prospectiveArbitrationGate'])
