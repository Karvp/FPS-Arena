#!/usr/bin/env python3
"""V63 prospective *discovery* test of an ALREADY FIT and FROZEN shrinkage critic.

Frozen model from v61/v62 only. This script NEVER fits on this cohort and
cannot run existing sealed holdout seeds. It reports negative outcomes equally.
"""
from __future__ import annotations
import concurrent.futures
import hashlib, json, sys
from pathlib import Path
import numpy as np
import tdm_v61_protocol as replay
from tdm_v62_train_shadow import public_vector,ARMS as ACTIONS
from tdm_v63_contrastive import predict,decision,boot

ROOT=Path(__file__).resolve().parents[1]
DATA=ROOT/"data"/"v63"
DATA.mkdir(parents=True,exist_ok=True)
MODEL=ROOT/"research"/"tdm-v63-contrast-model.json"
REG=ROOT/"research"/"tdm-v63-prospective-registry.json"
REPORT=ROOT/"research"/"tdm-v63-prospective-evaluation.json"
AUDIT=ROOT/"research"/"tdm-v63-prospective-audit.json"
ARMS=tuple(ACTIONS)
PROSPECTIVE=[
 {"id":"v63-pro-arena-mp5sd-01","map":"arena","weapon":"mp5sd","stratum":"aim-lock","seed":630101,"split":"prospective-discovery"},
 {"id":"v63-pro-arena-mp5sd-02","map":"arena","weapon":"mp5sd","stratum":"aim-lock","seed":630102,"split":"prospective-discovery"},
 {"id":"v63-pro-arena-mp5sd-03","map":"arena","weapon":"mp5sd","stratum":"aim-lock","seed":630103,"split":"prospective-discovery"},
 {"id":"v63-pro-arena-mp5sd-04","map":"arena","weapon":"mp5sd","stratum":"aim-lock","seed":630104,"split":"prospective-discovery"},
 {"id":"v63-pro-foundry-uzi-05","map":"foundry","weapon":"uzi","stratum":"aim-lock","seed":630105,"split":"prospective-discovery"},
 {"id":"v63-pro-foundry-uzi-06","map":"foundry","weapon":"uzi","stratum":"aim-lock","seed":630106,"split":"prospective-discovery"},
 {"id":"v63-pro-foundry-uzi-07","map":"foundry","weapon":"uzi","stratum":"aim-lock","seed":630107,"split":"prospective-discovery"},
 {"id":"v63-pro-foundry-uzi-08","map":"foundry","weapon":"uzi","stratum":"aim-lock","seed":630108,"split":"prospective-discovery"},
 {"id":"v63-pro-foundry-fire-09","map":"foundry","weapon":"uzi","stratum":"post-fire","seed":630109,"split":"prospective-discovery"},
 {"id":"v63-pro-foundry-fire-10","map":"foundry","weapon":"uzi","stratum":"post-fire","seed":630110,"split":"prospective-discovery"},
 {"id":"v63-pro-arena-uzi-11","map":"arena","weapon":"uzi","stratum":"aim-lock","seed":630111,"split":"prospective-discovery"},
 {"id":"v63-pro-arena-uzi-12","map":"arena","weapon":"uzi","stratum":"aim-lock","seed":630112,"split":"prospective-discovery"},
 {"id":"v63-pro-neon-m4a1-13","map":"neon","weapon":"m4a1","stratum":"post-fire","seed":630113,"split":"prospective-discovery"},
 {"id":"v63-pro-foundry-aa12-14","map":"foundry","weapon":"aa12","stratum":"aim-lock","seed":630114,"split":"prospective-discovery"},
]
PROTECTED=[
 "lab/arena/tdm-stratified-replay-v60.mjs",
 "lab/arena/tdm-engagement-trigger-v61.mjs",
 "lab/arena/train-main-v61.mjs",
 "scripts/tdm_v61_protocol.py",
 "scripts/tdm_v62_cohort.py",
 "scripts/tdm_v62_train_shadow.py",
 "scripts/tdm_v63_contrastive.py",
 "scripts/tdm_v63_prospective.py",
 "research/tdm-v63-contrast-model.json",
 "research/tdm-v63-retrospective-evaluation.json",
 "page-agent.js",
 "lab/arena/source-main/server/game.js",
 "lab/arena/source-main/server/bot.js",
]

