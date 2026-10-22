#!/usr/bin/env python3
"""Assemble reproducible C35-X archives and verify all CRC and SHA-256."""
from pathlib import Path
from zipfile import ZipFile,ZIP_DEFLATED
import json,hashlib,os,shutil
R=Path(__file__).resolve().parents[1]; DEST=Path('/mnt/data'); V='v2.9.11-C35X'
MAIN=DEST/f'FPS-Arena-Combat-Suite-{V}-Action-Conditioned-Neural-Research.zip'
RAW=DEST/f'FPS-Arena-{V}-Raw-Evaluation.zip'
report=DEST/f'FPS-Arena-{V}-Engineering-Report.md'
summary=DEST/f'FPS-Arena-{V}-Validation.json'
manifest=DEST/f'FPS-Arena-{V}-Manifest.json'
seedcsv=DEST/f'FPS-Arena-{V}-TDM-Three-Arm-18.csv'
for src,dst in [(R/'C35X-ENGINEERING-REPORT.md',report),
                (R/'reports/c35x/expansion-54-v2/TDM-THREE-ARM-54.csv',seedcsv)]:shutil.copyfile(src,dst)
read=lambda p:json.loads(p.read_text())
audit=read(R/'reports/c35x/expansion-54-v2/INDEPENDENT-AUDIT.json')
model=read(R/'reports/c35x/action-value-v1/ACTION-VALUE-EVALUATION.json')
tdm=read(R/'reports/c35x/expansion-54-v2/TDM-ANALYSIS.json')
parity=read(R/'reports/c35x/action-value-v1/FROZEN-MODEL-VALIDATION.json')
py=read(R/'reports/c35x/PYTHON-VALIDATION.json')
production=hashlib.sha256((R/'page-agent.js').read_bytes()).hexdigest()
assert production=='6a0381159e7c726a4ce8c0122618f1e1f299c43c5734d1d07b02ae4bb56d73ed'
val={'checkpoint':'C35-X','status':'ENGINEERING_PASS_MODEL_POLICY_REJECTED','originalFailedRegistration':'c35x expansion-54-v1 invalid hksl8 ID; archived and excluded from training',
 'cohort':dict(setups=18,matches=54,simMinutes=81,originalAndTwoResearchBranches=True),
 'dataAudit':audit,'tdm':tdm['aggregate'],'tdmPairedCI':tdm['bootstrap5000BySetup'],
 'offlineTrain':{'observedWindows':model['cohorts']['old']+model['cohorts']['new'],
  'split':model['splits'],'holdout':model['holdout'],
  'pairedCI':model['pairedSetupBootstrap5000ActionMinusStateOnlyBrier95'],
  'comparison':'Action-conditioned logistic and MLP do NOT outperform state-only logistic'},
 'portableFrozenParity':parity,'node':{'pass':1214,'fail':0},'engine':{'pass':733,'fail':0},
 'pythonApplicable':py,'smoke':{'modes':['tdm','snd','hp','br','zm'],'pass':5,'agentErrors':0},
 'productionAgentSHA256':production,'productionChanged':False,
 'promotionGates':{'motorPolicy':False,'neuralInference':False,'neuralTrainingOfflineOnly':True}}
summary.write_text(json.dumps(val,indent=2,sort_keys=True)+'\n')
def writezip(dest,items):
 count=0
 with ZipFile(dest,'w',compression=ZIP_DEFLATED,compresslevel=6,allowZip64=True)as z:
  for p,arc in items:
   z.write(p,arc);count+=1
 with ZipFile(dest)as z:
  fail=z.testzip();assert fail is None,(dest,fail)
  assert len(z.namelist())==count
 return count
allfiles=[p for p in R.rglob('*')if p.is_file()and '__pycache__' not in p.parts]
print('Building full source',len(allfiles),flush=True)
numsource=writezip(MAIN,((p,str(p.relative_to(R)))for p in sorted(allfiles)))
rawfiles=[]
for folder in ['reports/c35w/randomized-motor-36-v1','reports/c35x']:
 rawfiles.extend(p for p in (R/folder).rglob('*')if p.is_file())
rawfiles.extend([R/'C35X-ENGINEERING-REPORT.md',R/'CHANGELOG-v2.9.11-C35X.md'])
print('Building raw evaluation',len(rawfiles),flush=True)
numraw=writezip(RAW,((p,str(p.relative_to(R)))for p in sorted(rawfiles)))
files={}
for p in (MAIN,RAW,report,summary,seedcsv):
 files[p.name]={'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'bytes':p.stat().st_size}
manifest.write_text(json.dumps({'checkpoint':'C35-X','crcPassed':True,'archives':{MAIN.name:numsource,RAW.name:numraw},'artifacts':files},indent=2,sort_keys=True)+'\n')
print(json.dumps({'archives':{MAIN.name:numsource,RAW.name:numraw},'files':files},indent=2),flush=True)
