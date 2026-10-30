import test from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { createPokerServer } from '../server/index.js';
import { TableActions } from '../client/table-actions.js';

async function client(url, name, token) {
  const socket = new WebSocket(url);
  const c = { socket, state: null, session: null, errors: [], messages: [] };
  c.send = (type, data = {}) => socket.send(JSON.stringify({ type, ...data }));
  c.until = async predicate => {
    const deadline = Date.now() + 5000;
    while (!predicate(c)) {
      if (Date.now() > deadline) throw new Error(`Timed out: ${predicate.toString()} ${JSON.stringify(c.errors)}`);
      await new Promise(r => setTimeout(r, 5));
    }
  };
  socket.on('message', raw => {
    const m = JSON.parse(raw);
    c.messages.push(m);
    if (m.type === 'state') c.state = m.room;
    if (m.type === 'session') c.session = m;
    if (m.type === 'error') c.errors.push(m.message);
  });
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  c.send('hello', { name, token });
  await c.until(c => !!c.session);
  return c;
}
test('real WebSockets: eight seats, authority, races, hidden cards, duplicate action and reconnection', async t => {
  const app = createPokerServer({ botDelay: 10, nextDelay: 50 });
  await new Promise(r => app.server.listen(0, '127.0.0.1', r));
  t.after(() => app.close());
  const port = app.server.address().port, url = `ws://127.0.0.1:${port}/ws`;
  const host = await client(url, '房主');
  host.send('create', { config: { startingChips: 500, smallBlind: 5 } });
  await host.until(c => !!c.state);
  const code = host.state.code;
  host.send('seat', { seat: 0 }); await host.until(c => c.state.seats[0].id === c.session.id);
  host.send('seat', { seat: 7 }); await host.until(c => c.state.seats[7].kind === 'ai');
  host.send('seat', { seat: 7 }); await host.until(c => c.state.seats[7].kind === 'open');
  const guests = await Promise.all(Array.from({ length: 8 }, (_, i) => client(url, `朋友${i + 1}`)));
  for (const g of guests) { g.send('join', { code }); await g.until(c => !!c.state); }
  // Two independent sockets racing for a seat must never both acquire it.
  guests[0].send('seat', { seat: 1 }); guests[1].send('seat', { seat: 1 });
  await host.until(c => c.state.seats[1].kind === 'human');
  await new Promise(r => setTimeout(r, 20));
  const won = guests.findIndex(g => g.session.id === host.state.seats[1].id);
  const loser = won === 0 ? 1 : 0;
  assert.equal(guests[loser].errors.length, 1);
  const remaining = guests.filter((_, i) => i !== won);
  for (let i = 0; i < 6; i++) { remaining[i].send('seat', { seat: i + 2 }); await host.until(c => c.state.seats[i + 2].kind === 'human'); }
  assert.equal(host.state.seats.filter(s => s.kind === 'human').length, 8);
  const ninth = remaining[6];
  ninth.send('seat', { seat: 0 }); await ninth.until(c => c.errors.length > 0);
  guests[won].send('configure', { config: { startingChips: 100 } });
  await guests[won].until(c => c.errors.some(e => e.includes('仅房主')));
  host.send('start'); await host.until(c => c.state.phase === 'playing');
  await guests[won].until(c => c.state.phase === 'playing');
  const h = host.state.hand;
  assert.equal(h.players.length, 8);
  assert.equal(h.players.filter(p => p.cards.every(v => v !== null)).length, 1);
  assert.equal(h.players.find(p => p.id === host.session.id).cards.length, 2);
  assert.equal('deck' in h, false);
  // Public player IDs cannot be passed off as secret session credentials.
  const attacker = await client(url, '旁观者', host.session.id);
  assert.notEqual(attacker.session.id, host.session.id);
  const actorId = h.players.find(p => p.seat === h.actor).id;
  const actor = [host, ...guests].find(c => c.session.id === actorId);
  await actor.until(c => c.state.turnId === host.state.turnId);
  const msg = { hand: actor.state.handNumber, turnId: actor.state.turnId, requestId: 'same-request', action: actor.state.hand.legal.canCheck ? 'check' : 'call' };
  const historyBefore = host.state.hand.history.length;
  actor.send('action', msg); actor.send('action', msg);
  await host.until(c => c.state.hand.history.length > historyBefore);
  await new Promise(r => setTimeout(r, 25));
  assert.equal(host.state.hand.history.length, historyBefore + 1);
  assert.equal(host.state.hand.players.reduce((n, p) => n + p.chips + p.total, 0), 4000);
  const token = guests[won].session.token, id = guests[won].session.id;
  guests[won].socket.close();
  const reconnect = await client(url, '同名无关', token);
  await reconnect.until(c => !!c.state);
  assert.equal(reconnect.session.id, id);
  assert.equal(reconnect.state.seats.find(s => s.id === id).kind, 'human');
  assert.equal(reconnect.state.hand.players.filter(p => p.cards.every(v => v !== null)).length, 1);
  const httpResponse = await fetch(`http://127.0.0.1:${port}/server/index.js`);
  assert.equal(httpResponse.status, 404);
});

