#!/usr/bin/env python3
"""Frozen-design, research-only MLP tactical critic with group-held-out CV.
No simulated counterfactual outcomes are used by the actor at runtime. This file
does NOT modify shipped Classic, V29 experts, or official server. Never run holdout.
"""
from __future__ import annotations
import hashlib, json, math, sys
from pathlib import Path
import numpy as np
import torch
from torch import nn

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/"data"/"v62"
AUD62=OUT/"v62-independent-audit.json"
AUD61=ROOT/"research"/"tdm-v61-audit-summary.json"
REG61=ROOT/"research"/"tdm-v61-frozen-registry.json"
REG62=ROOT/"research"/"tdm-v62-frozen-registry.json"
MODEL=ROOT/"research"/"tdm-v62-shadow-neural-critic.json"
EVAL=ROOT/"research"/"tdm-v62-shadow-evaluation.json"
DETAIL=OUT/"v62-shadow-predictions.json"
SEED=20261023
ARMS=("keep","close","strafe","withdraw")
MAPS=("arena","foundry","neon")
WEAPONS=("uzi","mp5sd","aa12","m4a1")
CUES=("aim-lock","post-fire","post-damage")
HIDDEN=10
EPOCHS=180
WEIGHT_DECAY=.03
LEARNING_RATE=.012
LOSS_HAZARD_WEIGHT=.6
UTILITY_REWARD={"kill":1.0,"death":-2.0,"damageTaken":-1/75.0}
PRE_REGISTRY_CHECK=True

def sha(path):
 h=hashlib.sha256()
 with Path(path).open("rb") as f:
  for b in iter(lambda:f.read(1<<20),b""):h.update(b)
 return h.hexdigest()

def require(ok,msg):
 if not ok:raise ValueError(msg)

def public_vector(case,f):
 require(f and f.get("valid") is True and f.get("cue") in CUES,"INVALID_PUBLIC_PRESTATE")
 def cap(x,lim,scale):
  if not isinstance(x,(int,float)) or not math.isfinite(float(x)): return lim/scale
  return min(lim,max(0,float(x)))/scale
 vec=[
  cap(f.get("distance"),100,100),
  cap(f.get("hp"),100,100),
  cap(f.get("maxRange"),175,175),
  cap(f.get("publicHostiles"),8,8),
  float(np.clip(f.get("aimAlignment") if isinstance(f.get("aimAlignment"),(int,float)) else 0,-1,1)),
  cap(f.get("ageSinceLastFire"),121,121),
  cap(f.get("ageSinceLastDamage"),121,121),
  cap(f.get("publicAimTicks"),120,120),
 ]
 vec += [float(case["map"]==x) for x in MAPS]
 vec += [float(case["weapon"]==x) for x in WEAPONS]
 vec += [float(f["cue"]==x) for x in CUES]
 return vec

