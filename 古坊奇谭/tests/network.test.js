'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { WebSocket } = require('ws');
const G = require('../js/game');
const N = require('../js/network');
const { createServer } = require('../server');

function plot(s, owner, type = 'tower') {
  const p = G.playerView(s, owner);
  return [...G.estate(p).cells].map(k => ({ x: k % G.worldWidth(s), y: Math.floor(k / G.worldWidth(s)) }))
    .find(({ x, y }) => !G.buildReason(p, type, x, y));
}
function stream(s, replicas) {
  let previous = N.delta(s).next, seq = 0;
  return (ack = 0, correction = true) => {
    const next = N.delta(s, previous); previous = next.next;
    seq++;
    for (const replica of replicas) assert.equal(replica.apply({ session: 1, seq, ack, ...next.message,
      ...(correction ? { economy: N.economy(s, replica.owner) } : {}) }), true);
    return next.message;
  };
}

test('replicas preserve state, estate and entity identity through motion, damage and economy corrections', () => {
  const s = G.createCoopState(42), replicas = [0, 1].map(owner => N.createReplica(N.snapshot(s, owner), owner, 1, 0));
  const publish = stream(s, replicas);
  const refs = replicas.map(r => ({ state: r.state, estate: G.estate(r.state), shrine: r.state.buildings[0] }));
  for (let i = 0; i < 12; i++) { G.step(s, .1); publish(0, i % 5 === 0); }
  s.buildings[0].hp -= 25; publish();
  replicas.forEach((r, i) => {
    assert.equal(r.state, refs[i].state); assert.equal(G.estate(r.state), refs[i].estate);
    assert.equal(r.state.buildings[0], refs[i].shrine); assert.equal(r.state.buildings[0].hp, s.buildings[0].hp);
    assert.equal(G.playerView(r.state, i).coins, G.playerView(s, i).coins);
    assert.equal(G.playerView(r.state, 1 - i).coins, 0);
  });
});

test('ordered prediction survives older updates, replaces temporary IDs, and rolls back rejected spending', () => {
  const s = G.createCoopState(42); s.coins = s.materials = 10000;
  const r = N.createReplica(N.snapshot(s, 0), 0, 1, 0), publish = stream(s, [r]);
  const a = { id: 1, kind: 'build', building: 'tower', ...plot(s, 0) };
  assert(r.act(a).ok); assert(G.at(r.state, a.x, a.y).id < 0);
  publish(0); assert(G.at(r.state, a.x, a.y).id < 0, 'Unconfirmed building survives unrelated frames');
  const built = G.build(s, 'tower', a.x, a.y).building; publish(1);
  assert.equal(G.at(r.state, a.x, a.y).id, built.id); assert.equal(r.pending.length, 0);
  const b = { id: 2, kind: 'upgrade', x: a.x, y: a.y };
  s.buildings.find(b => b.type === 'shrine' && b.owner === 0).level = 2; publish(1);
  assert(r.act(b).ok); assert.equal(G.at(r.state, a.x, a.y).level, 2);
  const funds = r.state.coins;
  publish(2); // Server rejected the upgrade: no authoritative level change.
  assert.equal(G.at(r.state, a.x, a.y).level, 1); assert(r.state.coins > funds); assert.equal(r.pending.length, 0);
});

test('local economics and skill prediction never move enemies, apply damage, or create soldiers', () => {
  const s = G.createCoopState(42); s.coins = s.materials = 10000;
  G.chooseSkill(s, 'thunder'); G.chooseSkill(G.playerView(s, 1), 'repel'); G.startNight(s); s.wave.timer = 0; G.step(s, .1);
  const r = N.createReplica(N.snapshot(s, 0), 0, 1, 0), enemies = JSON.stringify(r.state.enemies);
  assert(r.act({ id: 1, kind: 'skill', skill: 'thunder', x: 0, y: 0 }).ok);
  assert.equal(JSON.stringify(r.state.enemies), enemies);
  const p = plot(s, 0, 'barracks'); assert(p);
  assert(r.act({ id: 2, kind: 'build', building: 'barracks', ...p }).ok);
  assert.equal(r.state.soldiers.length, 0);
  const elapsed = r.state.elapsed;
  for (let i = 0; i < 8; i++) G.stepEconomy(G.playerView(r.state, 0), .25);
  assert.equal(r.state.elapsed, elapsed); assert.equal(JSON.stringify(r.state.enemies), enemies);
  assert(r.state.effects.every(e => e.type === 'income' && r.state.buildings.find(b => b.id === e.buildingId).owner === 0));
});

test('wire deltas omit paths, unchanged buildings and all per-building income progress', () => {
  const s = G.createCoopState(42), previous = N.delta(s).next;
  G.step(s, .25); const frame = N.delta(s, previous).message;
  assert.equal(frame.buildings.upsert.length, 0);
  s.buildings[0].hp--; const changed = N.delta(s, previous).message.buildings.upsert[0];
  for (const key of ['incomeTime', 'coinPending', 'materialPending', 'cooldown']) assert(!(key in changed));
  G.startNight(s); s.wave.timer = 0; G.step(s, .1);
  assert(N.delta(s).message.enemies.upsert.every(e => !('path' in e) && !('pathRevision' in e)));
});