test('one human + seven AI can finish a hand, stop and retain seat setup for a new match', async t => {
  const app = createPokerServer({ botDelay: 2, nextDelay: 20 });
  await new Promise(r => app.server.listen(0, '127.0.0.1', r));
  t.after(() => app.close());
  const h = await client(`ws://127.0.0.1:${app.server.address().port}/ws`, '旅客');
  h.send('create', { config: { startingChips: 100, smallBlind: 10, actionSeconds: 0 } });
  await h.until(c => !!c.state);
  h.send('seat', { seat: 3 }); await h.until(c => c.state.seats[3].kind === 'human');
  for (let i = 0; i < 8; i++) if (i !== 3) { h.send('seat', { seat: i }); await h.until(c => c.state.seats[i].kind === 'ai'); }
  h.send('start'); await h.until(c => c.state.phase === 'playing');
  h.send('stop'); await h.until(c => c.state.stopAfterHand || c.state.phase === 'finished');
  const limit = Date.now() + 10000;
  let lastTurn = '';
  while (h.state.phase !== 'finished' && Date.now() < limit) {
    if (h.state.hand.legal && h.state.turnId !== lastTurn) {
      lastTurn = h.state.turnId;
      h.send('action', { hand: h.state.handNumber, turnId: lastTurn, requestId: lastTurn, action: h.state.hand.legal.canCheck ? 'check' : 'call' });
    }
    await new Promise(r => setTimeout(r, 5));
  }
  assert.equal(h.state.phase, 'finished');
  assert.equal(h.state.standings.reduce((n, p) => n + p.chips, 0), 800);
  assert.equal(h.errors.length, 0);
  h.send('reset'); await h.until(c => c.state.phase === 'lobby');
  assert.equal(h.state.seats.filter(s => s.kind === 'ai').length, 7);
  assert.equal(h.state.seats[3].id, h.session.id);
});

test('physical chip gestures stage locally, then submit exactly one valid call over a real socket', async t => {
  const app = createPokerServer();
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve)); t.after(() => app.close());
  const url = `ws://127.0.0.1:${app.server.address().port}/ws`;
  const host = await client(url, '房主'), guest = await client(url, '朋友');
  host.send('create'); await host.until(c => c.state);
  guest.send('join', { code: host.state.code }); await guest.until(c => c.state);
  host.send('seat', { seat: 0 }); await host.until(c => c.state.seats[0].id === c.session.id);
  guest.send('seat', { seat: 1 }); await host.until(c => c.state.seats[1].id === guest.session.id);
  host.send('start'); await host.until(c => c.state.phase === 'playing');
  const actorId = host.state.hand.players.find(p => p.seat === host.state.hand.actor).id;
  const actor = [host, guest].find(c => c.session.id === actorId);
  await actor.until(c => c.state.turnId === host.state.turnId);
  const history = actor.state.hand.history.length, initialChips = actor.state.hand.players.find(p => p.id === actorId).chips;
  let submissions = 0;
  const actions = new TableActions({ send: (type, amount, key) => {
    submissions++;
    actor.send('action', { action: type, amount, hand: actor.state.handNumber, turnId: actor.state.turnId, requestId: `gesture-${submissions}-${key}` });
    return true;
  } });
  actions.sync(actor.state, actorId);
  const callAmount = actor.state.hand.legal.callAmount, point = { x: 100, y: 200 };
  assert.ok(callAmount > 0);
  actions.begin({ chipRole: 'bank' }, point, 0); actions.release(point, 100);
  assert.equal(submissions, 0); assert.equal(actions.pending, callAmount);
  assert.equal(app.rooms.get(actor.state.code).hand.players.find(p => p.id === actorId).chips, initialChips);
  actions.begin({ chipRole: 'staged' }, point, 200);
  actions.move({ x: 100, y: 145 }, 250); actions.release({ x: 100, y: 145 }, 300);
  actions.begin({ chipRole: 'staged' }, point, 310); actions.release({ x: 100, y: 145 }, 350);
  assert.equal(submissions, 1);
  await actor.until(c => c.state.hand.history.length === history + 1);
  assert.equal(actor.state.hand.players.find(p => p.id === actorId).chips, initialChips - callAmount);
  assert.equal(actor.state.hand.players.reduce((sum, p) => sum + p.chips + p.total, 0), 4000);
  assert.equal(actor.errors.length, 0);
});

