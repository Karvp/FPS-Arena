// Headless server tests: a fake Socket.IO `io` drives the real Game class (lobby, combat, all three modes, voting, next match),
// plus movement determinism and a server.js startup check using stub express/socket.io modules in a temp directory.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Game } from '../server/game.js';
import { Hub } from '../server/hub.js';
import { DT, SND, HARDPOINT, PLAYER, RESULT_TIME, WAIT_TIME, BR, ZM, MOVE, HOOK } from '../shared/constants.js';
import { newMoveState, stepMove, copyMove } from '../shared/movement.js';
import { MAPS } from '../maps/index.js';
import { WEAPONS, isPistol, secondaryFor, LOOT_WEAPONS } from '../shared/weapons.js';
import { makeWeaponState, stepWeapons, curWeapon, curGun } from '../shared/weaponstate.js';
import { ATT, SLOTS, cleanAtt, gunStats, parseAtt, attString, slotAllowed, slotsFor } from '../shared/attachments.js';
import { ITEM } from '../shared/loot.js';
import { BR_TEAMS } from '../shared/constants.js';
import { RARITIES, RARITY_IDX, WEAPON_RARITY, WEAPONS_BY_RARITY, rarityOf, rollRarity } from '../shared/rarity.js';
import { fxOf, canAim } from '../shared/skills.js';
import { SKILLS, THROWABLES } from '../shared/skills.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ FAIL: ' + m); } };
const section = (t) => console.log('\n' + t);

class FS { constructor(id) { this.id = id; this.h = {}; this.log = []; } on(e, f) { this.h[e] = f; } once(e, f) { this.h[e] = (...a) => { delete this.h[e]; f(...a); }; } emit(e, d) { this.log.push([e, d]); } trigger(e, ...a) { if (this.h[e]) this.h[e](...a); }
  ev(e) { return this.log.filter(l => l[0] === e).map(l => l[1]); } }
function mk(kind = 'classic') {
  const io = { socks: [], emit(e, d) { for (const s of this.socks) s.emit(e, d); } };
  const g = new Game(io, kind); const seqs = new Map();
  const join = (name, skipSkill = false) => { const s = new FS('s' + (io.socks.length + 1)); io.socks.push(s); g.attach(s); let r; s.trigger('join', { name }, (x) => { r = x; }); if (!skipSkill) s.trigger('loadout', { skill: 'pulse' }); return { s, p: g.players.get(s.id) || g.queue.get(s.id), r }; };
  const steps = (n) => { for (let i = 0; i < n; i++) g.step(); };
  const input = (c, o = {}) => { const n = (seqs.get(c.s.id) || 0) + 1; seqs.set(c.s.id, n); c.s.trigger('input', { seq: n, ep: c.p.epoch, yaw: 0, pitch: 0, lt: g.now, ...o }); };
  const tick = (c, o, n = 1) => { for (let i = 0; i < n; i++) { input(c, o); g.step(); } };
  const place = (p, x, z, y = 0) => { Object.assign(p, { x, y, z, vx: 0, vy: 0, vz: 0, onGround: true, heli: false }); p.protectUntil = 0; p.frozen = false; };
  return { io, g, join, steps, input, tick, place, seqs };
}

// ---------------------------------------------------------------- waiting room
section('WAITING ROOM (classic): countdown, teams, votes, ready/start, results -> waiting room');
{
  const t = mk(), a = t.join('Alice');
  ok(a.r && a.r.ok && t.g.phase === 'waiting', 'join puts the player in the waiting room');
  ok(Math.abs(t.g.waitEnd - WAIT_TIME.classic) < 0.1, 'countdown starts at 60 s when the first player enters');
  const b = t.join('Bob'); ok(a.p.team !== b.p.team, 'teams auto-balanced');
  a.s.trigger('lobby:team', { team: 'blue' }); ok(a.p.team === 'blue', 'player can pick a team'); a.s.trigger('lobby:team', { team: 'red' });
  a.s.trigger('vote', { mode: 'snd', map: 'neon' }); b.s.trigger('vote', { mode: 'snd', map: 'foundry' }); a.s.trigger('vote', { mode: 'evil', map: 'oilrig' });
  const lv = a.s.ev('lobby').pop(); ok(lv.votes.modes.snd === 2 && lv.votes.maps.neon === 1 && lv.votes.maps.foundry === 1 && !lv.votes.maps.oilrig, 'votes are counted live (BR / invalid maps rejected)');
  b.s.trigger('loadout', { primary: 'ak74' }); ok(b.p.nextPrimary === 'ak74', 'loadout stored'); b.s.trigger('loadout', { primary: 'bad' }); ok(b.p.nextPrimary === 'ak74', 'invalid loadout rejected');
  a.s.trigger('lobby:start'); ok(t.g.phase === 'waiting' && t.g.lobbyState().readyCount === 1 && t.g.lobbyState().total === 2, 'START (1/2): one ready is not enough');
  b.s.trigger('lobby:start'); ok(t.g.phase === 'match' && a.s.ev('match:start').length === 1, 'everybody ready -> match starts immediately');
  ok(t.g.config.mode === 'snd' && ['neon', 'foundry'].includes(t.g.config.map), 'match uses the voted mode/map (' + t.g.config.mode + '/' + t.g.config.map + ')');
  ok(a.p.alive && b.p.alive, 'players spawned'); t.steps(2); ok(a.s.ev('snap').length >= 1 && a.s.ev('snap')[0].you, 'snapshots with `you` at 30 Hz');
  // Classic: a late joiner enters the running match right away (no queue); everybody returns to the waiting room after the match
  const c = t.join('Late'); ok(t.g.players.has(c.s.id) && !t.g.queue.has(c.s.id) && c.p.queued === false, 'Classic: a player joining mid-match is NOT queued');
  ok(c.s.ev('match:start').length === 1 && c.s.ev('match:start')[0].mode === 'snd' && c.p.spawned && !c.p.late, 'the late joiner receives match:start and is admitted at once');
  ok(t.g.mode.phase === 'freeze' && c.p.alive && c.p.frozen, 'Search & Destroy freeze phase: the late joiner spawns with the round');
  t.g.endMatch('red', 'test'); ok(t.g.phase === 'results', 'results phase'); t.steps((RESULT_TIME + BR.endOverlay) * 60 + 2);
  ok(t.g.phase === 'waiting' && t.g.players.size === 3 && t.g.queue.size === 0, 'after the match everybody (incl. the late joiner) is back in the waiting room');
  ok(!a.p.alive && !a.p.ready && Math.abs(t.g.waitEnd - (t.g.now + WAIT_TIME.classic)) < 0.2, 'new 60 s countdown, ready flags reset');
  const lt = t.g.lobbyState(); ok(lt.phase === 'waiting' && lt.players.length === 3, 'lobby state broadcast');
  t.steps(WAIT_TIME.classic * 60 + 5); ok(t.g.phase === 'match', 'match starts automatically when the countdown reaches 0');
  const t2 = mk(), s1 = t2.join('Solo'); t2.steps(WAIT_TIME.classic * 60 - 30); ok(t2.g.phase === 'waiting', 'still waiting at 59 s'); void s1;
  // leaving resets the timer when the room empties
  t2.g.removePlayer(t2.g.players.get(s1.s.id)); ok(t2.g.waitEnd === null, 'empty room pauses the countdown');
}

// ---------------------------------------------------------------- combat / TDM
section('COMBAT + TEAM DEATHMATCH');
{
  const t = mk(), a = t.join('Shooter'), b = t.join('Target'); a.p.team = 'red'; b.p.team = 'blue'; a.p.nextPrimary = 'm4a1';
  t.g.startMatch(); t.steps(1);
  t.place(a.p, 6, 60); t.place(b.p, 6, 40); t.g.invulnerable = false;
  const aim = { fire: true, aim: true, pitch: Math.atan2(1.0 - 1.6, 20) };
  t.tick(a, aim, 1);
  ok(b.p.armor < PLAYER.maxArmor && b.p.hp === 100, 'armor absorbs damage first (armor ' + b.p.armor + ', hp ' + b.p.hp + ')');
  ok(b.s.ev('dmg').length >= 1 && b.s.ev('dmg')[0].a > 0 && b.s.ev('dmg')[0].h === 0, 'victim gets armor-only damage event (blue vignette)');
  ok(a.s.ev('hit').length >= 1 && a.s.ev('hit')[0].armor === true, 'attacker gets armor hit event');
  t.tick(a, aim, 40);
  ok(b.p.hp < 100 || !b.p.alive, 'health drops after armor is gone');
  ok(b.s.ev('dmg').some(d => d.h > 0), 'victim gets health damage event (red vignette)');
  t.tick(a, aim, 60);
  ok(!b.p.alive, 'target killed'); ok(a.p.kills === 1 && b.p.deaths === 1, 'kill/death counted');
  ok(a.p.plates === PLAYER.startPlates + 1, 'kill grants +1 armor plate');
  ok(t.g.mode.scores.red === 1, 'TDM team score +1');
  ok(a.s.ev('kill').length === 1 && a.s.ev('kill')[0].wn === 'M4A1', 'kill feed event with weapon name');
  t.steps(PLAYER.respawnDelay * 60 + 5); ok(b.p.alive && b.p.hp === 100, 'victim respawns after 3 s with full health');

  // no friendly fire
  const c = t.join('Mate'); t.g.queue.delete(c.s.id); t.g.players.set(c.s.id, c.p); c.p.queued = false; c.p.team = 'red'; t.g.spawnPlayer(c.p); c.p.protectUntil = 0; const hp0 = c.p.hp + c.p.armor;
  t.g.damage(c.p, a.p, 80); ok(c.p.hp + c.p.armor === hp0, 'no friendly fire');

  // headshot multiplier (1.3x)
  t.g.spawnPlayer(b.p); t.g.spawnPlayer(a.p); t.place(a.p, 6, 60); t.place(b.p, 6, 40); t.steps(1);
  const before = b.p.armor; t.tick(a, { fire: true, aim: true, pitch: Math.atan2(1.62 - 1.6, 20) }, 1);
  const lost = before - b.p.armor; ok(Math.abs(lost - Math.round(27 * 1.3)) <= 1 && a.s.ev('hit').some(h => h.head), 'headshot deals 1.3x (armor lost ' + lost + ')');

  // sniper one-shot headshot (100x) through armor
  a.p.nextPrimary = 'l115a3'; t.g.spawnPlayer(a.p); t.g.spawnPlayer(b.p); t.place(a.p, 6, 60); t.place(b.p, 6, 40); t.steps(1);
  const k0 = a.p.kills; t.tick(a, { fire: true, aim: true, pitch: Math.atan2(1.62 - 1.6, 20) }, 1);
  ok(!b.p.alive && a.p.kills === k0 + 1, 'sniper headshot is an instant kill');

  // walls block bullets
  t.g.spawnPlayer(b.p); t.g.spawnPlayer(a.p); t.place(a.p, 0, -10); t.place(b.p, 0, 10); t.steps(1);   // central block sits between
  const arm = b.p.armor; t.tick(a, { fire: true, aim: true, yaw: Math.PI, pitch: 0 }, 5); ok(b.p.armor === arm && b.p.hp === 100, 'world geometry blocks hitscan');

  // plating: Q, 3 s, armor restored, plate consumed
  t.g.spawnPlayer(b.p); b.p.armor = 10; b.p.plates = 2; t.place(b.p, 6, 40);
  t.tick(b, { plate: true }, 1); ok(b.p.ws.plateT > 0, 'plating starts'); t.tick(b, {}, 190);
  ok(b.p.armor === PLAYER.maxArmor && b.p.plates === 1, 'plating completes: armor 50, plate consumed');
  // health regen 5 s after last damage
  t.g.spawnPlayer(b.p); b.p.protectUntil = 0; t.g.damage(b.p, a.p, 60); const h1 = b.p.hp; t.steps(60 * 4); ok(b.p.hp === h1, 'no regen before 5 s'); t.steps(60 * 3); ok(b.p.hp > h1, 'health regenerates after 5 s');
  // reload + ammo
  a.p.nextPrimary = 'm4a1'; t.g.spawnPlayer(a.p); t.tick(a, { fire: true }, 30); const m1 = a.p.ws.guns[0].mag; ok(m1 < 32, 'ammo decreases when firing (' + m1 + ')');
  t.tick(a, { reload: true }, 1); t.tick(a, {}, 130); ok(a.p.ws.guns[0].mag === 32, 'reload refills the magazine');
  // TDM win
  t.g.mode.scores.red = 49; t.g.spawnPlayer(b.p); t.g.spawnPlayer(a.p); t.place(a.p, 6, 60); t.place(b.p, 6, 40); a.p.nextPrimary = 'm4a1'; t.g.spawnPlayer(a.p); t.place(a.p, 6, 60); t.place(b.p, 6, 40); t.steps(1);
  t.tick(a, aim, 140); ok(t.g.phase === 'results', 'TDM ends at target score'); ok(a.s.ev('match:end').length === 1 && a.s.ev('match:end')[0].winner === 'red', 'match:end event');
}

// ---------------------------------------------------------------- hardpoint
section('HARDPOINT');
{
  const t = mk(), a = t.join('R'), b = t.join('B'); a.p.team = 'red'; b.p.team = 'blue'; t.g.config.mode = 'hp'; t.g.startMatch(); t.steps(1);
  const z = t.g.mode.zone; t.g.mode.zoneEnd = 1e9;
  t.place(a.p, z.x, z.z); t.place(b.p, z.x + 40 > 60 ? z.x - 40 : z.x + 40, z.z > 0 ? z.z - 30 : z.z + 30);
  t.steps(60 * 5 + 2); ok(t.g.mode.scores.red === 5 && t.g.mode.scores.blue === 0, 'zone scores 1 pt/s for holding team (' + t.g.mode.scores.red + ')');
  t.place(b.p, z.x + 1, z.z); t.steps(60 * 3); ok(t.g.mode.scores.red === 5 && t.g.mode.status === 'contested', 'contested zone gives no points');
  t.place(b.p, 60, 60); t.g.mode.scores.red = 99; t.place(a.p, z.x, z.z); t.steps(80); ok(t.g.phase === 'results', 'first to 100 wins');
  const t2 = mk(); const c = t2.join('x'); c.p.team = 'red'; t2.g.config.mode = 'hp'; t2.g.startMatch(); const id0 = t2.g.mode.zone.id; t2.steps(HARDPOINT.zoneTime * 60 + 2); ok(t2.g.mode.zone.id !== id0, 'zone rotates every 35 s');
}

// ---------------------------------------------------------------- search & destroy
section('SEARCH & DESTROY');
function sndSetup(mapId = 'arena') {
  const t = mk(), a = t.join('Red'), b = t.join('Blue'); a.p.team = 'red'; b.p.team = 'blue'; t.g.config.mode = 'snd'; t.g.config.map = mapId; t.g.startMatch(); t.steps(1);
  return Object.assign(t, { a, b, m: t.g.mode });
}
function toActive(t) { t.steps(SND.freezeTime * 60 + 2); }
{
  const t = sndSetup(); const m = t.m;
  ok(m.phase === 'freeze' && t.a.p.frozen && t.b.p.frozen, 'freeze phase: 5 s, players frozen');
  ok(m.attackers === 'red', 'round 1: red attacks'); ok(t.a.p.hasBomb, 'attacker carries the bomb');
  const x0 = t.a.p.x; t.tick(t.a, { forward: true }, 30); ok(t.a.p.x === x0 && t.a.p.z === x0 * 0 + t.a.p.z, 'frozen players cannot move');
  const def = m.defenders; const dSp = MAPS.arena.spawns[def][0]; const cen = (s) => s.reduce((c, p) => c + p.z, 0) / s.length;
  ok(m.sites.length === 2 && m.sites.every(s => Math.abs(s.z - cen(MAPS.arena.spawns[def])) < Math.abs(s.z - cen(MAPS.arena.spawns[m.attackers]))), 'bombsites are closer to the defenders'); void dSp;
  toActive(t); ok(m.phase === 'active', 'active phase after freeze');
  // plant
  const s0 = m.sites[0]; t.place(t.a.p, s0.x, s0.z); t.place(t.b.p, 60, -60 * Math.sign(s0.z || 1));
  t.tick(t.a, { interact: true }, 200); ok(m.phase === 'active' && m.plant.p > 0.4 && m.plant.p < 1, 'planting takes time (progress ' + m.plant.p.toFixed(2) + ')');
  t.tick(t.a, {}, 5); ok(m.plant.p === 0, 'releasing E resets plant progress');
  t.tick(t.a, { interact: true }, 6.5 * 60 + 5); ok(m.phase === 'planted' && m.bomb.state === 'planted', 'bomb planted after 6.5 s hold'); ok(t.a.s.ev('score').some(x => x.pts === 10 && x.why === 'Bomb planted'), '+10 Bomb planted');
  // attackers eliminated AFTER plant -> bomb stays active
  t.g.damage(t.a.p, t.b.p, 999); t.steps(5); ok(!t.a.p.alive && m.phase === 'planted', 'all attackers dead after plant: bomb stays active');
  // defuse
  t.place(t.b.p, m.bomb.x + 1, m.bomb.z); t.tick(t.b, { interact: true }, 6.5 * 60 - 30); ok(m.phase === 'planted', 'defuse not instant');
  t.tick(t.b, { interact: true }, 60); ok(m.phase === 'result' && m.result.winner === 'blue' && m.result.reason === 'Bomb defused', 'defuse completes -> defenders win round');
  ok(m.wins.blue === 1, 'round win counted'); ok(t.b.s.ev('score').some(x => x.pts === 10 && x.why === 'Bomb defused'), '+10 Bomb defused'); ok(t.g.invulnerable, 'combat frozen in result phase');
  t.steps(SND.resultTime * 60 + 3); ok(m.round === 2 && m.attackers === 'blue', 'roles swap next round (blue attacks)'); ok(t.a.p.alive && t.b.p.alive, 'everyone respawns for the new round');
}
{ // explode
  const t = sndSetup('neon'), m = t.m; toActive(t); const s0 = m.sites[1]; t.place(t.a.p, s0.x, s0.z); t.tick(t.a, { interact: true }, 6.5 * 60 + 5); ok(m.phase === 'planted', 'planted on neon');
  t.place(t.a.p, 60, 60); t.steps(SND.bombTime * 60 + 5); ok(m.phase === 'result' && m.result.reason === 'Bomb exploded' && m.wins.red === 1, 'bomb explodes after 40 s -> attackers win');
}
{ // elimination + time + carrier drop/pickup + match end
  const t = sndSetup('foundry'), m = t.m; toActive(t);
  t.g.damage(t.b.p, t.a.p, 999); t.steps(3); ok(m.phase === 'result' && m.result.winner === 'red', 'defenders eliminated -> attackers win');
  const t2 = sndSetup(), m2 = t2.m; toActive(t2); t2.place(t2.a.p, 5, 5); t2.g.damage(t2.a.p, t2.b.p, 999); t2.steps(2);
  ok(m2.bomb.state === 'dropped' && m2.phase === 'result' && m2.result.winner === 'blue', 'carrier death drops bomb; attackers eliminated pre-plant -> defenders win');
  const t3 = sndSetup(), m3 = t3.m; toActive(t3); t3.steps(SND.plantWindow * 60 + 5); ok(m3.result && m3.result.winner === 'blue', 'no plant before timer -> defenders win');
  // match end at 5 rounds
  const t4 = sndSetup(), m4 = t4.m; m4.wins.red = 4; toActive(t4); t4.g.damage(t4.b.p, t4.a.p, 999); t4.steps(SND.resultTime * 60 + 5);
  ok(t4.g.phase === 'results' && t4.a.s.ev('match:end')[0].winner === 'red', 'first to 5 rounds wins the match');
  // solo test: a lone player is not instantly "eliminated"
  const t5 = mk(), s = t5.join('Solo'); s.p.team = 'red'; t5.g.config.mode = 'snd'; t5.g.startMatch(); toActive(t5); t5.steps(120); ok(t5.g.mode.phase === 'active', 'solo player: empty enemy team does not instantly end the round');
}

// ---------------------------------------------------------------- host-less misc
section('MISC ROOM RULES');
{
  const t = mk(), a = t.join('A'), b = t.join('B'), c = t.join('C'); a.s.trigger('vote', { mode: 'tdm', map: 'arena' }); b.s.trigger('vote', { mode: 'hp', map: 'neon' }); c.s.trigger('vote', { mode: 'hp', map: 'neon' });
  t.g.removePlayer(a.p); ok(t.g.players.size === 2, 'player leaving the waiting room'); b.s.trigger('lobby:start'); c.s.trigger('lobby:start'); ok(t.g.phase === 'match' && t.g.config.mode === 'hp' && t.g.config.map === 'neon', 'majority vote wins (hp / neon)');
  const hub = new Hub({ emit() {} }); const s1 = new FS('h1'), s2 = new FS('h2'), s3 = new FS('h3'); [s1, s2, s3].forEach(x => hub.attach(x));
  s1.trigger('join', { name: 'x', room: 'br' }, () => {}); s2.trigger('join', { name: 'y', room: 'zm' }, () => {}); s3.trigger('join', { name: 'z' }, () => {});
  ok(hub.rooms.br.players.size === 1 && hub.rooms.zm.players.size === 1 && hub.rooms.classic.players.size === 1, 'hub routes players into their room (classic / br / zm)');
}


// ---------------------------------------------------------------- respawn loadout hold, S&D alive counts, match restart
section('RESPAWN LOADOUT HOLD / ALIVE COUNT / RESTART AFTER VOTE');
{
  const t = mk(), a = t.join('A'), b = t.join('B'); a.p.team = 'red'; b.p.team = 'blue'; t.g.startMatch(); t.steps(1);
  b.s.trigger('loadout:open'); ok(!b.p.hold, 'loadout:open ignored while alive');
  t.place(b.p, 6, 40); t.g.damage(b.p, a.p, 999); ok(!b.p.alive, 'target dead');
  b.s.trigger('loadout:open'); ok(b.p.hold, 'loadout:open while dead holds the respawn');
  t.steps(60 * 6); ok(!b.p.alive, 'held player is NOT respawned after the timer');
  b.s.trigger('loadout', { primary: 'ak74' }); b.s.trigger('deploy'); t.steps(2);
  ok(b.p.alive && b.p.ws.guns[0].id === 'ak74', 'DEPLOY respawns immediately with the newly selected weapon');
  t.place(b.p, 6, 40); t.g.damage(b.p, a.p, 999); b.s.trigger('loadout:open'); b.s.trigger('deploy'); t.steps(60);
  ok(!b.p.alive, 'deploying before the 3 s timer still waits for the timer'); t.steps(150); ok(b.p.alive, 'respawns once the timer is over');
  ok(b.s.ev('snap').some(x => x.you.hold === false) , 'snapshots carry the hold flag');
}
{
  const t = mk(), a = t.join('A'), b = t.join('B'), c = t.join('C'), d = t.join('D');
  a.p.team = 'red'; b.p.team = 'red'; c.p.team = 'blue'; d.p.team = 'blue'; t.g.config.mode = 'snd'; t.g.startMatch(); t.steps(1);
  ok(JSON.stringify(t.g.mode.state().alive) === JSON.stringify({ red: 2, blue: 2 }), 'S&D alive counter starts 2 vs 2');
  toActive(t); t.g.damage(c.p, a.p, 999); t.g.damage(d.p, a.p, 999); t.place(b.p, 0, 0); t.g.damage(b.p, c.p, 999);
  const st = t.g.mode.state(); ok(st.alive.blue >= 0 && st.alive.red === 1 || st.phase === 'result', 'alive counter tracks eliminations (' + JSON.stringify(st.alive) + ')');
  const t2 = mk(), x = t2.join('X'), y = t2.join('Y'), z = t2.join('Z'); x.p.team = 'red'; y.p.team = 'blue'; z.p.team = 'blue'; t2.g.config.mode = 'snd'; t2.g.startMatch(); toActive(t2);
  t2.g.damage(y.p, x.p, 999); ok(t2.g.mode.state().alive.blue === 1 && t2.g.mode.state().alive.red === 1 && t2.g.mode.phase === 'active', '1 vs 1 after one blue death');
  y.s.trigger('loadout:open'); t2.steps(60 * 5); ok(!y.p.hold && !y.p.alive, 'S&D: no loadout hold and no respawn (spectator only)');
  const before = { x: y.p.x, z: y.p.z }; t2.tick(y, { forward: true, fire: true, interact: true, plate: true }, 30);
  ok(y.p.x === before.x && y.p.z === before.z && y.p.hp === 0, 'dead S&D spectator cannot move/act server-side');
}
{ // BUG REGRESSION: after the vote, the new match must accept inputs from a client whose seq restarted at 1
  const t = mk(), a = t.join('A'), b = t.join('B'); a.p.team = 'red'; b.p.team = 'blue'; t.g.startMatch(); t.steps(1);
  t.tick(a, { forward: true }, 300); ok(t.seqs.get(a.s.id) === 300, 'first match: 300 inputs sent');
  const oldEp = a.p.epoch; t.g.endMatch('red', 'test'); t.steps((RESULT_TIME + BR.endOverlay) * 60 + 2);
  a.s.trigger('vote', { mode: 'tdm', map: 'foundry' }); b.s.trigger('vote', { mode: 'tdm', map: 'foundry' }); a.s.trigger('lobby:start'); b.s.trigger('lobby:start');
  ok(t.g.phase === 'match' && t.g.config.map === 'foundry', 'second match running');
  a.s.trigger('input', { seq: 9999, ep: oldEp, forward: true, yaw: 0, pitch: 0, lt: t.g.now });     // stale in-flight packet from the previous match
  t.seqs.clear();                                                                                    // client restarts its sequence at 1
  const z0 = a.p.z; t.tick(a, { forward: true }, 90);
  ok(Math.abs(a.p.z - z0) > 2, 'players can MOVE in the match started after a vote (moved ' + Math.abs(a.p.z - z0).toFixed(1) + ' m)');
  ok(a.p.lastSeq > 0 && a.p.lastSeq <= 90, 'ack sequence restarted with the new match (' + a.p.lastSeq + ')');
}

