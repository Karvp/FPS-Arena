/** C35-AG: passive realized engagement-sequence recorder. Research only.
 * C35AD alone randomizes the initial ADS impulse; all subsequent trajectory
 * elements are POST-TREATMENT observations, NOT randomized actions/Q-labels.
 * Every independent long-horizon sequence is 6 s; assignment cooldown 7.5 s.
 */
export const C35AG_SCHEMA='fpsarena-c35ag-engagement-sequence-v1';
const NAMES=['shots','hits','damageDealt','damageTaken','ownKills','deathCount'];
const N=x=>Number.isFinite(x)?Math.round(x*1e4)/1e4:null;
const clone=x=>JSON.parse(JSON.stringify(x));
function counters(metrics){const out={};for(const k of NAMES){const v=metrics?.[k];if(!Number.isFinite(v)||v<0)throw Error(`C35AG bad authoritative counter ${k}`);out[k]=v;}return out;}
const FLAGS=['aim','fire','forward','backward','left','right','jump','crouch','reload'];
function commandSnapshot(cmd){const flags={};for(const k of FLAGS)flags[k]=!!cmd?.[k];return flags;}
function segmentKind(c){return FLAGS.map(k=>c[k]?'1':'0').join('');}
function observedKinematics(client){const mv=client?.local?.mv||{};const v=mv.vel||mv.v||{};
 const speed=Number.isFinite(mv.speed)?mv.speed: (Number.isFinite(v.x)&&Number.isFinite(v.z)?Math.hypot(v.x,v.z):null);
 return {speed:N(speed),onGround:typeof mv.onGround==='boolean'?mv.onGround:null};}
