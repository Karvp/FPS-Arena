#!/usr/bin/env python3
"""C27: research-only validation-frozen threat calibration across opponent domains.
Run `freeze` BEFORE generating/viewing a C27 holdout, then run `evaluate`.
Features only contain already-delivered public cue/status; labels strictly future.
"""
import argparse, collections, copy, hashlib, json, math, pathlib, random, statistics
import numpy as np
import torch
from torch import nn

ROOT=pathlib.Path(__file__).resolve().parents[1]
MAPS=('arena','foundry','neon'); GUNS=('mp5sd','hk_sl8','m4a1','aa12')
STRATA=(('arena','mp5sd'),('arena','hk_sl8'),('foundry','m4a1'),('foundry','aa12'),('neon','m4a1'),('neon','mp5sd'))
OPPONENTS=('stress','mixed','official'); LAGS=(35,125)
HORIZON=1.8; FIRST=3.0; STEPS=3; D=5; HIDDEN=8
SCHEMA='fpsarena-c27-temporal-gru-v1'
torch.set_num_threads(1)
torch.use_deterministic_algorithms(True)

def load(p): return json.loads(pathlib.Path(p).read_text(encoding='utf-8'))
def dump(p,o):
 p=pathlib.Path(p);p.parent.mkdir(parents=True,exist_ok=True)
 p.write_text(json.dumps(o,indent=2,ensure_ascii=False,allow_nan=False)+'\n',encoding='utf-8')
def digest(b): return hashlib.sha256(b).hexdigest()
def filehash(p): return digest(pathlib.Path(p).read_bytes())
def canonical_hash(o): return digest(json.dumps(o,ensure_ascii=False,separators=(',',':'),allow_nan=False).encode('utf-8'))
def require(b,m):
 if not b: raise ValueError('C27 '+m)

def cue5(w):
 c=w['publicCueBeforeWindow'];s=w['publicStatus']
 require(set(c)=={'receivedShotCount','receivedNearTracerCount','nearestReceivedTracerMeters','lookbackSeconds','cueDefinition'},'public cue leakage / malformed')
 require(set(s)=={'alive','healthFraction','armorFraction'},'public status leakage / malformed')
 require(c['cueDefinition']=='delivered public shot packets only; may include friendlies; no future server labels' and c['lookbackSeconds']==1.5,'not delivered cue')
 require(s['alive'] is True,'window not at risk')
 for n in ('receivedShotCount','receivedNearTracerCount'):
  require(isinstance(c[n],int) and c[n]>=0,'invalid count')
 require(c['receivedNearTracerCount']<=c['receivedShotCount'],'near count exceeds shot')
 for n in ('healthFraction','armorFraction'):
  require(isinstance(s[n],(int,float)) and math.isfinite(s[n]) and 0<=s[n]<=1,'status range')
 dis=c['nearestReceivedTracerMeters']
 require(dis is None or isinstance(dis,(int,float)) and math.isfinite(dis) and dis>=0,'tracer distance range')
 return [min(1,math.log1p(c['receivedShotCount'])/math.log(31)),
         min(1,math.log1p(c['receivedNearTracerCount'])/math.log(11)),
         1 if dis is None else min(1,dis/65),float(s['healthFraction']),float(s['armorFraction'])]

def encode_window(m,i):
 """Only present and immediately preceding 2 *complete, consecutive* public snapshots.
 Dropping an older snapshot (because censored/missing) also drops snapshots before it.
 Labels are deliberately not accessed here, even historical labels.
 """
 w=m['windows'][i];require(w['complete'] is True,'censored current window')
 seq=[[0.0]*5 for _ in range(3)];mask=[0.,0.,0.]
 seq[2]=cue5(w);mask[2]=1.
 last=w
 for lag in (1,2):
  old=m['windows'][i-lag] if i>=lag else None
  if old is None or old['complete'] is not True or not math.isclose(last['start']-old['start'],HORIZON,rel_tol=0,abs_tol=1e-4):break
  seq[2-lag]=cue5(old);mask[2-lag]=1.;last=old
 meta=m['metadata'];mapname=meta['map'];gun=meta['loadout']
 require(mapname in MAPS and gun in GUNS,'unknown map or weapon')
 categorical=[float(mapname==k) for k in MAPS]+[float(gun==k) for k in GUNS]
 # Fixed chronological sequence oldest->newest; zero-pad missing snapshots.
 x_static=seq[2];x_temporal=seq[2]+seq[1]+seq[0]+mask[1:2]+mask[:1]+categorical
 require(len(x_temporal)==24,'temporal size')
 return {'sequence':seq,'mask':mask,'context':categorical,'static':x_static,'temporal':x_temporal}

