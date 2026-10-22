// Entry point: Express serves the client + assets, Socket.IO carries the game, server/game.js simulates it.
import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import { Hub } from './server/hub.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

const app = express();
const server = http.createServer(app);
const io = new Server(server, { transports: ['websocket', 'polling'], cors: { origin: true } });

app.use('/vendor/three', express.static(path.join(__dirname, 'node_modules/three')));   // Three.js + addons from npm
app.use('/assets', express.static(path.join(__dirname, 'assets'), { maxAge: '1h' }));
app.use('/shared', express.static(path.join(__dirname, 'shared')));                        // same code as the server
app.use('/maps', express.static(path.join(__dirname, 'maps')));                            // same maps as the server
app.use('/client', express.static(path.join(__dirname, 'client')));
app.get('/', (_req, res) => res.sendFile(path.join(__dirname, 'client/index.html')));
app.get('/health', (_req, res) => res.json({ ok: true }));

const hub = new Hub(io);
io.on('connection', (socket) => hub.attach(socket));
io.engine.on('connection_error', (e) => console.warn('[socket.io] connection error:', e.message));
hub.start();

server.listen(PORT, () => console.log(`FPS ARENA running:  http://localhost:${PORT}/`));
process.on('unhandledRejection', (e) => console.error('[server] unhandled rejection:', e));
