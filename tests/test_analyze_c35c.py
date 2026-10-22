import json
import tempfile
import unittest
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"scripts"))
from analyze_c35c import audit_c35b, load_jsonl, load_preoffers, summarize_preoffers, summarize_rows, wilson, cluster_bootstrap_interruption

BASE = Path(__file__).resolve().parents[1]/'reports'/'c35c'/'C35B-BASELINE.json'

def sample_row(**kw):
    base=dict(schema='fpsarena-c35c-offer-v1',offerId='a',matchId='m',setupId='s1',
        startMs=0,windowEndMs=1800,assignment='micro-left',
        propensity={'baseline':1/3,'micro-left':1/3,'micro-right':1/3},
        riskBin='middle',durationMs=80,predecisionOnly=True,complete=True,
        censored=False,executedTicks=2,plannedTicks=5,
        interruptReason='incumbent-priority-command',
        outcome={'hitPositive':False,'hostileHits':0,'source':'server-after-action'})
    return {**base,**kw}

class AnalysisTests(unittest.TestCase):
    def test_c35b_counts(self):
        self.assertEqual(audit_c35b(BASE)['status'],'PASS_AGGREGATED_ARITHMETIC_ONLY')
        self.assertAlmostEqual(audit_c35b(BASE)['160Minus80PercentagePoints'],24.028,places=3)
    def test_descriptive_summary(self):
        x=summarize_rows([sample_row()])
        self.assertEqual(x['all']['offers'],1)
        self.assertEqual(x['byArm']['micro-left']['interruptions'],1)
        self.assertEqual(x['all']['hitPositive'],0)
    def test_wilson(self):
        self.assertEqual(wilson(0,0),[None,None]); self.assertLess(wilson(0,80)[1],.05)
    def test_insufficient_clusters(self):
        self.assertEqual(cluster_bootstrap_interruption([sample_row()])['status'],'INSUFFICIENT_CLUSTERS')
    def test_censored_hit_zero_rejected(self):
        row=sample_row(complete=False,censored=True,outcome={'hitPositive':False,'hostileHits':0,'source':'server-after-action'})
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'data.jsonl'; path.write_text(json.dumps(row)+'\n')
            with self.assertRaisesRegex(ValueError,'Censored'):
                load_jsonl([path])
    def test_missing_arm_positive_probability_rejected(self):
        row=sample_row(propensity={'baseline':0,'micro-left':.5,'micro-right':.5})
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'data.jsonl'; path.write_text(json.dumps(row)+'\n')
            with self.assertRaisesRegex(ValueError,'positive propensity'):
                load_jsonl([path])
    def test_overlap_rejected(self):
        rows=[sample_row(),sample_row(offerId='b',startMs=1200,windowEndMs=3000)]
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'data.jsonl'; path.write_text('\n'.join(map(json.dumps,rows)))
            with self.assertRaisesRegex(ValueError,'Overlapping windows'):
                load_jsonl([path])
    def test_preoffer_audit_counts_selection_before_randomization(self):
        pre=[{'schema':'fpsarena-c35c-preoffer-v1','attemptId':'a','matchId':'m',
             'setupId':'s1','nowMs':1,'eligible':False,'predecisionReason':'incumbent-priority-command',
             'riskBin':'high','predecisionOnly':True}]
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'pre.jsonl'; path.write_text(json.dumps(pre[0])+'\n')
            result=summarize_preoffers(load_preoffers([path]))
            self.assertEqual(result['blockedReasons']['incumbent-priority-command'],1)
            self.assertEqual(result['byProspectiveRisk']['high']['attempted'],1)
    def test_two_setups_bootstrap(self):
        rows=[sample_row(),sample_row(offerId='b',setupId='s2',matchId='m2',interruptReason=None)]
        result=cluster_bootstrap_interruption(rows,replicates=200)
        self.assertEqual(result['clusters'],2)

if __name__=='__main__': unittest.main()