def dataset():
 a61=json.loads(AUD61.read_text(encoding="utf-8"))
 a62=json.loads(AUD62.read_text(encoding="utf-8"))
 r61=json.loads(REG61.read_text(encoding="utf-8"))
 r62=json.loads(REG62.read_text(encoding="utf-8"))
 require(a61["allPass"] and a62["allPass"],"AUDITS_NOT_PASS")
 require(not a61.get("holdoutOpened",False) and not a62.get("holdoutOpened",False),"HOLDOUT_TOUCHED")
 require(a62["meetsPreregisteredDataGate"],"MINIMUM_DATA_GATE_NOT_PASSED")
 require(a62["sha256OfFrozenRegistry"]==sha(REG62),"REGISTRY_CHANGED_AFTER_AUDIT")
 prior={c["id"]:c for c in r61["cases"] if c["split"]=="discovery"}
 latter={c["id"]:c for c in r62["cases"] if c["split"]=="discovery"}
 groups=[]
 for audits,cases,folder in [(a61,prior,ROOT/"data"/"v61"),(a62,latter,OUT)]:
  for group in audits["groups"]:
   require(group["status"]=="PASS","INDEPENDENT_AUDIT_FAILURE")
   if group["trigger"] is None:continue
   case=cases[group["id"]]
   require(case["split"]=="discovery","HOLDOUT_IN_DATA")
   group_rows=[]
   for arm in ARMS:
    p=folder/(case["id"]+"-"+arm+".json")
    require(p.exists() and sha(p)==group["arms"][arm]["sha256"],f"RAW_SHA_MISMATCH {p}")
    result=json.loads(p.read_text(encoding="utf-8"))["results"][0]
    obs=result["tdmV61"]
    require(obs["complete"] is True and obs["triggerTick"]==group["trigger"],"CENSORED_SAMPLE")
    f=obs["triggerPublicFeatures"]
    vec=public_vector(case,f)
    out=obs["outcome"]
    require(out and all(isinstance(out.get(k), (int,float)) for k in ("kills","deaths","damageTaken")),"INVALID_OUTCOME")
    require(out["kills"]>=0 and out["deaths"]>=0 and out["damageTaken"]>=0,"NEGATIVE_COUNTER")
    util=out["kills"]-2*out["deaths"]-out["damageTaken"]/75.0
    hazard=float(out["deaths"]>0 or out["damageTaken"]>0)
    group_rows.append({"group":case["id"],"arm":arm,"state":vec,
     "utility":float(util),"hazard":hazard,"events":out,"triggerTick":obs["triggerTick"],
     "changedTicks":obs["changedTicks"],"fileSha256":sha(p)})
   assert len(group_rows)==4
   for row in group_rows[1:]:
    require(row["state"]==group_rows[0]["state"],"PUBLIC_PRESTATE_DIFFERS_ACROSS_ARMS")
   groups.append(group_rows)
 require(len(groups)>=16,"NOT_ENOUGH_INDEPENDENT_GROUPS")
 require(sum(any(row["hazard"]>0 or row["events"]["kills"]>0 for row in g) for g in groups)>=8,"NOT_ENOUGH_EVENT_GROUPS")
 return groups,a61,a62

class Critic(nn.Module):
 def __init__(self,dim):
  super().__init__()
  self.shared=nn.Sequential(nn.Linear(dim,HIDDEN),nn.Tanh())
  self.utility=nn.Linear(HIDDEN,1)
  self.hazard=nn.Linear(HIDDEN,1)
 def forward(self,x):
  h=self.shared(x)
  return self.utility(h).squeeze(-1),self.hazard(h).squeeze(-1)

def flat(groups, include_arm):
 xs=[]; ys=[]; hs=[]; names=[]; arms=[]
 for g in groups:
  for row in g:
   arm=np.eye(4,dtype=np.float32)[ARMS.index(row["arm"])]
   xs.append([*row["state"],*(arm if include_arm else [])])
   ys.append(row["utility"]);hs.append(row["hazard"])
   names.append(row["group"]);arms.append(row["arm"])
 return np.asarray(xs,dtype=np.float32),np.asarray(ys,dtype=np.float32),np.asarray(hs,dtype=np.float32),names,arms

def train_predict(x_train,y_train,h_train,x_test,model_seed):
 torch.manual_seed(model_seed)
 m=Critic(x_train.shape[1])
 optimizer=torch.optim.AdamW(m.parameters(),lr=LEARNING_RATE,weight_decay=WEIGHT_DECAY)
 xm=x_train.mean(axis=0)
 xs=x_train.std(axis=0)
 xs=np.where(xs>=.04,xs,1.0)
 tr=torch.tensor((x_train-xm)/xs,dtype=torch.float32)
 yt=torch.tensor(y_train,dtype=torch.float32)
 ht=torch.tensor(h_train,dtype=torch.float32)
 for _ in range(EPOCHS):
  optimizer.zero_grad()
  u,logit=m(tr)
  loss=torch.square(u-yt).mean()+LOSS_HAZARD_WEIGHT*nn.functional.binary_cross_entropy_with_logits(logit,ht)
  loss.backward()
  nn.utils.clip_grad_norm_(m.parameters(),3)
  optimizer.step()
 m.eval()
 with torch.no_grad():
  u,z=m(torch.tensor((x_test-xm)/xs,dtype=torch.float32))
  pred_util=u.numpy().astype(float).tolist()
  pred_hazard=torch.sigmoid(z).numpy().astype(float).tolist()
 return pred_util,pred_hazard,{"means":xm.tolist(),"scales":xs.tolist(),
  "weights":{k:v.detach().numpy().tolist() for k,v in m.state_dict().items()}}

