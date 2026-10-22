"""Strict prospective eligibility-to-randomized-offer linkage checks.

This module audits study provenance; it does not estimate damage avoidance.
"""
from __future__ import annotations
from collections import Counter, defaultdict
import math

POLICIES = ('legacy80', 'hierarchical80')


def audit_prospective_linkage(preoffers: list[dict], offers: list[dict], *, require_policy: bool = True):
    """Validate 1:1 assignment -> eligible attempt joins, never postselect.

    Not every eligible attempt must be randomized: nonoverlapping 1.8s windows
    can make an eligible attempt deferred. Every assigned offer MUST, however,
    correspond to one observed prior eligible attempt from the same run.
    """
    attempts = {}
    for p in preoffers:
        if p['attemptId'] in attempts:
            raise ValueError('duplicate prospective attempt ID')
        if require_policy and p.get('policy') not in POLICIES:
            raise ValueError('preoffer missing sealed policy')
        if not isinstance(p.get('nowMs'), (int, float)) or isinstance(p['nowMs'], bool) or not math.isfinite(p['nowMs']) or p['nowMs'] < 0:
            raise ValueError('invalid prospective timestamp')
        attempts[p['attemptId']] = p
    seen = set()
    for o in offers:
        aid = o.get('attemptId')
        if not isinstance(aid, str) or aid not in attempts:
            raise ValueError('assigned offer missing prospective attempt')
        if aid in seen:
            raise ValueError('one prospective attempt cannot assign multiple offers')
        seen.add(aid)
        a = attempts[aid]
        if not a['eligible'] or a['matchId'] != o['matchId'] or a['setupId'] != o['setupId']:
            raise ValueError('assigned offer does not match eligible prospective attempt')
        if require_policy and (o.get('policy') != a['policy'] or o['policy'] not in POLICIES):
            raise ValueError('prospective and assigned policy mismatch')
        if not math.isclose(o['startMs'], a['nowMs'], abs_tol=1e-6):
            raise ValueError('assignment timestamp inconsistent with prospective packet')
        if a['riskBin'] != o['riskBin']:
            raise ValueError('assignment risk bin changed after eligibility')
    breakdown = {}
    for policy in POLICIES:
        subset = [p for p in preoffers if p.get('policy') == policy]
        policyoffers = [o for o in offers if o.get('policy') == policy]
        micro = [o for o in policyoffers if o['assignment'] != 'baseline']
        interrupted = sum(o.get('interruptReason') is not None for o in micro)
        completed = [o for o in policyoffers if o['complete']]
        hits = sum(o['outcome']['hitPositive'] for o in completed)
        attempted = len(subset)
        eligible = sum(p['eligible'] for p in subset)
        shots_lost = [o['outcome'].get('shotsLost') for o in completed if o['outcome'].get('shotsLost') is not None]
        breakdown[policy] = {
            'attempts':attempted, 'prospectivelyEligible':eligible,
            'eligibleRate':eligible/attempted if attempted else None,
            'assigned':len(policyoffers), 'microAssigned':len(micro),
            'microAssignedPerAttempt':len(micro)/attempted if attempted else None,
            'interruptedMicro':interrupted,
            'interruptPerMicro':interrupted/len(micro) if micro else None,
            'executedMicroTicksPerAttempt':sum(o['executedTicks'] for o in micro)/attempted if attempted else None,
            'complete':len(completed), 'hitPositive':hits,
            'hitPositiveAmongComplete':hits/len(completed) if completed else None,
            'shotsLostMeasured':len(shots_lost),
            'shotsLostTotalMeasured':sum(shots_lost),
        }
    return {
        'status':'VALIDATED_PROSPECTIVE_LINKAGE_ONLY',
        'preofferAttempts':len(preoffers), 'assigned':len(offers),
        'eligibleWithoutAssignment':sum(p['eligible'] for p in preoffers)-len(offers),
        'byPolicy':breakdown,
        'warning':'No causal efficacy claims from linked windows without powered prospective matched-set experiments',
    }


def matched_setup_bootstrap(preoffers: list[dict], offers: list[dict], *,
                            replicates: int = 2000, seed: int = 3532):
    """Paired-cluster DESCRIPTIVE technical differences, not combat efficacy.

    Each setup must be represented in BOTH policy arms. Rate differences use
    a fixed predecision denominator, and post-assignment interruption rates
    are reported separately. Divergent trajectories are NOT counterfactuals.
    """
    import random
    if replicates < 100:
        raise ValueError('too few cluster-bootstrap replicates')
    by_setup = defaultdict(lambda: {p: {'attempts':0, 'eligible':0, 'micro':0,
                                        'interrupted':0, 'ticks':0} for p in POLICIES})
    for p in preoffers:
        if p.get('policy') in POLICIES:
            b=by_setup[p['setupId']][p['policy']]
            b['attempts'] += 1
            b['eligible'] += int(p['eligible'])
    for o in offers:
        if o.get('policy') not in POLICIES or o['assignment'] == 'baseline':continue
        b=by_setup[o['setupId']][o['policy']]
        b['micro'] += 1
        b['interrupted'] += int(o['interruptReason'] is not None)
        b['ticks'] += o['executedTicks']
    matched=[k for k,v in by_setup.items()
             if all(v[p]['attempts']>0 for p in POLICIES)]
    if len(matched)<5:
        return {'status':'INSUFFICIENT_MATCHED_SETUP_CLUSTERS',
                'matchedSetups':len(matched)}
    def estimate(keys, numerator, denominator):
        result={}
        for p in POLICIES:
            n=sum(by_setup[k][p][denominator] for k in keys)
            x=sum(by_setup[k][p][numerator] for k in keys)
            result[p]=x/n if n else None
        return None if any(v is None for v in result.values()) else result['hierarchical80']-result['legacy80']
    metrics={
        'eligibilityRateDifference':('eligible','attempts'),
        'microAssignedPerAttemptDifference':('micro','attempts'),
        'executedTicksPerAttemptDifference':('ticks','attempts'),
        'interruptionRateAmongMicroDifference':('interrupted','micro'),
    }
    rng=random.Random(seed)
    out={'status':'DESCRIPTIVE_MATCHED_SETUP_ONLY','matchedSetups':len(matched),
         'bootstrapReplicates':replicates,'direction':'hierarchical80 minus legacy80',
         'estimates':{},'warning':'Engineering diagnostics, not combat causal efficacy'}
    for metric,(num,den) in metrics.items():
        obs=estimate(matched,num,den)
        boot=[]
        for _ in range(replicates):
            draw=[rng.choice(matched) for __ in matched]
            val=estimate(draw,num,den)
            if val is not None and math.isfinite(val):boot.append(val)
        boot.sort()
        out['estimates'][metric]={
          'difference':obs,
          'bootstrap95': [boot[int((len(boot)-1)*.025)],boot[int((len(boot)-1)*.975)]] if len(boot)>=100 else None,
          'validResamples':len(boot)
        }
    return out
