import importlib.util,concurrent.futures,json
from pathlib import Path
spec=importlib.util.spec_from_file_location('c35f_runner',Path(__file__).parent/'run-c35f-pilot.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
plan=m.plan();reg=m.sha(m.OUT/'FROZEN-DESIGN.json')
assert json.loads((m.OUT/'FROZEN-DESIGN.json').read_text())==plan
rows=[];missing=[]
for c in plan['cases']:
 p=m.OUT/'matches'/c['id'];ds=Path(str(p)+'.dataset.json');rs=Path(str(p)+'.result.json')
 if ds.exists() and rs.exists():
  record=json.loads(ds.read_text())['matches'][0]
  rows.append({'id':c['id'],'setupId':c['setupId'],'policy':c['policy'],'seed':c['seed'],'datasetSHA256':m.sha(ds),'resultSHA256':m.sha(rs),'preoffers':record['c35c']['diagnostics']['attempts'],'offers':len(record['offers'])})
 else:missing.append(c)
print('resume existing',len(rows),'remaining',len(missing),flush=True)
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
 for f in concurrent.futures.as_completed([pool.submit(m.run,c,reg) for c in missing]):
  x=f.result();rows.append(x);print('completed',len(rows),'/',len(plan['cases']),x['id'],flush=True)
(m.OUT/'EXECUTION-AUDIT.json').write_bytes(m.canon({'registrationSHA256':reg,'executed':sorted(rows,key=lambda x:x['id']),'resumed':True}))
print('audit ready',flush=True)
