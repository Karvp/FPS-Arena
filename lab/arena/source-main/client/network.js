// Socket.IO wrapper: connection, clock sync, rtt/ping, traffic statistics.
import { INTERP_DELAY } from '/shared/constants.js';

export class Net {
  constructor() {
    this.socket = null; this.id = null; this.rtt = 0; this.offset = 0; this.synced = false; this.h = {};
    this.stats = { snapsSec: 0, inputsSec: 0, snaps: 0, inputs: 0, ack: 0, pending: 0, recon: 0, lastSnapT: 0, jitter: 0 };
    setInterval(() => { this.stats.snapsSec = this.stats.snaps; this.stats.inputsSec = this.stats.inputs; this.stats.snaps = 0; this.stats.inputs = 0; }, 1000);
    setInterval(() => this.ping(), 1000);
  }
  on(ev, fn) { (this.h[ev] ||= []).push(fn); }
  fire(ev, d) { (this.h[ev] || []).forEach(f => f(d)); }
  get connected() { return !!(this.socket && this.socket.connected); }
  serverNow() { return performance.now() / 1000 + this.offset; }
  renderTime() { return this.serverNow() - INTERP_DELAY; }
  connect(name, room = 'classic') {
    return new Promise((resolve, reject) => {
      if (typeof io === 'undefined') return reject(new Error('Socket.IO client not loaded - is the server running?'));
      if (this.socket) { try { this.socket.disconnect(); } catch (e) { /* ignore */ } }
      const s = this.socket = io({ transports: ['websocket', 'polling'], reconnection: false });
      const to = setTimeout(() => reject(new Error('Connection timed out')), 6000);
      s.on('connect_error', (e) => { clearTimeout(to); reject(new Error('Cannot reach server: ' + e.message)); });
      s.on('disconnect', () => { if (this.socket === s) this.fire('disconnect'); });
      for (const ev of ['lobby', 'lobby:denied', 'match:start', 'match:end', 'ents', 'place', 'score', 'skill', 'throw', 'boom', 'pulse', 'shot', 'hit', 'dmg', 'kill', 'announce', 'kupi', 'kupi:death', 'dsr']) s.on(ev, (d) => this.fire(ev, d));
      s.on('snap', (d) => {
        const now = performance.now() / 1000, est = d.t + this.rtt / 2000 - now;
        if (!this.synced) { this.offset = est; this.synced = true; } else this.offset += (est - this.offset) * 0.05;
        this.stats.snaps++; this.stats.lastSnapT = now; this.stats.ack = d.ack; this.fire('snap', d);
      });
      s.on('connect', () => {
        const t0 = performance.now();
        s.emit('join', { name, room }, (r) => {
          clearTimeout(to);
          if (!r || !r.ok) return reject(new Error('Join refused'));
          this.id = r.id; this.rtt = performance.now() - t0; this.offset = r.t + this.rtt / 2000 - performance.now() / 1000; this.synced = true; resolve(r);
        });
      });
    });
  }
  ping() { if (!this.connected) return; const t0 = performance.now(); this.socket.emit('rtt', (st) => { const r = performance.now() - t0; this.rtt += (r - this.rtt) * 0.3; const est = st + r / 2000 - performance.now() / 1000; this.offset += (est - this.offset) * 0.1; }); }
  emit(ev, d) { if (this.connected) this.socket.emit(ev, d); }
  sendInput(i) { if (this.connected) { this.socket.volatile.emit('input', i); this.stats.inputs++; } }
  disconnect() { const s = this.socket; this.socket = null; this.id = null; this.synced = false; if (s) s.disconnect(); }
}