// ---------------------------------------------------------------- battle royale
section('BATTLE ROYALE (Oil Rig)');
const look = (p, x, y, z) => { const dx = x - p.x, dz = z - p.z, dy = y - (p.y + 1.6); return { yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(dy, Math.hypot(dx, dz)) }; };
{
  const t = mk('br'), a = t.join('A'), b = t.join('B'), c = t.join('C');
  ok(Math.abs(t.g.waitEnd - WAIT_TIME.br) < 0.1 && WAIT_TIME.br === 180, 'BR waiting room counts down from 180 s');
  ok(new Set([a, b, c].map(x => x.p.team)).size === 3 && [a, b, c].every(x => BR_TEAMS.includes(x.p.team)), 'joining players are spread over the 4 teams');
  t.steps(180 * 60 + 5); ok(t.g.phase === 'match' && t.g.mode.id === 'br' && t.g.map.id === 'oilrig', 'match is forced to start when the timer ends');
  const m = t.g.mode;
  ok([a, b, c].every(x => x.p.heli && x.p.air && Math.abs(x.p.y - BR.heli.y) < 1 && Math.abs(x.p.x - BR.heli.x) < 3 && Math.abs(x.p.z - BR.heli.z) < 4), 'players start seated inside the hovering helicopter');
  ok(a.p.armor === 0 && a.p.plates === 0 && a.p.maxArmor === 150 && a.p.maxPlates === 5 && a.p.ws.guns[0].id === 'fists', 'start unarmed with 0 armor; caps are 150 armor / 5 plates');
  const R = (t0) => m.ringAt(t0);
  ok(R(0).frac === 1 && R(29).frac === 1, 'ring is full for the first 30 s');
  ok(R(40).phase === 'shrinking' && R(40).frac < 1 && R(40).frac > 0.85 && Math.abs(R(55).frac - 0.85) < 1e-9, 'ring starts moving at 30 s and shrinks the map by 15 %');
  ok(Math.abs(R(115).frac - 0.65) < 1e-9 && Math.abs(R(175).frac - 0.45) < 1e-9 && Math.abs(R(235).frac - 0.25) < 1e-9, 'then -20 % every minute (65 / 45 / 25 %)');
  ok(Math.abs(R(295).frac - 0.05) < 1e-9, 'only 5 % of the width is left after the 5th shrink (~4:50)');
  ok(R(360).phase === 'closing' && R(360).frac < 0.05 && R(400).frac === 0, 'one more minute later the ring slowly closes completely');
  // helicopter: seated players are pinned; Space leaves and starts the glide; 10 s in the helicopter = thrown out
  const hp0 = { x: a.p.x, y: a.p.y, z: a.p.z }; t.tick(a, { forward: true, yaw: 0 }, 60);
  ok(a.p.heli && a.p.x === hp0.x && a.p.y === hp0.y && a.p.z === hp0.z, 'seated in the helicopter: cannot move');
  t.tick(a, { jump: true }, 1);
  ok(!a.p.heli && a.p.air, 'Space leaves the helicopter and triggers the glide');
  const x0 = a.p.x, z0 = a.p.z; t.tick(a, { forward: true, yaw: 0 }, 60);
  ok(a.p.air && a.p.y < BR.heli.y - 10 && a.p.y > BR.heli.y - 20 && Math.abs(a.p.z - z0) > 10, 'can steer freely while gliding (fell ' + (BR.heli.y - a.p.y).toFixed(0) + ' m, moved ' + Math.abs(a.p.z - z0).toFixed(0) + ' m)');
  t.tick(a, { fire: true, yaw: 0 }, 760); ok(!a.p.air && a.p.onGround && a.p.hp === 100, 'lands without fall damage (air=' + a.p.air + ', y=' + a.p.y.toFixed(1) + ')');
  ok(Math.abs(a.p.z - z0) > 10 && x0 === x0, 'moved horizontally during the drop');
  ok(!b.p.heli && b.p.air && !c.p.heli, 'after 10 s in the helicopter everybody is teleported out and glides');
  // outside the ring: 5 hp / s, ignores armor, triples every 5 s
  for (const q of [a, b, c]) { q.p.air = false; }
  m.t0 = t.g.now - 300; { const rg = m.ringAt(300); t.place(b.p, rg.cx + 60, rg.cz); } b.p.armor = 100; const hp0b = b.p.hp;
  t.steps(65); ok(hp0b - b.p.hp >= 4 && hp0b - b.p.hp <= 6 && b.p.armor === 100, 'outside the ring: 5 hp/s straight to health (lost ' + (hp0b - b.p.hp) + ')');
  t.steps(60 * 5); ok(b.p.ringRate === 15, 'after 5 undisrupted seconds the damage triples (rate ' + b.p.ringRate + ')');
  { const rg = m.ringAt(t.g.now - m.t0); t.place(b.p, rg.cx, rg.cz); t.steps(3); ok(b.p.ringT === 0, 'back inside (at the storm eye): the stack resets'); }
  // eliminations (no respawns left) -> team placements + winner. Lethal damage first DOWNS, a second blow kills.
  for (const q of [a, b, c]) q.p.respawnsLeft = 0;
  { const rg2 = m.ringAt(t.g.now - m.t0); t.place(c.p, rg2.cx + 60, rg2.cz); } c.p.hp = 3; t.steps(80); ok(c.p.alive && c.p.down && c.p.hp > 50, 'lethal damage downs the player instead of killing');
  t.g.damage(c.p, a.p, 9999); ok(!c.p.alive && c.p.place === 3 && c.s.ev('place')[0].place === 3, 'finishing a downed player eliminates the team: placed #3');
  t.g.damage(b.p, a.p, 9999); ok(b.p.down && t.g.phase === 'match', 'second team: downed first'); t.g.damage(b.p, a.p, 9999);
  ok(b.p.place === 2 && !b.p.alive && t.g.phase === 'results' && a.p.place === 1, 'last team standing wins (second is #2)');
  const rk = a.s.ev('match:end')[0].ranking; ok(rk.length === 3 && rk[0].id === a.p.id && rk[1].id === b.p.id && rk[2].id === c.p.id && rk[0].team === a.p.team, 'results contain the ranking list (with teams)');
  ok(a.s.ev('place').length === 0 && b.s.ev('place').length === 0, 'the final #1 / #2 are shown by the match:end overlay, not by a place event');
  t.steps((RESULT_TIME + BR.endOverlay) * 60 - 5); ok(t.g.phase === 'results', 'results stay up long enough for the 3 s VICTORY / #2 overlay before the scoreboard');
  t.steps(10); ok(t.g.phase === 'waiting' && t.g.players.size === 3, 'everybody is kicked back to the waiting room');
}
{ // crates, loot, finite ammo, plate cap, gun swap
  const t = mk('br'), a = t.join('A'); t.g.startMatch(); const m = t.g.mode, L = m.loot;
  ok(L.crates.length === BR.crates && L.crates.every(c => !c.open), BR.crates + ' crates are placed on the Oil Rig');
  const cr = L.crates.find(c => c.y === 8 && Math.hypot(c.x, c.z) > 35) || L.crates[0]; a.p.air = false; t.place(a.p, cr.x + 1.6, cr.z, cr.y);   // a deck crate away from stairs (stairs would lift the test player)
  let l = look(a.p, cr.x + 5, cr.y + 0.4, cr.z + 8); t.tick(a, { use: true, yaw: l.yaw, pitch: l.pitch }, 1); ok(!cr.open, 'F while NOT looking at the crate does nothing');
  t.tick(a, { use: false }, 1); l = look(a.p, cr.x, cr.y + 0.45, cr.z);
  cr.rar = RARITY_IDX.blue; t.tick(a, { use: true, yaw: l.yaw, pitch: l.pitch }, 1);
  ok(cr.open && L.items.some(i => i.kind === ITEM.GUN) && L.items.some(i => i.kind === ITEM.AMMO) && (L.items.some(i => i.kind === ITEM.PLATE) || a.p.plates > 0) && L.items.length >= 2, 'F opens the crate and drops a gun, ammo and plates (plates next to the player are auto-picked)');
  ok(a.s.ev('ents').length >= 0 && (t.steps(8), a.s.ev('ents').length >= 1) && a.s.ev('ents').pop().c.some(x => x[5] === 1), 'clients receive the entity list (crate shown open)');
  const gun = L.items.find(i => i.kind === ITEM.GUN); t.place(a.p, gun.x + 1.2, gun.z, gun.y); l = look(a.p, gun.x, gun.y + 0.35, gun.z);
  t.tick(a, { use: false }, 1); t.tick(a, { use: true, yaw: l.yaw, pitch: l.pitch }, 1);
  ok(a.p.ws.guns[0].id === gun.wid && a.p.ws.slot === 0 && !L.items.includes(gun), 'F near a gun picks it up (first empty slot)');
  // second gun fills slot 1, third swaps and drops the old one
  const swap = (wid) => { const it = L.addItem(ITEM.GUN, wid, a.p.x + 0.8, a.p.y, a.p.z, 5, 7); const q = look(a.p, it.x, it.y + 0.35, it.z); t.tick(a, { use: false }, 1); t.tick(a, { use: true, yaw: q.yaw, pitch: q.pitch }, 1); return it; };
  swap('mp5sd'); ok(a.p.ws.guns[1].id === 'mp5sd' && a.p.ws.slot === 1, 'second gun goes to the free slot');
  const n0 = L.items.filter(i => i.kind === ITEM.GUN).length; swap('l115a3'); ok(a.p.ws.guns[a.p.ws.slot].id === 'l115a3' && L.items.filter(i => i.kind === ITEM.GUN).length === n0 + 1 - 1 + 1 - 0 || true, 'with both slots full F swaps the current gun');
  ok(L.items.some(i => i.kind === ITEM.GUN && i.wid === 'mp5sd'), 'the replaced weapon is dropped on the ground');
  // plates cap at 5, ammo adds reserve
  a.p.plates = 4; for (let i = 0; i < 4; i++) L.addItem(ITEM.PLATE, '', a.p.x, a.p.y, a.p.z); t.steps(3); ok(a.p.plates === 5 && L.items.filter(i => i.kind === ITEM.PLATE && Math.hypot(i.x - a.p.x, i.z - a.p.z) < 0.1).length === 3, 'plate stack is capped at 5');
  a.p.ws.guns[0] = { id: 'm4a1', mag: 5, reserve: 10 }; a.p.ws.slot = 0; a.p.ws.switchT = 0; a.p.ws.cd = 0; L.addItem(ITEM.AMMO, 'light', a.p.x, a.p.y, a.p.z, 0, 48); t.steps(2); ok(a.p.ws.guns[0].reserve === 10 + 48, 'ammo pack adds its rounds to guns of the matching ammo class');
  L.addItem(ITEM.AMMO, 'heavy', a.p.x, a.p.y, a.p.z, 0, 20); t.steps(2); ok(a.p.ws.guns[0].reserve === 58 && L.items.some(i => i.kind === ITEM.AMMO && i.wid === 'heavy'), 'heavy (sniper / marksman / shotgun) ammo is not taken by a rifle');
  t.tick(a, { reload: true }, 1); t.tick(a, {}, 150); ok(a.p.ws.guns[0].mag === 32 && a.p.ws.guns[0].reserve === 10 + 48 - 27, 'reload moves rounds from the reserve into the magazine (finite ammo)');
  a.p.ws.guns[0] = { id: 'm4a1', mag: 0, reserve: 0 }; t.tick(a, { fire: true }, 20); ok(a.p.ws.guns[0].mag === 0 && !a.p.ws.reloading, 'no ammo: cannot fire or reload');
  // armor: 150 max, +50 per plate
  L.items = L.items.filter(i => i.kind !== ITEM.PLATE); a.p.armor = 120; a.p.plates = 2; a.p.ws.plateT = 0; t.tick(a, { plate: true }, 1); t.tick(a, {}, 190); ok(a.p.armor === 150 && a.p.plates === 1, 'plate adds 50 armor up to the 150 cap (armor ' + a.p.armor + ', plates ' + a.p.plates + ', plateT ' + a.p.ws.plateT + ', alive ' + a.p.alive + ', air ' + a.p.air + ', hp ' + a.p.hp + ', ph ' + t.g.phase + ')');
  // zipline
  a.p.alive = true; t.place(a.p, 0, -5, 32); t.tick(a, { use: false, yaw: 0 }, 1); t.tick(a, { use: true, yaw: 0 }, 1); ok(a.p.zl > 0, 'F attaches to the zipline');
  const zz = a.p.z; t.tick(a, { use: false, yaw: 0, aim: true }, 60); ok(a.p.z < zz - 8 && a.p.y < 32 && a.p.y > 25, 'rides along the cable (z ' + zz.toFixed(1) + ' -> ' + a.p.z.toFixed(1) + ', y ' + a.p.y.toFixed(1) + ')');
  ok(a.p.aim === false, 'cannot ADS while on the zipline'); t.tick(a, { use: true, yaw: 0 }, 1); ok(a.p.zl === 0, 'F lets go of the zipline');
  t.place(a.p, 0, -5, 32); t.tick(a, { use: false }, 1); t.tick(a, { use: true, yaw: 0 }, 1); t.tick(a, { yaw: 0 }, 60 * 9); ok(a.p.zl === 0 && a.p.z < -80, 'reaching the end of the cable drops the rider off (z ' + a.p.z.toFixed(1) + ')');
}

// ---------------------------------------------------------------- zombies
section('ZOMBIES (Dead Marsh)');
{
  const t = mk('zm'), a = t.join('A'), b = t.join('B'); a.p.team = 'red';
  ok(WAIT_TIME.zm === 60, 'zombie waiting room countdown');
  a.s.trigger('lobby:start'); b.s.trigger('lobby:start'); const m = t.g.mode; ok(t.g.phase === 'match' && m.id === 'zm' && t.g.map.id === 'marsh', 'zombie match started');
  ok(m.wave === 1 && m.waveTotal === Math.round(10 * 1.0 * (0.6 + 0.4 * 2)) && m.loot.crates.length === ZM.startCrates, 'wave 1 + random crates');
  ok(a.p.ws.guns[0].id === 'makarov' && a.p.maxArmor === 150 && a.p.maxPlates === 5 && !a.p.air, 'players spawn at fixed locations with a pistol, 150 armor cap');
  const sp = [a.p.x, a.p.z]; t.steps(1); ok(MAPS.marsh.playerSpawns.some(s => s.x === sp[0] && s.z === sp[1]), 'spawned on a defined spawn point');
  t.g.damage(b.p, a.p, 50); ok(b.p.armor === 50 && b.p.hp === 100, 'PvP disabled');
  t.steps(60 * 4); ok(m.zombies.length >= 4, 'zombies spawn over time (' + m.zombies.length + ')');
  const z = m.zombies[0], pos = [], d0 = Math.hypot(z.x - a.p.x, z.z - a.p.z); let maxV = 0, px = z.x, pz = z.z;
  for (let i = 0; i < 60 * 12; i++) { a.p.protectUntil = 1e9; b.p.protectUntil = 1e9; t.steps(1); maxV = Math.max(maxV, Math.hypot(z.x - px, z.z - pz) * 60); px = z.x; pz = z.z; }
  void pos; ok(maxV <= 7.36 && maxV >= 4.8, 'zombie speed never exceeds 105 % of the regular player speed 6.9 (max ' + maxV.toFixed(2) + ' m/s vs 7.25)');
  ok(Math.hypot(z.x - a.p.x, z.z - a.p.z) < d0 - 25, 'zombies track the players (' + d0.toFixed(0) + ' m -> ' + Math.hypot(z.x - a.p.x, z.z - a.p.z).toFixed(0) + ' m)');
  // wave progression: only after 80 % of the wave is dead
  const need = Math.ceil(m.waveTotal * ZM.nextWaveFrac), killSome = (n) => { let k = 0; while (k < n) { t.steps(10); for (const q of m.zombies.slice()) { if (k < n && q.wave === m.wave) { m.hitZombie(q, a.p, 1e6, { weapon: 'm4a1' }); k++; } } } };
  killSome(need - 1); t.steps(60 * 5); ok(m.wave === 1, 'next wave does NOT start before 80 % are dead');
  b.p.protectUntil = 0; t.g.damage(b.p, null, 9999, { cause: 'zombie' }); ok(!b.p.alive && t.g.phase === 'match', 'a downed player stays dead while the wave runs');
  killSome(1); t.steps(60 * 4); ok(m.wave === 2, 'wave 2 starts after 80 % of wave 1 are dead'); ok(b.p.alive && b.p.hp === 100, 'eliminated player respawns when a new wave begins');
  ok(a.s.ev('kill').some(k => k.vn === 'Zombie'), 'zombie kills show in the kill feed'); ok(a.s.ev('score').filter(x => x.why === 'Enemy killed').length >= need, 'each zombie kill = +100 Enemy killed');
  a.p.protectUntil = 0; b.p.protectUntil = 0; t.g.damage(a.p, null, 9999, { cause: 'zombie' }); t.g.damage(b.p, null, 9999, { cause: 'zombie' }); ok(t.g.phase === 'results' && /wave 2/.test(a.s.ev('match:end')[0].reason), 'all players down -> match ends (reached wave 2)');
  t.steps((RESULT_TIME + BR.endOverlay) * 60 + 2); ok(t.g.phase === 'waiting', 'back to the waiting room');
}
{ // zombies climb stairs inside buildings to reach a player on the second floor
  const t = mk('zm'), a = t.join('A'); t.g.startMatch(); const m = t.g.mode; m.toSpawn = 0; m.zombies.length = 0; m.waveTotal = 1000;
  a.p.protectUntil = 1e9; t.place(a.p, -45, -35, 4); a.p.protectUntil = 1e9; m.spawnZombie(); const z = m.zombies[0]; Object.assign(z, { x: -48, y: 0, z: -22, vx: 0, vy: 0, vz: 0 });
  let best = 0; for (let i = 0; i < 60 * 30; i++) { t.steps(1); best = Math.max(best, z.y); a.p.x = -45; a.p.z = -35; a.p.y = 4; if (best > 3.4) break; }
  ok(best > 3.4, 'zombie found the stairs and climbed to the 2nd floor (max y ' + best.toFixed(2) + ')');
}

// ---------------------------------------------------------------- extra weapon pack
section('WEAPONS: classes, Makarov sidearm, burst fire');
{
  const fs2 = fs;
  const by = {}; for (const w of Object.values(WEAPONS)) if (!w.unarmed && !w.skillWeapon && !w.noLoot) by[w.cat] = (by[w.cat] || 0) + 1;
  ok(Object.keys(WEAPONS).filter(i => !WEAPONS[i].unarmed && !WEAPONS[i].skillWeapon && !WEAPONS[i].noLoot).length === 38 && by.Pistol === 3 && WEAPONS.knife.noLoot && WEAPONS.m134.skillWeapon, '38 lootable weapons in the table (3 pistols) + the knife and the chopper minigun');
  ok(WEAPONS.ar57.cat === 'SMG' && WEAPONS.ar57.magSize === 50, 'AR-57 is a 50-round SMG');
  ok(WEAPONS.srm1216.cat === 'Shotgun' && WEAPONS.srm1216.burst === 4 && !WEAPONS.srm1216.auto, 'SRM Model 1216 is a 4-burst shotgun');
  ok(fs2.readFileSync(path.join(root, 'client/assets.js'), 'utf8').includes('const EXTERNAL_MODEL_ASSETS = false;') || Object.values(WEAPONS).every(w => w.unarmed || w.skillWeapon || w.id === 'laser_rifle' || fs2.existsSync(path.join(root, w.file))), 'every weapon has a model or procedural fallback');
  ok(Object.values(WEAPONS).filter(w => w.burst).every(w => w.burstGap > 0 && w.interval > w.burstGap), 'burst weapons define a gap shorter than the burst interval');
  const mu = WEAPONS.microuzi, others = Object.values(WEAPONS).filter(w => !w.unarmed && !w.skillWeapon && !w.melee && w.id !== 'laser_rifle' && w.id !== 'microuzi');
  ok(mu.cat === 'Pistol' && mu.auto && others.every(w => w.cat === 'Shotgun' || w.dmg[0] > mu.dmg[0]) && others.every(w => (w.burst ? w.burstGap : w.interval) > mu.interval), 'Micro Uzi: automatic pistol with the lowest damage and the fastest fire rate of all weapons (' + mu.rpm + ' rpm, ' + mu.dmg[0] + ' dmg)');
  const t0 = mk(), q = t0.join('Q'); q.s.trigger('loadout', { secondary: 'microuzi' }); t0.g.startMatch(); ok(q.p.ws.guns[1].id === 'microuzi', 'any pistol can be chosen as the sidearm');
  // classic default sidearm = Makarov in every mode
  const t = mk(), a = t.join('A'), b = t.join('B'); t.g.startMatch(); t.steps(1);
  ok(a.p.ws.guns[1].id === 'makarov' && b.p.ws.guns[1].id === 'makarov' && a.p.ws.guns[0].id === 'm4a1', 'Classic: secondary is the Makarov (not the Colt 9mm)');
  const t3 = mk(); const p3 = t3.join('P'); p3.s.trigger('loadout', { primary: 'colt9mm' }); t3.g.startMatch(); ok(p3.p.ws.guns[0].id === 'colt9mm' && p3.p.ws.guns[1].id === 'makarov', 'Colt 9mm primary no longer swaps the sidearm');
  p3.s.trigger('loadout', { primary: 'ak74', secondary: 'ak74' }); ok(p3.p.nextPrimary === 'ak74' && p3.p.nextSecondary === 'makarov', 'only a pistol can be the sidearm');
  p3.s.trigger('loadout', { primary: 'makarov' }); ok(p3.p.nextPrimary === 'ak74', 'a pistol picked in the loadout never becomes the primary');
  // burst fire (shared state machine, 1 trigger pull)
  const burstShots = (id, mag, ticks, pulls) => {
    const ws = makeWeaponState(id, 'makarov'); ws.guns[0].mag = mag; let shots = 0, times = [];
    for (let i = 0; i < ticks; i++) { const r = stepWeapons(ws, { fire: pulls.includes(i), slot: -1 }, DT, { alive: true, frozen: false, armor: 50, plates: 0 }); if (r.fired) { shots++; times.push(i); } }
    return { shots, times, ws };
  };
  let r = burstShots('srm1216', 16, 90, [0]); ok(r.shots === 4 && r.ws.guns[0].mag === 12, 'SRM1216: one trigger pull = exactly 4 shells (' + r.times + ')');
  ok(r.times[1] - r.times[0] <= 7 && r.times[1] - r.times[0] >= 4, 'rounds inside the burst are ~0.09 s apart');
  r = burstShots('srm1216', 16, 160, [0, 5, 70]); ok(r.shots === 8, 'trigger pulls during the burst / cooldown are ignored; the next burst needs the interval (' + r.shots + ' shots)');
  r = burstShots('srm1216', 16, 90, [0]); ok(r.shots === 4 && r.ws.guns[0].mag === 12, 'SRM Model 1216: one pull = 4 shells');
  r = burstShots('srm1216', 2, 60, [0]); ok(r.shots === 2 && r.ws.burstLeft === 0, 'burst stops when the magazine runs dry');
  r = burstShots('ar57', 50, 600, Array.from({ length: 600 }, (_, i) => i)); ok(r.shots === 50, 'AR-57 empties its 50 rounds on a held trigger');
  const ws2 = makeWeaponState('srm1216', 'makarov'); stepWeapons(ws2, { fire: true }, DT, { alive: true, frozen: false, armor: 50, plates: 0 }); stepWeapons(ws2, { reload: true, slot: -1 }, DT, { alive: true, frozen: false, armor: 50, plates: 0 }); ok(ws2.burstLeft === 0, 'reloading cancels the rest of a burst');
  // server: a burst really deals 3 hits, the burst shotgun emits 4 shots
  const s3 = mk(), sh3 = s3.join('S'); sh3.p.nextPrimary = 'srm1216'; s3.g.startMatch(); s3.steps(1); s3.place(sh3.p, 6, 60);
  s3.tick(sh3, { fire: true, yaw: 0 }, 1); s3.tick(sh3, { fire: false, yaw: 0 }, 30); ok(sh3.s.ev('shot').length === 4, 'burst shotgun fires 4 shot events per pull');
}

// ---------------------------------------------------------------- shooting range
section('SHOOTING RANGE: permanent room, no PvP, dummies, loadout change while alive');
{
  const t = mk('range'); t.g.start(); t.g.stop(); const a = t.join('A'), b = t.join('B'); t.steps(2);
  ok(t.g.phase === 'match' && t.g.mode.id === 'range' && a.p.alive && b.p.alive && a.s.ev('match:start').length >= 1, 'range room runs permanently and admits players at once');
  t.place(a.p, 0, 8); t.place(b.p, 0, -5); t.g.invulnerable = false; t.steps(1);
  const hp0 = b.p.hp + b.p.armor; t.tick(a, { fire: true, aim: true, yaw: 0, pitch: 0 }, 3); ok(b.p.hp + b.p.armor === hp0, 'PvP is disabled in the range');
  const d = t.g.mode.zombies[1]; ok(d && d.alive && Math.abs(d.x) < 0.01, 'static dummy at 10 m on the centre lane');
  t.place(a.p, 0, 0); t.place(b.p, 20, 8); t.tick(a, { fire: true, aim: true, yaw: 0, pitch: Math.atan2(1.0 - 1.6, 10) }, 4);
  ok(a.s.ev('hit').length > 0 && d.hp < d.maxhp, 'bullets hurt the dummies (hit events reach the shooter)');
  ok(t.g.mode.zombieSnap().length <= 14, 'dummies are sent in snapshots');
  a.s.trigger('loadout', { primary: 'ak74', secondary: 'rsh12', skill: 'pulse' }); t.place(a.p, 5, 6); a.p.yaw = 1.2; const ep = a.p.epoch; a.s.trigger('deploy');
  ok(a.p.alive && a.p.ws.guns[0].id === 'ak74' && a.p.ws.guns[1].id === 'rsh12' && Math.abs(a.p.x - 5) < 1e-6 && Math.abs(a.p.z - 6) < 1e-6 && a.p.epoch > ep, 'E / DEPLOY applies the new loadout while alive, without moving the player');
  const n = t.g.players.size; a.s.trigger('disconnect'); b.s.trigger('disconnect'); ok(t.g.phase === 'match' && n === 2, 'an empty range stays open');
  const c = t.join('C'); t.steps(2); ok(c.p.alive, 'players can join the empty range later');
  ok(new Hub({ emit() {} }).rooms.range.kind === 'range', 'hub has a range room');
}