def sha(p):
 h=hashlib.sha256()
 with Path(p).open("rb") as file:
  for chunk in iter(lambda:file.read(1<<20),b""):h.update(chunk)
 return h.hexdigest()
def require(condition,msg):
 if not condition:raise ValueError(msg)
def register():
 require(not REG.exists(),"FROZEN_REGISTRY_ALREADY_EXISTS")
 replay.verify()
 parent=json.loads((ROOT/"research"/"tdm-v62-frozen-registry.json").read_text("utf-8"))
 older=json.loads((ROOT/"research"/"tdm-v61-frozen-registry.json").read_text("utf-8"))
 old60=json.loads((ROOT/"research"/"tdm-v60-frozen-registry.json").read_text("utf-8"))
 existed={row["seed"] for r in (parent,older,old60) for row in r["cases"]}
 require(all(case["seed"] not in existed for case in PROSPECTIVE),"SEED_REUSE_FOUND")
 require(len(set(x["seed"] for x in PROSPECTIVE))==len(PROSPECTIVE),"DUPLICATE_SEED")
 obj={
  "schema":"fpsarena-v63-prospective-independent-seed-assessment-v1",
  "status":"preregistered before the first prospective v63 Game.step run",
  "frozenContrastModelSHA256":sha(MODEL),
  "parentV61RegistrySHA256":sha(ROOT/"research"/"tdm-v61-frozen-registry.json"),
  "parentV62RegistrySHA256":sha(ROOT/"research"/"tdm-v62-frozen-registry.json"),
  "protectedSHA256":{s:sha(ROOT/s) for s in PROTECTED},
  "arms":list(ARMS),"cases":PROSPECTIVE,"outcomeTicks":480,
  "modelTraining":"ALREADY_FIT on 23 independent historical groups ONLY; no retraining on these seeds",
  "outcomeMetrics":["utilityMSE","hazardBrier","pairedObservedUtilityGainVsKeep","pairedObservedHazardDeltaVsKeep"],
  "hypotheses":{
   "actionContrastBeatsConstantOnUtilityMSE":True,
   "actionContrastNotWorseThanConstantOnHazardBrier":True,
   "policyPairedUtilityGainVsKeepPositiveWithCI":True,
   "noObservedHazardIncrease":True},
  "selectionGate":"no automatic promotion even if all hypotheses hold",
  "oldSealedHoldouts":"never touched; all 14 new seeds are prospective discovery verification only",
  "rightCensoredHandling":"exclude incomplete outcome windows; report count; do not drop silent/no-trigger groups",
  "unit":"independent matched four-arm seed group, no tick pseudoreplication"
 }
 REG.write_text(json.dumps(obj,sort_keys=True,indent=2)+"\n",encoding="utf-8")
 return obj
def validate():
 obj=json.loads(REG.read_text("utf-8"))
 require(obj["cases"]==PROSPECTIVE,"REGISTRY_CASE_MODIFIED")
 require(obj["arms"]==list(ARMS),"ARMS_MODIFIED")
 require(sha(MODEL)==obj["frozenContrastModelSHA256"],"MODEL_MODIFIED_AFTER_FREEZE")
 for rel,dig in obj["protectedSHA256"].items():
  require(sha(ROOT/rel)==dig,"PROTECTED_SOURCE_MODIFIED:"+rel)
 require(obj["parentV61RegistrySHA256"]==sha(ROOT/"research"/"tdm-v61-frozen-registry.json"),"PARENT_V61_CHANGED")
 require(obj["parentV62RegistrySHA256"]==sha(ROOT/"research"/"tdm-v62-frozen-registry.json"),"PARENT_V62_CHANGED")
 replay.verify()
 return obj
def with_data():
 replay.DATA=DATA
def outpath(case,arm):
 return DATA/(case["id"]+"-"+arm+".json")
def runone(case,arm):
 with_data()
 return replay.run(case,arm)
