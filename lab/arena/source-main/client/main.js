// Bootstrap + screen state machine + render loop.
// Flow:  MENU -> (CLASSIC | BATTLE ROYALE | ZOMBIES) -> name + JOIN -> WAITING ROOM -> match -> results -> WAITING ROOM -> ...
import * as THREE from 'three';
import { MODES } from '/shared/constants.js';
import { WEAPONS } from '/shared/weapons.js';
import { MAPS } from '/maps/index.js';
import { settings, saveSettings, attOf } from './settings.js';
import { preloadAll } from './assets.js';
import { Net } from './network.js';
import { Input } from './input.js';
import { HUD, esc } from './hud.js';
import { MenuScene } from './menuscene.js';
import { Game } from './game.js';
import { Lobby } from './lobby.js';
import { Loadout } from './loadout.js';
import { DevMode, toast } from './devmode.js';
import { Audio } from './audio.js';
import { SKILLS } from '/shared/skills.js';

const $ = (id) => document.getElementById(id);
const canvas = $('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setSize(innerWidth, innerHeight, false);

if (!WEAPONS[settings.primary] || WEAPONS[settings.primary].cat === 'Pistol') settings.primary = 'm4a1';        // saved loadout may reference a renamed weapon (e.g. ak47 -> akm)
if (!WEAPONS[settings.secondary] || WEAPONS[settings.secondary].cat !== 'Pistol') settings.secondary = 'makarov';
saveSettings();
const net = new Net(), input = new Input(canvas), hud = new HUD(), menu = new MenuScene(), game = new Game(net, input, hud), dev = new DevMode(input, net);
let screen = 'menu', loadout = null, lobby = null, myTeamGuess = 'red', nameMap = new Map(), roomKind = 'classic', returnTo = 'menu', loadoutFromGame = false;
const ROOM_NAMES = { classic: 'CLASSIC', br: 'BATTLE ROYALE', zm: 'ZOMBIES', range: 'SHOOTING RANGE' };

// ------------------------------------------------------------------ screens
function show(name) {
  screen = name;
  document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === 'screen-' + name));
  const inMatch = name === 'game';
  hud.show(inMatch); input.enabled = inMatch;
  if (!inMatch) input.unlock();
  if (name === 'loadout') loadout && loadout.open(); else loadout && loadout.close();
  if (name === 'lobby') setTimeout(() => lobby && lobby.verifyClickable(), 60);
}
const showMenuMap = (id) => menu.setMap(MAPS[id] || MAPS.arena);

// ------------------------------------------------------------------ boot
async function boot() {
  try {
    menu.setMap(MAPS.arena);
    const first = [settings.primary, settings.secondary, 'm4a1', 'makarov', 'laser_rifle'];                 // what the player needs right now
    await preloadAll((d, n, id) => { $('ld-fill').style.width = (d / n * 100) + '%'; $('ld-text').textContent = `Loading weapons ${d}/${n} · ${WEAPONS[id].name}`; }, first);
    const rest = Object.keys(WEAPONS).filter(i => !WEAPONS[i].unarmed && !first.includes(i));
    preloadAll((d, n) => { if (d === n) toast(`All ${n + first.length} weapon models loaded`, 2500); }, rest);   // streams in the background
    loadout = new Loadout(() => net.emit('loadout', loadoutPayload()));
    lobby = new Lobby(net, { loadout: () => openLoadout('lobby'), leave: leave, state: onLobby });
    dev.refresh(); updateDevBtn();
    $('loading').classList.add('done'); show('menu');
    console.log('[BOOT] ready');
  } catch (e) { console.error(e); $('ld-text').textContent = 'Startup error: ' + e.message; }
}
// every waiting-room update: keep names, menu map, and bring players back to the waiting room after a match
function onLobby(s) {
  nameMap = new Map(s.players.map(p => [p.id, p.name])); game.names = nameMap;
  const me = s.players.find(p => p.id === net.id); if (me) myTeamGuess = me.team;
  showMenuMap(s.config.map);
  if (s.phase === 'waiting' && (screen === 'results' || screen === 'game' || (screen === 'loadout' && loadoutFromGame))) { game.stop(); loadoutButtons(false); show('lobby'); }
}

