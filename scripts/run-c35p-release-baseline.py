#!/usr/bin/env python3
"""Supplemental matched v2.9.11 Release/no-C35 baseline for C35-P prospective 12-case cohort."""
import concurrent.futures,os,subprocess,time,json,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'scripts'))
from c35o_freshness_analysis import sha,dump,load
SOURCE=ROOT/'reports/c35p/new-seed-holdout-12';OUT=ROOT/'reports/c35p/release-paired-12'
def design():
 cases=load(SOURCE/'FROZEN-DESIGN.json')['cases']
 return {'schema':'fpsarena-c35p-original-vs-shadow-paired-v1','status':'FROZEN BEFORE EXECUTION',
 'sourceProspectiveDesignSHA256':sha(SOURCE/'FROZEN-DESIGN.json'),
 'sourceSHA256':{x:sha(ROOT/x) for x in ('page-agent.js','lab/arena/train-main.mjs','lab/arena/source-main/server/game.js')},
 'baseline':'original --profile release with no c35c research actuator or C35P observer',
 'comparison':'C35P prospective matches run release+shadow80 (same page-agent.js); no policy promotion',
 'cases':cases}
def run(c):
 p=OUT/'matches'/f'{c["id"]}.release.json';p.parent.mkdir(parents=True,exist_ok=True)
 if not p.exists():
  args=['node','lab/arena/train-main.mjs','--profile','release','--modes','tdm','--classic-maps',c['map'],
  '--seconds',str(c['seconds']),'--seed',str(c['seed']),'--bots',str(c['bots']),'--opponents',c['opponents'],
  '--lag-ms',str(c['lagMs']),'--trainee-primary',c['gun'],'--out',str(p)]
  env=dict(os.environ,TERM='xterm');r=subprocess.run(args,cwd=ROOT,capture_output=True,text=True,timeout=300,env=env)
  (p.parent/(p.stem+'.log')).write_text(r.stdout+'\n'+r.stderr)
  if r.returncode:raise RuntimeError((c['id'],r.stderr[-2500:]))
 a=load(p)
 assert a['aggregate']['agentErrors']==0 and a['snapshotLagMs']==c['lagMs']
 assert a['aggregate']['rounds']==1
 return {'case':c['id'],'sha256':sha(p),'shots':a['aggregate']['shots'],'kills':a['aggregate']['kills']}
def main():
 OUT.mkdir(parents=True,exist_ok=True);f=OUT/'FROZEN-DESIGN.json';d=design()
 if f.exists():
  if load(f)!=d:raise RuntimeError('source mismatch against frozen Release baseline plan')
 else:dump(f,d)
 print('BASELINE REGISTRATION',sha(f),flush=True);t0=time.time();result=[]
 with concurrent.futures.ThreadPoolExecutor(max_workers=int(os.environ.get('C35P_WORKERS','4'))) as p:
  for a in concurrent.futures.as_completed([p.submit(run,c) for c in d['cases']]):
   v=a.result();result.append(v);print(f'{len(result)}/12 {v["case"]}',flush=True)
 dump(OUT/'EXECUTION-AUDIT.json',{'registrationSHA256':sha(f),'secondsElapsed':time.time()-t0,'matches':sorted(result,key=lambda x:x['case'])})
 print('COMPLETE 12 release baseline matches',flush=True)
if __name__=='__main__':main()
