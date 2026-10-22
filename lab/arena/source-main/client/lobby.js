// Waiting room UI (one per room kind): countdown, START (ready/total), team pick + mode/map votes (Classic), player list.
import { MODES, CLASSIC_MODES, BR_TEAMS, BR_TEAM_SIZE, BR_TEAM_NAMES, BR_SUBMODES } from '/shared/constants.js';
import { MAP_LIST } from '/maps/index.js';
import { esc } from './hud.js';
import { toast } from './devmode.js';
import { settings } from './settings.js';

const $ = (id) => document.getElementById(id);
const TITLES = { classic: 'CLASSIC', br: 'BATTLE ROYALE', zm: 'ZOMBIES' };
export class Lobby {
  constructor(net, cb) {
    this.net = net; this.cb = cb; this.state = null; this.myVote = {}; this.built = 'classic';
    this.mk($('mode-buttons'), CLASSIC_MODES.map(id => MODES[id]), (m) => `${m.name}<small>${m.desc}</small>`, 'mode');
    this.mk($('map-buttons'), MAP_LIST, (m) => m.name, 'map');
    document.querySelectorAll('.team-btn').forEach(b => b.addEventListener('click', () => net.emit('lobby:team', { team: b.dataset.team })));
    $('btn-start').addEventListener('click', () => net.emit('lobby:start'));
    $('btn-add-ai').addEventListener('click', () => net.emit('lobby:addai'));                // one AI player per click (Battle Royale)
    $('btn-lobby-loadout').addEventListener('click', () => cb.loadout());
    $('btn-lobby-leave').addEventListener('click', () => cb.leave());
    net.on('lobby', (s) => this.render(s));
    setInterval(() => this.tickTimer(), 250);
  }
  mk(box, items, fmt, key) {
    box.innerHTML = '';
    for (const it of items) {
      const b = document.createElement('button'); b.className = 'opt'; b.dataset.id = it.id; b.dataset.key = key; b.innerHTML = `${fmt(it)}<span class="cnt">0</span>`;
      b.addEventListener('click', () => { this.myVote[key] = it.id; this.net.emit('vote', { [key]: it.id }); this.markVotes(); });
      box.appendChild(b);
    }
  }
  markVotes() { document.querySelectorAll('#vote-col .opt').forEach(b => b.classList.toggle('sel', this.myVote[b.dataset.key] === b.dataset.id)); }
  tickTimer() {
    const s = this.state; if (!s) return; const t = $('lobby-timer');
    if (s.inProgress) t.textContent = 'LIVE'; else if (s.waitEnd == null) t.textContent = '—'; else t.textContent = Math.max(0, Math.ceil(s.waitEnd - this.net.serverNow()));
  }
  render(s) {
    const first = !this.state || this.state.kind !== s.kind; this.state = s;
    const classic = s.kind === 'classic', br = s.kind === 'br', me = s.players.find(p => p.id === this.net.id);
    if (br && this.built !== 'br') { this.mk($('mode-buttons'), Object.values(BR_SUBMODES), (m) => `${m.name}<small>${m.desc}</small>`, 'mode'); this.built = 'br'; this.myVote = {}; $('vote-mode-title').textContent = 'VOTE · BATTLE ROYALE MODE'; }
    else if (classic && this.built !== 'classic') { this.mk($('mode-buttons'), CLASSIC_MODES.map(id => MODES[id]), (m) => `${m.name}<small>${m.desc}</small>`, 'mode'); this.built = 'classic'; $('vote-mode-title').textContent = 'VOTE · GAME MODE'; }
    if (!s.inProgress && me && !me.ready && this.myVote.reset !== s.waitEnd) { /* keep votes */ }
    if (s.phase === 'waiting' && s.readyCount === 0 && first) this.myVote = {};
    const lb = document.querySelector('#screen-lobby .lobby'); lb.classList.toggle('solo-mode', !classic && !br); lb.classList.toggle('br-mode', br);
    $('lobby-title').textContent = `${TITLES[s.kind] || 'ROOM'} · WAITING ROOM`;
    $('lobby-host').textContent = s.inProgress ? (s.kind === 'classic' ? (s.phase === 'results' ? 'The match just ended — the waiting room opens in a few seconds.' : 'Joining the running match…') : 'A match is in progress — you will join the next one automatically.') : (s.kind === 'br' ? `Teams of up to ${BR_TEAM_SIZE} (4 teams). Pick a team and vote for Resurgence or Incursion. Starts when the timer ends or everyone presses START.` : s.kind === 'zm' ? 'Survive waves of zombies together. Starts when the timer ends or everyone is ready.' : 'Pick a team, vote for the next mode and map. The match starts when the timer ends or everyone is ready.');
    $('lobby-count').textContent = `(${s.players.length})`;
    const li = (p) => `<li class="${p.id === this.net.id ? 'me' : ''}"><span>${esc(p.name)}${p.bot ? ' <small class="ai">AI</small>' : ''}</span>${p.queued ? '<span class="q">NEXT MATCH</span>' : p.ready ? '<span class="rdy">READY</span>' : ''}</li>`;
    if (classic) for (const t of ['red', 'blue']) $('team-' + t).innerHTML = s.players.filter(p => p.team === t).map(li).join('');
    else if (br) for (const t of BR_TEAMS) {
      const list = s.players.filter(p => p.team === t && !p.queued), ul = $('team-' + t), head = ul.previousElementSibling; ul.innerHTML = list.map(li).join('');
      let tc = head.querySelector('.tc'); if (!tc) { tc = document.createElement('span'); tc.className = 'tc'; head.insertBefore(tc, head.querySelector('button')); }
      tc.textContent = `${list.length}/${BR_TEAM_SIZE}`; head.querySelector('button').disabled = list.length >= BR_TEAM_SIZE && !list.some(p => p.id === this.net.id);
    }
    else $('solo-list').innerHTML = s.players.map(li).join('');
    document.querySelectorAll('#vote-col .opt').forEach(b => { const tally = b.dataset.key === 'mode' ? s.votes.modes : s.votes.maps; b.querySelector('.cnt').textContent = tally[b.dataset.id] || 0; });
    this.markVotes();
    $('btn-add-ai').hidden = !(br || classic); $('btn-add-ai').disabled = s.inProgress || s.total >= (br ? BR_TEAMS.length * BR_TEAM_SIZE : 12);
    const btn = $('btn-start'); btn.textContent = s.inProgress ? 'IN PROGRESS' : `${me && me.ready ? 'READY ✓ ' : 'START '}(${s.readyCount}/${s.total})`;
    btn.disabled = s.inProgress; btn.classList.toggle('ready', !!(me && me.ready));
    $('lobby-note').textContent = settings.skill ? '' : 'Choose a SKILL in LOADOUT before you can start.';
    this.tickTimer(); this.cb.state && this.cb.state(s);
  }
  // Dev aid: verify that no other element covers the lobby controls (elementFromPoint).
  verifyClickable() {
    const bad = [];
    document.querySelectorAll('#screen-lobby button').forEach(b => {
      const r = b.getBoundingClientRect(); if (!r.width) return;
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      if (top !== b && !b.contains(top)) bad.push(`${b.id || b.textContent.trim()} covered by ${top && (top.id || top.className || top.tagName)}`);
    });
    if (bad.length) { console.warn('[UI] lobby controls not clickable:', bad); toast('UI WARNING: ' + bad[0]); } else console.log('[UI] lobby controls verified clickable');
    return bad;
  }
}
