#!/usr/bin/env python3
"""Research-only full checkpoint + auditable raw study; independent CRC and SHA manifest."""
from pathlib import Path
import hashlib,json,zipfile,shutil,time
R=Path(__file__).resolve().parents[1];OUT=R.parent
O=R/'reports/c35aj/prospective-108-v1';N=R/'reports/c35aj/neural';REG=R/'reports/c35aj/regression'
name='FPS-Arena-v2.9.11-C35AJ'
SRC=OUT/'FPS-Arena-Combat-Suite-v2.9.11-C35AJ-State-Conditioned-Tactical-Value.zip'
RAW=OUT/(name+'-Raw-Evaluation.zip')
V=OUT/(name+'-Validation.json');MAN=OUT/(name+'-Manifest.json')
def read(p):return json.loads(p.read_text())
def sha(p):
 h=hashlib.sha256()
 with Path(p).open('rb') as f:
  for b in iter(lambda:f.read(4*1024*1024),b''):h.update(b)
 return h.hexdigest()
D=read(O/'FROZEN-DESIGN.json');A=read(O/'INDEPENDENT-VERIFICATION.json');B=read(O/'INDEPENDENT-MATCH-ANALYSIS.json');E=read(N/'EVALUATION.json');PY=read(REG/'python.json');COMP=read(REG/'PARITY-SMOKE.json');EXEC=read(O/'EXECUTION-AUDIT.json')
assert len(D['cases'])==108==A['matches']==B['matches'] and EXEC['registrationSHA256']==sha(O/'FROZEN-DESIGN.json')
assert A['randomizedAssignments']==B['optionOffers']==240 and A['complete']+A['censored']==240
assert E['splitBySetup']['holdout']['complete']==77 and PY['success'] and PY['passed']==172
assert all(v==0 for v in COMP['fiveModes'].values()) and COMP['normalizedGameResultsIdentical'] and COMP['fourPriorTracesByteIdentical']
assert int((REG/'node.exit').read_text())==0 and int((REG/'python.exit').read_text())==0 and int((OUT/'c35aj-engine.exit').read_text())==0
assert '1324' in (REG/'node.log').read_text() and '733 passed, 0 failed' in (OUT/'c35aj-engine.log').read_text()
assert sha(R/'page-agent.js')=='6a0381159e7c726a4ce8c0122618f1e1f299c43c5734d1d07b02ae4bb56d73ed'
assert set(E['holdoutWeapons'])=={'aa12','uzi'} and E['offPolicyHoldout']['clusterBootstrap95DeltaIPS'][0]<0<E['offPolicyHoldout']['clusterBootstrap95DeltaIPS'][1]
for f,h in D['sourceSHA256'].items():assert sha(R/f)==h, 'frozen source modified '+f
# regression runs stored in the checkpoint; engine log copied inside before compression.
shutil.copy2(OUT/'c35aj-engine.log',REG/'engine.log')
shutil.copy2(OUT/'c35aj-engine.exit',REG/'engine.exit')
shutil.copy2(R/'C35AJ-ENGINEERING-REPORT.md',OUT/(name+'-Engineering-Report.md'))
shutil.copy2(O/'TDM-THREE-ARM-108.csv',OUT/(name+'-TDM-Three-Arm-36.csv'))
shutil.copy2(O/'TACTICAL-PHYSICAL-NEW-FACTUAL.csv',OUT/(name+'-New-Physical-Factual.csv'))
shutil.copy2(O/'INDEPENDENT-VERIFICATION.json',OUT/(name+'-Independent-Verification.json'))
shutil.copy2(O/'INDEPENDENT-MATCH-ANALYSIS.json',OUT/(name+'-Independent-Match-Analysis.json'))
shutil.copy2(N/'FROZEN-TACTICAL-MODELS.json',OUT/(name+'-Frozen-Tactical-Models.json'))
shutil.copy2(N/'EVALUATION.json',OUT/(name+'-Neural-Evaluation.json'))
shutil.copy2(N/'HOLDOUT-PREDICTIONS.csv',OUT/(name+'-Holdout-Predictions.csv'))
shutil.copy2(N/'FACTUAL-ASSIGNMENTS.csv',OUT/(name+'-Factual-Assignments.csv'))
shutil.copy2(R/'CHANGELOG-v2.9.11-C35AJ.md',OUT/(name+'-Changelog.md'))
V.write_text(json.dumps(dict(schema='fpsarena-c35aj-final-validation-v1',status='ENGINEERING_PASS;TACTICAL_POLICY_NOT_PROMOTED',
  matches=108,setupClusters=36,simulatedMinutes=162,sourceLockSHA256=sha(O/'FROZEN-DESIGN.json'),
  regression={'node':1324,'engine':733,'pythonPass':172,'pythonHistoricalSkip':5,'fiveModeSmoke':5,'newNodeTests':5},
  randomizedAssignments=A['randomizedAssignments'],censored=A['censored'],physicalModifiedTicks=A['totalChangedMotorTicks'],
  physicalRealizedModifiedTicks=A['actualMovingTicksWithChangedCommand'],
  matchedGameTotals=B['totals'],
  modelSelection=E['validationSelected'],modelHeldoutN=E['splitBySetup']['holdout']['complete'],
  offPolicyBootstrapCI=E['offPolicyHoldout']['clusterBootstrap95DeltaIPS'],
  holdoutGuns=list(E['holdoutWeapons'].keys()),
  productionAgentSHA256=sha(R/'page-agent.js'),
  decision='Unproven combat/policy improvement; MLP did not beat Ridge; no trained model controlled games; offline only.'),indent=2)+'\n')
