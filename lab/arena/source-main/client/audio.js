// WebAudio synthesised sound effects (no external files).
import { settings } from './settings.js';
let ctx = null, master = null;
function ac() { if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); master = ctx.createGain(); master.connect(ctx.destination); } catch (e) { return null; } } if (ctx.state === 'suspended') ctx.resume(); master.gain.value = settings.volume; return ctx; }
function noise(dur, f0, f1, vol, type = 'lowpass', q = 1) {
  const c = ac(); if (!c) return; const n = c.sampleRate * dur, buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2);
  const s = c.createBufferSource(); s.buffer = buf; const f = c.createBiquadFilter(); f.type = type; f.Q.value = q; f.frequency.setValueAtTime(f0, c.currentTime); f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), c.currentTime + dur);
  const g = c.createGain(); g.gain.value = vol; s.connect(f); f.connect(g); g.connect(master); s.start();
}
function tone(freq, dur, vol, type = 'sine', slide = 0) {
  const c = ac(); if (!c) return; const o = c.createOscillator(), g = c.createGain(); o.type = type; o.frequency.setValueAtTime(freq, c.currentTime);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), c.currentTime + dur);
  g.gain.setValueAtTime(vol, c.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur); o.connect(g); g.connect(master); o.start(); o.stop(c.currentTime + dur);
}
// Recorded sound files (assets/audio/*). Loaded + decoded once; a missing / undecodable file is reported loudly (console + callback), never silently ignored.
const buffers = new Map(), loading = new Map(); let kupiSrc = null, kupiTimer = 0;
function loadFile(url, onError) {
  if (buffers.has(url)) return Promise.resolve(buffers.get(url));
  if (!loading.has(url)) {
    const c = ac();
    loading.set(url, !c ? Promise.resolve(null) : fetch('/' + url).then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.arrayBuffer(); }).then(b => c.decodeAudioData(b))
      .then(buf => { buffers.set(url, buf); return buf; })
      .catch(e => { loading.delete(url); console.error(`[AUDIO] FAILED: ${url} / ${e && e.message ? e.message : e}`); onError && onError(url, e); return null; }));
  }
  return loading.get(url);
}
function playBuffer(buf, vol, loop) {
  const c = ac(); if (!c || !buf) return null;
  const s = c.createBufferSource(), g = c.createGain(); s.buffer = buf; s.loop = !!loop; g.gain.value = vol; s.connect(g); g.connect(master); s.start(); return s;
}
export const Audio = {
  unlock() { ac(); },
  shot(w, own = true) {
    const v = own ? 1 : 0.5;
    if (w.id === 'laser_rifle') return tone(1400, 0.12, 0.18 * v, 'sawtooth', -1000);
    if (w.suppressed) return noise(0.07, 1800, 400, 0.14 * v);                                   // suppressor: a quiet puff
    if (w.laser) { tone(220, 0.6, 0.45 * v, 'sawtooth', 900); noise(0.5, 4000, 200, 0.5 * v); return; }
    if (w.cat === 'Sniper') { noise(0.45, 3000, 100, 0.9 * v); tone(70, 0.3, 0.6 * v, 'sine', -30); return; }
    if (w.cat === 'Shotgun') { noise(0.3, 2500, 120, 0.9 * v); tone(90, 0.2, 0.5 * v, 'sine', -50); return; }
    if (w.cat === 'Pistol') { noise(0.08, 3000, 500, 0.3 * v); tone(160, 0.06, 0.2 * v, 'sine', -60); return; }
    if (/mp5sd|honey|aek919k/.test(w.id)) return noise(0.09, 2500, 500, 0.35 * v);
    noise(w.cat === 'SMG' ? 0.1 : 0.16, 3500, 200, 0.55 * v); tone(w.cat === 'LMG' ? 80 : 110, 0.09, 0.3 * v, 'sine', -40);
  },
  swing() { noise(0.18, 2500, 500, 0.35, 'bandpass', 0.8); tone(260, 0.12, 0.1, 'sine', -140); },
  dry() { tone(900, 0.03, 0.1, 'square'); },
  reload() { tone(300, 0.05, 0.15, 'square'); setTimeout(() => tone(500, 0.05, 0.15, 'square'), 350); setTimeout(() => noise(0.06, 3000, 800, 0.2), 900); },
  hit(kind) { if (kind === 'kill') { tone(1200, 0.12, 0.3, 'triangle'); setTimeout(() => tone(1700, 0.16, 0.3, 'triangle'), 70); } else if (kind === 'head') tone(1500, 0.08, 0.3, 'triangle'); else if (kind === 'armor') tone(600, 0.06, 0.25, 'square'); else tone(1000, 0.05, 0.22, 'triangle'); },
  hurt() { noise(0.15, 500, 100, 0.5); tone(120, 0.15, 0.3, 'sine', -60); },
  plate() { tone(400, 0.6, 0.12, 'sawtooth', 200); },
  step() { noise(0.05, 400, 100, 0.06); },
  beep(hi) { tone(hi ? 1500 : 900, 0.08, 0.2, 'square'); },
  go() { tone(600, 0.25, 0.25, 'triangle', 400); },
  explosion() { noise(1.4, 900, 40, 1.0); tone(50, 0.9, 0.8, 'sine', -25); },
  pulse() { tone(300, 0.6, 0.25, 'sawtooth', 700); },
  skill() { tone(500, 0.18, 0.25, 'triangle', 500); setTimeout(() => tone(900, 0.2, 0.2, 'triangle', 300), 90); },
  throwSfx() { noise(0.12, 800, 300, 0.2); },
  boom(v = 1) { noise(0.9, 1200, 50, 0.8 * v); tone(70, 0.5, 0.6 * v, 'sine', -35); },
  ui() { tone(700, 0.04, 0.12, 'triangle'); },
  preloadFiles(urls, onError) { return Promise.all(urls.map(u => loadFile(u, onError))); },
  // Iphone Kupi: the file loops for `dur` seconds at a loud, fixed gain (master volume still applies); a new activation restarts it
  async startKupi(url, dur, vol, onError) {
    this.stopKupi(); const buf = await loadFile(url, onError); if (!buf) return;
    this.stopKupi(); kupiSrc = playBuffer(buf, vol, true); kupiTimer = setTimeout(() => this.stopKupi(), dur * 1000);
  },
  stopKupi() { clearTimeout(kupiTimer); if (kupiSrc) { try { kupiSrc.stop(); } catch (e) { /* already stopped */ } kupiSrc = null; } },
  async playOnce(url, vol, onError) { const buf = await loadFile(url, onError); if (buf) playBuffer(buf, vol, false); },
};
