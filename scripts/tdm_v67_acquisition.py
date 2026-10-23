#!/usr/bin/env python3
"""V67 preregistered natural TDM public-map acquisition research.

Before any V67 discovery run, freeze source, old registry digests and fresh
seed assignments. Restrict actions to pre-step public state, WASD only.
No read/run of any old or new sealed holdouts, and no production promotion.
"""
from __future__ import annotations
import concurrent.futures, hashlib, json, subprocess, sys
from pathlib import Path
import numpy as np

ROOT=Path(__file__).resolve().parents[1]
DATA=ROOT/"data"/"v67"
DATA.mkdir(parents=True,exist_ok=True)
REG=ROOT/"research"/"tdm-v67-acquisition-frozen-registry.json"
AUD=ROOT/"research"/"tdm-v67-acquisition-independent-audit.json"
EVAL=ROOT/"research"/"tdm-v67-acquisition-evaluation.json"
ARMS=("keep","direct","route","flank")
DISCOVERY=[
 {"id":"v67-n-aa12-01","seed":670101,"map":"neon","weapon":"aa12","split":"discovery"},
 {"id":"v67-n-aa12-02","seed":670102,"map":"neon","weapon":"aa12","split":"discovery"},
 {"id":"v67-n-aa12-03","seed":670103,"map":"neon","weapon":"aa12","split":"discovery"},
 {"id":"v67-n-aa12-04","seed":670104,"map":"neon","weapon":"aa12","split":"discovery"},
 {"id":"v67-n-aa12-05","seed":670105,"map":"neon","weapon":"aa12","split":"discovery"},
 {"id":"v67-n-aa12-06","seed":670106,"map":"neon","weapon":"aa12","split":"discovery"},
 {"id":"v67-a-aa12-07","seed":670107,"map":"arena","weapon":"aa12","split":"discovery"},
 {"id":"v67-a-aa12-08","seed":670108,"map":"arena","weapon":"aa12","split":"discovery"},
 {"id":"v67-f-aa12-09","seed":670109,"map":"foundry","weapon":"aa12","split":"discovery"},
 {"id":"v67-f-aa12-10","seed":670110,"map":"foundry","weapon":"aa12","split":"discovery"},
 {"id":"v67-n-m4a1-11","seed":670111,"map":"neon","weapon":"m4a1","split":"discovery"},
 {"id":"v67-n-m4a1-12","seed":670112,"map":"neon","weapon":"m4a1","split":"discovery"}]
HOLDOUT=[
 {"id":"v67-hold-neon-aa12-13","seed":670113,"map":"neon","weapon":"aa12","split":"holdout"},
 {"id":"v67-hold-foundry-aa12-14","seed":670114,"map":"foundry","weapon":"aa12","split":"holdout"},
 {"id":"v67-hold-neon-m4a1-15","seed":670115,"map":"neon","weapon":"m4a1","split":"holdout"}]
CASES=DISCOVERY+HOLDOUT
SOURCES=[
 "scripts/tdm_v67_acquisition.py",
 "lab/arena/train-main-v67.mjs",
 "lab/arena/tdm-public-acquisition-v67.mjs",
 "lab/arena/tdm-stratified-replay-v60.mjs",
 "lab/arena/tdm-engagement-trigger-v61.mjs",
 "lab/arena/tdm-context-trial-v64.mjs",
 "lab/arena/source-main/shared/weapons.js",
 "lab/arena/source-main/shared/geometry.js",
 "lab/arena/source-main/server/game.js",
 "lab/arena/source-main/server/bot.js",
 "page-agent.js"]
REGS=[
 "tdm-v60-frozen-registry.json",
 "tdm-v61-frozen-registry.json",
 "tdm-v62-frozen-registry.json",
 "tdm-v63-prospective-registry.json",
 "tdm-v64-frozen-registry.json",
 "tdm-v65-fullmatch-frozen-registry.json",
 "tdm-v66-natural-frozen-registry.json"]
def sha(p):
 h=hashlib.sha256()
 with Path(p).open("rb") as f:
  for z in iter(lambda:f.read(1<<20),b""):h.update(z)
 return h.hexdigest()
def req(ok,msg):
 if not ok:raise ValueError(msg)
