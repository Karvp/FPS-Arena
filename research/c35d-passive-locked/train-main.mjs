#!/usr/bin/env node
// FPS Arena authoritative headless training room: ACTUAL Game.step(), BotBrain,
// movement, bullet geometry, damage, loot, ring, objectives and zombie AI.
// The shipped page-agent.js is dynamically imported and patches this headless Game.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {Game as ServerGame} from './source-main/server/game.js';
import {BotBrain} from './source-main/server/bot.js';
import {UnrestrictedOpponent} from './unrestricted-opponent-main.mjs';
import {ZombieMode} from './source-main/server/modes/zombie.js';
import {Game as HeadlessGame} from './headless-client-main.mjs';
import {WEAPONS} from './source-main/shared/weapons.js';
import {SKILLS,THROWABLES} from './source-main/shared/skills.js';
import {DT} from './source-main/shared/constants.js';
import {DirectorOutcomeRecorder} from './director-outcome-recorder.mjs';
import {MatchEngagementRecorderC12} from './match-engagement-recorder-c12.mjs';
import {EncounterPolicyRecorderC13} from './encounter-policy-recorder-c13.mjs';
import {SafeActionExplorerC14,matchAssignmentC14} from './safe-action-explorer-c14.mjs';
import {SafeActionExplorerC15} from './safe-action-explorer-c15.mjs';
import {SafeActionExplorerC16} from './safe-action-explorer-c16.mjs';
import {ResearchPolicyC29,readFrozenC28,C29_POLICIES} from './research-policy-c29.mjs';
import {ResearchPolicyC30,readFrozenC30,C30_POLICIES} from './research-policy-c30.mjs';
import {ResearchPolicyC31} from './research-policy-c31.mjs';
import {RealEncounterObserverC34} from './real-encounter-observer-c34.mjs';
import {RandomizedSafeActionC35} from './randomized-safe-action-c35.mjs';
import {MicroActionReliabilityC35B,C35B_DOSES} from './micro-action-reliability-c35b.mjs';
import {MacroMicroIntegrationC35C,C35C_POLICIES} from './macro-micro-integration-c35c.mjs';
import {PublicMacroTransitionRecorderC35D} from './public-macro-transition-c35d.mjs';
import {EncounterRandomizerC21} from './encounter-randomization-c21.mjs';
import {RiskAwareRandomizerC22} from './risk-aware-encounters-c22.mjs';
import {ThreatTraceObserverC24,tracerProximityC24,C24_NEAR_TRACER_METERS} from './threat-trace-observer-c24.mjs';
import {ThreatCalibrationObserverC25} from './threat-calibration-observer-c25.mjs';
import {stratifiedAssignmentC17} from './stratified-exploration-c17.mjs';
import {tacticalEpisodeExplorationAssignment} from '../../tactical-director.mjs';
const dir=path.dirname(fileURLToPath(import.meta.url));
const extRoot=path.resolve(dir,'../..');
const args=process.argv.slice(2);
const flag=(k,df)=>{let i=args.indexOf('--'+k);return i<0?df:args[i+1]};
const modes=String(flag('modes','tdm,snd,hp,br,zm')).split(',');
const episodes=Number(flag('episodes','1')),seconds=Number(flag('seconds','20'));
const fullMatch=args.includes('--full-match');
const c19Natural=args.includes('--c19-natural');
const c20MatchedSeed=args.includes('--c20-matched-seed');
const seed0=Number(flag('seed','20261010'));
const botCount=Number(flag('bots','5'));
const traineeSkill=String(flag('trainee-skill','random'));
const traineeThrow=String(flag('trainee-throw','frag'));
const traineePrimary=String(flag('trainee-primary','m4a1'));
const autoSkillsEnabled=!args.includes('--no-auto-skills');
if(traineeSkill!=='random'&&!SKILLS[traineeSkill])throw Error('Unknown trainee skill: '+traineeSkill);
if(!THROWABLES[traineeThrow])throw Error('Unknown trainee throwable: '+traineeThrow);
if(!WEAPONS[traineePrimary]||WEAPONS[traineePrimary].cat==='Pistol'||WEAPONS[traineePrimary].skillWeapon||WEAPONS[traineePrimary].unarmed)throw Error('Invalid trainee primary: '+traineePrimary);
const classicMaps=String(flag('classic-maps','neon')).split(',').map(x=>x.trim());
if(!classicMaps.length || classicMaps.some(x=>!['arena','neon','foundry'].includes(x)))throw Error('Unknown classic map');
const profile=String(flag('profile','baseline'));
const opponentPolicy=String(flag('opponents','official'));
if(!['official','mixed','stress'].includes(opponentPolicy))throw Error('Unknown opponent policy');
const zombiePose=String(flag('zombie-pose','original'));
if(!['original','patched'].includes(zombiePose))throw Error('Unknown zombie pose variant');
if(zombiePose==='patched') {
  const original=ZombieMode.prototype.think;
  ZombieMode.prototype.think=function(z,alive){
    const result=original.call(this,z,alive);const h=z.history[z.history.length-1];
    if(h){h.st=0;h.l=0;h.yaw=z.yaw;}return result;
  };
}
const snapshotLag=Number(flag('lag-ms','65'))/1000;
const replayPath=flag('replay',null);
const c12DatasetPath=flag('c12-dataset',null);
const c13DatasetPath=flag('c13-dataset',null);
const c14DatasetPath=flag('c14-dataset',null);
const c15DatasetPath=flag('c15-dataset',null);
const c16DatasetPath=flag('c16-dataset',null);
const c17DatasetPath=flag('c17-dataset',null);
const c21DatasetPath=flag('c21-dataset',null);
const c22DatasetPath=flag('c22-dataset',null);
const c24DatasetPath=flag('c24-dataset',null);
const c25DatasetPath=flag('c25-dataset',null);
const c29DatasetPath=flag('c29-dataset',null);
const c29Policy=flag('c29-policy',null);
const c31DatasetPath=flag('c31-dataset',null);
const c34DatasetPath=flag('c34-dataset',null);
const c34EnemyPrimary=flag('c34-enemy-primary',null);
const c35DatasetPath=flag('c35-dataset',null);
const c35EnemyPrimary=flag('c35-enemy-primary',null);
const c35RegistrationSHA256=flag('c35-registration-sha',null);
const c35bDatasetPath=flag('c35b-dataset',null);
const c35bEnemyPrimary=flag('c35b-enemy-primary',null);
const c35bRegistrationSHA256=flag('c35b-registration-sha',null);
const c35bDoseMs=flag('c35b-dose-ms',null)===null?null:Number(flag('c35b-dose-ms',null));
const c35cDatasetPath=flag('c35c-dataset',null);
const c35cPolicy=flag('c35c-policy',null);
const c35cSetupId=flag('c35c-setup-id',null);
const c35cRegistrationSHA256=flag('c35c-registration-sha',null);
const c35cEnemyPrimary=flag('c35c-enemy-primary',null);
const c35dTracePath=flag('c35d-trace',null);
const c35dSetupId=flag('c35d-setup-id',null);
const c35Any=!!(c35DatasetPath||c35bDatasetPath||c35cDatasetPath);
const c35Enemy=c35cDatasetPath?c35cEnemyPrimary:c35bDatasetPath?c35bEnemyPrimary:c35EnemyPrimary;
const c35Registration=c35cDatasetPath?c35cRegistrationSHA256:c35bDatasetPath?c35bRegistrationSHA256:c35RegistrationSHA256;
const c31Policy=flag('c31-policy',null);
const enemyPrimary=flag('enemy-primary',null);
const c30DatasetPath=flag('c30-dataset',null);
const c30Policy=flag('c30-policy',null);
const c30Frozen=(c30DatasetPath||c31DatasetPath)?readFrozenC30(path.join(extRoot,'reports/c30/encounters/FROZEN-POLICY.json')):null;
const c29Frozen=c29DatasetPath?readFrozenC28(path.join(extRoot,'reports/c28/micro-v1/FROZEN-POLICY.json')):null;
const c17Replicate=c17DatasetPath?Number(flag('c17-replicate','NaN')):null;
const c17ExperimentSeed=c17DatasetPath?Number(flag('c17-experiment-seed','170017')):null;
const profileExploration=args.includes('--profile-exploration');
if([c14DatasetPath,c15DatasetPath,c16DatasetPath,c17DatasetPath,c21DatasetPath,c22DatasetPath,c24DatasetPath,c25DatasetPath,c29DatasetPath,c30DatasetPath,c31DatasetPath,c34DatasetPath,c35DatasetPath,c35bDatasetPath,c35cDatasetPath].filter(Boolean).length>1)throw Error('C14/C15/C16 datasets cannot run simultaneously');
const explorationDatasetPath=c35cDatasetPath||c35bDatasetPath||c35DatasetPath||c31DatasetPath||c30DatasetPath||c29DatasetPath||c24DatasetPath||c22DatasetPath||c21DatasetPath||c17DatasetPath||c16DatasetPath||c15DatasetPath||c14DatasetPath;
if((c21DatasetPath||c22DatasetPath||c24DatasetPath||c25DatasetPath)&&(modes.length!==1||modes[0]!=='tdm'||episodes!==1||classicMaps.length!==1||c20MatchedSeed||c19Natural||flag('c14-force-arm',null)!==null))throw Error('C21 requires a single fixed-map TDM match with no forced arm or C19/C20 coupling');
if(c17DatasetPath&&(!Number.isSafeInteger(c17Replicate)||c17Replicate<0||!Number.isSafeInteger(c17ExperimentSeed)||c17ExperimentSeed<0||episodes!==1||modes.length!==1||modes[0]!=='tdm'||classicMaps.length!==1||(fullMatch&&!c19Natural)))throw Error('C17 requires a single fixed-map TDM episode, valid replicate and experiment seed');
if(c19Natural&&(!fullMatch||!c17DatasetPath||seconds!==600||episodes!==1))throw Error('C19 natural-end requires C17 randomized TDM dataset, --full-match and --seconds 600');
if(c34DatasetPath&&(modes.length!==1||modes[0]!=='tdm'||episodes!==1||classicMaps.length!==1||c19Natural||c20MatchedSeed||c29DatasetPath||c30DatasetPath||c31DatasetPath||!['mp5sd','m4a1','aa12','hk_sl8','uzi','l115a3'].includes(c34EnemyPrimary)))throw Error('C34 requires one non-intervened TDM match on one map');
if(!c34DatasetPath&&c34EnemyPrimary!==null)throw Error('C34 enemy weapon requires c34-dataset');
if(c35DatasetPath&&(profile!=='release'||modes.length!==1||modes[0]!=='tdm'||episodes!==1||classicMaps.length!==1||c19Natural||c20MatchedSeed||!['mp5sd','m4a1','aa12','hk_sl8','uzi','l115a3'].includes(c35EnemyPrimary)||!Number.isSafeInteger(seed0)||!c35RegistrationSHA256||!/^[a-f0-9]{64}$/.test(c35RegistrationSHA256)))throw Error('C35 requires one Release TDM match, controlled enemy weapon, and locked preregistration SHA');
if(!c35DatasetPath&&(c35EnemyPrimary!==null||c35RegistrationSHA256!==null))throw Error('C35 flags require --c35-dataset');
if(c35bDatasetPath&&(profile!=='release'||modes.length!==1||modes[0]!=='tdm'||episodes!==1||classicMaps.length!==1||c19Natural||c20MatchedSeed||!['mp5sd','m4a1','aa12','hk_sl8','uzi','l115a3'].includes(c35bEnemyPrimary)||!Number.isSafeInteger(seed0)||!c35bRegistrationSHA256||!/^[a-f0-9]{64}$/.test(c35bRegistrationSHA256)||!C35B_DOSES.includes(c35bDoseMs)))throw Error('C35B requires one Release TDM, safe fixed dose and registered seed');
if(!c35bDatasetPath&&(c35bEnemyPrimary!==null||c35bRegistrationSHA256!==null||c35bDoseMs!==null))throw Error('C35B flags require --c35b-dataset');
if(c35cDatasetPath&&(profile!=='release'||modes.length!==1||modes[0]!=='tdm'||episodes!==1||classicMaps.length!==1||c19Natural||c20MatchedSeed||!['mp5sd','m4a1','aa12','hk_sl8','uzi','l115a3'].includes(c35cEnemyPrimary)||!Number.isSafeInteger(seed0)||!C35C_POLICIES.includes(c35cPolicy)||!c35cSetupId||!c35cRegistrationSHA256||!/^[a-f0-9]{64}$/.test(c35cRegistrationSHA256)))throw Error('C35C requires registered 80ms Release TDM, policy, setup and enemy');
if(!c35cDatasetPath&&(c35cPolicy!==null||c35cSetupId!==null||c35cRegistrationSHA256!==null||c35cEnemyPrimary!==null))throw Error('C35C flags require --c35c-dataset');
if(c35dTracePath&&(profile!=='release'||modes.length!==1||modes[0]!=='tdm'||episodes!==1||classicMaps.length!==1||c35Any||explorationDatasetPath||c34DatasetPath||fullMatch||!c35dSetupId||seconds>180||seconds<=0))throw Error('C35D passive trace requires single release TDM map, no interventions, valid setup ID and <=180s');
if(!c35dTracePath&&c35dSetupId!==null)throw Error('C35D setup id requires --c35d-trace');
const c14ForcedArm=flag('c14-force-arm',null);
if(c29DatasetPath&&(!C29_POLICIES.includes(c29Policy)||modes.length!==1||modes[0]!=='tdm'||episodes!==1||classicMaps.length!==1||c20MatchedSeed||c19Natural||c14ForcedArm!==null))throw Error('C29 needs one TDM match, one map, valid policy, and no other experimental controller');
if(c30DatasetPath&&(!C30_POLICIES.includes(c30Policy)||modes.length!==1||modes[0]!=='tdm'||episodes!==1||classicMaps.length!==1||c20MatchedSeed||c19Natural||c14ForcedArm!==null))throw Error('C30 needs fixed TDM and valid precommitted research policy');
if(!c30DatasetPath&&c30Policy!==null)throw Error('C30 policy requires --c30-dataset');
if(c31DatasetPath&&(!C30_POLICIES.includes(c31Policy)||modes.length!==1||modes[0]!=='tdm'||episodes!==1||classicMaps.length!==1||c20MatchedSeed||c19Natural||c14ForcedArm!==null||!enemyPrimary||!['mp5sd','m4a1','aa12','hk_sl8','uzi','l115a3'].includes(enemyPrimary)))throw Error('C31 requires research-only single TDM, valid policy and explicit supported enemy-primary');
if(!c31DatasetPath&&(c31Policy!==null||enemyPrimary!==null))throw Error('C31 flags require --c31-dataset');
if(!c29DatasetPath&&c29Policy!==null)throw Error('C29 policy requires --c29-dataset');
if(c20MatchedSeed&&(!c19Natural||!c17DatasetPath||c14ForcedArm!==null))throw Error('C20 requires C19 natural-end mode without forced arm');
if(c14ForcedArm!==null&&!['control','treatment'].includes(c14ForcedArm))throw Error('Invalid C14 arm');
if(c14ForcedArm!==null&&!explorationDatasetPath)throw Error('C14 force arm requires an exploration dataset');
if(c17DatasetPath&&c14ForcedArm!==null)throw Error('C17 forbids forced assignment');
if((explorationDatasetPath||c25DatasetPath)&&profile!=='release')throw Error('C14/C15/C16 exploration is limited to Release Autopilot in the research lab');
if(profileExploration&&!explorationDatasetPath)throw Error('Exploration profiling requires a dataset');
const c14Matches=[];
const c34Matches=[];
const c13Matches=[];
const c12Matches=[];
const c25Matches=[];
const captureDecisions=args.includes('--trace-decisions');
const profileAgent=args.includes('--profile-agent');
let directorOutcomeRecorder=null;
let decisionFeed=[];let directorEventCounts={};let directorExplorationAssignments=[];let directorExplorationAssignmentTotal=0;let directorSamples=[];let directorAuditTotals={};let directorAuditSearches=0;let directorFirstVisibleWindowAt=null;let directorFirstGeometricWindowAt=null;let directorPlanWindows=[];let activeDirectorWindow=null;
let goalEventCounts={};let goalEventSamples=[];let macroEventCounts={};let macroEventSamples=[];let macroOptionTotals={};let macroOptionTrace=[];let macroOptionLoopCandidates=0;let macroOptionCycleClasses={};let macroOptionCycles=[];let macroCurrentOption=null;let macroServerOptionStats={};
const replayRecords=[];
const c35dTraces=[];
const outPath=path.resolve(String(flag('out',path.join(extRoot,'reports','ARENA_TRAINING.json'))));
if(!Number.isInteger(episodes)||episodes<1||episodes>100||!Number.isFinite(seconds)||seconds<2||seconds>1200||!Number.isInteger(botCount)||botCount<1||botCount>11||!['baseline','aggressive','survival','balanced','legacy-peek','combat-first','squad-experiment','aim-0','aim-30','aim-100','aim-geom','legacy-aim','sightline-lab','dodge-lab','combined-lab','steer-650','steer-900','route-lab','strafe-lab','route-strafe','evade-lab','cover-lab','cover-evasion-lab','stance-lab','stance-cover-lab','stance-all-lab','sprint-cover-lab','sprint-all-lab','sprint-stance-lab','preemptive-lab','preemptive-evasion-lab','occluded-pursuit-lab','peek-cache-lab','macro-routing-lab','macro-target-lab','macro-actuation-lab','legacy-ads','release','macro-combat-lab','macro-covered-lab','macro-vantage-lab','macro-temporal-lab','macro-ownership-lab','macro-options-shadow-lab','macro-options-active-lab','goal-aware-shadow-lab','goal-aware-active-lab','director-shadow-lab','director-active-lab','director-safe-lab','director-opportunity-lab','director-engagement-lab','director-engagement-shadow-lab','director-engagement-trial-lab','director-engagement-probe-lab','director-engagement-frontier-lab','director-engagement-frontier-shadow-lab','director-engagement-recovery-lab','director-engagement-coverage-lab','director-engagement-exploration-lab','director-engagement-exploration-all-lab','director-engagement-episode-lab','director-engagement-episode-control-lab','director-engagement-episode-active-lab','director-main-stats-shadow-lab','director-main-stats-recovery-lab','director-ballistic-shadow-lab','director-ballistic-recovery-lab','director-motion-shadow-lab','director-motion-recovery-lab'].includes(profile))throw Error('Invalid training settings');
for(const m of modes)if(!['tdm','snd','hp','br','zm'].includes(m))throw Error('Unknown mode '+m);
const savedRandom=Math.random;
function seeded(seed){let x=seed>>>0;return ()=>{x=(x+0x6D2B79F5)>>>0;let z=x;z=Math.imul(z^(z>>>15),z|1);z^=z+Math.imul(z^(z>>>7),z|61);return ((z^(z>>>14))>>>0)/4294967296;};}
let virtualTime=0;
Object.defineProperty(globalThis,'performance',{value:{now:()=>virtualTime*1000},configurable:true});
if(!globalThis.CustomEvent)globalThis.CustomEvent=class CustomEvent extends Event {constructor(type,o){super(type);this.detail=o?.detail;}};
const bus=new EventTarget();let agentErrors=[];
bus.addEventListener('fpsarena-aim:macro-decision', event=>{
  try{const e=JSON.parse(event.detail);directorOutcomeRecorder?.directorEvent(e);const key=e.state+(e.reason?':'+e.reason:'');if(e.state?.startsWith('director-')){
      directorEventCounts[key]=(directorEventCounts[key]||0)+1;
      if(e.state==='director-exploration-assignment')directorExplorationAssignmentTotal++;
      if(e.state==='director-exploration-assignment' && directorExplorationAssignments.length<200)
        directorExplorationAssignments.push({t:e.t,targetId:e.targetId,attempt:e.attempt,
          draw:e.draw,actuate:e.actuate,actionProbability:e.actionProbability,
          controlProbability:e.controlProbability,algorithm:e.algorithm,
          eligibleCount:e.eligibleCount,eligibleOptions:e.eligibleOptions});
      if(e.state==='director-planned'&&e.active===true&&Number.isInteger(e.planId)){
        // Diagnostic association, NOT a causal claim of created shots/hits.
        const record={planId:e.planId,type:e.type,targetId:e.targetId,start:+e.t.toFixed(3),
          end:null,selectedAt:null,commandSelected:false,shotsDuring:0,hitsDuring:0,killsDuring:0,
          damageTakenDuring:0,metersMovedDuring:0,fireInputTicks:0,
          utility:e.utility??null,risk:e.risk??null,plannedETA:e.timeToFire??null,
          explorationAttempt:e.explorationAttempt??null,actionProbability:e.actionProbability??null,
          terminalTimeToFire:e.terminalTimeToFire??null,earlyShotWindow:e.earlyShotWindow===true,
          routeLength:e.routeLength??null,uncertainty:e.uncertainty??null,
          reason:null,feedbackProxy:null,waypointsReached:null,selfProgress:null};
        if(directorPlanWindows.length<200){directorPlanWindows.push(record);activeDirectorWindow=record;}
      }
      if(e.state==='director-command-selected'&&activeDirectorWindow?.planId===e.planId){
        activeDirectorWindow.commandSelected=true;
        activeDirectorWindow.selectedAt=+e.t.toFixed(3);
      }
      if(e.state==='director-outcome'&&activeDirectorWindow?.planId===e.planId){
        activeDirectorWindow.end=+e.t.toFixed(3);
        activeDirectorWindow.reason=e.reason;
        activeDirectorWindow.feedbackProxy=e.feedbackProxy??null;
        activeDirectorWindow.waypointsReached=e.waypointsReached??null;
        activeDirectorWindow.selfProgress=e.selfProgress??null;
        activeDirectorWindow=null;
      }
      if(e.state==='director-candidate-audit'){
        directorAuditSearches++;
        for(const field of ['sites','losValid','riskValid','routesAttempted',
          'routesValid','initialStepsValid','earlyWindows','accepted',
          'routeMissing','detourRejected','detourSalvaged','unsafeRoutes',
          'motionSites','motionFallback'])
          directorAuditTotals[field]=(directorAuditTotals[field]||0)+(e[field]||0);
      }
      if(e.state==='director-first-visible-window'&&directorFirstVisibleWindowAt===null&&Number.isFinite(e.t))
        directorFirstVisibleWindowAt=e.t;
      if(e.state==='director-first-geometric-window'&&directorFirstGeometricWindowAt===null&&Number.isFinite(e.t))
        directorFirstGeometricWindowAt=e.t;
      if(directorSamples.length<100)directorSamples.push(e);
    }if(e.state?.startsWith('goal-')){goalEventCounts[key]=(goalEventCounts[key]||0)+1;if(goalEventSamples.length<750)goalEventSamples.push(e);}
    macroEventCounts[key]=(macroEventCounts[key]||0)+1;
    if(e.state==='option-transition'&&e.optionId){
      macroCurrentOption={id:e.optionId,type:e.option,targetId:e.targetId};
      macroServerOptionStats[e.optionId]||={type:e.option,targetId:e.targetId,shots:0,hits:0,kills:0,damageDealt:0};
    }
    if(e.state==='option-outcome'&&macroCurrentOption?.id===e.optionId)
      macroCurrentOption=null;
    if(e.state==='option-cycle-evidence'){
      macroOptionLoopCandidates++;
      macroOptionCycleClasses[e.label]=(macroOptionCycleClasses[e.label]||0)+1;
      if(macroOptionCycles.length<1200)macroOptionCycles.push({t:e.t,label:e.label,
        sequence:e.sequence,targetId:e.targetId,elapsedMs:e.elapsedMs,
        intermediateDurationMs:e.intermediateDurationMs,
        intermediateSelfRangeGainM:e.intermediateSelfRangeGainM,
        intermediateMovedM:e.intermediateMovedM,
        intermediateFireTicks:e.intermediateFireTicks,
        intermediateShotOpportunities:e.intermediateShotOpportunities,
        intermediateHpLoss:e.intermediateHpLoss,intermediateArmorLoss:e.intermediateArmorLoss,
        serverIntermediate:{...macroServerOptionStats[e.optionIds?.[1]]||{shots:0,hits:0,kills:0,damageDealt:0}}});
    }
    if(['option-transition','option-outcome','option-proposal','option-veto'].includes(e.state)&&macroOptionTrace.length<3000){
      macroOptionTrace.push({t:e.t,state:e.state,option:e.option||null,executed:e.executed||null,proposed:e.proposed||null,
        reason:e.reason||e.interrupt||null,rangeGainM:e.rangeGainM??null,selfRangeGainM:e.selfRangeGainM??null,
        fireTicks:e.fireTicks??null,shotOpportunities:e.shotOpportunities??null,
        hpLoss:e.hpLoss??null,armorLoss:e.armorLoss??null,proxyValue:e.proxyValue??null});
    }
    if(e.state==='option-outcome'){
      const o=String(e.option||'UNKNOWN');
      const t=macroOptionTotals[o]||(macroOptionTotals[o]={completed:0,fireTicks:0,shotOpportunities:0,useful:0,movedM:0,rangeGainM:0,selfRangeGainM:0,totalDurationMs:0});
      t.completed++;t.fireTicks+=e.fireTicks||0;t.shotOpportunities+=e.shotOpportunities||0;
      t.useful+=e.useful?1:0;t.movedM+=e.movedM||0;t.rangeGainM+=e.rangeGainM||0;t.selfRangeGainM+=e.selfRangeGainM||0;t.totalDurationMs+=e.durationMs||0;
    }
    if(macroEventSamples.length<300 && (e.state==='planned'||e.state==='no-safe-route'||e.state==='option-outcome'||e.state==='option-transition'||e.state==='option-proposal'))
      macroEventSamples.push(e);
  }catch{}
});
bus.addEventListener('fpsarena-aim:record',event=>{
 if(!captureDecisions)return;
 try{
   const record=JSON.parse(event.detail);
   if(record.kind==='sample'){
     const sample=record.sample;
     const reason=sample?.decision?.reason;
     if(typeof reason==='string' && reason && reason!=='server-snapshot')decisionFeed.push({t:sample.t,reason});
   }
 }catch{} // Diagnostic capture must never affect the game loop.
});
function fakeElement(id=''){return {id,style:{},children:[],append(...items){this.children.push(...items);},remove(){},setAttribute(){},textContent:'',getContext(){return null;}};}
const elements=new Map();
globalThis.document={
 addEventListener:(...a)=>bus.addEventListener(...a),dispatchEvent:(...a)=>bus.dispatchEvent(...a),
 querySelector:s=>s==='#hud.active'||s==='#screen-game.active'?{}:null,
 createElement:(tag)=>fakeElement(tag),getElementById:id=>elements.get(id),
 body:{append(...items){for(const i of items)elements.set(i.id,i);}}
};
globalThis.window={addEventListener(){}};
globalThis.innerWidth=1280;globalThis.innerHeight=720;
bus.addEventListener('fpsarena-aim:status',e=>{const v=JSON.parse(e.detail);if(v.state==='error')agentErrors.push({t:virtualTime,message:v.message});});
let ready=false;
bus.addEventListener('fpsarena-aim:status',e=>{const v=JSON.parse(e.detail);if(v.state==='ready'&&v.message==='Connected to FPS Arena')ready=true;});
let agent=readFileSync(path.join(extRoot,'page-agent.js'),'utf8');
const inject={
 '/client/game.js':'./headless-client-main.mjs','/client/camera.js':'./headless-camera.mjs',
 ...Object.fromEntries(['constants','geometry','movement','skills','weapons','rarity'].map(n=>['/shared/'+n+'.js','./source-main/shared/'+n+'.js']))
};
for(const [from,to] of Object.entries(inject))agent=agent.replaceAll(`import('${from}')`,`import(${JSON.stringify(pathToFileURL(path.join(dir,to)).href)})`);
// import from data URL so the bundled extension, not a reimplementation, controls the trainee.
await import('data:text/javascript;base64,'+Buffer.from(agent).toString('base64'));
for(let k=0;k<20&&!ready;k++)await new Promise(r=>setImmediate(r));
if(!ready)throw Error('Bundled page-agent.js failed to initialize: '+JSON.stringify(agentErrors));
const baseConfig={enabled:true,mode:'autopilot',target:'head',fov:45,smoothing:0,maxDistance:240,
 visibility:true,sticky:true,priority:'threat',prediction:true,predictionMs:65,trigger:true,recoil:true,
 tactical:true,dodge:true,dodgeRange:55,autoPeek:true,pathfinding:true,autoReload:true,autoSwitch:true,
 autoArmor:true,autoLoot:true,lootRange:95,brAggression:80,brLeadSeconds:32,recordMatches:captureDecisions,autoSkills:autoSkillsEnabled,weaponTactics:true,
 proMovement:true,macroTargetCommitment:true,fastAim:true,adaptiveADS:true,smartCover:true,cameraTactics:true,reloadCover:true,peekLongDelay:true};
