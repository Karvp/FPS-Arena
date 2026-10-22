// CLIENT SMOKE TEST: runs the real client rendering modules (loot, streak entities, remote players + zombies, mode views) in node against a
// THREE stub, fed with REAL server snapshots. It catches runtime errors in renderers that syntax checks and server tests cannot see
// (e.g. a missing method that silently stops crates from rendering). Run: npm run smoke
globalThis.document = { createElement: () => ({ getContext: () => ({ createRadialGradient: () => ({ addColorStop() {} }), fillRect() {} }), width: 0, height: 0 }) }; globalThis.innerWidth = 1280; globalThis.innerHeight = 720;
const { Game } = await import('../../server/game.js'); const T = await import('./three-stub.mjs');
const { LootView } = await import('../../client/loot.js'); const { StreakView } = await import('../../client/streaks.js'); const { Remotes } = await import('../../client/remote.js'); const { ModeView } = await import('../../client/modes.js');
class FS { constructor(id) { this.id = id; this.h = {}; this.log = []; } on(e, f) { this.h[e] = f; } once(e, f) { this.h[e] = f; } emit(e, d) { this.log.push([e, d]); } trigger(e, ...a) { return this.h[e] && this.h[e](...a); } ev(e) { return this.log.filter(l => l[0] === e).map(l => l[1]); } }
const make = (kind, n = 1) => { const io = { emit() {} }, g = new Game(io, kind), cs = []; for (let i = 0; i < n; i++) { const s = new FS('s' + i); g.attach(s); s.trigger('join', { name: 'P' + i }, () => {}); const p = g.players.get(s.id) || [...g.players.values()].pop(); cs.push({ s, p }); } return { g, cs }; };
let fails = 0; const check = (name, fn) => { try { fn(); console.log('  ✓', name); } catch (e) { fails++; console.log('  ✗', name, '\n    ', (e.stack || e).toString().split('\n').slice(0, 4).join('\n     ')); } };
const el = () => ({ classList: { add() {}, remove() {}, toggle() {} }, style: { setProperty() {} }, innerHTML: '', textContent: '' });
const hud = new Proxy({}, { get: (_, k) => (k === 'e' ? new Proxy({}, { get: () => el() }) : k === 'root' ? el() : () => {}) });
const run = (g, sec) => { for (let i = 0; i < 60 * sec; i++) g.step(); };
const lastSnap = (c) => c.s.ev('snap').pop();

