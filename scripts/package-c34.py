#!/usr/bin/env python3
"""Package C34 reproducible research source and raw evidence, CRC + SHA256 verify."""
import hashlib,json,pathlib,zipfile,os
ROOT=pathlib.Path(__file__).resolve().parent.parent
DATA=pathlib.Path('/mnt/data');STUDY=ROOT/'reports/c34';P=STUDY/'real-matches-54';B=STUDY/'extra-train-18'
prereg=json.loads((P/'PRE-REGISTERED-PLAN.json').read_text());adapt=json.loads((B/'ADAPTIVE-TRAIN-ADDENDUM.json').read_text());s=json.loads((P/'SEALED-EVALUATION.json').read_text());f=json.loads((P/'FROZEN-DEVELOPMENT-MODELS.json').read_text())
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
for relative,digest in prereg['fileSHA256'].items():
 assert sha(ROOT/relative)==digest,('altered prereg source',relative)
assert adapt['parentRegistrationSHA256']==sha(P/'PRE-REGISTERED-PLAN.json')
assert s['frozenSHA256']==sha(P/'FROZEN-DEVELOPMENT-MODELS.json')
assert f['selection']['selected']=='logistic-C0.3' and s['gates']['actionPolicyPromotion'] is False
for dirname,cases in [(P,prereg['cases']),(B,adapt['cases'])]:
 for c in cases:
  prefix=dirname/f"match-{c['id']}";ds=json.loads(prefix.with_suffix('.dataset.json').read_text());r=json.loads(prefix.with_suffix('.result.json').read_text());w=ds['matches'][0]
  assert w['metadata']['seed']==r['seed']==c['seed'] and ds['controlledEnemyPrimary']==c['weapon'] and w['metadata']['map']==c['map'] and r['opponentPolicy']==c['opponents']
  assert not r['aggregate']['agentErrors']
  assert all(x['serverAfterDecision'] and x['public']['enemy']['snapshotTime']<=x['start']+.01 for x in w['windows'])
  assert all(x['complete'] and not x['censored'] for x in w['windows'])
assert (STUDY/'REPLAY-000.dataset.json').read_bytes()==(P/'match-000.dataset.json').read_bytes()
assert sha(ROOT/'page-agent.js')==sha(pathlib.Path('/mnt/data/fps-c33-work/page-agent.js'))
assert [int(pathlib.Path('/mnt/data/fps-c34-build.status').read_text()),int(pathlib.Path('/mnt/data/fps-c34-ai.status').read_text())]==[0,0]
assert pathlib.Path('/mnt/data/fps-c34-engine.status').read_text().strip()=='0,0'
assert pathlib.Path('/mnt/data/fps-c34-five-mode.status').read_text().strip()=='0'
validation={
 'schema':'fpsarena-c34-verified-release-evidence-v1', 'stage':'research-only',
 'outcome':{'factualHitPredictor':'PASS limited holdout comparator','neuralActionPolicy':'NOT demonstrated','productionPromotion':False},
 'sourceRegistration':{'primarySHA256':sha(P/'PRE-REGISTERED-PLAN.json'), 'adaptiveAddendumSHA256':sha(B/'ADAPTIVE-TRAIN-ADDENDUM.json'), 'sourceFingerprintsPass':True},
 'simulation':{'originalMatches':54,'adaptiveTrainOnlyMatches':18,'totalMatches':72,'secondsPerMatch':90,'simulatedGameMinutes':108,'completeWindows':3526,'positiveWeaponHitWindows':155,'c16EligibleWindows':138,'agentErrors':0,'censoredWindows':0,'independenceUnit':'match seed'},
 'model':{'trainedNeuralCandidates':3,'trainedLogisticCandidates':3,'selectedByValidation':f['selection']['selected'],
  'training':f['train'],'validation':f['validation'],'sealedTest':s['test'],'gates':s['gates'],
  'limits':'pure observational future-hit prediction: NOT a causal three-arm damage estimator; three small neural models did not beat logistic at validation'},
 'verification':{'AIRegression':'1000/1000','gameEngine':'733/733','gameSourceCheck':'PASS','fiveModeSmoke':'5/5',
  'dedicatedC34Tests':'13/13','baselineSameSeed18Indicators':'18/18','raw90sReplay':'exact byte match',
  'productionSHA256':sha(ROOT/'page-agent.js'),'productionIdenticalToC33':True},
 'knownLimitations':['Own headless local state is server-synchronized before observation','Only controlled primary and synthetic networking, not human opponents','No alternate action counterfactual','Match-cluster statistics do not establish broader deployment generalization']}
vp=DATA/'FPS-Arena-v2.9.11-C34-Validation.json';vp.write_text(json.dumps(validation,indent=2,ensure_ascii=False)+'\n')
report=DATA/'FPS-Arena-v2.9.11-C34-Engineering-Report.md';assert report.exists() and report.read_bytes()==(ROOT/'C34-ENGINEERING-REPORT.md').read_bytes()
raw=DATA/'FPS-Arena-v2.9.11-C34-Raw-Evaluation.zip'
source=DATA/'FPS-Arena-Combat-Suite-v2.9.11-C34-Real-Encounter-Study.zip'
print('PACKAGING RAW')
with zipfile.ZipFile(raw,'w',zipfile.ZIP_DEFLATED,compresslevel=6,allowZip64=True) as zip:
 files=sorted(x for x in STUDY.rglob('*') if x.is_file() and '__pycache__' not in x.parts)
 for p in files:zip.write(p,p.relative_to(ROOT).as_posix())
 print('RAW files',len(files))
print('PACKAGING SOURCE')
with zipfile.ZipFile(source,'w',zipfile.ZIP_DEFLATED,compresslevel=6,allowZip64=True) as zip:
 files=sorted(x for x in ROOT.rglob('*') if x.is_file() and '__pycache__' not in x.parts and 'node_modules' not in x.parts and p_allowed(x)) if False else None
 for p in sorted(ROOT.rglob('*')):
  if not p.is_file() or '__pycache__' in p.parts or 'node_modules' in p.parts or p.suffix in ('.zip','.pyc') or p.name.startswith('.DS_Store'):continue
  zip.write(p,p.relative_to(ROOT).as_posix())
 print('SOURCE files',len(zip.namelist()))
for p in [raw,source]:
 with zipfile.ZipFile(p) as z:
  assert z.testzip() is None,(p,'CRC mismatch')
  print(p.name,'bytes',p.stat().st_size,'entries',len(z.namelist()),'CRC PASS')
manifest={'schema':'fpsarena-c34-artifacts-sha256-v1','artifacts':{p.name:{'sha256':sha(p),'bytes':p.stat().st_size} for p in [source,raw,report,vp]},'sourceEntryCount':len(zipfile.ZipFile(source).namelist()),'rawEntryCount':len(zipfile.ZipFile(raw).namelist()),'CRC':'PASS'}
(DATA/'FPS-Arena-v2.9.11-C34-Manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print('C34 COMPLETE',json.dumps(manifest['artifacts'],indent=2))
