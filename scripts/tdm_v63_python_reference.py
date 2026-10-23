#!/usr/bin/env python3
"""Independent Python reference scores for frozen v63 shrinkage JS shadow parity."""
import hashlib,json
from pathlib import Path
from tdm_v63_contrastive import ROOT,MODEL,ARMS,predict
from tdm_v62_train_shadow import public_vector

probes=[
 ("v61",{"id":"v61-train-foundry-uzi-aim","map":"foundry","weapon":"uzi"}),
 ("v61",{"id":"v61-train-arena-mp5sd-aim","map":"arena","weapon":"mp5sd"}),
 ("v62",{"id":"v62-a-mp5sd-aim-01","map":"arena","weapon":"mp5sd"}),
 ("v62",{"id":"v62-f-uzi-fire-09","map":"foundry","weapon":"uzi"}),
 ("v62",{"id":"v62-n-m4a1-fire-16","map":"neon","weapon":"m4a1"})]
obj=json.loads(MODEL.read_text("utf-8"))
out=[]
for origin,case in probes:
 p=ROOT/"data"/origin/(case["id"]+"-keep.json")
 state=json.loads(p.read_text("utf-8"))["results"][0]["tdmV61"]["triggerPublicFeatures"]
 group=[{"group":case["id"],"arm":arm,"state":public_vector(case,state),
         "utility":0.0,"hazard":0.0} for arm in ARMS]
 u,h=predict(obj["modelVariants"]["armContext"],group)
 out.append({"origin":origin,"id":case["id"],"map":case["map"],"weapon":case["weapon"],
      "publicState":state,"expectedUtility":u,"expectedHazard":h})
digest=hashlib.sha256(MODEL.read_bytes()).hexdigest()
path=ROOT/"research"/"tdm-v63-python-js-parity-fixtures.json"
path.write_text(json.dumps({"modelSha256":digest,"references":out,"source":"frozen sklearn ridge weights"},sort_keys=True,indent=2)+"\n",encoding="utf-8")
print("WROTE_REFERENCE_PROBES",len(out),digest)
