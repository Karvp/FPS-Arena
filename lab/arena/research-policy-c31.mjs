// C31 research-only weapon coverage audit. NO new production behavior.
// Uses C30 frozen model, keeps all C16 safety constraints.
import {ResearchPolicyC30, publicModelFeaturesC30} from './research-policy-c30.mjs';
export class ResearchPolicyC31 extends ResearchPolicyC30 {
 constructor({enemyPrimary,...args}) {
  super(args);
  this.enemyPrimary=enemyPrimary;
  this.audit={offers:0,validFeatures:0,selectedByPublicWeapon:{},
   seenPublicWeapons:{},badPublicWeapon:0,bySelectedAction:{baseline:0,'micro-left':0,'micro-right':0}};
 }
 command(now,client,original) {
  const before=this.offers.length;
  const cmd=super.command(now,client,original);
  if(this.offers.length===before)return cmd;
  const offer=this.offers.at(-1);
  const c30=offer.c30||{};
  const remotes=(client?.remotes?.list||[]).filter(e=>e?.alive&&e.team!==client?.local?.team&&
   [e?.pos?.x,e?.pos?.z,e?.yaw].every(Number.isFinite));
  const p=client?.pos;
  if(p&&Number.isFinite(p.x)&&Number.isFinite(p.z))
   remotes.sort((a,b)=>Math.hypot(a.pos.x-p.x,a.pos.z-p.z)-Math.hypot(b.pos.x-p.x,b.pos.z-p.z)||String(a.id).localeCompare(String(b.id)));
  const enemy=remotes[0],w=String(enemy?.data?.w||'').toLowerCase()||null;
  offer.c31={publicEnemyId:enemy?.id||null,publicWeapon:w,selected:c30.selected||'baseline',
   result:'controlled-opponent-loadout',modelReusedFromC30:true,
   // serverWeaponAfterDecision is populated by the headless trainer AFTER command selection.
   serverWeaponAfterDecision:null,truthMatchesPublic:null};
  this.audit.offers++;
  if(c30.publicFeatureValues)this.audit.validFeatures++;
  this.audit.seenPublicWeapons[w||'missing']=(this.audit.seenPublicWeapons[w||'missing']||0)+1;
  const a=c30.selected||'baseline';this.audit.bySelectedAction[a]++;
  (this.audit.selectedByPublicWeapon[w||'missing']??={baseline:0,'micro-left':0,'micro-right':0})[a]++;
  if(w!==this.enemyPrimary)this.audit.badPublicWeapon++;
  return cmd;
 }
 finish(t) {
  const r=super.finish(t);
  r.schema='fpsarena-c31-controlled-weapon-transfer-match-v1';
  r.metadata.c31={researchOnly:true,controlledEnemyPrimary:this.enemyPrimary,
   policy:this.policy,modelSHA256:this.model.modelSourceSHA256,
   infoBarrier:'server weapon truth is attached AFTER command selection; client receives delayed snapshots'};
  const offers=r.offers||[];
  r.diagnostics.c31={...this.audit,
   weaponTruthKnown:offers.filter(o=>o.c31?.serverWeaponAfterDecision).length,
   weaponTruthMismatch:offers.filter(o=>o.c31?.serverWeaponAfterDecision&&!o.c31.truthMatchesPublic).length,
   serverWeapons:Object.fromEntries([...new Set(offers.map(o=>o.c31?.serverWeaponAfterDecision).filter(Boolean))].map(w=>
    [w,offers.filter(o=>o.c31?.serverWeaponAfterDecision===w).length]))};
  return r;
 }
}
