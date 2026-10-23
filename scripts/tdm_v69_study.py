#!/usr/bin/env python3
"""V69 registered fresh-seed natural TDM comparative study.

Calibration is excluded; each four-arm group is the independent statistical
unit. Never read, infer from, or run old/new sealed holdouts. The registration
freezes controller source and original game code BEFORE discovery.
"""
from __future__ import annotations
import concurrent.futures,hashlib,json,subprocess,sys
from pathlib import Path
import numpy as np

ROOT=Path(__file__).resolve().parents[1]
DATA=ROOT/"data"/"v69"
DATA.mkdir(parents=True,exist_ok=True)
REG=ROOT/"research"/"tdm-v69-cover-frozen-registry.json"
AUD=ROOT/"research"/"tdm-v69-cover-independent-audit.json"
EVAL=ROOT/"research"/"tdm-v69-cover-fullmatch-evaluation.json"
ARMS=("keep","route","cover-escape","cover-support")
DISCOVERY=[
 {"id":f"v69-n-aa12-{i:02d}","seed":690100+i,"map":"neon","weapon":"aa12","split":"discovery"} for i in range(1,7)]
DISCOVERY.extend([
 {"id":"v69-a-aa12-07","seed":690107,"map":"arena","weapon":"aa12","split":"discovery"},
 {"id":"v69-a-aa12-08","seed":690108,"map":"arena","weapon":"aa12","split":"discovery"},
 {"id":"v69-f-aa12-09","seed":690109,"map":"foundry","weapon":"aa12","split":"discovery"},
 {"id":"v69-f-aa12-10","seed":690110,"map":"foundry","weapon":"aa12","split":"discovery"},
 {"id":"v69-n-m4a1-11","seed":690111,"map":"neon","weapon":"m4a1","split":"discovery"},
 {"id":"v69-n-m4a1-12","seed":690112,"map":"neon","weapon":"m4a1","split":"discovery"}])
HOLDOUT=[
 {"id":"v69-hold-neon-aa12-13","seed":690113,"map":"neon","weapon":"aa12","split":"holdout"},
 {"id":"v69-hold-arena-aa12-14","seed":690114,"map":"arena","weapon":"aa12","split":"holdout"},
 {"id":"v69-hold-foundry-aa12-15","seed":690115,"map":"foundry","weapon":"aa12","split":"holdout"}]
CASES=DISCOVERY+HOLDOUT
SOURCES=[
 "scripts/tdm_v69_study.py","lab/arena/tdm-cover-escape-v69.mjs",
 "lab/arena/train-main-v69.mjs","lab/arena/tdm-public-acquisition-v67.mjs",
 "lab/arena/tdm-exposure-guard-v68.mjs","lab/arena/public-target-los-c35k.mjs",
 "lab/arena/target-relative-motion-c35t.mjs",
 "lab/arena/source-main/shared/geometry.js",
 "lab/arena/source-main/shared/weapons.js",
 "lab/arena/source-main/server/game.js",
 "lab/arena/source-main/server/bot.js","page-agent.js"]
PARENTS=[
 "tdm-v60-frozen-registry.json","tdm-v61-frozen-registry.json",
 "tdm-v62-frozen-registry.json","tdm-v63-prospective-registry.json",
 "tdm-v64-frozen-registry.json","tdm-v65-fullmatch-frozen-registry.json",
 "tdm-v66-natural-frozen-registry.json","tdm-v67-acquisition-frozen-registry.json",
 "tdm-v68-risk-frozen-registry.json"]
def sha(p):
 h=hashlib.sha256()
 with Path(p).open("rb") as f:
  for block in iter(lambda:f.read(1<<20),b""):h.update(block)
 return h.hexdigest()
def require(c,m):
 if not c:raise ValueError(m)
