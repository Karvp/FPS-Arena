'use strict';
// Register custom sites without requesting blanket all-sites access at install.
// Only explicitly approved origins get a registered content script.
const staticPatterns = new Set(FPSDomainConfig.DEFAULT_ORIGINS.map(FPSDomainConfig.matchPattern));
const registrations = new Map();
let reconcileQueue = Promise.resolve();

async function reconcile() {
  const { customDomains } = await browser.storage.local.get('customDomains');
  const desired = new Set(FPSDomainConfig.sanitizeCustomDomains(customDomains)
    .map(FPSDomainConfig.matchPattern).filter(pattern => !staticPatterns.has(pattern)));
  for (const [pattern, handle] of registrations) {
    if (!desired.has(pattern)) {
      await handle.unregister();
      registrations.delete(pattern);
    }
  }
  for (const pattern of desired) {
    if (registrations.has(pattern)) continue;
    // The user grants this particular origin via permissions.request in popup.
    if (!(await browser.permissions.contains({ origins: [pattern] }))) continue;
    try {
      const handle = await browser.contentScripts.register({
        matches: [pattern], js: [{ file: '/domain-utils.js' }, { file: '/content.js' }],
        runAt: 'document_idle', allFrames: false
      });
      registrations.set(pattern, handle);
      // Registration covers future document loads. Handle already-open tabs too.
      for (const tab of await browser.tabs.query({})) {
        if (!tab.id || !tab.url || !FPSDomainConfig.isAllowedOrigin(tab.url, customDomains)) continue;
        if (FPSDomainConfig.matchPattern(new URL(tab.url).origin) !== pattern) continue;
        try {
          await browser.tabs.executeScript(tab.id, { file: '/domain-utils.js', runAt: 'document_idle' });
          await browser.tabs.executeScript(tab.id, { file: '/content.js', runAt: 'document_idle' });
        } catch { /* restricted tab or page is navigating */ }
      }
    } catch (err) {
      console.error('[FPS Arena] Dynamic domain registration failed:', pattern, err);
    }
  }
}
function queueReconcile() {
  reconcileQueue = reconcileQueue.catch(() => {}).then(reconcile);
  return reconcileQueue;
}
browser.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.customDomains) queueReconcile();
});
browser.permissions.onAdded.addListener(queueReconcile);
browser.permissions.onRemoved.addListener(queueReconcile);
queueReconcile();

// Opt-in match telemetry. Page-world code cannot access browser storage.
// The background persists bounded records for export after a match/tab closes.
const RECORDS_KEY='fpsarenaMatchRecordsV1';
const MAX_MATCHES=30, MAX_SAMPLES=1800, MAX_EVENTS=800;
let matchArchive=[];
const liveMatches=new Map(); // sender tab id -> current match
const recordsReady=browser.storage.local.get(RECORDS_KEY)
  .then(saved=>{matchArchive=Array.isArray(saved[RECORDS_KEY])?saved[RECORDS_KEY].slice(-MAX_MATCHES).map(r=>
    r?.endedAt?r:{...r,endedAt:Date.now(),interrupted:true}):[];})
  .catch(()=>{matchArchive=[];});
let recordDirty=false;
let saveQueue=Promise.resolve();
const persistRecords=()=>{
  if(!recordDirty)return saveQueue;
  recordDirty=false;
  const snapshot=[...matchArchive,...liveMatches.values()]
    .slice(-MAX_MATCHES).map(x=>JSON.parse(JSON.stringify(x)));
  saveQueue=saveQueue.catch(()=>{}).then(()=>browser.storage.local.set({[RECORDS_KEY]:snapshot}));
  return saveQueue;
};
if(typeof setInterval==='function')setInterval(()=>{void recordsReady.then(persistRecords).catch(()=>{});},8000);
const endMatch=tab=>{
  const old=liveMatches.get(tab);
  if(!old)return;
  old.endedAt=Date.now();
  matchArchive.push(old);matchArchive=matchArchive.slice(-MAX_MATCHES);
  liveMatches.delete(tab);recordDirty=true;
};
browser.tabs?.onRemoved?.addListener(tabId=>{
  endMatch(tabId);void recordsReady.then(persistRecords).catch(()=>{});
});
browser.runtime?.onMessage?.addListener(async (message,sender)=>{
  if(!message || !String(message.type||'').startsWith('fpsarena:record:'))return undefined;
  await recordsReady;
  if(message.type==='fpsarena:record:list')return {
    active:liveMatches.size,
    records:[...matchArchive,...liveMatches.values()].slice(-MAX_MATCHES)
      .map(r=>({matchId:r.matchId,mode:r.meta.mode,startedAt:r.startedAt,endedAt:r.endedAt||null,
        samples:r.samples.length,events:r.events.length}))
  };
  if(message.type==='fpsarena:record:export-all'){
    return {records:[...matchArchive,...liveMatches.values()].slice(-MAX_MATCHES)};
  }
  if(message.type==='fpsarena:record:export'){
    const records=[...matchArchive,...liveMatches.values()];
    return {record:records[records.length-1]||null};
  }
  if(message.type==='fpsarena:record:clear'){
    liveMatches.clear();matchArchive=[];recordDirty=true;
    // Clearing history should not secretly disable automatic recording.
    await persistRecords();return {ok:true};
  }
  if(message.type!=='fpsarena:record:append')return undefined;
  const tab=sender.tab?.id, raw=message.payload;
  if(!Number.isInteger(tab)||!raw || typeof raw!=='object')return {ok:false};
  // No other-site telemetry; only the user's explicitly allowlisted game origin.
  const {customDomains,options}=await browser.storage.local.get(['customDomains','options']);
  if(!options?.recordMatches || !FPSDomainConfig.isAllowedOrigin(sender.url||'',customDomains))return {ok:false,reason:'not-enabled-or-origin'};
  if(!['start','sample','event','end'].includes(raw.kind))return {ok:false};
  const id=String(raw.matchId||'').slice(0,72);
  if(!id)return {ok:false};
  let current=liveMatches.get(tab);
  if(raw.kind==='start'){
    if(current?.matchId===id)return {ok:true};
    endMatch(tab);
    const meta=raw.meta && typeof raw.meta==='object' ? {
      mode:String(raw.meta.mode||'unknown').slice(0,32),
      map:String(raw.meta.map||'unknown').slice(0,64),format:'fpsarena-match-telemetry-v1'
    } : {mode:'unknown',map:'unknown',format:'fpsarena-match-telemetry-v1'};
    current={matchId:id,meta,startedAt:Number.isFinite(raw.startedAt)?raw.startedAt:Date.now(),endedAt:null,samples:[],events:[]};
    liveMatches.set(tab,current);recordDirty=true;return {ok:true};
  }
  if(!current || current.matchId!==id)return {ok:false,reason:'match-not-started'};
  if(raw.kind==='end'){endMatch(tab);void persistRecords();return {ok:true};}
  if(raw.kind==='sample' && raw.sample && current.samples.length<MAX_SAMPLES){
    current.samples.push(raw.sample);recordDirty=true;
  }
  if(raw.kind==='event' && raw.event && current.events.length<MAX_EVENTS){
    current.events.push(raw.event);recordDirty=true;
  }
  return {ok:true};
});

browser.storage.onChanged.addListener((changes,area)=>{
  if(area!=='local'||!changes.options)return;
  if(changes.options.newValue?.recordMatches)return;
  for(const tab of liveMatches.keys())endMatch(tab);
  void recordsReady.then(persistRecords).catch(()=>{});
});