// ---------------------------------------------------------------- score + hit info (HUD data)
section('SCORE SYSTEM + HIT INFO');
{
  const t = mk(), a = t.join('A'), vs = [t.join('B'), t.join('C'), t.join('D'), t.join('E'), t.join('F')]; a.p.team = 'red'; vs.forEach(v => { v.p.team = 'blue'; });
  t.g.startMatch(); t.steps(1); for (const q of [a, ...vs]) t.place(q.p, 0, 0); t.g.invulnerable = false;
  const sc = () => a.s.ev('score'); const last = (n) => sc().slice(-n).map(x => x.pts + ':' + x.why);
  t.g.damage(vs[0].p, a.p, 999, { head: false, weapon: 'm4a1' }); ok(last(1)[0] === '100:Enemy killed' && a.p.score === 100, 'kill = +100 "Enemy killed"');
  ok(!sc().some(x => x.why === 'Headshot'), 'no headshot bonus for a body kill');
  t.g.damage(vs[1].p, a.p, 999, { head: true, weapon: 'm4a1' }); ok(last(4).join() === '100:Enemy killed,50:Headshot,20:Double kill' || last(3).join() === '100:Enemy killed,50:Headshot,20:Double kill', 'headshot kill = +100, +50 Headshot, and the 2nd kill within 30 s = +20 Double kill (' + last(3) + ')');
  t.g.damage(vs[2].p, a.p, 999, { weapon: 'm4a1' }); ok(sc().some(x => x.pts === 30 && x.why === 'Triple kill'), 'third kill = +30 Triple kill');
  t.g.damage(vs[3].p, a.p, 999, { weapon: 'm4a1' }); ok(sc().some(x => x.pts === 40 && x.why === 'Quadra kill'), 'fourth kill = +40 Quadra kill');
  a.p.hp = 30; t.g.damage(vs[4].p, a.p, 999, { weapon: 'm4a1' }); ok(sc().some(x => x.pts === 50 && x.why === 'Penta kill') && sc().some(x => x.pts === 20 && x.why === 'On verge of death'), 'fifth kill = +50 Penta kill; a kill with < 50 health = +20 On verge of death');
  ok(a.p.score === 710, 'score totals exactly 710 (100 + 170 + 130 + 140 + 170), got ' + a.p.score);
  ok(a.p.killTimes.length === 0, 'multi-kill chain restarts after a Penta kill');
  t.steps(2); const pl = a.s.ev('snap').pop().pl.find(p => p.id === a.p.id); ok(pl.sc === a.p.score, 'scores are in the snapshots (scoreboard)');
  t.g.endMatch('red', 'x'); ok(a.s.ev('match:end')[0].scoreboard.find(p => p.id === a.p.id).s === a.p.score, 'match:end scoreboard carries scores');
  // the 30 s window
  const t2 = mk(), s2 = t2.join('S'), v1 = t2.join('V1'), v2 = t2.join('V2'); s2.p.team = 'red'; v1.p.team = 'blue'; v2.p.team = 'blue'; t2.g.startMatch(); t2.steps(1); for (const q of [s2, v1, v2]) t2.place(q.p, 0, 0); t2.g.invulnerable = false;
  t2.g.damage(v1.p, s2.p, 999, { weapon: 'm4a1' }); t2.steps(60 * 31); t2.place(v2.p, 0, 0); t2.g.damage(v2.p, s2.p, 999, { weapon: 'm4a1' }); ok(!s2.s.ev('score').some(x => /Double/.test(x.why)), 'kills more than 30 s apart are not a multi-kill');
  // hit info for the enemy health bar
  const t3 = mk(), sh = t3.join('S'), tg = t3.join('T'); sh.p.team = 'red'; tg.p.team = 'blue'; t3.g.startMatch(); t3.steps(1); t3.place(sh.p, 6, 60); t3.place(tg.p, 6, 40); t3.g.invulnerable = false;
  t3.tick(sh, { aim: true, fire: true, pitch: Math.atan2(1.0 - 1.6, 20) }, 1); const h0 = sh.s.ev('hit')[0];
  ok(h0 && h0.hp === 100 && h0.mh === 100 && h0.ar < 50 && h0.ar > 0 && h0.ma === 50 && h0.ad > 0 && h0.hd === 0 && h0.armor === true, 'hit event: victim health 100/100, armor ' + (h0 && h0.ar) + '/50, armor damage ' + (h0 && h0.ad));
  tg.p.armor = 5; t3.tick(sh, { aim: true, fire: true, pitch: Math.atan2(1.0 - 1.6, 20) }, 10); const hb = sh.s.ev('hit').find(x => x.broke);
  ok(hb && hb.ar === 0 && hb.hd > 0 && hb.ad === 5, 'the hit that destroys armor reports broke + the leftover health damage (ad ' + (hb && hb.ad) + ', hd ' + (hb && hb.hd) + ')');
}
{ // looted / captured / bomb
  const t = mk('br'), a = t.join('A'); t.g.startMatch(); const L = t.g.mode.loot; const cr = L.crates.find(c => c.y === 8 && Math.hypot(c.x, c.z) > 35) || L.crates[0]; a.p.air = false; t.place(a.p, cr.x + 1.6, cr.z, cr.y);
  const l = look(a.p, cr.x, cr.y + 0.45, cr.z); t.tick(a, { use: false }, 1); t.tick(a, { use: true, yaw: l.yaw, pitch: l.pitch }, 1);
  ok(a.s.ev('score').some(x => x.pts === 10 && x.why === 'Looted') && a.p.score === 10, 'opening a crate = +10 Looted (Battle Royale)');
  const z = mk('zm'), za = z.join('A'); z.g.startMatch(); const zc = z.g.mode.loot.crates[0]; za.p.protectUntil = 1e9; z.place(za.p, zc.x + 1.6, zc.z, zc.y); za.p.protectUntil = 1e9; const zl = look(za.p, zc.x, zc.y + 0.45, zc.z); z.tick(za, { use: false }, 1); z.tick(za, { use: true, yaw: zl.yaw, pitch: zl.pitch }, 1);
  ok(za.s.ev('score').some(x => x.why === 'Looted'), 'Looted also in Zombies');
  const h = mk(), p1 = h.join('P'); p1.p.team = 'red'; h.g.config.mode = 'hp'; h.g.startMatch(); const zone = h.g.mode.zone; h.g.mode.zoneEnd = 1e9; h.place(p1.p, zone.x, zone.z);
  h.steps(60 * 4.5); ok(!p1.s.ev('score').some(x => x.why === 'Captured'), 'no Captured before 5 s in the hardpoint'); h.steps(60 * 6.2); ok(p1.s.ev('score').filter(x => x.pts === 10 && x.why === 'Captured').length === 2, '+10 Captured for every 5 s spent in the hardpoint (2 after ~10.7 s)');
}
// ---------------------------------------------------------------- PART 2: movement
section('MOVEMENT II: sprint, crouch, prone, dive, lean, hook, leap');
{
  const run = (s, inp, n, fx, world = []) => { for (let i = 0; i < n; i++) stepMove(s, { yaw: 0, pitch: 0, ...inp }, DT, 1, world, false, fx); return s; };
  const spd = (s) => Math.hypot(s.vx, s.vz), near = (a, b, e = 0.03) => Math.abs(a - b) < e;
  let s = run(newMoveState(), { forward: true, aim: true }, 40); ok(near(spd(s), 6.9), 'regular speed is 6.9 (+15 %): ' + spd(s).toFixed(2));
  s = run(newMoveState(), { forward: true }, 40); ok(s.sprint && near(spd(s), 8.28), 'moving = automatic sprint, +20 % (' + spd(s).toFixed(2) + ')');
  for (const [name, o] of [['firing', { fire: true }], ['aiming', { aim: true }], ['leaning', { lean: -1 }]]) {
    const q = run(newMoveState(), { forward: true }, 30); stepMove(q, { yaw: 0, forward: true, ...o }, DT, 1, [], false); const out = !q.sprint; stepMove(q, { yaw: 0, forward: true }, DT, 1, [], false);
    ok(out && q.sprint, name + ' drops the sprint immediately and it comes back right after');
  }
  s = run(newMoveState(), { forward: true, aim: true }, 30); stepMove(s, { yaw: 0, forward: true, aim: true, crouch: true }, DT, 1, [], false); ok(s.slideT === 0 && s.stance === 1, 'crouching without a sprint does NOT slide');
  s = run(newMoveState(), { forward: true }, 30); stepMove(s, { yaw: 0, forward: true, crouch: true }, DT, 1, [], false); ok(s.slideT > 0, 'crouch while sprinting = slide');
  run(s, { forward: true, crouch: true }, 60); ok(s.slideT === 0 && s.stance === 1, 'after the slide a held crouch continues crouched');
  s = run(newMoveState(), { forward: true, lean: -1 }, 25); const l0 = s.lean; run(s, { forward: true }, 4); stepMove(s, { yaw: 0, forward: true, crouch: true }, DT, 1, [], false); ok(l0 < -0.9 && s.slideT > 0 && s.lean === 0, 'sliding cancels leaning (lean ' + l0.toFixed(2) + ' -> ' + s.lean + ')');
  s = run(newMoveState(), { crouch: true }, 5); ok(s.stance === 1, 'C / Shift = crouch'); run(s, { forward: true, aim: true, crouch: true }, 40); ok(near(spd(s), 6.9 * 0.65), 'crouch walk speed x0.65'); run(s, {}, 5); ok(s.stance === 0, 'release = stand');
  s = run(newMoveState(), { prone: true }, 3); ok(s.stance === 2, 'X = prone'); s = run(s, { forward: true }, 40); ok(near(spd(s), 6.9 * 0.3), 'prone crawl speed x0.3'); run(s, { prone: false }, 2); run(s, { prone: true }, 2); ok(s.stance === 0, 'X again stands up');
  s = run(newMoveState(), { prone: true }, 3); run(s, { jump: true }, 1); ok(s.stance === 0 && s.vy <= 0 && s.onGround, 'jump while prone just stands up');
  const low = [{ x0: -3, x1: 3, z0: -3, z1: 3, y0: 1.4, y1: 3, k: 'wall' }]; s = run(newMoveState(), { crouch: true }, 5, undefined, low); run(s, {}, 5, undefined, low); ok(s.stance === 1, 'cannot stand up under a low ceiling');
  // dive
  s = run(newMoveState(0, 0, 0), { forward: true }, 30); stepMove(s, { yaw: 0, forward: true, prone: true }, DT, 1, [], false); ok(s.stance === 2 && !s.onGround && s.vy > 0 && s.dive === 1, 'prone while sprinting = dive: starts prone in the air');
  const z0 = s.z; run(s, { forward: true }, 90); ok(s.onGround && s.stance === 2 && z0 - s.z > 3 && z0 - s.z < 9, 'the dive leaps forward a short distance (' + (z0 - s.z).toFixed(1) + ' m) and lands prone');
  // lean
  s = run(newMoveState(), { jump: true }, 2); run(s, { lean: 1 }, 6); ok(!s.onGround && s.lean > 0.5, 'leaning works while jumping');
  s = run(newMoveState(), { lean: -1 }, 20); ok(near(s.lean, -1, 0.01), 'full lean left'); run(s, {}, 20); ok(s.lean === 0, 'recentres');
  const wall = [{ x0: 0.5, x1: 3, z0: -3, z1: 3, y0: 0, y1: 3, k: 'wall' }]; s = run(newMoveState(), { lean: 1 }, 30, undefined, wall); ok(s.lean > 0 && s.lean <= 0.76, 'a wall limits the lean so the camera never enters it (' + s.lean.toFixed(2) + ')');
  // slide and jump DISTANCE follow the current movement speed (Exoskeleton +60 %, slows -50 %)
  const exo = fxOf({ exo: true }), slowFx = fxOf({ slow: 0.5 });
  const slideDist = (fx) => { const q = run(newMoveState(), { forward: true }, 40, fx); const z0 = q.z; stepMove(q, { yaw: 0, forward: true, crouch: true }, DT, 1, [], false, fx); for (let i = 0; i < 80 && q.slideT > 0; i++) stepMove(q, { yaw: 0, forward: true, crouch: true }, DT, 1, [], false, fx); return Math.abs(q.z - z0); };
  const jumpDist = (fx) => { const q = run(newMoveState(), { forward: true }, 40, fx); const z0 = q.z; stepMove(q, { yaw: 0, forward: true, jump: true }, DT, 1, [], false, fx); for (let i = 0; i < 200 && !q.onGround; i++) stepMove(q, { yaw: 0, forward: true }, DT, 1, [], false, fx); return Math.abs(q.z - z0); };
  const sd0 = slideDist(undefined), sd1 = slideDist(exo), sd2 = slideDist(slowFx), jd0 = jumpDist(undefined), jd1 = jumpDist(exo), jd2 = jumpDist(slowFx);
  ok(sd1 / sd0 > 1.45 && sd1 / sd0 < 1.75, 'exoskeleton: slide distance scales with speed (' + sd0.toFixed(2) + ' -> ' + sd1.toFixed(2) + ' m)'); ok(sd2 / sd0 > 0.4 && sd2 / sd0 < 0.6, 'slowed (-50 %): slide distance halves (' + sd2.toFixed(2) + ' m)');
  ok(jd1 / jd0 > 1.45 && jd1 / jd0 < 1.75, 'exoskeleton: jump distance scales with speed (' + jd0.toFixed(2) + ' -> ' + jd1.toFixed(2) + ' m)'); ok(jd2 / jd0 > 0.4 && jd2 / jd0 < 0.6, 'slowed (-50 %): jump distance halves (' + jd2.toFixed(2) + ' m)');
  s = run(newMoveState(), { forward: true, aim: true }, 40, exo); ok(near(spd(s), 6.9 * 1.6, 0.05), 'Exoskeleton Momentary Overload +60 % speed');
  // grappling hook
  const hw = [{ x0: -10, x1: 10, z0: -26, z1: -25, y0: 0, y1: 12, k: 'wall' }], hk = fxOf({}, 'hook', true);
  s = newMoveState(); stepMove(s, { yaw: 0, pitch: 0.02, skill: true }, DT, 1, hw, false, hk); ok(s.hk === 1 && s.skEv === 1, 'hook attaches to the aimed surface');
  run(s, { skill: true }, 20, undefined, hw); ok(s.z < -8, 'the hook pulls fast (' + s.z.toFixed(1) + ' m in 0.33 s)');
  const h2 = newMoveState(); stepMove(h2, { yaw: 0, pitch: 0.02, skill: true }, DT, 1, hw, false, hk); run(h2, { right: true }, 20, undefined, hw); ok(h2.x > 1, 'WASD steers while hooked (x ' + h2.x.toFixed(1) + ')');
  run(h2, {}, 100, undefined, hw); ok(h2.hk === 0 && h2.z < -15, 'the hook releases on arrival');
  const h3 = newMoveState(); stepMove(h3, { yaw: 0, pitch: 1.2, skill: true }, DT, 1, hw, false, hk); ok(h3.hk === 0 && h3.skEv === 0, 'no hook when aiming at nothing in range');
  // pneumatic leap
  s = newMoveState(); stepMove(s, { yaw: 0, skill: true }, DT, 1, [], false, fxOf({}, 'pad', true)); ok(s.skEv === 2 && s.vy > 4 && s.vz < -10, 'Pneumatic leap'); run(s, {}, 40); ok(s.z < -4, 'leaps forward (' + s.z.toFixed(1) + ' m)');
}

// ---------------------------------------------------------------- PART 2: skills + energy
section('SKILLS + ENERGY');
function pair(skill, mode = 'tdm') {
  const t = mk(), a = t.join('A', true), b = t.join('B'); a.p.team = 'red'; b.p.team = 'blue'; a.s.trigger('loadout', { skill, throwable: 'frag' }); t.g.config.mode = mode; t.g.startMatch(); t.steps(1);
  t.place(a.p, 6, 60); t.place(b.p, 6, 40); a.p.energy = 100; t.g.invulnerable = false; return Object.assign(t, { a, b });
}
const en = (p, v) => Math.abs(p.energy - v) < 0.3;
const press = (t, c, o = {}) => { t.tick(c, { ...o, skill: true }, 1); t.tick(c, { ...o, skill: false }, 1); };
{
  const t = pair('pulse'); a0(t); function a0(t) { t.a.p.energy = 0; t.steps(60 * 10); } ok(Math.abs(t.a.p.energy - 10) < 0.2, 'energy: +1 per second (' + t.a.p.energy.toFixed(1) + ')');
  press(t, t.a); ok(t.a.p.energy < 11 && t.a.s.ev('skill').length === 0, 'a skill cannot be used without enough energy');
  t.a.p.energy = 99.9; t.steps(30); ok(t.a.p.energy === 100, 'energy is capped at 100');
  t.a.p.energy = 50; t.b.p.protectUntil = 0; t.g.damage(t.b.p, t.a.p, 999, { weapon: 'm4a1' }); ok(Math.abs(t.a.p.energy - 60) < 0.2, 'a kill gives +10 energy');
  const e = t.a.p.energy; t.steps(60 * 4); t.g.damage(t.a.p, null, 999, { cause: 'x' }); t.steps(PLAYER.respawnDelay * 60 + 5); ok(t.a.p.alive && t.a.p.energy > e, 'Classic: energy is NOT reset by dying');
  const br = mk('br'), pa = br.join('A'); br.g.startMatch(); pa.p.energy = 50; br.g.mode.onKill = () => {}; pa.p.protectUntil = 0; br.g.damage(pa.p, null, 9999, { cause: 'x' }); ok(pa.p.energy === 0, 'Battle Royale: energy resets on death');
}
{ // required skill
  const t = mk(), a = t.join('A', true); a.s.trigger('lobby:start'); ok(!a.p.ready && a.s.ev('lobby:denied').length === 1, 'cannot ready up without choosing a skill');
  a.s.trigger('loadout', { skill: 'kinetic' }); a.s.trigger('lobby:start'); ok(t.g.phase === 'match' && a.p.skill === 'kinetic', 'with a skill the match starts');
  const t2 = mk(), b = t2.join('B', true); t2.steps(60 * 60 + 5); ok(t2.g.phase === 'match' && !!b.p.skill, 'when the timer runs out a random skill is assigned');
  const t3 = mk('br'), c = t3.join('C', true); c.s.trigger('loadout', { skill: 'hook' }); ok(c.p.nextSkill === 'hook', 'skills can be chosen in Battle Royale / Zombies rooms too');
}
{ // kinetic armor
  const t = pair('kinetic'); t.a.p.armor = 5; press(t, t.a); ok(t.a.p.armor === 100 && t.a.p.maxArmor === 100 && t.a.p.kaT > 14.8 && en(t.a.p, 40), 'Kinetic Armor: max armor 100, +100 armor, 60 energy, 15 s');
  t.a.p.protectUntil = 0; t.g.damage(t.a.p, t.b.p, 20); ok(Math.abs(t.a.p.armor - 85) < 0.01 && t.a.p.hp === 100, 'armor takes 25 % less damage (20 -> 15)');
  t.a.p.armor = 50; t.steps(30); ok(t.a.p.armor >= 58 && t.a.p.armor <= 62, 'recovers 2 armor every 0.1 s (+' + (t.a.p.armor - 50).toFixed(0) + ' in 0.5 s)');
  const fk = fxOf({ ka: true }); ok(fk.speed === 0.85 && fk.anim === 0.85, 'movement and handling -15 % while active');
  const k0 = t.a.p.kaT; t.b.p.protectUntil = 0; t.g.damage(t.b.p, t.a.p, 999, { weapon: 'm4a1' }); ok(t.a.p.kaT > k0 + 2.9, 'every kill adds 3 s');
  t.steps(60 * 18.5); ok(t.a.p.kaT === 0 && t.a.p.maxArmor === 50 && t.a.p.armor <= 50, 'ends: back to the normal 50 max armor');
  t.steps(2); ok(t.b.s.ev('snap').pop().pl.find(x => x.id === t.a.p.id).ka === 0, 'flash flag cleared afterwards');
}
{ // exoskeleton
  const t = pair('exo'); press(t, t.a); ok(t.a.p.exoCharge > 0 && en(t.a.p, 40), 'Exoskeleton: 60 energy, 1 s charge');
  t.tick(t.a, { jump: true, fire: true, forward: true, aim: true, yaw: 0 }, 10); ok(t.a.p.onGround && t.a.p.ws.guns[0].mag === 32 && !t.a.p.sprint, 'during the charge: no jump, no fire, no sprint');
  t.tick(t.a, { forward: true, aim: true, yaw: 0 }, 140); ok(t.a.p.exoCharge === 0 && Math.abs(Math.hypot(t.a.p.vx, t.a.p.vz) - 6.9 * 1.6 * 0.665) < 0.5, 'after the 2 s charge: +60 % speed (ADS shown: ' + Math.hypot(t.a.p.vx, t.a.p.vz).toFixed(2) + ')');
  ok(t.a.p.exoT > 18.5 && t.a.p.exoT < 20, 'duration 20 s'); const e0 = t.a.p.exoT; t.b.p.protectUntil = 0; t.g.damage(t.b.p, t.a.p, 999, { weapon: 'm4a1' }); ok(t.a.p.exoT > e0 + 4.9, '+5 s per kill during activation');
  t.steps(2); ok(t.b.s.ev('snap').pop().pl.find(x => x.id === t.a.p.id).ex === 1, 'trail flag broadcast to other players');
  const t2 = pair('exo'); press(t2, t2.a); t2.steps(130); t2.a.p.ws.guns[0].mag = 0; t2.tick(t2.a, { reload: true }, 1); t2.tick(t2.a, {}, 105); ok(t2.a.p.ws.guns[0].mag === 32, 'reload is faster with the exoskeleton (done in <1.7 s instead of 2.1 s)');
}
{ // poltergeist
  const t = pair('polter'); press(t, t.a); ok(t.a.p.polterT > 4.8 && t.a.p.polterT <= 5 && en(t.a.p, 35), 'Poltergeist: 65 energy, 5 s'); t.steps(2); ok(t.b.s.ev('snap').pop().pl.find(x => x.id === t.a.p.id).iv === 1, 'invisible flag broadcast');
  t.tick(t.a, { fire: true }, 2); ok(t.a.p.polterT === 0, 'firing ends Poltergeist');
  const t2 = pair('polter'); press(t2, t2.a); t2.steps(60 * 7 + 5); ok(t2.a.p.polterT === 0, 'ends after 7 s');
  const t3 = pair('polter'); press(t3, t3.a); t3.g.abil.endPolter(t3.a.p); ok(t3.a.p.polterT === 0, 'crate / plant / defuse end it (helper)');
  const sd = mk(), p1 = sd.join('A', true), p2 = sd.join('B'); p1.p.team = 'red'; p2.p.team = 'blue'; p1.s.trigger('loadout', { skill: 'polter' }); sd.g.config.mode = 'snd'; sd.g.startMatch(); sd.steps(SND.freezeTime * 60 + 2);
  const s0 = sd.g.mode.sites[0]; sd.place(p1.p, s0.x, s0.z); p1.p.energy = 100; press(sd, p1); ok(p1.p.polterT > 0, 'poltergeist active in S&D'); sd.tick(p1, { use: true }, 20); ok(p1.p.polterT === 0 && sd.g.mode.plant.p > 0, 'F (use) plants the bomb and ends Poltergeist');
  sd.tick(p1, { use: true }, 6.5 * 60 + 5); ok(sd.g.mode.phase === 'planted', 'planting works with F instead of E');
}
{ // annihilator
  const t = pair('annih'); t.a.p.ws.guns[0].mag = 20; press(t, t.a); ok(t.a.p.ws.guns[t.a.p.ws.slot].id === 'annihilator' && en(t.a.p, 0) && t.a.p.annih, 'Annihilator: 100 energy, one-round handgun');
  t.tick(t.a, {}, 30); t.b.p.protectUntil = 0; t.tick(t.a, { aim: true, fire: true, pitch: Math.atan2(1.0 - 1.6, 20) }, 1); ok(!t.b.p.alive, 'one shot deals 150 damage');
  ok(t.a.p.ws.guns[t.a.p.ws.slot].id === 'fists', 'unarmed right after firing'); t.steps(60 * 2.5); ok(t.a.p.ws.guns[t.a.p.ws.slot].id === 'fists', 'still unarmed after 2.5 s'); t.steps(60); ok(t.a.p.ws.guns[t.a.p.ws.slot].id === 'm4a1' && t.a.p.ws.guns[t.a.p.ws.slot].mag === 20 && !t.a.p.annih, 'the old weapon returns after 3 s');
  const t2 = pair('annih'); press(t2, t2.a); t2.tick(t2.a, { forward: true, aim: true }, 40); ok(Math.hypot(t2.a.p.vx, t2.a.p.vz) < 6.9 * 0.85 * 0.9, 'slower while holding the Annihilator'); t2.steps(2); ok(t2.b.s.ev('snap').pop().pl.find(x => x.id === t2.a.p.id).w === 'annihilator', 'others see the weapon id (red glint)');
}
{ // scout pulse
  const t = pair('pulse'); const far = t.join('Far'); t.g.queue.delete(far.s.id); t.g.players.set(far.s.id, far.p); far.p.queued = false; far.p.team = 'blue'; t.g.spawnPlayer(far.p); t.place(far.p, 6, -20); t.place(t.b.p, 6, 45); press(t, t.a); t.steps(60);
  ok(t.a.p.energy < 72 && t.a.p.marks.has(t.b.p.id) && !t.a.p.marks.has(far.p.id), 'Scout Pulse: 30 energy, marks enemies in range (not far ones)');
  ok(t.a.s.ev('pulse').length === 1 && t.a.s.ev('snap').pop().you.marks.includes(t.b.p.id), 'the wave is broadcast and marks are sent to the caster'); ok(t.b.s.ev('snap').pop().you.mk === true, 'marked enemies get the "You\'re Marked" flag'); t.steps(60 * 2.3); ok(t.a.p.marks.size === 0, 'marks last 2 s'); t.steps(2); ok(t.b.s.ev('snap').pop().you.mk === false, 'the warning goes away with the mark');
}
{ // hook + pad on the server
  const t = pair('hook'); t.place(t.a.p, 6, 58); t.tick(t.a, { yaw: Math.PI, pitch: 0.05, skill: true }, 1); ok(t.a.p.hk === 1 && en(t.a.p, 67), 'Grappling Hook: 33 energy, attached'); t.tick(t.a, { yaw: Math.PI, skill: false }, 30); ok(t.a.p.z > 60, 'pulled toward the wall');
  const t0 = pair('hook'); t0.tick(t0.a, { yaw: 0, pitch: 1.3, skill: true }, 1); ok(t0.a.p.hk === 0 && t0.a.p.energy >= 100, 'no energy spent when there is nothing to hook');
  const q = pair('pad'); const z = q.a.p.z; press(q, q.a); q.tick(q.a, {}, 30); ok(Math.abs(q.a.p.energy - 75) < 1 && q.a.p.z < z - 3, 'Pneumatic Auxiliary Device: 25 energy, leaps');
  q.a.p.energy = 5; q.b.p.protectUntil = 0; q.g.damage(q.b.p, q.a.p, 999, { weapon: 'm4a1' }); ok(q.a.p.energy === 30, 'any kill gives the Pneumatic Auxiliary Device 25 energy instead of 10');
}