def validate_match(m,expected=None):
 require(set(m)=={'schema','horizonSeconds','firstWindowSeconds','schedule','dataLeakagePolicy','windows','events','metadata'},'match schema mismatch')
 meta=m['metadata']
 require(m['schema']=='fpsarena-c25-fixed-grid-match-v1' and m['horizonSeconds']==1.8 and m['firstWindowSeconds']==3 and 'BEFORE' in m['dataLeakagePolicy'],'observer schema/timestamp')
 require(meta['mode']=='tdm' and meta['profile']=='release' and meta['producer']=='headless-simulator' and meta['observerOnly'] is True and meta['productionActuation'] is False,'not observational release')
 if expected:
  require(meta['seed']==expected['seed'] and meta['map']==expected['map'] and meta['loadout']==expected['weapon'] and meta['snapshotLagMs']==expected['lagMs'] and meta['seconds']==expected['seconds'],'job mismatch')
 fields={'hostileShotEvents','hostileNearTracerEvents','hostileWeaponHitEvents','hostileWeaponDamage'}
 total=collections.Counter();positives=0;complete=0;prev=-1e9
 for i,w in enumerate(m['windows']):
  require(set(w)=={'start','end','complete','atRisk','publicCueBeforeWindow','publicStatus','label'},'window shape/leakage')
  require(w['atRisk'] is True and isinstance(w['complete'],bool),'at-risk invalid')
  require(w['start']>=3-1e-5 and w['start']>=prev+1.8-1e-4 and abs(w['end']-w['start']-1.8)<1e-4,'nonoverlap / horizon')
  require(abs((w['start']-3)/1.8-round((w['start']-3)/1.8))<2e-4,'off-grid start')
  prev=w['start'];cue5(w)
  label=w['label'];require(set(label)==fields,'server label shape')
  for k,v in label.items():
   require(isinstance(v,(int,float)) and math.isfinite(v) and v>=0,'server label numeric')
   if k!='hostileWeaponDamage':require(isinstance(v,int),'label not integer')
   total[k]+=v
  require(label['hostileNearTracerEvents']<=label['hostileShotEvents'],'near > all')
  require((label['hostileWeaponHitEvents']==0)==(label['hostileWeaponDamage']==0),'hit/damage consistency')
  if w['complete']:
   require(w['end']<=meta['seconds']+1e-3,'complete past end');complete+=1;positives+=int(label['hostileWeaponHitEvents']>0)
   encode_window(m,i)
  else:
   require(w['end']>=meta['seconds']-1e-3,'censor not at game end')
 for k in fields:require(total[k]<=m['events'][k]+1e-3,'summary < window totals')
 return complete,positives

def dataset_rows(dataset,job_lookup=None):
 rows=[];counts=collections.Counter();seeds=set()
 require(dataset['schema']=='fpsarena-c25-fixed-grid-dataset-v1','dataset envelope')
 for m in dataset['matches']:
  z=m['metadata'];key=(z['map'],z['loadout'],z['seed'])
  require(key not in seeds,'duplicate match/seed');seeds.add(key)
  j=job_lookup.get(key) if job_lookup is not None else None
  if job_lookup is not None:require(j is not None,'unregistered match')
  count,pos=validate_match(m,j);counts['windows']+=count;counts['positives']+=pos;counts['matches']+=1
  for i,w in enumerate(m['windows']):
   if not w['complete']:continue
   x=encode_window(m,i)
   rows.append({**x,'y':int(w['label']['hostileWeaponHitEvents']>0),'matchId':str(z['seed']), 'meta':z})
 return rows,dict(counts)

def tensor_rows(rows):
 return (torch.tensor([r['sequence'] for r in rows],dtype=torch.float32),
  torch.tensor([r['mask'] for r in rows],dtype=torch.float32),
  torch.tensor([r['context'] for r in rows],dtype=torch.float32),
  torch.tensor([r['static'] for r in rows],dtype=torch.float32),
  torch.tensor([r['temporal'] for r in rows],dtype=torch.float32),
  torch.tensor([r['y'] for r in rows],dtype=torch.float32).reshape(-1,1))

