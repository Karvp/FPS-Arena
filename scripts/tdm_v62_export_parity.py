#!/usr/bin/env python3
"""Emit independent PyTorch final-weight reference predictions for Node parity tests."""
from __future__ import annotations
import hashlib, json
from pathlib import Path
import numpy as np
import torch
from tdm_v62_train_shadow import public_vector, ROOT, MODEL, ARMS

def sha(path):
 return hashlib.sha256(Path(path).read_bytes()).hexdigest()

def parity():
 obj=json.loads(MODEL.read_text(encoding="utf-8"))
 w=obj["modelFit"]["weights"]
 means=np.asarray(obj["modelFit"]["means"],dtype=np.float32)
 scales=np.asarray(obj["modelFit"]["scales"],dtype=np.float32)
 probes=[
  ("v61",{"id":"v61-train-foundry-uzi-aim","map":"foundry","weapon":"uzi"}),
  ("v62",{"id":"v62-a-mp5sd-aim-01","map":"arena","weapon":"mp5sd"}),
  ("v62",{"id":"v62-f-uzi-fire-09","map":"foundry","weapon":"uzi"}),
  ("v62",{"id":"v62-n-m4a1-fire-16","map":"neon","weapon":"m4a1"}),
 ]
 items=[]
 for origin,c in probes:
  p=ROOT/"data"/origin/(c["id"]+"-keep.json")
  raw=json.loads(p.read_text(encoding="utf-8"))
  f=raw["results"][0]["tdmV61"]["triggerPublicFeatures"]
  for arm in ARMS:
   onehot=[float(x==arm) for x in ARMS]
   x=np.asarray([*public_vector(c,f),*onehot],dtype=np.float32)
   x=torch.tensor((x-means)/scales)
   hidden=torch.tanh(torch.nn.functional.linear(
       x,torch.tensor(w["shared.0.weight"]),torch.tensor(w["shared.0.bias"])))
   u=torch.nn.functional.linear(hidden,torch.tensor(w["utility.weight"]),torch.tensor(w["utility.bias"]))[0]
   risk=torch.sigmoid(torch.nn.functional.linear(hidden,torch.tensor(w["hazard.weight"]),torch.tensor(w["hazard.bias"]))[0])
   items.append({"group":c["id"],"origin":origin,"map":c["map"],"weapon":c["weapon"],"arm":arm,
                "publicState":f,"expectedUtility":float(u),"expectedRisk":float(risk),
                "rawInputSha256":sha(p)})
 out={"schema":"fpsarena-v62-independent-inference-parity-v1",
      "modelSha256":sha(MODEL),
      "referencesCalculatedWith":"PyTorch nn.functional.linear + tanh/sigmoid, saved model weights, no training",
      "probes":items}
 f=ROOT/"research"/"tdm-v62-shadow-parity-fixtures.json"
 f.write_text(json.dumps(out,indent=2,sort_keys=True)+"\n",encoding="utf-8")
 print("PARITY_FIXTURES",len(items), "MODEL_SHA",out["modelSha256"])
if __name__=="__main__":
 parity()
