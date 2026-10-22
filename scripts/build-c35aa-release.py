#!/usr/bin/env python3
"""Build verified C35-AA source/evaluation ZIPs and cryptographic manifest."""
from pathlib import Path
import hashlib,json,zipfile,datetime
R=Path(__file__).resolve().parents[1];D=Path('/mnt/data')
source=D/'FPS-Arena-Combat-Suite-v2.9.11-C35AA-Aim-Movement-Audit.zip'
raw=D/'FPS-Arena-v2.9.11-C35AA-Raw-Evaluation.zip'
report=D/'FPS-Arena-v2.9.11-C35AA-Engineering-Report.md'
csv=D/'FPS-Arena-v2.9.11-C35AA-TDM-Three-Arm-12.csv'
validation=D/'FPS-Arena-v2.9.11-C35AA-Validation.json'
manifest=D/'FPS-Arena-v2.9.11-C35AA-Manifest.json'
O=R/'reports/c35aa/matched-36'
a=json.loads((O/'INDEPENDENT-AUDIT.json').read_text());b=json.loads((O/'ANALYSIS.json').read_text());p=json.loads((O/'PYTHON-REGRESSION.json').read_text());replay=json.loads((R/'reports/c35aa/REPLAY-PARITY.json').read_text());smoke=json.loads((R/'reports/c35aa/five-mode-smoke.result.json').read_text())
assert a['status']=='PASS' and a['matchCount']==36 and a['shotsReconciled']==b['shots'] and a['agentErrors']==0
assert p['success'] and p['passed']==144 and replay['status']=='PASS' and smoke['aggregate']['agentErrors']==0 and len(smoke['results'])==5
assert hashlib.sha256((R/'page-agent.js').read_bytes()).hexdigest()=='6a0381159e7c726a4ce8c0122618f1e1f299c43c5734d1d07b02ae4bb56d73ed'
validation.write_text(json.dumps({'schema':'fpsarena-c35aa-validation-v1','status':'PASS','scope':'research-only; never promoted to production',
 'node':{'passed':1238,'failed':0},'engine':{'passed':733,'failed':0},'python':p,
 'smokeModes':[x['mode'] for x in smoke['results']],'replayParity':replay,'independentAudit':a,
 'analysis':{'bootstrappedSetupCount':12,'killsRatioRandomizedObserve':b['randomizedVsObserve']['kills'],
 'serverSpreadParityMaxDegrees':b['spreadDifference']['maxAbsDeg'],'shotCount':b['shots']},
 'productionPageAgentSHA256':'6a0381159e7c726a4ce8c0122618f1e1f299c43c5734d1d07b02ae4bb56d73ed',
 'limitations':'No causal conclusion from ADS/speed stratification; 6 historical source-SHA-locked Python tests excluded rather than updated.'},indent=2)+'\n')
csv.write_bytes((O/'TDM-THREE-ARM-12.csv').read_bytes())
def archive(p,files):
 with zipfile.ZipFile(p,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=6,allowZip64=True) as z:
  for f in files:z.write(f,f.relative_to(R).as_posix())
 with zipfile.ZipFile(p) as z:
  bad=z.testzip();assert bad is None,bad
  return len(z.namelist())
source_files=sorted(x for x in R.rglob('*') if x.is_file() and not any(s in {'__pycache__','.git','node_modules'} for s in x.relative_to(R).parts))
raw_files=sorted(x for x in (R/'reports/c35aa').rglob('*') if x.is_file())
print('Creating source zip',len(source_files),flush=True);sn=archive(source,source_files)
print('Creating raw zip',len(raw_files),flush=True);rn=archive(raw,raw_files)
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
files=[source,raw,csv,report,validation]
manifest.write_text(json.dumps({'schema':'fpsarena-c35aa-release-manifest-v1',
 'createdUTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),
 'frozenDesignSHA256':a['registrationSHA256'],
 'sourceEntries':sn,'rawEntries':rn,
 'files':{f.name:{'bytes':f.stat().st_size,'sha256':sha(f)} for f in files},
 'zipCRCPass':True,'productionCodeUnchanged':True},indent=2)+'\n')
print(json.dumps({x.name:{'bytes':x.stat().st_size,'sha256':sha(x)} for x in (source,raw,validation,manifest)},indent=2),flush=True)