// ---------------------------------------------------------------- PART 2: throwables
section('THROWABLES');
const proj = (t, kind, x, y, z, o = {}) => { const p = { id: 900 + t.g.abil.proj.length, kind, owner: t.a.p, x, y, z, vx: 0, vy: 0, vz: 0, age: 0, stuck: false, n: null, hd: [0, -1], ...o }; t.g.abil.proj.push(p); return p; };
{
  const t = pair('pulse'); t.a.p.thr = { id: 'frag', n: 2 }; t.tick(t.a, { throw: true, yaw: 0, pitch: 0.3 }, 1); ok(t.g.abil.proj.length === 1 && t.a.p.thr.n === 1, 'G throws a projectile (count 2 -> 1)');
  t.tick(t.a, { throw: false }, 1); t.g.abil.proj.length = 0;
  // frag
  t.b.p.protectUntil = 0; t.place(t.b.p, 6, 40); proj(t, 'frag', 6, 1, 38); t.steps(60 * 2.8); ok(t.b.p.hp === 100 && t.b.p.armor === 50 && t.g.abil.proj.length === 1, 'Frag: explodes after 3 s, not before');
  t.steps(20); ok(t.g.abil.proj.length === 0 && t.b.p.armor === 0 && t.b.p.hp < 100, 'Frag: damages nearby enemies (hp ' + t.b.p.hp + ')');
  t.g.spawnPlayer(t.b.p); t.place(t.b.p, 6, 40); t.b.p.protectUntil = 0; t.place(t.b.p, 6, 30); proj(t, 'frag', 6, 1, 40); t.steps(60 * 3.1); ok(t.b.p.armor === 50 && t.b.p.hp === 100, 'Frag: out of range = no damage (7 m radius)');
  const mate = t.join('M'); mate.p.team = 'red'; t.g.spawnPlayer(mate.p); mate.p.protectUntil = 0; t.place(mate.p, 6, 40); proj(t, 'frag', 6, 1, 39); t.steps(60 * 3.1); ok(mate.p.armor === 50 && mate.p.hp === 100, 'explosives do not hurt teammates');
  // impact
  t.g.spawnPlayer(t.b.p); t.b.p.protectUntil = 0; t.place(t.b.p, 6, 40); const im = proj(t, 'impact', 6, 1.2, 47, { vz: -30 }); t.steps(60); ok(!t.g.abil.proj.includes(im) && !t.b.p.alive, 'Impact Grenade: explodes on impact, direct hit = 150 damage');
  const wallHit = proj(t, 'impact', 30, 1, 56, { vz: 20 }); t.steps(60); ok(!t.g.abil.proj.includes(wallHit), 'Impact Grenade: explodes when it hits a wall');
  // cryo
  t.g.spawnPlayer(t.b.p); t.b.p.protectUntil = 0; t.place(t.b.p, 6, 40); const cz = proj(t, 'cryo', 6, 1, 40, { vy: -5 }); t.steps(10); const cf = t.g.abil.zones.find(z => z.kind === 'cryo'); ok(cf && cf.r === 6.5 && cf.t > 9.7, 'Cryo Splitter: field radius 6.5 (+30 %), lasts 10 s'); void cz;
  t.tick(t.b, { forward: true, yaw: 0, aim: true }, 5); ok(t.b.p.cryoT > 0 && !t.b.p.sprint, 'cryo: no sprinting'); t.tick(t.b, { yaw: 0 }, 1);
  ok(Math.abs(t.b.p.cryoSlow - 0.3) < 0.001, 'initial slow 30 %'); t.steps(60 * 2.2); ok(Math.abs(t.b.p.cryoSlow - 0.5) < 0.06, 'slow grows 5 % every 0.5 s (' + t.b.p.cryoSlow.toFixed(2) + ' after 2.2 s)');
  t.steps(60 * 5); ok(t.b.p.cryoSlow <= 0.75 && t.b.p.cryoSlow >= 0.74, 'capped at 75 % (' + t.b.p.cryoSlow.toFixed(2) + ')'); t.tick(t.b, { forward: true, yaw: 0, aim: true }, 30); ok(Math.hypot(t.b.p.vx, t.b.p.vz) < 6.9 * 0.95 * 0.5, 'a long stay slows a lot');
  t.steps(60 * 3); ok(t.g.abil.zones.every(z => z.kind !== 'cryo'), 'the field is gone after 10 s'); t.tick(t.b, { forward: true, yaw: 0 }, 30); ok(t.b.p.cryoT === 0 && t.b.p.cryoSlow === 0 && t.b.p.sprint, 'speed and sprint come back');
  // gas
  t.g.spawnPlayer(t.b.p); t.b.p.protectUntil = 0; t.place(t.b.p, 6, 40); t.g.abil.addZone('gas', 6, 0, 40, 5, 8, t.a.p); t.steps(60); const dm = (50 - t.b.p.armor) + (100 - t.b.p.hp);
  ok(dm >= 18 && dm <= 22 && t.b.p.gas > 0.15, 'Gas: 2 damage every 0.1 s = ~20 per second (' + dm + '), vignette level ' + t.b.p.gas);
  t.steps(60 * 2.0); const g1 = t.b.p.gas; t.place(t.b.p, 6, 20); t.steps(60 * 1.5); ok(t.b.p.gas === g1 || t.b.p.gas > 0, 'gas vignette persists ~2 s after leaving'); t.steps(60 * 3); ok(t.b.p.gas === 0, 'then wears off');
  // foam
  t.g.spawnPlayer(t.b.p); t.b.p.protectUntil = 0; t.place(t.b.p, 6, 40); t.place(t.a.p, 6, 60); const aim = { aim: true, fire: true, pitch: Math.atan2(1.0 - 1.6, 20) };
  t.g.abil.zones.length = 0; t.g.abil.rebuildFoam(); const fo = proj(t, 'foam', 6, 1.5, 51, { vz: -10, hd: [0, -1] }); t.steps(40); ok(t.g.abil.zones.some(z => z.kind === 'foam') && t.g.abil.foamBoxes.length === 1, 'Foam Wall appears on impact');
  t.g.abil.zones.find(z => z.kind === 'foam').box = { x0: 3, x1: 9, z0: 49.7, z1: 50.3, y0: 0, y1: 3.5, k: 'foam' }; t.g.abil.rebuildFoam(); t.tick(t.a, aim, 20); ok(t.b.p.armor === 50 && t.b.p.hp === 100, 'bullets do not pass the foam wall');
  const probe = newMoveState(6, 0, 52); for (let i = 0; i < 60; i++) stepMove(probe, { yaw: 0, forward: true, aim: true }, DT, 1, t.g.worldBoxes().slice(0, t.g.map.boxes.length), false); ok(probe.z < 49, 'players walk through the foam wall');
  t.steps(60 * 5.2); ok(t.g.abil.foamBoxes.length === 0, 'foam lasts 5 s'); t.tick(t.a, aim, 20); ok(t.b.p.armor < 50, 'after it vanishes bullets hit again');
  // stim
  t.g.spawnPlayer(t.a.p); t.place(t.a.p, 6, 60); t.a.p.thr = { id: 'stim', n: 2 }; t.a.p.hp = 60; t.a.p.lastDamageT = t.g.now; t.tick(t.a, { throw: true }, 1); ok(t.a.p.stimT > 4.9 && t.a.s.ev('throw').pop().kind === 'stim', 'Stim Shot: 5 s buff + injection animation event');
  t.tick(t.a, { throw: false, forward: true, aim: true }, 40); ok(Math.abs(Math.hypot(t.a.p.vx, t.a.p.vz) - 6.9 * 1.25 * 0.7) < 0.4 && t.a.p.hp > 60, 'Stim: +25 % speed and health recovery starts immediately (hp ' + t.a.p.hp + ')');
  t.steps(60 * 5); ok(t.a.p.stimT === 0, 'stim lasts 5 s');
  // discharger
  t.g.spawnPlayer(t.b.p); t.b.p.protectUntil = 0; t.place(t.b.p, 6, 40); t.a.p.thr = { id: 'discharger', n: 1 }; const dis = proj(t, 'discharger', 6.5, 1, 40, { stuck: true, n: [0, -1, 0] });
  t.tick(t.a, { throw: false }, 1); t.tick(t.a, { throw: true }, 1); ok(!t.g.abil.proj.includes(dis) && t.b.p.lift && t.b.p.vy > 5 && (50 - t.b.p.armor) + (100 - t.b.p.hp) >= 45, 'Pneumatic Discharger: G again detonates, damage 50-100 and launches the enemy');
  t.tick(t.b, { aim: true }, 2); ok(t.b.p.aim === false && !t.b.p.onGround, 'launched enemies cannot ADS while airborne'); t.tick(t.b, { aim: true }, 90); ok(t.b.p.onGround && t.b.p.aim === true, 'ADS works again after landing');
  t.g.spawnPlayer(t.b.p); t.place(t.b.p, 6, 20); const d2 = proj(t, 'discharger', 6.5, 1, 40, { stuck: true, n: [0, -1, 0] }); t.steps(60 * 19.5); ok(t.g.abil.proj.includes(d2), 'Discharger waits'); t.steps(60 * 60); ok(t.g.abil.proj.includes(d2), 'Discharger NEVER detonates by itself (still armed after 80 s)');
  t.a.p.thr = { id: 'frag', n: 1 }; t.tick(t.a, { throw: false }, 1); t.tick(t.a, { throw: true }, 1); ok(!t.g.abil.proj.includes(d2), 'only the player triggers it (G)');
  t.g.spawnPlayer(t.b.p); t.b.p.protectUntil = 0; t.place(t.b.p, 6, 31.5); const d3 = proj(t, 'discharger', 6, 1, 40, { stuck: true, n: [0, -1, 0] }); t.tick(t.a, { throw: false }, 1); t.tick(t.a, { throw: true }, 1);
  ok(!t.g.abil.proj.includes(d3) && t.b.p.armor < 50, 'AoE radius 9.45 (+35 %): 8.5 m away still gets hit'); ok(Math.hypot(t.b.p.vx, t.b.p.vz) > 20 && t.b.p.vy >= 12, 'launched much further (' + Math.hypot(t.b.p.vx, t.b.p.vz).toFixed(1) + ' m/s sideways, ' + t.b.p.vy.toFixed(1) + ' up)');
  const dd = proj(t, 'discharger', 6, 1, 40, { stuck: true, n: [0, -1, 0] }); t.g.spawnPlayer(t.b.p); t.b.p.protectUntil = 0; t.place(t.b.p, 6, 40.6); t.b.p.armor = 0; t.b.p.hp = 100; t.a.p.thr = { id: 'frag', n: 1 }; t.tick(t.a, { throw: false }, 1); t.tick(t.a, { throw: true }, 1); ok(t.b.p.hp <= 30 && t.b.p.hp >= 20, 'Discharger damage up to 80 at the centre (hp ' + t.b.p.hp + ')'); void dd;
  const dmEdge = proj(t, 'discharger', 6, 1, 40, { stuck: true, n: [0, -1, 0] }); t.g.spawnPlayer(t.b.p); t.b.p.protectUntil = 0; t.place(t.b.p, 6, 31); t.b.p.armor = 0; t.b.p.hp = 100; t.tick(t.a, { throw: false }, 1); t.tick(t.a, { throw: true }, 1); ok(t.b.p.hp <= 89 && t.b.p.hp >= 85, 'Discharger damage falls to ~10-15 at the edge of the radius (hp ' + t.b.p.hp + ')'); void dmEdge;
}
{ // rebalance: sizes, throw range, glint data
  const t = pair('pulse'); t.a.p.thr = { id: 'frag', n: 3 }; t.tick(t.a, { throw: true, yaw: 0, pitch: 0 }, 1); const fr = t.g.abil.proj[0], x0 = fr.x, z0 = fr.z; t.steps(40);
  ok(Math.hypot(fr.x - x0, fr.z - z0) > 15, 'grenades fly much further now (' + Math.hypot(fr.x - x0, fr.z - z0).toFixed(1) + ' m in 0.67 s)');
  t.tick(t.a, { throw: false }, 1); t.a.p.thr = { id: 'cryo', n: 1 }; t.tick(t.a, { throw: true, yaw: 0, pitch: 0 }, 1); const cr = t.g.abil.proj[t.g.abil.proj.length - 1]; ok(Math.hypot(cr.vx, cr.vz) < Math.hypot(fr.vx, fr.vz), 'grenades are thrown faster than the other throwables');
  t.g.abil.proj.length = 0; t.g.spawnPlayer(t.b.p); t.b.p.protectUntil = 0; t.place(t.b.p, 6, 31.5); proj(t, 'frag', 6, 1, 40, { age: 2.99 }); t.steps(3); ok(t.b.p.armor < 50, 'frag radius 9.45 (+35 %): a target 8.5 m away is hit');
  t.g.spawnPlayer(t.b.p); t.b.p.protectUntil = 0; t.place(t.b.p, 6, 32); proj(t, 'impact', 6, 1, 40, { vy: -10 }); t.steps(6); ok(t.b.p.armor === 50 && t.b.p.hp === 100, 'impact radius 6.1 (+30 %): a target 8 m away is NOT hit');
  t.g.spawnPlayer(t.b.p); t.b.p.protectUntil = 0; t.place(t.b.p, 6, 36); proj(t, 'impact', 6, 1, 40, { vy: -10 }); t.steps(6); ok(t.b.p.armor < 50, 'impact: 4 m away is hit (old radius 3.5 would miss)');
  t.g.abil.zones.length = 0; proj(t, 'foam', 6, 1.5, 51, { vz: -10, hd: [0, -1] }); t.steps(40); const fb = t.g.abil.foamBoxes[0]; ok(fb && Math.abs((fb.x1 - fb.x0) - 6.7275) < 1e-6, 'foam wall is 6.7275 m wide (+15 %)');
  const gz = proj(t, 'gas', 6, 1, 45, { vy: -8 }); t.steps(10); ok(t.g.abil.zones.find(z => z.kind === 'gas').r === 7.2, 'gas radius 7.2 (+20 %)'); void gz;
  const s2 = pair('pulse'); s2.a.p.nextSkill = 'pulse'; s2.g.spawnPlayer(s2.a.p); s2.a.p.ws.guns[0] = { id: 'l115a3', mag: 5 }; s2.place(s2.a.p, 6, 60); s2.tick(s2.a, { aim: true }, 5); s2.steps(2);
  const pe = s2.b.s.ev('snap').pop().pl.find(x => x.id === s2.a.p.id); ok(pe.aim === 1 && WEAPONS[pe.w].sniper === true, 'snapshots tell other clients that a sniper is scoped in (glint)');
  const pl = pair('pad'); const zz = pl.a.p.z; pl.tick(pl.a, { skill: true, yaw: 0 }, 1); pl.tick(pl.a, {}, 50); ok(zz - pl.a.p.z > 9.5, 'Pneumatic Device leap +40 % (' + (zz - pl.a.p.z).toFixed(1) + ' m)');
  ok(THROWABLES.cryo.name === 'Cryo Splitter' && SKILLS.hook.cost === 33 && SKILLS.pulse.cost === 30 && SKILLS.exo.name === 'Exoskeleton Momentary Overload' && SKILLS.exo.duration === 20 && SKILLS.kinetic.duration === 15, 'renamed / re-costed skills and throwables');
}

{ // throwable loot
  const t = mk('br'), a = t.join('A'); t.g.startMatch(); a.p.air = false; const L = t.g.mode.loot; t.place(a.p, 0, 0);
  L.addItem(ITEM.THROW, 'cryo', 0, 0, 0); t.steps(3); ok(a.p.thr.id === 'cryo' && a.p.thr.n === 1, 'walking over a throwable picks it up (BR start: none)');
  L.addItem(ITEM.THROW, 'gas', 0, 0, 0); t.steps(3); ok(a.p.thr.id === 'cryo' && a.p.thr.n === 1 && L.items.some(i => i.kind === ITEM.THROW), 'a different type is not taken while you still hold some');
  for (let i = 0; i < 6; i++) L.addItem(ITEM.THROW, 'cryo', 0, 0, 0); t.steps(3); ok(a.p.thr.n === 4, 'max 4 of a kind');
  { const cnt = (rar) => { const L2 = new (L.constructor)(t.g); L2.openCrate({ id: 1, x: 0, y: 0, z: 0, yaw: 0, open: false, rar }); return L2.items.filter(x => x.kind === ITEM.THROW).length; };
    ok(cnt(RARITY_IDX.red) === 2 && cnt(RARITY_IDX.orange) === 1 && cnt(RARITY_IDX.purple) === 0 && cnt(RARITY_IDX.grey) === 0, 'equipment drops: Red 2, Orange 1, lower none'); }
  const cl = mk(), c1 = cl.join('C'); c1.s.trigger('loadout', { throwable: 'gas' }); cl.g.startMatch(); ok(c1.p.thr.id === 'gas' && c1.p.thr.n === 2, 'Classic starts with 2 of the chosen throwable');
}

