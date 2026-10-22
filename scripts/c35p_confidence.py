#!/usr/bin/env python3
"""C35-P: honest shot-level selective calibration of PUBLIC pre-step target cues.
Never uses server features for prediction; server shot truth supplies labels offline only.
"""
from __future__ import annotations
import hashlib, json, math, sys
from collections import defaultdict
from pathlib import Path
import numpy as np

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
from c35o_freshness_analysis import load,dump,join_case,sha
OUT=ROOT/'reports/c35p/confidence-holdout-v1'
SOURCE=ROOT/'reports/c35o/paired-latency-48'
FEATURES=('age100ms','angle10deg','available','motionMeters','hasProjection')
MODEL_VERSION='fpsarena-c35p-public-candidate-confidence-v1'

def fields(candidate):
    """Feature whitelist: no hit/shot/pellet/authoritative fields, only C35-O public pre-step."""
    if not candidate.get('eligible'): return None
    vals=[candidate.get('age'),candidate.get('aimAngleDeg'),candidate.get('available'),candidate.get('projectedDisplacement'),candidate.get('projectedAimId')]
    if not isinstance(vals[0],(int,float)) or not isinstance(vals[1],(int,float)) or not isinstance(vals[2],int):return None
    if vals[0]<0 or not math.isfinite(vals[0]) or not math.isfinite(vals[1]) or vals[2]<1:return None
    move=vals[3] if isinstance(vals[3],(int,float)) and math.isfinite(vals[3]) and vals[3]>=0 else 0.
    return np.array([min(4.,vals[0]*10),min(18.,max(0.,vals[1]/10)),min(12,vals[2]),min(2.,move),int(vals[4] is not None)],dtype=float)

def sigmoid(a):return 1./(1.+np.exp(-np.clip(a,-35,35)))

def train(rows,head,subset,penalty=3.,columns=None):
    indices=list(columns if columns is not None else range(len(FEATURES)))
    selected=[r for r in rows if r['split']=='train' and r['features'] is not None and r[head] is not None]
    if not selected: raise ValueError('empty train subset')
    X=np.stack([r['features'][indices] for r in selected]); y=np.array([r[head] for r in selected]);
    mu=X.mean(0);std=X.std(0);std=np.where(std<.01,1.,std)
    z=(X-mu)/std;Z=np.column_stack([np.ones(len(X)),z]);beta=np.zeros(Z.shape[1]);beta[0]=math.log((y.sum()+.5)/(len(y)-y.sum()+.5));
    for _ in range(90):
        p=sigmoid(Z@beta);weight=np.clip(p*(1-p),1e-7,None)
        grad=Z.T@(p-y)+np.r_[0.,np.full(Z.shape[1]-1,penalty)]*beta
        hess=(Z.T*weight)@Z+np.diag(np.r_[1e-8,np.full(Z.shape[1]-1,penalty)])
        delta=np.linalg.solve(hess,grad);beta-=delta
        if np.max(np.abs(delta))<1e-9:break
    return {'columns':indices,'mu':mu.tolist(),'sd':std.tolist(),'coef':beta.tolist(),'penalty':penalty,'trainingN':len(selected),'trainingPositiveRate':float(y.mean())}

def predict(model,x):
    if x is None:return None
    z=(x[model['columns']]-np.array(model['mu']))/np.array(model['sd']);return float(sigmoid(np.dot(np.r_[1.,z],model['coef'])))

def describe(rows,head,predictor):
    relevant=[(r[head],predictor(r)) for r in rows if r['features'] is not None and r[head] is not None];v=[(float(a),float(b)) for a,b in relevant if b is not None]
    if not v:return {'n':0,'brier':None,'logloss':None,'ece5':None,'positiveRate':None}
    y=np.array([a for a,b in v]);p=np.array([b for a,b in v]);p=np.clip(p,1e-6,1-1e-6)
    ece=sum((mask.sum()/len(y))*abs(y[mask].mean()-p[mask].mean()) for i in range(5) if (mask:=(p>=i/5)&(p<(i+1)/5)).any())
    return {'n':len(y),'positiveRate':float(y.mean()),'brier':float(np.mean((p-y)**2)),
     'logloss':float(np.mean(-y*np.log(p)-(1-y)*np.log(1-p))),'ece5':float(ece)}

