#!/usr/bin/env python3
"""C35-N: read-only prospective public target and shot-outcome audit.

Strict boundary: public cues from row.publicBeforeStep, server labels only
from row.authoritativeFiringTimeShots; NEVER exported to an actor or model input.
A miss has no target-ID ground truth; all-shot outcome denominators preserved.
"""
import hashlib, json, random, statistics
from collections import defaultdict
from pathlib import Path

def load(p): return json.loads(Path(p).read_text())
def dump(p, o):
    p=Path(p);p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(o,sort_keys=True,indent=2,ensure_ascii=False)+'\n')
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def public_cues(pub):
    if not isinstance(pub,dict) or pub.get('provenance')!='PUBLIC_BEFORE_STEP_ONLY':
        raise ValueError('C35N public-only provenance required')
    forbidden={'serverTick','rewindSeconds','pellets','authoritativeFiringTimeShots','postStepOracle','serverLabelsAfterStep','hitKind','damage','groundTruth'}
    if forbidden.intersection(pub):raise ValueError('C35N server truth leaked into public cues')
    age=pub.get('features',{}).get('snapshotAge') if isinstance(pub.get('features'),dict) else None
    age_bin='unknown' if age is None or age<0 else '<=70ms' if age<=.07 else '<=150ms' if age<=.15 else '>150ms'
    return {'valid':pub.get('valid') is True,'nearestId':pub.get('targetId'),
      'aimId':pub.get('aimCandidateId'), 'candidateDisagree':
        bool(pub.get('aimCandidateDiffers')) if pub.get('valid') else None,
      'nearest3DClear':pub.get('nearest3DClear') if pub.get('geometryValid') else None,
      'nearest2DClear':pub.get('nearest2DClear') if pub.get('geometryValid') else None,
      'ageBin':age_bin,'ageSeconds':age,'coverType':pub.get('coverType')}

def parse_match(case,filename):
    doc=load(filename)
    if doc.get('schema')!='fpsarena-c35l-shot-truth-traces-v1' or len(doc.get('traces',[]))!=1:raise ValueError('invalid C35L trace')
    tr=doc['traces'][0];counts=tr['counts'];rows=[]; shots=pellets=hit_pellets=world=0
    if counts['fireModified'] or counts['storedDropped']:raise ValueError('tampered fire/dropped samples')
    for row in tr['rows']:
        cue=public_cues(row['publicBeforeStep'])
        for shot in row['authoritativeFiringTimeShots']:
            if shot['phase']!='AFTER_SERVER_FIRE_RESOLUTION_ONLY':raise ValueError('unexpected authoritative phase')
            if shot['pelletCount']!=len(shot['pellets']) or not shot['pellets']:raise ValueError('bad pellet count')
            player=[p for p in shot['pellets'] if p['hitKind']=='player']
            kind=[p['hitKind'] for p in shot['pellets']]
            allowed={'player','world','range','zombie','ability-body','streak-entity'}
            if not set(kind)<=allowed:raise ValueError('unknown hit kind')
            static=sum(p['hitKind']=='world' and p.get('worldKind')=='static' for p in shot['pellets'])
            foam=sum(p['hitKind']=='world' and p.get('worldKind')=='dynamic-foam' for p in shot['pellets'])
            if static+foam != kind.count('world'):raise ValueError('unclassified world pellet')
            if not 0<=shot['rewindSeconds']<=.5:raise ValueError('invalid rewind')
            world+=static+foam;shots+=1;pellets+=len(kind);hit_pellets+=len(player)
            rows.append({'setupId':case['setupId'],'map':case['map'],'gun':case['gun'],
             'lagMs':case['lagMs'],'opponents':case['opponents'],'t':shot['t'],
             'shotSeq':shot['seq'],'pellets':len(kind),'playerPellets':len(player),
             'hasPlayerHit':bool(player),'staticWorldPellets':static,'foamWorldPellets':foam,
             'rangePellets':kind.count('range'),'dynamicBoxes':shot['dynamicCoverBoxes'],
             'rewindSeconds':shot['rewindSeconds'],'public':cue,
             'aimHitFraction':sum(str(p['targetId'])==str(cue['aimId']) for p in player)/len(player) if player else None,
             'nearestHitFraction':sum(str(p['targetId'])==str(cue['nearestId']) for p in player)/len(player) if player else None})
    if shots!=counts['confirmedShots'] or shots!=counts['serverShotEvents'] or pellets!=counts['confirmedPellets'] or hit_pellets!=counts['hitPlayerPellets'] or world!=counts['worldPellets']:
        raise ValueError('C35N shot truth invariant mismatch')
    return rows

