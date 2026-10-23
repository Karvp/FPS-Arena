#!/usr/bin/env python3
"""V65 preregistered natural-end official 4v4 TDM: four-arm matched seed research.

Authoritative server must terminate at target score; 600-second guard is
censoring, NEVER a win. This is NOT a neural policy promotion or an actor.
"""
from __future__ import annotations
import concurrent.futures
import hashlib,json,subprocess,sys
from pathlib import Path
import numpy as np

ROOT=Path(__file__).resolve().parents[1]
DATA=ROOT/"data"/"v65"
DATA.mkdir(parents=True,exist_ok=True)
REG=ROOT/"research"/"tdm-v65-fullmatch-frozen-registry.json"
AUD=ROOT/"research"/"tdm-v65-fullmatch-independent-audit.json"
EVAL=ROOT/"research"/"tdm-v65-fullmatch-evaluation.json"
ARMS=("keep","close","strafe","withdraw")
DISCOVERY=[
 {"id":"v65-arena-mp5sd-01","seed":650101,"map":"arena","weapon":"mp5sd","stratum":"aim-lock","split":"discovery"},
 {"id":"v65-arena-mp5sd-02","seed":650102,"map":"arena","weapon":"mp5sd","stratum":"aim-lock","split":"discovery"},
 {"id":"v65-foundry-uzi-03","seed":650103,"map":"foundry","weapon":"uzi","stratum":"aim-lock","split":"discovery"},
 {"id":"v65-foundry-uzi-04","seed":650104,"map":"foundry","weapon":"uzi","stratum":"aim-lock","split":"discovery"},
 {"id":"v65-arena-uzi-05","seed":650105,"map":"arena","weapon":"uzi","stratum":"aim-lock","split":"discovery"},
 {"id":"v65-arena-uzi-06","seed":650106,"map":"arena","weapon":"uzi","stratum":"aim-lock","split":"discovery"}]
HOLDOUT=[
 {"id":"v65-holdout-foundry-m4a1-07","seed":650107,"map":"foundry","weapon":"m4a1","stratum":"post-fire","split":"holdout"},
 {"id":"v65-holdout-neon-aa12-08","seed":650108,"map":"neon","weapon":"aa12","stratum":"post-fire","split":"holdout"}]
CASES=DISCOVERY+HOLDOUT
SOURCES=[
 "scripts/tdm_v65_fullmatch.py",
 "lab/arena/train-main-v64.mjs",
 "lab/arena/tdm-public-tactics-v64.mjs",
 "lab/arena/tdm-context-trial-v64.mjs",
 "lab/arena/tdm-engagement-trigger-v61.mjs",
 "lab/arena/tdm-stratified-replay-v60.mjs",
 "lab/arena/source-main/server/game.js",
 "lab/arena/source-main/server/bot.js",
 "research/tdm-v64-frozen-registry.json",
 "research/tdm-v64-public-context-shadow-model.json",
 "page-agent.js"]
def sha(path):
 h=hashlib.sha256()
 with Path(path).open("rb") as f:
  for b in iter(lambda:f.read(1<<20),b""):h.update(b)
 return h.hexdigest()
def insist(test,why):
 if not test:raise ValueError(why)
