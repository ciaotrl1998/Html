'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { randomInt } = require('node:crypto');
const { WebSocketServer, WebSocket } = require('ws');
const G = require('./js/game');
const Network = require('./js/network');

const root = __dirname;
const files = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/css/style.css', ['css/style.css', 'text/css; charset=utf-8']],
  ...['boot', 'runtime', 'game', 'network', 'art', 'autoplay', 'app'].map(name => [`/js/${name}.js`, [`js/${name}.js`, 'text/javascript; charset=utf-8']]),
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
  const participants = room => [room.host, room.guest].filter(Boolean);
  const ownerOf = socket => socket.role === 'host' ? 0 : 1;
  const isPaused = room => !room.guest || room.state.over || !room.state.selectedSkill || !room.state.partner.selectedSkill ||
    participants(room).some(socket => socket.paused || socket.hidden || socket.readyState !== WebSocket.OPEN);
  function capture(room) {
    for (const [key, seen, target] of [['effects', room.seenEffects, room.effects], ['projectiles', room.seenProjectiles, room.projectiles]]) {
      for (const item of room.state[key]) if (!seen.has(item)) {
        seen.add(item);
        if (key === 'effects' && item.type === 'income') continue;
        target.push({ ...item, visualId: ++room.visualId });
      }
    }
    room.events.push(...room.state.events.splice(0).filter(e => !e.text.startsWith('坊志达成')));
  }
  function publish(room, forceEconomy = false) {
    if (!room.state) return;
    capture(room);
    const s = room.state, frame = Network.delta(s, room.previous);
    const signature = JSON.stringify([s.day, s.kills, s.buildings.map(b => [b.id, b.type, b.level, b.owner])]);
    const correction = forceEconomy || signature !== room.economicSignature || s.elapsed - room.economyAt >= 2;
    if (correction) { room.economyAt = s.elapsed; room.economicSignature = signature; }
    room.previous = frame.next; room.seq++;
    for (const socket of participants(room)) {
      // A slow connection recovers from one checkpoint instead of queuing old motion frames.
      if (socket.bufferedAmount > 128000) { socket.needsSnapshot = true; continue; }
      if (socket.needsSnapshot) { checkpoint(socket); continue; }
      send(socket, { type: 'delta', session: room.session, seq: room.seq, ack: socket.lastAction,
        paused: isPaused(room), ...frame.message,
        ...(correction ? { economy: Network.economy(s, ownerOf(socket)) } : {}),
        effects: room.effects, projectiles: room.projectiles, events: room.events });
    }
    room.effects = []; room.projectiles = []; room.events = [];
  }
  function checkpoint(socket) {
    const room = socket.room;
    if (!room?.state) return;
    socket.needsSnapshot = false;
    send(socket, { type: 'snapshot', session: room.session, seq: room.seq, ack: socket.lastAction,
      snapshot: Network.snapshot(room.state, ownerOf(socket)), paused: isPaused(room) });
  }
  function start(room) {
    room.state = G.createCoopState(); room.started = true;
    room.session++; room.seq = 0; room.previous = Network.delta(room.state).next;
    room.effects = []; room.projectiles = []; room.events = [];
    room.seenEffects = new WeakSet(); room.seenProjectiles = new WeakSet(); room.visualId = 0;
    room.economyAt = room.state.elapsed; room.economicSignature = '';
    for (const socket of participants(room)) { socket.lastAction = 0; socket.paused = false; checkpoint(socket); }
  }
  function action(socket, message) {
    const room = socket.room, { id, kind, building, skill, x, y } = message;
    if (!room?.state || message.session !== room.session || !Number.isSafeInteger(id) || id <= socket.lastAction || id < 1 ||
        !['build', 'upgrade', 'bulk', 'demolish', 'skill', 'choose-skill'].includes(kind) ||
        !Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= G.worldWidth(room.state) || y >= G.worldHeight(room.state) ||
        (kind === 'build' && !Object.prototype.hasOwnProperty.call(G.DEFS, building)) ||
        (['skill', 'choose-skill'].includes(kind) && !Object.prototype.hasOwnProperty.call(G.SKILLS, skill))) return;
    const s = room.state, player = G.playerView(s, ownerOf(socket)), b = G.at(s, x, y);
    let result = { ok: false, reason: '无法操作该地块' };
    if (s.over) result.reason = '古坊已失守';
    else if (kind === 'choose-skill') result = G.chooseSkill(player, skill);
    else if (kind === 'skill') result = G.skill(player, skill);
    else if (kind === 'build') result = G.build(player, building, x, y);
    else if (b?.owner === ownerOf(socket)) {
      if (kind === 'upgrade') result = G.upgrade(player, b);
      else if (kind === 'bulk') result = G.bulkUpgrade(player, b);
      else if (kind === 'demolish') result = G.demolish(player, b);
    }
    socket.lastAction = id;
    publish(room, true);
    send(socket, { type: 'result', session: room.session, id, ok: !!result.ok, reason: result.reason || '' });
  }
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
      publish(room, true);
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
        const room = { code, host: socket, guest: null, started: false, session: 0 };
        rooms.set(code, room); socket.room = room; socket.role = 'host';
        socket.lastAction = 0; socket.paused = false; socket.hidden = false;
        send(socket, { type: 'created', code });
      } else if (message.type === 'join') {
        leave(socket);
        const code = String(message.code || '').trim(), room = rooms.get(code);
        if (!/^\d{6}$/.test(code) || !room || room.guest || room.host.readyState !== WebSocket.OPEN) {
          send(socket, { type: 'error', message: '房间不存在或人数已满' }); return;
        }
        room.guest = socket; socket.room = room; socket.role = 'guest';
        socket.lastAction = 0; socket.paused = false; socket.hidden = false;
        send(socket, { type: 'joined', code }); send(room.host, { type: 'peer_joined' });
        if (room.started) { checkpoint(socket); publish(room, true); }
      } else if (message.type === 'start' && socket.role === 'host' && socket.room?.guest) {
        start(socket.room);
      } else if (message.type === 'action') action(socket, message);
      else if (message.type === 'presence' && socket.room?.state && message.session === socket.room.session) {
        const paused = !!message.paused, hidden = !!message.hidden;
        if (paused !== socket.paused || hidden !== socket.hidden) {
          socket.paused = paused; socket.hidden = hidden; publish(socket.room, true);
        }
      } else if (message.type === 'resync') checkpoint(socket);
      else if (message.type === 'save' && socket.role === 'host' && socket.room?.state) {
        send(socket, { type: 'saved', snapshot: G.serialize(socket.room.state), export: !!message.export });
      }
    });
    socket.on('close', () => leave(socket));
    socket.on('error', () => leave(socket));
  });
  let lastTick = performance.now(), broadcastClock = 0;
  const simulation = setInterval(() => {
    const now = performance.now(), dt = Math.min(.5, (now - lastTick) / 1000);
    lastTick = now; broadcastClock += dt;
    const broadcast = broadcastClock >= .1;
    if (broadcast) broadcastClock = 0;
    for (const room of rooms.values()) if (room.state) {
      const running = !isPaused(room);
      if (running) {
        let remaining = dt;
        while (remaining > 1e-8 && !room.state.over) {
          const tick = Math.min(.05, remaining); G.step(room.state, tick); capture(room); remaining -= tick;
        }
      }
      if (broadcast && (running || room.events.length || room.effects.length || room.projectiles.length || room.host.needsSnapshot || room.guest?.needsSnapshot)) publish(room);
    }
  }, 50);
  simulation.unref();
  const heartbeat = setInterval(() => {
    for (const socket of sockets.clients) {
      if (!socket.alive) { socket.terminate(); continue; }
      socket.alive = false; socket.ping();
    }
  }, 5000);
  heartbeat.unref();
  sockets.on('close', () => { clearInterval(heartbeat); clearInterval(simulation); });
  return { server, sockets, rooms, publish, close: () => new Promise(resolve => { clearInterval(heartbeat); clearInterval(simulation); for (const socket of sockets.clients) socket.terminate(); sockets.close(() => server.close(resolve)); }) };
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
