import test from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { createPokerServer } from '../server/index.js';
import { TableActions } from '../client/table-actions.js';
import { PokerHand } from '../shared/poker.js';
import { dealDuration } from '../shared/deal-timing.js';

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
  const app = createPokerServer({ openingDelay: 0, phaseDelay: 0, botDelay: 10, nextDelay: 50, dealDelay: 0 });
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
  const app = createPokerServer({ openingDelay: 0, phaseDelay: 0, botDelay: 2, nextDelay: 20, dealDelay: 0 });
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
  const app = createPokerServer({ openingDelay: 0, phaseDelay: 0, dealDelay: 0 });
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

for (const phase of ['lobby', 'dealing', 'playing', 'between-hands', 'final-result', 'finished']) {
  test(`host closes room immediately during ${phase}; members can return and create or join again`, async t => {
    const app = createPokerServer({ openingDelay: 0, phaseDelay: 0, nextDelay: phase === 'finished' ? 40 : 10000, dealDelay: phase === 'dealing' ? 10000 : 0 });
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
      if (phase === 'finished' || phase === 'final-result') {
        host.send('stop'); await host.until(c => c.state.stopAfterHand);
      }
      if (phase === 'between-hands' || phase === 'finished' || phase === 'final-result') {
        const actor = host.state.hand.actor === 0 ? host : guest;
        await actor.until(c => c.state.turnId === host.state.turnId);
        actor.send('action', { hand: actor.state.handNumber, turnId: actor.state.turnId,
          requestId: 'finish-hand', action: 'fold' });
        await host.until(c => c.state.hand.done);
        if (phase === 'finished') await host.until(c => c.state.phase === 'finished');
        assert.equal(host.state.phase, phase === 'finished' ? 'finished' : 'playing');
        if (phase === 'final-result') assert.equal(host.state.finishing, true);
      }
    }
    guest.send('close-room'); await guest.until(c => c.errors.includes('仅房主可关闭房间'));
    assert.ok(app.rooms.has(code), 'non-host cannot close the room');
    const closingRoom = app.rooms.get(code);
    if (phase === 'dealing' || phase === 'playing' || phase === 'between-hands' || phase === 'final-result') assert.ok(closingRoom.timer);
    if (phase === 'dealing') assert.equal(closingRoom.dealing, true);
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

async function dealingRoom(t, options = {}, bot = false, actionSeconds = 15, gameConfig = {}) {
  const app = createPokerServer({ openingDelay: 0, phaseDelay: 0, nextDelay: 10000, ...options });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => app.close());
  const url = `ws://127.0.0.1:${app.server.address().port}/ws`;
  const host = await client(url, '房主');
  host.send('create', { config: { actionSeconds, ...gameConfig } }); await host.until(c => !!c.state);
  host.send('seat', { seat: 0 }); await host.until(c => c.state.seats[0].kind === 'human');
  let guest;
  if (bot) { host.send('seat', { seat: 1 }); await host.until(c => c.state.seats[1].kind === 'ai'); }
  else {
    guest = await client(url, '朋友'); guest.send('join', { code: host.state.code }); await guest.until(c => !!c.state);
    guest.send('seat', { seat: 1 }); await host.until(c => c.state.seats[1].kind === 'human');
  }
  host.send('start'); await host.until(c => c.state.dealing);
  return { app, host, guest, url };
}

test('the default three-second opening posts small and big blinds in order, blocks play and preserves progress on reconnect', async t => {
  const { app, host, guest, url } = await dealingRoom(t, { openingDelay: undefined, dealDelay: 100 });
  const first = host.state, timeline = first.opening;
  assert.equal(timeline.endsAt - timeline.startedAt, 3000);
  assert.equal(timeline.smallBlindAt - timeline.startedAt, 1000);
  assert.equal(timeline.bigBlindAt - timeline.startedAt, 2000);
  assert.equal(timeline.stage, 'markers'); assert.equal(first.hand.pot, 0);
  assert.ok(first.hand.players.every(player => player.chips === 2000 && player.bet === 0 && player.total === 0 && player.cards.every(card => card === null)));
  assert.equal(first.deal, null); assert.equal(first.deadline, null); assert.equal(first.hand.legal, null);
  host.send('action', { hand: first.handNumber, turnId: null, requestId: 'opening', action: 'call' });
  await host.until(c => c.errors.length > 0);
  assert.match(host.errors.at(-1), /盲注/); assert.equal(app.rooms.get(first.code).hand.history.length, 0);
  await host.until(c => c.state.opening?.stage === 'smallBlind');
  const small = host.state;
  assert.equal(small.hand.pot, 10);
  assert.equal(small.hand.players.find(player => player.seat === small.hand.sbSeat).bet, 10);
  assert.equal(small.hand.players.find(player => player.seat === small.hand.bbSeat).bet, 0);
  const reconnect = await client(url, '朋友', guest.session.token);
  await reconnect.until(c => !!c.state);
  assert.deepEqual(reconnect.state.opening, small.opening); assert.equal(reconnect.state.hand.pot, 10);
  await host.until(c => c.state.opening?.stage === 'bigBlind');
  assert.equal(host.state.hand.pot, 30);
  assert.equal(host.state.hand.players.find(player => player.seat === host.state.hand.bbSeat).bet, 20);
  for (const state of [first, small, host.state]) {
    assert.equal(state.hand.players.reduce((sum, player) => sum + player.chips + player.total, 0), 4000);
    assert.equal(state.turnId, null); assert.equal(state.deadline, null); assert.equal(state.hand.actor, null);
  }
  await host.until(c => !c.state.opening && c.state.dealing);
  assert.ok(host.state.deal.startedAt >= timeline.endsAt - 2);
  await host.until(c => !c.state.dealing);
  assert.ok(host.state.deadline - host.state.serverTime >= 14900);
});

test('a later opening with antes and short blind all-ins keeps all seven chips accounted for before revealing results', async t => {
  const { app, host, guest } = await dealingRoom(t, { openingDelay: 300, dealDelay: 20, nextDelay: 200 }, false, 15, { ante: 2 });
  await host.until(c => !c.state.dealing);
  const state = host.state, actor = state.hand.actor === 0 ? host : guest;
  await actor.until(c => c.state.turnId === state.turnId);
  actor.send('action', { hand: state.handNumber, turnId: state.turnId, requestId: 'first-fold', action: 'fold' });
  await host.until(c => c.state.hand.done);
  const internal = app.rooms.get(state.code);
  internal.players[0].chips = 3; internal.players[1].chips = 4;
  await host.until(c => c.state.handNumber === 2 && c.state.opening?.stage === 'markers');
  const markers = host.state;
  assert.equal(markers.hand.pot, 0); assert.equal(markers.hand.players.reduce((sum, player) => sum + player.chips, 0), 7);
  await host.until(c => c.state.opening?.stage === 'smallBlind');
  const small = host.state;
  assert.equal(small.hand.pot, 6, 'both antes and the short small blind are posted before the big blind');
  await host.until(c => c.state.opening?.stage === 'bigBlind');
  assert.equal(host.state.hand.pot, 7);
  assert.equal(internal.hand.done, true, 'the engine may already have resolved the forced all-in');
  for (const snapshot of [markers, small, host.state]) {
    assert.equal(snapshot.hand.done, false); assert.equal(snapshot.hand.result, null);
    assert.equal(snapshot.hand.players.reduce((sum, player) => sum + player.chips + player.total, 0), 7);
    assert.ok(snapshot.hand.players.every(player => player.cards.every(card => card === null)));
  }
  await host.until(c => c.state.hand.done);
  assert.equal(host.state.hand.players.reduce((sum, player) => sum + player.chips, 0), 7);
});

test('half-second pauses withhold new streets and results, including all-in runouts and reconnection', async t => {
  const { host, guest, url } = await dealingRoom(t, { phaseDelay: undefined, dealDelay: 25 });
  const first = host.state;
  assert.ok(first.deal.startedAt - first.serverTime >= 490, 'hole cards wait before their animation starts');
  await host.until(c => !c.state.dealing);
  const peers = [host, guest];
  const act = async action => {
    const state = host.state, actor = peers.find(peer => peer.session.id === state.hand.players.find(p => p.seat === state.hand.actor).id);
    await actor.until(c => c.state.turnId === state.turnId);
    actor.send('action', { hand: state.handNumber, turnId: state.turnId, requestId: state.turnId, action });
    await host.until(c => c.state.hand.history.length > state.hand.history.length);
  };
  await act('call'); await act('check');
  const pause = host.state;
  assert.equal(pause.hand.board.length, 0); assert.equal(pause.hand.street, 'preflop');
  assert.equal(pause.hand.pot, 40); assert.equal(pause.hand.legal, null);
  assert.equal(pause.turnId, null); assert.equal(pause.deadline, null);
  assert.ok(pause.deal.startedAt - pause.serverTime >= 490);
  const reconnect = await client(url, '朋友', guest.session.token);
  await reconnect.until(c => !!c.state);
  assert.deepEqual(reconnect.state.deal, pause.deal);
  assert.equal(reconnect.state.hand.board.length, 0);
  peers[1] = reconnect;
  await host.until(c => !c.state.dealing);
  assert.equal(host.state.hand.board.length, 3);
  await act('allin'); await act('call');
  assert.equal(host.state.hand.board.length, 3);
  await host.until(c => c.state.hand.done);
  const states = host.messages.filter(message => message.type === 'state').map(message => message.room);
  const turn = states.find(state => state.dealing && state.hand.board.length === 4);
  const riverPause = states.find(state => state.dealing && state.hand.board.length === 4 && state.deal?.boardCount === 5);
  const river = states.find(state => state.dealing && state.hand.board.length === 5);
  const settlement = states.find(state => state.settling);
  assert.ok(turn.serverTime >= turn.deal.startedAt - 2);
  assert.ok(riverPause.deal.startedAt - riverPause.serverTime >= 490);
  assert.ok(river.serverTime >= river.deal.startedAt - 2);
  assert.ok(settlement.serverTime >= river.deal.endsAt);
  assert.ok(host.state.serverTime - settlement.serverTime >= 490);
  for (const state of states.filter(state => state.dealing)) {
    assert.equal(state.hand.done, false); assert.equal(state.hand.result, null);
    assert.equal(state.hand.players.reduce((sum, player) => sum + player.chips + player.total, 0), 4000);
    assert.deepEqual(state.hand.players.find(player => player.id !== host.session.id).cards, [null, null]);
  }
});

test('a fold confirms immediately but withholds the winner and payout for half a second', async t => {
  const { host, guest } = await dealingRoom(t, { phaseDelay: 500, dealDelay: 10 });
  await host.until(c => !c.state.dealing);
  const state = host.state, actor = state.hand.actor === 0 ? host : guest;
  await actor.until(c => c.state.turnId === state.turnId);
  actor.send('action', { hand: state.handNumber, turnId: state.turnId, requestId: state.turnId, action: 'fold' });
  await host.until(c => c.state.settling);
  const pause = host.state;
  assert.ok(pause.hand.players.some(player => player.folded));
  assert.equal(pause.hand.done, false); assert.equal(pause.hand.result, null);
  assert.equal(pause.hand.pot, 30); assert.equal(pause.deadline, null);
  await host.until(c => c.state.hand.done);
  assert.ok(host.state.serverTime - pause.serverTime >= 490);
  assert.equal(host.state.settling, false);
});

test('real dealing phases block actions on every street and start a full turn clock only after the cards land', async t => {
  const { app, host, guest, url } = await dealingRoom(t);
  const first = host.state, duration = first.deal.endsAt - first.deal.startedAt;
  assert.equal(duration, dealDuration(true, 0, 0));
  const reconnect = await client(url, '房主', host.session.token);
  await reconnect.until(c => !!c.state);
  assert.equal(reconnect.state.dealing, true);
  assert.deepEqual(reconnect.state.deal, first.deal, 'reconnection keeps the original deal timeline');
  const peers = [reconnect, guest], boards = [];
  let observer = reconnect, actions = 0;
  while (!observer.state.hand.done && actions <= 8) {
    if (observer.state.dealing) {
      const state = observer.state, count = state.hand.board.length;
      boards.push(count);
      assert.equal(state.hand.actor, null); assert.equal(state.hand.legal, null);
      assert.equal(state.turnId, null); assert.equal(state.deadline, null);
      assert.equal(state.hand.result, null);
      assert.equal(state.hand.players.filter(p => p.cards.every(card => card !== null)).length, 1);
      const errors = observer.errors.length, history = state.hand.history.length;
      observer.send('action', { hand: state.handNumber, turnId: null, requestId: `early-${count}`, action: 'call' });
      await observer.until(c => c.errors.length > errors);
      assert.match(observer.errors.at(-1), /正在发牌/);
      assert.equal(app.rooms.get(state.code).hand.history.length, history, 'an early request cannot mutate the hand');
      await observer.until(c => !c.state.dealing);
      assert.ok(observer.state.serverTime >= state.deal.endsAt - 2);
      assert.ok(observer.state.deadline - observer.state.serverTime >= 14900, 'the entire 15-second action period remains');
    }
    const state = observer.state;
    if (state.hand.done) break;
    const id = state.hand.players.find(p => p.seat === state.hand.actor).id;
    const actor = peers.find(peer => peer.session.id === id);
    await actor.until(c => c.state.turnId === state.turnId);
    actor.send('action', { hand: state.handNumber, turnId: state.turnId, requestId: `act-${actions++}`,
      action: actor.state.hand.legal.canCheck ? 'check' : 'call' });
    await observer.until(c => c.state.hand.history.length > state.hand.history.length);
  }
  assert.deepEqual(boards, [0, 3, 4, 5]);
  assert.equal(observer.state.hand.done, true);
  assert.equal(observer.state.hand.players.reduce((sum, p) => sum + p.chips, 0), 4000);
  assert.equal(guest.errors.length, 0);
});

test('AI with zero thinking delay still cannot act during the deal', async t => {
  const { app, host } = await dealingRoom(t, { botDelay: 0, dealDelay: 180 }, true);
  const endsAt = host.state.deal.endsAt;
  await new Promise(resolve => setTimeout(resolve, 60));
  assert.equal(app.rooms.get(host.state.code).hand.history.length, 0);
  assert.equal(host.state.dealing, true);
  await host.until(c => !c.state.dealing);
  if (!host.state.hand.history.length && host.state.hand.actor === 0) {
    const state = host.state;
    host.send('action', { hand: state.handNumber, turnId: state.turnId, requestId: 'reach-ai', action: state.hand.legal.canCheck ? 'check' : 'call' });
  }
  await host.until(c => c.state.hand.history.some(action => action.seat === 1));
  for (const message of host.messages) if (message.type === 'state' && message.room.hand?.history.length) {
    assert.ok(message.room.serverTime >= endsAt - 2, 'no AI action is broadcast before the deal ends');
  }
  assert.equal(host.errors.length, 0);
});

test('production AI retains its turn for 1.5 seconds, including reconnects, so the camera can finish following', async t => {
  const { app, host, url } = await dealingRoom(t, { dealDelay: 30 }, true);
  await host.until(c => !c.state.dealing);
  if (!host.state.hand.history.some(action => action.seat === 1) && host.state.hand.actor === 0) {
    host.send('action', { hand: host.state.handNumber, turnId: host.state.turnId, requestId: 'reach-normal-ai',
      action: host.state.hand.legal.canCheck ? 'check' : 'call' });
  }
  await host.until(c => !c.state.dealing && c.state.hand.actor === 1);
  const turn = host.state;
  await new Promise(resolve => setTimeout(resolve, 1050));
  assert.equal(app.rooms.get(turn.code).hand.history.filter(action => action.seat === 1).length, 0, 'the same actor remains after the camera has had a full second to align');
  const reconnect = await client(url, '房主', host.session.token);
  await reconnect.until(c => !!c.state);
  assert.equal(reconnect.state.turnId, turn.turnId);
  assert.equal(reconnect.state.deadline, turn.deadline, 'reconnecting cannot restart the minimum duration or action clock');
  await reconnect.until(c => c.state.hand.history.some(action => action.seat === 1));
  host.messages.push(...reconnect.messages);
  const states = host.messages.filter(message => message.type === 'state' && message.room.hand).map(message => message.room);
  const state = states.find(room => !room.dealing && room.hand.actor === 1 && !room.hand.history.some(action => action.seat === 1));
  const acted = states.find(room => room.hand.history.some(action => action.seat === 1));
  assert.ok(state, 'the AI turn is published before computation');
  assert.equal(state.turnDuration, state.config.actionSeconds * 1000);
  assert.equal(state.turnDuration, 15000);
  assert.ok(Math.abs(state.deadline - state.serverTime - state.turnDuration) < 50);
  assert.ok(acted.serverTime - state.serverTime >= 1490, 'an AI cannot submit before the 1.5-second minimum');
  assert.ok(acted.serverTime - state.serverTime < 2500, 'reconnection must not add another minimum wait');
  assert.equal(reconnect.errors.length, 0);
  const internal = app.rooms.get(state.code);
  reconnect.send('close-room'); await reconnect.until(c => c.messages.some(message => message.type === 'room-closed'));
  assert.equal(internal.timer, null); assert.equal(internal.turnDuration, null);
});

for (const seconds of [15, 30, 60, 0]) {
  test(`AI shares the ${seconds || 'unlimited'} player time limit and can privately act before it expires`, async t => {
    const { host, url } = await dealingRoom(t, { dealDelay: 30, botDelay: 350 }, true, seconds);
    await host.until(c => !c.state.dealing);
    assert.equal(host.state.turnDuration, seconds * 1000, 'the same budget applies regardless of which seat acts first');
    if (host.state.hand.actor === 0) {
      host.send('action', { hand: host.state.handNumber, turnId: host.state.turnId, requestId: `reach-ai-${seconds}`,
        action: host.state.hand.legal.canCheck ? 'check' : 'call' });
      await host.until(c => c.state.hand.actor === 1);
    }
    const turn = host.state;
    assert.equal(turn.turnDuration, seconds * 1000);
    if (seconds) assert.ok(Math.abs(turn.deadline - turn.serverTime - seconds * 1000) < 50);
    else assert.equal(turn.deadline, null, 'unlimited turns never expose the private AI timer as a deadline');
    const reconnect = await client(url, '房主', host.session.token);
    await reconnect.until(c => !!c.state);
    assert.equal(reconnect.state.turnDuration, turn.turnDuration);
    assert.equal(reconnect.state.deadline, turn.deadline, 'reconnection preserves the public turn deadline');
    await reconnect.until(c => c.state.hand.history.some(action => action.seat === 1));
    if (seconds) assert.ok(reconnect.state.serverTime < turn.deadline, 'AI can act early without advertising when it will act');
    assert.equal(reconnect.errors.length, 0);
  });
}

test('forced blind all-ins keep results private and money conserved until dealing ends, even when the host stops', async t => {
  const { app, host } = await dealingRoom(t, { dealDelay: 250, nextDelay: 120 });
  const internal = app.rooms.get(host.state.code);
  internal.players[0].chips = 3; internal.players[1].chips = 4;
  internal.hand = new PokerHand({ players: internal.players, button: 0, smallBlind: 10, bigBlind: 20,
    deck: Array.from({ length: 52 }, (_, i) => i), number: internal.handNumber });
  assert.equal(internal.hand.done, true);
  internal.deal.boardCount = 5;
  host.send('stop'); await host.until(c => c.state.stopAfterHand);
  const pending = host.state;
  assert.equal(pending.dealing, true); assert.equal(pending.phase, 'playing');
  assert.equal(pending.hand.done, false); assert.equal(pending.hand.result, null);
  assert.equal(pending.hand.pot, 7);
  assert.equal(pending.hand.players.reduce((sum, p) => sum + p.chips + p.total, 0), 7);
  assert.deepEqual(pending.hand.players.find(p => p.id !== host.session.id).cards, [null, null]);
  await host.until(c => c.state.hand.done);
  assert.equal(host.state.phase, 'playing'); assert.equal(host.state.finishing, true);
  assert.equal(host.state.standings, null, 'the final sheet is withheld while the last hand result is visible');
  const resultEndsAt = host.state.deadline;
  assert.ok(resultEndsAt >= pending.deal.endsAt + 118);
  await host.until(c => c.state.phase === 'finished');
  assert.equal(host.state.dealing, false); assert.equal(host.state.hand.done, true);
  assert.equal(host.state.standings.reduce((sum, p) => sum + p.chips, 0), 7);
  assert.ok(host.state.serverTime >= resultEndsAt - 2);
  assert.equal(host.errors.length, 0);
});

test('a natural champion gets a full last-hand result countdown before the final sheet, including reconnects', async t => {
  const { app, host, url } = await dealingRoom(t, { dealDelay: 100, nextDelay: 350 });
  const internal = app.rooms.get(host.state.code);
  internal.players[0].chips = 3; internal.players[1].chips = 3;
  internal.hand = new PokerHand({ players: internal.players, button: 0, smallBlind: 10, bigBlind: 20,
    deck: Array.from({ length: 52 }, (_, i) => 51 - i), number: internal.handNumber });
  assert.equal(internal.hand.players.filter(p => p.chips > 0).length, 1, 'the fixture must have one champion rather than a split pot');
  internal.deal.boardCount = 5;
  await host.until(c => c.state.hand.done);
  const preview = host.state;
  assert.equal(preview.phase, 'playing'); assert.equal(preview.finishing, true);
  assert.equal(preview.standings, null); assert.equal(preview.resultDuration, 350);
  assert.ok(preview.hand.result.showdown); assert.equal(preview.hand.board.length, 5);
  assert.equal(preview.hand.players.filter(p => p.chips > 0).length, 1);
  const reconnect = await client(url, '房主', host.session.token);
  await reconnect.until(c => !!c.state);
  assert.equal(reconnect.state.phase, 'playing'); assert.equal(reconnect.state.finishing, true);
  assert.equal(reconnect.state.deadline, preview.deadline, 'reconnection cannot restart the final countdown');
  reconnect.send('reset'); await reconnect.until(c => c.errors.length > 0);
  assert.match(reconnect.errors.at(-1), /结算后/);
  await reconnect.until(c => c.state.phase === 'finished');
  assert.ok(reconnect.state.serverTime >= preview.deadline - 2);
  assert.equal(reconnect.state.deadline, null);
  const champions = reconnect.state.standings.filter(p => p.rank === 1);
  assert.equal(champions.length, 1); assert.equal(champions[0].chips, 6);
  assert.equal(reconnect.state.handNumber, preview.handNumber);
  reconnect.send('reset'); await reconnect.until(c => c.state.phase === 'lobby');
  assert.equal(reconnect.state.finishing, false); assert.equal(reconnect.state.deadline, null);
});

test('stopping during the result preview keeps its existing countdown and prevents the next hand', async t => {
  const { host, guest } = await dealingRoom(t, { dealDelay: 50, nextDelay: 500 });
  await host.until(c => !c.state.dealing);
  const actor = host.state.hand.actor === 0 ? host : guest;
  await actor.until(c => c.state.turnId === host.state.turnId);
  actor.send('action', { hand: actor.state.handNumber, turnId: actor.state.turnId, requestId: 'end-preview-hand', action: 'fold' });
  await host.until(c => c.state.hand.done);
  const preview = host.state;
  assert.equal(preview.finishing, false);
  assert.equal(preview.hand.players.filter(p => p.chips > 0).length, 2);
  await new Promise(resolve => setTimeout(resolve, 100));
  host.send('stop'); await host.until(c => c.state.finishing);
  assert.equal(host.state.phase, 'playing'); assert.equal(host.state.standings, null);
  assert.equal(host.state.deadline, preview.deadline);
  host.send('stop'); host.send('sync');
  await host.until(c => c.state.version > preview.version + 1);
  assert.equal(host.state.deadline, preview.deadline, 'repeated stop requests cannot extend the preview');
  await host.until(c => c.state.phase === 'finished');
  assert.ok(host.state.serverTime >= preview.deadline - 2);
  assert.equal(host.state.handNumber, preview.handNumber);
  assert.equal(host.state.standings.filter(p => p.rank === 1).length, 1);
  assert.equal(host.errors.length, 0);
});
