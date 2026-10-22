/** FPS Arena C35-E: registered shadow forecast on C16 offer population.
 * Zero intervention difference from legacy80: no forecast veto and no changes
 * to C16 per tick, C21 randomization, incumbent agent or engine.
 * Outcomes from FUTURE incumbent public commands are finalized only later.
 */
import {MacroMicroIntegrationC35C} from './macro-micro-integration-c35c.mjs';
import {PublicPriorityForecasterC35D, probabilityC35D} from './macro-forecast-policy-c35d.mjs';
import {priorityC35D} from './public-macro-transition-c35d.mjs';
const finite=Number.isFinite;
export const C35E_SCHEMA='fpsarena-c35e-public-forecast-opportunity-shadow-v1';
export class OpportunityPreservingShadowC35E extends MacroMicroIntegrationC35C{
 constructor({policy,forecastModel,...args}={}){
  if(policy!=='shadow80')throw Error('C35E requires shadow80');
  // The inherited policy MUST be exact legacy80. Neither the predictor nor
  // C35E instrumentation may modify candidate eligibility or commands.
  super({...args,policy:'legacy80'});
  if(!forecastModel)throw Error('C35E needs a frozen model');
  this.shadowForecaster=new PublicPriorityForecasterC35D(forecastModel);
  this.shadowModelSHA=forecastModel.registrationSHA256;
  this.shadowTimeline=[];this.shadowRows=[];this.shadowPending=[];
  this.shadowLastNow=-Infinity;this.shadowLastBusy=false;
  this.shadowHorizonMs=120;
 }
 command(now,client,original){
  if(!finite(now)||now<0)return super.command(now,client,original);
  const nowMs=+(now*1000).toFixed(2);
  if(nowMs<this.shadowLastNow-0.001)throw Error('C35E nonmonotonic clock');
  const busy=priorityC35D(original);
  // Only FUTURE public incumbent commands can label PREVIOUS offers.
  for(const p of this.shadowPending){
   if(nowMs>p.tMs+0.001&&nowMs<=p.tMs+this.shadowHorizonMs+0.001){
    if(busy)p.futurePriority=true;
    if(busy&&!this.shadowLastBusy)p.futurePriorityEdge=true;
   }
  }
  const open=[];
  for(const p of this.shadowPending){
   if(nowMs>=p.tMs+this.shadowHorizonMs-0.001){
    p.complete=true;this.shadowRows.push(p);
   }else open.push(p);
  }
  this.shadowPending=open;
  const forecast=this.shadowForecaster.observe(nowMs,original);
  // Audit timeline is write-only measurement. It never enters either arbiter.
  this.shadowTimeline.push([nowMs,busy?1:0]);
  const attempts=this.c35cAttempts,offers=this.offers.length;
  const applied=super.command(now,client,original);
  if(this.c35cAttempts!==attempts){
   if(this.c35cAttempts!==attempts+1)throw Error('C35E unexpected preoffer count');
   const assigned=this.offers.length===offers+1;
   const row={attemptId:`${this.matchId}:attempt:${this.c35cAttempts}`,
    tMs:nowMs,priorityAtDecision:busy,forecastRisk:forecast.predictedPriorityRisk120ms,
    forecastType:forecast.type,assigned,
    offerId:assigned?this.offers.at(-1).offerId:null,
    assignment:assigned?this.offers.at(-1).assignedAction:null,
    futurePriority:false,futurePriorityEdge:false,complete:false,
    source:'predecision-incumbent-command-only'};
   this.shadowPending.push(row);
  }
  this.shadowLastNow=nowMs;this.shadowLastBusy=busy;
  return applied;
 }
 finish(endTime){
  const r=super.finish(endTime);
  for(const p of this.shadowPending){
   p.complete=false;p.futurePriority=null;p.futurePriorityEdge=null;
   this.shadowRows.push(p);
  }
  if(this.shadowRows.length!==this.c35cAttempts)throw Error('C35E missing preoffer labels');
  const offerMap=new Map(r.offers.map(o=>[o.offerId,o]));
  const rows=this.shadowRows.map(p=>{
   const o=p.assigned?offerMap.get(p.offerId):null;
   if(p.assigned&&!o)throw Error('C35E missing assigned offer');
   return {...p,interrupted:o&&o.assignedAction!=='baseline'?!!o.interrupted:null,
    executedTicks:o&&o.assignedAction!=='baseline'?o.executedTicks:null};
  });
  r.schema=C35E_SCHEMA;r.metadata.policy='shadow80';
  r.metadata.checkpoint='C35-E';
  r.metadata.macroForecastStatus='SHADOW ONLY: no preassignment veto or changed C16/C21 action';
  r.c35e={schema:C35E_SCHEMA,horizonMs:this.shadowHorizonMs,
   modelTrainingRegistrationSHA256:this.shadowModelSHA,
   source:'public incumbent predecision forecast; future public commands only as postdecision labels',
   complete:rows.filter(p=>p.complete).length,censored:rows.filter(p=>!p.complete).length,
   rows,timeline:this.shadowTimeline};
  return r;
 }
}