const profiles={baseline:{macroTargetCommitment:false},aggressive:{autoPeek:false,brAggression:95,zombieSpacing:16},
 survival:{autoPeek:true,brAggression:40,zombieSpacing:28,dodgeRange:72},
 balanced:{autoPeek:true,brAggression:65,zombieSpacing:24,dodgeRange:65},
 'legacy-peek':{adaptivePeek:false}, 'combat-first':{adaptivePeek:true}, 'squad-experiment':{teamFlankExperiment:true},'aim-0':{predictionMs:0},'aim-30':{predictionMs:30},'aim-100':{predictionMs:100},'aim-geom':{aimLagGeometry:true},'legacy-aim':{lagCompensatedAim:false},
 'sightline-lab':{combatSightline:true},'dodge-lab':{combatDodgeCommit:true},
 'combined-lab':{combatSightline:true,combatDodgeCommit:true},
 'steer-650':{reverseHoldMs:650},'steer-900':{reverseHoldMs:900},'route-lab':{routeCommitment:true},'strafe-lab':{exposureAwareStrafe:true},'route-strafe':{routeCommitment:true,exposureAwareStrafe:true},'evade-lab':{routeCommitment:true,predictiveEvasion:true,dodgeRange:75},'cover-lab':{routeCommitment:true,combatCoverPressure:true,dodgeRange:75},'cover-evasion-lab':{routeCommitment:true,combatCoverPressure:true,predictiveEvasion:true,dodgeRange:75},'stance-lab':{routeCommitment:true,stanceMixup:true},'stance-cover-lab':{routeCommitment:true,stanceMixup:true,combatCoverPressure:true,dodgeRange:75},'stance-all-lab':{routeCommitment:true,stanceMixup:true,combatCoverPressure:true,predictiveEvasion:true,dodgeRange:75},'sprint-cover-lab':{routeCommitment:true,combatCoverPressure:true,sprintEvasion:true,dodgeRange:75},'sprint-all-lab':{routeCommitment:true,combatCoverPressure:true,predictiveEvasion:true,sprintEvasion:true,dodgeRange:75},'sprint-stance-lab':{routeCommitment:true,combatCoverPressure:true,predictiveEvasion:true,sprintEvasion:true,stanceMixup:true,dodgeRange:75},'preemptive-lab':{routeCommitment:true,preemptiveCover:true,dodgeRange:75},'preemptive-evasion-lab':{routeCommitment:true,preemptiveCover:true,predictiveEvasion:true,dodgeRange:75},'occluded-pursuit-lab':{occludedPursuitLab:true},'peek-cache-lab':{peekCacheLab:true},'macro-routing-lab':{macroRoutingLab:true},'macro-target-lab':{macroTargetLab:true},'macro-actuation-lab':{macroActuationLab:true},'legacy-ads':{adaptiveADS:false},'release':{},'macro-combat-lab':{macroCombat2:true},'macro-vantage-lab':{macroCombat2:true,macroVantageLab:true},'macro-temporal-lab':{macroCombat2:true,macroVantageLab:true,macroTemporalLab:true},'macro-ownership-lab':{macroCombat2:true,macroOwnershipLab:true},'macro-options-shadow-lab':{macroCombat2:true,macroOptionsShadow:true},'macro-options-active-lab':{macroCombat2:true,macroOptionsActive:true},'goal-aware-shadow-lab':{macroCombat2:true,macroOptionsShadow:true,goalAwareShadow:true},'goal-aware-active-lab':{macroCombat2:true,macroOptionsShadow:true,goalAwareActive:true},'macro-covered-lab':{macroCombat2:true,macroCoverApproach:true},'director-shadow-lab':{tacticalDirectorShadow:true},'director-active-lab':{macroOptionsShadow:true,tacticalDirectorActive:true},'director-safe-lab':{macroOptionsShadow:true,tacticalDirectorActive:true,tacticalDirectorConservative:true},'director-opportunity-lab':{macroOptionsShadow:true,tacticalDirectorActive:true,tacticalDirectorConservative:true,tacticalDirectorOpportunityGuard:true},'director-engagement-lab':{macroOptionsShadow:true,tacticalDirectorActive:true,tacticalDirectorConservative:true,tacticalDirectorOpportunityGuard:true,tacticalDirectorEngagementWindow:true},'director-engagement-shadow-lab':{macroOptionsShadow:true,tacticalDirectorShadow:true,tacticalDirectorEngagementWindow:true},'director-engagement-trial-lab':{macroOptionsShadow:true,tacticalDirectorActive:true,tacticalDirectorOpportunityGuard:true,tacticalDirectorEngagementWindow:true,tacticalDirectorEngagementTrial:true},'director-engagement-probe-lab':{macroOptionsShadow:true,tacticalDirectorActive:true,tacticalDirectorOpportunityGuard:true,tacticalDirectorEngagementWindow:true,tacticalDirectorEngagementProbe:true},'director-engagement-frontier-lab':{macroOptionsShadow:true,tacticalDirectorActive:true,tacticalDirectorOpportunityGuard:true,tacticalDirectorEngagementWindow:true,tacticalDirectorEngagementProbe:true,tacticalDirectorOpportunityExpansion:true},'director-engagement-frontier-shadow-lab':{macroOptionsShadow:true,tacticalDirectorShadow:true,tacticalDirectorEngagementWindow:true,tacticalDirectorOpportunityExpansion:true},'director-engagement-recovery-lab':{macroOptionsShadow:true,tacticalDirectorActive:true,tacticalDirectorOpportunityGuard:true,tacticalDirectorEngagementWindow:true,tacticalDirectorEngagementProbe:true,tacticalDirectorOpportunityExpansion:true,tacticalDirectorEngagementRecovery:true},'director-engagement-coverage-lab':{macroOptionsShadow:true,tacticalDirectorActive:true,tacticalDirectorOpportunityGuard:true,tacticalDirectorEngagementWindow:true,tacticalDirectorEngagementProbe:true,tacticalDirectorOpportunityExpansion:true,tacticalDirectorEngagementRecovery:true,tacticalDirectorShotProbeCoverage:true},
 'director-engagement-exploration-lab':{macroOptionsShadow:true,tacticalDirectorActive:true,tacticalDirectorOpportunityGuard:true,tacticalDirectorEngagementWindow:true,tacticalDirectorEngagementProbe:true,tacticalDirectorOpportunityExpansion:true,tacticalDirectorEngagementRecovery:true,tacticalDirectorShotProbeCoverage:true,tacticalDirectorExplorationLab:true},
 'director-engagement-exploration-all-lab':{macroOptionsShadow:true,tacticalDirectorActive:true,tacticalDirectorOpportunityGuard:true,tacticalDirectorEngagementWindow:true,tacticalDirectorEngagementProbe:true,tacticalDirectorOpportunityExpansion:true,tacticalDirectorEngagementRecovery:true,tacticalDirectorShotProbeCoverage:true,tacticalDirectorExplorationLab:true},
 'director-main-stats-shadow-lab':{macroOptionsShadow:true,tacticalDirectorShadow:true,tacticalDirectorEngagementWindow:true,tacticalDirectorOpportunityExpansion:true,tacticalDirectorShotProbeCoverage:true,tacticalDirectorMainWeaponStatsLab:true},
 'director-main-stats-recovery-lab':{macroOptionsShadow:true,tacticalDirectorActive:true,tacticalDirectorOpportunityGuard:true,tacticalDirectorEngagementWindow:true,tacticalDirectorEngagementProbe:true,tacticalDirectorOpportunityExpansion:true,tacticalDirectorEngagementRecovery:true,tacticalDirectorShotProbeCoverage:true,tacticalDirectorMainWeaponStatsLab:true},
 'director-ballistic-shadow-lab':{macroOptionsShadow:true,tacticalDirectorShadow:true,tacticalDirectorEngagementWindow:true,tacticalDirectorOpportunityExpansion:true,tacticalDirectorShotProbeCoverage:true,tacticalDirectorMainWeaponStatsLab:true,tacticalDirectorBallisticLab:true},
 'director-ballistic-recovery-lab':{macroOptionsShadow:true,tacticalDirectorActive:true,tacticalDirectorOpportunityGuard:true,tacticalDirectorEngagementWindow:true,tacticalDirectorEngagementProbe:true,tacticalDirectorOpportunityExpansion:true,tacticalDirectorEngagementRecovery:true,tacticalDirectorShotProbeCoverage:true,tacticalDirectorMainWeaponStatsLab:true,tacticalDirectorBallisticLab:true},
 'director-motion-shadow-lab':{macroOptionsShadow:true,tacticalDirectorShadow:true,tacticalDirectorEngagementWindow:true,tacticalDirectorOpportunityExpansion:true,tacticalDirectorShotProbeCoverage:true,tacticalDirectorMainWeaponStatsLab:true,tacticalDirectorBallisticLab:true,tacticalDirectorMotionLab:true},
 'director-motion-recovery-lab':{macroOptionsShadow:true,tacticalDirectorActive:true,tacticalDirectorOpportunityGuard:true,tacticalDirectorEngagementWindow:true,tacticalDirectorEngagementProbe:true,tacticalDirectorOpportunityExpansion:true,tacticalDirectorEngagementRecovery:true,tacticalDirectorShotProbeCoverage:true,tacticalDirectorMainWeaponStatsLab:true,tacticalDirectorBallisticLab:true,tacticalDirectorMotionLab:true},
 'director-engagement-episode-lab':{},
 'director-engagement-episode-control-lab':{},
 'director-engagement-episode-active-lab':{}};