def freeze():
 req(not REG.exists(),"ALREADY_FROZEN")
 prior=[]
 for reg in REGS:
  obj=json.loads((ROOT/"research"/reg).read_text(encoding="utf-8"))
  prior.extend(obj.get("cases",obj.get("allCases",[])))
 seeds=[x["seed"] for x in [*prior,*CASES]]
 req(len(seeds)==len(set(seeds)),"SEED_REUSE")
 obj={
  "schema":"fpsarena-v67-public-weapon-aware-navigation-frozen-v1",
  "baseline":"C35AJ research only, NOT restored v57-v59",
  "cases":CASES,"arms":list(ARMS),
  "sourceSHA256":{f:sha(ROOT/f) for f in SOURCES},
  "priorRegistriesSHA256":{f:sha(ROOT/"research"/f) for f in REGS},
  "fullMatch":{"mode":"tdm","bots":8,"opponents":"official",
       "lagMs":45,"fullMatch":True,"capSeconds":600,"scoreTarget":50},
  "actor":{"trigger":"far public target beyond 1.15x effective weapon range, own HP>=58",
     "publicInput":["own pose/HP","delayed hostile public snapshots","static client map.boxes","static weapon effective range"],
     "noPrivilegedServerInput":True,"modifiesWASDOnly":True,
     "treatmentTicks":1050,"outcomeTicks":1230,
     "stops":["combat command","low HP","within effective range","stale target","blocked movement"],
     "mapRouting":"bounded grid 2.75m A-star with collision and corner guard",
     "arms":list(ARMS)},
  "metrics":{"matchedIndependentGroup":True,
     "primary":"natural match net kills versus Keep",
     "safety":["deaths","damageTaken"],
     "engagement":["shots","hits","kills","inRangeTicks","changedTicks"],
     "descriptive":["team win","match duration","no-trigger/censoring"]},
  "promotion":{"minEligibleMatchedGroups":12,"lowerNetKillsCI95StrictPositive":True,
       "upperDeathsCI95NonPositive":True,"upperDamageCI95NonPositive":True,
       "requireUnopenedHoldoutAndRepresentativeOpponentValidation":True,
       "automaticPromotionForbidden":True},
  "statistics":{"seed":670067,"resamples":15000,"unit":"one seed group, four arms"},
  "holdoutCannotBeExecutedByProtocol":True,
  "calibration":{"seed":441109,"excludedFromDiscovery":True},
  "limitations":["headless authoritative C35AJ sim with official bots",
    "same-seed arm forks may diverge after intervention",
    "natural match finish times differ",
    "no human-opponent or production deployment evidence"]}
 REG.parent.mkdir(parents=True,exist_ok=True)
 REG.write_text(json.dumps(obj,sort_keys=True,indent=2)+"\n",encoding="utf-8")
 return obj
def verify():
 obj=json.loads(REG.read_text(encoding="utf-8"))
 req(obj["cases"]==CASES and obj["arms"]==list(ARMS),"REGISTRY_CASES_CHANGED")
 for f,h in obj["sourceSHA256"].items():
  req(h==sha(ROOT/f),"SOURCE_CHANGED:"+f)
 for f,h in obj["priorRegistriesSHA256"].items():
  req(h==sha(ROOT/"research"/f),"PARENT_REGISTRY_CHANGED:"+f)
 return obj
def file(c,a):return DATA/(c["id"]+"-"+a+".json")
def result(c,a):return json.loads(file(c,a).read_text(encoding="utf-8"))["results"][0]
def run_one(c,a):
 out=file(c,a)
 req(not out.exists(),"NO_OVERWRITE:"+str(out))
 command=["node","lab/arena/train-main-v67.mjs","--profile","release",
   "--modes","tdm","--episodes","1","--seconds","600","--full-match",
   "--seed",str(c["seed"]),"--classic-maps",c["map"],
   "--bots","8","--opponents","official","--lag-ms","45",
   "--trainee-primary",c["weapon"],"--tdm-v67-arm",a,"--out",str(out)]
 x=subprocess.run(command,cwd=ROOT,capture_output=True,text=True,encoding="utf-8",
   errors="replace",timeout=230)
 (DATA/(c["id"]+"-"+a+".log")).write_text(x.stdout+"\n"+x.stderr,encoding="utf-8")
 req(x.returncode==0 and out.exists(),"SIM_FAILED:"+c["id"]+":"+a+":"+x.stderr[-280:])
 m=result(c,a);v=m["tdmV67"]
 return {"group":c["id"],"arm":a,"natural":m["finishedNaturally"],"duration":m["duration"],
  "trigger":v["triggerTick"],"kills":m["kills"],"deaths":m["deaths"],
  "shots":m["shots"],"changedTicks":v["changedTicks"],"routeFound":v["routeFound"]}