class Predictor(nn.Module):
 def __init__(self,kind):
  super().__init__();self.kind=kind
  if kind=='static-logistic':self.head=nn.Linear(5,1)
  elif kind=='temporal-logistic':self.head=nn.Linear(24,1)
  elif kind=='gru':
   self.gru=nn.GRU(input_size=5,hidden_size=HIDDEN,batch_first=True)
   self.head=nn.Linear(HIDDEN+7+2,1)
  else:raise ValueError(kind)
 def forward(self,batch):
  seq,mask,context,sta,temp,_=batch
  if self.kind=='static-logistic':return self.head(sta)
  if self.kind=='temporal-logistic':return self.head(temp)
  # Time ordering oldest->newest and zeroed missing values;
  # make padding explicit in output context; no label in forward inputs.
  _,hidden=self.gru(seq)
  return self.head(torch.cat([hidden[-1],context,mask[:,0:2]],dim=1))

def torch_seed(seed=27027027):
 torch.manual_seed(seed);random.seed(seed);np.random.seed(seed%2**32)

def model_state(model):
 return {k:v.detach().cpu().numpy().tolist() for k,v in sorted(model.state_dict().items())}

def reconstruct(model_desc):
 m=Predictor(model_desc['kind']);state={k:torch.tensor(v,dtype=torch.float32) for k,v in model_desc['state'].items()}
 m.load_state_dict(state,strict=True);m.eval();return m

def metric(rows,preds):
 require(len(rows)==len(preds) and len(rows)>0,'metric empty')
 y=np.array([r['y'] for r in rows],dtype=np.float64);p=np.array(preds,dtype=np.float64)
 p=np.clip(p,1e-8,1-1e-8)
 return {'windows':len(y),'positive':int(y.sum()),'brier':round(float(np.mean((y-p)**2)),7),
         'logLoss':round(float(np.mean(-y*np.log(p)-(1-y)*np.log(1-p))),7)}

def prediction(desc,rows):
 if desc['kind']=='constant':return [desc['probability']]*len(rows)
 m=reconstruct(desc)
 with torch.no_grad():return torch.sigmoid(m(tensor_rows(rows))).squeeze(1).cpu().numpy().tolist()

def train_one(kind,train,val,lr,weight_decay,epochs):
 torch_seed(27027027)
 m=Predictor(kind);mean=(sum(r['y'] for r in train)+.5)/(len(train)+1)
 with torch.no_grad():m.head.bias.fill_(math.log(mean/(1-mean)))
 optimizer=torch.optim.Adam(m.parameters(),lr=lr,weight_decay=weight_decay)
 btrain=tensor_rows(train);bval=tensor_rows(val)
 best_loss=1e9;best=None;best_step=0
 for epoch in range(1,epochs+1):
  m.train();optimizer.zero_grad();loss=nn.functional.binary_cross_entropy_with_logits(m(btrain),btrain[-1]);loss.backward()
  torch.nn.utils.clip_grad_norm_(m.parameters(),1.0);optimizer.step()
  if epoch%5==0 or epoch==1:
   m.eval()
   with torch.no_grad():vl=float(nn.functional.binary_cross_entropy_with_logits(m(bval),bval[-1]))
   if vl<best_loss-1e-8:best_loss=vl;best=model_state(m);best_step=epoch
 require(best is not None,'no trained checkpoint')
 return {'kind':kind,'state':best,'config':{'lr':lr,'weightDecay':weight_decay,'maxEpochs':epochs,'selectedEpochByValidation':best_step,'hidden':HIDDEN if kind=='gru' else None}}

