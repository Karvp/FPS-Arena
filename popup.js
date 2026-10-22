'use strict';
const DEFAULTS = { enabled:false, activation:'ads', holdKey:'KeyH', switchWeaponKey:'KeyV', target:'head', fov:15, smoothing:90, maxDistance:130, visibility:true, sticky:true, showRing:true, esp:false, espDistance:120, espNames:true, dodge:false, dodgeRange:45,smartCover:true,enemyAmmoAwareness:true,cameraTactics:true,reloadCover:true,peekLongDelay:true,mode:'assist',prediction:false,predictionMs:65,priority:'crosshair',trigger:false,recoil:false,radar:false,radarRange:90,tactical:false,autoPeek:false,pathfinding:false,routeCommitment:true,macroTargetCommitment:true,macroCombat2:false,occludedPursuitLab:false,peekCacheLab:false,predictiveEvasion:false,combatCoverPressure:false,autoReload:false,autoSwitch:false,autoArmor:false,autoSkills:true,autoThrowables:true,sidearmEmergencyRange:10,proMovement:true,autoSlide:true,autoCrouch:true,evasiveCrouch:true,fastAim:true,adaptiveADS:true,armorQuietSeconds:5,reloadQuietSeconds:3.5,autoLoot:true,lootRange:55,zombieSpacing:22,brAggression:80,brLeadSeconds:24,weaponTactics:true,teamCoordination:true,grenadeAssist:false,recordMatches:false,multiTarget:false,engageRange:16 };
const keys = Object.keys(DEFAULTS);
const inputs = Object.fromEntries(keys.map(k => [k, document.getElementById(k)]));
const outFov = document.getElementById('fovOut');
const outSmooth = document.getElementById('smoothingOut');
const status = document.getElementById('status');
const indicator = document.querySelector('.status');
const saved = document.getElementById('saved');
let options = { ...DEFAULTS };
let saveTimer = null;
let customDomains = [];
let lastDomainNotice = '';
function render() {
  for (const k of keys) {
    const el = inputs[k];
    if (el.type === 'checkbox') el.checked = !!options[k];
    else el.value = String(options[k]);
  }
  document.getElementById('hold-group').hidden = options.activation !== 'hold';
  outFov.textContent = `${options.fov}°`;
  outSmooth.textContent = options.smoothing === 0 ? 'Instant' : `${options.smoothing} ms`;
  document.getElementById('predictionMsOut').textContent = `${options.predictionMs} ms`;
}
async function showStatus() {
  try {
    const [tab] = await browser.tabs.query({ active:true, currentWindow:true });
    const s = await browser.tabs.sendMessage(tab.id, { type:'fpsarena:status' });
    if (!s?.found) throw Error('Not connected');
    status.textContent = s.message || 'FPS Arena detected';
    indicator.className = `status ${s.state === 'ready' ? 'good' : s.state === 'error' ? 'bad' : ''}`;
  } catch (_) {
    const [tab] = await browser.tabs.query({ active:true, currentWindow:true });
    if (tab?.url && !FPSDomainConfig.isAllowedOrigin(tab.url, customDomains))
      status.textContent = 'Trang chưa được cho phép — thêm tên miền bên dưới';
    else status.textContent = 'Không nhận diện được FPS Arena — kiểm tra bản web và tải lại trang';
    indicator.className = 'status bad';
  }
}
async function save() {
  try { await browser.storage.local.set({ options }); saved.textContent = 'Đã lưu'; }
  catch { saved.textContent = 'Không lưu được cài đặt'; }
}
for (const [k, el] of Object.entries(inputs)) {
  el.addEventListener(el.type === 'range' ? 'input' : 'change', () => {
    options = { ...options, [k]: el.type === 'checkbox' ? el.checked : el.type === 'range' || ['maxDistance','espDistance','dodgeRange','radarRange','engageRange','lootRange','zombieSpacing','reloadQuietSeconds','brAggression','brLeadSeconds','sidearmEmergencyRange'].includes(k) ? Number(el.value) : el.value };
    render(); saved.textContent = 'Đang lưu…';
    clearTimeout(saveTimer); saveTimer = setTimeout(save, el.type === 'range' ? 100 : 0);
  });
}
browser.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.options) {
    options = { ...DEFAULTS, ...(changes.options.newValue || {}) }; render();
  }
});
browser.storage.local.get('options').then(({ options: savedOpts }) => {
  options = { ...DEFAULTS, ...(savedOpts || {}) }; render();
}).catch(() => render());
document.getElementById('presetAll').addEventListener('click', () => {
  options = { ...options,enabled:true,mode:'autopilot',activation:'always',fov:35,smoothing:35,
    prediction:true,priority:'threat',trigger:true,recoil:true,esp:true,dodge:true,smartCover:true,enemyAmmoAwareness:true,cameraTactics:true,reloadCover:true,peekLongDelay:true,radar:true,
    tactical:true,autoPeek:true,pathfinding:true,routeCommitment:true,macroTargetCommitment:true,macroCombat2:false,autoReload:true,autoSwitch:true,autoArmor:true,autoSkills:true,autoThrowables:true,sidearmEmergencyRange:10,proMovement:true,autoSlide:true,autoCrouch:true,evasiveCrouch:true,fastAim:true,adaptiveADS:true,armorQuietSeconds:5,reloadQuietSeconds:3.5,autoLoot:true,lootRange:55,zombieSpacing:22,brAggression:80,brLeadSeconds:24,weaponTactics:true,teamCoordination:true,grenadeAssist:true,multiTarget:true };
  render();save();
});
document.getElementById('presetOff').addEventListener('click', () => {
  options = { ...options,enabled:false,mode:'assist',trigger:false,recoil:false,esp:false,dodge:false,radar:false,
    tactical:false,autoPeek:false,pathfinding:false,routeCommitment:true,autoReload:false,autoSwitch:false,autoArmor:false,autoSkills:false,autoThrowables:false,sidearmEmergencyRange:10,proMovement:true,autoSlide:true,autoCrouch:true,evasiveCrouch:true,fastAim:true,adaptiveADS:true,armorQuietSeconds:5,reloadQuietSeconds:3.5,autoLoot:true,lootRange:55,zombieSpacing:22,brAggression:80,brLeadSeconds:24,weaponTactics:true,teamCoordination:false,grenadeAssist:false,prediction:false,multiTarget:false };
  render();save();
});
showStatus();
setInterval(showStatus, 1800);


