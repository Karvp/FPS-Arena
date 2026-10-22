// Isolated-world extension bridge. No elevated API reaches the game's JS realm.
(async () => {
  const GAME_SELECTOR = '#gl, #hud';
  const config = typeof FPSDomainConfig !== 'undefined' ? FPSDomainConfig : null;
  if (!config) return;
  // Match patterns cannot narrow by port, so enforce the exact saved origin here.
  let settings;
  try { settings = await browser.storage.local.get(['customDomains', 'options']); }
  catch { return; }
  if (!config.isAllowedOrigin(location.href, settings.customDomains)) return;
  const isGame = document.querySelector('#gl') && document.querySelector('#hud') &&
    Array.from(document.scripts).some(s => {
      try { return new URL(s.src, location.href).pathname === '/client/main.js'; }
      catch { return false; }
    });
  if (!isGame) return;
  // executeScript on an already-open tab can race with automatic registration.
  if (globalThis.__fpsArenaSuiteContentLoaded) return;
  globalThis.__fpsArenaSuiteContentLoaded = true;
  let state = { state: 'connecting', message: 'Connecting to FPS Arena', tracking: false };
  let sentOptions = null;
  let initialConfigSent = false;
  let recorderDelivery=Promise.resolve();
  const dispatch = (name, payload) => document.dispatchEvent(new CustomEvent(`fpsarena-aim:${name}`, { detail: JSON.stringify(payload) }));
  const sync = (raw) => { sentOptions = raw || {}; dispatch('config', sentOptions); };
  document.addEventListener('fpsarena-aim:status', (e) => {
    try {
      const data = JSON.parse(e.detail);
      if (data && ['ready', 'connecting', 'error'].includes(data.state)) {
        state = { state: data.state, message: String(data.message || '').slice(0, 160), tracking: data.tracking === true };
        if (!initialConfigSent && data.state === 'ready' && data.message === 'Connected to FPS Arena') {
          initialConfigSent = true; sync(sentOptions);
        }
      }
    } catch (_) { /* malformed page event */ }
  });
  // The page may emit bounded, user-opted-in telemetry. The isolated content
  // world is the only bridge to extension background storage. Never upload it.
  document.addEventListener('fpsarena-aim:record', (e) => {
    try {
      if(!sentOptions?.recordMatches || typeof e.detail!=='string' || e.detail.length>20000)return;
      const payload=JSON.parse(e.detail);
      if(payload && ['start','sample','event','end'].includes(payload.kind)) {
        // Order is vital: sample arriving before start is rejected by background.
        recorderDelivery=recorderDelivery.catch(()=>{}).then(()=>browser.runtime.sendMessage({type:'fpsarena:record:append',payload}))
          .then(reply=>{if(reply?.ok===false && !globalThis.__fpsRecorderErrorReported){
            globalThis.__fpsRecorderErrorReported=true; console.warn('[FPS Arena Recorder] event rejected:',reply.reason||'unknown');
          }}).catch(err=>{if(!globalThis.__fpsRecorderErrorReported){globalThis.__fpsRecorderErrorReported=true;console.warn('[FPS Arena Recorder]',err);}});
      }
    } catch(_) { /* ignore unexpected page event */ }
  });
  document.addEventListener('fpsarena-aim:toggled', (e) => {
    try {
      const data = JSON.parse(e.detail);
      if (typeof data?.enabled === 'boolean') {
        browser.storage.local.get('options').then(({ options }) =>
          browser.storage.local.set({ options: { ...(options || {}), enabled: data.enabled } }));
      }
    } catch (_) { /* ignore */ }
  });
  browser.runtime.onMessage.addListener((message) => {
    if (message?.type === 'fpsarena:status') return Promise.resolve({ ...state, found: true });
    if (message?.type === 'fpsarena:ping') { dispatch('ping', {}); return Promise.resolve({ ...state, found: true }); }
  });
  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.customDomains && !config.isAllowedOrigin(location.href, changes.customDomains.newValue)) {
      // Disable the page agent if this origin has been removed from the allowlist.
      sync({ enabled:false, esp:false, radar:false, dodge:false, trigger:false,
        tactical:false, autoPeek:false, pathfinding:false, autoReload:false,
        autoSwitch:false, autoArmor:false, grenadeAssist:false, mode:'assist' });
      state = { state:'error', message:'Tên miền đã bị xóa — tải lại tab để gỡ extension khỏi trang', tracking:false };
      return;
    }
    if (changes.options) sync(changes.options.newValue);
  });
  Promise.resolve(settings.options).then(options => {
    sentOptions = options || {};
    // Native page does not supply a CSP that would forbid module script injection.
    return fetch(browser.runtime.getURL('page-agent.js')).then(r => {
      if (!r.ok) throw new Error('Cannot load page agent');
      return r.text();
    });
  }).then(source => {
    if (!document.querySelector(GAME_SELECTOR)) return;
    const s = document.createElement('script');
    s.type = 'module';
    s.textContent = source;
    (document.head || document.documentElement).appendChild(s);
    s.remove();
    // Async imports may finish after these events; retry settings to close the race.
    const apply = () => sync(sentOptions);
    setTimeout(apply, 200);
    setTimeout(apply, 1200);
    setTimeout(() => { if (state.state === 'connecting') state = { state: 'error', message: 'Game modules unavailable or page injection blocked', tracking: false }; }, 6000);
  }).catch(e => { state = { state: 'error', message: String(e.message || e), tracking: false }; });
})();