def freeze():
 require(not REG.exists(),"REGISTRY_ALREADY_FROZEN")
 used=[]
 for name in PARENTS:
  obj=json.loads((ROOT/"research"/name).read_text("utf8"))
  used.extend(x["seed"] for x in obj.get("cases",obj.get("allCases",[])))
 seeds=[x["seed"] for x in CASES]
 require(len(set([*used,*seeds]))==len(used)+len(seeds),"SEED_REUSED")
 record={
  "schema":"fpsarena-v69-public-active-cover-frozen-prospective-v1",
  "baseline":"C35AJ authoritative headless, never claim v57-v59 restored",
  "cases":CASES,"arms":list(ARMS),
  "sourceSHA256":{name:sha(ROOT/name) for name in SOURCES},
  "parentRegistrySHA256":{name:sha(ROOT/"research"/name) for name in PARENTS},
  "match":{"mode":"tdm","bots":8,"opponents":"official","lagMs":45,
   "fullMatch":True,"capSeconds":600,"naturalScoreTarget":50},
  "actor":{"trigger":"unchanged V67 public far-range target",
    "publicRisk":"V68 LOS threat and friend snapshot only",
    "activeEscape":"public cover candidate ray occlusion, swept collision, bounded grid A*",
    "whenNoCover":"swept-safe move away from public threat then abstain",
    "stall":"fallback original commands when no route or stuck",
    "interventionTicks":1050,"maxChangedTicksEscapeArms":620,
    "modifiedCommands":["forward","backward","left","right"],
    "privateActorInput":False},
  "unit":"one independent four-arm match seed group; never individual ticks or arms",
  "primary":{"benefit":"netKills","risk":["deaths","damageTaken"]},
  "secondary":["shots","hits","coverPlans","escapeTicks","stuckEvents","censoredMatches"],
  "comparisons":[["route","keep"],["cover-escape","keep"],
    ["cover-support","keep"],["cover-escape","route"],["cover-support","route"]],
  "statisticalRules":{"seed":690069,"bootstrapResamples":15000,
    "minimumEligibleNaturalMatchGroups":12,"naturalTerminatedOnly":True,
    "CI95NetKillsImprovementOverKeepLowerPositive":True,
    "CI95DeathsAndDamageOverKeepUpperNonPositive":True},
  "calibrationSeed441109Excluded":True,"holdoutsForbidden":True,
  "promotionNeverAutomatic":True,"noNeuralTrainingThisPass":True,
  "limits":["Headless simulator official bots only","exogenous streams diverge after intervention",
    "natural endpoints have different times","public static geometry not guarantee safety"]}
 REG.parent.mkdir(parents=True,exist_ok=True)
 REG.write_text(json.dumps(record,indent=2,sort_keys=True)+"\n",encoding="utf8")
 return record
def verify():
 doc=json.loads(REG.read_text("utf8"))
 require(doc["cases"]==CASES and doc["arms"]==list(ARMS),"CASES_CHANGED")
 for p,h in doc["sourceSHA256"].items():
  require(sha(ROOT/p)==h,"SOURCE_CHANGED:"+p)
 for p,h in doc["parentRegistrySHA256"].items():
  require(sha(ROOT/"research"/p)==h,"OLD_REGISTRY_CHANGED:"+p)
 return doc
def output(case,arm):return DATA/(case["id"]+"-"+arm+".json")
def one(case,arm):
 file=output(case,arm)
 require(not file.exists(),"REFUSE_RESULT_OVERWRITE "+str(file))
 cmd=["node","lab/arena/train-main-v69.mjs","--profile","release",
  "--modes","tdm","--episodes","1","--seconds","600","--full-match",
  "--seed",str(case["seed"]),"--classic-maps",case["map"],
  "--bots","8","--opponents","official","--lag-ms","45",
  "--trainee-primary",case["weapon"],"--tdm-v69-arm",arm,
  "--out",str(file)]
 proc=subprocess.run(cmd,cwd=ROOT,capture_output=True,text=True,timeout=275,encoding="utf8",errors="replace")
 (DATA/(case["id"]+"-"+arm+".log")).write_text(proc.stdout+"\n"+proc.stderr,encoding="utf8")
 require(proc.returncode==0 and file.exists(),"ENGINE_FAIL "+case["id"]+" "+arm+": "+proc.stderr[-250:])
 r=json.loads(file.read_text("utf8"))["results"][0]
 return {"group":case["id"],"arm":arm,"natural":r["finishedNaturally"],
   "kills":r["kills"],"deaths":r["deaths"],"damage":r["damageTaken"],
   "shots":r["shots"],"trigger":r["tdmV69"]["triggerTick"],
   "changed":r["tdmV69"]["changedTicks"],"coverPlans":r["tdmV69"]["coverSuccess"]}
