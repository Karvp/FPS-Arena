#!/usr/bin/env python3
"""Package source and C35-AB raw datasets, verify CRC and SHA256."""
from pathlib import Path
import hashlib,json,zipfile,datetime
R=Path(__file__).resolve().parents[1];D=Path('/mnt/data');O=R/'reports/c35ab'
source=D/'FPS-Arena-Combat-Suite-v2.9.11-C35AB-Controlled-Aim-Movement.zip'
raw=D/'FPS-Arena-v2.9.11-C35AB-Raw-Evaluation.zip'
report=D/'FPS-Arena-v2.9.11-C35AB-Engineering-Report.md'
csv=D/'FPS-Arena-v2.9.11-C35AB-TDM-Three-Arm-24.csv'
validation=D/'FPS-Arena-v2.9.11-C35AB-Validation.json'
manifest=D/'FPS-Arena-v2.9.11-C35AB-Manifest.json'
a=json.loads((O/'matched-72/INDEPENDENT-AUDIT.json').read_text())
b=json.loads((O/'matched-72/ANALYSIS.json').read_text())
assert a['status']=='PASS' and a['matchCount']==72 and a['agentErrors']==0
assert b['byArm']['randomized']['kills']==237 and b['byArm']['observe']['kills']==273
v=json.loads(validation.read_text());assert v['node']['passed']==1250 and v['engine']['passed']==733
assert hashlib.sha256((R/'page-agent.js').read_bytes()).hexdigest()==v['productionSHA256']
ignore={'.git','node_modules','__pycache__'}
def archive(p,files):
 with zipfile.ZipFile(p,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=5,allowZip64=True) as z:
  for f in files:z.write(f,f.relative_to(R).as_posix())
 with zipfile.ZipFile(p,'r') as z:
  bad=z.testzip();assert bad is None,bad
  return len(z.namelist())
sourceFiles=sorted(f for f in R.rglob('*') if f.is_file() and not any(part in ignore for part in f.relative_to(R).parts))
rawFiles=sorted(f for f in O.rglob('*') if f.is_file())
print('Create full source zip',len(sourceFiles),flush=True);sn=archive(source,sourceFiles)
print('Create raw evaluation zip',len(rawFiles),flush=True);rn=archive(raw,rawFiles)
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
files=(source,raw,csv,report,validation)
manifest.write_text(json.dumps(dict(schema='fpsarena-c35ab-manifest-v1',createdUTC=datetime.datetime.now(datetime.timezone.utc).isoformat(),
 designSHA256=a['designSHA256'],sourceEntries=sn,rawEntries=rn,zipCRCPass=True,productionCodeUnchanged=True,
 files={p.name:{'bytes':p.stat().st_size,'sha256':sha(p)} for p in files}),indent=2)+'\n')
print(json.dumps({'sourceFiles':sn,'rawFiles':rn,'files':{p.name:p.stat().st_size for p in [source,raw,manifest]}},indent=2),flush=True)
