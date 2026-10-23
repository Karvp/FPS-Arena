#!/usr/bin/env python3
"""Independent numpy references for V64 JS shadow inference, frozen full-fit coefficients."""
import hashlib,json
import numpy as np
from pathlib import Path
from tdm_v64_train_context import ROOT,MODEL,inputs,features,ARMS
from tdm_v62_train_shadow import public_vector
PROBES=[
 ("v64-aim-arena-mp5sd-01","arena","mp5sd"),
 ("v64-aim-foundry-uzi-07","foundry","uzi"),
 ("v64-fire-foundry-uzi-09","foundry","uzi"),
 ("v64-aim-arena-uzi-11","arena","uzi")
]
doc=json.loads(MODEL.read_text("utf-8"))
out=[]
for name,map_name,weapon in PROBES:
 p=ROOT/"data"/"v64"/(name+"-keep.json")
 v=json.loads(p.read_text("utf-8"))["results"][0]["tdmV64"]
 if v["triggerTick"] is None:continue
 state=v["triggerPublicFeatures"]
 ctx=v["contextV64"]
 case={"map":map_name,"weapon":weapon}
 rows=[{"group":name,"arm":arm,"old":public_vector(case,state),
  "new":features(ctx),"utility":0.0,"hazard":0.0} for arm in ARMS]
 for variant in ("old-action","context-action"):
  x,_,_=inputs([rows],variant)
  fit=doc["model"]["variants"][variant]
  mu=np.asarray(fit["mu"],dtype=float)
  std=np.asarray(fit["std"],dtype=float)
  z=np.clip((x-mu)/std,-3,3)
  u=fit["utility"]["intercept"]+z@np.asarray(fit["utility"]["weights"])
  h=np.clip(fit["hazard"]["intercept"]+z@np.asarray(fit["hazard"]["weights"]),.001,.999)
  out.append({"group":name,"map":map_name,"weapon":weapon,
   "publicState":state,"context":ctx,"variant":variant,
   "utility":[float(a) for a in u],"hazard":[float(a) for a in h]})
target=ROOT/"research"/"tdm-v64-js-python-parity-fixtures.json"
target.write_text(json.dumps({"schema":"fpsarena-v64-independent-numpy-js-parity-v1",
  "modelSha256":hashlib.sha256(MODEL.read_bytes()).hexdigest(),
  "probes":out},sort_keys=True,indent=2)+"\n",encoding="utf-8")
print("PARITY_GROUP_VARIANT_REFERENCES",len(out))
