// MERGED-CLIENT SMOKE TEST: runs the real client Game (prediction, viewmodel + attachments, laser beams, HUD data, remote players, bodies, streak views)
// in node against a THREE stub, wired to a REAL server Game over fake sockets. Catches runtime errors the syntax check and the server tests cannot see.
// Run: npm run smoke   (this file is run after tools/smoke/smoke.mjs)
const el = () => new Proxy({ classList: { add() {}, remove() {}, toggle() {}, contains: () => false }, style: { setProperty() {} }, dataset: {}, children: [], innerHTML: '', textContent: '', value: '', hidden: false, width: 0, height: 0 },
  { get: (t, k) => (k in t ? t[k] : (typeof k === 'string' ? () => el() : undefined)), set: (t, k, v) => { t[k] = v; return true; } });
globalThis.document = { createElement: () => el(), getElementById: () => el(), querySelector: () => el(), querySelectorAll: () => [], body: el(), addEventListener() {} };
globalThis.innerWidth = 1280; globalThis.innerHeight = 720; globalThis.localStorage = { getItem: () => null, setItem() {} }; globalThis.window = globalThis; globalThis.addEventListener = () => {};
globalThis.AudioContext = class { constructor() { this.currentTime = 0; this.destination = {}; this.sampleRate = 44100; } createGain() { return { gain: { value: 1, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} }; } createOscillator() { return { frequency: { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, start() {}, stop() {} }; } createBufferSource() { return { connect() {}, start() {}, stop() {}, buffer: null }; } createBuffer(c, n) { return { getChannelData: () => new Float32Array(n) }; } createBiquadFilter() { return { frequency: { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} }, Q: { value: 0 }, connect() {} }; } resume() {} };
const { Game: Server } = await import('../../server/game.js'); const { Game: Client } = await import('../../client/game.js');
const { ATT, attString } = await import('../../shared/attachments.js'); const { WEAPONS } = await import('../../shared/weapons.js');
const { prepared } = await import('./stubs.mjs'); const { buildProcedural } = await import('./stubs.mjs');
class FS { constructor(id) { this.id = id; this.h = {}; this.log = []; } on(e, f) { this.h[e] = f; } once(e, f) { this.h[e] = f; } emit(e, d) { this.log.push([e, d]); } trigger(e, ...a) { return this.h[e] && this.h[e](...a); } ev(e) { return this.log.filter(l => l[0] === e).map(l => l[1]); } }
let fails = 0; const check = async (name, fn) => { try { await fn(); console.log('  ✓', name); } catch (e) { fails++; console.log('  ✗', name, '\n    ', (e.stack || e).toString().split('\n').slice(0, 5).join('\n     ')); } };
const last = { s: null, max: {} };   // the last HUD state the game produced + the strongest value seen per flag
const hud = new Proxy({}, { get: (_, k) => (k === 'e' ? new Proxy({}, { get: () => el() }) : k === 'root' ? el() : k === 'frame' ? (dt, st) => { last.s = st; for (const f of ['chambering', 'marked', 'em2', 'spirit']) if (st[f]) last.max[f] = true; if (st.chamberFrac > (last.max.chamberFrac || 0)) last.max.chamberFrac = st.chamberFrac; } : () => {}) });

