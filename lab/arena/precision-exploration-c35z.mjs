/** C35-Z opt-in precision-weapon research band; never a production targeting rule.
 * Only static published weapon range metadata enters this module.
 */
import {WEAPONS} from './source-main/shared/weapons.js';
export const C35Z_SCHEMA='fpsarena-c35z-precision-exploration-v1';
export function precisionWeaponBandC35Z(id){
 const w=WEAPONS[id];
 if(!w||!['Marksman','Sniper'].includes(w.cat)||!Array.isArray(w.range)||
    w.range.length!==2||!w.range.every(Number.isFinite)||!Number.isFinite(w.maxRange))return null;
 const near=w.cat==='Sniper'?Math.max(18,w.range[0]*1.25):Math.max(20,w.range[0]*.75);
 const far=w.cat==='Sniper'?Math.max(near+12,Math.min(65,w.range[1]*1.35)):
   Math.max(near+12,Math.min(110,w.range[1]*1.15));
 return {cat:w.cat,near,far,max:Math.min(w.maxRange,180),precisionResearch:true};
}
/** Diagnostic-only blockers from public client/commands, before Game.step().
 * No server truth accepted. Multiple reasons can coexist. */
export function precisionPrecheckC35Z(now,client,incumbent,applied){
 const reasons=[];
 if(!Number.isFinite(now))reasons.push('invalid-clock');
 if(!client?.local?.alive||client?.local?.down||client?.local?.frozen)reasons.push('player-unavailable');
 if(!Number.isFinite(client?.local?.hp)||client.local.hp<40)reasons.push('hp-guard');
 const m=client?.local?.mv;
 if(!m?.onGround||m.air||m.heli||m.slideT>0||m.stance!==0)reasons.push('stance-or-air');
 if(['reload','skill','use','interact','plate','throw','jump','crouch','slide','prone','lean'].some(k=>!!incumbent?.[k]||!!applied?.[k])||
 (Number.isFinite(incumbent?.slot)&&incumbent.slot>=0)||(Number.isFinite(applied?.slot)&&applied.slot>=0))reasons.push('priority');
 if(!['forward','backward','left','right'].some(k=>!!applied?.[k])||
 (!!applied?.forward&&!!applied?.backward)||(!!applied?.left&&!!applied?.right))reasons.push('no-clean-motion');
 // Avoid perturbing the firing frame of ADS-sensitive sniper rifles.
 if(!!applied?.fire)reasons.push('precision-fire-hold');
 if(![client?.pos?.x,client?.pos?.y,client?.pos?.z,client?.rig?.yaw,client?.rig?.pitch].every(Number.isFinite))
  reasons.push('invalid-geometry');
 return reasons;
}