// Domain management uses a separate storage key; existing combat options are preserved.
const domainInput = document.getElementById('domainInput');
const domainList = document.getElementById('domainList');
const domainFeedback = document.getElementById('domainFeedback');
const domainForm = document.getElementById('domainForm');
const domainAdd = document.getElementById('domainAdd');
function noticeDomain(message, error = false) {
  lastDomainNotice = message;
  domainFeedback.textContent = message;
  domainFeedback.classList.toggle('error', error);
}
function renderDomains() {
  domainList.replaceChildren();
  const defaultSet = new Set(FPSDomainConfig.DEFAULT_ORIGINS);
  for (const origin of [...FPSDomainConfig.DEFAULT_ORIGINS, ...customDomains]) {
    const item = document.createElement('div');
    item.className = 'domain-item';
    const name = document.createElement('span');
    name.className = 'domain-origin';
    name.textContent = origin;
    item.append(name);
    if (defaultSet.has(origin)) {
      const tag = document.createElement('span');
      tag.className = 'domain-tag'; tag.textContent = 'Mặc định';
      item.append(tag);
    } else {
      const btn = document.createElement('button');
      btn.type = 'button'; btn.textContent = 'Xóa';
      btn.setAttribute('aria-label', `Xóa ${origin}`);
      btn.addEventListener('click', () => removeCustomDomain(origin));
      item.append(btn);
    }
    domainList.append(item);
  }
}
async function removeCustomDomain(origin) {
  const next = customDomains.filter(d => d !== origin);
  const pattern = FPSDomainConfig.matchPattern(origin);
  customDomains = next;
  try {
    await browser.storage.local.set({ customDomains: next });
    // A pattern can be shared by multiple origin+port entries.
    const retained = [...FPSDomainConfig.DEFAULT_ORIGINS, ...next]
      .some(d => FPSDomainConfig.matchPattern(d) === pattern);
    if (!retained) {
      try { await browser.permissions.remove({ origins:[pattern] }); }
      catch { /* unable to revoke; registration is still removed */ }
    }
    noticeDomain('Đã xóa tên miền. Tải lại tab đó để dừng script đang hoạt động.');
    renderDomains();
  } catch {
    customDomains = [...next, origin];
    noticeDomain('Không lưu được thay đổi tên miền.', true);
    renderDomains();
  }
}
domainForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  let origin;
  try { origin = FPSDomainConfig.normalizeOrigin(domainInput.value); }
  catch (error) { noticeDomain(error.message, true); return; }
  if (FPSDomainConfig.DEFAULT_ORIGINS.includes(origin) || customDomains.includes(origin)) {
    noticeDomain('Tên miền này đã có trong danh sách.'); return;
  }
  if (customDomains.length >= FPSDomainConfig.MAX_CUSTOM_ORIGINS) {
    noticeDomain('Đã đạt giới hạn 25 tên miền.', true); return;
  }
  const pattern = FPSDomainConfig.matchPattern(origin);
  const predefined = FPSDomainConfig.DEFAULT_ORIGINS.some(d => FPSDomainConfig.matchPattern(d) === pattern);
  // The request must originate in this click/submit handler (Firefox gesture requirement).
  // Existing approval of the same host (e.g. another port) is reused.
  let granted = predefined;
  if (!granted) {
    try { granted = await browser.permissions.request({ origins:[pattern] }); }
    catch (error) { noticeDomain(`LibreWolf từ chối quyền: ${error.message}`, true); return; }
  }
  if (!granted) { noticeDomain('Chưa cấp quyền truy cập tên miền.', true); return; }
  domainAdd.disabled = true;
  try {
    customDomains = [...customDomains, origin];
    await browser.storage.local.set({ customDomains });
    renderDomains();
    domainInput.value = '';
    noticeDomain('Đã thêm. Nếu trang đã mở, tải lại tab để kích hoạt extension.');
    showStatus();
  } catch {
    customDomains = customDomains.filter(d => d !== origin);
    noticeDomain('Không lưu được tên miền.', true);
  } finally { domainAdd.disabled = false; }
});
document.getElementById('domainFromTab').addEventListener('click', async () => {
  try {
    const [tab] = await browser.tabs.query({ active:true, currentWindow:true });
    domainInput.value = FPSDomainConfig.normalizeOrigin(tab.url);
    domainInput.focus();
    noticeDomain('Kiểm tra địa chỉ rồi bấm Thêm để cấp quyền.');
  } catch { noticeDomain('Tab hiện tại không có địa chỉ HTTP(S) hợp lệ.', true); }
});
browser.storage.local.get('customDomains').then(({ customDomains: savedDomains }) => {
  customDomains = FPSDomainConfig.sanitizeCustomDomains(savedDomains);
  renderDomains(); showStatus();
}).catch(() => renderDomains());
browser.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.customDomains) {
    customDomains = FPSDomainConfig.sanitizeCustomDomains(changes.customDomains.newValue);
    renderDomains(); showStatus();
  }
});