export class EngagementSequenceObserverC35AG{
 constructor({setupId,matchId,weapon,horizonSeconds=6,cooldownSeconds=7.5}={}){
  if(!setupId||!matchId||!weapon||!Number.isFinite(horizonSeconds)||horizonSeconds<2||horizonSeconds>12||!Number.isFinite(cooldownSeconds)||cooldownSeconds<=horizonSeconds)throw Error('C35AG invalid config');
  Object.assign(this,{setupId,matchId,weapon,horizonSeconds,cooldownSeconds,rows:[],open:[],seen:0,pending:false,lastNow:-Infinity,
   counts:{assignments:0,control:0,toggle:0,completed:0,censored:0,overlap:0,steps:0,serverShots:0,serverHits:0,changedADS:0}});
 }
 beforeStep({now,assignments,metrics,client,incumbent,applied}){
  if(!Number.isFinite(now)||now<=this.lastNow||this.pending||!Array.isArray(assignments))throw Error('C35AG pre-step phase');
  if(this.seen>assignments.length||assignments.length-this.seen>1)throw Error('C35AG invalid offer stream');
  const current=counters(metrics);this.pending=true;this.lastNow=now;
  if(assignments.length!==this.seen){
   if(this.open.length){this.counts.overlap++;throw Error('C35AG overlap');}
   const a=assignments[this.seen];
   if(a.propensity!==.5||!['control','toggle'].includes(a.assignedArm)||a.unselectedOutcome!==null||
    a.publicFeatures?.provenance!=='PUBLIC_BEFORE_GAME_STEP_ONLY'||Math.abs(a.start-now)>1e-4)throw Error('C35AG untrusted pre-step assignment');
   const row={schema:C35AG_SCHEMA,setupId:this.setupId,matchId:this.matchId,weapon:this.weapon,index:a.index,
    start:a.start,assignedArm:a.assignedArm,propensity:a.propensity,baselineADS:a.baselineADS,
    assignmentSource:'C35AD_PRE_STEP',initialPublicFeatures:clone(a.publicFeatures),
    sequence:{provenance:'POST_ASSIGNMENT_ACTUAL_QUEUED_COMMANDS_NOT_CAUSAL_FEATURES',segments:[],samples:[],
      ticks:0,adsTicks:0,fireInputTicks:0,movementTicks:0,changedADSTicks:0,
      shotsByPhase:[0,0,0],hitsByPhase:[0,0,0]},
    _base:current,_prior:current,factual:null,unselectedOutcome:null};
   this.rows.push(row);this.open.push(row);this.seen++;this.counts.assignments++;this.counts[a.assignedArm]++;
  }
  for(const row of this.open){
   if(now-row.start>this.horizonSeconds+0.05)throw Error('C35AG missing completion');
   const sequence=row.sequence,cmd=commandSnapshot(applied),base=commandSnapshot(incumbent),kind=segmentKind(cmd),segments=sequence.segments;
   let seg=segments[segments.length-1];if(!seg||seg.key!==kind){seg={key:kind,flags:cmd,fromTick:sequence.ticks,ticks:0,shots:0,hits:0};segments.push(seg);}
   seg.ticks++;sequence.ticks++;sequence.adsTicks+=+cmd.aim;sequence.fireInputTicks+=+cmd.fire;
   sequence.movementTicks+=+(cmd.forward||cmd.backward||cmd.left||cmd.right);
   const changed=cmd.aim!==base.aim;sequence.changedADSTicks+=+changed;this.counts.changedADS+=+changed;
   if(sequence.ticks===1||sequence.ticks%15===0){sequence.samples.push({tick:sequence.ticks,offsetSeconds:N(now-row.start),ads:cmd.aim,fire:cmd.fire,...observedKinematics(client)});}
  }
 }
 afterStep({now,metrics,alive}){
  if(!this.pending||now!==this.lastNow)throw Error('C35AG post-step phase');this.pending=false;
  const current=counters(metrics);
  for(const row of [...this.open]){
   const prev=row._prior,ds=current.shots-prev.shots,dh=current.hits-prev.hits;
   if(NAMES.some(k=>current[k]<prev[k]))throw Error('C35AG server counters decreased');
   const seg=row.sequence.segments.at(-1);if(!seg)throw Error('C35AG missing queued command');
   seg.shots+=ds;seg.hits+=dh;this.counts.steps++;this.counts.serverShots+=ds;this.counts.serverHits+=dh;
   const elapsed=now-row.start,phase=elapsed<1?0:elapsed<3?1:2;
   row.sequence.shotsByPhase[phase]+=ds;row.sequence.hitsByPhase[phase]+=dh;
   row._prior=current;
   if(elapsed>=this.horizonSeconds-1e-6){
    const delta={};for(const k of NAMES){delta[k]=current[k]-row._base[k];if(delta[k]<0)throw Error('C35AG decreasing server totals');}
    if(row.sequence.segments.reduce((s,g)=>s+g.shots,0)!==delta.shots||row.sequence.segments.reduce((s,g)=>s+g.hits,0)!==delta.hits)throw Error('C35AG segment/server mismatch');
    row.factual={...delta,netDamage:delta.damageDealt-delta.damageTaken,survived:delta.deathCount===0&&!!alive,
      source:'SERVER_CUMULATIVE_AFTER_GAME_STEP',complete:true,horizonSeconds:this.horizonSeconds};
    delete row._base;delete row._prior;this.open.splice(this.open.indexOf(row),1);this.counts.completed++;
   }
  }
 }
 finish(){
  if(this.pending||this.counts.overlap)throw Error('C35AG unfinished step or overlaps');
  for(const row of this.open){row.factual={complete:false,censored:true,reason:'match-ended-before-six-second-outcome'};delete row._base;delete row._prior;this.counts.censored++;}
  this.open=[];
  if(this.counts.completed+this.counts.censored!==this.rows.length||this.counts.control+this.counts.toggle!==this.rows.length)throw Error('C35AG row integrity');
  return {schema:C35AG_SCHEMA,setupId:this.setupId,matchId:this.matchId,weapon:this.weapon,horizonSeconds:this.horizonSeconds,cooldownSeconds:this.cooldownSeconds,rows:this.rows,counts:this.counts,
   caveat:'Only initial 0.28s ADS impulse randomized. Movement/ADS/fire sequence is realized post-treatment; never use it to claim causal effect of individual steps or as pre-decision Q features. Unassigned outcomes unknown.'};
 }
}
