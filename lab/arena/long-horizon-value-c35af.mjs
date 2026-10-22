/** C35-AF: passive, randomized factual 3-second combat outcome logger.
 * Does not alter commands, agents, engine or the C35-AD randomizer. The C35-AF
 * CLI uses C35-AD's separate 4s assignment cooldown to prevent overlapping
 * 3s measurement windows. Nothing reads post-step state to pick an action.
 */
export const C35AF_SCHEMA='fpsarena-c35af-long-horizon-factual-v1';
const F=['shots','hits','damageDealt','damageTaken','ownKills','deathCount'];
function counters(m){const c={};for(const f of F){if(!Number.isFinite(m?.[f])||m[f]<0)throw Error('C35AF invalid server counter: '+f);c[f]=m[f];}return c;}
const clean=x=>JSON.parse(JSON.stringify(x));
export class LongHorizonCombatValueC35AF{
 constructor({setupId,matchId,weapon,horizon=3,cooldown=4}={}){
  if(!setupId||!matchId||!weapon||!Number.isFinite(horizon)||horizon<1||horizon>5||!Number.isFinite(cooldown)||cooldown<=horizon)throw Error('C35AF invalid config');
  Object.assign(this,{setupId,matchId,weapon,horizon,cooldown,lastTime:-Infinity,pending:false,rows:[],open:[],seen:0,
   counts:{assignments:0,control:0,toggle:0,completed:0,censored:0,overlaps:0,unsafe:0}});
 }
 beforeStep({now,assignments,metrics}){
  if(!Number.isFinite(now)||now<=this.lastTime||this.pending||!Array.isArray(assignments))throw Error('C35AF phase');
  this.pending=true;this.lastTime=now;
  if(assignments.length<this.seen)throw Error('C35AF assignment rewind');
  if(assignments.length-this.seen>1)throw Error('C35AF multiple offers in one tick');
  if(assignments.length>this.seen){
   if(this.open.length){this.counts.overlaps++;throw Error('C35AF overlapping assignment windows');}
   const a=assignments[this.seen],before=counters(metrics);
   if(a.outcome?.complete!==false||a.unselectedOutcome!==null||a.propensity!==.5||!['control','toggle'].includes(a.assignedArm)||a.start>now+1e-5||a.start<now-1e-4||
      a.publicFeatures?.provenance!=='PUBLIC_BEFORE_GAME_STEP_ONLY')throw Error('C35AF invalid pre-step randomization provenance');
   const row={schema:C35AF_SCHEMA,setupId:this.setupId,matchId:this.matchId,weapon:this.weapon,index:a.index,
    start:a.start,assignedArm:a.assignedArm,propensity:a.propensity,baselineADS:a.baselineADS,
    features:clean(a.publicFeatures),assignmentSource:'C35AD_PRE_STEP',baselineCounters:before,
    factual:null,unselectedOutcome:null};
   this.rows.push(row);this.open.push(row);this.counts.assignments++;this.counts[a.assignedArm]++;
   this.seen++;
  }
 }
 afterStep({now,metrics,alive}){
  if(!this.pending||now!==this.lastTime)throw Error('C35AF afterStep phase');this.pending=false;
  const end=counters(metrics);
  for(const row of [...this.open]){
   const delta={};for(const f of F){delta[f]=end[f]-row.baselineCounters[f];if(delta[f]<-1e-8)throw Error('C35AF decreasing cumulative server counter');}
   if(now-row.start>=this.horizon-1e-6){
    const gross=delta.damageDealt,received=delta.damageTaken;
    row.factual={...delta,netDamage:gross-received,survived:delta.deathCount===0&&!!alive,complete:true,
     horizonSeconds:this.horizon,source:'SERVER_CUMULATIVE_AFTER_GAME_STEP',
     rewards:{netDamage:gross-received,killMinusDeath:delta.ownKills-delta.deathCount}};
    delete row.baselineCounters;this.open.splice(this.open.indexOf(row),1);this.counts.completed++;
   }
  }
 }
 finish(){
  if(this.pending||this.counts.overlaps)throw Error('C35AF open step / overlapping windows');
  for(const row of this.open){row.factual={complete:false,censored:true,reason:'match-ended-before-three-second-outcome'};delete row.baselineCounters;this.counts.censored++;}
  this.open=[];
  if(this.counts.assignments!==this.rows.length||this.counts.completed+this.counts.censored!==this.rows.length||
   this.counts.control+this.counts.toggle!==this.rows.length)throw Error('C35AF finish invariant');
  return {schema:C35AF_SCHEMA,setupId:this.setupId,matchId:this.matchId,weapon:this.weapon,horizonSeconds:this.horizon,
   assignmentCooldownSeconds:this.cooldown,rows:this.rows,counts:this.counts,
   caveat:'Factual 3s outcome of short prefire ADS randomization on eligible ticks. Not a general Q(s,a); match trajectory can carry treatment effects after 3s; within-match samples are dependent. No labels for unselected actions.'};
 }
}
