/**
 * Heuristic weapon-priority evaluator. Used by offline reports and live tactical policy.
 * Inputs are the authoritative shared/weapons.js stats and a declared scenario;
 * all probabilities below are conservative HEURISTICS, not observed hit rates.
 * The primary-first / <=10m sidearm policy still overrides all heuristic scores.
 */
const clamp=(n,a,b)=>Math.min(b,Math.max(a,n));
const finite=(n,fallback)=>Number.isFinite(n)?n:fallback;
const round=(n,p=2)=>Number(n.toFixed(p));
export const WEAPON_SCENARIOS=Object.freeze([
  {id:'classic_point_blank',mode:'tdm',distance:2,enemies:1,targetHp:100,pressure:'high',cover:false},
  {id:'classic_cqb_6m',mode:'tdm',distance:6,enemies:1,targetHp:100,pressure:'high',cover:false},
  {id:'classic_close_10m',mode:'tdm',distance:10,enemies:1,targetHp:100,pressure:'high',cover:false},
  {id:'classic_mid_25m',mode:'tdm',distance:25,enemies:1,targetHp:100,pressure:'medium',cover:true},
  {id:'classic_mid_45m',mode:'tdm',distance:45,enemies:1,targetHp:100,pressure:'medium',cover:true},
  {id:'classic_long_90m',mode:'tdm',distance:90,enemies:1,targetHp:100,pressure:'low',cover:true},
  {id:'classic_sniping_180m',mode:'tdm',distance:180,enemies:1,targetHp:100,pressure:'low',cover:true},
  {id:'classic_low_hp',mode:'tdm',distance:15,enemies:2,targetHp:100,ownHp:22,pressure:'high',cover:false},
  {id:'classic_low_target_hp',mode:'tdm',distance:30,enemies:1,targetHp:30,pressure:'medium',cover:true},
  {id:'classic_two_attackers',mode:'tdm',distance:14,enemies:2,targetHp:100,pressure:'high',cover:false},
  {id:'classic_primary_empty_reserve',mode:'tdm',distance:35,enemies:1,targetHp:100,magazine:0,reserve:90,pressure:'medium',cover:true},
  {id:'classic_primary_dry',mode:'tdm',distance:35,enemies:1,targetHp:100,magazine:0,reserve:0,pressure:'medium',cover:true},
  {id:'classic_one_round',mode:'tdm',distance:30,enemies:1,targetHp:100,magazine:1,reserve:90,pressure:'medium',cover:true},
  {id:'classic_empty_close',mode:'tdm',distance:6,enemies:1,targetHp:100,magazine:0,reserve:90,pressure:'high',cover:false},
  {id:'classic_reload_under_cover',mode:'tdm',distance:65,enemies:1,targetHp:100,magazine:0,reserve:90,pressure:'low',cover:true},
  {id:'classic_wall_blocked',mode:'tdm',distance:25,enemies:1,targetHp:100,pressure:'medium',cover:true,visible:false},
  {id:'zombies_kite_near',mode:'zm',distance:7,enemies:5,targetHp:100,pressure:'high',cover:false},
  {id:'zombies_cluster',mode:'zm',distance:12,enemies:8,targetHp:90,pressure:'high',cover:false},
  {id:'zombies_corridor',mode:'zm',distance:23,enemies:5,targetHp:90,pressure:'medium',cover:true},
  {id:'zombies_open_field',mode:'zm',distance:38,enemies:3,targetHp:90,pressure:'medium',cover:false},
  {id:'zombies_empty_reserve',mode:'zm',distance:18,enemies:5,targetHp:90,magazine:0,reserve:80,pressure:'high',cover:false},
  {id:'zombies_no_ammo',mode:'zm',distance:18,enemies:5,targetHp:90,magazine:0,reserve:0,pressure:'high',cover:false},
  {id:'zombies_crate_run',mode:'zm',distance:26,enemies:4,targetHp:90,pressure:'medium',cover:false,lootObjective:true},
  {id:'br_open_close',mode:'br',distance:9,enemies:1,targetHp:120,pressure:'high',cover:false},
  {id:'br_open_mid',mode:'br',distance:35,enemies:2,targetHp:120,pressure:'medium',cover:false},
  {id:'br_covered_mid',mode:'br',distance:40,enemies:1,targetHp:120,pressure:'medium',cover:true},
  {id:'br_sniper_duel',mode:'br',distance:145,enemies:1,targetHp:120,pressure:'low',cover:true},
  {id:'br_three_party',mode:'br',distance:30,enemies:3,targetHp:120,pressure:'high',cover:false},
  {id:'br_ring_rotation',mode:'br',distance:50,enemies:1,targetHp:120,pressure:'medium',cover:false,ringUrgent:true},
  {id:'br_ring_final_cqb',mode:'br',distance:5,enemies:2,targetHp:120,pressure:'high',cover:false,ringUrgent:true},
  {id:'br_missing_ammo',mode:'br',distance:15,enemies:2,targetHp:120,magazine:0,reserve:0,pressure:'high',cover:false,lootObjective:true},
  {id:'br_armor_low',mode:'br',distance:40,enemies:2,targetHp:120,ownHp:35,pressure:'medium',cover:false},
]);

const damageAt=(w,d)=>{
  const [near,far]=w.dmg||[0,0], [minR,maxR]=w.range||[0,1];
  if(d<=minR)return near;
  if(d>=maxR)return far;
  return near+(far-near)*(d-minR)/Math.max(1,maxR-minR);
};