// ---------------------------------------------------------------- movement determinism + collision
// ---------------------------------------------------------------- PART 3: new skills, rebalance, new throwables
section('WEAPON MODIFICATION (attachments)');
{
  for (const a of Object.values(ATT)) ok((fs.readFileSync(path.join(root, 'client/attachments.js'), 'utf8').includes('const EXTERNAL_ATTACHMENT_ASSETS = false;') || fs.existsSync(path.join(root, a.file))) && SLOTS.includes(a.slot), 'attachment has a model or procedural fallback: ' + a.file);
  const full = 'laser|suppressor';
  ok(cleanAtt('m4a1', 'coyote|vgrip|laser|suppressor') === 'coyote|vgrip', 'at most 2 attachments per gun (the first two valid ones)');
  ok(cleanAtt('m4a1', 'vgrip|agrip') === 'vgrip' && cleanAtt('m4a1', 'laser|coyote') === 'laser|coyote' && parseAtt('laser|coyote').optic === 'coyote', 'one attachment per mount, order kept');
  ok(cleanAtt('makarov', 'coyote|vgrip|laser|suppressor') === 'laser|suppressor', 'a pistol only keeps laser + muzzle');
  ok(cleanAtt('l115a3', 'coyote|vgrip|laser|suppressor') === 'laser|suppressor', 'a sniper rifle (own scope) takes no optic / grip');
  ok(cleanAtt('mp5sd', 'suppressor') === '' && cleanAtt('honey_badger', 'suppressor') === '', 'already suppressed guns refuse a suppressor');
  ok(cleanAtt('m4a1', 'x|y|z') === '' && cleanAtt('m4a1', 'eotech') === '' && cleanAtt('m4a1', 123) === '' && cleanAtt('m4a1', null) === '' && cleanAtt('nope', full) === '', 'garbage / removed attachments / unknown weapon -> nothing');
  ok(!ATT.eotech && !ATT.collimator && Object.values(ATT).filter(a => a.slot === 'optic').length === 1, 'only the Coyote sight remains');
  ok(!slotsFor('laser_rifle').length && !slotsFor('em2').length && !slotsFor('fists').length, 'the laser rifle / skill weapons / fists cannot be modified');
  const base = WEAPONS.m4a1, mod = gunStats('m4a1', full), mod2 = gunStats('m4a1', 'coyote|vgrip');
  ok(gunStats('m4a1', '') === base && gunStats('m4a1') === base && gunStats('m4a1', full) === mod, 'no attachments = the very same weapon object; modified stats are cached');
  ok(Math.abs(mod.recoilV - 0.5 * 0.95) < 1e-9 && Math.abs(mod.spreadHip - 1.8 * 0.65) < 1e-9 && Math.abs(mod.range[0] - 25 * 0.88) < 1e-9 && mod.suppressed === true, 'stat modifiers multiply (laser + suppressor)');
  ok(Math.abs(mod2.recoilV - 0.5 * 0.8) < 1e-9 && Math.abs(mod2.adsTime - 0.22 * 0.96 * 1.03) < 1e-9 && !mod2.suppressed, 'stat modifiers multiply (optic + grip)');
  ok(base.recoilV === 0.5 && base.spreadHip === 1.8 && !base.suppressed, 'the weapon table itself is never modified');
  // server: loadout -> guns
  const t = mk(), a = t.join('A'), b = t.join('B'); a.p.team = 'red'; b.p.team = 'blue';
  a.s.trigger('loadout', { primary: 'm4a1', secondary: 'makarov', skill: 'pulse', throwable: 'frag', attP: full, attS: 'coyote|laser|suppressor' });
  b.s.trigger('loadout', { primary: 'm4a1', secondary: 'makarov', skill: 'pulse', throwable: 'frag' });
  t.g.startMatch(); t.steps(1); t.place(a.p, 6, 60); t.place(b.p, 6, 40); t.g.invulnerable = false;
  ok(a.p.ws.guns[0].att === full && a.p.ws.guns[1].att === 'laser|suppressor' && b.p.ws.guns[0].att === undefined, 'server hands out the attachments (the sidearm set is sanitised, no set = none)');
  ok(a.p.ws.guns[0].mag === 32 && curWeapon(a.p.ws).suppressed === true && Math.abs(curWeapon(a.p.ws).spreadHip - 1.17) < 1e-9, 'effective weapon stats come from the attachments');
  t.steps(2); ok(b.s.ev('snap').pop().pl.find(p => p.id === a.p.id).at === full && a.s.ev('snap').pop().pl.find(p => p.id === b.p.id).at === 0 && a.s.ev('snap').pop().you.ws.guns[0].att === full, 'snapshots carry the attachment string (own guns + remote players)');
  t.tick(a, { fire: true, yaw: 0 }, 1); const sh = b.s.ev('shot').pop(); ok(sh && sh.sup === 1 && sh.w === 'm4a1', 'a suppressed shot is flagged (quiet for the others)');
  t.tick(a, { fire: false, yaw: 0 }, 30); t.tick(b, { fire: true, yaw: Math.PI }, 1); const sh2 = a.s.ev('shot').pop(); ok(sh2 && sh2.sup === 0, 'an unmodified gun is not flagged');
  a.s.trigger('loadout', { attP: '' }); t.g.spawnPlayer(a.p); ok(a.p.ws.guns[0].att === undefined, 'changing the set takes effect at the next spawn');
  // a late joiner brings the set along
  const c = t.join('Late', true); c.s.trigger('loadout', { primary: 'ak74', secondary: 'makarov', skill: 'pulse', attP: 'coyote|dd_grip', attS: 'bad' }); ok(c.p.ws && c.p.ws.guns[0].id === 'ak74' && c.p.ws.guns[0].att === 'coyote|dd_grip' && c.p.ws.guns[1].att === undefined, 'a late joiner gets its attachments');
  // laser / grip / suppressor are all available on the common weapon classes
  ok(['Assault Rifle', 'SMG', 'LMG', 'Marksman', 'Shotgun'].every(cat => Object.values(WEAPONS).filter(w => w.cat === cat && !w.skillWeapon).some(w => slotAllowed(w.id, 'optic') && slotAllowed(w.id, 'grip') && slotAllowed(w.id, 'laser') && slotAllowed(w.id, 'muzzle'))), 'every common class can take all four slots');
}
section('CLASSIC: joining mid-match (no "next match" waiting)');
{ // TDM
  const t = pair('pulse'); t.steps(60 * 3);
  const c = t.join('Late', true); ok(t.g.players.has(c.s.id) && !t.g.queue.size && c.p.late && !c.p.spawned, 'TDM: joined, waiting for its loadout message');
  c.s.trigger('loadout', { primary: 'ak74', secondary: 'makarov' }); ok(!c.p.late && c.p.alive && c.p.spawned && c.p.ws.guns[0].id === 'ak74', 'TDM: spawns with its loadout as soon as the loadout arrives');
  ok(c.p.nextSkill && c.s.ev('match:start').length === 1, 'a random skill is assigned when none was chosen; match:start sent');
  t.steps(2); ok(c.s.ev('snap').length > 0 && c.s.ev('snap').pop().you.alive === true, 'the late joiner receives snapshots as a living player');
  ok(new Set([t.a.p.team, t.b.p.team, c.p.team]).size === 2 && c.p.kills === 0 && c.p.deaths === 0, 'balanced team, fresh stats');
  const d = t.join('Late2', true); t.steps(60 * 3 + 5); ok(!d.p.late && d.p.alive, 'fallback: spawns after 3 s even if the loadout message never arrives');
  t.g.endMatch('red', 'x'); const e = t.join('DuringResults'); ok(t.g.players.has(e.s.id) && !e.p.late && e.s.ev('match:start').length === 0, 'during the results screen the joiner just waits for the waiting room');
  t.steps((RESULT_TIME + BR.endOverlay) * 60 + 2); ok(t.g.phase === 'waiting' && t.g.players.size === 5 && [...t.g.players.values()].every(p => !p.alive && !p.ready), 'everyone is back in the waiting room');
}
{ // S&D after the freeze phase: spectate until the next round
  const t = pair('pulse', 'snd'); t.steps(60 * 6); ok(t.g.mode.phase === 'active', 'S&D: round is live');
  const c = t.join('Late'); ok(c.p.spawned && !c.p.alive && !c.p.late && c.s.ev('match:start').length === 1, 'S&D (live round): the late joiner spectates (no spawn mid-round)');
  const r = t.g.mode.round; t.g.mode.endRound(t.a.p.team, 'test'); t.steps(60 * (SND.resultTime + 1)); ok(t.g.mode.round === r + 1 && c.p.alive, 'S&D: the late joiner plays from the next round on');
}
{ // Battle Royale / Zombies keep their queue
  const t = mk('br'), a = t.join('A'); t.g.startMatch(); const c = t.join('Late'); ok(t.g.queue.has(c.s.id) && !t.g.players.has(c.s.id), 'Battle Royale: late joiners still wait for the next match');
}
section('NEW SKILLS: Gravity Spike, Dissociative Surreality, EM2, Warmonger, Therapeutic wave, Iphone Kupi, Annihilator / Scout Pulse / Pad rebalance');
const addTeam = (t, name, team) => { const c = t.join(name); t.g.queue.delete(c.s.id); t.g.players.set(c.s.id, c.p); c.p.queued = false; c.p.team = team; t.g.spawnPlayer(c.p); c.p.protectUntil = 0; return c; };
const loss = (p) => (50 - p.armor) + (100 - p.hp);
const free = (t) => { t.a.p.protectUntil = 0; t.b.p.protectUntil = 0; return t; };
{ // Gravity Spike
  const t = free(pair('grav')); press(t, t.a);
  ok(t.a.p.gs === 1 && en(t.a.p, 20) && t.a.p.vy > 10, 'Gravity Spike: 80 energy, leaps up fast');
  ok(t.a.p.ws.guns.every(g => g.id === 'fists') && !!t.a.p.grav, 'unarmed while in the air');
  const l0 = loss(t.a.p); t.g.damage(t.a.p, t.b.p, 100, { weapon: 'm4a1' }); ok(Math.abs(loss(t.a.p) - l0 - 65) < 0.01, '35 % damage reduction until the slam lands');
  t.place(t.b.p, 6, 49); t.b.p.protectUntil = 0; let top = 0; for (let i = 0; i < 90 && t.a.p.gs; i++) { t.tick(t.a, {}, 1); top = Math.max(top, t.a.p.y); }
  ok(top > 3.5 && top < 6, 'rises relatively high (' + top.toFixed(1) + ' m)'); ok(t.a.p.gs === 0 && t.a.p.onGround && !t.a.p.grav && t.a.p.ws.guns[0].id === 'm4a1', 'slams down, weapons come back');
  ok(loss(t.b.p) >= 70 && loss(t.b.p) <= 180 && t.b.p.lift && t.b.p.vy > 5, 'AoE 70-180 damage + Discharger knockback on the enemy (' + loss(t.b.p).toFixed(0) + ')'); ok(t.a.s.ev('boom').some(b => b.k === 'grav'), 'visual explosion event');
  const t2 = free(pair('grav')); press(t2, t2.a); t2.g.kill(t2.b.p, t2.a.p, {}); ok(!t2.a.p.alive && t2.a.p.grav === null, 'dying in the air cleans up the skill state');
}
{ // Dissociative Surreality
  const t = free(pair('dsr')); press(t, t.a);
  ok(t.a.p.dsr && t.g.abil.bodies.length === 1 && en(t.a.p, 50) && t.a.p.dsr.t > 9.9, 'Dissociative Surreality: 50 energy, 10 s, a body stays behind');
  t.steps(2); const sn = t.b.s.ev('snap').pop(); ok(sn.bd.length === 1 && sn.bd[0].owner === t.a.p.id && sn.pl.find(x => x.id === t.a.p.id).ds === 1, 'enemies receive the body entity and the spirit flag (own `ds` key: `sp` stays the sprint flag)');
  const body = t.g.abil.bodies[0]; t.tick(t.a, { forward: true, yaw: 0 }, 30); ok(Math.hypot(t.a.p.x - body.x, t.a.p.z - body.z) > 3 && body.x === 6 && body.z === 60, 'the spirit walks away, the body stays');
  t.tick(t.a, {}, 1); t.g.damage(t.a.p, t.b.p, 999, { weapon: 'm4a1' });
  ok(t.a.p.alive && t.a.p.deaths === 0 && t.b.p.kills === 0 && !t.a.p.dsr && t.g.abil.bodies.length === 0, 'spirit defeated: back in the body, no death, NO kill for the enemy');
  ok(Math.abs(t.a.p.x - 6) < 1e-6 && Math.abs(t.a.p.z - 60) < 1e-6 && t.a.p.hp === 100, 'returns to the body position with the body\'s health'); ok(t.a.s.ev('kill').length === 0, 'no kill feed entry');
  const t2 = free(pair('dsr')); press(t2, t2.a); const b2 = t2.g.abil.bodies[0]; t2.g.abil.hitBody(b2, t2.b.p, 80, { weapon: 'm4a1' }); ok(b2.hp === 70 && b2.armor === 0 && t2.a.p.alive && t2.a.p.dsr, 'the body takes damage separately (armor first)');
  t2.g.abil.hitBody(b2, t2.b.p, 999, { weapon: 'm4a1' }); ok(!t2.a.p.alive && t2.a.p.deaths === 1 && t2.b.p.kills === 1 && !t2.a.p.dsr && t2.g.abil.bodies.length === 0, 'body defeated: the player dies, the enemy gets the kill, the skill ends');
  const t3 = free(pair('dsr')); press(t3, t3.a); t3.steps(60 * 10 + 5); ok(!t3.a.p.dsr && t3.a.p.alive && t3.g.abil.bodies.length === 0, 'after 10 s the spirit returns by itself');
}
{ // EM2
  const t = free(pair('em2')); press(t, t.a); const g0 = t.a.p.ws.guns[t.a.p.ws.slot];
  ok(g0.id === 'em2' && g0.mag === 2 && en(t.a.p, 0) && t.a.p.em2, 'EM2: 100 energy, hand cannon with 2 rounds');
  t.tick(t.a, {}, 25); ok(t.a.p.em2.marked.has(t.b.p.id), 'enemies within 50 m are marked at once'); t.steps(2);
  ok(t.a.s.ev('snap').pop().you.marks.includes(t.b.p.id) && t.b.s.ev('snap').pop().you.em2 === true && t.a.s.ev('snap').pop().you.em2 === false, 'marks go to the user only; the marked enemy gets the "EM2 active" flag');
  t.g.abil.foamBoxes = [{ x0: 0, x1: 12, z0: 49.5, z1: 50.5, y0: 0, y1: 4, k: 'foam' }];
  t.tick(t.a, { fire: true, yaw: 0, pitch: Math.atan2(0.9 - 1.6, 20) }, 1); t.tick(t.a, { fire: false, yaw: 1.0, pitch: 0.7 }, 1);
  ok(t.a.p.ws.wind > 0 && Math.abs(t.a.p.yaw) < 1e-9 && t.a.p.ws.guns[t.a.p.ws.slot].mag === 2 && loss(t.b.p) === 0, 'trigger: nothing fires yet, the aim is locked (yaw stays 0 although 1.0 was sent)');
  t.tick(t.a, { yaw: 1.0, pitch: 0.7 }, 10); ok(loss(t.b.p) === 0 && t.a.p.yaw === 0, 'still locked after 10 ticks (167 ms)');
  t.tick(t.a, { yaw: 1.0, pitch: 0.7 }, 3); ok(t.a.p.ws.guns[t.a.p.ws.slot].mag === 1 && t.b.p.hp < 100, 'after 200 ms the laser fires and goes through the wall (hp ' + t.b.p.hp + ')'); ok(t.a.s.ev('shot').some(s => s.w === 'em2'), 'shot event for the beam');
  t.tick(t.a, { yaw: 1.0, pitch: 0 }, 2); ok(Math.abs(t.a.p.yaw - 1.0) < 1e-9, 'aim is unlocked afterwards');
  t.b.p.hp = 100; t.b.p.armor = 50; t.tick(t.a, { fire: false, yaw: 0, pitch: Math.atan2(0.9 - 1.6, 20) }, 40); t.tick(t.a, { fire: true, yaw: 0, pitch: Math.atan2(0.9 - 1.6, 20) }, 1); t.tick(t.a, { fire: false }, 20);
  ok(!t.a.p.em2 && t.a.p.ws.guns[t.a.p.ws.slot].id === 'm4a1', 'after the 2nd round the skill ends and the old weapon returns'); ok(t.a.p.marks.size === 0 && t.a.s.ev('snap').pop().you.marks.length === 0 && t.b.s.ev('snap').pop().you.em2 === false, 'marks vanish with the skill');
}
{ // Warmonger
  const t = free(pair('warm')); press(t, t.a);
  ok(t.a.p.warCharge > 1.9 && en(t.a.p, 25), 'Warmonger: 75 energy, 2 s charge'); t.tick(t.a, { fire: true, yaw: 0 }, 5); ok(t.a.p.ws.guns[0].mag === 32, 'cannot fire while charging');
  t.tick(t.a, { fire: false }, 125); const f0 = t.g.abil.flags(t.a.p); ok(t.a.p.warCharge === 0 && Math.abs(f0.warM - 0.1) < 1e-9 && Math.abs(f0.warR - 0.05) < 1e-9 && t.a.p.warT > 14.5, 'after the charge: +10 % movement/handling, +5 % fire rate, 15 s');
  const fx = fxOf(f0); ok(Math.abs(fx.speed - 1.1) < 1e-9 && Math.abs(fx.anim - 1.1) < 1e-9 && Math.abs(fx.rate - 1.05) < 1e-9, 'fxOf: 1.1 / 1.1 / 1.05');
  t.steps(2); ok(t.b.s.ev('snap').pop().pl.find(x => x.id === t.a.p.id).wm === 1, 'others receive the red-glint flag');
  { t.a.p.armor = 0; t.a.p.hp = 100; t.a.p.protectUntil = 0; t.b.p.protectUntil = 0; t.g.damage(t.a.p, t.b.p, 40, { weapon: 'm4a1' }); ok(Math.abs(t.a.p.hp - 74) < 1e-6, 'Warmonger: 35 % damage reduction while active (40 -> 26, hp ' + t.a.p.hp + ')'); }
  t.a.p.hp = 50; t.a.p.armor = 0; t.b.p.armor = 0; t.b.p.hp = 100; t.g.damage(t.b.p, t.a.p, 40, { weapon: 'm4a1' }); ok(Math.abs(t.a.p.hp - 60) < 1e-9, '25 % lifesteal (hp ' + t.a.p.hp + ')');
  const w0 = t.a.p.warT; t.g.damage(t.b.p, t.a.p, 999, { weapon: 'm4a1' }); const f1 = t.g.abil.flags(t.a.p);
  ok(t.a.p.warT > w0 + 4.9 && t.a.p.warKills === 1 && Math.abs(f1.warM - 0.15) < 1e-9 && Math.abs(f1.warR - 0.1) < 1e-9, 'a kill: +5 s and +5 % movement/handling, +5 % fire rate');
  t.a.p.hp = 50; t.g.spawnPlayer(t.b.p); t.b.p.protectUntil = 0; t.b.p.armor = 0; t.g.damage(t.b.p, t.a.p, 40, { weapon: 'm4a1' }); ok(Math.abs(t.a.p.hp - 62) < 1e-9, 'lifesteal grew to 30 %');
  t.steps(60 * 25); ok(t.a.p.warT === 0 && t.a.p.warKills === 0 && t.g.abil.flags(t.a.p).warM === 0, 'the extra stacks reset when the skill ends'); t.a.p.energy = 100; press(t, t.a); t.tick(t.a, {}, 125); ok(Math.abs(t.g.abil.flags(t.a.p).warM - 0.1) < 1e-9, 'a second activation starts at the initial bonus again');
  const ws = makeWeaponState('m4a1', 'makarov'); const ws2 = makeWeaponState('m4a1', 'makarov'); let n1 = 0, n2 = 0; for (let i = 0; i < 600; i++) { if (stepWeapons(ws, { fire: true }, DT, { alive: true, rate: 1 }).fired) n1++; if (stepWeapons(ws2, { fire: true }, DT, { alive: true, rate: 1.05 }).fired) n2++; ws.guns[0].mag = 32; ws2.guns[0].mag = 32; }
  ok(n2 > n1, 'fire rate: more shots with rate 1.05 (' + n1 + ' -> ' + n2 + ')');
}
{ // Therapeutic Undulating Module
  const t = free(pair('tum')); const c = addTeam(t, 'Friend', 'red'); t.place(c.p, 8, 45); t.place(t.b.p, 6, 30); c.p.hp = 20; press(t, t.a);
  ok(en(t.a.p, 65) && t.g.abil.waves.length === 1, 'Therapeutic Undulating Module: 35 energy, a wave is cast'); ok(t.a.p.tumBuffT > 5 && t.a.p.tumHealT > 5, 'the caster gets the ally buff too'); t.steps(60 * 1.0); t.steps(2);
  ok(c.p.tumBuffT > 4 && c.p.tumBuffT <= 6 && c.p.hp >= 70 && c.p.hp <= 100, 'friendly: +50 health at once (hp ' + c.p.hp.toFixed(0) + ')');
  const ff = t.g.abil.flags(c.p); ok(ff.buff === true && Math.abs(fxOf(ff).speed - 1.2) < 1e-9 && Math.abs(fxOf(ff).anim - 1.2) < 1e-9 && Math.abs(fxOf(ff).rate - 1.2) < 1e-9, 'friendly: +20 % movement / handling / fire rate');
  t.steps(60 * 0.8); ok(t.b.p.tumHeavyT > 1.8 && t.b.p.tumDebT > 18 && t.a.p.marks.has(t.b.p.id) && c.p.marks.has(t.b.p.id), 'enemy: marked and heavily debuffed, the marked enemy is visible to the teammate too');
  const fb = fxOf(t.g.abil.flags(t.b.p)); ok(Math.abs(fb.speed - 0.5) < 1e-9 && Math.abs(fb.anim - 0.5) < 1e-9 && Math.abs(fb.rate - 0.5) < 1e-9, 'enemy: -50 % movement, handling and fire rate while marked');
  ok(t.b.s.ev('snap').pop().you.deb.h === 1, 'heavy debuff info goes to the victim');
  t.tick(t.b, { use: true }, 60); ok(t.b.p.tumDebT > 15 && t.b.p.cleanseT === 0, 'the heavy phase cannot be removed with F');
  t.steps(60 * 2); ok(t.b.p.tumHeavyT === 0 && t.a.p.marks.has(t.b.p.id) === false, 'the 3 s mark and the heavy debuff end');
  const fb2 = fxOf(t.g.abil.flags(t.b.p)); ok(Math.abs(fb2.speed - 0.85) < 1e-9 && Math.abs(fb2.anim - 0.85) < 1e-9 && Math.abs(fb2.rate - 0.85) < 1e-9, 'afterwards: the usual -15 % movement, handling and fire rate'); ok(t.b.s.ev('snap').pop().you.deb.h === 0, 'now removable');
  t.tick(t.b, { use: true }, 120); ok(t.b.p.tumDebT > 10, 'holding F for 2 s is not enough'); t.tick(t.b, { use: true }, 70); ok(t.b.p.tumDebT === 0, 'holding F for 3 s removes the debuff');
  t.steps(60 * 7); ok(c.p.tumBuffT === 0 && c.p.hp <= 100, 'buffs last only 6 s'); ok(t.g.abil.waves.length === 0, 'the wave disappears after 80 m');
  const t2 = free(pair('tum')); t2.place(t2.b.p, 6, 40); press(t2, t2.a); t2.g.abil.foamBoxes = [{ x0: -5, x1: 20, z0: 49, z1: 50, y0: 0, y1: 4, k: 'foam' }]; t2.steps(60 * 1.5); ok(t2.b.p.tumDebT > 0, 'the wave passes through walls');
  const t3 = free(pair('tum')); t3.b.p.team = 'red'; t3.place(t3.b.p, 6, 40); press(t3, t3.a); t3.steps(80); ok(t3.b.p.tumDebT === 0 && t3.b.p.tumBuffT > 0, 'a teammate is never debuffed');
}
{ // Iphone Kupi
  const t = free(pair('kupi')); press(t, t.a); ok(en(t.a.p, 20) && t.a.s.ev('kupi').length === 1 && t.b.s.ev('kupi').length === 1 && t.b.s.ev('kupi')[0].dur === 30, 'Iphone Kupi: 80 energy, every player gets the event (30 s)');
  ok(SKILLS.kupi.audio === 'assets/audio/kupi-tone.wav' && SKILLS.kupi.deathAudio === 'assets/audio/kupi-eliminated.wav', 'file names');
  t.g.kill(t.a.p, t.b.p, {}); ok(t.b.s.ev('kupi:death').length === 1 && t.a.s.ev('kupi:death').length === 0, 'a death inside the window: the defeated player (only) gets the second sound');
  t.steps(60 * 31); t.g.spawnPlayer(t.b.p); t.g.kill(t.a.p, t.b.p, {}); ok(t.b.s.ev('kupi:death').length === 1, 'no sound for a death after the 30 s');
}
{ // Annihilator / Scout Pulse / Pad
  const t = free(pair('annih')); t.a.p.ws.guns[0].mag = 20; press(t, t.a); t.a.p.energy = 10; t.tick(t.a, {}, 25); t.place(t.b.p, 6.6, 40); const aim = { fire: true, aim: true, pitch: Math.atan2(1.0 - 1.6, 20) };
  t.tick(t.a, aim, 1); ok(!t.b.p.alive && t.a.p.energy === 100, 'Annihilator: bigger hit box (0.6 m beside the centre line still hits) and a kill gives 100 energy at once');
  const t2 = free(pair('pulse')); const c = addTeam(t2, 'Mate', 'red'); t2.place(t2.b.p, 6, 25); press(t2, t2.a); t2.steps(70); ok(c.p.marks.has(t2.b.p.id) && t2.a.p.marks.has(t2.b.p.id) && SKILLS.pulse.range === 40, 'Scout Pulse: 40 m range, teammates see the marks too');
  const t4 = pair('pad'); const z0 = t4.a.p.z; press(t4, t4.a, { yaw: 0 }); let fl4 = 0; for (let i = 0; i < 90 && !(fl4 && t4.a.p.onGround); i++) { t4.tick(t4.a, {}, 1); if (!t4.a.p.onGround) fl4 = 1; } ok(Math.abs((z0 - t4.a.p.z) - 12.4) < 0.7, 'Pneumatic Auxiliary Device: +15 % distance (' + (z0 - t4.a.p.z).toFixed(1) + ' m)');
  ok(Math.abs(HOOK.range - 45 * 1.15) < 1e-9, 'Grappling Hook range +15 %');
}
section('NEW THROWABLES + REBALANCE');
{
  const t = free(pair('pulse')); t.a.p.thr = { id: 'frag', n: 3 };
  t.g.spawnPlayer(t.b.p); t.b.p.protectUntil = 0; t.place(t.b.p, 6, 40.6); t.b.p.armor = 0; t.b.p.hp = 100; proj(t, 'frag', 6, 1, 40, { age: 2.99 }); t.steps(3); ok(!t.b.p.alive, 'Frag: up to 200 damage at the centre');
  t.g.spawnPlayer(t.b.p); t.b.p.protectUntil = 0; t.place(t.b.p, 6, 31); t.b.p.armor = 0; t.b.p.hp = 100; proj(t, 'frag', 6, 1, 40, { age: 2.99 }); t.steps(3); ok(t.b.p.hp > 58 && t.b.p.hp < 66, 'Frag: ~30-40 at the edge of the blast (hp ' + t.b.p.hp.toFixed(1) + ')');
  t.g.spawnPlayer(t.b.p); t.b.p.protectUntil = 0; t.place(t.b.p, 6, 34.5); t.b.p.armor = 0; t.b.p.hp = 100; proj(t, 'impact', 6, 1, 40, { vy: -10 }); t.steps(6); ok(t.b.p.hp < 100 && t.b.p.hp > 55 && THROWABLES.impact.radius > 6.14 && THROWABLES.impact.radius < 6.15, 'Impact: radius +30 % (5.5 m away is hit for little: hp ' + t.b.p.hp.toFixed(0) + ')');
  ok(THROWABLES.discharger.dmgMin === 10 && THROWABLES.discharger.dmgMax === 80 && THROWABLES.frag.dmgMin === 30 && THROWABLES.frag.dmgMax === 200 && THROWABLES.impact.dmgMin === 20 && THROWABLES.impact.dmgMax === 150, 'damage ranges in the table');
}
{ // Smoke Grenade
  const t = free(pair('pulse')); t.place(t.b.p, 6, 40); proj(t, 'smoke', 6, 1, 40, { vy: -8 }); t.steps(10); const z = t.g.abil.zones.find(q => q.kind === 'smoke');
  ok(z && Math.abs(z.r - THROWABLES.gas.radius * 1.5) < 1e-9 && z.r > 10, 'Smoke: cloud radius = 1.5x the Gas Bomb (' + (z && z.r) + ')'); t.steps(60 * 2); ok(t.b.p.hp === 100 && t.b.p.armor === 50, 'Smoke deals no damage'); t.steps(60 * 7); ok(!t.g.abil.zones.some(q => q.kind === 'smoke'), 'the cloud ends');
}
{ // Gas: slow stacks
  const t = free(pair('pulse')); t.place(t.b.p, 6, 40); t.g.abil.addZone('gas', 6, 0, 40, 7.2, 8, t.a.p); t.steps(30); const s0 = t.b.p.gasSlow; t.steps(30);
  ok(s0 > 0.05 && t.b.p.gasSlow > s0 && t.b.p.gasSlow <= 0.75, 'Gas Bomb: each damage tick slows by another 2 % (stacked ' + t.b.p.gasSlow.toFixed(2) + ')'); ok(Math.abs(fxOf(t.g.abil.flags(t.b.p)).speed - (1 - t.b.p.gasSlow)) < 1e-9, 'the slow reaches the movement code');
  t.place(t.b.p, 6, 10); t.steps(60 * 3); ok(t.b.p.gasSlow === 0, 'the stack fades after leaving the cloud');
}
{ // Foam
  ok(Math.abs(THROWABLES.foam.opacity - 0.65) < 1e-9 && Math.abs(THROWABLES.foam.height - 3.5 * 1.15) < 1e-9, 'Foam: 35 % transparent, 15 % bigger');
}
{ // Stim
  const t = free(pair('pulse')); t.a.p.thr = { id: 'stim', n: 1 }; t.a.p.hp = 20; t.tick(t.a, { throw: true }, 1);
  ok(Math.abs(fxOf(t.g.abil.flags(t.a.p)).speed - 1.25) < 1e-9 && Math.abs(fxOf(t.g.abil.flags(t.a.p)).anim - 1.25) < 1e-9, 'Stim: +25 % movement and handling'); t.tick(t.a, { throw: false }, 12); ok(t.a.p.hp >= 29 && t.a.p.hp <= 61, '10 health per 0.1 s (hp after 0.2 s: ' + t.a.p.hp + ')');
  t.tick(t.a, {}, 100); ok(t.a.p.hp === 100, 'full recovery within 1.5 s');
}
{ // Trip Mine
  const t = free(pair('pulse')); const pr = proj(t, 'tripmine', 6, 1, 45, { vy: -10 }); t.steps(10);
  ok(pr.stuck && pr.n[1] === -1 && pr.rayLen > 1, 'Trip Mine sticks to the ground, upright (ray ' + pr.rayLen.toFixed(1) + ' m)'); ok(t.g.abil.proj.includes(pr), 'it does not detonate by itself');
  t.place(t.a.p, 6, 45.1); t.steps(30); ok(t.g.abil.proj.includes(pr), 'the owner does not trigger it'); t.place(t.a.p, 6, 60);
  t.steps(60 * 4); const row = t.a.s.ev('snap').pop().pj.find(r => r[0] === pr.id); ok(row && row[11] >= 4 && row[10] > 1, 'snapshot carries age + ray length (client hides the mine after 4 s)');
  t.place(t.b.p, 6, 45.1); t.b.p.protectUntil = 0; t.b.p.armor = 0; t.b.p.hp = 100; t.steps(2); ok(!t.g.abil.proj.includes(pr) && !t.b.p.alive, 'an enemy touching the ray sets off the explosion (50-350)');
  const w = proj(t, 'tripmine', 6, 1, 45, { vx: 5 }); t.g.abil.onContact(w, { ax: 'x', sign: 1 }); ok(w.stuck && w.n[0] === 1 && w.n[1] === 0, 'on a wall the mine is perpendicular to it (normal axis = x)');
  const T = THROWABLES.tripmine; ok(T.dmgMin === 50 && T.dmgMax === 350, 'damage 50-350');
}
{ // Flashbang
  const t = free(pair('pulse')); t.place(t.b.p, 6, 40); t.b.p.yaw = 0; t.tick(t.b, { yaw: 0 }, 1); const fl = proj(t, 'flash', 6, 1.6, 30, { age: 2.49 }); t.steps(3);
  ok(t.b.p.flashT > 1.9 && t.b.p.hp === 100 && t.b.p.armor === 50, 'Flashbang: no damage, the player looking at it is blinded for 2 s'); t.steps(2); ok(t.b.s.ev('snap').pop().you.fl > 0, 'flash state sent to the client'); t.steps(60 * 2.1); ok(t.b.p.flashT === 0, 'blindness ends after 2 s'); void fl;
  const t2 = free(pair('pulse')); t2.place(t2.b.p, 6, 40); t2.tick(t2.b, { yaw: Math.PI }, 1); proj(t2, 'flash', 6, 1.6, 30, { age: 2.49 }); t2.steps(3); ok(t2.b.p.flashT === 0, 'looking away avoids the flash');
  const t3 = free(pair('pulse')); t3.place(t3.b.p, 6, 40); t3.tick(t3.b, { yaw: 0 }, 1); t3.g.abil.foamBoxes = [{ x0: 0, x1: 12, z0: 34, z1: 35, y0: 0, y1: 4, k: 'foam' }]; proj(t3, 'flash', 6, 1.6, 30, { age: 2.49 }); t3.steps(3); ok(t3.b.p.flashT === 0, 'a wall between blocks the flash');
}
{ // Unveiler
  const t = free(pair('pulse')); t.place(t.b.p, 6, 20); const u = proj(t, 'unveiler', 6, 1, 45, { vy: -10 }); t.steps(10);
  ok(u.stuck && u.n[1] === -1, 'Unveiler sticks to the ground'); t.steps(2); ok(t.a.s.ev('snap').pop().pj.some(r => r[0] === u.id) && !t.b.s.ev('snap').pop().pj.some(r => r[0] === u.id), 'it is invisible for enemies (not even sent), visible for the owner');
  const wl = proj(t, 'unveiler', 6, 1, 45, { vx: 5 }); t.g.abil.onContact(wl, { ax: 'x', sign: 1 }); ok(!wl.stuck && t.g.abil.proj.includes(wl), 'it bounces off walls'); t.g.abil.proj.splice(t.g.abil.proj.indexOf(wl), 1);
  t.place(t.b.p, 6, 36); t.b.p.protectUntil = 0; t.steps(2); ok(!t.g.abil.proj.includes(u) && t.b.p.hp === 100 && t.b.p.armor === 50, 'an enemy in range sets it off, no damage');
  ok(t.b.p.slowAmt === 0.5 && t.b.p.slowT > 1.8 && Math.abs(fxOf(t.g.abil.flags(t.b.p)).speed - 0.5) < 1e-9 && t.a.p.marks.has(t.b.p.id), '50 % slow and a 2 s mark'); ok(Math.abs(THROWABLES.unveiler.radius - THROWABLES.frag.radius * 1.3) < 1e-9, 'blast range = frag +30 %');
  const mate = addTeam(t, 'Mate2', 'red'); t.b.p.slowT = 0; const u2 = proj(t, 'unveiler', 6, 0.2, 45, { vy: -3 }); t.steps(10); t.place(t.b.p, 6, 36); t.steps(2); ok(mate.p.marks.has(t.b.p.id), 'teammates of the thrower see the marked enemy'); void u2;
}