// ------------------------------------------------------------------ menu
const loadoutPayload = () => ({ primary: settings.primary, secondary: settings.secondary, skill: settings.skill || null, throwable: settings.throwable, attP: attOf(settings.primary), attS: attOf(settings.secondary), streaks: settings.streaks || [] });
function loadoutButtons(inGame) { loadoutFromGame = inGame; $('btn-deploy').hidden = !inGame; $('btn-loadout-back').hidden = inGame; }
function openLoadout(from) { returnTo = from; loadoutButtons(false); loadout.setWeaponsAllowed(from !== 'lobby' || roomKind === 'classic'); show('loadout'); }
// dead + waiting to respawn (Classic): E opens the loadout WITHOUT respawning; the server holds the respawn until DEPLOY (button or Space)
function openLoadoutInGame() { if (screen !== 'game' || !game.canLoadout()) return; loadoutButtons(true); loadout.setWeaponsAllowed(roomKind === 'classic' || roomKind === 'range'); net.emit('loadout:open'); show('loadout'); }
// SHOOTING RANGE: button in the loadout screen -> leave any room, join the shared range room (no PvP; E changes the loadout even while alive)
$('btn-range').addEventListener('click', async () => {
  Audio.unlock(); const name = settings.name || 'Player'; toast('Entering the shooting range…', 1500);
  try {
    loadoutButtons(false); net.disconnect(); game.stop(); roomKind = 'range';
    await net.connect(name, 'range'); net.emit('loadout', loadoutPayload()); $('btn-lobby-loadout').style.display = '';
  } catch (e) { toast(e.message, 3500); leave(); }
});
function deploy() { if (!loadoutFromGame) return; loadoutButtons(false); net.emit('loadout', loadoutPayload()); net.emit('deploy'); show('game'); toast('CLICK TO CAPTURE MOUSE', 1800); }
$('btn-deploy').addEventListener('click', deploy);
addEventListener('keydown', (e) => {
  if (e.code === 'KeyE' && !e.repeat && screen === 'game') openLoadoutInGame();
  else if (e.code === 'Space' && screen === 'loadout' && loadoutFromGame) { e.preventDefault(); if (document.activeElement) document.activeElement.blur(); deploy(); }
});
addEventListener('keyup', (e) => { if (e.code === 'Space' && loadoutFromGame) e.preventDefault(); });
function updateDevBtn() { $('btn-dev').textContent = 'DEV MODE: ' + (settings.dev ? 'ON' : 'OFF'); dev.refresh(); }
function leave() { loadoutButtons(false); net.disconnect(); game.stop(); hud.show(false); show('menu'); }
$('menu-buttons').addEventListener('click', (e) => {
  const b = e.target.closest('.mbtn'); if (!b) return; Audio.ui();
  const a = b.dataset.action;
  if (a === 'classic' || a === 'br' || a === 'zm') { roomKind = a; $('join-mode').textContent = ROOM_NAMES[a] + ' · ENTER THE ROOM'; $('join-panel').hidden = false; $('in-name').value = settings.name || ''; $('in-name').focus(); }
  else if (a === 'loadout') openLoadout('menu');
  else if (a === 'dev') { dev.toggle(); updateDevBtn(); toast('DEV MODE ' + (settings.dev ? 'ON' : 'OFF')); }
  else if (a === 'settings') show('settings');
});
document.querySelectorAll('#menu-buttons .mbtn').forEach(b => b.addEventListener('mouseenter', () => { document.querySelectorAll('#menu-buttons .mbtn').forEach(x => x.classList.remove('sel')); b.classList.add('sel'); }));
addEventListener('keydown', (e) => {
  if (screen !== 'menu' || e.target.tagName === 'INPUT') return;
  const bs = [...document.querySelectorAll('#menu-buttons .mbtn')]; let i = bs.findIndex(b => b.classList.contains('sel'));
  if (e.code === 'ArrowDown') i = (i + 1) % bs.length; else if (e.code === 'ArrowUp') i = (i - 1 + bs.length) % bs.length; else if (e.code === 'Enter' && i >= 0) return bs[i].click(); else return;
  bs.forEach(b => b.classList.remove('sel')); bs[i].classList.add('sel');
});
$('btn-join-back').addEventListener('click', () => { $('join-panel').hidden = true; $('join-status').textContent = ''; });
$('in-name').addEventListener('keydown', (e) => { if (e.code === 'Enter') $('btn-join').click(); e.stopPropagation(); });
$('btn-join').addEventListener('click', async () => {
  const name = $('in-name').value.trim() || 'Player'; settings.name = name; saveSettings(); Audio.unlock();
  Audio.preloadFiles([SKILLS.kupi.audio, SKILLS.kupi.deathAudio], (u) => toast('Missing audio file: ' + u, 5000));      // Iphone Kupi sound files (assets/audio)
  $('join-status').textContent = 'Connecting…';
  try {
    await net.connect(name, roomKind);
    net.emit('loadout', loadoutPayload());
    $('btn-lobby-loadout').style.display = '';
    $('join-status').textContent = ''; $('join-panel').hidden = true; show('lobby');
  } catch (e) { $('join-status').textContent = e.message; }
});
$('btn-loadout-back').addEventListener('click', () => show(returnTo === 'lobby' && net.connected ? 'lobby' : 'menu'));
$('btn-settings-back').addEventListener('click', () => show('menu'));

