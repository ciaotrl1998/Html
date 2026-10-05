'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { randomInt } = require('node:crypto');
const { WebSocketServer, WebSocket } = require('ws');

const root = __dirname;
const files = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/css/style.css', ['css/style.css', 'text/css; charset=utf-8']],
  ...['boot', 'runtime', 'game', 'art', 'autoplay', 'app'].map(name => [`/js/${name}.js`, [`js/${name}.js`, 'text/javascript; charset=utf-8']]),
  ['/dist/古坊奇谭.html', ['dist/古坊奇谭.html', 'text/html; charset=utf-8']]
]);

function createServer() {
  const rooms = new Map();
  const server = http.createServer((req, res) => {
    let pathname;
    try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
    catch { res.writeHead(400); res.end(); return; }
    const file = files.get(pathname);
    if (req.method !== 'GET' || !file) { res.writeHead(404); res.end(); return; }
    fs.readFile(path.join(root, file[0]), (error, body) => {
      if (error) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': file[1], 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      res.end(body);
    });
  });
  const sockets = new WebSocketServer({ server, path: '/ws', maxPayload: 1024 * 1024, perMessageDeflate: false });
  const send = (socket, message) => { if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message)); };
  const leave = socket => {
    const room = socket.room;
    if (!room) return;
    socket.room = null;
    if (socket.role === 'host') {
      rooms.delete(room.code);
      send(room.guest, { type: 'host_left' });
      if (room.guest) room.guest.room = null;
    } else if (room.guest === socket) {
      room.guest = null;
      send(room.host, { type: 'peer_left' });
    }
    socket.role = null;
  };
  sockets.on('connection', socket => {
    socket.alive = true;
    socket.on('pong', () => { socket.alive = true; });
    socket.on('message', raw => {
      let message;
      try { message = JSON.parse(String(raw)); }
      catch { send(socket, { type: 'error', message: '消息格式无效' }); return; }
      if (!message || typeof message !== 'object' || typeof message.type !== 'string') return;
      if (message.type === 'create') {
        leave(socket);
        let code;
        do { code = String(randomInt(100000, 1000000)); } while (rooms.has(code));
        const room = { code, host: socket, guest: null, started: false };
        rooms.set(code, room); socket.room = room; socket.role = 'host';
        send(socket, { type: 'created', code });
      } else if (message.type === 'join') {
        leave(socket);
        const code = String(message.code || '').trim(), room = rooms.get(code);
        if (!/^\d{6}$/.test(code) || !room || room.guest || room.host.readyState !== WebSocket.OPEN) {
          send(socket, { type: 'error', message: '房间不存在或人数已满' }); return;
        }
        room.guest = socket; socket.room = room; socket.role = 'guest';
        send(socket, { type: 'joined', code }); send(room.host, { type: 'peer_joined' });
        if (room.started) send(socket, { type: 'started' });
      } else if (message.type === 'start' && socket.role === 'host' && socket.room?.guest) {
        socket.room.started = true;
        send(socket.room.guest, { type: 'started' });
      } else if (message.type === 'state' && socket.role === 'host' && socket.room?.started && typeof message.snapshot === 'string' && message.snapshot.length < 800000) {
        send(socket.room.guest, { type: 'state', snapshot: message.snapshot, paused: !!message.paused, visuals: message.visuals });
      } else if (message.type === 'action' && socket.role === 'guest' && socket.room?.started) {
        const { id, kind, building, skill, x, y } = message;
        if (!Number.isSafeInteger(id) || !['build', 'upgrade', 'bulk', 'demolish', 'skill'].includes(kind) ||
            !Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x > 49 || y > 49 ||
            (kind === 'build' && (typeof building !== 'string' || building.length > 30)) ||
            (kind === 'skill' && (typeof skill !== 'string' || skill.length > 20))) return;
        send(socket.room.host, { type: 'action', id, kind, building, skill, x, y });
      } else if (message.type === 'result' && socket.role === 'host' && socket.room?.started && Number.isSafeInteger(message.id)) {
        send(socket.room.guest, { type: 'result', id: message.id, ok: !!message.ok, reason: String(message.reason || '').slice(0, 120) });
      }
    });
    socket.on('close', () => leave(socket));
    socket.on('error', () => leave(socket));
  });
  const heartbeat = setInterval(() => {
    for (const socket of sockets.clients) {
      if (!socket.alive) { socket.terminate(); continue; }
      socket.alive = false; socket.ping();
    }
  }, 5000);
  heartbeat.unref();
  sockets.on('close', () => clearInterval(heartbeat));
  return { server, sockets, rooms, close: () => new Promise(resolve => { clearInterval(heartbeat); for (const socket of sockets.clients) socket.terminate(); sockets.close(() => server.close(resolve)); }) };
}

if (require.main === module) {
  const port = Number(process.env.PORT || 8787), instance = createServer();
  instance.server.listen(port, '0.0.0.0', () => {
    console.log('古坊奇谭联机服务已启动');
    console.log(`本机： http://127.0.0.1:${port}`);
    for (const addresses of Object.values(os.networkInterfaces())) for (const address of addresses || []) {
      if (address.family === 'IPv4' && !address.internal) console.log(`局域网： http://${address.address}:${port}`);
    }
  });
}
module.exports = { createServer };
