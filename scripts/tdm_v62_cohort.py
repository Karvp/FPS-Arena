#!/usr/bin/env python3
"""V62 preregistered additional *discovery-only* cohort of V61 public-cue replay.
Does not modify the frozen V60 or V61 controller, and NEVER auto-opens holdouts.
"""
from __future__ import annotations
import concurrent.futures
import hashlib
import json
import sys
from pathlib import Path
import tdm_v61_protocol as previous

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "v62"
DATA.mkdir(parents=True, exist_ok=True)
REG = ROOT / "research" / "tdm-v62-frozen-registry.json"
ARMS = tuple(previous.ARMS)
# Predeclared before ANY V62 simulator runs. These seeds are not V60 or V61 seeds.
CASES = [
 {"id":"v62-a-mp5sd-aim-01","split":"discovery","map":"arena","weapon":"mp5sd","stratum":"aim-lock","seed":620101},
 {"id":"v62-a-mp5sd-aim-02","split":"discovery","map":"arena","weapon":"mp5sd","stratum":"aim-lock","seed":620102},
 {"id":"v62-a-mp5sd-aim-03","split":"discovery","map":"arena","weapon":"mp5sd","stratum":"aim-lock","seed":620103},
 {"id":"v62-a-mp5sd-aim-04","split":"discovery","map":"arena","weapon":"mp5sd","stratum":"aim-lock","seed":620104},
 {"id":"v62-f-uzi-aim-05","split":"discovery","map":"foundry","weapon":"uzi","stratum":"aim-lock","seed":620105},
 {"id":"v62-f-uzi-aim-06","split":"discovery","map":"foundry","weapon":"uzi","stratum":"aim-lock","seed":620106},
 {"id":"v62-f-uzi-aim-07","split":"discovery","map":"foundry","weapon":"uzi","stratum":"aim-lock","seed":620107},
 {"id":"v62-f-uzi-aim-08","split":"discovery","map":"foundry","weapon":"uzi","stratum":"aim-lock","seed":620108},
 {"id":"v62-f-uzi-fire-09","split":"discovery","map":"foundry","weapon":"uzi","stratum":"post-fire","seed":620109},
 {"id":"v62-f-uzi-fire-10","split":"discovery","map":"foundry","weapon":"uzi","stratum":"post-fire","seed":620110},
 {"id":"v62-f-uzi-fire-11","split":"discovery","map":"foundry","weapon":"uzi","stratum":"post-fire","seed":620111},
 {"id":"v62-a-uzi-aim-12","split":"discovery","map":"arena","weapon":"uzi","stratum":"aim-lock","seed":620112},
 {"id":"v62-a-uzi-aim-13","split":"discovery","map":"arena","weapon":"uzi","stratum":"aim-lock","seed":620113},
 {"id":"v62-a-mp5sd-fire-14","split":"discovery","map":"arena","weapon":"mp5sd","stratum":"post-fire","seed":620114},
 {"id":"v62-a-mp5sd-fire-15","split":"discovery","map":"arena","weapon":"mp5sd","stratum":"post-fire","seed":620115},
 {"id":"v62-n-m4a1-fire-16","split":"discovery","map":"neon","weapon":"m4a1","stratum":"post-fire","seed":620116},
 {"id":"v62-n-aa12-fire-17","split":"discovery","map":"neon","weapon":"aa12","stratum":"post-fire","seed":620117},
 {"id":"v62-f-m4a1-damage-18","split":"discovery","map":"foundry","weapon":"m4a1","stratum":"post-damage","seed":620118},
 {"id":"v62-h-a-mp5sd-19","split":"holdout","map":"arena","weapon":"mp5sd","stratum":"aim-lock","seed":620119},
 {"id":"v62-h-f-uzi-20","split":"holdout","map":"foundry","weapon":"uzi","stratum":"post-fire","seed":620120},
]

def frozen_sha():
    h=hashlib.sha256()
    with REG.open("rb") as f:
        for chunk in iter(lambda:f.read(1024*1024), b""):
            h.update(chunk)
    return h.hexdigest()

def validated():
    previous.verify() # Verifies frozen V61 controller, its original registry, and production hashes.
    obj=json.loads(REG.read_text(encoding="utf-8"))
    if obj.get("cases")!=CASES or obj.get("arms")!=list(ARMS):
        raise ValueError("V62_FROZEN_CASES_OR_ARMS_CHANGED")
    if obj["v61RegistrySha256"]!=previous.digest(previous.REG):
        raise ValueError("PARENT_REGISTRY_CHANGED")
    for rel, expected in obj["immutableSourceSHA256"].items():
        if previous.digest(ROOT / rel)!=expected:
            raise ValueError("FROZEN_SOURCE_CHANGED: "+rel)
    all_prior=[*previous.CASES]
    older=json.loads((ROOT/"research"/"tdm-v60-frozen-registry.json").read_text(encoding="utf-8"))["cases"]
    registered=[x["seed"] for x in older+all_prior+CASES]
    if len(registered)!=len(set(registered)):
        raise ValueError("DUPLICATE_SEED_BETWEEN_COHORTS")
    return obj