(R/'C35AJ-VALIDATION.json').write_bytes(V.read_bytes())
files=[]
for f in R.rglob('*'):
 if not f.is_file() or f.is_symlink():continue
 rel=f.relative_to(R)
 if '__pycache__' in rel.parts or '.git' in rel.parts or f.suffix in ('.pyc','.pyo'):continue
 files.append((f,rel.as_posix()))
files.sort(key=lambda t:t[1]);print('SOURCE_FILES',len(files),flush=True)
t=time.monotonic()
with zipfile.ZipFile(SRC,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=4,allowZip64=True) as z:
 for i,(f,rel) in enumerate(files,1):
  z.write(f,'FPS-Arena-v2.9.11-C35AJ/'+rel)
  if i%2500==0:print('PACK_SOURCE',i,'/',len(files),'seconds',round(time.monotonic()-t,1),flush=True)
print('SOURCE_ZIP_MB',round(SRC.stat().st_size/1e6,2),flush=True)
raw=[]
for root,label in [(O,'prospective-108-v1'),(N,'neural'),(REG,'regression')]:
 for f in root.rglob('*'):
  if f.is_file() and not f.is_symlink():raw.append((f,label+'/'+f.relative_to(root).as_posix()))
# Include legacy design + randomized arm rows necessary to reproduce training from a smaller raw ZIP.
legacy=R/'reports/c35ai/frozen-72-v5'
for f in [legacy/'FROZEN-DESIGN.json',legacy/'EXECUTION-AUDIT.json']:
 raw.append((f,'legacy-c35ai/'+f.name))
for f in sorted((legacy/'matches').glob('*-randomized.option.json')):
 raw.append((f,'legacy-c35ai/matches/'+f.name))
for f in [R/'C35AJ-ENGINEERING-REPORT.md',V]:raw.append((f,'docs/'+f.name))
with zipfile.ZipFile(RAW,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=5,allowZip64=True) as z:
 for f,rel in raw:z.write(f,rel)
print('RAW_FILES',len(raw),'RAW_ZIP_MB',round(RAW.stat().st_size/1e6,2),flush=True)
for filename in (SRC,RAW):
 with zipfile.ZipFile(filename) as z:
  err=z.testzip()
  if err:raise RuntimeError('CRC failed '+str(err))
  print('ZIP_CRC_PASS',filename.name,len(z.namelist()),flush=True)
externals=[SRC,RAW,V]+[OUT/(name+'-'+tail) for tail in ['Engineering-Report.md','TDM-Three-Arm-36.csv','New-Physical-Factual.csv',
      'Independent-Verification.json','Independent-Match-Analysis.json','Frozen-Tactical-Models.json','Neural-Evaluation.json','Holdout-Predictions.csv','Factual-Assignments.csv','Changelog.md']]
manifest=dict(schema='fpsarena-c35aj-artifact-sha256-v1',files={p.name:{'sha256':sha(p),'bytes':p.stat().st_size} for p in externals},sourceEntries=len(files),rawEntries=len(raw),status='CRC_AND_SHA_PASS')
MAN.write_text(json.dumps(manifest,indent=2)+'\n')
print('MANIFEST',MAN,'DONE',flush=True)