// ------------------------------------------------------------------ settings
for (const [id, key, fmt] of [['s-sens', 'sens', (v) => (+v).toFixed(2)], ['s-fov', 'fov', (v) => Math.round(v)], ['s-volume', 'volume', (v) => Math.round(v * 100) + '%'], ['s-shake', 'shake', (v) => Math.round(v * 100) + '%']]) {
  const el = $(id), out = $('v-' + id.slice(2)); el.value = settings[key]; out.textContent = fmt(settings[key]);
  el.addEventListener('input', () => { settings[key] = +el.value; out.textContent = fmt(el.value); saveSettings(); });
}
$('s-reduced').checked = settings.reduced; $('s-reduced').addEventListener('change', (e) => { settings.reduced = e.target.checked; saveSettings(); });

// ------------------------------------------------------------------ network -> screens
net.on('match:start', (info) => { loadoutButtons(false); input.leanOnE = roomKind !== 'range'; game.names = nameMap; try { game.start(info); } catch (e) { console.error('[MATCH START]', e); toast('Match start error: ' + e.message, 6000); } show('game'); toast('CLICK TO CAPTURE MOUSE', 2500); });
let resultsTimer = 0;
function showResults(r) {
  const me = r.scoreboard.find(p => p.id === net.id), team = me ? me.team : myTeamGuess, rk = r.ranking;
  const sc = document.querySelector('#screen-results .res-scores');
  if (rk) {                                                              // Battle Royale / Zombies: placement list
    const mine = rk.find(p => p.id === net.id);
    $('res-title').textContent = r.kind === 'br' ? (mine && mine.place === 1 ? 'VICTORY' : `PLACED #${mine ? mine.place : '?'}`) : (r.reason.match(/wave (\d+)/i) ? `WAVE ${r.reason.match(/wave (\d+)/i)[1]} REACHED` : 'GAME OVER');
    $('res-title').style.color = mine && mine.place === 1 && r.kind === 'br' ? '#ffd400' : '#fff';
    $('res-reason').textContent = `${r.reason} · ${MODES[r.mode].name} · ${MAPS[r.map].name}`; sc.style.display = 'none';
    $('res-board').innerHTML = `<tr><th>${r.kind === 'br' ? 'PLACE' : '#'}</th><th>PLAYER</th><th class="sc-col">SCORE</th><th>KILLS</th></tr>` + rk.map(p => `<tr class="${p.id === net.id ? 'me' : ''}"><td class="n">#${p.place}</td><td class="${p.team || ''}">${esc(p.name)}</td><td class="n sc-col">${p.s || 0}</td><td class="n">${p.k}</td></tr>`).join('');
  } else {
    sc.style.display = '';
    $('res-title').textContent = r.winner === team ? 'VICTORY' : 'DEFEAT'; $('res-title').style.color = r.winner === team ? '#ffd400' : '#ff5a5a';
    $('res-reason').textContent = `${r.reason} · ${MODES[r.mode].name} · ${MAPS[r.map].name}`;
    $('res-red').textContent = r.summary.red; $('res-blue').textContent = r.summary.blue;
    const rows = (t) => r.scoreboard.filter(p => p.team === t).sort((a, b) => (b.s || 0) - (a.s || 0) || b.k - a.k).map(p => `<tr><td class="${t}">${esc(p.name)}</td><td class="n sc-col">${p.s || 0}</td><td class="n">${p.k}</td><td class="n">${p.d}</td></tr>`).join('');
    $('res-board').innerHTML = `<tr><th>PLAYER</th><th class="sc-col">SCORE</th><th>K</th><th>D</th></tr>${rows('red')}${rows('blue')}`;
  }
  Audio.stopKupi(); loadoutButtons(false); hud.show(false); hud.clearOverlay(); input.enabled = false; input.unlock(); show('results');
}
// Battle Royale: the winner sees VICTORY and the runner-up #2 (all other HUD hidden) for 3 s before the scoreboard
net.on('match:end', (r) => {
  clearTimeout(resultsTimer);
  const mine = r.kind === 'br' && r.ranking && r.ranking.find(p => p.id === net.id);
  if (mine && mine.place <= 2 && screen === 'game') { hud.overlay(mine.place === 1 ? 'VICTORY' : '#2', mine.place === 1 ? '#ffd400' : '#ffffff', 3000, r.reason); resultsTimer = setTimeout(() => showResults(r), 3000); }
  else if (r.kind === 'classic' && screen === 'game' && r.winner) {                       // Classic: the HUD disappears, VICTORY / DEFEAT shows for 3 s, then the leaderboard
    const won = r.winner === myTeamGuess; hud.overlay(won ? 'VICTORY' : 'DEFEAT', won ? '#ffd400' : '#ff4a4a', 3000, r.reason); resultsTimer = setTimeout(() => showResults(r), 3000);
  }
  else showResults(r);
});
net.on('hit', (d) => game.onHit(d)); net.on('dmg', (d) => game.onDmg(d)); net.on('kill', (d) => game.onKill(d)); net.on('announce', (d) => game.onAnnounce(d)); net.on('shot', (d) => game.onShot(d));
net.on('ents', (d) => game.onEnts(d)); net.on('score', (d) => game.onScore(d));
net.on('skill', (d) => game.onSkill(d)); net.on('throw', (d) => game.onThrow(d)); net.on('boom', (d) => game.onBoom(d)); net.on('pulse', (d) => game.onPulse(d));
net.on('lobby:denied', (d) => toast(d.reason || 'Not allowed', 2500)); net.on('place', (d) => game.onPlace(d));
net.on('kupi', (d) => game.onKupi(d)); net.on('kupi:death', (d) => game.onKupiDeath(d)); net.on('dsr', (d) => game.onDsr(d));
net.on('streak:ready', (d) => game.onStreakReady(d)); net.on('streak:use', (d) => game.onStreakUse(d)); net.on('uav:ping', (d) => game.onUavPing(d)); net.on('emp', (d) => game.onEmp(d));
net.on('odin:start', (d) => game.onOdinStart(d)); net.on('odin:boom', (d) => game.onOdinBoom(d)); net.on('trophy', (d) => game.onTrophy(d)); net.on('melee', (d) => game.onMelee(d));
net.on('disconnect', () => { if (screen !== 'menu') { toast('Disconnected from server', 3000); leave(); } });
addEventListener('keydown', (e) => { if (e.code === 'KeyM' && screen === 'game' && !input.locked) leave(); });
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight, false); game.rig.resize(innerWidth, innerHeight); menu.resize(innerWidth, innerHeight); });

// ------------------------------------------------------------------ render loop
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);                                   // schedule first: one bad frame must never kill the whole loop
  try { frameBody(now); } catch (e) { if (!frame.warned) { frame.warned = true; console.error('[FRAME]', e); toast('Render error: ' + e.message, 6000); } }
}
function frameBody(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  const inLoadoutMatch = screen === 'loadout' && loadoutFromGame;
  if (screen === 'game' || screen === 'results' || inLoadoutMatch) {
    if (game.running) {
      game.frame(dt, screen === 'game', screen === 'game' && !input.locked);
      renderer.render(game.scene, game.rig.camera);
    }
    if (screen === 'game') dev.update(dt, game);
  } else { menu.update(dt); renderer.render(menu.scene, menu.camera); }
}
requestAnimationFrame(frame);
boot();