def score(ys,hs,pu,ph):
 ys=np.asarray(ys);hs=np.asarray(hs);pu=np.asarray(pu);ph=np.asarray(ph)
 return {"utilityMSE":float(np.mean((ys-pu)**2)),
         "hazardBrier":float(np.mean((hs-ph)**2)),
         "sampleCount":len(ys),"hazardRate":float(hs.mean())}

def main():
 torch.set_num_threads(1)
 torch.use_deterministic_algorithms(True)
 groups,a61,a62=dataset()
 pred={"action":[],"state":[],"constant":[]}
 truth=[]
 for left in range(len(groups)):
  train=[g for i,g in enumerate(groups) if i!=left]
  test=[groups[left]]
  for model in ("action","state"):
   xa,ya,ha,_,_=flat(train,include_arm=model=="action")
   xt,yt,ht,_,_=flat(test,include_arm=model=="action")
   u,h,_=train_predict(xa,ya,ha,xt,SEED+left)
   pred[model].extend([{"utility":ui,"hazard":hi,"group":test[0][j]["group"],"arm":test[0][j]["arm"]} for j,(ui,hi) in enumerate(zip(u,h))])
  _,yt,ht,names,arms=flat(test,True)
  _,ytr,htr,_,_=flat(train,True)
  pred["constant"].extend([{"utility":float(ytr.mean()),"hazard":float(htr.mean()),"group":n,"arm":a} for n,a in zip(names,arms)])
  truth.extend([{"utility":float(y),"hazard":float(h),"group":n,"arm":a} for y,h,n,a in zip(yt,ht,names,arms)])
 measured={}
 for model in ("action","state","constant"):
  measured[model]=score([t["utility"] for t in truth],[t["hazard"] for t in truth],
                        [p["utility"] for p in pred[model]],[p["hazard"] for p in pred[model]])
  paired=[]
  for g in groups:
   ix=[i for i,t in enumerate(truth) if t["group"]==g[0]["group"]]
   paired.append({"group":g[0]["group"],
     "utilityMSE":float(np.mean([(truth[i]["utility"]-pred[model][i]["utility"])**2 for i in ix])),
     "hazardBrier":float(np.mean([(truth[i]["hazard"]-pred[model][i]["hazard"])**2 for i in ix]))})
  measured[model]["perGroup"]=paired
 # Draw paired bootstrap by independent seed groups, not individual arms.
 a=measured["action"]["perGroup"];s=measured["state"]["perGroup"]
 gen=np.random.default_rng(SEED)
 bootstrap={}
 for metric in ("utilityMSE","hazardBrier"):
  improvements=np.asarray([s[i][metric]-a[i][metric] for i in range(len(a))])
  means=np.asarray([gen.choice(improvements,len(improvements),replace=True).mean() for _ in range(12000)])
  bootstrap[metric]={"meanImprovementVsStateOnly":float(improvements.mean()),
   "pairedGroupBootstrap95CI":np.quantile(means,[.025,.975]).tolist(),
   "positiveGroupFraction":float((improvements>0).mean())}
 xa,ya,ha,_,_=flat(groups,True)
 _,_,_,_,_=flat(groups,False)
 pu,ph,final=train_predict(xa,ya,ha,xa,SEED)
 allow_shadow=bool(measured["action"]["utilityMSE"]<measured["state"]["utilityMSE"]
                   and measured["action"]["hazardBrier"]<measured["state"]["hazardBrier"]
                   and bootstrap["utilityMSE"]["pairedGroupBootstrap95CI"][0]>0
                   and bootstrap["hazardBrier"]["pairedGroupBootstrap95CI"][0]>0)
 model_doc={
  "schema":"fpsarena-v62-research-mlp-shadow-v1",
  "network":{"type":"MLP","layers":[len(xa[0]),HIDDEN,2],"activation":"tanh",
    "heads":["utility","hazard-logit"],"trainEpochs":EPOCHS,"lr":LEARNING_RATE,
    "adamwWeightDecay":WEIGHT_DECAY,"hazardBCEWeight":LOSS_HAZARD_WEIGHT},
  "inputs":{"publicStateFeatureCount":len(groups[0][0]["state"]),
    "actionOneHot":list(ARMS),"mapOneHot":list(MAPS),"weaponOneHot":list(WEAPONS),
    "cueOneHot":list(CUES),"fromBeforeActionOnly":True,"serverWitnessInputs":False},
  "targetUtility":"kills - 2*deaths - damageTaken/75 within 480 ticks after trigger",
  "targetHazard":"any damageTaken or death within registered 480-tick window",
  "seed":SEED,"fitGroupCount":len(groups),"fitSampleCount":len(xa),
  "frozenParentRegistrySha256":[sha(REG61),sha(REG62)],
  "featureNormalizationTrainOnlyInEveryFold":True,
  "classifierCalibration":"uncalibrated shadow, do not use probabilities as calibrated risk",
  "modelFit":final,
  "productionUse":False,"policyPromotion":False,
  "exploratoryHyperparametersNotPreregisteredBeforeInitialV62Outcomes":True
 }
 eval_doc={
  "schema":"fpsarena-v62-neural-group-loocv-v1",
  "registrySha256":[sha(REG61),sha(REG62)],
  "modelCodeSha256":sha(Path(__file__)),
  "decision":{"groupDataGatePassed":True,
   "actionCriticStrictGatePassed":allow_shadow,
   "promotionAllowed":False,
   "historicalHoldoutsOpened":False,
   "reason":"shadow candidate only; no prospective full-match safety trial"},
  "training":{"groups":len(groups),"armsPerGroup":4,"samples":len(xa),
    "positiveHazardArms":int(sum(t["hazard"]>0 for t in truth)),
    "positiveEventGroups":int(sum(any(v["hazard"]>0 or v["events"]["kills"]>0 for v in g) for g in groups)),
    "allFourActionsIncludedEvenWhenNotActuated":True,
    "rightCensoredNotIncludedInFitting":True},
  "cvDesign":"Leave one entire independent seed group out, 4 arms per test group",
  "metrics":{m:{k:v for k,v in measures.items() if k!="perGroup"} for m,measures in measured.items()},
  "pairedSeedBootstrap":bootstrap,
  "noPromotion":True,
  "limitations":["small observationally-selected contexts, not human or production matches",
    "post-branch RNG stream may diverge","model cannot identify causal effects out of distribution",
    "model hyperparameters chosen for exploratory demonstration after first cohort results were visible"]
 }
 MODEL.parent.mkdir(parents=True,exist_ok=True)
 MODEL.write_text(json.dumps(model_doc,indent=2,sort_keys=True)+"\n",encoding="utf-8")
 EVAL.write_text(json.dumps(eval_doc,indent=2,sort_keys=True)+"\n",encoding="utf-8")
 DETAIL.write_text(json.dumps({"truth":truth,"predicted":pred,"groupMetrics":measured},sort_keys=True,indent=2)+"\n",encoding="utf-8")
 print(json.dumps({"groups":len(groups),"samples":len(xa),"positiveHazardArms":eval_doc["training"]["positiveHazardArms"],
   "metrics":eval_doc["metrics"],"pairedBootstrap":bootstrap,
   "actionCriticStrictGatePassed":allow_shadow,"promotionAllowed":False},indent=2))
if __name__=="__main__":
 main()