def canon(x):return json.dumps(x,sort_keys=True,separators=(",",":"),allow_nan=False)
def audit_case(case):
 records=[]
 for arm in ARMS:
  file=output(case,arm)
  if not file.exists():return {"id":case["id"],"status":"MISSING","missing":arm}
  doc=json.loads(file.read_text("utf8"))
  if doc.get("fullMatch") is not True:return {"id":case["id"],"status":"FAIL","problems":["not-full-match"]}
  m=doc["results"][0];v=m["tdmV69"]
  records.append((arm,m,v,sha(file)))
 control=records[0][2];problems=[]
 for arm,m,v,d in records:
  for key in ("triggerTick","prestate","prefixSHA256","triggerPublicFeatures","initial"):
   if canon(v.get(key))!=canon(control.get(key)):
    problems.append(arm+" NOT_MATCHED_"+key)
  if m["errors"]!=0:problems.append(arm+" ENGINE_ERRORS")
  if m["map"]!=case["map"] or m["weapon"]!=case["weapon"]:problems.append(arm+" WRONG_CASE")
  if v.get("schema")!="fpsarena-v69-public-active-cover-egress-v1":problems.append(arm+" SCHEMA")
  if (v.get("productionAllowed") is not False or not v.get("allNonWASDUnchanged") or
     not v.get("noPrivilegedActorInput") or not v.get("onlyMovementModified")):
   problems.append(arm+" PRIVILEGE_OR_COMMAND_CHANGE")
  if v["activeTicks"]>1050 or v["changedTicks"]>v["maxChangedTicks"]:
   problems.append(arm+" EXCEEDED_WINDOW")
  if arm.startswith("cover-") and v["maxChangedTicks"]!=620:problems.append(arm+" ESCAPE_BUDGET")
  if arm=="keep" and v["changedTicks"]!=0:problems.append("KEEP_CHANGED")
  if m["finishedNaturally"]!=(m["termination"]!="match"):
   problems.append(arm+" WRONG_TERMINATION_FLAG")
  if m["finishedNaturally"]:
   s=m["modeState"]["scores"]
   if m["termination"]!="results" or max(s["red"],s["blue"])<50:
    problems.append(arm+" NOT_NATURAL_SCORE")
  if m["duration"]>600.25:problems.append(arm+" MATCH_CAP")
  if v["triggerTick"] is not None:
   w=v["prestate"];f=v["triggerPublicFeatures"]
   if not w or w["tick"]!=v["triggerTick"] or not isinstance(w["rngState"],int):
    problems.append(arm+" INVALID_WITNESS")
   if f is None or f.get("noPrivilegedState") is not True or not f.get("valid"):
    problems.append(arm+" NOT_PUBLIC_TRIGGER")
   if v["complete"]:
    for k,val in v["initial"].items():
     if v["outcome"][k]!=v["terminal"].get(k,0)-val:
      problems.append(arm+" COUNTER_DELTA "+k)
 natural=all(m["finishedNaturally"] and m["termination"]=="results" for _,m,_,_ in records)
 triggered=control["triggerTick"] is not None
 eligible=natural and triggered and all(v["complete"] for _,m,v,_ in records)
 return {"id":case["id"],"status":"PASS" if not problems else "FAIL",
  "problems":problems,"map":case["map"],"weapon":case["weapon"],
  "triggerTick":control["triggerTick"],"allNatural":natural,"eligible":eligible,
  "arms":{arm:{
    "sha256":digest,"kills":m["kills"],"deaths":m["deaths"],
    "netKills":m["kills"]-m["deaths"],"damageTaken":m["damageTaken"],
    "shots":m["shots"],"hits":m["hits"],"duration":m["duration"],
    "natural":m["finishedNaturally"],"team":m["team"],"scores":m["modeState"]["scores"],
    "changedTicks":v["changedTicks"],"escapePlans":v["escapePlans"],
    "coverSuccess":v["coverSuccess"],"escapeTicks":v["escapeTicks"],
    "coverTicks":v["coverTicks"],"stuckEvents":v["stuckEvents"],
    "awayFallback":v["awayFallback"],"stallFallbackTicks":v["stallFallbackTicks"]}
    for arm,m,v,digest in records}}
def audit():
 verify()
 groups=[audit_case(c) for c in DISCOVERY]
 report={"schema":"fpsarena-v69-independent-four-arm-natural-match-audit-v1",
  "registrySHA256":sha(REG),"groups":groups,
  "passGroups":sum(g["status"]=="PASS" for g in groups),
  "failedGroups":[g["id"] for g in groups if g["status"]=="FAIL"],
  "missingGroups":[g["id"] for g in groups if g["status"]=="MISSING"],
  "triggeredGroups":sum(g.get("triggerTick") is not None for g in groups),
  "naturalFourArmGroups":sum(g.get("allNatural",False) for g in groups),
  "eligiblePairedGroups":sum(g.get("eligible",False) for g in groups),
  "holdoutsOpened":False,"promoted":False}
 AUD.write_text(json.dumps(report,sort_keys=True,indent=2)+"\n",encoding="utf8")
 return report
