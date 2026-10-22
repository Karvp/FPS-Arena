// Authoritative, observational fixed-horizon windows following *selected* director commands.
// This is NOT a counterfactual estimator. Samples can overlap and share server events.
const validTime=x=>Number.isFinite(x)&&x>=0;
const counters=()=>({shots:0,hits:0,kills:0,deaths:0,damageTaken:0,damageDealt:0,metersMoved:0,fireInputTicks:0});
const round=x=>Number(x.toFixed(4));
export class DirectorOutcomeRecorder {
 constructor({horizonSeconds=5,maxPlans=200}={}){
  if(!Number.isFinite(horizonSeconds)||horizonSeconds<=0||horizonSeconds>60 ||
     !Number.isInteger(maxPlans)||maxPlans<1||maxPlans>5000)throw Error('Invalid recorder bounds');
  this.horizonSeconds=horizonSeconds;this.maxPlans=maxPlans;this.windows=[];
  this.active=null;this.dropped=0;
 }
 directorEvent(e){
  if(!validTime(e?.t)||!Number.isInteger(e.planId)||e.planId<1)return;
  if(e.state==='director-planned'&&e.active===true){
   // Only a selected command will produce an observation; pending plans are not labels.
   if(this.windows.length>=this.maxPlans){this.dropped++;return;}
   this.windows.push({planId:e.planId,type:e.type??null,targetId:e.targetId??null,
    plannedAt:e.t,selectedAt:null,ownershipEndedAt:null,terminationReason:null,
    utility:Number.isFinite(e.utility)?e.utility:null,risk:Number.isFinite(e.risk)?e.risk:null,
    plannedETA:Number.isFinite(e.timeToFire)?e.timeToFire:null,
    terminalETA:Number.isFinite(e.terminalTimeToFire)?e.terminalTimeToFire:null,
    routeLength:Number.isFinite(e.routeLength)?e.routeLength:null,
    uncertainty:Number.isFinite(e.uncertainty)?e.uncertainty:null,
    earlyShotWindow:e.earlyShotWindow===true,
    duringOwnership:counters(),afterOwnership:counters(),total:counters()});
   return;
  }
  if(e.state==='director-command-selected'){
   const record=[...this.windows].reverse().find(w=>w.planId===e.planId&&w.selectedAt===null);
   if(record){record.selectedAt=e.t;this.active=record;}
   return;
  }
  if(e.state==='director-outcome'){
   const record=[...this.windows].reverse().find(w=>w.planId===e.planId&&w.selectedAt!==null&&w.ownershipEndedAt===null);
   if(record){record.ownershipEndedAt=Math.max(record.selectedAt,e.t);record.terminationReason=e.reason??null;
    if(this.active===record)this.active=null;}
  }
 }
 #apply(time,field,value){
  if(!validTime(time)||!Number.isFinite(value)||value<0)return;
  for(const w of this.windows){
   if(w.selectedAt===null||time+1e-8<w.selectedAt||time>=w.selectedAt+this.horizonSeconds-1e-8)continue;
   w.total[field]+=value;
   const subgroup=w.ownershipEndedAt===null||time<w.ownershipEndedAt-1e-8?'duringOwnership':'afterOwnership';
   w[subgroup][field]+=value;
  }
 }
 serverEvent(time,type,data){
  if(type==='shot'&&data?.id==='trainee')this.#apply(time,'shots',1);
  if(type==='hit'){
   this.#apply(time,'hits',1);
   this.#apply(time,'damageDealt',Number(data?.dmg)||0);
  }
  if(type==='dmg')this.#apply(time,'damageTaken',Math.max(0,Number(data?.h)||0)+Math.max(0,Number(data?.a)||0));
  if(type==='kill'){
   if(data?.k==='trainee')this.#apply(time,'kills',1);
   if(data?.v==='trainee')this.#apply(time,'deaths',1);
  }
 }
 control(time,command){if(command?.fire)this.#apply(time,'fireInputTicks',1);}
 displacement(time,meters){this.#apply(time,'metersMoved',meters);}
 finish(matchEnd){
  if(!validTime(matchEnd))throw Error('Invalid match end');
  const out=this.windows.filter(w=>w.selectedAt!==null).map(w=>{
   const end=Math.min(matchEnd,w.selectedAt+this.horizonSeconds);
   const ownedEnd=w.ownershipEndedAt??matchEnd;
   const copyCounters=o=>Object.fromEntries(Object.entries(o).map(([k,v])=>[k,round(v)]));
   return {planId:w.planId,type:w.type,targetId:w.targetId,plannedAt:w.plannedAt,
    selectedAt:w.selectedAt,ownershipEndedAt:round(Math.min(ownedEnd,matchEnd)),
    ownershipCensored:w.ownershipEndedAt===null||w.ownershipEndedAt>matchEnd,
    terminationReason:w.terminationReason,observationEnd:round(end),
    observedSeconds:round(Math.max(0,end-w.selectedAt)),horizonSeconds:this.horizonSeconds,
    horizonComplete:matchEnd+1e-8>=w.selectedAt+this.horizonSeconds,
    utility:w.utility,risk:w.risk,plannedETA:w.plannedETA,terminalETA:w.terminalETA,
    routeLength:w.routeLength,uncertainty:w.uncertainty,earlyShotWindow:w.earlyShotWindow,
    duringOwnership:copyCounters(w.duringOwnership),afterOwnership:copyCounters(w.afterOwnership),
    observedTotal:copyCounters(w.total),overlappingHorizon:false};
  });
  for(let i=0;i<out.length;i++)for(let j=i+1;j<out.length;j++){
   if(out[j].selectedAt<out[i].observationEnd && out[i].selectedAt<out[j].observationEnd){
    out[i].overlappingHorizon=true;out[j].overlappingHorizon=true;
   }
  }
  return out;
 }
}