const config={...baseConfig,routeCommitment:false,exposureAwareStrafe:false,...profiles[profile]};
const episodeLab=profile.startsWith('director-engagement-episode-');
const episodeActiveConfig={...baseConfig,routeCommitment:false,exposureAwareStrafe:false,
 ...profiles['director-engagement-exploration-all-lab']};
const episodeControlConfig={...baseConfig,routeCommitment:false,exposureAwareStrafe:false,
 ...profiles.release};
bus.dispatchEvent(new CustomEvent('fpsarena-aim:config',{detail:JSON.stringify(config)}));
async function episode(mode,idx){
 globalThis.__trainMode=mode;
 globalThis.__FPSARENA_HEADLESS_LAB__=true;
 directorOutcomeRecorder=new DirectorOutcomeRecorder({horizonSeconds:5});decisionFeed=[];directorEventCounts={};directorExplorationAssignments=[];directorExplorationAssignmentTotal=0;directorSamples=[];directorAuditTotals={};directorAuditSearches=0;directorFirstVisibleWindowAt=null;directorFirstGeometricWindowAt=null;directorPlanWindows=[];activeDirectorWindow=null;goalEventCounts={};goalEventSamples=[];macroEventCounts={};macroEventSamples=[];macroOptionTotals={};macroOptionTrace=[];macroOptionLoopCandidates=0;macroOptionCycleClasses={};macroOptionCycles=[];macroCurrentOption=null;macroServerOptionStats={};
 const rseed=seed0+idx*101+['tdm','snd','hp','br','zm'].indexOf(mode)*10007;
 const episodeAssignment=episodeLab?tacticalEpisodeExplorationAssignment(rseed,
   profile==='director-engagement-episode-control-lab'?0:
   profile==='director-engagement-episode-active-lab'?1:.5):null;
 if(episodeAssignment){
   episodeAssignment.arm=episodeAssignment.actuate?'treatment':'control';
   episodeAssignment.design=episodeAssignment.actionProbability===0||episodeAssignment.actionProbability===1
     ?'forced-arm-diagnostic':'randomized-episode';
   // Exactly one assignment before Game.step(); no per-offer randomization in C6.
   // Treatment retains the original safe offer gate with probability 1.
   bus.dispatchEvent(new CustomEvent('fpsarena-aim:config',{detail:JSON.stringify(
     episodeAssignment.actuate?episodeActiveConfig:episodeControlConfig)}));
 }
 globalThis.__FPSARENA_EXPLORATION_SEED__=rseed;
 globalThis.__FPSARENA_EXPLORATION_PROBABILITY__=profile==='director-engagement-exploration-all-lab'?1:.5;
 Math.random=seeded(rseed);virtualTime=0;
 const kind=mode==='br'?'br':mode==='zm'?'zm':'classic';
 const world=new ServerGame({to(){return {emit(){}};}},kind);
 world.config={mode,map:mode==='br'?'oilrig':mode==='zm'?'marsh':classicMaps[idx%classicMaps.length],sub:'resurgence'};
 const client=new HeadlessGame();const events=[];const packets=[];let seq=1;
 const c35dRecorder=c35dTracePath?new PublicMacroTransitionRecorderC35D({matchId:`c35d-${world.config.map}-${rseed}`,setupId:c35dSetupId,seed:rseed,seconds}):null;
 const c12Recorder=c12DatasetPath?new MatchEngagementRecorderC12({matchId:`main-${mode}-${rseed}-${profile}`,mode,map:world.config.map,seed:rseed,profile}):null;
 const c14Assignment=(c31DatasetPath||c30DatasetPath||c29DatasetPath||c21DatasetPath||c22DatasetPath||c24DatasetPath)?null:c17DatasetPath?stratifiedAssignmentC17({mode,map:world.config.map,loadout:traineePrimary,seed:rseed,replicate:c17Replicate,experimentSeed:c17ExperimentSeed}):explorationDatasetPath?matchAssignmentC14(rseed,{forcedArm:c14ForcedArm}):null;
 if(c20MatchedSeed&&c14Assignment)c14Assignment.independence='controlled paired simulator forks: SAME game seed across two independently executed arms; pair is the statistical unit';
 const explorationCostNs=[];
 const c14Explorer=c35cDatasetPath?new MacroMicroIntegrationC35C({seed:rseed,mode,map:world.config.map,loadout:traineePrimary,lagMs:snapshotLag*1000,matchId:`c35c-${c35cPolicy}-${world.config.map}-${c35Enemy}-${rseed}-80`,registrationSHA256:c35Registration,policy:c35cPolicy,setupId:c35cSetupId}):c35bDatasetPath?new MicroActionReliabilityC35B({seed:rseed,mode,map:world.config.map,loadout:traineePrimary,lagMs:snapshotLag*1000,matchId:`c35b-${world.config.map}-${c35Enemy}-${rseed}-${c35bDoseMs}`,registrationSHA256:c35Registration,doseMs:c35bDoseMs}):c35DatasetPath?new RandomizedSafeActionC35({seed:rseed,mode,map:world.config.map,loadout:traineePrimary,lagMs:snapshotLag*1000,matchId:`c35-${world.config.map}-${c35EnemyPrimary}-${rseed}`,registrationSHA256:c35RegistrationSHA256}):c31DatasetPath?new ResearchPolicyC31({seed:rseed,mode,map:world.config.map,loadout:traineePrimary,policy:c31Policy,model:c30Frozen,lagMs:snapshotLag*1000,enemyPrimary}):c30DatasetPath?new ResearchPolicyC30({seed:rseed,mode,map:world.config.map,loadout:traineePrimary,policy:c30Policy,model:c30Frozen,lagMs:snapshotLag*1000}):c29DatasetPath?new ResearchPolicyC29({seed:rseed,mode,map:world.config.map,loadout:traineePrimary,policy:c29Policy,model:c29Frozen,lagMs:snapshotLag*1000}):(c22DatasetPath||c24DatasetPath)?new RiskAwareRandomizerC22({seed:rseed,mode,map:world.config.map,loadout:traineePrimary}):c21DatasetPath?new EncounterRandomizerC21({seed:rseed,mode,map:world.config.map,loadout:traineePrimary}):c14Assignment?new (c17DatasetPath||c16DatasetPath?SafeActionExplorerC16:c15DatasetPath?SafeActionExplorerC15:SafeActionExplorerC14)({seed:rseed,mode,map:world.config.map,loadout:traineePrimary,assignment:c14Assignment}):null;
 const c24Threat=(c24DatasetPath||c25DatasetPath)?new ThreatTraceObserverC24():null;
 const c25Calibration=c25DatasetPath?new ThreatCalibrationObserverC25():null;
 const c34Observer=c34DatasetPath?new RealEncounterObserverC34({seed:rseed,map:world.config.map,loadout:traineePrimary,lagMs:snapshotLag*1000}):null;
 const c13Recorder=c13DatasetPath?new EncounterPolicyRecorderC13({matchId:`main-${mode}-${rseed}-${profile}`,mode,map:world.config.map,seed:rseed,profile}):null;
 const trace=[];const traceEvents=[];const tickDurations=[];
 const metrics={mode,seed:rseed,profile,directorEpisodeAssignment:episodeAssignment,opponentPolicy,seconds,primaryLoadout:traineePrimary,skillLoadout:traineeSkill,throwLoadout:traineeThrow,skillCommands:0,skillsActivated:0,skillEvents:{},gameCode:'authoritative-server',agentCode:'bundled-page-agent',
  firstShotAt:null,firstHitAt:null,shots:0,hits:0,headHits:0,adsShots:0,hipShots:0,adsTicks:0,hipCombatTicks:0,throwablesUsed:0,throwableTypes:{},receivedShots:0,aimedEnemyShots:0,enemyHitShots:0,enemyShotDodgeRate:null,damageDealt:0,damageTaken:0,deathCount:0,
  ownKills:0,zombieKills:0,distance:0,reversals:0,worldTurns:0,worldReversals:0,routeSamples:0,activeTicks:0,fireInputTicks:0,
  lootInteractions:0,ringDamage:0,reloads:0,switches:0,allyKills:0,teamNearbyTicks:0,crossfireTicks:0,objectiveTicks:0,ringOutsideTicks:0,errors:0,glideTicks:0,heliTicks:0};
 const aimedShotKeys=new Set(), hitShotKeys=new Set();
 const markServer=(field,value=1)=>{
   const id=macroCurrentOption?.id;
   if(!id)return;
   const stat=macroServerOptionStats[id]||
     (macroServerOptionStats[id]={type:macroCurrentOption.type,targetId:macroCurrentOption.targetId,
       shots:0,hits:0,kills:0,damageDealt:0});
   stat[field]=(stat[field]||0)+value;
 };
 const peerSocket={id:'trainee',emit(type,data){
   // Server snapshot and loot events follow client pipeline, delayed for network-like observation.
   directorOutcomeRecorder.serverEvent(virtualTime,type,data);
   c12Recorder?.serverEvent(world.now,world.tick,type,data);
   c13Recorder?.serverEvent(world.now,type,data);
   c14Explorer?.serverEvent(world.now,type,data);
   if(type==='shot')packets.push({at:virtualTime+snapshotLag,type,data});
   if(c24Threat&&type==='shot'&&data?.id!=='trainee'){
     const shooter=world.players.get(data?.id);
     const hostile=!!(shooter&&world.hostile(shooter,trainee));
     c24Threat.serverShot(world.now,data,{x:trainee.x,y:trainee.y,z:trainee.z},hostile,c14Explorer);
     if(hostile&&c25Calibration)c25Calibration.serverShot(world.now,((tracerProximityC24(data,{x:trainee.x,y:trainee.y,z:trainee.z})??Infinity)<=C24_NEAR_TRACER_METERS));
   }
   if(type==='snap'||type==='ents')packets.push({at:virtualTime+snapshotLag+(Math.random()-.5)*snapshotLag*.35,type,data});
   if(type==='skill'){metrics.skillsActivated++;metrics.skillEvents[data?.id]=(metrics.skillEvents[data?.id]||0)+1;}
   if(type==='throw'){metrics.throwablesUsed++;const id=data?.kind||'unknown';metrics.throwableTypes[id]=(metrics.throwableTypes[id]||0)+1;}
   if(type==='shot'&&data?.id==='trainee'){if(activeDirectorWindow)activeDirectorWindow.shotsDuring++;markServer('shots');if(metrics.firstShotAt===null)metrics.firstShotAt=+virtualTime.toFixed(3);metrics.shots++;if(trainee?.aim)metrics.adsShots++;else metrics.hipShots++;if(replayPath)traceEvents.push({t:+virtualTime.toFixed(2),type:'own-fire',data:{w:data.w}});}
   if(type==='shot'&&data?.id!=='trainee'){
     metrics.receivedShots++;
     const shooter=world.players.get(data?.id);
     if(shooter?.bot && trainee?.alive && world.hostile(shooter,trainee)){
       const nearest=shooter.bot.nearest(shooter,shooter.bot.enemies(shooter));
       if(nearest?.o===trainee)aimedShotKeys.add(`${world.tick}|${shooter.id}`);
     }
   }
   if(type==='hit'){if(activeDirectorWindow)activeDirectorWindow.hitsDuring++;if(metrics.firstHitAt===null)metrics.firstHitAt=+virtualTime.toFixed(3);markServer('hits');markServer('damageDealt',Number(data?.dmg||0));metrics.hits++;if(data?.head)metrics.headHits++;metrics.damageDealt+=Number(data?.dmg||0);
     if(replayPath)traceEvents.push({t:+virtualTime.toFixed(2),type:'hit',data:{head:!!data?.head,dmg:data?.dmg,kill:!!data?.kill}});}
   if(type==='dmg'){if(activeDirectorWindow)activeDirectorWindow.damageTakenDuring+=Number(data?.h||0)+Number(data?.a||0);metrics.damageTaken+=Number(data?.h||0)+Number(data?.a||0);
     if(replayPath)traceEvents.push({t:+virtualTime.toFixed(2),type:'damage',data:{hp:data?.h,armor:data?.a}});}
   if(type==='kill'){if(activeDirectorWindow&&data?.k==='trainee')activeDirectorWindow.killsDuring++;if(data?.k==='trainee')markServer('kills');if(allied.includes(data?.k))metrics.allyKills++;if(data?.k==='trainee')metrics.ownKills++;if(data?.v==='trainee')metrics.deathCount++;if(String(data?.v).startsWith('z')&&data?.k==='trainee')metrics.zombieKills++;
     if(replayPath)traceEvents.push({t:+virtualTime.toFixed(2),type:'kill',data:{k:data?.k,v:data?.v,head:!!data?.h}});}
   if(type==='announce'){};
 }};
 const trainee=world.addPlayer(peerSocket,{name:'Extension AI'});
if(mode!=='br'&&mode!=='zm')trainee.setLoadout(traineePrimary,null,null,traineeThrow);
 trainee.nextThrow=traineeThrow;
 // Telemetry-only wrapper: record server-authoritative weapon hits against the
 // trainee, leaving damage, hit detection, weapon stats and bot AI unchanged.
 const originalDamage=world.damage.bind(world);
 world.damage=(victim,attacker,amount,details={})=>{
   const oldHp=victim?.hp,oldArmor=victim?.armor;
   const result=originalDamage(victim,attacker,amount,details);
   if(victim===trainee && attacker?.bot && world.hostile(attacker,trainee) && details.weapon &&
      (victim.hp<oldHp || victim.armor<oldArmor)){
     const key=`${world.tick}|${attacker.id}`;
     hitShotKeys.add(key);
     const received=Math.max(0,oldHp-victim.hp)+Math.max(0,oldArmor-victim.armor);
     c24Threat?.serverWeaponHit(world.now,received,c14Explorer);
     c25Calibration?.serverWeaponHit(world.now,received);
     c34Observer?.serverWeaponHit(world.now,received);
     if(c35Any)c14Explorer.hostileWeaponHit(world.now,received);
   }
   return result;
 };
 if(traineeSkill!=='random')trainee.nextSkill=traineeSkill;
 // Built-in bots run with their unmodified BotBrain.think() and the same authoritative step.
 if(mode!=='zm')for(let i=0;i<botCount;i++){
   const bot=world.addBot();if(!bot)break;
   // C31-only: give each server BotBrain a controlled primary before the match.
   // This affects every bot, on either team. There is no weapon substitution in production.
   if(c31DatasetPath&&!bot.setLoadout(enemyPrimary,null,null,null))throw Error('C31 enemy loadout could not be assigned');
   if(c34DatasetPath&&!bot.setLoadout(c34EnemyPrimary,null,null,null))throw Error('C34 enemy loadout could not be assigned');
   if(c35Any&&!bot.setLoadout(c35Enemy,null,null,null))throw Error('C35 enemy loadout could not be assigned');
   // Optional stress actors still navigate using BotBrain and can use extra
   // lean/ADS/stance/throw/skill actions through the official server validator.
   if(opponentPolicy==='stress'||(opponentPolicy==='mixed'&&i%2===1))
     bot.bot=new UnrestrictedOpponent(world,{personality:i%3?'mobile':'support'});
   // Team assignment is left to Game.addBot(), not force-balanced opponent limitations.
 }
 const allied=[];
 for(const p of world.players.values())if(p.bot&&p.team===trainee.team)allied.push(p.id);
 world.startMatch();
 // Public game map geometry is also loaded by the real browser client.
 // Keep client raycast / cover routing aligned with the actual arena instead
 // of the headless adapter's empty placeholder map.
 client.map=world.map;
 metrics.mapGeometryBoxes=world.map?.boxes?.length||0;
 // BR helidrop: this is an optional environmental bootstrap. It does not alter opponents.
 // The real extension's client-side action decides the helicopter exit; if it stalls, record it.
 let last={x:trainee.x,z:trainee.z},lastAxis=null,lastWorldHeading=null,lastWorldHeadingAt=-Infinity,prevSlot=trainee.ws.slot,prevR=false;
 // --full-match runs until the authoritative server leaves match phase.
 // A 10-minute guard prevents hangs in modes lacking a natural terminal state.
 const atMost=Math.ceil((fullMatch?Math.max(seconds,600):seconds)/DT);
 for(let n=0;n<atMost;n++){
   virtualTime=world.now;
   // Process observable server packets in order; never let the trainee read authoritative enemy state directly.
   for(let k=0;k<packets.length;){const item=packets[k];if(item.at>virtualTime){k++;continue;}
     packets.splice(k,1);
     if(item.type==='snap')client.onSnap(item.data);
     else if(item.type==='ents')client.onEnts(item.data);
     else if(item.type==='shot'){c24Threat?.observeDeliveredShot(virtualTime,item.data,client.pos);client.onShot(item.data);}
   }
   // Synchronize local *predicted* state only; remote state remains delayed snapshots.
   if(trainee.spawned){
     client.local.alive=trainee.alive&&!trainee.down;client.local.down=trainee.down;
     client.local.mv={...trainee};client.local.ws=trainee.ws;
     client.local.weapon=WEAPONS[trainee.ws?.guns?.[trainee.ws?.slot]?.id]||WEAPONS.fists;
     client.local.hp=trainee.hp;client.local.armor=trainee.armor;client.local.plates=trainee.plates;
     client.local.maxArmor=trainee.maxArmor;client.local.frozen=trainee.frozen;
     client.pos={x:trainee.x,y:trainee.y,z:trainee.z};
     // BR / zombie on authoritative game can have state before first snapshot.
     client.modeState=client.modeState||{type:mode};
   }
   if(c25Calibration)c25Calibration.beforeClientStep(virtualTime,c24Threat.publicCueAt(virtualTime),{
     alive:!!client.local.alive,healthFraction:Math.max(0,Math.min(1,Number(client.local.hp??0)/100)),
     armorFraction:Math.max(0,Math.min(1,Number(client.local.armor??0)/Math.max(1,Number(client.local.maxArmor??100))))});
   client.frame(DT,true,false);const tickStart=profileAgent?process.hrtime.bigint():0n;const cmd=client.simTick()||client.sampled||{};
   if(profileAgent)tickDurations.push(Number(process.hrtime.bigint()-tickStart)/1e6);
   // C35-D passive recorder sees only original public command before intervention/Game.step.
   c35dRecorder?.observe(virtualTime*1000,cmd);
   if(trainee.alive){
     if(cmd.aim)metrics.adsTicks++;else if(cmd.fire)metrics.hipCombatTicks++;
     const axis=[!!cmd.forward?1:!!cmd.backward?-1:0,!!cmd.right?1:!!cmd.left?-1:0];
     if(lastAxis&&axis[0]&&lastAxis[0]&&axis[0]===-lastAxis[0])metrics.reversals++;
     lastAxis=axis;
   }
   if(cmd.fire)metrics.fireInputTicks++;
   // Observe selected movement commands separately from server-confirmed shots.
   // Neither metric can by itself identify the counterfactual effect of a plan.
   directorOutcomeRecorder.control(virtualTime,cmd);
   c12Recorder?.observe(virtualTime,client,cmd);
   c13Recorder?.observe(virtualTime,client,cmd);
   // C14 touches ONLY the queued command; recorder above retains the incumbent decision.
   const exploreStart=profileExploration?process.hrtime.bigint():0n;
   const priorC24Offers=c24Threat&&c14Explorer?c14Explorer.offers.length:0;
   const beforeC31Offers=c31DatasetPath?c14Explorer.offers.length:0;
   const c34ID=c34Observer?.preDecision(virtualTime,client,cmd);
   const c14Cmd=c14Explorer?c14Explorer.command(virtualTime,client,cmd):cmd;
   c34Observer?.postDecision(c34ID,world,trainee,c14Cmd);
   if(c35Any)c14Explorer.afterCommand(virtualTime,world,trainee,c14Cmd);
   if(c31DatasetPath&&c14Explorer.offers.length>beforeC31Offers){
     const offer=c14Explorer.offers.at(-1),pub=offer.c31?.publicEnemyId;
     const enemy=pub?world.players.get(pub):null;
     // Server-private truth is attached AFTER action selection, never in inputs.
     offer.c31.serverWeaponAfterDecision=enemy?.ws?.guns?.[enemy.ws?.slot]?.id||null;
     offer.c31.truthMatchesPublic=offer.c31.serverWeaponAfterDecision===offer.c31.publicWeapon;
   }
   if(c24Threat&&c14Explorer&&c14Explorer.offers.length>priorC24Offers)c24Threat.attachOffer(c14Explorer.offers.at(-1),virtualTime);
   if(profileExploration)explorationCostNs.push(Number(process.hrtime.bigint()-exploreStart));
   if(activeDirectorWindow?.commandSelected&&cmd.fire)activeDirectorWindow.fireInputTicks++;
   if(cmd.skill)metrics.skillCommands++;
   if(cmd.reload&&!prevR)metrics.reloads++;prevR=!!cmd.reload;
   if(cmd.slot>=0&&cmd.slot!==prevSlot)metrics.switches++;prevSlot=trainee.ws.slot;
   if(cmd.use)metrics.lootInteractions++;
   if(n%6===0 && trainee.alive && mode!=='zm'){
     const alliesNow=[...world.players.values()].filter(q=>q.alive&&q!==trainee&&q.team===trainee.team);
     const nearby=alliesNow.filter(q=>Math.hypot(q.x-trainee.x,q.z-trainee.z)<22);
     if(nearby.length)metrics.teamNearbyTicks++;
     if(nearby.length && [...world.players.values()].some(e=>e.alive&&world.hostile(trainee,e)&&
       Math.hypot(e.x-trainee.x,e.z-trainee.z)<65&&nearby.some(a=>
         Math.hypot(e.x-a.x,e.z-a.z)<65 && Math.abs((trainee.x-e.x)*(a.z-e.z)-(trainee.z-e.z)*(a.x-e.x))>90)))
       metrics.crossfireTicks++;
     const m=world.mode;
     if(mode==='hp'&&m.zone&&Math.hypot(trainee.x-m.zone.x,trainee.z-m.zone.z)<8)metrics.objectiveTicks++;
     if(mode==='br'&&m.ring&&Math.hypot(trainee.x-m.ring.cx,trainee.z-m.ring.cz)>m.ring.r)metrics.ringOutsideTicks++;
   }
   if(replayPath&&world.tick%30===0)trace.push({
     t:+world.now.toFixed(2),p:[+trainee.x.toFixed(2),+trainee.y.toFixed(2),+trainee.z.toFixed(2)],
     dir:[+client.rig.yaw.toFixed(3),+client.rig.pitch.toFixed(3)],
     hp:+trainee.hp.toFixed(1),armor:+trainee.armor.toFixed(1),alive:!!trainee.alive,
     ws:{slot:trainee.ws?.slot,reloading:!!trainee.ws?.reloading,guns:trainee.ws?.guns?.map(g=>({id:g.id,mag:g.mag,reserve:g.reserve}))},
     actions:cmd,target:null,decision:{reason:(captureDecisions&&decisionFeed.at(-1)?.reason)||'authoritative-room',loot:'',dodge:false,ring:false,weaponScore:null},
     enemies:[...world.players.values()].filter(q=>q!==trainee&&q.alive).map(q=>({id:q.id,pos:[q.x,q.y,q.z],yaw:q.yaw,pitch:q.pitch,weapon:q.ws?.guns?.[q.ws?.slot]?.id})),
     zombies:(world.mode?.zombies||[]).map(z=>({id:z.id,pos:[z.x,z.y,z.z],yaw:z.yaw,hp:z.hp})),
     crates:(world.mode?.loot?.crates||[]).filter(c=>!c.open).map(c=>({id:c.id,pos:[c.x,c.y,c.z],rar:c.rar})),
     ring:world.mode?.ring||null
   });
   if(trainee.heli)metrics.heliTicks++;if(trainee.air)metrics.glideTicks++;
   // Use exactly the official queue/validator and fixed-tick processInput(), not direct movement.
   world.queueInput(trainee,{...c14Cmd,seq:seq++,ep:trainee.epoch,
      yaw:client.rig.yaw,pitch:client.rig.pitch,lt:Math.max(0,world.now-snapshotLag)});
   world.step();
   // Measure actual displacement turns as a counterpart to input-key flips.
   // Looking backward while strafing forward can flip the WASD *key* without
   // reversing the player's world-space travel. Require meaningful movement.
   const deltaX=trainee.x-last.x,deltaZ=trainee.z-last.z,delta=Math.hypot(deltaX,deltaZ);
   metrics.distance+=delta;last={x:trainee.x,z:trainee.z};
   directorOutcomeRecorder.displacement(virtualTime,delta);
   if(activeDirectorWindow?.commandSelected)activeDirectorWindow.metersMovedDuring+=delta;
   if(delta>.045 && trainee.alive && !trainee.heli && !trainee.air){
     const heading={x:deltaX/delta,z:deltaZ/delta};
     if(lastWorldHeading && world.now-lastWorldHeadingAt<.6){
       const dot=heading.x*lastWorldHeading.x+heading.z*lastWorldHeading.z;
       if(dot<.15)metrics.worldTurns++;
       if(dot<-.65)metrics.worldReversals++;
     }
     lastWorldHeading=heading;lastWorldHeadingAt=world.now;
   }
   if(world.phase==='match')metrics.activeTicks++;
   if(world.phase!=='match')break;
 }
 // Union of shots deliberately aimed at the trainee and stray shots that
 // genuinely hit them. Every damaging shot must appear in the denominator.
 // This avoids undefined/negative avoidance percentages in sparse engagements.
 metrics.enemyHitShots=hitShotKeys.size;
 metrics.aimedEnemyShots=new Set([...aimedShotKeys,...hitShotKeys]).size;
 metrics.enemyShotDodgeRate=metrics.aimedEnemyShots ?
   +(100*(1-metrics.enemyHitShots/metrics.aimedEnemyShots)).toFixed(2):null;
 metrics.finishedNaturally=world.phase!=='match';metrics.termination=world.phase;
 metrics.c19NaturalTrial=c19Natural?{requested:true,capSeconds:600,serverTerminal:world.phase!=='match',rightCensored:world.phase==='match',rule:'TDM first team to 50 kills'}:null;
 metrics.c20MatchedSeedTrial=c20MatchedSeed?{requested:true,design:'controlled-paired-simulator-forks',pairSeed:rseed,arm:c14Assignment?.arm,replicate:c17Replicate}:null;
 metrics.duration=+world.now.toFixed(2);metrics.distance=+metrics.distance.toFixed(2);
 metrics.finalHp=+trainee.hp.toFixed(1);metrics.finalArmor=+trainee.armor.toFixed(1);
 metrics.alive=!!trainee.alive;metrics.kills=trainee.kills;metrics.deaths=trainee.deaths;
 metrics.modeState=world.mode?.state?.();
 metrics.team=trainee.team;metrics.zoneTimeObserved=+(metrics.objectiveTicks/10).toFixed(2);
 metrics.teamObjectiveScore= mode==='hp' ? (world.mode?.scores?.[trainee.team]||0) : null;
 metrics.teamRoundWins=mode==='snd' ? (world.mode?.wins?.[trainee.team]||0) : null;
 metrics.weapon=trainee.ws?.guns?.[trainee.ws.slot]?.id;metrics.equippedSkill=trainee.skill;
 metrics.map=world.config.map;metrics.bots=[...world.players.values()].filter(p=>p.bot).length;
 if(profileAgent){const sorted=[...tickDurations].sort((a,b)=>a-b);const q=x=>sorted[Math.min(sorted.length-1,Math.floor(sorted.length*x))]||0;
   metrics.agentTimingMs={mean:+(sorted.reduce((a,b)=>a+b,0)/Math.max(1,sorted.length)).toFixed(3),p50:+q(.5).toFixed(3),p95:+q(.95).toFixed(3),p99:+q(.99).toFixed(3),max:+(sorted.at(-1)||0).toFixed(3),spikesAbove16ms:sorted.filter(x=>x>16).length,frames:sorted.length};}
 metrics.allies=allied.length;
 metrics.accuracy=metrics.shots?+(metrics.hits/metrics.shots*100).toFixed(2):null;
 metrics.headshotOfHits=metrics.hits?+(metrics.headHits/metrics.hits*100).toFixed(2):null;
 if(captureDecisions){
   const counts={};for(const item of decisionFeed)counts[item.reason]=(counts[item.reason]||0)+1;
   metrics.decisionHistogram=counts;metrics.recordedDecisionSamples=decisionFeed.length;
 }
 metrics.directorCandidateAudit={searches:directorAuditSearches,...directorAuditTotals};
 metrics.directorExplorationAssignments=directorExplorationAssignments;
 metrics.directorExplorationOffers=directorExplorationAssignmentTotal;
 metrics.directorExplorationDropped=directorExplorationAssignmentTotal-directorExplorationAssignments.length;
 metrics.directorExplorationAssigned=directorExplorationAssignments.filter(x=>x.actuate).length;
 metrics.directorPlanWindows=directorPlanWindows.map(x=>({...x,
   end:x.end??metrics.duration,censored:x.end===null,
   metersMovedDuring:+x.metersMovedDuring.toFixed(3)}));
 metrics.directorPlanSelectionCount=directorPlanWindows.filter(x=>x.commandSelected).length;
 metrics.directorOutcomeWindows=directorOutcomeRecorder.finish(virtualTime);
 metrics.directorOutcomeDropped=directorOutcomeRecorder.dropped;
 metrics.firstGeometricFiringWindowAt=directorFirstGeometricWindowAt===null?null:+directorFirstGeometricWindowAt.toFixed(3);
 metrics.firstShotAfterGeometricWindowSeconds=directorFirstGeometricWindowAt!==null&&metrics.firstShotAt!==null&&metrics.firstShotAt>=directorFirstGeometricWindowAt
  ?+(metrics.firstShotAt-directorFirstGeometricWindowAt).toFixed(3):null;
 metrics.firstVisibleFiringWindowAt=directorFirstVisibleWindowAt===null?null:+directorFirstVisibleWindowAt.toFixed(3);
 metrics.firstShotAfterWindowSeconds=directorFirstVisibleWindowAt!==null&&metrics.firstShotAt!==null&&metrics.firstShotAt>=directorFirstVisibleWindowAt
  ?+(metrics.firstShotAt-directorFirstVisibleWindowAt).toFixed(3):null;
 metrics.directorExplorationOffers=directorExplorationAssignmentTotal;
 metrics.directorDiagnosticCounts={...directorEventCounts};metrics.directorDiagnosticSamples=directorSamples.slice(0,100);metrics.goalDiagnosticCounts={...goalEventCounts};metrics.goalDiagnosticSamples=goalEventSamples.slice(0,250);metrics.macroDiagnosticCounts={...macroEventCounts};metrics.macroDiagnosticExamples=macroEventSamples.slice(0,24);metrics.macroOptionTotals=structuredClone(macroOptionTotals);metrics.macroOptionLoopCandidates=macroOptionLoopCandidates;metrics.macroOptionCycleClasses={...macroOptionCycleClasses};metrics.macroOptionCycles=macroOptionCycles;metrics.macroOptionTrace=macroOptionTrace;
 const serverTotals={};for(const v of Object.values(macroServerOptionStats)){
   const o=serverTotals[v.type]||(serverTotals[v.type]={shots:0,hits:0,kills:0,damageDealt:0});
   o.shots+=v.shots;o.hits+=v.hits;o.kills+=v.kills;o.damageDealt+=v.damageDealt;
 }
 metrics.macroOptionServerTotals=serverTotals;
 metrics.macroOptionServerEventAttributed={shots:Object.values(macroServerOptionStats).reduce((n,v)=>n+v.shots,0),
   hits:Object.values(macroServerOptionStats).reduce((n,v)=>n+v.hits,0),
   kills:Object.values(macroServerOptionStats).reduce((n,v)=>n+v.kills,0)};
 metrics.errors=agentErrors.length;
 if(agentErrors.length)metrics.errorMessages=agentErrors.slice(-6);
 metrics.score=trainee.score;
 metrics.teamNearbyRate=metrics.activeTicks?+(100*metrics.teamNearbyTicks*6/metrics.activeTicks).toFixed(1):0;
 metrics.crossfireRate=metrics.activeTicks?+(100*metrics.crossfireTicks*6/metrics.activeTicks).toFixed(1):0;
 if(c34Observer){const rec=c34Observer.finish(world.now);c34Matches.push(rec);metrics.c34={...rec.diagnostics,observationOnly:true,controlledEnemyPrimary:c34EnemyPrimary};}
 if(c12Recorder)c12Matches.push(c12Recorder.finish());
 if(c13Recorder)c13Matches.push(c13Recorder.finish(world.now));
 if(c25Calibration){const finished=c25Calibration.finish(world.now);c25Matches.push({schema:finished.schema,
   metadata:{seed:rseed,mode,map:world.config.map,loadout:traineePrimary,seconds,profile,producer:'headless-simulator',
    productionActuation:false,observerOnly:true,snapshotLagMs:snapshotLag*1000},
   ...Object.fromEntries(Object.entries(finished).filter(([k])=>k!=='schema'))});
   metrics.c25={windows:finished.windows.length,complete:finished.windows.filter(w=>w.complete).length,events:finished.events};}
 if(c14Explorer){const record=c14Explorer.finish(world.now);c14Matches.push(record);
   metrics.c14={assignment:c14Assignment,diagnostics:record.diagnostics};
   if(c31DatasetPath)metrics.c31={policy:c31Policy,enemyPrimary,diagnostics:record.diagnostics.c31,modelSourceSHA256:c30Frozen.modelSourceSHA256};
   if(c30DatasetPath)metrics.c30={policy:c30Policy,diagnostics:record.diagnostics.c30,modelSourceSHA256:c30Frozen.modelSourceSHA256};
   if(c29DatasetPath)metrics.c29={policy:c29Policy,diagnostics:record.diagnostics.c29,modelSourceSHA256:c29Frozen.sourceSHA256};
   if(c24Threat){record.schema='fpsarena-c24-threat-match-v1';record.metadata.design+='; C24 telemetry-only public shot cues vs server-confirmed incoming threats';record.metadata.threatLabelsAfterAssignmentOnly=true;record.diagnostics.threatTrace=c24Threat.finish();metrics.c24={diagnostics:record.diagnostics.threatTrace};}
   if(c22DatasetPath)metrics.c22={design:record.metadata.design,diagnostics:record.diagnostics};
   if(c21DatasetPath)metrics.c21={design:record.metadata.design,diagnostics:record.diagnostics};
   if(c35Any)metrics.c35={design:record.metadata.design,diagnostics:record.diagnostics,enemyPrimary:c35Enemy};
   if(profileExploration){
    const sorted=[...explorationCostNs].sort((a,b)=>a-b),n=sorted.length;
    const quantile=p=>n?+(sorted[Math.min(n-1,Math.floor((n-1)*p))]/1e6).toFixed(6):null;
    metrics.explorationProfiler={calls:n,totalMs:+(explorationCostNs.reduce((a,b)=>a+b,0)/1e6).toFixed(4),
      meanMs:n?+(explorationCostNs.reduce((a,b)=>a+b,0)/n/1e6).toFixed(6):null,
      p50Ms:quantile(.5),p95Ms:quantile(.95),p99Ms:quantile(.99),maxMs:quantile(1),
      sampleUnit:'wall-clock process.hrtime.bigint, explorer.command only',
      instrumented:true};
   }}
 if(c35dRecorder)c35dTraces.push(c35dRecorder.finish());
 if(replayPath)replayRecords.push({matchId:`sim-${mode}-${rseed}`,meta:{mode,map:world.config.map,format:'fpsarena-match-telemetry-v1',source:'authoritative-headless-room',profile,seed:rseed},startedAt:Date.now(),endedAt:Date.now()+Math.round(world.now*1000),samples:trace,events:traceEvents});
 return metrics;
}
const results=[];
try{
 for(const mode of modes)for(let ep=0;ep<episodes;ep++){
   agentErrors=[];
   const r=await episode(mode,ep);
   results.push(r);
   console.log(`${mode} seed=${r.seed} ${r.duration}s ${r.kills} kills ${r.shots} shots ${r.hits} hits ${r.headHits} head ${r.distance}m ${r.alive?'alive':'dead'} err=${r.errors}`);
 }
}finally{Math.random=savedRandom;}
const total=(field)=>results.reduce((s,r)=>s+(r[field]||0),0);
const output={format:'fpsarena-authoritative-training-v1',created:new Date().toISOString(),seed:seed0,episodes,seconds,
 modeSelection:modes,classicMaps,traineePrimary,profile,opponentPolicy,zombiePose,traineeSkill,autoSkillsEnabled,fullMatch,snapshotLagMs:snapshotLag*1000,opponentPolicyDescription:'Game.addBot => BotBrain.think; no key restrictions, all engine capabilities remain available',
 knownLimits:['Headless client surface: no Three.js renderer','Network snapshots delayed without real browser interpolation','No real human opponents, variable packet loss or server hosting latency','Aim profile comparison is not proof of performance on human opponents'],
 aggregate:{rounds:results.length,shots:total('shots'),hits:total('hits'),headHits:total('headHits'),kills:total('kills'),deaths:total('deaths'),
 accuracy:total('shots')?+(100*total('hits')/total('shots')).toFixed(2):null,
 headshotOfHits:total('hits')?+(100*total('headHits')/total('hits')).toFixed(2):null,
 meters:total('distance'),reversals:total('reversals'),worldTurns:total('worldTurns'),worldReversals:total('worldReversals'),skillCommands:total('skillCommands'),skillsActivated:total('skillsActivated'),agentErrors:total('errors'),aimedEnemyShots:total('aimedEnemyShots'),enemyHitShots:total('enemyHitShots'),enemyShotDodgeRate:total('aimedEnemyShots')?+(100*(1-total('enemyHitShots')/total('aimedEnemyShots'))).toFixed(2):null},results};