test('replicas reject old sessions, duplicate frames and gaps without modifying confirmed state', () => {
  const s = G.createCoopState(42), r = N.createReplica(N.snapshot(s, 1), 1, 1, 0), next = N.delta(s).message;
  assert.equal(r.apply({ session: 0, seq: 1 }), false);
  assert.equal(r.apply({ session: 1, seq: 2 }), null);
  assert.equal(r.seq, 0);
  assert.equal(r.apply({ session: 1, seq: 1, ack: 0, ...next }), true);
  assert.equal(r.apply({ session: 1, seq: 1 }), false);
});

async function connection(url) {
  const socket = new WebSocket(url), messages = [], waiters = [];
  socket.on('message', raw => {
    const message = JSON.parse(String(raw)), i = waiters.findIndex(w => w.predicate(message));
    if (i >= 0) { const [waiter] = waiters.splice(i, 1); clearTimeout(waiter.timer); waiter.resolve(message); }
    else messages.push(message);
  });
  await once(socket, 'open');
  return { socket, messages, send: message => socket.send(JSON.stringify(message)), next(predicate) {
    const i = messages.findIndex(predicate);
    if (i >= 0) return Promise.resolve(messages.splice(i, 1)[0]);
    return new Promise((resolve, reject) => {
      const waiter = { predicate, resolve, timer: setTimeout(() => { waiters.splice(waiters.indexOf(waiter), 1); reject(new Error('Timed out waiting for network message')); }, 3000) };
      waiters.push(waiter);
    });
  } };
}

test('server runs both players, rejects client state injection, synchronizes damage and awards each kill once', async () => {
  const service = createServer();
  await new Promise(resolve => service.server.listen(0, '127.0.0.1', resolve));
  try {
    const url = `ws://127.0.0.1:${service.server.address().port}/ws`, host = await connection(url), guest = await connection(url);
    host.send({ type: 'create' }); const { code } = await host.next(m => m.type === 'created');
    guest.send({ type: 'join', code }); await guest.next(m => m.type === 'joined');
    host.send({ type: 'start' });
    const hs = await host.next(m => m.type === 'snapshot'), gs = await guest.next(m => m.type === 'snapshot');
    const room = service.rooms.get(code), state = room.state;
    assert.equal(hs.session, gs.session); assert.equal(JSON.parse(hs.snapshot).partner.coins, 0); assert.equal(JSON.parse(gs.snapshot).coins, 0);
    host.send({ type: 'action', session: hs.session, id: 1, kind: 'choose-skill', skill: 'thunder', x: 0, y: 0 });
    guest.send({ type: 'action', session: hs.session, id: 1, kind: 'choose-skill', skill: 'repel', x: 0, y: 0 });
    await host.next(m => m.type === 'result' && m.id === 1); await guest.next(m => m.type === 'result' && m.id === 1);
    const before = state.elapsed;
    await guest.next(m => m.type === 'delta' && m.meta.elapsed > before + .1);
    assert(state.elapsed > before, 'Server advances with no browser or client simulation');
    host.send({ type: 'presence', session: hs.session, paused: true });
    await host.next(m => m.type === 'delta' && m.paused && m.meta.elapsed > 0);
    host.send({ type: 'state', snapshot: G.serialize(G.createCoopState(123)) });
    G.startNight(state); state.wave.timer = 0; G.step(state, .1); state.wave.spawned = state.wave.total;
    state.buildings[0].hp -= 75; service.publish(room, true);
    const damaged = await guest.next(m => m.type === 'delta' && m.buildings.upsert.some(b => b.id === state.buildings[0].id && b.hp === state.buildings[0].hp));
    assert.equal(damaged.meta.phase, 'night'); assert.equal(room.state, state);
    const kills = state.kills, rewards = state.enemies.reduce((sum, e) => sum + G.ENEMIES[e.type].reward / 2, 0), coins = state.coins, allyCoins = state.partner.coins;
    host.send({ type: 'action', session: hs.session, id: 2, kind: 'skill', skill: 'thunder', x: 0, y: 0 });
    const result = await host.next(m => m.type === 'result' && m.id === 2); assert(result.ok);
    assert.equal(state.enemies.length, 0); assert.equal(state.kills, kills + 2);
    assert.equal(state.coins, coins + rewards); assert.equal(state.partner.coins, allyCoins + rewards);
    const death = await guest.next(m => m.type === 'delta' && m.enemies.remove.length === 2);
    assert.equal(death.meta.kills, state.kills); assert.equal(death.economy.player.coins, state.partner.coins);
    host.send({ type: 'action', session: hs.session, id: 2, kind: 'skill', skill: 'thunder', x: 0, y: 0 });
    guest.send({ type: 'resync' }); await guest.next(m => m.type === 'snapshot');
    assert.equal(state.kills, kills + 2); assert.equal(state.coins, coins + rewards);
    host.send({ type: 'save' }); const saved = await host.next(m => m.type === 'saved'); assert(G.restore(saved.snapshot));
  } finally { await service.close(); }
});