def run(subset):
 validate()
 allowed={c["id"] for c in PROSPECTIVE}
 wanted=set(subset)
 require(not wanted or wanted<=allowed,"UNKNOWN_OR_OLD_HOLDOUT_FORBIDDEN")
 selected=[c for c in PROSPECTIVE if not wanted or c["id"] in wanted]
 for case in selected:
  # Re-running a prior output fails closed, not silently overwritten.
  for arm in ARMS:require(not outpath(case,arm).exists(),"RESULT_ALREADY_EXISTS:"+case["id"])
  with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
   for future in concurrent.futures.as_completed([pool.submit(runone,case,arm) for arm in ARMS]):
    print("RUN",json.dumps(future.result(),sort_keys=True),flush=True)
def audit():
 obj=validate()
 with_data()
 done=[]
 for case in PROSPECTIVE:
  if all(outpath(case,arm).exists() for arm in ARMS):
   done.append(replay.audit_case(case))
 require(len(done)>0,"NOTHING_COMPLETED")
 valid=all(g["status"]=="PASS" for g in done)
 trigger=sum(g["trigger"] is not None for g in done)
 events=sum(g["event"] for g in done)
 report={"schema":"fpsarena-v63-prospective-four-arm-audit-v1",
  "registrySha256":sha(REG),"frozenModelSha256":obj["frozenContrastModelSHA256"],
  "groups":done,"completedGroups":len(done),"allPass":valid,
  "triggeredGroups":trigger,"eventPositiveGroups":events,
  "untouchedOldHoldouts":True,"productionPromotion":False}
 AUDIT.write_text(json.dumps(report,sort_keys=True,indent=2)+"\n",encoding="utf-8")
 return report

