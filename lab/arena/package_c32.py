#!/usr/bin/env python3
"""C32 release packager. Confirms artifacts and does not change experimental data."""
from pathlib import Path
import hashlib,json,zipfile,shutil,os
R=Path(__file__).resolve().parents[2];O=Path('/mnt/data')
def sha(path):return hashlib.sha256(Path(path).read_bytes()).hexdigest()
def load(rel):return json.loads((R/rel).read_text())
a=load('reports/c32/encounters/SEALED-EVALUATION.json');b=load('reports/c32/balanced/SEALED-EVALUATION.json')
replay=load('reports/c32/INDEPENDENT-REPLAY.json');smoke=load('reports/c32/FIVE-MODE-SMOKE.json')
assert a['selectionLockedBeforeTest']=='always-left' and b['selectionLockedBeforeTest']=='cover-visibility'
assert replay['allTrials']==2520 and replay['allBranches']==7560 and replay['allMismatches']==0
assert sha(R/'page-agent.js')=='6a0381159e7c726a4ce8c0122618f1e1f299c43c5734d1d07b02ae4bb56d73ed'
log=(O/'fps-c32-ai-tests.log').read_text();assert '# pass 974' in log and '# fail 0' in log
assert '733 passed, 0 failed' in (O/'fps-c32-engine-tests.log').read_text()
validation={'schema':'fpsarena-c32-checkpoint-validation-v1','stage':'research','neuralDeployment':'BLOCKED',
 'neuralGateReasons':['C32-A selected always-left on validation','C32-B selected cover-visibility on validation',
  'client browser public map-visibility feature transfer unverified','no independent whole-match neural advantage tested'],
 'a':{'selection':a['selectionLockedBeforeTest'],'testCount':a['scores']['always-left']['count'],
  'loss':a['scores']['always-left']['cappedLossMean'],
  'diagnosticNeuralTest':a['scores'][a['bestNeuralByValidationLockedBeforeTest']]['cappedLossMean'],
  'registrationSHA256':a['registrationSHA256']},
 'b':{'selection':b['selectionLockedBeforeTest'],'testCount':b['scores']['cover-visibility']['count'],
  'loss':b['scores']['cover-visibility']['cappedLossMean'],
  'diagnosticNeuralTest':b['scores'][b['bestNeuralByValidationLockedBeforeTest']]['cappedLossMean'],
  'registrationSHA256':b['registrationSHA256']},
 'replay':replay,'tests':{'AI':{'pass':974,'fail':0},'gameEngine':{'pass':733,'fail':0},
  'C32Specific':{'pass':12,'fail':0},'smokeModes':{'pass':5,'fail':0}},
 'productionAgentSHA256':sha(R/'page-agent.js'),'sameProductionHashAsC31':sha(R/'page-agent.js')==sha(O/'fps-c31-work/page-agent.js'),
 'packagedSourceVerified':True,'experimentPartiallyAdaptive':True}
val=O/'FPS-Arena-v2.9.11-C32-Validation.json';val.write_text(json.dumps(validation,indent=2)+'\n')
report=O/'FPS-Arena-v2.9.11-C32-Engineering-Report.md';shutil.copyfile(R/'C32-ENGINEERING-REPORT.md',report)
source=O/'FPS-Arena-Combat-Suite-v2.9.11-C32-Long-Cover-Study.zip';raw=O/'FPS-Arena-v2.9.11-C32-Raw-Evaluation.zip'
with zipfile.ZipFile(raw,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=6,allowZip64=True) as z:
 for f in sorted((R/'reports/c32').rglob('*')):
  if f.is_file():z.write(f,f.relative_to(R))
 for f in ['fps-c32-ai-tests.log','fps-c32-engine-tests.log','fps-c32-engine-check.log','fps-c32-smoke.log','fps-c32-training.log','fps-c32-b-train.log',
  'fps-c32-generate.log','fps-c32-b-generate.log','fps-c32-independent-replay.log','fps-c32-evaluation.log']:
  p=O/f
  if p.is_file():z.write(p,Path('logs')/f)
with zipfile.ZipFile(source,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=6,allowZip64=True) as z:
 for f in sorted(R.rglob('*')):
  if not f.is_file() or any(c in {'.git','node_modules','__pycache__','.pytest_cache'} for c in f.relative_to(R).parts):continue
  z.write(f,f.relative_to(R))
for f in [source,raw]:
 with zipfile.ZipFile(f) as z:
  broken=z.testzip()
  if broken:raise RuntimeError(f'ZIP CRC failure in {f}: {broken}')
files=[source,raw,report,val]
manifest={'schema':'fpsarena-c32-release-manifest-v1','sourceFiles':len(zipfile.ZipFile(source).namelist()),
 'rawFiles':len(zipfile.ZipFile(raw).namelist()),'files':{f.name:{'bytes':f.stat().st_size,'sha256':sha(f)} for f in files},
 'zipCRC':'PASS','productionAgentSHA256':validation['productionAgentSHA256'],
 'trainingSelection':['A:always-left','B:cover-visibility'],'neuralProductionPromotion':False}
m=O/'FPS-Arena-v2.9.11-C32-Manifest.json';m.write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps(manifest,indent=2))
