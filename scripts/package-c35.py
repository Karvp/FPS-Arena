#!/usr/bin/env python3
"""Release C35 engineering pilot, with immutable prereg source SHA and CRC checks."""
from __future__ import annotations
import hashlib,json,pathlib,zipfile,re
ROOT=pathlib.Path(__file__).resolve().parent.parent
DATA=ROOT.parent
P=ROOT/'reports/c35/pilot-90'
REG=json.loads((P/'PRE-REGISTERED-PLAN.json').read_text())
V=json.loads((P/'INDEPENDENT-VALIDATION.json').read_text())
N=json.loads((P/'PILOT-NUISANCE.json').read_text())
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
assert sha(DATA/'FPS-Arena-Combat-Suite-v2.9.11-C34-Real-Encounter-Study.zip')==REG['parentC34ArchiveSHA256']
for relative,digest in REG['sourceFilesSHA256'].items():
 assert sha(ROOT/relative)==digest,('C35 registration violated by source drift',relative)
assert len(REG['cases'])==90 and V['matches']==90 and V['registrationSHA256']==REG['registrationSHA256']==N['registrationSHA256']
assert V['offers']==1193 and V['completeOffers']==1179 and V['hitPositiveOffers']==19 and V['overrideOffers']==395
assert N['actualSimulatedMinutes']>255 and N['actualSimulatedMinutes']<256
assert all(V[k]==0 for k in ('safetyViolations','assignmentMismatch','serverLeak','windowOverlap','replayMismatch'))
assert sha(ROOT/'page-agent.js')=='6a0381159e7c726a4ce8c0122618f1e1f299c43c5734d1d07b02ae4bb56d73ed'
ai=(DATA/'fps-c35-all-ai-tests.log').read_text()
game=(DATA/'fps-c35-game-tests.log').read_text()
assert re.search(r'^# tests 1012$',ai,re.M) and re.search(r'^# pass 1012$',ai,re.M) and re.search(r'^# fail 0$',ai,re.M)
assert '733 passed, 0 failed' in game
modes=json.loads((DATA/'fps-c35-five-modes.json').read_text())
assert modes['aggregate']['rounds']==5 and modes['aggregate']['agentErrors']==0
orig=(DATA/'c35-parity-C34.dataset.json').read_bytes();new=(DATA/'c35-parity-C35.dataset.json').read_bytes()
assert orig==new
par1=json.loads((DATA/'c35-parity-C34.result.json').read_text());par2=json.loads((DATA/'c35-parity-C35.result.json').read_text())
par1.pop('created',None);par2.pop('created',None)
assert par1==par2
assert (P/'match-000.dataset.json').read_bytes()==(DATA/'fps-c35-replay-000.dataset.json').read_bytes()
rr=json.loads((DATA/'fps-c35-replay-000.result.json').read_text());aa=json.loads((P/'match-000.result.json').read_text())
rr.pop('created',None);aa.pop('created',None);assert rr==aa
report=DATA/'FPS-Arena-v2.9.11-C35-Engineering-Report.md';report.write_bytes((ROOT/'C35-ENGINEERING-REPORT.md').read_bytes())
validation={
 'schema':'fpsarena-c35-research-only-release-verification-v1',
 'stage':'technical pilot, not causal efficacy trial',
 'date':'2026-10-13',
 'registeredCohort':{'matchCount':90,'maxSecondsPerMatch':180,'actualSimulatedMinutes':N['actualSimulatedMinutes'],
   'registrationSHA256':REG['registrationSHA256'],'parentC34SourceSHA256':REG['parentC34ArchiveSHA256'],
   'sourceIntegrity':True,'sameSeedByteReplay':True,'assignmentReplayMismatch':0},
 'research':{'randomizedOffers':V['offers'],'completeWindows':V['completeOffers'],'censoredWindows':V['censoredOffers'],
  'hitPositiveWindows':V['hitPositiveOffers'],'hitPositiveRate':V['hitPositiveRate'],
  'hitPositiveRateBootstrap95':N['positiveWindowRateMatchBootstrap95'],
  'assignmentCounts':V['byArmAssignments'],'interruptions':V['overrideOffers'],
  'allOfferInterruptionRate':N['interruptRateAll'],'microInterruptionRate':N['interruptRateMicro'],
  'perArmTreatmentOutcomesInspected':False,'neuralModelsTrained':0,'powerAdequate':False,
  'causalLearningPromotion':False,'fullConfirmatoryC35Started':False,
  'reason':'Sparse hostile weapon hits and high interruption; further full matches without remediation unjustified'},
 'verification':{'aiTests':'1012/1012','engineTests':'733/733','fiveModeSmoke':'5/5',
  'sameSeedC34BaselineParity':'exact C34 dataset bytes','sameSeedC35RegisteredReplay':'exact C35 dataset bytes',
  'productionAgentUnmodified':True,'productionSHA256':sha(ROOT/'page-agent.js'),
  'registeredSourceHashesMatch':True,'pilotMatchesIndependentlyVerified':90,
  'safeGateViolationsDetected':0,'preActionServerTruthLeakageDetected':0},
 'gateDecisions':{'engineering':'PASS','causalStudyDataAdequacy':'FAIL','neuralPolicyEfficacy':'NOT TESTED',
  'productionPromotion':'NO','githubPush':'NO'}
}
vp=DATA/'FPS-Arena-v2.9.11-C35-Validation.json'
vp.write_text(json.dumps(validation,indent=2,ensure_ascii=False)+'\n')
raw=DATA/'FPS-Arena-v2.9.11-C35-Raw-Evaluation.zip'
source=DATA/'FPS-Arena-Combat-Suite-v2.9.11-C35-Randomized-Action-Pilot.zip'
for target,files in [
 (raw,sorted(p for p in (ROOT/'reports/c35').rglob('*') if p.is_file())),
 (source,sorted(p for p in ROOT.rglob('*') if p.is_file() and not ({'__pycache__','node_modules','.git'}&set(p.parts)) and p.suffix not in ('.zip','.pyc') and not p.name.startswith('.DS_Store')))]:
 print('WRITING',target.name,len(files),flush=True)
 with zipfile.ZipFile(target,'w',zipfile.ZIP_DEFLATED,compresslevel=6,allowZip64=True) as z:
  for f in files:z.write(f,f.relative_to(ROOT).as_posix())
 with zipfile.ZipFile(target,'r') as z:
  assert z.testzip() is None
  assert len(z.namelist())==len(files)
 print('PASS',target.name,'bytes',target.stat().st_size,'entries',len(files),flush=True)
manifest={'schema':'fpsarena-c35-research-artifacts-sha256-v1',
 'registrationSHA256':REG['registrationSHA256'],
 'parentC34SourceSHA256':REG['parentC34ArchiveSHA256'],
 'artifacts':{p.name:{'bytes':p.stat().st_size,'sha256':sha(p)} for p in (source,raw,report,vp)},
 'sourceZipEntryCount':len(zipfile.ZipFile(source).namelist()),
 'rawZipEntryCount':len(zipfile.ZipFile(raw).namelist()),
 'ZIPCRC':'PASS'}
mp=DATA/'FPS-Arena-v2.9.11-C35-Manifest.json';mp.write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps(manifest,indent=2),flush=True)
