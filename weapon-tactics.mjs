// Per-weapon combat parameters derived from FPS Arena's shared/weapons.js catalog.
// Pure functions: neither forge server events nor change authoritative gun stats.
const cap = (n, min, max) => Math.max(min, Math.min(max, n));
const profiles = Object.freeze({
  'Assault Rifle': {style:'rifle', distance:25, fire:76, exposed:20, reload:.27, strafe:1, aim:true},
  'SMG':           {style:'flank', distance:12, fire:42, exposed:15, reload:.34, strafe:1, aim:false},
  'Marksman':      {style:'marksman',distance:38, fire:128, exposed:30, reload:.3, strafe:1, aim:true},
  'Sniper':        {style:'sniper', distance:50, fire:180, exposed:34, reload:.4, strafe:0, aim:true},
  'LMG':           {style:'suppress',distance:33, fire:100, exposed:25, reload:.16, strafe:0, aim:true},
  'Shotgun':       {style:'rush', distance:7.5, fire:19, exposed:11, reload:.5, strafe:1, aim:false},
  'Pistol':        {style:'sidearm', distance:12, fire:39, exposed:15, reload:.32, strafe:1, aim:false},
  'Special':       {style:'special', distance:18, fire:75, exposed:20, reload:.2, strafe:1, aim:false},
});
export function weaponProfile(weapon, settings={}) {
  const w=weapon || {};
  if (w.melee) return {style:'melee',distance:1.8,fire:Math.max(1,w.reach||2.6),exposed:4,
    reload:0,strafe:0,aim:false,semi:true,shell:false,burst:false,category:'Melee'};
  if (w.unarmed) return {style:'unarmed',distance:4,fire:0,exposed:6,
    reload:0,strafe:0,aim:false,semi:true,shell:false,burst:false,category:'Unarmed'};
  const base=profiles[w.cat] || profiles['Assault Rifle'];
  const range=Array.isArray(w.range) && Number.isFinite(w.range[0]) ? w.range[0] : base.distance;
  const desired=(settings.weaponTactics===false) ? cap(Number(settings.engageRange)||16,6,40) :
    cap(base.distance * cap(range / (w.cat==='Sniper'?40:w.cat==='Shotgun'?5:w.cat==='SMG'?14:25),.75,1.2),
      w.cat==='Sniper'?32:base.style==='melee'?1.5:5, w.cat==='Sniper'?65:47) * (w.cat==='Assault Rifle' && (w.recoilV||0)>.85 ? .93 : 1);
  const maxShot=Number.isFinite(w.maxRange)?w.maxRange:base.fire;
  const effective=Array.isArray(w.range) && Number.isFinite(w.range[1]) ? w.range[1]*1.22:base.fire;
  // Long-range firearms have much longer authoritative hitscan ranges than
  // their damage-falloff distance. Do not treat damage falloff as a hard
  // prohibition on shooting at distant visible enemies.
  const falloffRange=Math.min(maxShot,Math.max(base.distance*1.2,Math.min(base.fire,effective)));
  const precisionRange=base.style==='sniper' ? 225 : base.style==='marksman' ? 165 : falloffRange;
  const fireRange=Math.min(maxShot,Math.max(falloffRange,precisionRange));
  const live=settings.dynamicWeaponPolicy;
  const dynamicDistance=settings.weaponTactics!==false && !!live && live.weaponId===w.id &&
    Number.isFinite(live.desiredDistance)
    ? cap(live.desiredDistance,w.cat==='Sniper'?32:5,w.cat==='Sniper'?90:90) : desired;
  return {...base, category:w.cat||'Unknown', distance:dynamicDistance,
    fire:fireRange,
    semi:!w.auto, shell:(w.shellReload||0)>0, burst:(w.burst||0)>0,
    reload:base.reload, aim:base.aim};
}
export function targetDistance(game,target) {
  if(!target?.point || !game?.pos)return Infinity;
  return Math.hypot(target.point.x-game.pos.x,target.point.z-game.pos.z);
}
// The effective range is intentionally below the game's hard maxRange for close-range guns.
export function weaponCanEngage(game,target,profile) {
  return !!(target && profile?.fire>0 && targetDistance(game,target)<=profile.fire);
}