export function evaluateWeapon(w, scenario) {
  const d=finite(scenario?.distance,20), mode=scenario?.mode??'tdm';
  const count=Math.max(1,Math.floor(finite(scenario?.enemies,1)));
  const eligible=!!w && !w.unarmed && !w.melee && !w.skillWeapon && !w.noLoot;
  const base={weaponId:w?.id??null,scenarioId:scenario?.id??null,category:w?.cat??null,eligible};
  if(!eligible)return {...base,score:0,action:'excluded',timeToKill:null,estimatedHitFraction:0,reason:'not a normal lootable firearm'};
  const mag=clamp(Math.floor(finite(scenario?.magazine,w.magSize??0)),0,Math.max(0,w.magSize??0));
  const reserve=Math.max(0,finite(scenario?.reserve,mode==='tdm'?Infinity:2*(w.magSize??0)));
  const loaded=!!w.infinite||mag>0,canReload=!w.infinite&&reserve>0&&mag<(w.magSize??0);
  const inRange=d<=finite(w.maxRange,200);
  const visible=scenario?.visible!==false;
  if(!loaded)return {...base,score:0,action:canReload?'reload':'resupply',timeToKill:null,
    estimatedHitFraction:0,reason:canReload?'magazine empty':'no loaded ammunition or reserve',magazine:mag,reserve};
  if(!inRange)return {...base,score:0,action:'reposition',timeToKill:null,estimatedHitFraction:0,
    reason:'outside authoritative maxRange',magazine:mag,reserve};
  if(!visible)return {...base,score:0,action:'seek-sightline',timeToKill:null,estimatedHitFraction:0,
    reason:'target behind hard cover',magazine:mag,reserve};
  // Angular target tolerance; models a normal-sized target, not headshots.
  const radius=Math.atan2(.35,Math.max(d,1))*180/Math.PI;
  const spread=Math.max(0,finite(w.spreadAds,.2));
  let hit=clamp(radius/(radius+spread*.7),.04,.985);
  const damage=damageAt(w,d);
  if(w.pellets>1){
    // Pellet cloud dispersion grows with distance. A single shotgun pellet
    // does not imply an entire cluster hits. Handle pellet hits statistically.
    const cloud=clamp((w.range?.[0]??4)*1.4/Math.max(2,d),.035,.98);
    hit=clamp(hit*cloud,.01,.96);
  }
  const shotDamage=damage*hit*(w.pellets||1);
  const health=clamp(finite(scenario?.targetHp,100),1,300);
  const shots=Math.max(1,Math.ceil(health/Math.max(.01,shotDamage)));
  const burst=w.burst??0;
  const interval=burst>1 ? ((w.interval??.1)+(burst-1)*(w.burstGap??.06))/burst : Math.max(.04,w.interval??.1);
  const aimTime=scenario?.pressure==='high'?(w.adsTime??.2)*.65:(w.adsTime??.2);
  const ttk=aimTime+Math.max(0,shots-1)*interval;
  const availableShots=w.infinite?Infinity:mag;
  const canDown=availableShots>=shots;
  const countPenalty=count>1 && !w.infinite ? clamp((shots*count-mag)/Math.max(1,shots*count),0,1)*18 : 0;
  const pressure=scenario?.pressure==='high'?1:scenario?.pressure==='medium'?.55:.2;
  let spacingPenalty=0;
  if(w.cat==='Sniper' && d<25)spacingPenalty=(25-d)*.72;
  if(w.cat==='Shotgun' && d>18)spacingPenalty=Math.min(32,(d-18)*1.7);
  if(w.cat==='SMG' && d>42)spacingPenalty=Math.min(25,(d-42)*.35);
  if(w.cat==='LMG' && d<8)spacingPenalty=6;
  const move=Math.max(.45,finite(w.move,1));
  const maneuver=clamp((move-.8)*32,0,12);
  const reloadExposure=(w.shellReload>0?w.shellReload*(w.magSize??1):w.reload??0);
  const reloadPenalty=count>=3 ? Math.min(13,reloadExposure*1.7) : Math.min(7,reloadExposure*.7);
  const shotCapacity=canDown?0:clamp((shots-mag)/Math.max(1,shots)*23,0,23);
  const longShot=(d>100 && ['Sniper','Marksman'].includes(w.cat))?6:0;
  const urgency=scenario?.ringUrgent ? (1-move)*25 + Math.max(0,aimTime-.25)*6:0;
  const lowHp=scenario?.ownHp<40 ? pressure * (1-move)*18:0;
  const coverBonus=scenario?.cover ? Math.min(3, (w.cat==='Sniper'||w.cat==='Marksman'?3:1)):0;
  const multiBonus=count>=4 ? Math.min(8,(w.magSize??0)/12):0;
  // Score is a utility index, never a win probability or measured accuracy.
  const score=round(clamp(68/(ttk+.55)+maneuver+longShot+coverBonus+multiBonus-
    countPenalty-reloadPenalty*.4-shotCapacity-spacingPenalty-urgency-lowHp,1,100));
  return {...base,score,action:canDown?'engage':'engage-then-reload',timeToKill:round(ttk,3),
    estimatedHitFraction:round(hit,3),shotsNeeded:shots,magazine:mag,reserve,
    reason:`${w.cat} at ${d}m; ${canDown?'enough':'insufficient'} magazine for estimated takedown`};
}

export function rankWeapons(catalog,scenario,{limit=5}={}){
  return Object.values(catalog).map(w=>evaluateWeapon(w,scenario))
    .filter(a=>a.eligible).sort((a,b)=>b.score-a.score || a.weaponId.localeCompare(b.weaponId))
    .slice(0,limit);
}