class LinkageTests(unittest.TestCase):
    def test_join_pass_and_selection_denominator(self):
        from c35c_validation import audit_prospective_linkage
        pre=[{'attemptId':'a','matchId':'m','setupId':'s1','nowMs':0,
              'eligible':True,'riskBin':'middle','policy':'hierarchical80'},
             {'attemptId':'b','matchId':'m','setupId':'s1','nowMs':300,
              'eligible':False,'riskBin':'high','policy':'hierarchical80'}]
        row=sample_row(attemptId='a',policy='hierarchical80')
        r=audit_prospective_linkage(pre,[row]);
        self.assertEqual(r['preofferAttempts'],2)
        self.assertEqual(r['byPolicy']['hierarchical80']['microAssignedPerAttempt'],0.5)
        self.assertEqual(r['byPolicy']['hierarchical80']['interruptPerMicro'],1.0)
    def test_orphan_assignment_rejected(self):
        from c35c_validation import audit_prospective_linkage
        with self.assertRaisesRegex(ValueError,'missing prospective attempt'):
            audit_prospective_linkage([], [sample_row(attemptId='a',policy='legacy80')])
    def test_risk_and_policy_mismatch_rejected(self):
        from c35c_validation import audit_prospective_linkage
        pre=[{'attemptId':'a','matchId':'m','setupId':'s1','nowMs':0,
              'eligible':True,'riskBin':'high','policy':'hierarchical80'}]
        with self.assertRaisesRegex(ValueError,'policy mismatch'):
            audit_prospective_linkage(pre,[sample_row(attemptId='a',policy='legacy80',riskBin='high')])
        with self.assertRaisesRegex(ValueError,'risk bin changed'):
            audit_prospective_linkage(pre,[sample_row(attemptId='a',policy='hierarchical80')])
    def test_nonfinite_json_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'data.jsonl'
            text=json.dumps(sample_row()).replace('"startMs": 0', '"startMs": NaN')
            path.write_text(text+'\n')
            with self.assertRaisesRegex(ValueError,'nonfinite'):
                load_jsonl([path])
    def test_preoffer_duplicate_across_files_rejected(self):
        p=dict(schema='fpsarena-c35c-preoffer-v1', attemptId='a', matchId='m',
               setupId='s1', nowMs=10, eligible=False,predecisionReason='blocked',
               riskBin='low',predecisionOnly=True,policy='hierarchical80')
        with tempfile.TemporaryDirectory() as directory:
            x=Path(directory)/'a.jsonl'; x.write_text(json.dumps(p)+'\n'+json.dumps(p)+'\n')
            with self.assertRaisesRegex(ValueError,'duplicate preoffer'):
                load_preoffers([x])

class MatchedClusterTests(unittest.TestCase):
    def test_five_matched_clusters_stable(self):
        from c35c_validation import matched_setup_bootstrap
        pre=[];rows=[]
        for k in range(5):
            for policy in ('legacy80','hierarchical80'):
                aid=f'{policy}-{k}'
                pre.append(dict(attemptId=aid,matchId=aid,setupId=f'setup{k}',
                  nowMs=0,eligible=True,riskBin='middle',policy=policy))
                rows.append(sample_row(attemptId=aid,offerId=aid,matchId=aid,
                   setupId=f'setup{k}',policy=policy,
                   interruptReason=None if policy=='hierarchical80' else 'incumbent-priority-command'))
        result=matched_setup_bootstrap(pre,rows,replicates=100)
        self.assertEqual(result['matchedSetups'],5)
        self.assertEqual(result['estimates']['interruptionRateAmongMicroDifference']['difference'],-1)
        self.assertEqual(result['status'],'DESCRIPTIVE_MATCHED_SETUP_ONLY')
    def test_unmatched_design_not_published(self):
        from c35c_validation import matched_setup_bootstrap
        pre=[{'attemptId':'a','matchId':'m','setupId':'s','nowMs':0,
          'policy':'legacy80','eligible':True,'riskBin':'low'}]
        self.assertEqual(matched_setup_bootstrap(pre,[])['status'],'INSUFFICIENT_MATCHED_SETUP_CLUSTERS')