console.log('Battle Royale (crates, items, remote players, helicopter, ring, incursion zone)');
{ const { g, cs } = make('br', 3); g.addBot(); g.startMatch(); run(g, 8); const c = cs[0]; const sc = new T.Scene();
  check('LootView renders crates + items of a real BR match', () => { const lv = new LootView(sc); const lootData = g.mode.loot.state(); lv.set(lootData); const ex = g.mode.loot.crates[0]; g.mode.loot.openCrate(ex); g.mode.loot.addItem(5, '', 0, 0, 0, 0, 0, 3); lv.set(g.mode.loot.state()); for (let i = 0; i < 5; i++) lv.update(0.016); if (!lv.crates.size || !lv.items.size) throw new Error('nothing rendered: ' + lv.crates.size + ' crates, ' + lv.items.size + ' items'); });
  check('Remotes render BR players (teams, downed, helicopter)', () => { const r = new Remotes(sc, false); const snap = lastSnap(c); const pl = snap.pl.map((p, i) => ({ ...p, dn: i === 1 ? 1 : 0 })); r.addSnap({ ...snap, pl, t: snap.t }); r.addSnap({ ...snap, pl, t: snap.t + 0.05 }); r.update(snap.t + 0.03, c.p.id, 1, 0.016); if (!r.list.length) throw new Error('no remote players listed'); });
  for (const sub of ['resurgence', 'incursion']) check('ModeView applies the BR state (' + sub + ')', () => { g.mode.sub = sub; const mv = new ModeView(sc, hud), ctx = { team: c.p.team, selfId: c.p.id, pos: { x: 0, y: 0, z: 0 }, camera: new T.PerspectiveCamera(), alive: true, air: false, heli: true, down: false, you: lastSnap(c).you }; if (sub === 'incursion') g.mode.sub = 'incursion'; const st = g.mode.state(); mv.apply(st, ctx); mv.apply(st, { ...ctx, heli: false, down: true }); });
}
console.log('Classic (streak entities of every kind, HUD hooks)');
for (const mode of ['tdm', 'snd', 'hp']) {
  const { g, cs } = make('classic', 2); g.config.mode = mode; cs[0].p.team = 'red'; cs[1].p.team = 'blue'; cs[0].s.trigger('loadout', { skill: 'pulse', streaks: ['uav', 'trophy', 'odin'] }); g.startMatch(); run(g, 12);
  check('ModeView applies the ' + mode + ' state', () => { const mv = new ModeView(new T.Scene(), hud); const ctx = { team: 'red', selfId: cs[0].p.id, pos: { x: 0, y: 0, z: 0 }, camera: new T.PerspectiveCamera(), alive: true, air: false, you: lastSnap(cs[0]).you }; mv.apply(g.mode.state(), ctx); mv.apply(g.mode.state(), ctx); });
}
{ const { g, cs } = make('classic', 2); g.config.mode = 'tdm'; cs[0].p.team = 'red'; cs[1].p.team = 'blue'; g.startMatch(); run(g, 8); const a = cs[0].p, S = g.streaks;
  const kinds = ['uav', 'predator', 'chopper']; for (const k of ['uav', 'predator']) S.spawnPlane(a, k); S.startChopper(a); S.clearView(a, false); S.startChopper(a); S.clearView(a, false);
  S.add('beacon', a, { x: 5, y: 0, z: 5, shells: 3, next: 99 }); S.add('shell', a, { x: 6, y: 40, z: 6 }); S.add('trophy', a, { x: 1, y: 0.2, z: 1, zaps: 2, life: 50 }); S.add('charger', a, { x: 2, y: 0.2, z: 2, life: 20, acc: 0 }); S.add('sthrow', a, { what: 'artillery', x: 3, y: 2, z: 3, vx: 0, vy: 0, vz: 0 }); S.add('missile', a, { x: 0, y: 30, z: 0, dx: 0, dy: -1, dz: 0, life: 5 });
  g.streaks.odin = { owner: a, t: 4, id: 99 }; for (let i = 0; i < 3; i++) g.step();
  check('StreakView renders every streak entity + ODIN from a real snapshot', () => { const sv = new StreakView(new T.Scene()); const snap = lastSnap(cs[0]); if (!snap.sk.length) throw new Error('no entities in the snapshot'); sv.sync(snap.sk, snap.odin); sv.sync(snap.sk, snap.odin); for (let i = 0; i < 10; i++) sv.update(0.016); sv.zap({ x: 1, y: 1, z: 1, ox: 0, oy: 0, oz: 0 }); for (let i = 0; i < 40; i++) sv.update(0.016); sv.sync([], null); const kinds = new Set(snap.sk.map(e => e.k)); for (const k of ['uav', 'predator', 'chopper', 'beacon', 'shell', 'trophy', 'charger', 'sthrow', 'missile']) if (!kinds.has(k)) throw new Error('kind not covered: ' + k); });
  check('the snapshot has the scorestreak HUD data (you.ss, odin)', () => { const s = lastSnap(cs[0]); if (!s.you.ss || !Array.isArray(s.you.ss.set) || !s.odin) throw new Error(JSON.stringify(s.you.ss)); });
}
console.log('Zombies (zombie meshes, loot)');
{ const { g, cs } = make('zm', 1); g.startMatch(); run(g, 8); const c = cs[0], sc = new T.Scene();
  check('Remotes render zombies from a real snapshot', () => { const r = new Remotes(sc, true), snap = lastSnap(c); if (!snap.zm || !snap.zm.length) throw new Error('no zombies in the snapshot'); r.addSnap(snap, 'zm'); r.addSnap({ ...snap, t: snap.t + 0.05 }, 'zm'); r.update(snap.t + 0.03, null, 1, 0.016); if (r.list.length !== snap.zm.length) throw new Error('listed ' + r.list.length + ' of ' + snap.zm.length); });
  check('LootView renders the Zombies crates', () => { const lv = new LootView(sc); lv.set(g.mode.loot.state()); lv.update(0.016); if (!lv.crates.size) throw new Error('no crates rendered'); });
  check('ModeView applies the Zombies state', () => { const mv = new ModeView(sc, hud); mv.apply(g.mode.state(), { team: 'red', selfId: c.p.id, pos: { x: 0, y: 0, z: 0 }, camera: new T.PerspectiveCamera(), alive: true, air: false, you: lastSnap(c).you }); });
}
console.log(fails ? `\n${fails} smoke check(s) FAILED` : '\nAll client smoke checks passed.'); process.exit(fails ? 1 : 0);