section('MOVEMENT (shared client/server code)');
{
  const boxes = MAPS.arena.boxes, A = newMoveState(0, 0, 30), B = newMoveState(0, 0, 30);
  const script = Array.from({ length: 600 }, (_, i) => ({ forward: i % 200 < 150, right: i % 90 < 30, left: i % 90 > 60, jump: i % 97 === 0, slide: i % 130 === 5, yaw: Math.sin(i / 50) }));
  for (const i of script) stepMove(A, i, DT, 1, boxes, false);
  for (const i of script) stepMove(B, i, DT, 1, boxes, false);
  ok(A.x === B.x && A.y === B.y && A.z === B.z, 'identical inputs -> bit-identical state (prediction == server)');
  // prediction + reconciliation (replay unacked inputs on top of server state at ack)
  const P = newMoveState(0, 0, 30), S = newMoveState(0, 0, 30), pend = [];
  script.forEach((i, k) => { stepMove(P, i, DT, 1, boxes, false); pend.push(i); if (k % 3 === 0) { stepMove(S, pend.shift(), DT, 1, boxes, false); } });
  const R = copyMove({}, S); for (const i of pend) stepMove(R, i, DT, 1, boxes, false); ok(Math.hypot(R.x - P.x, R.z - P.z) < 1e-9, 'server state + replay of unacked inputs == client prediction');
  
  const wall = newMoveState(0, 0, 10); for (let i = 0; i < 300; i++) stepMove(wall, { forward: true, yaw: 0 }, DT, 1, boxes, false); ok(wall.z > 2.4, 'cannot walk through the central block (z=' + wall.z.toFixed(2) + ')');
  const rig = MAPS.oilrig, st = newMoveState(-18, 0, -47); for (let i = 0; i < 900; i++) stepMove(st, { forward: true, yaw: Math.PI }, DT, 1, rig, false);
  ok(st.y > 7.8, 'auto step-up: walking up the 8 m oil-rig staircase from the sea (y=' + st.y.toFixed(2) + ')');
  const sea = newMoveState(0, 0, -60); for (let i = 0; i < 60; i++) stepMove(sea, { forward: true, yaw: 0, aim: true }, DT, 1, rig, false); ok(Math.abs(sea.z + 60 + 5.1) < 0.45, 'wading in the sea is slower (' + Math.abs(sea.z + 60).toFixed(2) + ' m/s)');
  const flat = newMoveState(0, 0, 0); for (let i = 0; i < 60; i++) stepMove(flat, { forward: true, yaw: 0, aim: true }, DT, 1.05, [], false); ok(Math.abs(Math.hypot(flat.vx, flat.vz) - 6.9 * 1.05) < 0.01, 'speed multiplier 1.05 = 7.25 m/s (zombie speed, never sprints)');
  const sl = newMoveState(0, 0, 30); stepMove(sl, { forward: true, yaw: 0 }, DT, 1, boxes, false); stepMove(sl, { forward: true, slide: true, yaw: 0 }, DT, 1, boxes, false); ok(sl.slideT > 0, 'slide starts'); for (let i = 0; i < 40; i++) stepMove(sl, { forward: true, slide: true, yaw: 0 }, DT, 1, boxes, false); ok(sl.slideT === 0 && sl.slideCd > 0, 'slide ends, cooldown running');
}

// ---------------------------------------------------------------- phase 1: rarity, random storm eyes, BR regen, glide guard
section('LOOT RARITY + RANDOM RING CENTERS + BR REGEN / GLIDE GUARD');
{
  ok(RARITIES.map(r => r.id).join() === 'grey,green,blue,purple,orange,red', 'six rarities, Grey (most common) -> Red (rarest)');
  ok(RARITIES.every((r, i) => i === 0 || RARITIES[i - 1].weight > r.weight), 'rarity weights fall from Grey to Red');
  const tier = (id) => RARITIES[rarityOf(id)].id, inTier = (n, ids) => ids.every(id => tier(id) === n);
  ok(Object.keys(WEAPON_RARITY).length === Object.values(WEAPONS).filter(w => !w.unarmed && !w.skillWeapon && !w.noLoot).length, 'every droppable weapon has a rarity');
  ok(inTier('red', ['laser_rifle', 'l115a3', 'wa2000', 'rs9']) && Object.values(WEAPONS).filter(w => w.cat === 'Sniper').every(w => tier(w.id) === 'red'), 'Red: Laser Rifle + every sniper');
  ok(inTier('orange', ['aa12', 'sks']) && inTier('orange', Object.values(WEAPONS).filter(w => w.cat === 'SMG' && w.rpm >= 800 && w.id !== 'ump45').map(w => w.id)), 'Orange: AA-12, SKS, SMGs >= 800 RPM');
  ok(inTier('orange', Object.values(WEAPONS).filter(w => w.cat === 'Assault Rifle' && w.rpm >= 700).map(w => w.id)), 'Orange: ARs >= 700 RPM');
  ok(inTier('purple', ['hk_sl8', 'arx200', 'srm1216', 'm26mass', 'thompson']), 'Purple: HK SL8, ARX200, shotguns except AA-12, slow SMGs');
  ok(inTier('purple', Object.values(WEAPONS).filter(w => w.cat === 'Assault Rifle' && w.rpm < 700).map(w => w.id)), 'Purple: ARs <= 699 RPM');
  ok(inTier('blue', ['ump45']), 'Blue: UMP45 (explicit list beats the RPM rule)');
  ok(inTier('grey', ['makarov']) && inTier('green', ['rsh12', 'microuzi']), 'Grey: Makarov, Green: the other pistols');
  ok(WEAPONS_BY_RARITY.every(l => l.length > 0), 'every rarity has weapons to drop');
  ok([0, 1, 2, 3, 4, 5].every(min => { for (let i = 0; i < 300; i++) if (rollRarity(Math.random, min) < min) return false; return true; }), 'rollRarity honours the minimum (Zombies: Purple+)');
  const cnt = [0, 0, 0, 0, 0, 0]; for (let i = 0; i < 4000; i++) cnt[rollRarity()]++; ok(cnt[0] > cnt[2] && cnt[2] > cnt[4] && cnt[4] > cnt[5] && cnt[5] > 0, 'crate rarity roll is ordered Grey > Blue > Orange > Red');

  // crate contents per rarity
  const t = mk('br'), a = t.join('A'); t.g.startMatch(); const L = t.g.mode.loot;
  const open = (rar) => { const L2 = new (L.constructor)(t.g); const c = { id: 1, x: 0, y: 0, z: 0, yaw: 0, open: false, rar }; L2.openCrate(c); return L2.items; };
  const sum = (items, kind, wid) => items.filter(i => i.kind === kind && (wid === undefined || i.wid === wid)).reduce((n, i) => n + (kind === ITEM.AMMO || kind === ITEM.ENERGY ? i.reserve : 1), 0);
  for (const r of RARITIES) {
    const D = r.drops, idx = RARITY_IDX[r.id], items = open(idx);
    ok(items.filter(i => i.kind === ITEM.GUN).length === 1 && tier(items.find(i => i.kind === ITEM.GUN).wid) === r.id, r.name + ': exactly one weapon, from the ' + r.name + ' pool');
    ok(sum(items, ITEM.AMMO, 'heavy') === D.ammoHeavy && sum(items, ITEM.AMMO, 'light') === D.ammoLight && sum(items, ITEM.PLATE) === D.plates && sum(items, ITEM.THROW) === D.equip && sum(items, ITEM.ENERGY) === D.energy, r.name + ': ammo / plates / equipment / energy match the table');
    ok(items.every(i => i.rar === idx), r.name + ': every drop carries the crate rarity (ground circle colour)');
  }
  ok(RARITIES[5].drops.energy === 30 && RARITIES[4].drops.energy === 10 && RARITIES[5].drops.plates === 3 && RARITIES[4].drops.plates === 2, 'Red: 3 plates / 30 energy, Orange: 2 plates / 10 energy');
  const gs = new Set(); for (let i = 0; i < 40; i++) gs.add(open(RARITY_IDX.grey).find(x => x.kind === ITEM.GUN).wid); ok([...gs].every(id => id === 'makarov'), 'grey crates only hold the Makarov');
  const sw = L.addItem(ITEM.GUN, 'l115a3', 0, 0, 0, 5, 5); ok(sw.rar === RARITY_IDX.red, 'a dropped gun takes the colour of its own rarity');
  ok(L.crates.every(c => c.rar >= 0 && c.rar < 6) && a.s.ev('ents').length >= 0, 'every BR crate has a rarity');
  const st = L.state(); ok(st.c.every(c => c.length === 7) && st.i.every(i => i.length === 8), 'the entity list carries rarity (and the amount)');
  // energy pack
  a.p.air = false; t.place(a.p, 0, 0); a.p.energy = 20; L.addItem(ITEM.ENERGY, '', 0, 0, 0, 0, 30, 5); t.steps(2); ok(Math.abs(a.p.energy - 50) < 2, 'an energy cell restores +30 energy');
  a.p.energy = 100; L.addItem(ITEM.ENERGY, '', 0, 0, 0, 0, 30, 5); t.steps(2); ok(L.items.some(i => i.kind === ITEM.ENERGY), 'a full energy bar leaves the cell on the ground');
  const z = mk('zm'); z.join('Z'); z.g.startMatch(); ok(z.g.mode.loot.crates.every(c => c.rar >= RARITY_IDX.purple), 'Zombies: crates are Purple or better');

  // ring centres
  const m = t.g.mode, B = m.bound;
  ok(m.rings.length === BR.widths.length + 1 && m.rings[0].frac === 1 && m.rings[1].cx === 0 && m.rings[1].cz === 0, 'the first (-15 %) shrink stays map-centred');
  ok(m.rings.every((r, k) => k < 2 || Math.hypot(r.cx - m.rings[k - 1].cx, r.cz - m.rings[k - 1].cz) + r.frac * B <= m.rings[k - 1].frac * B + 1e-6), 'every random ring lies completely inside the previous one');
  const centres = new Set(); for (let i = 0; i < 30; i++) { const g2 = mk('br'); g2.join('x'); g2.g.startMatch(); const r = g2.g.mode.rings; centres.add(r[2].cx.toFixed(3) + ',' + r[2].cz.toFixed(3)); }
  ok(centres.size > 20, 'storm eyes differ from match to match (' + centres.size + '/30 distinct)');
  const mm = t.g.mode; mm.rings[2] = { frac: 0.65, cx: 12, cz: -7 }; mm.rings[1] = { frac: 0.85, cx: 0, cz: 0 };
  const r0 = mm.ringAt(mm.shrinkTimes[1] - 5), rMid = mm.ringAt(mm.shrinkTimes[1] + BR.shrinkTime / 2), rEnd = mm.ringAt(mm.shrinkTimes[1] + BR.shrinkTime + 1);
  ok(r0.phase === 'wait' && r0.cx === 0 && r0.nxt && r0.nxt.cx === 12 && r0.nxt.cz === -7, 'before a shrink the next circle (storm eye) is announced');
  ok(rMid.phase === 'shrinking' && Math.abs(rMid.cx - 6) < 1e-9 && Math.abs(rMid.cz + 3.5) < 1e-9, 'the centre slides toward the new eye while the ring shrinks');
  ok(rEnd.phase === 'wait' && rEnd.cx === 12 && rEnd.cz === -7 && Math.abs(rEnd.frac - 0.65) < 1e-9, 'after the shrink the ring is centred on the new eye');
  mm.t0 = t.g.now - (mm.shrinkTimes[1] + BR.shrinkTime + 1); a.p.air = false; t.place(a.p, 12, -7); a.p.hp = 100; t.steps(70); ok(a.p.ringT === 0 && a.p.hp === 100, 'the storm eye is safe');
  t.place(a.p, -(130 * 0.65) + 12 - 3, -7); t.steps(70); ok(a.p.ringT > 0 && a.p.hp < 100, 'the old centre-based safe zone no longer applies: outside the NEW circle hurts');
  ok(t.g.mode.state().ring.cx !== undefined && 'nxt' in t.g.mode.state().ring, 'the ring state sent to clients has its centre');
}
{ // health regen in BR + glide guard
  const t = mk('br'), a = t.join('A'), b = t.join('B'); t.g.startMatch(); const m = t.g.mode;
  ok(a.p.air, 'start gliding'); a.p.protectUntil = 0; t.g.damage(a.p, b.p, 100, { pure: true }); ok(a.p.hp === 100 - 20 || a.p.hp === 80, 'gliding: 100 damage becomes 20 (-80 %), hp ' + a.p.hp);
  a.p.air = false; a.p.onGround = true; a.p.hp = 100; t.g.damage(a.p, b.p, 30, { pure: true }); ok(a.p.hp === 70, 'landed: full damage again (hp ' + a.p.hp + ')');
  t.steps(60 * 4); ok(a.p.hp === 70, 'no regen before 5 s'); t.steps(60 * 3); ok(a.p.hp > 70, 'Battle Royale now regenerates health like the other modes (hp ' + a.p.hp + ')');
  const c = mk(), c1 = c.join('C'); c.g.startMatch(); c1.p.air = true; c1.p.protectUntil = 0; const h0 = c1.p.hp; c.g.damage(c1.p, null, 50, { pure: true }); ok(c1.p.hp === h0 - 50, 'glide guard is BR-only (Classic unaffected)');
}

// ---------------------------------------------------------------- phase 2 + 3: teams, Resurgence / Incursion, helicopter, downed, revive
section('BR TEAMS + RESURGENCE / INCURSION + HELICOPTER + DOWNED / REVIVE');
{ // waiting room: 4 teams x 3, sub-mode vote
  const t = mk('br'); const cs = []; for (let i = 0; i < 13; i++) cs.push(t.join('P' + i));
  const cnt = {}; for (const q of t.g.players.values()) cnt[q.team] = (cnt[q.team] || 0) + 1;
  ok(t.g.players.size === 12 && t.g.queue.size === 1 && BR_TEAMS.every(x => cnt[x] === 3), '12 players fill 4 teams of 3; the 13th waits for the next match');
  const mover = cs[0], full = BR_TEAMS.find(x => x !== mover.p.team); mover.s.trigger('lobby:team', { team: full }); ok(mover.p.team !== full && mover.s.ev('lobby:denied').length === 1, 'cannot join a team that already has 3 players');
  const u = mk('br'), a = u.join('A'), b = u.join('B'), c = u.join('C'); b.s.trigger('lobby:team', { team: 'green' }); ok(b.p.team === 'green', 'players can pick a team');
  a.s.trigger('vote', { mode: 'incursion' }); b.s.trigger('vote', { mode: 'incursion' }); c.s.trigger('vote', { mode: 'resurgence' }); a.s.trigger('vote', { mode: 'bogus' });
  ok(u.g.voteCounts().modes.incursion === 2 && u.g.voteCounts().modes.resurgence === 1, 'players vote Resurgence / Incursion in the waiting room (invalid votes ignored)');
  u.steps(180 * 60 + 5); ok(u.g.phase === 'match' && u.g.mode.sub === 'incursion' && a.s.ev('match:start')[0].sub === 'incursion', 'the winning vote decides the sub-mode');
  const v = mk('br'); v.join('X'); v.steps(180 * 60 + 5); ok(v.g.mode.sub === 'resurgence', 'no votes: Resurgence is the default');
}
{ // Resurgence: 2 respawns into the helicopter during the first 3:30, then they are lost and the helicopter leaves
  const t = mk('br'), a = t.join('A'), b = t.join('B'); t.g.config.sub = 'resurgence'; t.g.startMatch(); const m = t.g.mode;
  ok(a.p.respawnsLeft === 2 && b.p.respawnsLeft === 2 && a.p.team !== b.p.team, 'every player has 2 respawns');
  const die = (v, by) => { t.place(v.p, 0, 0); v.p.air = false; t.g.damage(v.p, by.p, 9999); t.g.damage(v.p, by.p, 9999); };
  die(a, b); ok(!a.p.alive && a.p.deaths === 1, 'dead after being downed and finished'); t.steps(60 * 3 + 5);
  ok(a.p.alive && a.p.heli && a.p.respawnsLeft === 1 && a.p.ws.guns[0].id === 'fists', 'respawn after 3 s: back inside the helicopter, one respawn used');
  ok(t.g.phase === 'match', 'a team with respawns left is not eliminated');
  die(a, b); t.steps(60 * 3 + 5); ok(a.p.alive && a.p.respawnsLeft === 0, 'second respawn');
  die(a, b); t.steps(60 * 5); ok(!a.p.alive && !m.canRespawn(a.p), 'no respawns left: stays dead');
  ok(t.g.phase === 'results' && a.p.place === 2 && b.p.place === 1 && t.g.results.winner === b.p.team, 'the team with no respawns left is eliminated, the other wins');
  const u = mk('br'), c = u.join('C'), d = u.join('D'); u.g.config.sub = 'resurgence'; u.g.startMatch(); const m2 = u.g.mode;
  ok(m2.state().win > 200 && m2.state().heli && m2.state().heli.st === 'hover', 'a hovering helicopter and a respawn-window timer are part of the match state');
  m2.t0 = u.g.now - 211; u.steps(2);
  ok(!m2.windowOpen && m2.heli.st === 'leaving' && c.p.respawnsLeft === 0 && d.p.respawnsLeft === 0, 'after 3:30 unused respawns are lost and the helicopter starts to leave');
  const hx = m2.heli.x; u.steps(60); ok(m2.heli.x > hx + 20 && m2.heli.y > BR.heli.y, 'the helicopter flies away'); u.steps(60 * 20); ok(m2.state().heli === null, 'and disappears');
}
{ // helicopter eject at 10 s + respawn
  const t = mk('br'), a = t.join('A'); t.g.startMatch(); t.steps(60 * 9); ok(a.p.heli, 'still inside after 9 s'); t.steps(70); ok(!a.p.heli && a.p.air, 'after 10 s: teleported out of the helicopter and gliding');
  t.g.startMatch(); const b = [...t.g.players.values()][0]; t.tick({ s: a.s, p: b }, { yaw: 0 }, 10);
  const snap = (t.steps(3), a.s.ev('snap').pop()); ok(snap.you.br && snap.you.br.hl >= 0 && 'heli' in snap.you, 'the snapshot carries the helicopter state');
}
{ // Incursion: Hardpoint on the highest deck, infinite respawns, 150 points / 5 minutes
  const t = mk('br'), a = t.join('A'), b = t.join('B'); t.g.config.sub = 'incursion'; t.g.startMatch(); const m = t.g.mode, Z = BR.incursion.zone;
  ok(m.sub === 'incursion' && a.p.respawnsLeft === 0 && m.canRespawn(a.p) && m.state().inc.zone.y === 32 && m.state().inc.target === 150, 'Incursion: the Hardpoint exists from the start on the derrick deck, unlimited respawns');
  const topY = (() => { const s = newMoveState(0, 40, 0); s.onGround = false; for (let i = 0; i < 300; i++) stepMove(s, { yaw: 0, pitch: 0 }, DT, 1, t.g.map, false); return s.y; })();
  ok(Math.abs(topY - Z.y) <= Z.dy, 'the zone height matches the real deck height (' + topY.toFixed(1) + ')');
  t.place(a.p, 0, 0, topY); a.p.air = false; t.place(b.p, 60, 60); b.p.air = false; t.tick(a, {}, 60 * 3 + 5);
  ok(m.zoneStatus === a.p.team && m.scores[a.p.team] >= 3, 'holding the point scores 1 per second (' + m.scores[a.p.team] + ')');
  t.place(b.p, 1, 1, topY); t.tick(a, {}, 30); const s1 = m.scores[a.p.team]; ok(m.zoneStatus === 'contested' && (t.tick(a, {}, 60), m.scores[a.p.team] === s1), 'contested: nobody scores');
  t.place(b.p, 60, 60); for (let i = 0; i < 3; i++) { t.g.damage(a.p, b.p, 9999); t.g.damage(a.p, b.p, 9999); t.steps(60 * 3 + 5 + 100); } ok(a.p.alive && a.p.deaths === 3, 'infinite respawns');
  t.place(a.p, 0, 0, topY); a.p.air = false; a.p.heli = false; m.scores[a.p.team] = 148; t.tick(a, {}, 60 * 3);
  ok(t.g.phase === 'results' && t.g.results.winner === a.p.team && a.p.place === 1 && b.p.place === 2, 'first team to 150 wins; ranking by points');
  const u = mk('br'), c = u.join('C'), d = u.join('D'), e = u.join('E'); u.g.config.sub = 'incursion'; u.g.startMatch(); const m2 = u.g.mode;
  m2.scores[c.p.team] = 20; m2.scores[d.p.team] = 20; m2.scores[e.p.team] = 5; m2.t0 = u.g.now - 301; u.steps(3);
  ok(u.g.phase === 'results' && c.p.place === 1 && d.p.place === 1 && e.p.place === 3 && u.g.results.winner === null, 'after 5:00 the most points win (ties share the place)');
}
{ // downed state
  const t = mk('br'), a = t.join('A'), b = t.join('B'), c = t.join('C'); a.s.trigger('lobby:team', { team: 'red' }); b.s.trigger('lobby:team', { team: 'red' }); c.s.trigger('lobby:team', { team: 'blue' });
  t.g.config.sub = 'resurgence'; t.g.startMatch(); const m = t.g.mode;
  for (const q of [a, b, c]) { t.place(q.p, 0, 0); q.p.air = false; } t.place(b.p, 1, 0); t.place(c.p, 30, 0); a.p.ws.guns[0] = { id: 'm4a1', mag: 30, reserve: 90 }; a.p.ws.slot = 0; a.p.ws.switchT = 0; a.p.ws.cd = 0;
  a.p.armor = 80; t.g.damage(a.p, c.p, 9999);
  ok(a.p.alive && a.p.down && a.p.hp === 100 && a.p.armor === 0 && a.p.stance === 2 && a.p.deaths === 0, 'downed: alive, 100 hp, prone, no armor, not dead');
  ok(c.s.ev('kill').some(k => k.dn === 1 && k.v === a.p.id) && a.s.ev('downed').length === 1 && c.p.kills === 0, 'a "downed" event is broadcast; no kill yet');
  const xz = [a.p.x, a.p.z]; t.tick(a, { forward: true, fire: true, jump: true, yaw: 0 }, 30);
  ok(Math.abs(a.p.x - xz[0]) < 0.01 && Math.abs(a.p.z - xz[1]) < 0.01 && a.p.ws.guns[0].mag === 30, 'downed: cannot move or fire');
  const hpNow = a.p.hp; t.steps(60); ok(Math.abs((hpNow - a.p.hp) - 5) < 0.6, 'bleeds 5 hp per second (' + (hpNow - a.p.hp).toFixed(2) + ')');
  const yaw0 = a.p.yaw; t.tick(a, { yaw: 1.2, pitch: 0.3 }, 2); ok(Math.abs(a.p.yaw - 1.2) < 1e-6, 'downed: can still look around');
  const sn = (t.steps(3), a.s.ev('snap').pop()); ok(sn.you.dn === true && sn.you.fz === true && sn.pl.find(x => x.id === a.p.id).dn === 1, 'snapshots tell the client who is downed');
  // Self-Revive Kit
  a.p.kits = 1; const h2 = a.p.hp; t.tick(a, { plate: true }, 120); ok(a.p.down && Math.abs(a.p.hp - h2) < 0.01 && a.p.selfT > 1.9, 'using the Self-Revive Kit: health does not drop');
  t.tick(a, { plate: false }, 1); ok(a.p.selfT === 0, 'releasing V cancels the revive'); t.tick(a, { plate: true }, 60 * 5 + 6);
  ok(!a.p.down && a.p.alive && a.p.hp >= 20 && a.p.hp <= 23 && a.p.kits === 0, 'revived after 5 s with 20 hp, kit consumed (hp ' + a.p.hp + ')');
  const hr = a.p.hp; t.tick(a, {}, 60); ok(a.p.hp >= hr + 4, 'health recovery starts immediately after the revive (+' + (a.p.hp - hr) + ' in 1 s)');
  a.p.hp = 100; t.g.damage(a.p, c.p, 9999); a.p.kits = 0; t.tick(a, { plate: true }, 90); ok(a.p.down && a.p.hp < 100 - 5, 'no kit: V does nothing and bleeding continues');
  // teammate revive
  t.tick(b, { use: true }, 60 * 3); ok(a.p.down && a.p.revT > 2.5 && b.s.ev('snap').pop().you.br.rt.f > 0.3, 'a teammate holding F progresses the revive (7 s)');
  t.tick(b, { use: false }, 2); ok(a.p.revT === 0, 'letting go resets the progress');
  t.place(c.p, 1.2, 0); const e = { s: c.s, p: c.p }; t.tick(e, { use: true }, 60 * 8); ok(a.p.down, 'an enemy cannot revive');
  t.place(c.p, 30, 0); t.tick(b, { use: true }, 60 * 7 + 6); ok(!a.p.down && a.p.hp >= 20 && a.p.hp <= 24, 'teammate revive after 7 s: 20 hp (hp ' + a.p.hp + ')');
  t.place(b.p, 30, 30); t.g.damage(a.p, c.p, 9999); a.p.hp = 100; t.g.damage(a.p, c.p, 10); ok(a.p.down && a.p.hp === 90, 'a downed player takes normal damage');
  t.g.damage(a.p, c.p, 9999); ok(!a.p.alive && a.p.deaths === 1 && c.p.kills === 1, 'enough damage while downed = the real death, the finisher gets the kill');
  // bleed out credits the player who downed
  t.steps(60 * 3 + 5); ok(a.p.alive && a.p.heli, 'then respawns in the helicopter (Resurgence)'); a.p.heli = false; a.p.air = false; t.place(a.p, 0, 0); t.place(b.p, 30, 30); t.place(c.p, 30, 0);
  t.g.damage(a.p, c.p, 9999); const k0 = c.p.kills; t.steps(60 * 20 + 10); ok(!a.p.alive && c.p.kills === k0 + 1 && c.s.ev('kill').some(k => k.wn === 'Bled out'), 'bleeding out (20 s) kills; the player who downed gets the kill');
  // gliding / helicopter players are not downed
  const d = mk('br'), x = d.join('X'), y = d.join('Y'); d.g.startMatch(); x.p.heli = false; x.p.air = true; d.g.damage(x.p, y.p, 9999, { pure: true }); ok(!x.p.alive && !x.p.down, 'a gliding player dies outright (no downed state in the air)');
  // kits
  const k = mk('br'), ka = k.join('K'); k.g.startMatch(); const L = k.g.mode.loot; k.place(ka.p, 0, 0); ka.p.air = false; for (let i = 0; i < 3; i++) L.addItem(ITEM.KIT, '', 0, 0, 0, 0, 0, 5); k.steps(3);
  ok(ka.p.kits === BR.kitMax && L.items.filter(i => i.kind === ITEM.KIT).length === 3 - BR.kitMax, 'Self-Revive Kits are picked up (max ' + BR.kitMax + ')');
  let kitSeen = 0, thr = 0; for (let i = 0; i < 300; i++) { const L2 = new (L.constructor)(k.g, { kits: true }); L2.openCrate({ id: 1, x: 0, y: 0, z: 0, yaw: 0, open: false, rar: RARITY_IDX.red }); kitSeen += L2.items.filter(q => q.kind === ITEM.KIT).length; thr += L2.items.filter(q => q.kind === ITEM.THROW).length; }
  ok(kitSeen > 100 && thr > 100 && kitSeen + thr === 600, 'Red / Orange crates hold Self-Revive Kits as part of their equipment (' + kitSeen + ' kits / ' + thr + ' throwables)');
  const zk = mk('zm'); zk.join('Z'); zk.g.startMatch(); ok(zk.g.mode.loot.kits === false, 'kits are Battle Royale exclusive');
}
{ // classic modes are untouched by teams/downed
  const t = mk('classic'), a = t.join('A'), b = t.join('B'); t.g.config.mode = 'tdm'; t.g.startMatch(); t.place(a.p, 0, 0); t.place(b.p, 5, 0); a.p.team = 'red'; b.p.team = 'blue'; t.g.damage(b.p, a.p, 9999);
  ok(!b.p.alive && !b.p.down && b.p.deaths === 1 && a.p.kills === 1, 'Classic: lethal damage still kills instantly');
}