def prepare():
    plan=load(SOURCE/'FROZEN-DESIGN.json');raw=[]
    setups=sorted(set(c['setupId'] for c in plan['cases']))
    # 3 validation + 3 holdout setups, each includes all four latencies.
    train_ids=[x for i,x in enumerate(setups) if i%4 in (2,3)]
    val_ids=[x for i,x in enumerate(setups) if i%4==1]
    holdout_ids=[x for i,x in enumerate(setups) if i%4==0]
    # Public shot candidate at max 350ms is the single, frozen evaluation window.
    for c in plan['cases']:
        shots,audit=join_case(c,SOURCE/'matches')
        split='holdout' if c['setupId'] in holdout_ids else 'validation' if c['setupId'] in val_ids else 'train'
        for s in shots:
            pub=s['candidates']['350'];x=fields(pub)
            a=s['agreement']['350']['aim']
            # Never invent target correctness for a miss, an unavailable candidate, or a 50/50 pellet split.
            identity=None if not s['hasPlayerHit'] or x is None or a is None or abs(a-.5)<1e-8 else int(a>.5)
            raw.append({'setup':c['setupId'],'case':c['id'],'split':split,'lagMs':c['lagMs'],'features':x,
              'hit':int(s['hasPlayerHit']) if x is not None else None,'identity':identity,
              'hasCandidate':x is not None,'pellets':s['pellets'],'foam':s['dynamicFoamPellets'],'ambiguous':s['hasPlayerHit'] and a==.5})
    return raw,{'train':train_ids,'validation':val_ids,'holdout':holdout_ids}

def run(write=True):
    rows,splits=prepare();output={'schema':'fpsarena-c35p-offline-holdout-calibration-v1','parentC35ORegistrationSHA256':sha(SOURCE/'FROZEN-DESIGN.json'),
       'sourceC35O':{'matches':48,'setups':12},'splitSetups':splits,'featureWhitelist':list(FEATURES),
       'predictionBoundary':'public C35O candidate computed before Game.step; post-step hit/pellet labels unavailable to predictor',
       'abstention':'shot misses have no target identity; 50/50 pellet target ties abstain; no valid candidate abstains',
       'caveats':['3 held-out setup clusters only: exploratory, not deployment-grade uncertainty','hit and identity are observational associations, not counterfactual policy values','same maps and weapons repeat across splits; no OOD generalization claim'],
       'shots':len(rows),'coverage':{},'heads':{}}
    for split in ('train','validation','holdout'):
        grp=[r for r in rows if r['split']==split];output['coverage'][split]={'shotCount':len(grp),'eligible':sum(r['hasCandidate'] for r in grp),'hitShots':sum(r['hit']==1 for r in grp),
         'identityScored':sum(r['identity'] is not None for r in grp),'ambiguousHits':sum(r['ambiguous'] for r in grp)}
    frozen={'schema':MODEL_VERSION,'trainedOnlyOn':'c35o train setup IDs','features':list(FEATURES),'noPolicyPromotion':True,'heads':{},'selection':{}}
    for head in ('hit','identity'):
        tr=[r for r in rows if r['split']=='train' and r[head] is not None and r['features'] is not None]
        constant=sum(r[head] for r in tr)/len(tr)
        best=None
        for cls in ('age-only','full'):
            cols=[0] if cls=='age-only' else None
            for lam in (1.,10.,50.):
                model=train(rows,head,'train',penalty=lam,columns=cols)
                brier=describe([r for r in rows if r['split']=='validation'],head,lambda r:predict(model,r['features']))['brier']
                candidate={'kind':cls,'penalty':lam,'model':model,'brier':brier}
                if best is None or (brier,cls,lam)<(best['brier'],best['kind'],best['penalty']):best=candidate
        frozen['heads'][head]=best['model'];frozen['selection'][head]={'type':best['kind'],'penalty':best['penalty'],'validationBrier':best['brier']}
        output['heads'][head]={'constantTrainingPrevalence':constant,'selection':frozen['selection'][head],'splits':{}}
        for sp in ('train','validation','holdout'):
            grp=[r for r in rows if r['split']==sp]
            out={'constant':describe(grp,head,lambda _:constant),
                 'ageOnly':describe(grp,head,lambda r:predict(train(rows,head,'train',penalty=10.,columns=[0]),r['features'])),
                 'selected':describe(grp,head,lambda r:predict(best['model'],r['features']))}
            if sp=='holdout':
                out['byLag']={str(lag):describe([r for r in grp if r['lagMs']==lag],head,lambda r:predict(best['model'],r['features'])) for lag in (30,85,150,215)}
            output['heads'][head]['splits'][sp]=out
    if write:
        OUT.mkdir(parents=True,exist_ok=True);dump(OUT/'FROZEN-PUBLIC-CONFIDENCE.json',frozen)
        dump(OUT/'CALIBRATION-REPORT.json',output)
        # Train/validation/holdout metadata only; do not redistribute authoritative hit labels in model.
        dump(OUT/'SPLIT-REGISTRATION.json',{'schema':'fpsarena-c35p-setup-splits-v1','source':str(SOURCE.relative_to(ROOT)),
          'splitSetups':splits,'frozenBaselineSHA256':sha(SOURCE/'FROZEN-DESIGN.json'),'holdoutExcludedFromTrainingAndSelection':True})
    return output
if __name__=='__main__':print(json.dumps(run(),indent=2))