function session(kind, mode, loadout, perf = {}) {
  const io = { emit() {} }, g = new Server(io, kind), cs = [];
  for (let i = 0; i < 2; i++) { const s = new FS('s' + i); g.attach(s); s.trigger('join', { name: 'P' + i }, () => {}); cs.push({ s, p: g.players.get(s.id) || [...g.players.values()].pop() }); }
  if (kind === 'classic') { g.config.mode = mode; cs[0].p.team = 'red'; cs[1].p.team = 'blue'; }
  cs[0].s.trigger('loadout', loadout); cs[1].s.trigger('loadout', { primary: 'm4a1', skill: 'stim' });
  g.startMatch();
  const net = { id: cs[0].s.id, connected: true, h: {}, stats: { snapsSec: 0, inputsSec: 0, ack: 0, pending: 0, recon: 0, jitter: 0 }, t: 0, on(e, f) { this.h[e] = f; }, emit() {}, sendInput: (i) => cs[0].s.trigger('input', i), renderTime() { return this.t - 0.1; }, serverNow() { return this.t; } };
  const keys = new Set(), st = { fire: false, aim: false, forward: false, skill: false, throw: false, reload: false, slot: -1, streak: -1, jump: false };
  const input = { locked: true, enabled: true, keys, streakKeys: kind === 'classic', leanOnE: true, take: () => [0, 0], sample: () => ({ forward: st.forward, backward: false, left: false, right: false, jump: st.jump, crouch: false, prone: false, lean: 0, aim: st.aim, use: false, interact: false, fire: st.fire, reload: st.reload, plate: false, slot: st.slot, streak: st.streak, skill: st.skill, throw: st.throw }) };
  const game = new Client(net, input, hud);
  game.start({ map: g.config.map, matchId: g.matchId, kind, mode: g.config.mode });
  let lastSnapT = 0;
  const route = { hit: 'onHit', dmg: 'onDmg', kill: 'onKill', announce: 'onAnnounce', shot: 'onShot', ents: 'onEnts', score: 'onScore', skill: 'onSkill', throw: 'onThrow', boom: 'onBoom', pulse: 'onPulse', place: 'onPlace', kupi: 'onKupi', dsr: 'onDsr', 'streak:ready': 'onStreakReady', 'streak:use': 'onStreakUse', 'uav:ping': 'onUavPing', emp: 'onEmp', trophy: 'onTrophy', melee: 'onMelee' };
  const seen = new Map();
  const tick = (n = 1, s = st) => { for (let i = 0; i < n; i++) { g.step(); net.t += 1 / 60; const log = cs[0].s.log; for (const [e, d] of log.splice(0)) { if (e === 'snap') { net.stats.ack = d.ack; net.h.snap(d); lastSnapT = d.t; } else if (route[e] && typeof game[route[e]] === 'function') { game[route[e]](d); seen.set(e, (seen.get(e) || 0) + 1); } } game.frame(1 / 60, true, false); } };
  return { g, cs, game, st, tick, net, seen, input };
}
// every weapon model is 'prepared' with a procedural stand-in so the viewmodel runs its real code path (orientation, anchors, calibration)
for (const id of Object.keys(WEAPONS)) if (!WEAPONS[id].unarmed) prepared.set(id, buildProcedural(id));