def frozen_models(args):
 dev=load(args.development);plan=load(args.development_plan)
 require(plan['schema']=='fpsarena-c25-threat-calibration-plan-v1' and plan['opponents']=='stress','invalid development source')
 devjobs={(j['map'],j['weapon'],j['seed']):j for j in plan['jobs']}
 rows,stats=dataset_rows(dev,{k:{**v,'lagMs':65,'seconds':plan['seconds']} for k,v in devjobs.items()})
 require(len(devjobs)==24 and stats['matches']==24,'development mismatch')
 split={str(j['seed']):j['split'] for j in plan['jobs']}
 train=[r for r in rows if split[r['matchId']]=='train'];val=[r for r in rows if split[r['matchId']]=='validation']
 require(len({r['matchId'] for r in train})==12 and len({r['matchId'] for r in val})==6,'development split')
 baseline={'kind':'constant','probability':(sum(r['y'] for r in train)+.5)/(len(train)+1)}
 candidates=[baseline];settings=(('static-logistic',0.025,0.01,180),('temporal-logistic',0.018,0.01,180),('gru',0.012,0.025,220))
 for kind,lr,wd,steps in settings:candidates.append(train_one(kind,train,val,lr,wd,steps))
 scored=[]
 for d in candidates:
  scored.append({'kind':d['kind'],'validation':metric(val,prediction(d,val)),'train':metric(train,prediction(d,train))})
 selected=min(range(len(candidates)),key=lambda i:(scored[i]['validation']['logLoss'],i))
 out={'schema':SCHEMA,'task':'freeze','developmentPlanSHA256':plan['registrationSHA256'],
      'developmentDataSHA256':filehash(args.development),'developmentPlanFileSHA256':filehash(args.development_plan),
      'endpoint':'future hostile weapon hit in next 1.8 seconds under unchanged Release Autopilot',
      'selectionRule':'minimum validation log loss; tie break constant then static logistic then temporal logistic then GRU; no C25 test/C26/C27 holdout',
      'trainMatches':12,'validationMatches':6,'previousC25TestExcluded':6,
      'trainWindows':len(train),'validationWindows':len(val),
      'candidates':candidates,'validationScores':scored,'selectedIndex':selected,'selectedKind':candidates[selected]['kind'],
      'torchVersion':torch.__version__,'seed':27027027,'actionPolicy':'UNCHANGED research-only observational predictor'}
 path=pathlib.Path(args.output)
 if path.exists():
  old=load(path)
  require(old==out,'frozen candidates changed; refuse overwrite')
 else:dump(path,out)
 print('C27 freeze:',json.dumps({'selected':out['selectedKind'],'train':len(train),'validation':len(val),'rank':[(s['kind'],s['validation']['logLoss']) for s in scored]}))

def validate_study(data,plan,frozen,dev,devplan):
 require(plan['schema']=='fpsarena-c27-domain-shift-plan-v1' and plan['version']==1,'plan schema')
 unsigned={k:v for k,v in plan.items() if k!='registrationSHA256'}
 require(canonical_hash(unsigned)==plan['registrationSHA256'],'plan registration hash tampered')
 require(plan['frozenArtifactSHA256']==filehash(plan['frozenArtifactPath']),'frozen model file changed')
 require(frozen['developmentDataSHA256']==filehash(plan['developmentDataPath']) and frozen['developmentPlanSHA256']==devplan['registrationSHA256'],'development hash')
 require(plan['developmentDataSHA256']==frozen['developmentDataSHA256'] and plan['profile']=='release' and plan['seconds']>=25 and plan['seconds']<=180 and plan['bots']==5,'plan envelope')
 require(plan['opponents']==list(OPPONENTS) and plan['lagsMs']==list(LAGS),'opponent / lag plan')
 require(len(plan['jobs'])==len(STRATA)*len(OPPONENTS)*len(LAGS),'missing conditions')
 jobs={};allseeds={m['metadata']['seed'] for m in dev['matches']}
 # C26 evaluated seeds also excluded via plan's preregistered digest supplied by runner.
 prior=load(plan['previousC26DataPath'])
 allseeds.update(m['metadata']['seed'] for m in prior['matches'])
 for j in plan['jobs']:
  key=(j['map'],j['weapon'],j['seed']);condition=(j['map'],j['weapon'],j['opponents'],j['lagMs'])
  require(j['seed'] not in allseeds and key not in jobs and isinstance(j['seed'],int),'duplicate/overlapping seed')
  require((j['map'],j['weapon']) in STRATA and j['opponents'] in OPPONENTS and j['lagMs'] in LAGS,'invalid condition')
  allseeds.add(j['seed']);jobs[key]={**j,'seconds':plan['seconds']}
 require({(j['map'],j['weapon'],j['opponents'],j['lagMs']) for j in plan['jobs']}=={
  (m,g,o,l) for (m,g) in STRATA for o in OPPONENTS for l in LAGS},'factorial incomplete')
 rows,stats=dataset_rows(data,jobs)
 require(stats['matches']==len(plan['jobs']),'missing matches')
 return rows,stats

