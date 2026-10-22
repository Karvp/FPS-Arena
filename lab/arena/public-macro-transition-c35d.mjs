/** C35-D: PASSIVE, opt-in, causal public-incumbent-command telemetry.
 * Labels refer to FUTURE commands, added only after the horizon closes.
 * This module never changes the agent command, C16, C21, or server state.
 */
const PRIORITY=['fire','reload','skill','use','interact','plate','throw','jump','crouch','slide','prone'];
const finite=Number.isFinite;
export const C35D_TRACE_SCHEMA='fpsarena-c35d-public-transition-trace-v1';
export const priorityC35D=(cmd)=>PRIORITY.some(k=>cmd?.[k]===true)||finite(cmd?.slot)&&cmd.slot>=0;
export function publicFeaturesC35D(history,nowMs,quietSinceMs,cmd){
 const recent=history.filter(h=>nowMs-h.time<=1000);
 const busy500=recent.filter(h=>nowMs-h.time<=500);
 let edges=0;
 for(let i=1;i<recent.length;i++)if(recent[i].busy!==recent[i-1].busy)edges++;
 return {quietMs:quietSinceMs===null?0:Math.max(0,nowMs-quietSinceMs),
   priorityFraction500:busy500.length?busy500.filter(h=>h.busy).length/busy500.length:0,
   priorityEdges1000:edges,
   aim:cmd?.aim===true?1:0,
   moving:['forward','backward','left','right'].some(k=>cmd?.[k]===true)?1:0};
}
export class PublicMacroTransitionRecorderC35D{
 constructor({matchId,setupId,seed,seconds,horizonMs=120,sampleEveryMs=100}={}){
  if(typeof matchId!=='string'||!matchId||typeof setupId!=='string'||!setupId||
   !Number.isSafeInteger(seed)||!finite(seconds)||seconds<=0||
   !finite(horizonMs)||horizonMs<40||horizonMs>500||
   !finite(sampleEveryMs)||sampleEveryMs<20)throw Error('C35D invalid study parameters');
  Object.assign(this,{matchId,setupId,seed,seconds,horizonMs,sampleEveryMs});
  this.history=[];this.pending=[];this.rows=[];this.lastNowMs=-Infinity;
  this.quietSinceMs=null;this.nextSampleMs=0;this.observations=0;this.censored=0;
 }
 observe(nowMs,cmd){
  if(!finite(nowMs)||nowMs<this.lastNowMs-0.001)throw Error('C35D nonmonotonic public clock');
  if(!cmd||typeof cmd!=='object')throw Error('C35D unknown public command');
  this.lastNowMs=nowMs;this.observations++;
  const busy=priorityC35D(cmd);
  // Future state may ONLY label pending past samples. This is NEVER a feature.
  for(const row of this.pending){if(nowMs>row.tMs+0.001&&nowMs<=row.tMs+this.horizonMs+0.001&&busy)row.futurePriority=1;}
  const active=[];
  for(const row of this.pending){
   if(nowMs>=row.tMs+this.horizonMs-0.001){this.rows.push(row);}else active.push(row);
  }
  this.pending=active;
  if(busy)this.quietSinceMs=null;
  else if(this.quietSinceMs===null)this.quietSinceMs=nowMs;
  this.history.push({time:nowMs,busy});
  while(this.history.length>1&&nowMs-this.history[0].time>1020)this.history.shift();
  if(nowMs+0.001>=this.nextSampleMs){
   this.nextSampleMs=nowMs+this.sampleEveryMs;
   if(!busy){const features=publicFeaturesC35D(this.history,nowMs,this.quietSinceMs,cmd);
    this.pending.push({matchId:this.matchId,setupId:this.setupId,tMs:+nowMs.toFixed(3),features,
     futurePriority:0,source:'public-original-command-predecision'});
   }
  }
  return cmd;
 }
 finish(){
  this.censored=this.pending.length;
  return {schema:C35D_TRACE_SCHEMA,matchId:this.matchId,setupId:this.setupId,seed:this.seed,
   horizonMs:this.horizonMs,sampleEveryMs:this.sampleEveryMs,observations:this.observations,
   complete:this.rows.length,censored:this.censored,rows:this.rows.map(r=>({...r,features:{...r.features}}))};
 }
}