def freeze():
 insist(not REG.exists(),"REGISTRY_ALREADY_EXISTS")
 older=[
   "tdm-v60-frozen-registry.json","tdm-v61-frozen-registry.json",
   "tdm-v62-frozen-registry.json","tdm-v63-prospective-registry.json",
   "tdm-v64-frozen-registry.json"]
 old={c["seed"] for name in older for c in
      json.loads((ROOT/"research"/name).read_text("utf-8"))["cases"]}
 new={c["seed"] for c in CASES}
 insist(not(old&new) and len(new)==len(CASES),"SPLIT_SEED_REUSE")
 reg={
  "schema":"fpsarena-v65-preregistered-authoritative-natural-tdm-v1",
  "sourceBaseline":"C35AJ simulator, NOT V57",
  "design":"exact same-seed four-arm replay; original V64 150-tick WASD-only pulse; NOT production policy",
  "allCases":CASES,"arms":list(ARMS),
  "sourceSHA256":{p:sha(ROOT/p) for p in SOURCES},
  "simulation":{"fullMatch":True,"matchCapSeconds":600,"botCount":8,"opponents":"official",
     "lagMs":45,"modes":"tdm","scoreTarget":50},
  "analysisUnit":"independent seed group, four arms matched prestate",
  "dataPolicy":{"rightCensored":"not counted as naturally completed win; keep raw trial",
    "notTriggered":"keep in match-level descriptive stats; exclude from arm treatment effect",
    "groupEligibleForPairedEffect":"all four arms finishedNaturally with phase results and same public prestate, valid PRNG witness, trigger reached"},
  "promoteOnlyIf":{"minIndependentTriggeredNaturalGroups":12,
    "meanNetKillsVsKeepBootstrapLower95GreaterThanZero":True,
    "meanDeathsVsKeepBootstrapUpper95AtMostZero":True,
    "meanDamageTakenVsKeepBootstrapUpper95AtMostZero":True,
    "twoUnopenedHoldoutsRequired":True,
    "alsoRequireProspectiveRepresentativeOpponentValidation":True},
  "oldSealedHoldouts":"unopened, all V60-V64 existing holdouts remain protected",
  "noModelTrainingOrTuning":True,"noProductionPromotion":True}
 REG.parent.mkdir(parents=True,exist_ok=True)
 REG.write_text(json.dumps(reg,indent=2,sort_keys=True)+"\n",encoding="utf-8")
 return reg
def verify():
 o=json.loads(REG.read_text("utf-8"))
 insist(o["allCases"]==CASES and o["arms"]==list(ARMS),"REGISTRY_ALTERED")
 insist(o["simulation"]["fullMatch"] and o["simulation"]["matchCapSeconds"]==600,
   "NATURAL_END_PROTOCOL_CHANGED")
 for name,h in o["sourceSHA256"].items():
  insist(h==sha(ROOT/name),"FROZEN_FILE_CHANGED "+name)
 return o
def filepath(case,arm):return DATA/(case["id"]+"-"+arm+".json")
def read(case,arm):
 p=filepath(case,arm)
 return json.loads(p.read_text(encoding="utf-8"))["results"][0]
def runone(case,arm):
 dest=filepath(case,arm)
 insist(not dest.exists(),"REFUSE_REPLACE_RESULT "+str(dest))
 cmd=["node","lab/arena/train-main-v64.mjs","--profile","release",
      "--modes","tdm","--episodes","1","--seconds","600","--full-match",
      "--seed",str(case["seed"]),"--classic-maps",case["map"],
      "--bots","8","--opponents","official","--lag-ms","45",
      "--trainee-primary",case["weapon"],"--tdm-v64-arm",arm,
      "--tdm-v64-stratum",case["stratum"],"--out",str(dest)]
 proc=subprocess.run(cmd,cwd=ROOT,capture_output=True,text=True,timeout=270,encoding="utf-8",errors="replace")
 (DATA/(case["id"]+"-"+arm+".log")).write_text(proc.stdout+"\n"+proc.stderr,encoding="utf-8")
 insist(proc.returncode==0 and dest.exists(),
    "MATCH_RUN_FAILED "+case["id"]+" "+arm+" "+proc.stderr[-300:])
 m=read(case,arm)
 return {"id":case["id"],"arm":arm,"trigger":m["tdmV64"]["triggerTick"],
   "natural":m["finishedNaturally"],"phase":m["termination"],"duration":m["duration"],
   "kills":m["kills"],"deaths":m["deaths"],"teamState":m["modeState"],"changed":m["tdmV64"]["changedTicks"]}