def freeze():
    if REG.exists():
        raise RuntimeError("REGISTRY_ALREADY_FROZEN")
    previous.verify()
    obj={
      "schema":"fpsarena-v62-preregistered-additional-public-cue-cohort-v1",
      "arms":list(ARMS),"cases":CASES,
      "v61RegistrySha256":previous.digest(previous.REG),
      "v60RegistrySha256":previous.digest(ROOT/"research"/"tdm-v60-frozen-registry.json"),
      "immutableSourceSHA256":{x:previous.digest(ROOT/x) for x in [
          "lab/arena/tdm-stratified-replay-v60.mjs",
          "lab/arena/tdm-engagement-trigger-v61.mjs",
          "lab/arena/train-main-v61.mjs",
          "scripts/tdm_v61_protocol.py",
          "scripts/tdm_v62_cohort.py",
          "page-agent.js",
          "lab/arena/source-main/server/game.js",
          "lab/arena/source-main/server/bot.js"
      ]},
      "outputDir":"data/v62",
      "noReuse":[441108,441109],
      "windowTicks":{"treatment":150,"outcome":480},
      "criteria":{"minTriggeredIndependentGroups":16,
          "minHazardOrRewardPositiveGroups":8,
          "candidateOnlyIfGroupCVBeatsStateOnly":True,
          "promotionForbiddenWithoutSeparateHoldoutFullMatches":True},
      "unit":"independent seed group; not correlated ticks or arms",
      "rightCensored":"keep and exclude from complete outcome models",
      "holdoutPolicy":"no holdout run command implemented; no read of holdout results",
      "limitations":["Engine C35AJ baseline is not v57-v59","state hash is selected-server-fields witness, not clone",
                     "post-window full match K/D not a valid short-window label","actor receives only public pre-step features"],
    }
    REG.parent.mkdir(parents=True,exist_ok=True)
    REG.write_text(json.dumps(obj,sort_keys=True,indent=2)+"\n",encoding="utf-8")
    validated()
    return obj

def run_one(case,arm):
    old=previous.DATA
    # Read-time only shared global path. Assign once, prior to concurrent scheduling.
    if old!=DATA:raise RuntimeError("INCORRECT_COHORT_DATA")
    return previous.run(case,arm)

def set_data():
    previous.DATA=DATA

def audit_group(case):
    set_data()
    return previous.audit_case(case)

def audit(obj):
    set_data()
    rows=[audit_group(x) for x in obj["cases"]
          if x["split"]=="discovery" and all(previous.path(x,a).exists() for a in ARMS)]
    if not rows:raise ValueError("NO_COMPLETE_FOUR_ARM_GROUPS")
    triggered=sum(x.get("trigger") is not None for x in rows)
    hazard=sum(bool(x.get("event")) for x in rows)
    prior=json.loads((ROOT/"research"/"tdm-v61-audit-summary.json").read_text(encoding="utf-8"))
    if not prior["allPass"] or len(prior["groups"])!=9:
        raise ValueError("INVALID_FROZEN_PREVIOUS_AUDIT")
    totalTriggered=triggered+prior["triggered"]
    totalHazard=hazard+prior["hazardRewardGroups"]
    sufficient=totalTriggered>=obj["criteria"]["minTriggeredIndependentGroups"] and totalHazard>=obj["criteria"]["minHazardOrRewardPositiveGroups"]
    report={
      "schema":"fpsarena-v62-independent-cohort-audit-v1",
      "sha256OfFrozenRegistry":frozen_sha(),
      "seedIndependentAuditUnit":True,
      "groups":rows,
      "completedFourArmGroups":len(rows),
      "allPass":all(x["status"]=="PASS" for x in rows),
      "triggered":triggered,
      "hazardRewardGroups":hazard,
      "frozenPriorV61Triggered":prior["triggered"],
      "frozenPriorV61HazardReward":prior["hazardRewardGroups"],
      "totalTriggeredAcrossV61V62":totalTriggered,
      "totalPositiveGroupsAcrossV61V62":totalHazard,
      "meetsPreregisteredDataGate":sufficient,
      "holdoutOpened":False,
      "productionPromotion":False,
      "allOutcomesFromAuthoritativeGameStep":True,
    }
    (DATA/"v62-independent-audit.json").write_text(json.dumps(report,sort_keys=True,indent=2)+"\n",encoding="utf-8")
    return report

def main():
    op=sys.argv[1] if len(sys.argv)>1 else "verify"
    if op=="freeze":
        freeze()
        print("FROZEN",len(CASES),frozen_sha())
    elif op=="verify":
        x=validated()
        print("VERIFIED",len(x["cases"]),frozen_sha())
    elif op=="run":
        validated()
        set_data()
        wanted=set(sys.argv[2:])
        selected=[x for x in CASES if x["split"]=="discovery" and (not wanted or x["id"] in wanted)]
        if wanted and set(x["id"] for x in selected)!=wanted:
            raise ValueError("NO_HOLDOUT_OR_UNKNOWN_CASES_ALLOWED")
        for case in selected:
            with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
                futures=[pool.submit(run_one,case,arm) for arm in ARMS]
                for future in concurrent.futures.as_completed(futures):
                    print("COMPLETE",json.dumps(future.result(),sort_keys=True),flush=True)
    elif op=="audit":
        out=audit(validated())
        print("AUDIT",json.dumps({k:out[k] for k in ["completedFourArmGroups","allPass","triggered","hazardRewardGroups","totalTriggeredAcrossV61V62","totalPositiveGroupsAcrossV61V62","meetsPreregisteredDataGate","holdoutOpened"]},sort_keys=True))
        if not out["allPass"]:raise SystemExit(2)
    else:
        raise SystemExit("freeze | verify | run [discovery_case_id...] | audit")

if __name__=="__main__":
    main()
