// C25 research-only time-grid observer. One prospective sample per nonoverlapping
// window, BEFORE current client action. Server labels can only be appended AFTER.
// This class never returns commands or modifies engine/game state.
const finite=Number.isFinite;
const round=x=>finite(x)?+x.toFixed(5):null;
export const C25_HORIZON=1.8;
export const C25_FIRST_WINDOW=3.0;
const guard=(x,msg)=>{if(!x)throw Error('C25: '+msg);};
export class ThreatCalibrationObserverC25 {
 constructor({horizon=C25_HORIZON,first=C25_FIRST_WINDOW}={}) {
  guard(horizon===C25_HORIZON&&first===C25_FIRST_WINDOW,'fixed schedule required');
  this.horizon=horizon;this.first=first;this.next=first;this.windows=[];this.current=null;
  this.events={hostileShotEvents:0,hostileNearTracerEvents:0,hostileWeaponHitEvents:0,hostileWeaponDamage:0};
 }
 beforeClientStep(now,cue,publicStatus) {
  guard(finite(now)&&now>=0,'timestamp');
  // Finalize strictly before opening the next interval. No opportunity/gate filter.
  if(this.current&&now>=this.current.end-1e-7){this.current.complete=true;this.current=null;}
  if(now+1e-7<this.next)return;
  // Anchored schedule, not shifted by health, cue values or action decisions.
  const start=round(this.next);this.next=round(this.next+this.horizon);
  if(publicStatus?.alive!==true)return;
  guard(cue&&cue.lookbackSeconds===1.5&&cue.cueDefinition.includes('delivered'),'public pre-window cue');
  guard(publicStatus&&[publicStatus.healthFraction,publicStatus.armorFraction].every(v=>finite(v)&&v>=0&&v<=1),'public status');
  const window={start,end:round(start+this.horizon),complete:false,atRisk:true,
   publicCueBeforeWindow:{...cue},publicStatus:{alive:true,healthFraction:round(publicStatus.healthFraction),armorFraction:round(publicStatus.armorFraction)},
   label:{hostileShotEvents:0,hostileNearTracerEvents:0,hostileWeaponHitEvents:0,hostileWeaponDamage:0}};
  this.windows.push(window);this.current=window;
 }
 serverShot(now,near){
  if(!finite(now)||now<0)throw Error('C25: invalid shot time');
  this.events.hostileShotEvents++;
  if(near)this.events.hostileNearTracerEvents++;
  if(this.current&&now>=this.current.start-1e-7&&now<this.current.end-1e-7){
   this.current.label.hostileShotEvents++;
   if(near)this.current.label.hostileNearTracerEvents++;
  }
 }
 serverWeaponHit(now,damage){
  guard(finite(now)&&finite(damage)&&damage>0,'invalid hit');
  this.events.hostileWeaponHitEvents++;this.events.hostileWeaponDamage=round(this.events.hostileWeaponDamage+damage);
  if(this.current&&now>=this.current.start-1e-7&&now<this.current.end-1e-7){
   this.current.label.hostileWeaponHitEvents++;this.current.label.hostileWeaponDamage=round(this.current.label.hostileWeaponDamage+damage);
  }
 }
 finish(now){
  guard(finite(now),'finish time');
  if(this.current&&now>=this.current.end-1e-7){this.current.complete=true;this.current=null;}
  return {schema:'fpsarena-c25-fixed-grid-match-v1',horizonSeconds:this.horizon,firstWindowSeconds:this.first,
   schedule:'fixed 1.8-second grid starting at 3s; open only when local client alive, regardless of safety gate; no action intervention',
   dataLeakagePolicy:'cue and local status frozen BEFORE any action; server labels appended AFTER window opens',
   windows:this.windows,events:this.events};
 }
}