def bootstrap(vals,seed):
 x=np.asarray(vals,dtype=float)
 if not len(x):return None
 r=np.random.default_rng(seed)
 draws=np.asarray([r.choice(x,len(x),replace=True).mean() for _ in range(15000)])
 return {"nGroups":len(x),"mean":float(x.mean()),"CI95":np.quantile(draws,[.025,.975]).tolist()}
def evaluate():
 audited=audit()
 require(not audited["failedGroups"] and not audited["missingGroups"],"BAD_AUDIT")
 eligible=[g for g in audited["groups"] if g["eligible"]]
 summary={}
 for arm in ARMS:
  rows=[g["arms"][arm] for g in audited["groups"]]
  summary[arm]={
   "meanKills":float(np.mean([x["kills"] for x in rows])),
   "meanDeaths":float(np.mean([x["deaths"] for x in rows])),
   "meanDamageTaken":float(np.mean([x["damageTaken"] for x in rows])),
   "meanShots":float(np.mean([x["shots"] for x in rows])),
   "meanCoverPlans":float(np.mean([x["coverSuccess"] for x in rows])),
   "meanEscapeTicks":float(np.mean([x["escapeTicks"] for x in rows])),
   "natural":sum(x["natural"] for x in rows),
   "teamWins":sum(x["scores"][x["team"]]>=50 for x in rows)}
 comparisons=[
  ("route","keep"),("cover-escape","keep"),("cover-support","keep"),
  ("cover-escape","route"),("cover-support","route")]
 paired={}
 for i,(a,b) in enumerate(comparisons):
  paired[a+"_vs_"+b]={
   k:bootstrap([g["arms"][a][k]-g["arms"][b][k] for g in eligible],690069+32*i+j)
   for j,k in enumerate(("netKills","deaths","damageTaken","kills","shots"))}
 gates={}
 for arm in ARMS[1:]:
  stats=paired[arm+"_vs_keep"]
  gates[arm]=bool(len(eligible)>=12 and stats["netKills"]["CI95"][0]>0 and
   stats["deaths"]["CI95"][1]<=0 and stats["damageTaken"]["CI95"][1]<=0)
 report={
  "schema":"fpsarena-v69-public-cover-natural-grouped-bootstrap-v1",
  "registrySHA256":sha(REG),"groupsRegistered":12,
  "matchedEligibleGroups":len(eligible),
  "naturalMatches":sum(s["natural"] for s in summary.values()),
  "censoredMatches":48-sum(s["natural"] for s in summary.values()),
  "descriptive":summary,"paired":paired,"strictSafetyGate":gates,
  "promotionAllowed":False,"holdoutsSealed":True,"calibrationExcluded":True,
  "limitations":["Only official simulator bots","Exogenous RNG streams can diverge after branch",
    "Natural score-50 games have varying durations",
    "Public 3D LOS static geometry approximates rather than guarantees cover",
    "Stopping after a motor budget may leave actor with bad baseline positioning"]}
 EVAL.write_text(json.dumps(report,sort_keys=True,indent=2)+"\n",encoding="utf8")
 return report
def main():
 op=sys.argv[1] if len(sys.argv)>1 else "verify"
 if op=="freeze":
  freeze();print("FROZEN",len(CASES),sha(REG))
 elif op=="verify":
  verify();print("VERIFIED",len(CASES),sha(REG))
 elif op=="run":
  verify()
  requested=set(sys.argv[2:])
  valid={c["id"] for c in DISCOVERY}
  require(not requested or requested<=valid,"HOLDOUT_OR_UNKNOWN_SEED_FORBIDDEN")
  for c in (x for x in DISCOVERY if not requested or x["id"] in requested):
   for arm in ARMS:require(not output(c,arm).exists(),"RAW_EXISTS "+c["id"])
   with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
    jobs=[pool.submit(one,c,arm) for arm in ARMS]
    for j in concurrent.futures.as_completed(jobs):
     print("RUN",json.dumps(j.result(),sort_keys=True),flush=True)
 elif op=="audit":
  s=audit();print("AUDIT",json.dumps({k:s[k] for k in
   ("passGroups","failedGroups","missingGroups","triggeredGroups",
    "naturalFourArmGroups","eligiblePairedGroups")}))
  if s["failedGroups"]:raise SystemExit(2)
 elif op=="evaluate":
  s=evaluate();print("EVAL",json.dumps({k:s[k] for k in
    ("matchedEligibleGroups","naturalMatches","censoredMatches",
     "strictSafetyGate","promotionAllowed")}))
 else:raise SystemExit("freeze|verify|run [discovery IDs]|audit|evaluate")
if __name__=="__main__":main()
