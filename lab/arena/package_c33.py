#!/usr/bin/env python3
"""C33 source, raw study and integrity manifest packager.

Validates gates and replay before making any claim about this checkpoint.
"""
from pathlib import Path
from hashlib import sha256
import json,zipfile,shutil
R=Path(__file__).resolve().parents[2]
O=Path('/mnt/data')
def sha(p):return sha256(Path(p).read_bytes()).hexdigest()
def load(p):return json.loads(Path(p).read_text())
rep=load(R/'reports/c33/INDEPENDENT-REPLAY.json')
assert rep['totalScenarios']==6480 and rep['totalArms']==19440 and rep['zeroReplayDisagreements']
assert sum(x['collisionScenarios'] for x in rep['studies'])==4979
assert sum(x['actionSensitiveScenarios'] for x in rep['studies'])==1311
full=R/'page-agent.js';assert sha(full)==sha(O/'fps-c32-work/page-agent.js')=='6a0381159e7c726a4ce8c0122618f1e1f299c43c5734d1d07b02ae4bb56d73ed'
ai=(O/'fps-c33-ai-tests.log').read_text();game=(O/'fps-c33-game-tests.log').read_text()
assert '# pass 987' in ai and '# fail 0' in ai
assert '733 passed, 0 failed' in game
for n in ['ai','engine','build']:assert (O/f'fps-c33-{n}-status').read_text().strip()=='0'
smoke=load(R/'reports/c33/FIVE-MODE-SMOKE.json')
assert len(smoke['modeSelection'])==5
studies={}
for group in ['map-cohort','refined-cohort']:
 d=R/'reports/c33'/group
 index=load(d/'INDEX.json');plan=load(d/'PRE-REGISTERED-PLAN.json')
 frozen=load(d/'FROZEN-MODEL.json');ev=load(d/'SEALED-EVALUATION.json')
 assert index['registrationSHA256']==plan['registrationSHA256']==frozen['registrationSHA256']
 assert sha(d/'DEVELOPMENT.json')==index['developmentSHA256']
 assert sha(d/'SEALED-HOLDOUT.json')==index['sealedTestSHA256']
 assert sha(d/'FROZEN-MODEL.json')==ev['frozenSHA256']
 assert frozen['selected']=='cover-and-clearance' and not frozen['neuralEligibleForFullMatch']
 assert ev['selectionLockedBeforeTest']==frozen['selected'] and ev['holdoutWasNeverUsedForSelection']
 studies[group]={'registrationSHA256':index['registrationSHA256'],'frozenSHA256':ev['frozenSHA256'],
  'splitCounts':index['counts'],'validationSelected':frozen['selected'],
  'neuralValidationGain':frozen['neuralGainOverBestSimpleVal'],
  'neuralWithinWeaponDiversity':frozen['noncollapsedWithinWeaponCount'],
  'testSelectedMeanCappedLoss':ev['scores'][frozen['selected']]['meanLoss'],
  'testBestNeuralMeanCappedLoss':ev['scores'][frozen['selectedBestNeural']]['meanLoss'],
  'testAlwaysLeftMeanCappedLoss':ev['scores']['always-left']['meanLoss']}
val={'schema':'fpsarena-c33-validated-long-research-checkpoint-v1','stage':'research-only',
 'neuralTrainingExecuted':True,'neuralProductionPromotion':'BLOCKED',
 'reason':'Both validation gates fail and within-weapon neural action selection collapses; no full-match trial authorized',
 'replay':rep,'studies':studies,'tests':{'ai':{'passed':987,'failed':0},'game':{'passed':733,'failed':0},
 'dedicatedC33':{'passed':13,'failed':0},'smokeModes':{'passed':5,'failed':0}},
 'productionAgentSHA256':sha(full),'productionByteIdenticalToC32':True,
 'limitations':['real static map AABB, but scenarios are synthetic, not recorded Game.step world states',
 'single synthetic enemy shooter tracking; no human evaluation',
 'lag scalar is NOT a recorded delayed public snapshot',
 'cover collision probes have not been benchmarked inside browser agent',
 'spatial dependence may reduce effective sample size beyond per-seed bootstrap'],
 'fullMatchNeuralTrials':0,'repositoryPushed':False}
valpath=O/'FPS-Arena-v2.9.11-C33-Validation.json';valpath.write_text(json.dumps(val,indent=2)+'\n')
report=O/'FPS-Arena-v2.9.11-C33-Engineering-Report.md';shutil.copyfile(R/'C33-ENGINEERING-REPORT.md',report)
source=O/'FPS-Arena-Combat-Suite-v2.9.11-C33-Real-Map-Collision-Research.zip'
raw=O/'FPS-Arena-v2.9.11-C33-Raw-Evaluation.zip'
with zipfile.ZipFile(raw,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=6,allowZip64=True) as z:
 for f in sorted((R/'reports/c33').rglob('*')):
  if f.is_file():z.write(f,f.relative_to(R))
 for filename in ['fps-c33-generate.log','fps-c33-train.log','fps-c33-b-generate.log','fps-c33-b-train.log','fps-c33-eval.log',
  'fps-c33-replay.log','fps-c33-specific-tests.log','fps-c33-ai-tests.log','fps-c33-game-tests.log',
  'fps-c33-engine-check.log','fps-c33-build.log','fps-c33-smoke.log']:
  p=O/filename
  if p.exists():z.write(p,Path('logs')/filename)
with zipfile.ZipFile(source,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=6,allowZip64=True) as z:
 for f in sorted(R.rglob('*')):
  if not f.is_file() or any(x in {'.git','node_modules','__pycache__','.pytest_cache'} for x in f.relative_to(R).parts):continue
  z.write(f,f.relative_to(R))
for f in [raw,source]:
 with zipfile.ZipFile(f) as z:
  bad=z.testzip()
  if bad:raise RuntimeError('ZIP CRC mismatch: '+bad)
files=[source,raw,report,valpath]
manifest={'schema':'fpsarena-c33-release-manifest-v1',
 'sourceFiles':len(zipfile.ZipFile(source).namelist()),'rawFiles':len(zipfile.ZipFile(raw).namelist()),
 'files':{f.name:{'bytes':f.stat().st_size,'sha256':sha(f)} for f in files},
 'zipCRC':'PASS','productionAgentSHA256':sha(full),'neuralProductionPromotion':False}
m=O/'FPS-Arena-v2.9.11-C33-Manifest.json';m.write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps(manifest,indent=2))
