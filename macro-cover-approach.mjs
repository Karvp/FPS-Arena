// Experimental near-horizon corridor selection for close-weapon approach.
// Navigation goals and precise enemy observations remain public client inputs.
// Only occluded targets qualify: if a shooter is already visible, the
// baseline engagement/peek policy preserves its opportunity to shoot.
// This never moves through walls, changes shot/hit rules, or holds a command
// across a new emergency. The controller caches only a brief corridor intent.
const mcaDist=(a,b)=>Math.hypot((a?.x??0)-(b?.x??0),(a?.z??0)-(b?.z??0));
const mcaReasons=new Set(['camera-peek-hide','peek-reposition-cover','camera-cover-path','camera-peek-hold']);
const mcaPursuit=new Set(['pathfinding','pro-rotate','pro-long-range-close','duel-lateral-approach','engagement-sightline','macro-safe-advance']);
export function chooseCoveredApproach(game,target,phase,pursuit,reactive,contacts=[],now=0,memory={},policy={}) {
  const mv=game?.local?.mv, local=game?.local;
  if(!mv||!target?.point||target.visible!==false||phase?.phase!=='approach'||phase.suspended ||
     !pursuit || !mcaPursuit.has(pursuit.reason) || !mcaReasons.has(reactive?.reason) ||
     (phase.weaponClass==='SMG'&&phase.distance<60) || phase.distance<phase.engageAt+4 ||
     !local.alive || local.hp<72 || local.armor<20 || local.ws?.reloading || local.ws?.plateT>0 ||
     policy.emergency||policy.dodge||policy.recovery||policy.ring||policy.objective||policy.loot ||
     typeof policy.canStep!=='function'||typeof policy.exposureAt!=='function'||
     typeof policy.hardCoverAt!=='function'||!contacts.length) return reactive;
  const length=Math.hypot(pursuit.x,pursuit.z);if(length<.3)return reactive;
  const axis={x:pursuit.x/length,z:pursuit.z/length};
  const id=phase.targetId, old=memory.choice;
  // The heading commitment prevents oscillatory left-right sampling caused by
  // slight changes in the opponent's camera yaw. Revalidate every tick.
  if(old && old.id===id && now-old.time<.65 && mcaDist(old.origin,mv)<3.8 &&
     axis.x*old.x+axis.z*old.z>.15 && policy.canStep(old.x,old.z,2.0)){
    const check={x:mv.x+old.x*2.2,y:mv.y,z:mv.z+old.z*2.2};
    if(mcaDist(check,target.point)<mcaDist(mv,target.point)-.32 &&
       policy.exposureAt(check,contacts)<1.45 &&
       policy.hardCoverAt(check,contacts))
      return {x:old.x,z:old.z,reason:'macro-covered-approach',macroPhase:'approach'};
  }
  if(now-(memory.lastSearch??-Infinity)<.42)return reactive;
  memory.lastSearch=now;
  const before=mcaDist(mv,target.point);
  const pathLength=5.4;
  const candidates=[];
  // No behind/sideways retreat: all candidates make forward progress and are
  // checked against the actual map solids before being scored.
  for(const deg of [0,-28,28,-50,50]) {
    const angle=deg*Math.PI/180,ca=Math.cos(angle),sa=Math.sin(angle);
    const vx=axis.x*ca-axis.z*sa, vz=axis.x*sa+axis.z*ca;
    if(!policy.canStep(vx,vz,pathLength))continue;
    let risk=0,valid=true;
    for(const d of [1.8,3.6,5.4]){
      const point={x:mv.x+vx*d,y:mv.y,z:mv.z+vz*d};
      const r=policy.exposureAt(point,contacts);
      // A guessed camera blind spot is not hard cover. At least the
      // middle/end of this corridor must be occluded by map solids from
      // every currently credible nearby shooter's eye height.
      if(!Number.isFinite(r) || (d>=3.6 && !policy.hardCoverAt(point,contacts))){valid=false;break;}
      risk+=Math.min(10,Math.max(0,r));
    }
    if(!valid)continue;
    const dest={x:mv.x+vx*pathLength,z:mv.z+vz*pathLength};
    const progress=before-mcaDist(dest,target.point);
    if(progress<1.1)continue;
    candidates.push({x:vx,z:vz,risk:risk/3,progress,deg,score:risk/3*2.8 + (pathLength-progress)*.15 + Math.abs(deg)*.009});
  }
  const direct=candidates.find(c=>c.deg===0);
  const viable=candidates.filter(c=>c.risk<1.35 && (!direct || c.score+.68<direct.score || (c.deg===0 && c.risk<.42)));
  viable.sort((a,b)=>a.score-b.score);
  const selected=viable[0];
  if(!selected){memory.choice=null;return reactive;}
  memory.choice={x:selected.x,z:selected.z,id,time:now,origin:{x:mv.x,z:mv.z}};
  return {x:selected.x,z:selected.z,reason:'macro-covered-approach',macroPhase:'approach'};
}