def ratio(a,b):return a/b if b else None

def describe(rows):
    hit=[x for x in rows if x['hasPlayerHit']]
    foam=sum(x['foamWorldPellets'] for x in rows)
    aim=[x['aimHitFraction'] for x in hit if x['public']['valid'] and x['public']['aimId'] is not None]
    near=[x['nearestHitFraction'] for x in hit if x['public']['valid'] and x['public']['nearestId'] is not None]
    return {'shots':len(rows),'shotsWithHit':len(hit),'shotsWithNoPlayerHit':len(rows)-len(hit),
      'playerHitShotRate':ratio(len(hit),len(rows)),
      'pellets':sum(x['pellets'] for x in rows),'playerHitPellets':sum(x['playerPellets'] for x in rows),
      'staticWorldPellets':sum(x['staticWorldPellets'] for x in rows),'dynamicFoamWorldPellets':foam,
      'shotsWithDynamicCover':sum(x['dynamicBoxes']>0 for x in rows),
      'aimAgreementAmongHitShots':statistics.mean(aim) if aim else None,
      'nearestAgreementAmongHitShots':statistics.mean(near) if near else None,
      'publicCandidateCoverage':ratio(sum(x['public']['valid'] for x in rows),len(rows)),
      'rewindMeanMs':statistics.mean(x['rewindSeconds']*1000 for x in rows) if rows else None}

def cluster_ci(grouped,key,n=1500,seed=350014):
    keys=sorted(grouped);rng=random.Random(seed);samples=[]
    if not keys:return None
    for _ in range(n):
        selected=[keys[rng.randrange(len(keys))] for _ in keys]
        v=describe([x for k in selected for x in grouped[k]]).get(key)
        if v is not None:samples.append(v)
    samples.sort()
    return [samples[int(.025*(len(samples)-1))],samples[int(.975*(len(samples)-1))]] if samples else None

def analyze(root,output='ANALYSIS.json'):
    root=Path(root);plan=load(root/'FROZEN-DESIGN.json')
    matches={};hashes={};allrows=[]
    for case in plan['cases']:
        p=root/'matches'/(case['id']+'.ballistic.json')
        if not p.is_file():raise ValueError(f'missing {p}')
        rows=parse_match(case,p)
        if case['setupId'] in matches:raise ValueError('setup IDs must be unique')
        matches[case['setupId']]=rows;hashes[case['id']]=sha(p);allrows+=rows
    strata={}
    defs={'gun':lambda r:r['gun'],'map':lambda r:r['map'],'lagMs':lambda r:str(r['lagMs']),
          'snapshotAge':lambda r:r['public']['ageBin'],
          'publicNearestLOS':lambda r:'unknown' if r['public']['nearest3DClear'] is None else 'clear' if r['public']['nearest3DClear'] else 'blocked',
          'candidates':lambda r:'unknown' if r['public']['candidateDisagree'] is None else 'differ' if r['public']['candidateDisagree'] else 'agree',
          'dynamicCover':lambda r:'present' if r['dynamicBoxes'] else 'absent'}
    for field,fn in defs.items():
        g=defaultdict(list)
        for x in allrows:g[fn(x)].append(x)
        strata[field]={k:describe(v) for k,v in sorted(g.items())}
    allstats=describe(allrows)
    result={'schema':'fpsarena-c35n-miss-dynamic-cover-latency-audit-v1',
      'status':'MEASUREMENT_ONLY_NO_POLICY_PROMOTION',
      'sourceRule':'Before-step public candidate frozen; authoritative pellet truth appended after Game.step only',
      'missRule':'No-hit shots contribute to hit-outcome denominator, never assigned an invented target identity',
      'dynamicCoverRule':'Zero observed dynamic-foam samples means NOT VALIDATED, not success',
      'setupCount':len(matches),'overall':allstats,'strata':strata,
      'hitShotRateClusterCI95':cluster_ci(matches,'playerHitShotRate'),
      'aimAgreementClusterCI95':cluster_ci(matches,'aimAgreementAmongHitShots'),
      'shotTruthSHA256':hashes}
    dump(root/output,result)
    return result

if __name__=='__main__':
 import sys
 r=analyze(sys.argv[1]);print(json.dumps({'overall':r['overall'],'hitShotRateClusterCI95':r['hitShotRateClusterCI95'],'aimAgreementClusterCI95':r['aimAgreementClusterCI95']},indent=2))