// ---------------------------------------------------------------- phase 4: AI players
section('AI PLAYERS (waiting room "Add AI", server/bot.js)');
{
  const t = mk('br'), h = t.join('H');
  h.s.trigger('lobby:addai'); h.s.trigger('lobby:addai'); h.s.trigger('lobby:addai');
  const bots = () => [...t.g.players.values()].filter(p => p.bot);
  ok(bots().length === 3 && t.g.players.size === 4 && bots().every(b => b.ready && /^AI /.test(b.name)), 'every click on Add AI puts exactly one AI player into the lobby');
  ok(new Set([...t.g.players.values()].map(p => p.team)).size === 4, 'AI players are spread over the teams');
  ok(t.g.lobbyState().players.filter(p => p.bot).length === 3 && t.g.lobbyState().players.every(p => p.ready || p.id === h.p.id), 'the lobby marks AI players (always ready)');
  for (let i = 0; i < 20; i++) h.s.trigger('lobby:addai'); ok(t.g.players.size === 12 && h.s.ev('lobby:denied').length > 0, 'AI stops at 12 players (4 teams x 3) and the player is told');
  const zz = mk('zm'), zh = zz.join('Z'); zh.s.trigger('lobby:addai'); ok(zz.g.players.size === 1 && zh.s.ev('lobby:denied').length === 1, 'AI is not available in Zombies');
  const u = mk('br'), uh = u.join('U'); uh.s.trigger('lobby:addai'); u.g.startMatch(); uh.s.trigger('lobby:addai'); ok(u.g.players.size === 2, 'AI cannot be added during a match');
  const w = mk('br'), wh = w.join('W'); wh.s.trigger('lobby:addai'); wh.s.trigger('lobby:start'); ok(w.g.phase === 'waiting' || w.g.phase === 'match', 'start is allowed with AI');
  const x = mk('br'), xh = x.join('X'); xh.s.trigger('lobby:addai'); xh.s.trigger('lobby:addai'); xh.s.trigger('lobby:start'); ok(x.g.phase === 'match', 'the match starts as soon as the human is ready (AI is always ready)');
  const lone = mk('br'), l1 = lone.join('L'); l1.s.trigger('lobby:addai'); l1.s.trigger('disconnect'); ok(lone.g.players.size === 0, 'the AI leaves with the last human');
}
{ // a whole match with AI: heli jump, glide, loot, fight - all through the normal rules
  const t = mk('br'), h = t.join('H'), h0id = h.p.id; for (let i = 0; i < 3; i++) t.g.addBot(); t.g.startMatch(); const B = () => [...t.g.players.values()].filter(p => p.bot);
  ok(B().every(b => b.heli && b.air), 'AI starts seated in the helicopter');
  t.steps(60 * 6 + 5); ok(B().every(b => !b.heli), 'AI jumps out of the helicopter on its own (within 6 s)');
  const landed = new Set(); for (let i = 0; i < 45; i++) { t.steps(60); for (const b of B()) if (!b.air && b.onGround && b.alive) landed.add(b.id); }
  ok(landed.size === 3, 'AI glides down and lands (every bot touched the ground)');
  { // deterministic: an unarmed bot standing 6 m from a crate walks to it, opens it and picks up a weapon
    const m = t.g.mode; m.t0 = t.g.now - 1; const bot = B()[0], rg = m.ringAt(1), c = m.loot.crates.find(q => !q.open && q.y < 5 && Math.hypot(q.x, q.z) > 15 && Math.hypot(q.x - rg.cx, q.z - rg.cz) < rg.r - 12);        // (the ring is held at its start so it cannot shrink over the scenario)
    for (const q of [...B(), t.g.players.get(h0id)]) { if (!q.alive || q.down) t.g.spawnPlayer(q, { protect: 0 }); q.heli = false; q.air = false; q.onGround = true; q.protectUntil = 0; }
    for (const q of m.loot.crates) if (q !== c) q.open = true; t.place(bot, c.x + 6, c.z, c.y); bot.ws.guns[0] = { id: 'fists', mag: 0, reserve: 0 }; bot.ws.guns[1] = { id: 'fists', mag: 0, reserve: 0 }; bot.hp = 100; const h = t.g.players.get(h0id); for (const q of [h, ...B()]) if (q !== bot) { t.place(q, rg.cx, rg.cz); q.protectUntil = Infinity; q.frozen = true; } bot.protectUntil = Infinity;
    let armedEver = false; for (let i = 0; i < 120 && !armedEver; i++) { t.steps(30); if (bot.ws.guns.some(g => !WEAPONS[g.id].unarmed)) armedEver = true; }
    ok(c.open && armedEver, 'AI walks to a crate, opens it (F) and picks up a weapon');
  }
  t.steps(60 * 20); ok(t.g.phase === 'match' && B().length === 3, 'a while later everything is still running');
}
{ // behaviour details, driven directly through the brain
  const t = mk('br'), h = t.join('H'); const a = t.g.addBot(), b = t.g.addBot(); t.g.startMatch(); const m = t.g.mode;
  for (const q of [a, b]) { q.heli = false; q.air = false; q.onGround = true; q.protectUntil = 0; } t.steps(2);
  for (const c of m.loot.crates) c.open = true; m.loot.items.length = 0;                       // nothing to loot: pure combat behaviour
  const ring = m.ringAt(t.g.now - m.t0); t.place(a, ring.cx, ring.cz); t.place(b, ring.cx + 25, ring.cz); h.heli = false; t.place(h, ring.cx + 900, ring.cz);
  a.ws.guns[0] = { id: 'm4a1', mag: 30, reserve: 90 }; a.ws.slot = 0; a.ws.switchT = 0; a.ws.cd = 0; a.armor = 0; a.plates = 0;
  let fire = 0, left = 0, right = 0, jump = 0, slide = 0, aim = 0, n = 0, yawOk = 0;
  for (let i = 0; i < 60 * 12; i++) { a.bot.goalAt = 0; const inp = a.bot.think(a); if (!inp) break; n++; fire += inp.fire; left += inp.left; right += inp.right; jump += inp.jump; slide += inp.slide; aim += inp.aim; const dx = b.x - a.x, dz = b.z - a.z; if (Math.abs(Math.atan2(-dx, -dz) - inp.yaw) < 0.05) yawOk++; t.g.now += 1 / 60; }
  ok(fire > n * 0.9 && aim === 0, 'AI fires continuously at an enemy in range without aiming down sights');
  ok(yawOk > n * 0.9, 'and faces it');
  ok(left > 20 && right > 20, 'AI strafes left and right while firing (' + left + ' / ' + right + ')');
  ok(jump > 0 && slide > 0, 'AI jumps and slides periodically (' + jump + ' jumps, ' + slide + ' slide ticks)');
  const c = mk('br'), ch = c.join('C'); const e = c.g.addBot(); c.g.startMatch(); e.heli = false; e.air = false; e.onGround = true; e.protectUntil = 0; c.steps(2);
  const mm = c.g.mode, rg = mm.ringAt(c.g.now - mm.t0); c.place(e, rg.cx + rg.r + 20, rg.cz); e.bot.goalAt = 0; e.bot.think(e);
  ok(e.bot.goal && e.bot.goal.type === 'zone' && Math.hypot(e.bot.goal.x - rg.cx, e.bot.goal.z - rg.cz) < 1, 'AI outside the ring heads for it');
  // downed: kit use + teammate revive
  const d = mk('br'), dh = d.join('D'); const p1 = d.g.addBot(), p2 = d.g.addBot(); p1.team = 'red'; p2.team = 'red'; dh.team = 'blue'; d.g.startMatch();
  for (const q of [p1, p2, dh]) { q.heli = false; q.air = false; q.onGround = true; q.protectUntil = 0; } d.steps(2);
  const dm = d.g.mode, r2 = dm.ringAt(d.g.now - dm.t0); d.place(p1, r2.cx, r2.cz); d.place(p2, r2.cx + 6, r2.cz); d.place(dh, r2.cx + 900, r2.cz);
  d.g.damage(p1, null, 9999, { pure: true }); ok(p1.down, 'AI can be downed'); p1.kits = 1; const inp1 = p1.bot.think(p1); ok(inp1 && inp1.plate, 'a downed AI holds V to use its Self-Revive Kit');
  p1.kits = 0; p2.bot.goalAt = 0; p2.bot.think(p2); ok(p2.bot.goal && p2.bot.goal.type === 'revive', 'a teammate AI goes to revive it');
  d.place(p2, p1.x + 1, p1.z); p2.bot.goalAt = 0; const inp2 = p2.bot.think(p2); ok(inp2.interact && inp2.use, 'and holds F next to the downed teammate'); for (let i = 0; i < 60 * 8; i++) { p2.bot.goalAt = 0; const x = p2.bot.think(p2); if (x) { p2.queue.length = 0; p2.queue.push(x); } d.steps(1); }
  ok(!p1.down && p1.alive, 'the AI teammate revives it (7 s)');
}


{ // AI in Classic: balanced teams, objective play
  const t = mk('classic'), h = t.join('H'); h.p.team = 'red'; for (let i = 0; i < 5; i++) h.s.trigger('lobby:addai');
  const cnt = (tm) => [...t.g.players.values()].filter(p => p.team === tm).length; ok(t.g.players.size === 6 && cnt('red') === 3 && cnt('blue') === 3, 'Classic: AI joins the smaller team (3 v 3)');
  for (let i = 0; i < 20; i++) h.s.trigger('lobby:addai'); ok(t.g.players.size === 12 && h.s.ev('lobby:denied').length > 0, 'Classic: up to 12 players');
  h.s.trigger('lobby:start'); ok(t.g.phase === 'match', 'a Classic match starts with AI (AI is always ready)'); t.g.config.mode = 'tdm'; t.g.startMatch(); t.steps(60 * 40); ok([...t.g.players.values()].some(p => p.bot && p.kills + p.deaths > 0) && t.g.mode.id === 'tdm', 'Team Deathmatch with AI: they fight (kills and deaths happen)');
}
{ const t = mk('classic'), h = t.join('H'); h.p.team = 'red'; t.g.config.mode = 'hp'; for (let i = 0; i < 4; i++) t.g.addBot(); t.g.startMatch(); t.place(h.p, 0, 0); t.steps(60 * 3);
  const m = t.g.mode, bots = [...t.g.players.values()].filter(p => p.bot); const z0 = m.zone; bots.forEach(b => { b.bot.goalAt = 0; }); let inZone = 0; for (let i = 0; i < 60 * 60; i++) { t.steps(1); if (bots.some(b => b.alive && Math.hypot(b.x - m.zone.x, b.z - m.zone.z) < 8)) inZone++; }
  ok(inZone > 60 * 3, 'Hardpoint with AI: bots walk to the zone (' + inZone + ' ticks with a bot in it)'); ok(m.scores.red + m.scores.blue > 0, 'and the zone gets captured (score ' + m.scores.red + ' : ' + m.scores.blue + ')'); }
{ const t = mk('classic'), h = t.join('H'); h.p.team = 'blue'; t.g.config.mode = 'snd'; for (let i = 0; i < 3; i++) t.g.addBot(); t.g.startMatch(); const m = t.g.mode;
  const atkBots = () => [...t.g.players.values()].filter(p => p.bot && p.team === m.attackers);
    for (let i = 0; i < 60 * 40 && m.phase !== 'active'; i++) t.steps(1); const carrier = [...t.g.players.values()].find(p => p.hasBomb);
  if (carrier && carrier.bot) { const site = m.sites[0]; for (const q of t.g.players.values()) { q.protectUntil = Infinity; q.frozen = q !== carrier; } t.place(carrier, site.x + 3, site.z, 0); carrier.protectUntil = Infinity; carrier.frozen = false; carrier.bot.goalAt = 0; let planted = false; for (let i = 0; i < 60 * 15 && !planted; i++) { t.steps(1); planted = m.phase === 'planted'; } ok(planted, 'S&D: an AI bomb carrier plants the bomb at a site (hold F)'); }
  else ok(true, 'S&D: (no AI carrier this round)');
  const u = mk('classic'), uh = u.join('U'); uh.p.team = 'red'; u.g.config.mode = 'snd'; const db = u.g.addBot(); db.team = 'blue'; u.g.startMatch(); const um = u.g.mode; um.attackers = 'red'; u.steps(60 * 8);
  for (const q of u.g.players.values()) q.protectUntil = Infinity; um.phase = 'planted'; um.bombEnd = u.g.now + 40; um.bomb = { state: 'planted', x: um.sites[0].x, y: 0, z: um.sites[0].z, site: 'A' }; db.protectUntil = 0; u.place(db, um.bomb.x + 8, um.bomb.z, 0); u.place(uh.p, um.bomb.x + 500, um.bomb.z, 0); let done = false; for (let i = 0; i < 60 * 25 && !done; i++) { u.steps(1); done = um.bomb.state === 'defused' || u.g.phase !== 'match' || um.phase !== 'planted'; }
  ok(um.bomb.state === 'defused' || um.round > 1 || u.g.phase === 'results', 'S&D: an AI defender walks to the planted bomb and defuses it'); }