mkdirSync(path.dirname(outPath),{recursive:true});writeFileSync(outPath,JSON.stringify(output,null,2)+'\n');
if(c35dTracePath){const dest=path.resolve(c35dTracePath);mkdirSync(path.dirname(dest),{recursive:true});
 writeFileSync(dest,JSON.stringify({schema:'fpsarena-c35d-passive-public-traces-v1',engine:'authoritative-Game.step',
  scope:'public original incumbent commands only; future public priority is postdecision label',traces:c35dTraces},null,2)+'\n');
 console.log('Saved C35-D passive traces '+dest);}
if(explorationDatasetPath){const dest=path.resolve(explorationDatasetPath);mkdirSync(path.dirname(dest),{recursive:true});
 writeFileSync(dest,JSON.stringify({schema:c35cDatasetPath?'fpsarena-c35c-prospective-arbitration-dataset-v1':c35bDatasetPath?'fpsarena-c35b-reliability-dataset-v1':c35DatasetPath?'fpsarena-c35-randomized-safe-action-dataset-v1':c31DatasetPath?'fpsarena-c31-controlled-enemy-weapon-dataset-v1':c30DatasetPath?'fpsarena-c30-full-game-transfer-dataset-v1':c29DatasetPath?'fpsarena-c29-full-game-policy-dataset-v1':c24DatasetPath?'fpsarena-c24-threat-dataset-v1':c22DatasetPath?'fpsarena-c22-risk-aware-dataset-v1':c21DatasetPath?'fpsarena-c21-encounter-randomized-dataset-v1':c17DatasetPath?'fpsarena-c17-stratified-match-dataset-v1':c16DatasetPath?'fpsarena-c16-randomized-match-dataset-v1':c15DatasetPath?'fpsarena-c15-randomized-match-dataset-v1':'fpsarena-c14-randomized-match-dataset-v1',engine:'uploaded-main',
   policy:c35cDatasetPath?`C35C research opt-in ${c35cPolicy}: original C21/C16 + predecision public macro quiet-time heuristic`:c35bDatasetPath?'C35B C21/C16/C35 safe three-arm dose randomized diagnostic, actual server labels':c35DatasetPath?'C35 C21/C16 randomized safe arms plus public C34-style state and real post-action hostile weapon-hit labels':c31DatasetPath?'C31 controlled enemy loadout + frozen C30 model falsification; server weapon truth audit AFTER policy':c30DatasetPath?'C30 research-only public-state transfer value network vs validation-selected simple rule and incumbent':c29DatasetPath?'C29 research-only frozen C28 transferred model vs simple and original; model proxy not proven faithful':c24DatasetPath?'C24 telemetry-only delivered public cue vs server-confirmed hostile shot/trace/hit; unchanged C22 research controller':c22DatasetPath?'C22 research-only risk-audited 3-arm nonoverlapping 0.9/1.8-second server labels':c21DatasetPath?'research-only 3-arm within-match randomized eligible encounter; post-action server labels':'research-only guarded strafe; per-match assignment; no post-step features',matches:c14Matches,controlledEnemyPrimary:c35Any?c35Enemy:null,registrationSHA256:c35Any?c35Registration:null},null,2)+'\n');
 console.log('Saved '+(c35cDatasetPath?'C35C':c35bDatasetPath?'C35B':c35DatasetPath?'C35':c31DatasetPath?'C31':c30DatasetPath?'C30':c29DatasetPath?'C29':c24DatasetPath?'C24':c22DatasetPath?'C22':c21DatasetPath?'C21':c17DatasetPath?'C17':c16DatasetPath?'C16':c15DatasetPath?'C15':'C14')+' dataset '+dest);}