console.log('Merged client: Game + ViewModel + attachments + laser + HUD against a real Classic match');
const attAll = (w) => attString({ optic: ATT.coyote.id, laser: ATT.laser.id });
{ const S = session('classic', 'tdm', { primary: 'm4a1', secondary: 'makarov', skill: 'pulse', throwable: 'frag', attP: attString({ optic: 'coyote', laser: 'laser' }), attS: attString({ muzzle: 'suppressor' }), streaks: ['uav', 'trophy', 'odin'] });
  await check('the match starts and the client receives real snapshots (own attachments in the weapon state)', () => { S.tick(70); if (!S.game.you) throw new Error('no you-snapshot'); if (!S.game.local.weapon.att) throw new Error('attachments missing on the local weapon: ' + JSON.stringify(S.game.local.weapon.att)); });
  await check('the viewmodel shows the weapon with its attachments (optic + laser emitter built once the models are loaded)', async () => { S.tick(5); if (S.game.vm.id !== 'm4a1') throw new Error('viewmodel weapon ' + S.game.vm.id); await new Promise(r => setTimeout(r, 30)); S.tick(5); const vm = S.game.vm; if (vm.att !== 'coyote|laser' && !(vm.att.includes('coyote') && vm.att.includes('laser'))) throw new Error('vm.att = ' + vm.att); if (!vm.optic) throw new Error('no optic on the viewmodel'); if (!vm.laser) throw new Error('no laser emitter on the viewmodel'); });
  await check('hip fire, ADS (optic), moving and sprint run through prediction + viewmodel + laser beam', () => { S.st.forward = true; S.st.fire = true; S.tick(40); S.st.aim = true; S.tick(30); S.st.aim = false; S.st.fire = false; S.tick(20); });
  await check('sidearm switch (suppressed) + reload + knife-less loop', () => { S.st.slot = 1; S.tick(3); S.st.slot = -1; S.st.fire = true; S.tick(20); S.st.fire = false; S.st.reload = true; S.tick(2); S.st.reload = false; S.tick(80); });
  await check('skills and throwables (Scout Pulse + frag) run on the client', () => { S.st.skill = true; S.tick(2); S.st.skill = false; S.tick(20); S.st.throw = true; S.tick(2); S.st.throw = false; S.tick(60); });
  await check('scorestreak keys / HUD data (you.ss) are handled', () => { S.st.streak = 0; S.tick(3); S.st.streak = -1; S.tick(30); });
  await check('remote players with attachments render (laser beam for everybody)', () => { S.tick(30); const sn = S.cs[1].s.ev('snap').pop(); if (!sn) throw new Error('no snapshot for the 2nd player'); });
  await check('the other player sees our attachments in the snapshot (at) and the shot flag', () => { const sn = S.cs[1].s.log.filter(l => l[0] === 'snap').pop(); const me = S.g.players.get(S.cs[0].p.id); S.tick(2); const pl = S.cs[1].s.log.length; if (!S.cs[1].s.log.some(l => l[0] === 'snap' && l[1].pl.some(x => x.id === S.cs[0].p.id && typeof x.at === 'string' && x.at.includes('coyote')))) throw new Error('no `at` in the remote snapshot'); });
}
console.log('Merged client: sniper (Chambering), knife, shotgun, EM2, melee');
{ const S = session('classic', 'tdm', { primary: 'l115a3', secondary: 'knife', skill: 'em2', throwable: 'frag', streaks: ['uav', 'trophy', 'emp'] });
  await check('sniper: shot -> the HUD gets the Chambering bar (and it fills)', () => { S.tick(70); last.max = {}; S.st.fire = true; S.tick(2); S.st.fire = false; S.tick(20); if (!last.max.chambering) throw new Error('chambering never shown'); if (!(last.max.chamberFrac > 0 && last.max.chamberFrac <= 1)) throw new Error('chamberFrac ' + last.max.chamberFrac); });
  await check('knife: slash animation + melee event + no ammo use', () => { S.st.slot = 1; S.tick(3); S.st.slot = -1; S.st.fire = true; S.tick(40); S.st.fire = false; S.tick(10); });
  await check('EM2 skill (aim lock + laser) activates and fires', () => { S.cs[0].p.energy = 100; S.st.slot = 0; S.tick(3); S.st.slot = -1; S.st.skill = true; S.tick(3); S.st.skill = false; S.tick(30); S.st.fire = true; S.tick(30); S.st.fire = false; S.tick(30); });
}
{ const S = session('classic', 'tdm', { primary: 'srm1216', secondary: 'makarov', skill: 'grav', throwable: 'frag' });
  await check('shotgun burst + Chambering + Gravity Spike run on the client', () => { S.tick(70); last.max = {}; S.st.fire = true; S.tick(40); S.st.fire = false; if (!last.max.chambering) throw new Error('shotgun: chambering never shown'); S.cs[0].p.energy = 100; S.st.skill = true; S.tick(3); S.st.skill = false; S.tick(100); });
}
console.log('Merged client: Battle Royale (downed, teams, helicopter) and Shooting Range');
{ const S = session('br', null, { skill: 'dsr', throwable: 'frag' });
  await check('BR: client runs through the drop (helicopter) and the glide', () => { S.tick(200); });
  await check('BR: Dissociative Surreality + downed state', () => { S.cs[0].p.energy = 100; S.st.skill = true; S.tick(3); S.st.skill = false; S.tick(60); });
}
{ const S = session('range', null, { primary: 'm4a1', skill: 'stim', throwable: 'frag', attP: attString({ optic: 'coyote' }) });
  await check('Shooting Range: loadout can be opened, shots hit dummies, deploy applies in place', () => { S.tick(90); S.st.fire = true; S.tick(60); S.st.fire = false; S.cs[0].s.trigger('loadout', { primary: 'ak74', skill: 'stim', throwable: 'frag' }); S.cs[0].s.trigger('deploy'); S.tick(30); });
}
console.log(fails ? `\n${fails} merged-client smoke check(s) FAILED` : '\nAll merged-client smoke checks passed.'); process.exit(fails ? 1 : 0);
