#!/usr/bin/env node
// Monte Carlo ADS/hip-fire ray intersection against the *authoritative* server
// body/head volumes and spreadDir. Fixed target pose, no map occlusion and no
// adaptive human aim: results are scenario-specific, not measured PvP accuracy.
import {WEAPONS,damageAt} from '../lab/arena/source/shared/weapons.js';
import {forwardVec,spreadDir,mulberry32,hashSeq,rayAABB,raySphere} from '../lab/arena/source/shared/geometry.js';
import {gunShotEnvelope,gunDuelPlan,duelBands} from '../weapon-duel.mjs';
import {writeFileSync,mkdirSync} from 'node:fs';
const distances=[5,12,25,45,70,100,150,200,275,375];
const weapons=Object.values(WEAPONS).filter(w=>!w.skillWeapon&&!w.unarmed&&!w.melee&&!w.noLoot);
const samples=192;
const prototypes=['m4a1','mpx','l115a3','svt40','m249','benelli_m4','makarov','laser_rifle'];
function sample(w,d,ads=true,imperfect=false){
  if(d>w.maxRange)return {hitPct:0,meanDamage:0,bodyPct:0,headPct:0};
  const eye=[0,1.65,0],aim=[0,1.1,-d],dy=aim[1]-eye[1],pitch=Math.atan2(dy,d);
  let shotsHit=0,allDamage=0,bodyHits=0,headHits=0;
  for(let shot=0;shot<samples;shot++){
    let damage=0;
    const rng=mulberry32(hashSeq(shot+48111,w.id.length));
    // Stress scenario: 65–110 ms apparent motion lag at 4.7 m/s and
    // modest 0.12° angular tracking error, held constant per trigger.
    const targetShift=imperfect?(rng()-.5)*2*.52:0;
    const yawError=imperfect?(rng()-.5)*2*.12*Math.PI/180:0;
    const pitchError=imperfect?(rng()-.5)*2*.12*Math.PI/180:0;
    const base=forwardVec(yawError,pitch+pitchError);
    for(let pellet=0;pellet<(w.pellets||1);pellet++){
      const ray=spreadDir(base,yawError,ads?w.spreadAds:w.spreadHip,mulberry32(hashSeq(shot+1337,pellet)));
      const torso=rayAABB(eye,ray,targetShift-.35,0,-d-.35,targetShift+.35,1.4,-d+.35,w.maxRange);
      const head=raySphere(eye,ray,targetShift,1.62,-d,.24,w.maxRange);
      if(head<Infinity&&head<=torso+.2){damage+=damageAt(w,head)*(w.headMul||1);headHits++;}
      else if(torso<Infinity){damage+=damageAt(w,torso);bodyHits++;}
    }
    if(damage>0)shotsHit++;
    allDamage+=damage;
  }
  return {hitPct:Number((shotsHit/samples*100).toFixed(2)),meanDamage:Number((allDamage/samples).toFixed(2)),
    bodyPct:Number((bodyHits/samples*100).toFixed(2)),headPct:Number((headHits/samples*100).toFixed(2))};
}
const scenarios=[],pairwise=[];
for(const w of weapons){
  const gun={id:w.id,name:w.name,category:w.cat,maxRange:w.maxRange,falloffRange:w.range,magazine:w.magSize,reload:w.reload,interval:w.interval,adsTime:w.adsTime,adsSpread:w.spreadAds,move:w.move,
   engagements:distances.map(d=>({distance:d,ads:sample(w,d,true),hip:sample(w,d,false),trackingStress:sample(w,d,true,true),heuristic:gunShotEnvelope(w,d)}))};
  scenarios.push(gun);
  for(const other of prototypes){
    const op=WEAPONS[other];if(!op)continue;
    for(const d of distances){const tactic=gunDuelPlan(w,op,d,{ownArmor:50});
      if(tactic)pairwise.push({weapon:w.id,against:other,distance:d,action:tactic.action,desiredDistance:tactic.desiredDistance,outranged:tactic.outranged,danger:tactic.danger});
    }
  }
}
const summary={format:'fpsarena-weapon-ray-duel-v1',source:'shared/weapons.js + shared/geometry.js (same math as server/combat.js)',
  simulation:'fixed standing target; 192 deterministic spread samples per gun/distance and ADS/hip modes; additional tracking-stress scenario with approx 0.5m pose displacement and <=0.12 degree angular error; no map wall or server netcode',
  weaponCount:weapons.length,distanceBands:distances,shotsPerScenario:samples,rangeBandCount:weapons.length*distances.length,
  duelDecisionCount:pairwise.length,categories:Object.fromEntries([...new Set(weapons.map(w=>w.cat))].map(cat=>[cat,weapons.filter(w=>w.cat===cat).length])),
  cases:scenarios,pairwise,notes:['Damage/headshot and falloff from authoritative public catalog','Accuracy is simulated spread on a fixed hitbox, NOT empirical player hit rate','Response action is a heuristic evaluated for every named gun; cover still requires physical validation']};
mkdirSync('./reports',{recursive:true});writeFileSync('./reports/WEAPON_DUEL_SIM_V283.json',JSON.stringify(summary,null,1)+'\n');
console.log(JSON.stringify({weaponCount:summary.weaponCount,rangeBandCount:summary.rangeBandCount,duelDecisionCount:summary.duelDecisionCount,categories:summary.categories,examples:scenarios.filter(x=>['m4a1','l115a3','benelli_m4','mpx'].includes(x.id)).map(x=>({id:x.id,range:x.maxRange,hit100:x.engagements.find(y=>y.distance===100).ads.hitPct,hit275:x.engagements.find(y=>y.distance===275).ads.hitPct}))}));