for (const phase of ['lobby', 'playing', 'between-hands', 'finished']) {
  test(`host closes room immediately during ${phase}; members can return and create or join again`, async t => {
    const app = createPokerServer({ nextDelay: 10000 });
    await new Promise(r => app.server.listen(0, '127.0.0.1', r));
    t.after(() => app.close());
    const url = `ws://127.0.0.1:${app.server.address().port}/ws`;
    const host = await client(url, '房主'), guest = await client(url, '朋友');
    const observer = await client(url, '观众'), offline = await client(url, '离线观众');
    host.send('create'); await host.until(c => !!c.state);
    const code = host.state.code;
    for (const member of [guest, observer, offline]) {
      member.send('join', { code }); await member.until(c => !!c.state);
    }
    const disconnected = new Promise(resolve => offline.socket.once('close', resolve));
    offline.socket.close(); await disconnected;
    await host.until(c => c.state.members.some(m => m.id === offline.session.id && !m.connected));
    if (phase !== 'lobby') {
      host.send('seat', { seat: 0 }); await host.until(c => c.state.seats[0].id === c.session.id);
      guest.send('seat', { seat: 1 }); await host.until(c => c.state.seats[1].id === guest.session.id);
      host.send('start'); await host.until(c => c.state.phase === 'playing');
      if (phase === 'finished') {
        host.send('stop'); await host.until(c => c.state.stopAfterHand);
      }
      if (phase === 'between-hands' || phase === 'finished') {
        const actor = host.state.hand.actor === 0 ? host : guest;
        await actor.until(c => c.state.turnId === host.state.turnId);
        actor.send('action', { hand: actor.state.handNumber, turnId: actor.state.turnId,
          requestId: 'finish-hand', action: 'fold' });
        await host.until(c => c.state.hand.done);
        assert.equal(host.state.phase, phase === 'finished' ? 'finished' : 'playing');
      }
    }
    guest.send('close-room'); await guest.until(c => c.errors.includes('仅房主可关闭房间'));
    assert.ok(app.rooms.has(code), 'non-host cannot close the room');
    const closingRoom = app.rooms.get(code);
    if (phase === 'playing' || phase === 'between-hands') assert.ok(closingRoom.timer);
    host.send('close-room');
    for (const member of [host, guest, observer]) {
      await member.until(c => c.messages.some(m => m.type === 'room-closed' && m.code === code));
      assert.equal(app.sessions.get(member.session.id).roomCode, null);
      assert.equal(member.socket.readyState, WebSocket.OPEN, 'returning to menu keeps the connection usable');
    }
    assert.equal(app.rooms.has(code), false);
    assert.equal(closingRoom.timer, null, 'action and next-hand timers are cancelled');
    assert.equal(closingRoom.members.size, 0);
    assert.equal(app.sessions.get(offline.session.id).roomCode, null);
    const reconnect = await client(url, '离线观众', offline.session.token);
    assert.equal(reconnect.session.roomCode, null, 'reconnection cannot restore a closed room');
    assert.equal(reconnect.state, null);
    guest.send('join', { code });
    await guest.until(c => c.errors.some(e => e.includes('未找到房间')));
    const previousCount = host.messages.filter(m => m.type === 'state').length;
    host.send('create');
    await host.until(c => c.messages.filter(m => m.type === 'state').length > previousCount);
    const newCode = host.state.code;
    guest.send('join', { code: newCode }); await guest.until(c => c.state.code === newCode);
    assert.equal(host.errors.length, 0);
    assert.equal(app.rooms.size, 1);
  });
}