if(c34DatasetPath){const dest=path.resolve(c34DatasetPath);mkdirSync(path.dirname(dest),{recursive:true});
 writeFileSync(dest,JSON.stringify({schema:'fpsarena-c34-real-game-observation-dataset-v1',engine:'uploaded-main',
 policy:'passive recorded public decision-time state + server post-decision audit and outcome; NO alternate-arm counterfactual',controlledEnemyPrimary:c34EnemyPrimary,matches:c34Matches},null,2)+'\n');
 console.log('Saved C34 dataset '+dest);}
if(c25DatasetPath){const dest=path.resolve(c25DatasetPath);mkdirSync(path.dirname(dest),{recursive:true});
 writeFileSync(dest,JSON.stringify({schema:'fpsarena-c25-fixed-grid-dataset-v1',engine:'uploaded-main',
  policy:'C25 observation only; fixed scheduled public snapshots before action and future server weapon-hit labels; NO research action intervention',matches:c25Matches},null,2)+'\n');}
if(c12DatasetPath){const dest=path.resolve(c12DatasetPath);mkdirSync(path.dirname(dest),{recursive:true});
 writeFileSync(dest,JSON.stringify({schema:'fpsarena-c12-match-shot-dataset-v1',
 collectionPolicy:'in-match confirmed shot/hit events; public snapshot features, no private target dynamics; no causal interpretation',
 engine:'uploaded-main',created:new Date().toISOString(),matches:c12Matches},null,2)+'\n');
 console.log('Saved C12 server-shot dataset '+dest);}
if(c13DatasetPath){const dest=path.resolve(c13DatasetPath);mkdirSync(path.dirname(dest),{recursive:true});
 writeFileSync(dest,JSON.stringify({schema:'fpsarena-c13-encounter-dataset-v1',engine:'uploaded-main',
  collectionPolicy:'non-overlapping half-second observations of original autopilot behavior; observational, not causal',
  matches:c13Matches},null,2)+'\n');console.log('Saved C13 encounter dataset '+dest);}
if(replayPath){const rp=path.resolve(replayPath);mkdirSync(path.dirname(rp),{recursive:true});
 writeFileSync(rp,JSON.stringify({format:'fpsarena-record-bundle-v2',exportedAt:new Date().toISOString(),records:replayRecords},null,2)+'\n');
 console.log('Saved replay '+rp);}
console.log('Saved '+outPath);