def audit_case(c):
 arms=[]
 for a in ARMS:
  p=file(c,a)
  if not p.exists():return {"id":c["id"],"status":"MISSING","missing":a}
  m=result(c,a);v=m["tdmV67"];arms.append((a,m,v,sha(p)))
 baseline=arms[0][2];bad=[]
 canon=lambda d:json.dumps(d,sort_keys=True,separators=(",",":"))
 for a,m,v,d in arms:
  for key in ("triggerTick","prestate","prefixSHA256","triggerPublicFeatures","initial"):
   if canon(v.get(key))!=canon(baseline.get(key)):bad.append(a+" DIFFERENT_"+key)
  if m.get("errors")!=0:bad.append(a+" ENGINE_ERROR")
  if v["schema"]!="fpsarena-v67-public-map-range-acquisition-v1":
   bad.append(a+" BAD_SCHEMA")
  if (not v.get("farPublicTargetCapturedBeforeIntervention") or
     not v.get("fireAimAdsSkillsModified") is False or not v.get("onlyMovementModified") or
     v.get("productionAllowed") is not False):
   bad.append(a+" SAFETY_OR_PUBLIC_BOUNDARY")
  if v["activeTicks"]>1050 or v["changedTicks"]>1050:
   bad.append(a+" EXCEEDED_TREATMENT")
  if m.get("finishedNaturally")!=(m.get("termination")!="match"):
   bad.append(a+" INVALID_NATURAL_FLAG")
  natural=m.get("finishedNaturally") and m.get("termination")=="results"
  scores=m.get("modeState",{}).get("scores",{})
  if natural and max(scores.get("red",0),scores.get("blue",0))<50:
   bad.append(a+" NOT_REACHED_SCORE")
  if m.get("duration",0)>600.2:bad.append(a+" OUT_OF_TIME")
  if v["triggerTick"] is not None:
   w=v.get("prestate")
   if not w or w.get("tick")!=v["triggerTick"] or not isinstance(w.get("rngState"),int):
    bad.append(a+" BAD_PRESTEP_WITNESS")
   f=v["triggerPublicFeatures"]
   if not f or f.get("noPrivilegedState") is not True or not f.get("valid"):
    bad.append(a+" TRIGGER_NOT_PUBLIC")
   if v["complete"] and v.get("initial") and v.get("terminal") and v.get("outcome"):
    for key,val in v["initial"].items():
     if v["terminal"].get(key,0)-val!=v["outcome"].get(key):
      bad.append(a+" COUNTER_DELTA_"+key)
 if baseline["changedTicks"]!=0:bad.append("KEEP_MOTOR_MUTATED")
 naturalAll=all(m.get("finishedNaturally") and m.get("termination")=="results" for a,m,v,d in arms)
 eligible=naturalAll and baseline["triggerTick"] is not None
 result={
  "id":c["id"],"status":"PASS" if not bad else "FAIL","failures":bad,
  "triggerTick":baseline["triggerTick"],
  "triggerDistance":baseline["triggerPublicFeatures"].get("distance") if baseline["triggerPublicFeatures"] else None,
  "naturalFourArms":naturalAll,"eligiblePaired":eligible,
  "arms":{a:{"sha256":d,"kills":m["kills"],"deaths":m["deaths"],
     "netKills":m["kills"]-m["deaths"],"damageTaken":m["damageTaken"],
     "shots":m["shots"],"hits":m["hits"],"natural":m["finishedNaturally"],
     "duration":m["duration"],"team":m["team"],"modeState":m["modeState"],
     "changedTicks":v["changedTicks"],"inRangeTicks":v["inRangeTicks"],
     "routePlans":v["routePlans"],"routeFound":v["routeFound"],
     "initialFarDistance":v["initialFarDistance"],"finalDistance":v["finalDistance"],
     "outcomeWindow":v["outcome"],"stops":v["stops"]}
   for a,m,v,d in arms}
 }
 return result
def audit():
 verify()
 groups=[audit_case(c) for c in DISCOVERY]
 obj={"schema":"fpsarena-v67-independent-4-arm-public-acquisition-audit-v1",
  "registrySHA256":sha(REG),"groups":groups,
  "passGroups":sum(g["status"]=="PASS" for g in groups),
  "failed":[g["id"] for g in groups if g["status"]=="FAIL"],
  "missing":[g["id"] for g in groups if g["status"]=="MISSING"],
  "triggered":sum(g["triggerTick"] is not None for g in groups),
  "naturalFourArmGroups":sum(g["naturalFourArms"] for g in groups),
  "eligiblePairedGroups":sum(g["eligiblePaired"] for g in groups),
  "sealedHoldoutsUntouched":True,"promotion":False}
 AUD.write_text(json.dumps(obj,indent=2,sort_keys=True)+"\n",encoding="utf-8")
 return obj