def evaluate():
 pre=audit()
 require(pre["allPass"],"INDEPENDENT_AUDIT_FAILED")
 frozen=json.loads(MODEL.read_text("utf-8"))
 models=frozen["modelVariants"]
 assert set(models)=={"constant","state","armOnly","armContext"}
 groups=[]
 nonTriggered=[]
 for case in PROSPECTIVE:
  observed=next((g for g in pre["groups"] if g["id"]==case["id"]),None)
  if observed is None:raise ValueError("INCOMPLETE_PROSPECTIVE_COHORT")
  if observed["trigger"] is None:
   nonTriggered.append(case["id"])
   continue
  group=[]
  for arm in ARMS:
   p=outpath(case,arm)
   data=json.loads(p.read_text("utf-8"))["results"][0]["tdmV61"]
   require(data["complete"],"RIGHT_CENSORED")
   require(data["triggerPublicFeatures"]["valid"] is True,"PUBLIC_INPUT_INVALID")
   state=public_vector(case,data["triggerPublicFeatures"])
   outcome=data["outcome"]
   group.append({
    "group":case["id"],"arm":arm,"state":state,
    "utility":float(outcome["kills"]-2*outcome["deaths"]-outcome["damageTaken"]/75),
    "hazard":float(outcome["damageTaken"]>0 or outcome["deaths"]>0),
    "rawOutcome":outcome,"rawSha256":sha(p)})
  require(len({tuple(x["state"]) for x in group})==1,"MISMATCH_PUBLIC_PRESTATE")
  groups.append(group)
 require(len(groups)>0,"NO_TRIGGERED_GROUPS")
 evaluation={}
 for variant,model in models.items():
  observed=[]
  for group in groups:
   pu,ph=predict(model,group)
   ix=list(ARMS).index(decision(pu,ph))
   y=np.array([x["utility"] for x in group],dtype=float)
   h=np.array([x["hazard"] for x in group],dtype=float)
   observed.append({
    "group":group[0]["group"],"predictedUtility":pu,"predictedHazard":ph,
    "selectedArm":ARMS[ix],"policyGain":float(y[ix]-y[0]),
    "policyHazardDelta":float(h[ix]-h[0]),
    "bestArmRegret":float(max(y)-y[ix]),
    "utilityMSE":float(np.mean((y-np.array(pu))**2)),
    "hazardBrier":float(np.mean((h-np.array(ph))**2)),
    "rewardByArm":dict(zip(ARMS,y.tolist())),"hazardByArm":dict(zip(ARMS,h.tolist()))})
  evaluation[variant]={
   "utilityMSE":float(np.mean([row["utilityMSE"] for row in observed])),
   "hazardBrier":float(np.mean([row["hazardBrier"] for row in observed])),
   "policyGainVsKeep":float(np.mean([row["policyGain"] for row in observed])),
   "hazardDeltaVsKeep":float(np.mean([row["policyHazardDelta"] for row in observed])),
   "nonKeepActions":sum(row["selectedArm"]!="keep" for row in observed),
   "matchedSeedRows":observed}
 gains=evaluation["armContext"]["matchedSeedRows"]
 const=evaluation["constant"]["matchedSeedRows"]
 rng=np.random.default_rng(630023)
 def pair_ci(field,baseline):
  delta=np.array([baseline[i][field]-gains[i][field] for i in range(len(gains))])
  sim=np.array([rng.choice(delta,len(delta),replace=True).mean() for _ in range(10000)])
  return {"mean":float(delta.mean()),"CI95":np.quantile(sim,[.025,.975]).tolist()}
 util=pair_ci("utilityMSE",const)
 risk=pair_ci("hazardBrier",const)
 policy_gain=np.array([p["policyGain"] for p in gains])
 policy_hazard=np.array([p["policyHazardDelta"] for p in gains])
 sim=np.array([rng.choice(policy_gain,len(policy_gain),replace=True).mean() for _ in range(10000)])
 lower=float(np.quantile(sim,.025))
 strict=bool(util["CI95"][0]>0 and risk["CI95"][0]>=0 and lower>0 and policy_hazard.mean()<=0)
 summary={"schema":"fpsarena-v63-prospective-frozen-model-test-v1",
   "seedGroupCount":len(groups),"untriggeredGroups":nonTriggered,"independentGroups":True,
   "modelSha256":sha(MODEL),"registrySha256":sha(REG),
   "models":{k:{f:v for f,v in m.items() if f!="matchedSeedRows"} for k,m in evaluation.items()},
   "pairedImprovementArmContextVsConstant":{"utilityMSE":util,"hazardBrier":risk},
   "armContextObservedPolicyGain95CI":np.quantile(sim,[.025,.975]).tolist(),
   "armContextMeanObservedHazardChange":float(policy_hazard.mean()),
   "strictProspectiveModelGatePassed":strict,
   "candidateWasFittedBeforeData":True,"trainedOnProspectiveData":False,
   "productionPromotionAllowed":False,
   "oldHoldoutsUntouched":True,
   "limitations":["short-window simulator counterfactuals, not natural full TDM match",
      "small number of independent groups and shared simulation stochasticity"],
   "allPredictions":evaluation}
 REPORT.write_text(json.dumps(summary,indent=2,sort_keys=True)+"\n",encoding="utf-8")
 print("PROSPECTIVE_EVAL",json.dumps({k:summary[k] for k in
  ("seedGroupCount","untriggeredGroups","pairedImprovementArmContextVsConstant",
   "armContextObservedPolicyGain95CI","armContextMeanObservedHazardChange",
   "strictProspectiveModelGatePassed","productionPromotionAllowed")},sort_keys=True))
 return summary

def main():
 op=sys.argv[1] if len(sys.argv)>1 else "verify"
 if op=="freeze":
  obj=register();print("FROZEN",len(obj["cases"]),sha(REG))
 elif op=="verify":
  obj=validate();print("VERIFIED",len(obj["cases"]),sha(REG),obj["frozenContrastModelSHA256"])
 elif op=="run":run(sys.argv[2:])
 elif op=="audit":
  result=audit();print("AUDIT",json.dumps({k:result[k] for k in ("completedGroups","allPass","triggeredGroups","eventPositiveGroups","untouchedOldHoldouts")}))
  if not result["allPass"]:raise SystemExit(2)
 elif op=="evaluate":
  evaluate()
 else:raise SystemExit("freeze|verify|run [IDs...]|audit|evaluate")
if __name__=="__main__":main()
