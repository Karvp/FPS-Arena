from pathlib import Path
import csv,random,json
O=Path(__file__).resolve().parents[1]/'reports/c35af/frozen-54'
r=list(csv.DictReader((O/'TDM-THREE-ARM.csv').open()));q={i:{x['arm']:x for x in r if x['setupId']==i} for i in sorted(set(x['setupId'] for x in r))};rng=random.Random(20261014)
ratios={'kills':[],'deaths':[],'hits':[]};n=len(q)
for _ in range(5000):
 sampled=[q[rng.choice(list(q))] for i in range(n)]
 for f in ratios:
  a=sum(float(x['randomized'][f]) for x in sampled);b=sum(float(x['observe'][f]) for x in sampled)
  if b>0:ratios[f].append(a/b)
out={k:{'ratio':sum(float(x['randomized'][k]) for x in q.values())/sum(float(x['observe'][k]) for x in q.values()),'bootstrap95':[sorted(v)[int(len(v)*.025)],sorted(v)[int(len(v)*.975)]]} for k,v in ratios.items()}
(O/'TDM-BOOTSTRAP.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps(out,indent=2))
