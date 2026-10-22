#!/usr/bin/env python3
"""Full research source + frozen experiment ZIPs with CRC and SHA256 external manifest."""
from pathlib import Path
import json,hashlib,zipfile,os,time
R=Path(__file__).resolve().parents[1]; OUT=R.parent
O=R/'reports/c35ai/frozen-72-v5'
SRC=OUT/'FPS-Arena-Combat-Suite-v2.9.11-C35AI-Physical-Tactical-Audit.zip'
RAW=OUT/'FPS-Arena-v2.9.11-C35AI-Raw-Evaluation.zip'
V=OUT/'FPS-Arena-v2.9.11-C35AI-Validation.json'
M=OUT/'FPS-Arena-v2.9.11-C35AI-Manifest.json'
def load(f):return json.loads(Path(f).read_text())
def sha(f):
 h=hashlib.sha256()
 with Path(f).open('rb') as r:
  for chunk in iter(lambda:r.read(4*1024*1024),b''):h.update(chunk)
 return h.hexdigest()
d=load(O/'FROZEN-DESIGN.json');audit=load(O/'INDEPENDENT-VERIFICATION.json');an=load(O/'INDEPENDENT-ANALYSIS.json');py=load(R/'reports/c35ai/regression/python.json');compat=load(R/'reports/c35ai/regression/PARITY-SMOKE.json')
assert len(d['cases'])==72 and audit['matches']==72 and an['matches']==72 and audit['sourceAndArtifactHashesVerified']
assert audit['randomizedAssignments']==an['options']['assigned']==148 and audit['complete']+audit['censored']==148
assert py['success'] and py['passed']==164 and all(x==0 for x in compat['fiveModes'].values())
assert sha(R/'page-agent.js')=='6a0381159e7c726a4ce8c0122618f1e1f299c43c5734d1d07b02ae4bb56d73ed'
validation=dict(schema='fpsarena-c35ai-final-validation-v1',status='PASS_ENGINEERING;NOT_PROMOTED_COMBAT',checkpoint='v2.9.11-C35AI',
 preregisteredDesignSHA256=sha(O/'FROZEN-DESIGN.json'),passed={'node':1319,'officialEngine':733,'pythonApplicable':py['passed'], 'pythonHistoricalSkips':py['historicalSkips'],'fiveModes':5},
 caseCount=72,setupClusters=24,simulatedMinutes=108,independentVerification=audit,independentAnalysis=an,
 replayCompatibility=compat,productionPageAgentSHA256=sha(R/'page-agent.js'),
 invalidCohortsExcluded=['v1','v2','v3','v4'],decision='No credible combat improvement. Leave neural/tactical controller offline-only. Physical displacement is an observed mediator, not a randomized effect.')
V.write_text(json.dumps(validation,indent=2,ensure_ascii=False)+'\n');(R/'C35AI-VALIDATION.json').write_bytes(V.read_bytes())
print('validation written',flush=True)
# Collect source files without following links or packaging python cache/intermediate temp files.
files=[]
for f in R.rglob('*'):
 if not f.is_file() or f.is_symlink():continue
 rel=f.relative_to(R)
 if '__pycache__' in rel.parts or '.git' in rel.parts or rel.suffix in ['.pyc','.pyo']:continue
 files.append((f,rel.as_posix()))
files.sort(key=lambda x:x[1]);print('source entries',len(files),'source disk GB',round(sum(f.stat().st_size for f,_ in files)/1e9,2),flush=True)
t=time.monotonic()
with zipfile.ZipFile(SRC,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=4,allowZip64=True) as z:
 for i,(f,rel) in enumerate(files,1):
  z.write(f,'FPS-Arena-v2.9.11-C35AI/'+rel)
  if i%3000==0:print('source',i,'/',len(files),'elapsed',round(time.monotonic()-t,1),'s',flush=True)
print('source zip MB',round(SRC.stat().st_size/1e6,1),flush=True)
# Frozen v5 complete artifacts plus four invalidation notices (not invalid research samples).
raw=[]
for f in O.rglob('*'):
 if f.is_file() and not f.is_symlink():raw.append((f,'frozen-72-v5/'+f.relative_to(O).as_posix()))
for name in ['v1','v2','v3','v4']:
 f=R/f'reports/c35ai/frozen-72-{name}-invalid/INVALIDATION.md'
 if f.exists():raw.append((f,f'failed-registrations/{name}/INVALIDATION.md'))
for f in sorted((R/'reports/c35ai/regression').rglob('*')):
 if f.is_file():raw.append((f,'regression/'+f.relative_to(R/'reports/c35ai/regression').as_posix()))
with zipfile.ZipFile(RAW,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=5,allowZip64=True) as z:
 for f,rel in raw:z.write(f,rel)
print('raw entries',len(raw),'MB',round(RAW.stat().st_size/1e6,1),flush=True)
for zipname in [SRC,RAW]:
 with zipfile.ZipFile(zipname) as z:
  err=z.testzip()
  if err:raise RuntimeError('CRC FAILED '+str(zipname)+':'+err)
  print(zipname.name,'CRC PASS',len(z.namelist()),'entries',flush=True)
components=[SRC,RAW,V,OUT/'FPS-Arena-v2.9.11-C35AI-Engineering-Report.md',
 OUT/'FPS-Arena-v2.9.11-C35AI-TDM-Three-Arm-24.csv',OUT/'FPS-Arena-v2.9.11-C35AI-Tactical-Physical-Factual.csv',
 OUT/'FPS-Arena-v2.9.11-C35AI-Independent-Verification.json',OUT/'FPS-Arena-v2.9.11-C35AI-Independent-Analysis.json']
manifest={'schema':'fpsarena-c35ai-artifact-sha256-v1','status':'PASS','files':{p.name:{'sha256':sha(p),'bytes':p.stat().st_size} for p in components}}
M.write_text(json.dumps(manifest,indent=2)+'\n')
for k,v in manifest['files'].items():print(k,v['bytes'],v['sha256'],flush=True)
print('MANIFEST',M,'DONE',flush=True)
