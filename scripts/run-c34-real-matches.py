#!/usr/bin/env python3
"""C34 preregistered passive full-Game.step cohort. Does not learn/select from holdout."""
import argparse,concurrent.futures,hashlib,json,os,pathlib,subprocess,sys,tempfile,time
ROOT=pathlib.Path(__file__).resolve().parent.parent
WEAPONS=['mp5sd','m4a1','aa12','hk_sl8','uzi','l115a3']
MAPS=['arena','foundry','neon']
LOCKED=['lab/arena/real-encounter-observer-c34.mjs','lab/arena/train-main.mjs','lab/arena/source-main/server/game.js','lab/arena/source-main/server/bot.js','page-agent.js']
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def config():
    cases=[]
    for m,mp in enumerate(MAPS):
      for w,weapon in enumerate(WEAPONS):
        for r in range(3):
          idx=(m*len(WEAPONS)+w)*3+r
          cases.append(dict(id=f'{idx:03d}',seed=34340001+idx*43,map=mp,weapon=weapon,
            lagMs=[35,65,125][(idx+m)%3],opponents=['official','mixed','stress'][r],seconds=90,
            split='train' if r==0 else ('validation' if (m+w)%2==0 else 'test') if r==1 else ('test' if (m+w)%2==0 else 'validation')))
    assert len(cases)==54 and len({c['seed'] for c in cases})==54
    return {'schema':'fpsarena-c34-preregistered-passive-observation-plan-v1',
      'note':'54 independent match seeds, 90 seconds each, 3 maps x 6 enemy weapons x 3 opponent regimes; server-authoritative retrospective audit; NO counterfactual claims',
      'cases':cases,'fileSHA256':{x:sha(ROOT/x) for x in LOCKED},
      'primaryLabels':'server hostile weapon hit in fixed 1.8s observation window',
      'promotionGate':{'minimumTrainPositiveWindows':40,'minimumValidationPositiveWindows':10,'minimumTestPositiveWindows':10,
        'minimumTotalCompleteWindows':1500,'requireModelValidationBrierBetterThanFrequency':True,'requireModelTestBrierBetterThanFrequency':True},
      'holdoutIntegrity':'train and validation cannot read test labels when selecting any model'}
def atomic(path,data):
    path.parent.mkdir(parents=True,exist_ok=True)
    with tempfile.NamedTemporaryFile('w',dir=path.parent,delete=False,encoding='utf8') as f:
        json.dump(data,f,indent=2,ensure_ascii=False);f.write('\n'); temp=f.name
    os.replace(temp,path)
def main():
    arg=argparse.ArgumentParser();arg.add_argument('--dir',default='reports/c34/real-matches-54');arg.add_argument('--workers',type=int,default=3);arg.add_argument('--resume',action='store_true');opt=arg.parse_args()
    out=ROOT/opt.dir;out.mkdir(parents=True,exist_ok=True);planPath=out/'PRE-REGISTERED-PLAN.json';plan=config()
    if planPath.exists():
      old=json.loads(planPath.read_text())
      if not opt.resume or old!=plan:raise SystemExit('Locked C34 plan exists or fingerprint changed; use --resume ONLY for identical plan')
    else:
      if opt.resume:raise SystemExit('No plan to resume')
      atomic(planPath,plan)
    def validate(c):
      base=out/f"match-{c['id']}"; rp=base.with_suffix('.result.json');dp=base.with_suffix('.dataset.json')
      if not rp.exists() or not dp.exists():return False
      try:
        result=json.loads(rp.read_text()); ds=json.loads(dp.read_text()); w=ds['matches'][0]
        return result['seed']==c['seed'] and result['seconds']==90 and len(ds['matches'])==1 and w['metadata']['seed']==c['seed'] and w['metadata']['map']==c['map'] and ds['controlledEnemyPrimary']==c['weapon'] and result['snapshotLagMs']==c['lagMs'] and result['opponentPolicy']==c['opponents'] and result['aggregate']['rounds']==1
      except (ValueError,IndexError,KeyError,TypeError):return False
    def run(c):
      if validate(c):return c['id'],'cached',0
      base=out/f"match-{c['id']}";rp=base.with_suffix('.result.json');dp=base.with_suffix('.dataset.json');log=base.with_suffix('.log')
      for p in (rp,dp):p.unlink(missing_ok=True)
      cmd=['node','lab/arena/train-main.mjs','--profile','release','--modes','tdm','--classic-maps',c['map'],'--seconds','90','--seed',str(c['seed']), '--bots','5', '--lag-ms',str(c['lagMs']), '--opponents',c['opponents'], '--c34-enemy-primary',c['weapon'],'--c34-dataset',str(dp),'--out',str(rp)]
      with open(log,'w') as f:
        try:p=subprocess.run(cmd,stdout=f,stderr=subprocess.STDOUT,cwd=ROOT,timeout=240)
        except subprocess.TimeoutExpired:return c['id'],'timeout',1
      if p.returncode or not validate(c):return c['id'],'invalid',p.returncode
      return c['id'],'complete',0
    pending=[c for c in plan['cases'] if not validate(c)]
    print('C34 LOCKED PLAN',planPath,'already complete',54-len(pending),'pending',len(pending),flush=True)
    errs=[];done=54-len(pending);start=time.monotonic()
    with concurrent.futures.ThreadPoolExecutor(max_workers=opt.workers) as ex:
      fs=[ex.submit(run,c) for c in pending]
      for f in concurrent.futures.as_completed(fs):
        ident,status,code=f.result();done+=int(status in ('complete','cached'))
        if status not in ('complete','cached'):errs.append((ident,status,code))
        print(f'C34 {done}/54 {ident} {status} elapsed={time.monotonic()-start:.1f}s',flush=True)
    if errs:raise SystemExit(f'Incomplete: {errs}. Run --resume using same plan')
    print('C34 VERIFIED 54/54',flush=True)
if __name__=='__main__':main()