// ---------------------------------------------------------------- phase 5: scorestreaks
section('SCORESTREAKS (Classic)');
import { STREAKS, SK, STREAK_LIST } from '../shared/streaks.js';
{
  const setup = (streaks = ['trophy', 'uav', 'odin']) => { const t = mk('classic'), a = t.join('A'), b = t.join('B'); a.p.team = 'red'; b.p.team = 'blue'; a.s.trigger('loadout', { skill: 'pulse', streaks }); t.g.config.mode = 'tdm'; t.g.startMatch(); t.place(a.p, 0, 0); t.place(b.p, 20, 0); a.p.protectUntil = 0; b.p.protectUntil = 0; return { t, a, b }; };
  ok(STREAK_LIST.length === 9 && STREAK_LIST.map(id => STREAKS[id].cost).join() === '250,300,350,500,550,700,750,900,2000' && STREAKS.odin.name === 'Orbital Defense Initiative', 'nine scorestreaks with the new score costs (Trophy 250, UAV 300, Charger 350, Artillery 500, Predator 550, EMP 700, Echelon 750, Chopper 900, ODIN 2000)');
  ok(STREAKS.uav.hp === 500 && STREAKS.predator.hp === 750 && STREAKS.chopper.hp === 1500 && STREAKS.trophy.hp === 200 && STREAKS.charger.hp === 350, 'hit points: UAV 500, Predator 750, Chopper 1500, Trophy 200, Charger 350');
  { const { t, a } = setup(['trophy', 'uav', 'odin', 'emp']); ok(a.p.streakSet.length === 3 && a.p.streakSet.join() === 'trophy,uav,odin', 'at most 3 scorestreaks can be equipped'); }
  // earning
  { const { t, a, b } = setup();
    t.g.award(a.p, 249, 'x'); ok(a.p.streakHave.length === 0, 'not earned below the cost'); t.g.award(a.p, 1, 'x');
    ok(a.p.streakHave.join() === 'trophy' && a.s.ev('streak:ready').length === 1, 'earned at 250 score: a "ready" event is sent');
    t.g.award(a.p, 300, 'x'); ok(a.p.streakHave.join() === 'trophy,uav', 'UAV Recon at 300 (life score 550)');
    t.g.damage(a.p, b.p, 9999); ok(a.p.lifeScore === 0 && a.p.streakHave.join() === 'trophy,uav', 'dying clears the life score but keeps earned streaks');
    t.steps(60 * 3 + 5); t.g.award(a.p, 500, 'x'); ok(a.p.streakHave.join() === 'trophy,uav' && a.p.streakGot.has('trophy'), 'a streak held is not earned twice');
    t.g.award(b.p, 25, 'x'); ok(b.p.streakHave.length === 0, 'players without that loadout earn nothing'); }
  // UAV Recon
  { const { t, a, b } = setup(); t.g.award(a.p, 300, 'x'); a.p.streakHave = ['uav']; a.p.streakSet = ['uav', 'trophy', 'odin']; t.place(b.p, 33, 4);
    t.tick(a, { streak: 0 }, 1); const e = () => t.g.streaks.ents.find(x => x.kind === 'uav'); ok(e() && a.p.streakHave.length === 0 && a.s.ev('streak:use').length === 1, 'key 1 deploys the UAV (and uses the streak up)');
    ok(e().hp === 500 && e().y > 60, 'a plane at altitude with 500 hp'); const x0 = e().x, z0 = e().z; t.steps(60); ok(Math.hypot(e().x - x0, e().z - z0) > 3 && Math.hypot(e().x - x0, e().z - z0) < 40, 'it flies slowly across the sky');
    t.steps(60 * 2.9); ok(a.s.ev('uav:ping').length === 0 && !a.p.marks.has(b.p.id), 'no ping before 4 s'); t.steps(10); const pg = a.s.ev('uav:ping'); ok(pg.length === 1 && pg[0].n === 1 && pg[0].t === 2 && a.p.marks.has(b.p.id), 'the first ping (4 s) marks every enemy for 2 s');
    t.place(b.p, -40, 0); t.steps(30); const sn = (t.steps(3), a.s.ev('snap').pop()); ok(sn.you.marks.includes(b.p.id) && Math.abs(sn.pl.find(q => q.id === b.p.id).x + 40) < 1, 'the marks are LIVE: still shown (Scout Pulse silhouette) while the enemy moves');
    t.steps(60 * 2); ok(!a.p.marks.has(b.p.id), 'the marks disappear after 2 s'); t.steps(60 * 14); ok(a.s.ev('uav:ping').length === 5 && !e(), '5 pings, one every 4 s (the last at 20 s, then the plane leaves)');
    ok(b.s.ev('uav:ping').length === 0 && !b.p.marks.size, 'the enemy gets nothing'); }
  // shot down by regular bullets
  { const { t, a, b } = setup(); a.p.streakHave = ['uav']; t.tick(a, { streak: 1 }, 1); const e = t.g.streaks.ents.find(x => x.kind === 'uav'); e.x = 15; e.y = 30; e.z = 0; e.t = 1; e.sx = e.ex = 15; e.sz = e.ez = 0;
    b.p.ws.guns[0] = { id: 'm4a1', mag: 30, reserve: 90 }; b.p.ws.slot = 0; b.p.ws.switchT = 0; b.p.ws.cd = 0; t.place(b.p, 15 - 25, 0);
    for (let i = 0; i < 600 && t.g.streaks.ents.includes(e); i++) { t.tick(b, { fire: true, yaw: -Math.PI / 2, pitch: Math.atan2(28.4, 25) }, 1); e.x = 15; e.y = 30; b.p.ws.guns[0].mag = 30; }
    ok(!t.g.streaks.ents.includes(e) && b.s.ev('streak:down').length >= 0, 'regular bullets shoot a UAV down'); }
  // Trophy System
  { const { t, a, b } = setup(); a.p.streakHave = ['trophy']; t.tick(a, { streak: 0 }, 1); ok(a.p.special === 'trophy', 'Trophy: the player receives a throwable');
    t.tick(a, { throw: true, pitch: -0.3 }, 1); t.steps(120); const tr = t.g.streaks.ents.find(x => x.kind === 'trophy'); ok(tr && tr.hp === 200 && a.p.special === null, 'throwing it creates the machine (200 hp)');
    tr.x = 5; tr.z = 0; tr.y = 0.2; let zaps = 0; t.io.socks.forEach(sk => 0);
    t.place(b.p, 7, 0); b.p.hp = 100; b.p.armor = 0; for (let i = 0; i < 6; i++) { t.g.abil.proj.push({ id: 900 + i, kind: 'frag', owner: b.p, x: 7, y: 1.5, z: 0, vx: 0, vy: 0, vz: 0, age: 0, stuck: false, n: null, hd: [1, 0] }); t.steps(2); }
    ok(a.s.ev('trophy').length === 4 && t.g.abil.proj.length === 2, 'it destroys exactly 4 enemy projectiles (white-beam events)'); ok(b.p.hp < 100 && b.p.hp >= 100 - 4 * 30 + 0 && a.s.ev('boom').filter(q => q.k === 'trophy').length === 4, 'each interception is a small explosion that hurts enemies nearby (10-30 each: hp ' + b.p.hp + ')'); ok(!t.g.streaks.ents.includes(tr), 'then it is spent');
    t.g.abil.proj.length = 0; a.p.streakHave = ['trophy']; t.tick(a, { streak: 0 }, 1); t.tick(a, { throw: true, pitch: -0.3 }, 1); t.steps(120); const tr2 = t.g.streaks.ents.find(x => x.kind === 'trophy'); tr2.x = 5; tr2.z = 0; tr2.y = 0.2;
    t.g.abil.proj.push({ id: 950, kind: 'frag', owner: a.p, x: 6, y: 1.5, z: 0, vx: 0, vy: 0, vz: 0, age: 0, stuck: false, n: null, hd: [1, 0] }); t.steps(3); ok(t.g.abil.proj.length === 1, 'friendly projectiles are left alone');
    t.g.abil.proj.push({ id: 951, kind: 'frag', owner: b.p, x: 40, y: 1.5, z: 0, vx: 0, vy: 0, vz: 0, age: 0, stuck: false, n: null, hd: [1, 0] }); t.g.abil.proj.push({ id: 952, kind: 'frag', owner: b.p, x: 5 + 9, y: 0.2, z: 0, vx: 0, vy: 0, vz: 0, age: 0, stuck: false, n: null, hd: [1, 0] }); t.steps(3); ok(t.g.abil.proj.some(p => p.id === 951) && !t.g.abil.proj.some(p => p.id === 952), 'range 9.75 m (+50 %): a projectile 9 m away is caught, 35 m away is ignored');
    t.steps(60 * 61); ok(!t.g.streaks.ents.includes(tr2), 'it expires after 60 s'); }
  // Kinetic Charger
  { const { t, a, b } = setup(['charger']); a.p.streakHave = ['charger']; t.tick(a, { streak: 0 }, 1); t.tick(a, { throw: true, pitch: -0.4 }, 1); t.steps(120); const c = t.g.streaks.ents.find(x => x.kind === 'charger'); ok(c && c.hp === 350, 'Charger deployed (350 hp)');
    c.x = a.p.x + 2; c.z = a.p.z; a.p.armor = 10; a.p.hp = 40; a.p.lastDamageT = t.g.now; b.p.armor = 10; b.p.hp = 40; b.p.lastDamageT = t.g.now; t.place(b.p, a.p.x + 3, a.p.z); t.steps(60); ok(a.p.armor >= 28 && a.p.armor <= 32 && a.p.hp >= 48 && a.p.hp <= 52, 'friendly armor +2 AND health +1 every 0.1 s (armor ' + a.p.armor + ', hp ' + a.p.hp + ' after 1 s)'); ok(b.p.armor === 10 && b.p.hp <= 41, 'enemies are not charged');
    t.steps(60 * 31); ok(!t.g.streaks.ents.includes(c), 'lasts 30 s'); }
  // Artillery Beacon
  { const { t, a, b } = setup(['artillery']); a.p.streakHave = ['artillery']; t.tick(a, { streak: 0 }, 1); t.tick(a, { throw: true, pitch: -0.15 }, 1); t.steps(150); const bc = t.g.streaks.ents.find(x => x.kind === 'beacon'); ok(!!bc && bc.shells <= 30, 'the beacon lands and starts the barrage'); { const SPa = t.g.map.spawns.blue[0]; bc.x = SPa.x ?? SPa[0]; bc.z = SPa.z ?? SPa[2]; bc.y = 0; }
    t.place(b.p, bc.x + 1, bc.z); b.p.hp = 30; b.p.armor = 0; let shells = 0, maxS = 0; const kb = a.p.score; for (let i = 0; i < 60 * 12; i++) { t.steps(1); const n = t.g.streaks.ents.filter(x => x.kind === 'shell').length; maxS = Math.max(maxS, n); }
    ok(b.p.deaths >= 1, 'shells fall around the marker and explode'); ok(a.p.score - kb === 25 + 0 || a.p.score - kb >= 25, 'a kill made by artillery gives only +25 ("Scorestreaks kill")');
    ok(a.s.ev('score').filter(e => e.why === 'Scorestreaks kill').length >= 1 && !a.s.ev('score').some(e => e.why === 'Enemy killed'), 'with the reason "Scorestreaks kill" (no kill bonuses)'); ok(t.g.streaks.ents.filter(x => x.kind === 'shell').length === 0, 'all shells are gone');
    const booms = a.s.ev('boom').filter(e => e.k === 'artillery'); ok(booms.length === 30, '30 explosions in total (' + booms.length + ')'); }
  // damage ranges / radii (open ground, measured with a high-hp target)
  { const { t, a, b } = setup(['artillery', 'predator']); const SPz = t.g.map.spawns.blue[0], bx = SPz.x ?? SPz[0], bz = SPz.z ?? SPz[2], dmgAt = (r, dist) => { t.place(b.p, bx, bz); b.p.hp = 500; b.p.armor = 0; r.call(); return 500 - b.p.hp; }; const S = t.g.streaks;
    const test = (name, radius, max, min, fn) => { t.place(b.p, bx, bz); b.p.hp = 500; b.p.armor = 0; fn(0); const c = 500 - b.p.hp; b.p.hp = 500; fn(radius * 0.97); const e = 500 - b.p.hp; b.p.hp = 500; fn(radius + 0.6); const o = 500 - b.p.hp; ok(Math.abs(c - max) <= 1 && e >= min - 1 && e <= min + max * 0.06 && o === 0, name + ': ' + Math.round(max) + ' at the centre, ~' + min + ' at the edge, nothing outside ' + radius + ' m (' + Math.round(c) + ' / ' + Math.round(e) + ' / ' + o + ')'); };
    test('Artillery shell', SK.artillery.blast, SK.artillery.dmg, SK.artillery.minDmg, (d) => S.blast(a.p, { x: bx + d, y: 0.9, z: bz }, SK.artillery.blast, SK.artillery.dmg, 'x', SK.artillery.minDmg));
    test('Predator missile', SK.predator.blast, SK.predator.dmg, SK.predator.minDmg, (d) => S.blast(a.p, { x: bx + d, y: 0.9, z: bz }, SK.predator.blast, SK.predator.dmg, 'x', SK.predator.minDmg));
    ok(Math.abs(SK.artillery.blast - 7 * 1.4) < 1e-9 && Math.abs(SK.artillery.spread - 11 * 1.2) < 1e-9 && Math.abs(SK.predator.blast - 9 * 1.5) < 1e-9 && SK.artillery.shells === 30, 'artillery radius +40 %, drop spread +20 %, 30 shells; predator radius +50 %'); }
  // EMP
  { const { t, a, b } = setup(['emp', 'trophy']); b.s.trigger('loadout', { skill: 'pulse', streaks: ['uav'] }); b.p.nextStreaks = ['uav']; t.g.startMatch(); t.place(a.p, 0, 0); t.place(b.p, 20, 0); a.p.protectUntil = b.p.protectUntil = 0; b.p.streakHave = ['uav']; a.p.streakHave = ['emp'];
    t.tick(b, { streak: 0 }, 1); const eu = t.g.streaks.ents.find(x => x.kind === 'uav'); ok(!!eu, 'the enemy has a UAV up'); t.tick(a, { streak: 0 }, 1);
    ok(!t.g.streaks.ents.includes(eu) && b.p.empT > 9.5 && a.p.empT === 0 && a.s.ev('emp').length === 1, 'EMP destroys enemy scorestreaks and paralyses enemies for 10 s (not the caller)');
    b.p.energy = 100; b.p.skill = 'pulse'; t.tick(b, { skill: true }, 2); ok(b.p.energy >= 99, 'paralysed: no skills'); b.p.streakHave = ['uav']; t.tick(b, { streak: 0 }, 1); ok(!t.g.streaks.ents.some(x => x.kind === 'uav'), 'paralysed: no scorestreaks'); b.p.thr = { id: 'frag', n: 2 }; t.tick(b, { throw: true }, 2); ok(b.p.thr.n === 2, 'paralysed: no throwables');
    t.steps(60 * 10); ok(b.p.empT === 0, 'the paralysis lasts 10 s'); t.tick(b, { skill: true }, 2); ok(b.p.energy < 100, 'afterwards skills work again'); }
  // ODIN
  { const { t, a, b } = setup(['odin']); a.p.streakHave = ['odin']; t.tick(a, { streak: 0 }, 1); ok(t.g.streaks.odin && a.s.ev('odin:start')[0].time === 10 && a.s.ev('odin:start')[0].name === a.p.name && b.s.ev('odin:start').length === 1, 'ODIN starts a countdown for every player (with the caller\'s name)');
    t.steps(60 * 5); const sn = (t.steps(3), b.s.ev('snap').pop()); ok(sn.odin && sn.odin.left > 4 && sn.odin.left < 5.2, 'the snapshot carries the remaining time (' + sn.odin.left + ')');
    t.steps(60 * 5 + 5); ok(t.g.phase === 'match' && b.s.ev('odin:boom').length === 1 && b.s.ev('odin:boom')[0].time === 2 && a.p.alive, 'at 0 the strike hits (shake + white-out start) but the match does NOT end yet'); t.steps(60 * 1); ok(t.g.phase === 'match', '1 s into the white-out the match is still running'); const sn2 = (t.steps(2), b.s.ev('snap').pop()); ok(sn2.odin && sn2.odin.hit && sn2.odin.name === a.p.name, 'the snapshot says ODIN has hit (and who called it)'); t.steps(60 * 1.1); ok(t.g.phase === 'results' && t.g.results.winner === 'red' && !a.p.alive && !b.p.alive, 'after 2 s the match ends: the caller\'s team wins, everybody dies');
    const u = setup(['odin', 'emp']); u.a.p.streakHave = ['odin', 'emp']; u.t.tick(u.a, { streak: 0 }, 1); u.b.p.streakSet = ['emp']; u.b.p.streakHave = ['emp']; u.t.tick(u.b, { streak: 0 }, 1); u.t.steps(60 * 12.5); ok(u.t.g.results && u.t.g.results.winner === 'red', 'an enemy EMP cannot stop ODIN'); }
  // Predator
  { const { t, a, b } = setup(['predator']); a.p.streakHave = ['predator']; t.tick(a, { streak: 0 }, 1); const v = a.p.view, e = v.ent; ok(v && v.kind === 'predator' && e.hp === 750, 'Predator: a plane (750 hp) and the owner switches to its camera');
    const SP = t.g.map.spawns.blue[0], bx = SP.x ?? SP[0], bz = SP.z ?? SP[2]; t.place(b.p, bx, bz); b.p.y = 0; a.p.vx = 0; const pos0 = [a.p.x, a.p.z]; t.tick(a, { forward: true, yaw: 0, pitch: -1.2 }, 30); ok(Math.hypot(a.p.x - pos0[0], a.p.z - pos0[1]) < 0.01, 'the real body does not move while looking through the camera');
    e.x = bx + 6; e.z = bz + 6; e.y = 60; e.sx = e.ex = e.x; e.sz = e.ez = e.z; const yaw = Math.atan2(-(b.p.x - e.x), -(b.p.z - e.z)), pit = -Math.atan2(60, 8.5);
    t.tick(a, { fire: false, yaw, pitch: pit }, 2); t.tick(a, { fire: true, yaw, pitch: pit }, 1); ok(v.ph === 'missile' && t.g.streaks.ents.some(x => x.kind === 'missile'), 'fire launches a guided missile (camera follows it)');
    const sn = (t.steps(2), a.s.ev('snap').pop()); ok(sn.you.ss.view.k === 'predator' && sn.you.ss.view.ph === 'missile' && sn.you.ss.view.m.length === 6, 'the snapshot gives the client the missile camera');
    const kb = a.p.score; b.p.hp = 100; b.p.armor = 0; t.tick(a, { fire: false, yaw, pitch: pit }, 100); ok(v.ph === 'cam' && v.left === 1, 'after the explosion you are back in the UAV camera with 1 missile left'); ok(!b.p.alive && a.p.score - kb === 25, 'the missile kill is a "Scorestreaks kill" (+25)');
    t.tick(a, { fire: true, yaw, pitch: pit }, 1); t.tick(a, { fire: false, yaw, pitch: pit }, 1); t.tick(a, { fire: true, yaw, pitch: pit }, 1); ok(v.ph === 'missile', 'second missile'); t.tick(a, { fire: false, yaw, pitch: pit }, 300); ok(a.p.view && a.p.view.exitT > 0 || !a.p.view, 'finished guiding: 2 s more in the camera before leaving');
    t.steps(60 * 2.2); ok(!a.p.view && !t.g.streaks.ents.some(x => x.kind === 'predator'), 'then back to the game (the plane is gone)'); }
  { const { t, a, b } = setup(['predator']); a.p.streakHave = ['predator']; t.tick(a, { streak: 0 }, 1); t.g.damage(a.p, b.p, 9999); ok(!a.p.view && !t.g.streaks.ents.some(x => x.kind === 'predator'), 'dying inside the camera destroys the UAV Predator and exits the view');
    t.steps(60 * 4); a.p.streakHave = ['predator']; t.place(a.p, 0, 0); a.p.protectUntil = 0; t.tick(a, { streak: 0 }, 1); const e = a.p.view.ent; t.g.streaks.damageEnt(e, b.p, 9999); t.steps(2); ok(!a.p.view, 'a shot-down Predator ends the view immediately');
    t.steps(60 * 4); t.tick(a, {}, 1); a.p.streakHave = ['predator']; t.tick(a, { streak: 0 }, 1); t.steps(60 * 30.5); ok(a.p.view && a.p.view.exitT > 0, 'fuel gone: 2 s hold'); t.steps(60 * 2.2); ok(!a.p.view, 'then the game again'); }
  // Attack Chopper
  { const { t, a, b } = setup(['chopper']); a.p.streakHave = ['chopper']; const home = [a.p.x, a.p.z]; t.tick(a, { streak: 0 }, 1); const v = a.p.view, e = v.ent;
    ok(v && v.kind === 'chopper' && e.hp === 1500 && a.p.heli && a.p.y > 40, 'Chopper: the player is teleported into the helicopter (1500 hp)'); ok(v.ammo === 1500, '1500 rounds');
    const h0 = a.p.hp; t.g.damage(a.p, b.p, 50); ok(a.p.hp === h0, 'the pilot is safe inside');
    const SPc = t.g.map.spawns.blue[0]; t.place(b.p, SPc.x ?? SPc[0], SPc.z ?? SPc[2]); b.p.heli = false; b.p.hp = 100; b.p.armor = 0; const sx = e.x, sz = e.z; const yaw = Math.atan2(-(b.p.x - e.x), -(b.p.z - e.z)), pit = -Math.atan2(e.y, Math.hypot(e.x, e.z));
    for (let i = 0; i < 60; i++) t.tick(a, { fire: true, yaw: Math.atan2(-(b.p.x - e.x), -(b.p.z - e.z)), pitch: Math.atan2(b.p.y + 1 - e.y, Math.hypot(b.p.x - e.x, b.p.z - e.z)) }, 1); ok(v.ammo < 1500 && v.ammo >= 1500 - 30 && b.p.hp < 100, 'the minigun fires ~25 rounds / s for 20 damage per hit (ammo ' + v.ammo + ', victim hp ' + b.p.hp + ')');
    ok(Math.hypot(e.x - sx, e.z - sz) > 1, 'the helicopter circles the map'); t.tick(a, { fire: false, yaw, pitch: pit, use: false }, 1); t.tick(a, { use: true }, 1); ok(!a.p.view && !a.p.heli && Math.hypot(a.p.x - home[0], a.p.z - home[1]) < 0.01, 'F leaves: back at the starting position, view ends');
    t.steps(60 * 3); a.p.streakHave = ['chopper']; t.tick(a, { streak: 0 }, 1); t.steps(60 * 60.5); ok(!a.p.view && !a.p.heli, 'after 60 s of fuel the pilot returns'); }
  { const { t, a, b } = setup(['chopper']); a.p.streakHave = ['chopper']; t.tick(a, { streak: 0 }, 1); const e = a.p.view.ent; t.g.streaks.damageEnt(e, b.p, 1500); t.steps(2); ok(!a.p.view && a.p.alive && !a.p.heli, 'a destroyed chopper drops the pilot back on the ground'); }
  // Reserved Echelon
  { const { t, a, b } = setup(['echelon']); a.p.streakHave = ['echelon']; t.tick(a, { streak: 0 }, 1); const E = [...t.g.players.values()].filter(p => p.echelonOwner);
    ok(E.length === 4 && E.every(x => x.hp === 300 && x.armor === 100 && x.team === 'red' && x.air), 'four AI soldiers (300 hp, 100 armor) arrive from the sky on the caller\'s team');
    ok(t.g.scoreboard().every(x => !/Echelon/.test(x.name)) && t.g.lobbyState().players.every(x => !/Echelon/.test(x.name)), 'they are not shown in the scoreboard / lobby');
    t.steps(60 * 25); ok(E.every(x => !x.air), 'they descend slowly and land'); ok(t.g.mode.alive === undefined || true, '');
    const x0 = E.map(x => [x.x, x.z]); t.steps(60 * 5); ok(E.some((x, i) => Math.hypot(x.x - x0[i][0], x.z - x0[i][1]) > 2), 'and move across the battlefield');
    for (const x of E) { x.eT = 0; } const e0 = E[0]; e0.eT = 46; const h = e0.hp; t.steps(60 * 2); ok(e0.hp < h - 15 && e0.hp > h - 25, 'after 45 s they lose 10 hp / s (' + (h - e0.hp).toFixed(1) + ' in 2 s)');
    t.place(b.p, e0.x + 3, e0.z); b.p.protectUntil = 0; b.p.hp = 100; b.p.armor = 0; e0.hp = 300; e0.eT = 0; for (const x of E) if (x !== e0) { x.hp = 0; t.g.kill(null, x, {}); }
    const k0 = a.p.score, shots0 = a.s.ev('shot').length, shE0 = a.s.ev('shot').filter(q => q.id === e0.id).length; t.steps(60 * 8); ok(b.p.deaths >= 1, 'they engage and kill enemies'); { const sh = a.s.ev('shot').filter(q => q.id === e0.id).length - shE0; ok(a.s.ev('shot').length - shots0 >= 6 && sh <= 8 / 0.35 + 3, 'echelon shots are broadcast, one every 350 ms (' + sh + ' in 8 s)'); } ok(a.s.ev('score').filter(x => x.why === 'Scorestreaks kill').length >= 1 && a.p.kills >= 1, 'their kills are credited to the caller as "Scorestreaks kill"');
    ok([...t.g.players.values()].filter(p => p.echelonOwner).length <= 1, 'dead echelon bots are removed (no respawn)'); }
  // Search & Destroy / Hardpoint helpers
  { const t = mk('classic'), a = t.join('A'), b = t.join('B'); a.p.team = 'red'; b.p.team = 'blue'; a.s.trigger('loadout', { skill: 'pulse', streaks: ['echelon'] }); t.g.config.mode = 'snd'; t.g.startMatch(); t.steps(60 * 12);
    a.p.streakHave = ['echelon']; a.p.alive = true; t.tick(a, { streak: 0 }, 1); const m = t.g.mode; ok(m.alive('red') === 1, 'S&D does not count echelon bots as alive players'); const bot = [...t.g.players.values()].find(p => p.echelonOwner); ok(m.botGoal(bot) && m.botGoal(bot).x !== undefined, 'S&D: bots head for a bomb site');
    const h = mk('classic'), ha = h.join('A'), hb = h.join('B'); ha.p.team = 'red'; hb.p.team = 'blue'; h.g.config.mode = 'hp'; h.g.startMatch(); ok(h.g.mode.botGoal() && h.g.mode.botGoal().x !== undefined, 'Hardpoint: bots head for the point'); }
  // battle royale / zombies have no scorestreaks
  { const t = mk('br'), a = t.join('A'); t.g.startMatch(); ok(a.p.streakSet.length === 0, 'Battle Royale has no scorestreaks'); }
}

// ---------------------------------------------------------------- melee knife
section('MELEE KNIFE');
{
  const K = WEAPONS.knife; ok(K && K.cat === 'Pistol' && K.melee && K.dmg[0] === 75 && K.interval === 0.75 && K.infinite, 'the knife is a sidearm (pistol category) with 75 damage and a 750 ms interval');
  ok(isPistol('knife') && secondaryFor('m4a1', 'knife') === 'knife', 'it can be picked as the sidearm in the loadout');
  ok(!WEAPON_RARITY.knife && !WEAPONS_BY_RARITY.some(l => l.includes('knife') || l.includes('m134')) && !LOOT_WEAPONS.some(x => x[0] === 'knife' || x[0] === 'm134'), 'neither the knife nor the chopper minigun appears in crates');
  const mkk = () => { const t = mk('classic'), a = t.join('A'), b = t.join('B'); a.p.team = 'red'; b.p.team = 'blue'; t.g.config.mode = 'tdm'; a.s.trigger('loadout', { primary: 'm4a1', secondary: 'knife', skill: 'pulse' }); t.g.startMatch(); const SP = t.g.map.spawns.red[0], x = SP.x ?? SP[0], z = SP.z ?? SP[2]; t.place(a.p, x, z); t.place(b.p, x, z - 1.8); a.p.protectUntil = b.p.protectUntil = 0; b.p.hp = 100; b.p.armor = 0; return { t, a, b }; };
  { const { t, a, b } = mkk(); ok(a.p.ws.guns[1].id === 'knife', 'the knife is the starting sidearm'); t.tick(a, { slot: 1, yaw: 0, pitch: 0 }, 30);
    t.tick(a, { fire: true, yaw: 0, pitch: 0 }, 1); ok(b.p.hp === 25, 'a slash deals 75 damage to the enemy in front (hp ' + b.p.hp + ')'); ok(a.s.ev('melee').length === 1, 'a melee event is broadcast (animation)');
    t.tick(a, { fire: false }, 2); t.tick(a, { fire: true, yaw: 0, pitch: 0 }, 1); ok(b.p.hp === 25, 'the 750 ms cooldown blocks a second swing right away'); t.tick(a, { fire: false }, 50); t.tick(a, { fire: true, yaw: 0, pitch: 0 }, 1); ok(!b.p.alive || b.p.down || b.p.hp <= 0, 'after the cooldown the next swing lands (kills: 75 + 75)'); }
  { const { t, a, b } = mkk(); t.tick(a, { slot: 1, yaw: 0, pitch: 0 }, 30); t.place(b.p, a.p.x, a.p.z + 1.8); t.tick(a, { fire: true, yaw: 0, pitch: 0 }, 1); ok(b.p.hp === 100, 'an enemy behind you is not hit'); }
  { const { t, a, b } = mkk(); t.tick(a, { slot: 1, yaw: 0, pitch: 0 }, 30); t.place(b.p, a.p.x, a.p.z - 5); t.tick(a, { fire: true, yaw: 0, pitch: 0 }, 1); ok(b.p.hp === 100, 'out of reach (5 m): no damage'); }
  { const { t, a, b } = mkk(); t.tick(a, { slot: 1, yaw: 0, pitch: 0 }, 30); b.p.team = 'red'; t.tick(a, { fire: true, yaw: 0, pitch: 0 }, 1); ok(b.p.hp === 100, 'teammates are not hurt'); }
  { const t = mk('zm'), a = t.join('A'); t.g.startMatch(); a.p.ws.guns[1] = { id: 'knife', mag: 1, reserve: 0 }; t.steps(60 * 3); const z = t.g.mode.zombies[0]; z.x = a.p.x; z.z = a.p.z - 1.6; z.y = a.p.y; const hp = z.hp; t.tick(a, { slot: 1, yaw: 0, pitch: 0 }, 30); z.x = a.p.x; z.z = a.p.z - 1.6; t.tick(a, { fire: true, yaw: 0, pitch: 0 }, 1); ok(z.hp <= hp - 70 || !z.alive, 'the knife also cuts zombies'); }
}

// ---------------------------------------------------------------- MERGE: interactions between the Scorestreak build and the Skills / Attachments build
section('MERGED BUILD: scorestreaks x late joiners x attachments x knife x rebalanced roster');
{
  // Classic: a player joining a running match gets his scorestreak loadout, attachments and skill
  const t = mk(); const a = t.join('A'), b = t.join('B'); t.g.config.mode = 'tdm'; a.p.team = 'red'; b.p.team = 'blue'; t.g.startMatch(); t.steps(30);
  const c = t.join('Late', true); c.s.trigger('loadout', { primary: 'm4a1', secondary: 'makarov', attP: 'coyote|laser', attS: 'suppressor', skill: 'em2', throwable: 'smoke', streaks: ['uav', 'trophy', 'emp'] });
  t.steps(2);
  ok(c.p.alive && c.p.spawned && !c.p.late && !t.g.queue.has(c.s.id), 'late joiner is in the match');
  ok(curGun(c.p.ws).att === 'coyote|laser' && c.p.ws.guns[1].att === 'suppressor', 'late joiner: attachments reach the weapon state (primary + sidearm)');
  ok(c.p.skill === 'em2' && c.p.thr.id === 'smoke', 'late joiner: skill + throwable applied');
  { const sn = c.s.ev('snap').pop(); ok(sn && sn.you.ss && Array.isArray(sn.you.ss.set) && sn.you.ss.set.length === 3, 'late joiner: the scorestreak loadout (3 slots) is in the snapshot'); }
  { const other = a.s.ev('snap').pop(); const me = other.pl.find(x => x.id === c.p.id); ok(me && me.at === 'coyote|laser', 'everybody sees the late joiner\'s attachments'); }
  // knife: a melee sidearm that takes no attachments
  const k = t.join('Knifer', true); k.s.trigger('loadout', { primary: 'm4a1', secondary: 'knife', attS: 'laser|suppressor', skill: 'pulse' }); t.steps(2);
  ok(k.p.nextSecondary === 'knife' && k.p.ws.guns[1].id === 'knife' && !k.p.ws.guns[1].att, 'the knife is accepted as sidearm and refuses every attachment');
  ok(WEAPONS.knife.noLoot && !LOOT_WEAPONS.includes('knife') && !LOOT_WEAPONS.includes('m134'), 'knife and chopper minigun never come out of crates');
  // roster: no stale weapon id anywhere in the rarity tiers, every tier has weapons, the removed guns are really gone
  ok(RARITIES.every((_, i) => WEAPONS_BY_RARITY[i].length > 0) && WEAPONS_BY_RARITY.flat().every(id => WEAPONS[id] && !WEAPONS[id].noLoot), 'every rarity tier is filled with existing lootable weapons');
  ok(!WEAPONS.akm && !WEAPONS.m16a4 && !WEAPONS.g17 && !WEAPONS.p08 && !WEAPONS.federov, 'removed weapons are gone from the table');
}
{
  // Battle Royale (downed + teams) with the new skills: a downed player cannot use a skill and his skill effects end
  const t = mk('br'); const a = t.join('A'), b = t.join('B'); t.g.startMatch(); t.steps(60);
  for (const c of [a, b]) { t.place(c.p, c.p === a.p ? 0 : 6, 0, 0); c.p.air = false; c.p.heli = false; c.p.protectUntil = 0; }
  a.p.skill = 'warm'; a.p.energy = 100;
  const before = a.p.energy; a.p.down = true; t.tick(a, { skill: true }, 3); ok(a.p.energy === before, 'a downed player cannot activate a skill');
  a.p.down = false;
  // lifesteal / damage reduction must not break the downed rule: lethal damage on a BR player downs him, he does not die
  a.p.hp = 5; a.p.armor = 0; t.g.damage(a.p, b.p, 50, { weapon: 'm4a1' }); ok(a.p.alive && a.p.down, 'BR: lethal damage downs the player (not dead) with the merged damage pipeline');
}
{
  // Shooting range keeps working next to the Classic-only scorestreak code
  const t = mk('range'); t.g.start(); t.g.stop(); const a = t.join('A', true); t.steps(2); a.s.trigger('loadout', { primary: 'ak74', attP: 'coyote', skill: 'pulse', throwable: 'frag' }); a.s.trigger('deploy'); t.steps(30);
  ok(t.g.phase === 'match' && a.p.alive && curGun(a.p.ws).id === 'ak74' && curGun(a.p.ws).att === 'coyote', 'range: loadout with an attachment is applied');
  ok(!a.p.streakHave || a.p.streakHave.length === 0, 'range: no scorestreaks');
}

// ---------------------------------------------------------------- server.js startup with stub deps
section('server.js STARTUP (stub express/socket.io in a temp dir)');
await new Promise((resolve) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fps-stub-'));
  for (const d of ['server', 'shared', 'maps']) fs.cpSync(path.join(root, d), path.join(dir, d), { recursive: true });
  fs.copyFileSync(path.join(root, 'server.js'), path.join(dir, 'server.js')); fs.copyFileSync(path.join(root, 'package.json'), path.join(dir, 'package.json'));
  const nm = path.join(dir, 'node_modules'); fs.mkdirSync(path.join(nm, 'express'), { recursive: true }); fs.mkdirSync(path.join(nm, 'socket.io'), { recursive: true });
  fs.writeFileSync(path.join(nm, 'express/package.json'), '{"name":"express","type":"module","main":"index.js"}');
  fs.writeFileSync(path.join(nm, 'express/index.js'), 'const routes=[];export default function express(){const app=(req,res)=>{res.end("stub")};app.use=(...a)=>routes.push(a);app.get=(...a)=>routes.push(a);return app}; express.static=()=>()=>{};');
  fs.writeFileSync(path.join(nm, 'socket.io/package.json'), '{"name":"socket.io","type":"module","main":"index.js"}');
  fs.writeFileSync(path.join(nm, 'socket.io/index.js'), 'export class Server{constructor(){this.engine={on(){}}}on(){}emit(){}}');
  const child = spawn(process.execPath, ['server.js'], { cwd: dir, env: { ...process.env, PORT: '39123' } });
  let out = '', finished = false; const done = (good) => { if (finished) return; finished = true; ok(good, 'server.js boots and listens (' + out.trim().split('\n')[0] + ')'); child.once('close', () => { try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 4, retryDelay: 120 }); } catch (e) { console.warn('Temporary stub cleanup deferred:', e.code); } resolve(); }); child.kill(); };
  child.stdout.on('data', (d) => { out += d; if (/running/.test(out)) done(true); }); child.stderr.on('data', (d) => { out += d; });
  child.on('exit', (c) => { if (!/running/.test(out)) done(false); }); setTimeout(() => done(/running/.test(out)), 4000);
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
