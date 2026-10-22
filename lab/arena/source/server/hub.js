// One room per game type. A socket's first `join` {name, room: 'classic' | 'br' | 'zm'} decides which room it belongs to.
import { Game } from './game.js';
export class Hub {
  constructor(io) { this.io = io; this.rooms = { classic: new Game(io, 'classic'), br: new Game(io, 'br'), zm: new Game(io, 'zm') }; }
  start() { for (const r of Object.values(this.rooms)) r.start(); }
  attach(socket) {
    socket.once('join', (d, cb) => { const kind = d && this.rooms[d.room] ? d.room : 'classic'; this.rooms[kind].attach(socket, d, cb); });
  }
}
