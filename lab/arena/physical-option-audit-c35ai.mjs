/** C35-AI: passive authoritative displacement measurements following C35-AH assignment.
 * This is POST-step truth for audit only: it NEVER selects actions, conditions assignment,
 * or supplies server-private information to public-state policies.
 */
export const C35AI_SCHEMA='fpsarena-c35ai-physical-option-audit-v1';
const KEYS=['forward','backward','left','right'];
const rnd=x=>Number.isFinite(x)?+x.toFixed(6):null;
const moving=c=>KEYS.some(k=>!!c?.[k]);
const changed=(a,b)=>KEYS.some(k=>!!a?.[k]!==!!b?.[k]);
const fresh=()=>({ticks:0,motorCommandTicks:0,modifiedCommandTicks:0,realizedMovingTicks:0,modifiedRealizedMovingTicks:0,
 stalledMotorTicks:0,travelMeters:0,modifiedTravelMeters:0,teleportTicks:0,verticalMovementTicks:0,
 stopTicks:0,momentumTravelMeters:0,peakMetersPerTick:0});
export class PhysicalOptionAuditC35AI {
 constructor({matchId,setupId,weapon,doseSeconds=1.25,epsilonMeters=.005,maxPlausibleMetersPerTick=1.5}={}){
  if(!matchId||!setupId||!weapon||!Number.isFinite(doseSeconds)||doseSeconds<=0||!Number.isFinite(epsilonMeters)||epsilonMeters<=0||!Number.isFinite(maxPlausibleMetersPerTick)||maxPlausibleMetersPerTick<=epsilonMeters)throw Error('C35AI bad design');
  Object.assign(this,{matchId,setupId,weapon,doseSeconds,epsilonMeters,maxPlausibleMetersPerTick,
   entries:new Map(),summary:fresh(),pending:null,lastNow:-Infinity});
 }
 beforeStep({now,optionRows,activeOptionIndex,incumbent,applied,player}){
  if(this.pending||!Number.isFinite(now)||now<=this.lastNow)throw Error('C35AI phase before');
  if(!player||![player.x,player.y,player.z].every(Number.isFinite))throw Error('C35AI bad pre-step truth');
  this.lastNow=now;
  const option=optionRows?.at(-1),eligible=activeOptionIndex!==null&&activeOptionIndex!==undefined;
  // The controller's active index is authoritative for *which command was issued*.
  // Reconstructing this from rounded timestamps loses a boundary tick even with a tolerance.
  if(eligible&&(!option||option.index!==activeOptionIndex))throw Error('C35AI active option mismatch');
  if(changed(incumbent,applied)&&(!eligible||option.assignedArm==='incumbent'))throw Error('C35AI modified command without active alternative');
  if(option&&!this.entries.has(option.index))this.entries.set(option.index,{index:option.index,assignedArm:option.assignedArm,
   start:option.start,propensity:option.propensity,measure:fresh(),status:'observational-post-step-displacement'});
  this.pending={now,position:{x:player.x,y:player.y,z:player.z},eligible,index:eligible?option.index:null,
   commandMoving:moving(applied),changed:changed(incumbent,applied)};
 }
 afterStep({now,player}){
  const p=this.pending;if(!p||p.now!==now||!player||![player.x,player.y,player.z].every(Number.isFinite))throw Error('C35AI phase after');
  this.pending=null;
  const dx=player.x-p.position.x,dz=player.z-p.position.z,dy=player.y-p.position.y,delta=Math.hypot(dx,dz),teleport=delta>this.maxPlausibleMetersPerTick;
  const measures=[this.summary];if(p.eligible){const row=this.entries.get(p.index);if(!row)throw Error('C35AI missing assignment');measures.push(row.measure);}
  for(const s of measures){
   s.ticks++;if(p.commandMoving)s.motorCommandTicks++;else s.stopTicks++;
   if(p.changed)s.modifiedCommandTicks++;
   if(Math.abs(dy)>.03)s.verticalMovementTicks++;
   if(teleport){s.teleportTicks++;continue;}
   s.travelMeters+=delta;s.peakMetersPerTick=Math.max(s.peakMetersPerTick,delta);
   if(delta>this.epsilonMeters){s.realizedMovingTicks++;if(p.changed){s.modifiedRealizedMovingTicks++;s.modifiedTravelMeters+=delta;}
    if(!p.commandMoving)s.momentumTravelMeters+=delta;
   }else if(p.commandMoving)s.stalledMotorTicks++;
  }
 }
 finish({optionRows,optionCounts}={}){
  if(this.pending)throw Error('C35AI unfinished step');
  if(!Array.isArray(optionRows))throw Error('C35AI missing randomized assignments');
  if(optionCounts?.offers!==optionRows.length||this.entries.size!==optionRows.length)throw Error('C35AI row accounting');
  const rows=optionRows.map(o=>{
   const e=this.entries.get(o.index);if(!e||e.assignedArm!==o.assignedArm||e.propensity!==o.propensity)throw Error('C35AI assignment mismatch');
   if(e.measure.modifiedCommandTicks!==o.modifiedTicks)throw Error('C35AI changed ticks mismatch '+o.index+':'+e.measure.modifiedCommandTicks+'/'+o.modifiedTicks);
   const m=Object.fromEntries(Object.entries(e.measure).map(([k,v])=>[k,rnd(v)]));
   return {...e,measure:m,endedEarly:!!o.interruptions,completeFactual:!!o.factual?.complete,
    // Explicit ITT; never condition sample selection on moving/stall/interruption.
    allPotentialOutcomes:null};
  });
  const s=Object.fromEntries(Object.entries(this.summary).map(([k,v])=>[k,rnd(v)]));
  return {schema:C35AI_SCHEMA,matchId:this.matchId,setupId:this.setupId,weapon:this.weapon,
   epsilonMeters:this.epsilonMeters,maxPlausibleMetersPerTick:this.maxPlausibleMetersPerTick,
   summary:s,rows,notes:'Authoritative post-Game.step physical displacement. Teleports separated. Within-option displacement is an observed mediator, not randomized treatment. All assignment-level outcome analysis must preserve ITT; no counterfactual physical trajectories.'};
 }
}
