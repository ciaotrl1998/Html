import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, randomInt, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { networkInterfaces } from 'node:os';
import { WebSocketServer, WebSocket } from 'ws';
import { PokerHand, shuffledDeck } from '../shared/poker.js';
import { chooseBotAction, createBotPersonalities } from './bot.js';
import { sceneStore, handleSceneRequest } from './scene-store.js';
import { DEAL_TIMING, OPENING_TIMING, dealDuration } from '../shared/deal-timing.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const DEFAULTS = { startingChips: 2000, smallBlind: 10, ante: 0, raiseEvery: 0, actionSeconds: 30, difficulty: 'normal' };
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.png': 'image/png' };
const cleanName = (value, fallback) => String(value || '').replace(/[\x00-\x1f<>]/g, '').trim().slice(0, 20) || fallback;
const fail = message => { throw new Error(message); };
const send = (ws, data) => { if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data)); };
function config(input = {}) {
  const c = { ...DEFAULTS, ...Object.fromEntries(Object.keys(DEFAULTS).filter(k => k in input).map(k => [k, input[k]])) };
  for (const [key, min, max] of [['startingChips', 20, 1000000], ['smallBlind', 1, 10000], ['ante', 0, 10000]]) {
    if (!Number.isSafeInteger(c[key]) || c[key] < min || c[key] > max) fail('筹码与盲注需为有效范围内的整数');
  }
  if (c.startingChips < c.ante + c.smallBlind * 2) fail('初始筹码需至少覆盖前注和大盲');
  if (![0, 5, 10, 20].includes(c.raiseEvery)) fail('升盲间隔无效');
  if (![0, 15, 30, 60].includes(c.actionSeconds)) fail('行动时间无效');
  if (!['easy', 'normal', 'hard'].includes(c.difficulty)) fail('电脑难度无效');
  return c;
}

