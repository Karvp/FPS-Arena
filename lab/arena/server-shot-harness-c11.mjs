// C11 real server combat instrumentation, with a *stubbed environment* only.
import {gunStats} from './source-main/shared/attachments.js';
import {makeWeaponState} from './source-main/shared/weaponstate.js';
import {fireWeapon} from './source-main/server/combat.js';
import {estimateEngagementBallistics} from '../../engagement-ballistics.mjs';
import {estimateMotionEngagement} from '../../engagement-motion.mjs';
export function authoritativeShotTrial({weaponId='mp5sd',att='',distance=70,aim=true,
   speed=0,motion='constant',lag=.065,rewind=false,shotCount=128,shotSeed=4001}){
 const w=gunStats(weaponId,att),horizon=lag+.11;
 if(!w||w.melee||w.laser||!Number.isInteger(shotCount)||shotCount<1)throw Error('unsupported weapon or shots');
 const movementScale=motion==='brake'?.25:motion==='reverse'?-.5:1;
 const delta=speed*horizon*movementScale;
 const shooter={id:'shooter',x:0,y:0,z:0,yaw:0,aim,onGround:true,stance:0,lean:0,
  pitch:Math.atan2(1.4*.6-1.6,distance),alive:true,ws:makeWeaponState(weaponId,'makarov',att,'')};
 const target={id:'target',x:delta,y:0,z:-distance,yaw:0,lean:0,stance:0,slideT:0,alive:true,
  history:[{t:1-horizon,x:0,y:0,z:-distance,st:0,s:false,l:0,yaw:0},
   {t:1,x:delta,y:0,z:-distance,st:0,s:false,l:0,yaw:0}]};
 const events=[];let shotEvents=0,hitEvents=0,headEvents=0,totalDamage=0;
 const damageByShot=new Float64Array(shotCount);
 const game={now:1,players:new Map([['shooter',shooter],['target',target]]),mode:null,
  abil:{bodies:[]},streaks:null,hostile:(a,b)=>a!==b,worldBoxes:()=>[],
  emitAll(type,data){if(type==='shot'){shotEvents++;events.push({type:'shot',seq:currentSeq,weapon:data.w});}},
  damage(q,s,dmg,o){if(q===target && s===shooter){hitEvents++;headEvents+=Number(!!o.head);
    totalDamage+=dmg;
    damageByShot[currentSeq-shotSeed]+=dmg;
    events.push({type:'hit',seq:currentSeq,dmg,head:!!o.head});}}
 };
 let currentSeq=0;
 for(let i=0;i<shotCount;i++){
  currentSeq=shotSeed+i;
  fireWeapon(game,shooter,{seq:currentSeq,lt:rewind?1-horizon:1});
 }
 // Distribution is defined over full trigger outcomes, including misses. A
 // pellet/hit callback is NOT an independent shot, especially for shotguns.
 const meanDamage=shotEvents?totalDamage/shotEvents:0;
 let sumSquares=0,maxDamage=0,nonzeroShots=0;
 for(const x of damageByShot){sumSquares+=(x-meanDamage)**2;
  if(x>maxDamage)maxDamage=x;if(x>0)nonzeroShots++;}
 const damageVariance=shotEvents>1?sumSquares/(shotEvents-1):0;
 const damageStdError=Math.sqrt(damageVariance/Math.max(1,shotEvents));
 const publicTarget={point:{x:0,y:0,z:-distance},remote:{buf:[
  {t:.9,x:-speed*.1,z:-distance},{t:1,x:0,z:-distance}]}};
 const predicted=estimateMotionEngagement(w,{x:0,z:0},publicTarget,distance,{samples:96,lagSeconds:lag,responseSeconds:.11,
  aimPoint:'torso'});
 const staticPred=estimateEngagementBallistics(w,distance,{samples:96,aim,aimPoint:'torso'});
 // C10's motion evaluator intentionally assumes ADS, so hip fire uses C9 only.
 const scenarioIndex=['constant','brake','reverse'].indexOf(motion);
 const predDamage=rewind||speed===0||!aim?staticPred.expectedDamagePerTrigger:predicted.scenarios[scenarioIndex].damage;
 const result={weaponId,att,distance,aim,speed,motion,lag,rewind,
  family:`${weaponId}/${aim?'ads':'hip'}/${rewind?'rewind':'current'}`,
  predictedDamage:predDamage,staticDamage:staticPred.expectedDamagePerTrigger,
  c10ScenarioDamage:predicted?.scenarios[scenarioIndex]?.damage??null,
  observedDamage:meanDamage,
  predictedHeadFraction:staticPred.pelletHeadFraction,
  observedDamageStdError:damageStdError,
  observedDamageCI95:[Math.max(0,meanDamage-1.96*damageStdError),meanDamage+1.96*damageStdError],
  nonzeroTriggerCount:nonzeroShots,maxDamagePerTrigger:maxDamage,headMultiplier:w.headMul,
  hitTriggerRate:hitEvents/shotEvents,headTriggerRate:headEvents/shotEvents,
  hitEvents,headEvents,shotEvents,shots:shotEvents,source:'main-server/fireWeapon',
  observedSource:'game.damage',actualDisplacement:rewind?0:delta,
  serverRewindApplied:rewind,shotSeed};
 return {result,events};
}