def canon(x):return json.dumps(x,sort_keys=True,separators=(",",":"))
def audit_one(case):
 rows=[]
 for arm in ARMS:
  p=filepath(case,arm)
  if not p.exists():return {"id":case["id"],"status":"MISSING","missingArm":arm}
  m=read(case,arm)
  rows.append((arm,m,m["tdmV64"],sha(p)))
 base=rows[0][2];problems=[]
 for arm,m,v,dig in rows:
  for key in ("triggerTick","prestate","prefixSHA256","triggerPublicFeatures","initial","contextV64"):
   if canon(v.get(key))!=canon(base.get(key)):problems.append(arm+" DIFF_"+key)
  if m.get("errors")!=0:problems.append(arm+" ENGINE_ERROR")
  if v["changedTicks"]>150 or v["activeTicks"]>150:problems.append(arm+" MOTOR_EXCEEDED")
  if not v["onlyMovementModified"] or not v["contextCapturedBeforeIntervention"] or v["productionAllowed"]:
   problems.append(arm+" VIOLATES_RESEARCH_BOUNDARY")
  if v["triggerTick"] is not None:
   w=v["prestate"]
   if w is None or w.get("tick")!=v["triggerTick"] or not isinstance(w.get("rngState"),int):
    problems.append(arm+" INVALID_PRESTEP_WITNESS")
   if not v["contextV64"] or v["contextV64"].get("noPrivateServerInput") is not True:
    problems.append(arm+" NONPUBLIC_CONTEXT")
   if v["complete"] and v["initial"] and v["outcome"] and v["terminal"]:
    for k,value in v["initial"].items():
     if v["terminal"].get(k,0)-value!=v["outcome"].get(k):problems.append(arm+" INVALID_OUTCOME_"+k)
  if bool(m.get("finishedNaturally"))!=(m.get("termination")!="match"):
   problems.append(arm+" INVALID_TERMINATION_FLAG")
  natural=m["finishedNaturally"] and m["termination"]=="results"
  score=m.get("modeState",{}).get("scores",{})
  if natural and max(score.get("red",0),score.get("blue",0))<50:
   problems.append(arm+" RESULTS_WITHOUT_50_POINT_SCORE")
  if m.get("duration",0)>600.2:problems.append(arm+" EXCEEDED_600_SECOND_CAP")
 if base["changedTicks"]!=0:problems.append("KEEP_CHANGED_MOVEMENT")
 naturalAll=all(m["finishedNaturally"] and m["termination"]=="results" for _,m,_,_ in rows)
 eligible=base["triggerTick"] is not None and naturalAll and all(v["complete"] for _,_,v,_ in rows)
 result={
  "id":case["id"],"status":"PASS" if not problems else "FAIL","problems":problems,
  "triggerTick":base["triggerTick"],"naturalAll":naturalAll,
  "eligiblePairedEffect":eligible,"censoredAny":not naturalAll,
  "arms":{arm:{
   "fileSHA256":dig,"natural":m["finishedNaturally"],"duration":m["duration"],
   "termination":m["termination"],"modeState":m.get("modeState"),
   "kills":m["kills"],"deaths":m["deaths"],"damageTaken":m["damageTaken"],
   "netKills":m["kills"]-m["deaths"],
   "windowOutcome":v["outcome"],"changedTicks":v["changedTicks"]
   } for arm,m,v,dig in rows}}
 return result
def audit():
 verify()
 out=[audit_one(x) for x in DISCOVERY]
 doc={
  "schema":"fpsarena-v65-independent-natural-tdm-four-arm-audit-v1",
  "registrySHA256":sha(REG),"groups":out,
  "completeGroups":sum(g["status"]=="PASS" for g in out),
  "failedGroups":[g["id"] for g in out if g["status"]=="FAIL"],
  "missingGroups":[g["id"] for g in out if g["status"]=="MISSING"],
  "naturalFourArmGroups":sum(g.get("naturalAll",False) for g in out),
  "eligiblePairedGroups":sum(g.get("eligiblePairedEffect",False) for g in out),
  "censoredGroups":sum(g.get("censoredAny",False) for g in out if g["status"]!="MISSING"),
  "newAndOldHoldoutResultsOpened":False,"productionPromotion":False}
 AUD.write_text(json.dumps(doc,sort_keys=True,indent=2)+"\n",encoding="utf-8")
 return doc
def bootstrap(values,seed):
 z=np.asarray(values,dtype=float)
 if len(z)<1:return None
 rng=np.random.default_rng(seed)
 draws=np.asarray([rng.choice(z,len(z),replace=True).mean() for _ in range(15000)])
 return {"mean":float(z.mean()),"ci95":np.quantile(draws,[.025,.975]).tolist(),"groupN":len(z)}
