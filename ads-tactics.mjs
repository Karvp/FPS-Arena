// Dynamic Autopilot ADS selection, based only on the public weapon data and
// current local/observed state. Server's spreadDir samples a disk of angle
// tan(spreadDeg), so this is a cheap, conservative geometric hit proxy, NOT
// an authoritative hit probability (occlusion/animation/recoil still matter).
export function adsConeCoverage(weapon, distance, aiming=false, {airborne=false}={}) {
  if(!weapon || !Number.isFinite(distance) || distance<0)return 0;
  const spread=(aiming?weapon.spreadAds:weapon.spreadHip)*(airborne?1.6:1);
  if(!Number.isFinite(spread))return 0;
  if(spread<=0)return 1;
  // Approximate equivalent body disk, smaller for sliding targets.
  const radius=.39;
  const cone=Math.max(.001,distance*Math.tan(spread*Math.PI/180));
  return Math.min(1,(radius/cone)**2);
}
export function decideAutopilotAds(weapon, distance, input={}, target=null, options={}, memo=null, now=0) {
  const invalid = !weapon || weapon.melee || weapon.unarmed || !target ||
    !Number.isFinite(distance) || distance>(weapon.maxRange??Infinity) ||
    target.visible===false && target.hitboxVisible!==true;
  if(invalid){if(memo)memo.aim=false;return {aim:false,reason:'no-shot'};}
  if(options.adaptiveADS===false){
    const style=weapon.cat;
    const threshold=style==='Sniper'||style==='Marksman'?0:
      style==='Shotgun'?6:style==='SMG'?9:style==='Pistol'?8:style==='LMG'?10:style==='Special'?Infinity:7;
    return {aim:distance>threshold,reason:'legacy-distance'};
  }
  if(input.slide||input.sprint||input.reload||input.plate||input.throw||input.interact||input.use){
    if(memo){memo.aim=false;memo.lastChange=now;}
    return {aim:false,reason:'mobility-or-utility'};
  }
  if(weapon.spreadHip<=weapon.spreadAds+.025){
    if(memo){memo.aim=false;memo.lastChange=now;}
    return {aim:false,reason:'no-accuracy-benefit'};
  }
  const moving=!!(input.forward||input.backward||input.left||input.right);
  const airborne=!!options.airborne;
  const hip=adsConeCoverage(weapon,distance,false,{airborne});
  const ads=adsConeCoverage(weapon,distance,true,{airborne});
  const penalty=Math.max(0,1-(Number.isFinite(weapon.adsMove)?weapon.adsMove:1));
  const cat=weapon.cat;
  let aim;
  if(cat==='Sniper')aim=distance>=4 || hip<.7;
  else if(cat==='Marksman')aim=distance>=9 || hip<.65;
  else if(cat==='Shotgun'){
    // At close range, multiple pellets hit without ADS. Staying mobile beats
    // slowing down for a small gain in pellets. ADS past close-range duels.
    aim=distance>14 && ads>hip*1.28;
  }else if(cat==='Special' && weapon.pellets>1)aim=distance>14 && ads>hip*1.35;
  else {
    // Compare accuracy benefit against ADS strafe speed loss. If hip-fire
    // already covers the torso well, don't sacrifice escape velocity.
    const adequateHip=moving ? .70 + Math.min(.12,penalty*.15) : .84;
    aim=(hip<adequateHip && ads>hip*1.20) ||
      (!moving && distance>20 && ads>hip*1.10);
  }
  if(memo){
    const id=String(weapon.id)+'|'+String(target.id??'');
    if(memo.id!==id){memo.id=id;memo.lastChange=-Infinity;memo.aim=aim;}
    else if(!!memo.aim!==aim){
      // Avoid visual scope flicker while the target hovers near the switch
      // boundary; ADS acquisition can always happen immediately at range.
      const urgentPrecision=aim && (cat==='Sniper'||cat==='Marksman'||hip<.3);
      if(!urgentPrecision && Number.isFinite(now) && now-(memo.lastChange??-Infinity)<.22)
        aim=!!memo.aim;
      else memo.lastChange=now;
      memo.aim=aim;
    }
  }
  return {aim,reason:aim?'precision-needed':'hipfire-mobile',hipCoverage:hip,adsCoverage:ads};
}