def cluster_ci(rows,base_pred,sel_pred,iterations=1500):
 rng=random.Random(27027027);by=collections.defaultdict(list)
 for i,r in enumerate(rows):by[r['matchId']].append(i)
 ids=list(by);diff=[];y=np.array([r['y'] for r in rows]);b=np.array(base_pred);s=np.array(sel_pred)
 for _ in range(iterations):
  ix=[j for i in (rng.choice(ids) for _ in ids) for j in by[i]]
  diff.append(float(np.mean((y[ix]-b[ix])**2-(y[ix]-s[ix])**2)))
 diff.sort();return {'unit':'whole match','resamples':iterations,'baselineMinusSelectedBrier95':[round(diff[int(.025*iterations)],7),round(diff[int(.975*iterations)-1],7)]}

def evaluation(args):
 dev=load(args.development);devplan=load(args.development_plan);data=load(args.holdout);plan=load(args.holdout_plan);frozen=load(args.frozen)
 rows,stats=validate_study(data,plan,frozen,dev,devplan)
 preds={d['kind']:prediction(d,rows) for d in frozen['candidates']}
 selected=frozen['selectedKind'];base='constant';scores={k:metric(rows,p) for k,p in preds.items()}
 by=[]
 for opponent in OPPONENTS:
  for lag in LAGS:
   ix=[i for i,r in enumerate(rows) if r['meta']['opponentsC27']==opponent and r['meta']['snapshotLagMs']==lag] if False else None
   # Opponent class is a registered job factor, not a value in the C25 observation schema.
   seed_group={str(j['seed']) for j in plan['jobs'] if j['opponents']==opponent and j['lagMs']==lag}
   ix=[i for i,r in enumerate(rows) if r['matchId'] in seed_group]
   sub=[rows[i] for i in ix]
   by.append({'opponents':opponent,'lagMs':lag,'baseline':metric(sub,[preds[base][i] for i in ix]),'selected':metric(sub,[preds[selected][i] for i in ix])})
 out={'schema':'fpsarena-c27-domain-shift-evaluation-v1','registeredPlanSHA256':plan['registrationSHA256'],
      'frozenModelSHA256':filehash(args.frozen),'selectedByDevelopmentValidation':selected,
      'newSeedHoldout':stats,'candidateScoresDiagnostic':scores,'byOpponentAndLag':by,
      'clusterBootstrap':cluster_ci(rows,preds[base],preds[selected]),
      'decision':'DO NOT DEPLOY - no evidence of action-conditioned value improvement; calibration must beat baselines in independent domains',
      'limitations':['All windows are correlated within whole matches','Opponent styles are simulated; no human or real browser data',
      'GRU uses only three public snapshots and no hidden server trajectories','C25 test and C26 holdout were never used for fitting or selecting C27 candidates',
      'Model selection is frozen BEFORE C27 cohort labels; nonselected model test scores are descriptive only'],
      'modelArtifacts':{'freezeSHA256':filehash(args.frozen),'architecture':'GRU(5 input, 8 hidden, 3 causal steps) with 7 categorical and 2 history-presence inputs'}}
 path=pathlib.Path(args.output)
 if path.exists():require(load(path)==out,'analysis changed on rerun')
 else:dump(path,out)
 print('C27 holdout:',json.dumps({'windows':stats['windows'],'positive':stats['positives'],'chosen':selected,'baseline':scores[base]['brier'],'selectedBrier':scores[selected]['brier']}))

def main():
 a=argparse.ArgumentParser();a.add_argument('command',choices=['freeze','evaluate'])
 a.add_argument('--development',default=str(ROOT/'reports/c25/study24/COMBINED-DATASET.json'))
 a.add_argument('--development-plan',default=str(ROOT/'reports/c25/study24/PRE-REGISTERED-PLAN.json'))
 a.add_argument('--frozen',default=str(ROOT/'reports/c27/study36/FROZEN-MODELS.json'))
 a.add_argument('--holdout',default=str(ROOT/'reports/c27/study36/COMBINED-DATASET.json'))
 a.add_argument('--holdout-plan',default=str(ROOT/'reports/c27/study36/PRE-REGISTERED-PLAN.json'))
 a.add_argument('--output',default=None)
 args=a.parse_args();args.output=args.output or (str(ROOT/'reports/c27/study36/FROZEN-MODELS.json') if args.command=='freeze' else str(ROOT/'reports/c27/study36/EVALUATION.json'))
 if args.command=='freeze':frozen_models(args)
 else:evaluation(args)
if __name__=='__main__':main()