def evaluate():
 audit_doc=audit()
 insist(not audit_doc["failedGroups"] and not audit_doc["missingGroups"],"AUDIT_INCOMPLETE")
 matched=[g for g in audit_doc["groups"] if g["eligiblePairedEffect"]]
 stat={}
 for arm in ARMS[1:]:
  deltas={metric:[] for metric in ("kills","deaths","damageTaken","netKills")}
  for g in matched:
   for metric in deltas:
    deltas[metric].append(g["arms"][arm][metric]-g["arms"]["keep"][metric])
  stat[arm]={k:bootstrap(v,650000+i) for i,(k,v) in enumerate(deltas.items())}
 eligible=len(matched)>=12
 # PREREG promotion requires independent triggered natural groups and net/deaths/damage CIs
 strict=bool(eligible and any(
  all([s["netKills"]["ci95"][0]>0,s["deaths"]["ci95"][1]<=0,s["damageTaken"]["ci95"][1]<=0])
  for s in stat.values()))
 doc={
  "schema":"fpsarena-v65-natural-fullmatch-seed-group-bootstrap-v1",
  "registrySHA256":sha(REG),"eligibleGroupCount":len(matched),
  "allDiscoveryGroupCount":len(DISCOVERY),
  "naturalFourArmGroupCount":audit_doc["naturalFourArmGroups"],
  "censoredGroupCount":audit_doc["censoredGroups"],
  "untreatedGroupsExcludedFromCausalComparison":[g["id"] for g in audit_doc["groups"] if not g["eligiblePairedEffect"]],
  "summary":stat,
  "gate":{"minimum12IndependentNaturalGroups":eligible,
          "CIOfNetKillsVsKeepStrictPositiveRequired":True,
          "CIOfDeathsAndDamageVsKeepNonPositiveRequired":True,
          "allProspectiveHumanOrRepresentativeOpponentsNotTested":True,
          "qualifiedForPromotion":False,
          "strictStatisticalGatePassed":strict},
  "noNeuralTrainingOrPromotion":True,"allSealedHoldoutsUntouched":True,
  "caveats":["Server natural end is to 50 team kills; 600 second guard is censoring",
             "Changing WASD 150 ticks can lead to divergent server RNG and other agent paths",
             "Six discovery groups are insufficient to meet minimum independent-group gate",
             "Only authoritative simulator bots, not human opponents"]}
 EVAL.write_text(json.dumps(doc,sort_keys=True,indent=2)+"\n",encoding="utf-8")
 return doc
def main():
 op=sys.argv[1] if len(sys.argv)>1 else "verify"
 if op=="freeze":
  freeze();print("FROZEN",len(CASES),sha(REG))
 elif op=="verify":
  verify();print("VERIFIED",len(CASES),sha(REG))
 elif op=="run":
  verify()
  chosen=set(sys.argv[2:])
  allow={x["id"] for x in DISCOVERY}
  insist(not chosen or chosen<=allow,"UNKNOWN_OR_HOLDOUT_REFUSED")
  selected=[x for x in DISCOVERY if not chosen or x["id"] in chosen]
  for case in selected:
   for arm in ARMS:
    insist(not filepath(case,arm).exists(),"REFUSE_OVERWRITE "+case["id"])
   with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
    futures=[pool.submit(runone,case,arm) for arm in ARMS]
    for future in concurrent.futures.as_completed(futures):
     print("RUN",json.dumps(future.result(),sort_keys=True),flush=True)
 elif op=="audit":
  doc=audit()
  print("AUDIT",json.dumps({k:doc[k] for k in ("completeGroups","failedGroups","missingGroups",
             "naturalFourArmGroups","eligiblePairedGroups","censoredGroups")}))
  if doc["failedGroups"]:raise SystemExit(2)
 elif op=="evaluate":
  doc=evaluate()
  print("EVAL",json.dumps({"eligible":doc["eligibleGroupCount"],
     "naturalGroups":doc["naturalFourArmGroupCount"],
     "statisticalGatePassed":doc["gate"]["strictStatisticalGatePassed"],
     "promotionAllowed":doc["gate"]["qualifiedForPromotion"]}))
 else:raise SystemExit("freeze|verify|run [discovery IDs...]|audit|evaluate")
if __name__=="__main__":main()