def bootstrap(x,seed):
 a=np.asarray(x,dtype=np.float64)
 if not len(a):return None
 rng=np.random.default_rng(seed)
 sims=np.asarray([rng.choice(a,len(a),replace=True).mean() for i in range(15000)])
 return {"nGroups":len(a),"mean":float(a.mean()),
    "CI95":np.quantile(sims,[.025,.975]).tolist(),
    "min":float(a.min()),"max":float(a.max())}
def evaluate():
 doc=audit()
 req(not doc["failed"] and not doc["missing"],"AUDIT_NOT_COMPLETE")
 groups=doc["groups"];paired=[g for g in groups if g["eligiblePaired"]]
 raw={}
 metrics=("kills","netKills","deaths","damageTaken","shots","hits","inRangeTicks","changedTicks")
 for i,arm in enumerate(ARMS[1:]):
  raw[arm]={}
  for j,key in enumerate(metrics):
   values=[g["arms"][arm][key]-g["arms"]["keep"][key] for g in paired]
   raw[arm][key]=bootstrap(values,670067+32*i+j)
 stats={a:{"natural":sum(g["arms"][a]["natural"] for g in groups),
   "teamWins":sum(g["arms"][a]["modeState"]["scores"][g["arms"][a]["team"]]>=50 for g in groups),
   "meanShots":float(np.mean([g["arms"][a]["shots"] for g in groups])),
   "meanKills":float(np.mean([g["arms"][a]["kills"] for g in groups])),
   "meanDeaths":float(np.mean([g["arms"][a]["deaths"] for g in groups])),
   "meanDamageTaken":float(np.mean([g["arms"][a]["damageTaken"] for g in groups]))} for a in ARMS}
 sufficient=len(paired)>=12
 safety={arm:bool(sufficient and x["netKills"]["CI95"][0]>0 and
   x["deaths"]["CI95"][1]<=0 and x["damageTaken"]["CI95"][1]<=0)
   for arm,x in raw.items()}
 report={"schema":"fpsarena-v67-seed-group-natural-acquisition-outcomes-v1",
  "frozenRegistrySHA256":sha(REG),
  "independentDiscoveryGroups":len(groups),"triggeredGroups":doc["triggered"],
  "pairedNaturalGroups":len(paired),"fullNaturalMatchCount":sum(s["natural"] for s in stats.values()),
  "noTriggerGroups":[g["id"] for g in groups if g["triggerTick"] is None],
  "byArm":stats,"pairedTreatmentVsKeep":raw,
  "safetyGateByArm":safety,"eligible12GroupGatePassed":sufficient,
  "promotionAllowed":False,"allSealedHoldoutsUntouched":True,
  "calibrationExcluded":441109,
  "limitations":["Matched seed arms can diverge after treatment, not a clone of full engine state",
   "Different natural termination durations at 50 team kills",
   "Results from official bots, not representative human lobbies",
   "Target snapshots and static map boxes are public but approximate game perception"]}
 EVAL.write_text(json.dumps(report,indent=2,sort_keys=True)+"\n",encoding="utf-8")
 return report
def main():
 op=sys.argv[1] if len(sys.argv)>1 else "verify"
 if op=="freeze":
  freeze();print("FROZEN",len(CASES),sha(REG))
 elif op=="verify":
  verify();print("VERIFIED",len(CASES),sha(REG))
 elif op=="run":
  verify()
  chosen=set(sys.argv[2:]); allowed={c["id"] for c in DISCOVERY}
  req(not chosen or chosen<=allowed,"HOLDOUT_OR_UNKNOWN_REFUSED")
  selected=[c for c in DISCOVERY if not chosen or c["id"] in chosen]
  for c in selected:
   for a in ARMS:req(not file(c,a).exists(),"REFUSE_OVERWRITE:"+c["id"])
   with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
    for f in concurrent.futures.as_completed([pool.submit(run_one,c,a) for a in ARMS]):
     print("RUN",json.dumps(f.result(),sort_keys=True),flush=True)
 elif op=="audit":
  obj=audit()
  print("AUDIT",json.dumps({k:obj[k] for k in
    ("passGroups","failed","missing","triggered","naturalFourArmGroups","eligiblePairedGroups")}))
  if obj["failed"]:raise SystemExit(2)
 elif op=="evaluate":
  obj=evaluate()
  print("EVAL",json.dumps({k:obj[k] for k in
    ("independentDiscoveryGroups","pairedNaturalGroups","fullNaturalMatchCount",
     "safetyGateByArm","promotionAllowed")}))
 else:raise SystemExit("freeze|verify|run [discovery ids...]|audit|evaluate")
if __name__=="__main__":main()