// Match telemetry export stays on the local machine. The record file never
// contains the page DOM, authentication state, microphone or screen capture.
const recordStatus=document.getElementById('recordStatus');
async function refreshRecords(){
  try {
    const reply=await browser.runtime.sendMessage({type:'fpsarena:record:list'});
    const records=reply?.records||[];
    const last=records[records.length-1];
    recordStatus.textContent=last ?
      `${records.length} trận lưu · mới nhất: ${last.mode} · ${last.samples} mẫu · ${last.events} sự kiện${last.endedAt?'':' · đang ghi'}` :
      'Chưa ghi trận nào. Bật Match Recorder rồi tham gia trận.';
  } catch(error){recordStatus.textContent='Không thể đọc bản ghi: '+error.message;}
}
document.getElementById('exportRecord').addEventListener('click',async()=>{
  try {
    const {record}=await browser.runtime.sendMessage({type:'fpsarena:record:export'});
    if(!record){recordStatus.textContent='Chưa có bản ghi để xuất.';return;}
    const blob=new Blob([JSON.stringify(record,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download=`fpsarena-match-${String(record.startedAt||Date.now())}.json`;
    document.body.append(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),3000);
    recordStatus.textContent=`Đã chuẩn bị xuất ${record.samples.length} mẫu telemetry.`;
  } catch(error){recordStatus.textContent='Xuất thất bại: '+error.message;}
});
document.getElementById('exportAllRecords').addEventListener('click',async()=>{
  try{
    const {records}=await browser.runtime.sendMessage({type:'fpsarena:record:export-all'});
    if(!records?.length){recordStatus.textContent='Chưa có trận nào để xuất.';return;}
    const blob=new Blob([JSON.stringify({format:'fpsarena-record-bundle-v2',exportedAt:new Date().toISOString(),records},null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download=`fpsarena-all-matches-${Date.now()}.json`;document.body.append(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),3000);recordStatus.textContent=`Đã chuẩn bị xuất ${records.length} trận.`;
  }catch(error){recordStatus.textContent='Xuất dữ liệu thất bại: '+error.message;}
});
document.getElementById('clearRecords').addEventListener('click',async()=>{
  if(!confirm('Xóa tất cả bản ghi trận trong extension?'))return;
  try {await browser.runtime.sendMessage({type:'fpsarena:record:clear'});await refreshRecords();}
  catch(error){recordStatus.textContent='Xóa thất bại: '+error.message;}
});
refreshRecords();

// Offline telemetry viewer.  No upload, no network request and no game access.
document.getElementById('openReplayLab')?.addEventListener('click',()=>{
  browser.tabs.create({url:browser.runtime.getURL('lab/replay.html')});
});
