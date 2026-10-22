/**
 * FPS Arena per-weapon duel model, computed from the exact public server catalog.
 * This is a bounded positioning heuristic, not measured accuracy or omniscient
 * enemy aim prediction. Hitscan bullets have no flight time, and the enemy can
 * pivot instantly. Always validate geometry before committing to a route.
 */
const duelCap=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
export const duelBands=Object.freeze([5,9,14,22,35,50,70,95,125,165,205,255,320,390]);
export function gunShotEnvelope(w,d,{ads=true,targetArmor=0}={}){
  if(!w || w.unarmed || w.melee || !Array.isArray(w.dmg)||!Number.isFinite(d))
    return {usable:false,reach:0,damage:0,hitChance:0,dps:0,ttk:Infinity,headshotRisk:0};
  const reach=Number.isFinite(w.maxRange)?w.maxRange:200;
  if(d>reach || d<0)return {usable:false,reach,damage:0,hitChance:0,dps:0,ttk:Infinity,headshotRisk:0};
  const [r0,r1]=w.range||[20,60],frac=duelCap((d-r0)/Math.max(.001,r1-r0),0,1);
  const damage=w.dmg[0]+frac*(w.dmg[1]-w.dmg[0]);
  // Angular dispersion is sampled independently by server spreadDir.
  // This is a deliberately softened expectation for moving players; it is
  // NOT a claim that the server uses this particular distribution.
  const spread=Math.max(0,ads?w.spreadAds:w.spreadHip);
  const angularRadius=Math.atan2(.42,Math.max(1,d))*180/Math.PI;
  const probability=duelCap(angularRadius/(angularRadius+spread*.82+.035),.012,.995);
  const pellets=Math.max(1,w.pellets||1);
  const pelletFactor=pellets>1 ? duelCap((w.range?.[0]||5)*1.65/Math.max(2,d),.025,1):1;
  const hitChance=probability*pelletFactor;
  const avgDamage=damage*hitChance*pellets;
  const cadence=(w.burst>1)
    ?Math.max(.035,(w.interval+(w.burst-1)*(w.burstGap||.06))/w.burst)
    :Math.max(.035,w.interval||.12);
  const magazine=w.infinite?Infinity:Math.max(1,w.magSize||1);
  const attempts=Math.ceil((100+Math.max(0,targetArmor))/Math.max(.001,avgDamage));
  const clipTime=attempts>magazine ? (w.reload||((w.shellReload||.5)*(w.magSize||1))):0;
  const adsTime=ads?(w.adsTime||0):0;
  const ttk=adsTime+Math.max(0,attempts-1)*cadence+clipTime;
  // Only snipers with instant head kills get extra threat. Never assume
  // deterministic headshots against a moving opponent.
  const headshotRisk=(w.headMul||1)>=10 ? hitChance*(w.sniper?1:.4):0;
  return {usable:true,reach,damage:avgDamage,hitChance,dps:avgDamage/cadence,
    ttk,headshotRisk,shotsNeeded:attempts,secondsBetweenShots:cadence};
}
const duelThreatMemo=new WeakMap();
export function gunThreatScale(w,d){
  if(!w || !Number.isFinite(d))return d<70?1:.28;
  const bin=Math.max(0,Math.floor(d/6));
  let byBin=duelThreatMemo.get(w);
  if(!byBin){byBin=new Map();duelThreatMemo.set(w,byBin);}
  const cached=byBin.get(bin);
  if(cached!==undefined)return cached;
  // Quantize threat utility, not collision geometry: true 3-D cover and
  // weapon reach remain exact. Keeps tactical-grid scoring cheap at 60 Hz.
  const envelope=gunShotEnvelope(w,d);
  // Secondary weapons are unknown and may be switched; keep a small floor,
  // but a known shotgun 180 m away cannot hit at that range right now.
  if(!envelope.usable)return .04;
  const baseline=gunShotEnvelope({dmg:[26,20],range:[25,60],maxRange:200,
    spreadAds:.18,interval:.085,magSize:32,adsTime:.22},Math.min(200,d));
  const raw=(envelope.dps+envelope.headshotRisk*115)/(baseline.dps+1);
  const value=duelCap(Math.sqrt(raw),.18,2.6);
  if(byBin.size<100)byBin.set(bin,value);
  return value;
}
export function gunDuelPlan(own,opponent,currentDistance,{ownArmor=0,ownHealth=100}={}){
  if(!own||!opponent||!Number.isFinite(currentDistance)||own.melee||own.unarmed || opponent.melee || opponent.unarmed)return null;
  const myRange=own.maxRange||200,enemyRange=opponent.maxRange||200;
  const ownNow=gunShotEnvelope(own,currentDistance,{targetArmor:0}),oppNow=gunShotEnvelope(opponent,currentDistance,{targetArmor:ownArmor});
  // Evaluate spacing on both sides of the distance. The travel penalty stops
  // an LMG from rushing 100 m for a tiny DPS gain. Snipers prioritize cover.
  let best=null;
  const candidates=duelBands.filter(d=>d<=Math.min(390,Math.max(myRange,enemyRange)+8));
  candidates.push(currentDistance);
  for(const d of candidates){
    const a=gunShotEnvelope(own,d),b=gunShotEnvelope(opponent,d,{targetArmor:ownArmor});
    const offense=duelCap(a.dps/(a.dps+35),0,1);
    const defense=duelCap(b.dps/(b.dps+35),0,1);
    const advantage=offense-defense*.9+(a.headshotRisk-b.headshotRisk)*.23;
    const travel=Math.abs(d-currentDistance);
    const exposureCost=(d<currentDistance && oppNow.usable?Math.min(1.6,travel/35)*defense*.48:0);
    const penalty=Math.min(1.4,travel/150)*.18 + exposureCost;
    const score=advantage-penalty;
    if(!best||score>best.score)best={distance:d,score,offense,defense};
  }
  const outranged=currentDistance>myRange && currentDistance<=enemyRange;
  const danger=oppNow.usable && (oppNow.ttk<2.3 || oppNow.headshotRisk>.17);
  const mustClose=outranged || (!ownNow.usable && !oppNow.usable);
  // If an enemy can shoot us from much farther than our *practical* range,
  // treat straight open-field pursuit as an unsafe maneuver even when our
  // own weapon has long theoretical hitscan reach.
  const outgunned=oppNow.usable && oppNow.dps>ownNow.dps*1.45 && oppNow.dps>5;
  let action='hold';
  if(mustClose || best.distance<currentDistance-8)action=outgunned||danger?'approach-covered':'approach';
  else if(best.distance>currentDistance+8)action='extend';
  else if(danger||outgunned)action='cover';
  else action='hold';
  if(danger && currentDistance>30 && action==='approach')action='approach-covered';
  return {action,desiredDistance:best.distance,score:best.score,ourDps:ownNow.dps,
    enemyDps:oppNow.dps,outranged,danger,outgunned,ourMaxRange:myRange,enemyMaxRange:enemyRange};
}
