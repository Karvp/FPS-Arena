#!/usr/bin/env python3
"""Validate and package C35-B research release. No efficacy conclusion."""
from __future__ import annotations
import hashlib,json,pathlib,zipfile,re
ROOT=pathlib.Path(__file__).resolve().parent.parent
DATA=ROOT.parent
P=ROOT/'reports/c35b/pilot-108'
REG=json.loads((P/'PRE-REGISTERED-PLAN.json').read_text())
V=json.loads((P/'INDEPENDENT-VALIDATION.json').read_text())
A=json.loads((P/'DOSE-ENGINEERING-ANALYSIS.json').read_text())
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
assert len(REG['cases'])==108 and REG['registrationSHA256']==V['registrationSHA256']==A['registrationSHA256']
assert sha(DATA/'FPS-Arena-Combat-Suite-v2.9.11-C35-Randomized-Action-Pilot.zip')==REG['parentC35ArchiveSHA256']
for f,h in REG['sourceFilesSHA256'].items():assert sha(ROOT/f)==h,('registered source drift',f)
assert sha(ROOT/'page-agent.js')=='6a0381159e7c726a4ce8c0122618f1e1f299c43c5734d1d07b02ae4bb56d73ed'
assert V['matches']==108 and V['offers']==1072 and V['complete']==1061 and V['hitPositive']==12
assert V['interruptions']==320 and V['micro']==729
assert all(V[x]==0 for x in ('assignmentMismatch','overlap','missingInterruptReason','missingAudit','safetyViolations','publicServerLeak','sampleTimeErrors'))
assert A['gates']['minimumCompleteOffersMet'] and not A['gates']['interruptAt80msBelow5Percent']
assert not A['gates']['productionPromotion'] and not A['gates']['sufficientPositiveEventsForNeuralTraining']
ai=(DATA/'fps-c35b-all-ai-tests.log').read_text();engine=(DATA/'fps-c35b-game-tests.log').read_text()
assert re.search(r'^# tests 1024$',ai,re.M) and re.search(r'^# pass 1024$',ai,re.M) and re.search(r'^# fail 0$',ai,re.M)
assert '733 passed, 0 failed' in engine
five=json.loads((DATA/'fps-c35b-five-modes.json').read_text());assert five['aggregate']['rounds']==5 and five['aggregate']['agentErrors']==0
assert (DATA/'fps-c35b-replay-00-80.dataset.json').read_bytes()==(P/'match-00-80.dataset.json').read_bytes()
old_a=json.loads((ROOT/'reports/c35/pilot-90/match-000.result.json').read_text());old_b=json.loads((DATA/'fps-c35b-legacy-replay.result.json').read_text())
old_a.pop('created',None);old_b.pop('created',None);assert old_a==old_b
assert (ROOT/'reports/c35/pilot-90/match-000.dataset.json').read_bytes()==(DATA/'fps-c35b-legacy-replay.dataset.json').read_bytes()
new_a=json.loads((P/'match-00-80.result.json').read_text());new_b=json.loads((DATA/'fps-c35b-replay-00-80.result.json').read_text());new_a.pop('created',None);new_b.pop('created',None);assert new_a==new_b
report=DATA/'FPS-Arena-v2.9.11-C35B-Engineering-Report.md';report.write_bytes((ROOT/'C35B-ENGINEERING-REPORT.md').read_bytes())
validation={'schema':'fpsarena-c35b-release-validation-v1','stage':'research-only engineering pilot, NO combat efficacy claim',
 'registrationSHA256':REG['registrationSHA256'],'parentC35SourceSHA256':REG['parentC35ArchiveSHA256'],
 'study':{'matches':108,'setups':36,'actualSimulatedMinutes':A['pooled']['actualGameMinutes'],
  'offers':V['offers'],'complete':V['complete'],'hitPositive':V['hitPositive'],'micro':V['micro'],
  'interruptedMicro':V['interruptions'],'durationVariantsMs':[80,120,160],
  'byDose':{d:{'offers':v['offers'],'micro':v['microAssigned'],'interruptRate':v['microInterruptionRate'],
    'interruption95':v['microInterruptionRateMatchSetupBootstrap95'],
    'relativeTicks':v['relativeMicroDoseTicks']} for d,v in A['byDose'].items()},
  'interruptionReasons':A['pooled']['interruptionReasons'],
  'interruptRateDifference160To80':A['pairedEngineering']['rateDrop160To80']},
 'tests':{'aiNode':'1024/1024','engine':'733/733','fiveModeSmoke':'5/5',
  'C35ALegacyExactReplay':True,'C35BExactReplay':True,'independent108MatchAudit':True},
 'integrity':{'lockedSourcesMatch':True,'randomAssignmentMismatch':0,'safetyViolations':0,'publicLeak':0,
  'productionAgentUnchanged':True,'productionAgentSHA256':sha(ROOT/'page-agent.js')},
 'gates':{'technicalPipeline':'PASS','dataAdequacy':'FAIL','interruptionUnder5Percent':'FAIL',
  'causalCombatEfficacy':'NOT ESTIMATED','C36NeuralTraining':'BLOCKED','productionPromotion':'NO','githubPush':'NO'}}
vpath=DATA/'FPS-Arena-v2.9.11-C35B-Validation.json';vpath.write_text(json.dumps(validation,indent=2,ensure_ascii=False)+'\n')
raw=DATA/'FPS-Arena-v2.9.11-C35B-Raw-Evaluation.zip';src=DATA/'FPS-Arena-Combat-Suite-v2.9.11-C35B-Micro-Action-Reliability.zip'
rawfiles=sorted(x for x in P.rglob('*') if x.is_file())
exclude={'__pycache__','node_modules','.git','.pytest_cache'}
sourcefiles=sorted(x for x in ROOT.rglob('*') if x.is_file() and not any(part in exclude for part in x.relative_to(ROOT).parts) and x.suffix not in ('.zip','.pyc') and not x.name.startswith('.DS_Store'))
for target,files in ((raw,rawfiles),(src,sourcefiles)):
 print('WRITING',target.name,'files=',len(files),flush=True)
 with zipfile.ZipFile(target,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=6,allowZip64=True) as z:
  for file in files:z.write(file,file.relative_to(ROOT).as_posix())
 with zipfile.ZipFile(target,'r') as z:
  assert z.testzip() is None,'ZIP CRC FAILURE'
  print('ZIP OK',len(z.namelist()),'SIZE',target.stat().st_size,flush=True)
manifest={'schema':'fpsarena-c35b-sha256-manifest-v1','productionSHA256':sha(ROOT/'page-agent.js'),
 'files':{f.name:{'bytes':f.stat().st_size,'sha256':sha(f)} for f in (src,raw,report,vpath)},
 'registrationSHA256':REG['registrationSHA256'],'zipCRC':'PASS'}
mfile=DATA/'FPS-Arena-v2.9.11-C35B-Manifest.json';mfile.write_text(json.dumps(manifest,indent=2,ensure_ascii=False)+'\n')
print(json.dumps(manifest,indent=2,ensure_ascii=False),flush=True)