export function createPokerServer({ botDelay = null, nextDelay = 6500, dealDelay = null, openingDelay = OPENING_TIMING.duration, phaseDelay = DEAL_TIMING.pause, layoutFile = path.join(ROOT, 'client/scene-layout.js') } = {}) {
  const rooms = new Map(), sessions = new Map();
  const layouts = sceneStore(layoutFile);
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, rooms: rooms.size, sceneEditor: true, dealingPhase: true })); return;
      }
      if (url.pathname === '/api/scene-layout') { await handleSceneRequest(req, res, layouts); return; }
      let relative = decodeURIComponent(url.pathname).replace(/^\//, '') || 'index.html';
      relative = relative.replace(/\/{2,}/g, '/');
      if (relative === 'editor' || relative === 'editor.html') relative = 'client/editor.html';
      if (relative === 'vendor/three.js') relative = 'client/vendor/three.module.min.js';
      if (relative === 'vendor/three.core.js' || relative === 'vendor/three.core.min.js') relative = 'client/vendor/three.core.min.js';
      if (relative === 'vendor/OrbitControls.js') relative = 'node_modules/three/examples/jsm/controls/OrbitControls.js';
      if (relative === 'vendor/TransformControls.js') relative = 'node_modules/three/examples/jsm/controls/TransformControls.js';
      const allowed = /^client\/assets\/cards\/(?:[0-9]{2}|back|display)\.png$/.test(relative) || relative === 'index.html' || relative === 'client/editor.html' || /^(client|shared)\/[\w./-]+\.(js|css|svg)$/.test(relative) || /^node_modules\/three\/build\/three\.(module|core)\.js$/.test(relative) || /^node_modules\/three\/examples\/jsm\/controls\/(OrbitControls|TransformControls)\.js$/.test(relative);
      const full = path.resolve(ROOT, relative);
      if (!allowed || !full.startsWith(ROOT) || relative.includes('..')) { res.writeHead(404); res.end('Not found'); return; }
      let file;
      if (relative === 'client/scene-layout.js') {
        // This is a required scene module. A missing save must fail visibly,
        // instead of silently replacing the edited scene with prototype values.
        file = await readFile(layoutFile);
      } else file = await readFile(full);
      if (relative.startsWith('node_modules/three/examples/')) file = file.toString().replace("from 'three'", "from '/vendor/three.js'");
      res.writeHead(200, { 'Content-Type': MIME[path.extname(full)] || 'application/octet-stream',
        'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' ws: wss:; font-src 'self'; frame-ancestors 'self'", 'Referrer-Policy': 'same-origin' });
      res.end(file);
    } catch { res.writeHead(404); res.end('Not found'); }
  });
  const wss = new WebSocketServer({ noServer: true, maxPayload: 8192 });
  server.on('upgrade', (req, socket, head) => {
    try {
      if (new URL(req.url, 'http://localhost').pathname !== '/ws') { socket.destroy(); return; }
      if (req.headers.origin && new URL(req.headers.origin).host !== req.headers.host) { socket.destroy(); return; }
      wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req));
    } catch { socket.destroy(); }
  });
  function view(room, session) {
    const hand = room.hand?.snapshot(session.id) || null;
    if (hand && room.dealing) {
      // Blind/ante all-ins can settle inside the rules engine immediately.
      // Keep the public pre-settlement balances until the cards have landed.
      if (hand.done) for (const player of hand.players) {
        const refund = hand.result.refund?.id === player.id ? hand.result.refund.amount : 0;
        const awards = hand.result.pots.flatMap(pot => pot.awards).filter(award => award.id === player.id).reduce((sum, award) => sum + award.amount, 0);
        player.chips -= awards + refund; player.total += refund;
      }
      hand.pot = hand.players.reduce((sum, player) => sum + player.total, 0);
      hand.board = hand.board.slice(0, room.visibleBoard ?? hand.board.length);
      hand.street = ['preflop', 'preflop', 'preflop', 'flop', 'turn', 'river'][hand.board.length];
      hand.actor = null; hand.legal = null; hand.done = false; hand.result = null;
      for (const player of hand.players) if (player.id !== session.id) player.cards = [null, null];
    }
    if (hand && room.opening) {
      const { stage } = room.opening;
      for (const player of hand.players) {
        const initial = room.openingPlayers.find(entry => entry.id === player.id);
        const ante = stage === 'markers' ? 0 : initial.ante;
        const blind = stage === 'bigBlind' || stage === 'smallBlind' && player.seat === hand.sbSeat ? initial.blind : 0;
        player.chips = initial.chips - ante - blind; player.total = ante + blind; player.bet = blind;
        player.action = player.chips === 0 ? '全下' : blind ? player.seat === hand.sbSeat ? '小盲' : '大盲' : '';
        player.cards = [null, null];
      }
      hand.board = []; hand.street = 'preflop';
      hand.pot = hand.players.reduce((sum, player) => sum + player.total, 0);
      hand.currentBet = Math.max(0, ...hand.players.map(player => player.bet));
    }
    return { type: 'state', you: session.id, room: { code: room.code, name: room.name, hostId: room.hostId,
      phase: room.phase, config: room.config, version: room.version, handNumber: room.handNumber,
      deadline: room.deadline, turnDuration: room.turnDuration ?? null, serverTime: Date.now(), turnId: room.turnId, stopAfterHand: room.stopAfterHand,
      dealing: !!room.dealing, settling: !!room.settling, opening: room.opening || null, deal: room.deal || null, finishing: !!room.finishing, resultDuration: nextDelay,
      seats: room.seats.map((s, seat) => ({ ...s, seat, connected: s.kind === 'human' ? !!sessions.get(s.id)?.ws : true,
        chips: room.players?.find(p => p.id === s.id)?.chips ?? null })),
      members: [...room.members].map(id => { const s = sessions.get(id); return { id, name: s?.name, connected: !!s?.ws }; }),
      hand,
      standings: room.phase === 'finished' ? standings(room) : null } };
  }
  function standings(room) {
    const sorted = [...(room.players || [])].sort((a, b) => b.chips - a.chips || (b.eliminatedAt || Infinity) - (a.eliminatedAt || Infinity) || (b.beforeBust || 0) - (a.beforeBust || 0));
    let previousKey = '', rank = 0;
    return sorted.map((p, i) => {
      const key = p.chips > 0 ? `live:${p.chips}` : `out:${p.eliminatedAt}:${p.beforeBust}`;
      if (key !== previousKey) rank = i + 1;
      previousKey = key;
      return { id: p.id, name: p.name, seat: p.seat, chips: p.chips, rank };
    });
  }
  function broadcast(room) {
    room.version++;
    room.touched = Date.now();
    for (const id of room.members) { const s = sessions.get(id); if (s) send(s.ws, view(room, s)); }
  }
  function clearRoomTimer(room) { clearTimeout(room.timer); room.timer = null; room.deadline = null; room.turnDuration = null; }
  function finish(room) {
    clearRoomTimer(room); room.opening = null; room.openingPlayers = null; room.dealing = false; room.finishing = false; room.phase = 'finished'; room.turnId = null; room.stopAfterHand = false; broadcast(room);
  }
  function beginOpening(room) {
    if (openingDelay <= 0) { beginDealing(room, true); return; }
    clearRoomTimer(room);
    const startedAt = Date.now(), third = openingDelay / 3;
    room.opening = { hand: room.handNumber, stage: 'markers', startedAt,
      smallBlindAt: startedAt + third, bigBlindAt: startedAt + third * 2, endsAt: startedAt + openingDelay };
    room.openingPlayers = room.players.filter(player => player.chips > 0).map(player => {
      const ante = Math.min(room.config.ante, player.chips);
      const blind = player.seat === room.hand.sbSeat ? room.hand.smallBlind : player.seat === room.hand.bbSeat ? room.hand.bigBlind : 0;
      return { id: player.id, chips: player.chips, ante, blind: Math.min(blind, player.chips - ante) };
    });
    room.dealing = true; room.settling = false; room.deal = null; room.turnId = null; room.visibleBoard = 0;
    const bigBlind = () => {
      room.opening.stage = 'bigBlind';
      room.timer = setTimeout(() => beginDealing(room, true), Math.max(0, room.opening.endsAt - Date.now()));
      broadcast(room);
    };
    const smallBlind = () => {
      room.opening.stage = 'smallBlind';
      room.timer = setTimeout(bigBlind, Math.max(0, room.opening.bigBlindAt - Date.now()));
      broadcast(room);
    };
    room.timer = setTimeout(smallBlind, Math.max(0, room.opening.smallBlindAt - Date.now()));
    broadcast(room);
  }
  function beginDealing(room, initial, previousBoard = 0) {
    clearRoomTimer(room);
    room.opening = null; room.openingPlayers = null;
    // Run out all-ins one street at a time, with the same pauses as normal play.
    const boardCount = initial ? 0 : Math.min(room.hand.board.length, previousBoard < 3 ? 3 : previousBoard + 1);
    const duration = dealDelay ?? dealDuration(initial, previousBoard, boardCount), startedAt = Date.now() + phaseDelay;
    room.deal = { hand: room.handNumber, boardCount, startedAt, endsAt: startedAt + duration };
    room.dealing = true; room.settling = false; room.turnId = null; room.visibleBoard = previousBoard;
    const complete = () => {
      if (boardCount < room.hand.board.length) beginDealing(room, false, boardCount);
      else if (room.hand.done) beforeSettlement(room);
      else schedule(room);
    };
    const reveal = () => {
      room.visibleBoard = boardCount;
      if (duration <= 0) { complete(); return; }
      room.timer = setTimeout(complete, duration);
      broadcast(room);
    };
    if (phaseDelay <= 0) { reveal(); return; }
    room.timer = setTimeout(reveal, phaseDelay);
    broadcast(room);
  }
  function beforeSettlement(room) {
    if (phaseDelay <= 0) { schedule(room); return; }
    clearRoomTimer(room);
    room.dealing = true; room.settling = true; room.turnId = null;
    room.deal = null; room.visibleBoard = room.hand.board.length;
    room.timer = setTimeout(() => schedule(room), phaseDelay);
    broadcast(room);
  }
  function afterAction(room, previousBoard) {
    if (room.hand.board.length > previousBoard) beginDealing(room, false, previousBoard);
    else if (room.hand.done) beforeSettlement(room);
    else schedule(room);
  }
  function schedule(room) {
    clearRoomTimer(room);
    room.dealing = false; room.settling = false; room.visibleBoard = null;
    room.turnId = randomUUID();
    if (room.hand.done) {
      for (const p of room.hand.players) {
        const record = room.players.find(o => o.id === p.id);
        if (p.chips === 0 && !record.eliminatedAt) { record.eliminatedAt = room.handNumber; record.beforeBust = record.chips; }
        record.chips = p.chips;
      }
      room.finishing = room.stopAfterHand || room.players.filter(p => p.chips > 0).length <= 1;
      room.deadline = Date.now() + nextDelay;
      room.timer = setTimeout(() => { if (room.finishing) finish(room); else deal(room); }, nextDelay);
      broadcast(room); return;
    }
    const p = room.hand.players.find(p => p.seat === room.hand.actor);
    const isBot = p.bot;
    const limit = room.config.actionSeconds * 1000;
    // Compute immediately, then keep this actor visible until the minimum turn
    // duration has elapsed so the camera can finish its one-second follow.
    // botDelay overrides the minimum for tests; computation counts toward it.
    const notBefore = performance.now() + (isBot ? Math.min(botDelay ?? 1500, limit || Infinity) : 0);
    const turnId = room.turnId;
    room.turnDuration = limit;
    room.deadline = limit ? Date.now() + limit : null;
    const submit = action => {
      if (room.phase !== 'playing' || room.turnId !== turnId) return;
      try {
        const previousBoard = room.hand.board.length;
        room.hand.act(p.id, action.type, action.amount);
        afterAction(room, previousBoard);
      } catch (error) {
        console.error('Room action:', room.code, error.message);
        const legal = room.hand.legal(p.id);
        if (legal) { const previousBoard = room.hand.board.length; room.hand.act(p.id, legal.canCheck ? 'check' : 'fold'); afterAction(room, previousBoard); }
      }
    };
    if (limit || isBot) room.timer = setTimeout(() => {
      let action;
      try {
        action = isBot ? chooseBotAction(room.hand.snapshot(p.id), p.id, room.config.difficulty, randomInt, room.botPersonalities?.get(p.id)) : { type: room.hand.legal(p.id).canCheck ? 'check' : 'fold' };
      } catch (error) {
        console.error('Room decision:', room.code, error.message);
        const legal = room.hand.legal(p.id);
        if (!legal) return;
        action = { type: legal.canCheck ? 'check' : 'fold' };
      }
      const remaining = isBot ? Math.ceil(notBefore - performance.now()) : 0;
      if (remaining > 0) room.timer = setTimeout(() => submit(action), remaining);
      else submit(action);
    }, isBot ? 0 : limit);
    broadcast(room);
  }
  function deal(room) {
    clearRoomTimer(room);
    room.finishing = false;
    const players = room.players.filter(p => p.chips > 0);
    if (players.length < 2) { finish(room); return; }
    if (room.handNumber) {
      for (let off = 1; off <= 8; off++) if (players.some(p => p.seat === (room.button + off) % 8)) { room.button = (room.button + off) % 8; break; }
    }
    room.handNumber++;
    const levels = room.config.raiseEvery ? Math.floor((room.handNumber - 1) / room.config.raiseEvery) : 0;
    const sb = Math.min(room.config.smallBlind * 2 ** Math.min(20, levels), 1000000);
    room.hand = new PokerHand({ players, button: room.button, smallBlind: sb, bigBlind: sb * 2,
      ante: room.config.ante, deck: shuffledDeck(randomInt), number: room.handNumber });
    beginOpening(room);
  }
  function leave(session) {
    const room = rooms.get(session.roomCode);
    if (!room) { session.roomCode = null; return; }
    if (room.phase === 'playing' && room.players.some(p => p.id === session.id)) fail('比赛进行中请先打完本场或请房主结束，刷新可重新连接');
    const seat = room.seats.findIndex(s => s.id === session.id);
    if (seat >= 0) room.seats[seat] = { kind: 'open' };
    room.members.delete(session.id); session.roomCode = null;
    if (room.hostId === session.id) room.hostId = [...room.members].find(id => sessions.get(id)?.ws) || [...room.members][0] || null;
    if (!room.members.size) { clearRoomTimer(room); rooms.delete(room.code); }
    else broadcast(room);
  }
  function closeRoom(room) {
    clearRoomTimer(room);
    room.dealing = false;
    rooms.delete(room.code);
    for (const id of room.members) {
      const member = sessions.get(id);
      if (!member) continue;
      member.roomCode = null;
      send(member.ws, { type: 'room-closed', code: room.code });
    }
    room.members.clear();
  }
  wss.on('connection', ws => {
    let session = null, lastWindow = Date.now(), count = 0;
    ws.alive = true;
    ws.on('pong', () => { ws.alive = true; });
    ws.on('message', raw => {
      try {
        if (Date.now() - lastWindow > 10000) { lastWindow = Date.now(); count = 0; }
        if (++count > 120) fail('操作太快，请稍后再试');
        const msg = JSON.parse(raw.toString());
        if (!msg || typeof msg !== 'object') fail('消息无效');
        if (msg.type === 'hello') {
          if (session) fail('已经连接');
          session = typeof msg.token === 'string' && /^[a-f0-9]{64}$/.test(msg.token) ? sessions.get(msg.token) : null;
          if (session && session.token !== msg.token) session = null;
          if (!session) {
            const id = randomUUID(), token = randomBytes(32).toString('hex');
            session = { id, token, name: cleanName(msg.name, '玩家'), roomCode: null, ws: null, seen: new Set() };
            sessions.set(token, session); sessions.set(id, session);
          }
          if (session.ws) session.ws.close(4001, 'New connection');
          session.ws = ws; session.lastSeen = Date.now();
          if (!rooms.has(session.roomCode)) session.roomCode = null;
          send(ws, { type: 'session', token: session.token, id: session.id, name: session.name, roomCode: session.roomCode });
          const room = rooms.get(session.roomCode);
          if (room) broadcast(room);
          return;
        }
        if (!session || session.ws !== ws) fail('请先连接');
        session.lastSeen = Date.now();
        if (msg.type === 'ping') { send(ws, { type: 'pong', time: Date.now() }); return; }
        if (msg.type === 'create' || msg.type === 'join') {
          if (session.roomCode) leave(session);
          session.name = cleanName(msg.name, session.name);
          let room;
          if (msg.type === 'create') {
            if (rooms.size >= 100) fail('房间已满，请稍后再试');
            let code;
            do { code = String(randomInt(100000, 1000000)); } while (rooms.has(code));
            const password = String(msg.password || '').slice(0, 40), salt = randomBytes(16).toString('hex');
            room = { code, name: cleanName(msg.roomName, 'RevolverPoker'), hostId: session.id, members: new Set(),
              seats: Array.from({ length: 8 }, () => ({ kind: 'open' })), config: config(msg.config), phase: 'lobby',
              passwordHash: password ? scryptSync(password, salt, 32) : null, salt, version: 0, handNumber: 0, hand: null, touched: Date.now() };
            rooms.set(code, room);
          } else {
            room = rooms.get(String(msg.code || '').trim());
            if (!room) fail('未找到房间，请检查六位房间码');
            if (room.members.size >= 16) fail('房间人数已满');
            if (room.passwordHash && !timingSafeEqual(room.passwordHash, scryptSync(String(msg.password || '').slice(0, 40), room.salt, 32))) fail('房间密码不正确');
          }
          room.members.add(session.id); session.roomCode = room.code; broadcast(room); return;
        }
        const room = rooms.get(session.roomCode);
        if (!room) fail('请先创建或加入房间');
        const host = room.hostId === session.id;
        const seated = room.seats.some(s => s.kind === 'human' && s.id === session.id);
        if (msg.type === 'sync') { send(ws, view(room, session)); return; }
        if (msg.type === 'close-room') {
          if (!host) fail('仅房主可关闭房间');
          closeRoom(room); return;
        }
        if (msg.type === 'leave') { leave(session); send(ws, { type: 'left' }); return; }
        if (msg.type === 'action') {
          if (typeof msg.requestId !== 'string' || msg.requestId.length > 80) fail('请求编号无效');
          if (session.seen.has(msg.requestId)) { send(ws, view(room, session)); return; }
          if (room.dealing) fail(room.opening ? '正在放置盲注，请等待开局准备结束' : room.settling ? '等待结算，请稍候' : '正在发牌，请等待发牌结束');
          if (room.phase !== 'playing' || !room.hand || msg.hand !== room.handNumber || msg.turnId !== room.turnId) fail('牌局已更新，请按当前回合操作');
          const previousBoard = room.hand.board.length;
          room.hand.act(session.id, msg.action, msg.amount);
          session.seen.add(msg.requestId);
          if (session.seen.size > 128) session.seen.delete(session.seen.values().next().value);
          afterAction(room, previousBoard); return;
        }
        if (msg.type === 'stop') {
          if (!host || !seated) fail('仅已入座房主可结束本场');
          if (room.phase !== 'playing') fail('当前没有进行中的比赛');
          room.stopAfterHand = true;
          if (room.hand.done && !room.dealing) room.finishing = true;
          broadcast(room);
          return;
        }
        if (msg.type === 'reset') {
          if (!host || room.phase !== 'finished') fail('仅房主可在结算后重新开场');
          room.phase = 'lobby'; room.hand = null; room.players = null; room.botPersonalities = null; room.handNumber = 0; room.dealing = false; room.settling = false; room.opening = null; room.openingPlayers = null; room.deal = null; room.finishing = false; broadcast(room); return;
        }
        if (room.phase !== 'lobby') fail('比赛已开始，下一场才能调整座位与规则');
        if (msg.type === 'seat') {
          if (!Number.isInteger(msg.seat) || msg.seat < 0 || msg.seat > 7) fail('座位无效');
          const seat = room.seats[msg.seat];
          if (!seated) {
            if (seat.kind !== 'open') fail('该座位已被占用');
            room.seats[msg.seat] = { kind: 'human', id: session.id, name: session.name };
          } else if (host) {
            if (seat.kind === 'human') fail('不能替换已入座玩家');
            room.seats[msg.seat] = seat.kind === 'open' ? { kind: 'ai', id: `ai-${room.code}-${msg.seat}`, name: ['科尔', '罗斯', '杰西', '薇拉', '亨利', '玛吉', '沃尔特', '露西'][msg.seat] } : { kind: 'open' };
          } else fail('你已入座；只有房主可切换空位');
        } else if (msg.type === 'stand') {
          const index = room.seats.findIndex(s => s.id === session.id);
          if (index < 0) fail('你尚未入座');
          room.seats[index] = { kind: 'open' };
        } else if (msg.type === 'configure') {
          if (!host) fail('仅房主可设置规则');
          room.config = config({ ...room.config, ...msg.config });
        } else if (msg.type === 'start') {
          if (!host || !seated) fail('房主需要先坐下再开始');
          const occupied = room.seats.map((s, seat) => ({ ...s, seat })).filter(s => s.kind !== 'open');
          if (occupied.length < 2) fail('至少需要两人；可点击空位添加 AI');
          if (room.config.actionSeconds === 0 && occupied.filter(p => p.kind === 'human').length > 1) fail('多人比赛请选择行动时限');
          room.players = occupied.map(p => ({ id: p.id, name: p.name, seat: p.seat, bot: p.kind === 'ai', chips: room.config.startingChips }));
          room.botPersonalities = createBotPersonalities(room.players.filter(p => p.bot).map(p => p.id));
          room.button = occupied[randomInt(occupied.length)].seat;
          room.phase = 'playing'; room.handNumber = 0; room.stopAfterHand = false;
          deal(room); return;
        } else fail('不支持的操作');
        broadcast(room);
      } catch (error) {
        send(ws, { type: 'error', message: error.message });
        const room = session && rooms.get(session.roomCode);
        if (room) send(ws, view(room, session));
      }
    });
    ws.on('close', () => {
      if (!session || session.ws !== ws) return;
      session.ws = null; session.lastSeen = Date.now();
      const room = rooms.get(session.roomCode);
      if (room) {
        if (room.hostId === session.id) room.hostId = [...room.members].find(id => sessions.get(id)?.ws && room.seats.some(s => s.id === id)) || [...room.members].find(id => sessions.get(id)?.ws) || room.hostId;
        broadcast(room);
      }
    });
    ws.on('error', () => {});
  });
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) { if (!ws.alive) ws.terminate(); else { ws.alive = false; ws.ping(); } }
    const now = Date.now();
    for (const [code, room] of rooms) if (![...room.members].some(id => sessions.get(id)?.ws) && now - room.touched > 30 * 60 * 1000) {
      clearRoomTimer(room); rooms.delete(code);
    }
    for (const [key, s] of sessions) if (!s.ws && !rooms.has(s.roomCode) && now - s.lastSeen > 24 * 60 * 60 * 1000) sessions.delete(key);
  }, 30000);
  heartbeat.unref();
  return { server, rooms, sessions, async close() {
    clearInterval(heartbeat);
    for (const room of rooms.values()) clearRoomTimer(room);
    for (const ws of wss.clients) ws.terminate();
    await new Promise(resolve => wss.close(resolve));
    await new Promise(resolve => server.close(resolve));
  } };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const app = createPokerServer();
  const port = Number(process.env.PORT || 3088), host = process.env.HOST || '0.0.0.0';
  app.server.once('error', async error => {
    await app.close();
    if (error.code === 'EADDRINUSE') {
      const probeHost = host === '0.0.0.0' ? '127.0.0.1' : host === '::' ? '[::1]' : host.includes(':') ? `[${host}]` : host;
      const url = `http://${probeHost}:${port}`;
      try {
        const response = await fetch(`${url}/health`, { signal: AbortSignal.timeout(2000) });
        const health = await response.json();
        if (response.ok && health.ok === true && Number.isInteger(health.rooms) && health.sceneEditor === true) {
          console.log(`RevolverPoker 服务已在运行：${url}`);
          console.log('可直接打开上述地址，无需重复启动。');
          return;
        }
      } catch { /* A different service may own the port. */ }
      console.error(`端口 ${port} 已被其他程序占用，请关闭占用程序，或在 PowerShell 7 中设置 $env:PORT=3089 后重新运行 npm start。`);
    } else console.error(`RevolverPoker 启动失败：${error.message}`);
    process.exitCode = 1;
  });
  app.server.listen(port, host, () => {
    console.log(`RevolverPoker · Local: http://localhost:${port}`);
    console.log('请保持服务窗口运行，按 Ctrl+C 停止服务。');
    for (const list of Object.values(networkInterfaces())) for (const ip of list || []) if (ip.family === 'IPv4' && !ip.internal) console.log(`LAN: http://${ip.address}:${port}`);
  });
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await app.close(); process.exit(0); });
}
