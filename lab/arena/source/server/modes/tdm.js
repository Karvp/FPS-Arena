import { Mode } from './base.js';
import { TDM } from '../../shared/constants.js';

export class TeamDeathmatch extends Mode {
  constructor(game) { super(game); this.id = 'tdm'; this.scores = { red: 0, blue: 0 }; }
  start() { for (const p of this.game.players.values()) this.game.spawnPlayer(p); }
  spawnPoint(p) { return this.safeSpawn(this.game.map.spawns[p.team], p); }   // random spawn in own compound
  onKill(k, v) {
    if (!k || k === v || k.team === v.team) return;
    this.scores[k.team]++;
    if (this.scores[k.team] >= TDM.killsToWin) this.game.endMatch(k.team, `${k.team.toUpperCase()} reached ${TDM.killsToWin} kills`);
  }
  state() { return { type: 'tdm', scores: this.scores, target: TDM.killsToWin }; }
  summary() { return { red: this.scores.red, blue: this.scores.blue, label: 'Kills' }; }
}
