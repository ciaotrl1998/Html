'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../js/game');
const N = require('../js/network');
const clone = value => JSON.parse(JSON.stringify(value));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function match() {
  const s = G.createMatch({ mode: 'coop', enemyCount: 2, mapSeed: 42, rotation: 0 });
  for (const p of s.players) { p.controller = 'human'; p.selectedSkill = 'thunder'; }
  return s;
}
function add(s, owner = 0, overrides = {}) {
  const home = G.estate(G.playerView(s, owner)).center;
  const u = { id: s.nextId++, owner, barracksId: 999999, troopType: 'infantry',
    x: home.x, y: home.y + 1, hp: 44, maxHp: 44, level: 1, baseDamage: 18,
    attack: 0, attackAt: 0, targetOwner: null, targetId: null, targetBuildingId: null,
    waypoint: null, slowed: 0, slowFactor: 1, repelled: 0, ...overrides };
  s.soldiers.push(u);
  return u;
}
function move(s, seconds) {
  while (seconds > 1e-8) {
    const dt = Math.min(1 / 30, seconds); s.elapsed += dt;
    G.stepSoldierMovement(s, dt); seconds -= dt;
  }
}

test('all factions keep moving between packets, stop at the prediction horizon and preserve confirmed state', () => {
  const s = match(), units = [0, 1, 2].map(owner => add(s, owner));
  const before = JSON.stringify(s), p = N.createMotionPredictor();
  p.sync(s, 10);
  p.advance(10.12);
  const early = units.map(u => p.position(u));
  p.advance(10.4);
  units.forEach((u, i) => assert(distance(early[i], p.position(u)) > G.SOLDIER_SPEED * .2));
  p.advance(10.5);
  const stopped = units.map(u => p.position(u));
  p.advance(20);
  units.forEach((u, i) => assert.deepEqual(p.position(u), stopped[i]));
  assert.equal(JSON.stringify(s), before, 'Prediction must never mutate the replica');
});

test('delayed updates reconcile on the current timeline without a packet jump or backward pull', () => {
  const s = match(), u = add(s), p = N.createMotionPredictor();
  p.sync(s, 10); p.advance(10.25);
  const before = p.position(u);
  move(s, .1); p.sync(s, 10.25);
  assert(distance(p.position(u), before) < 1e-8, 'Receiving a delayed position preserves the visible position');
  p.advance(10.3);
  assert(distance(p.position(u), before) > G.SOLDIER_SPEED * .04, 'Movement continues during correction');
  move(s, .2); p.sync(s, 10.3); p.advance(10.48);
  assert(distance(p.position(u), u) < G.SOLDIER_SPEED * .22, 'Display stays near the current server timeline');
});

test('small errors decay over 180ms; large corrections, snapshots, removals and reused IDs recover immediately', () => {
  const s = match(), u = add(s, 0, { repelled: 20 }), p = N.createMotionPredictor();
  p.sync(s, 10);
  const original = p.position(u);
  u.x += .3; s.elapsed += .1; p.sync(s, 10.1);
  assert(distance(p.position(u), original) < 1e-8);
  p.advance(10.19);
  assert(distance(p.position(u), u) > .01 && distance(p.position(u), u) < .15);
  p.advance(10.29); assert(distance(p.position(u), u) < 1e-8);
  u.x += 3; s.elapsed += .1; p.sync(s, 10.3);
  assert(distance(p.position(u), u) < 1e-8);
  u.x += .3; p.sync(s, 10.31, false, true);
  assert(distance(p.position(u), u) < 1e-8);
  s.soldiers = []; p.sync(s, 10.32);
  u.x += .3; s.soldiers = [u]; p.sync(s, 10.33);
  assert(distance(p.position(u), u) < 1e-8);
});

test('irregular ordered packet delivery stays continuous through repeated jitter and burst recovery', () => {
  const s = match(), u = add(s), p = N.createMotionPredictor();
  p.sync(s, 10);
  let arrival = 10;
  const packets = [];
  for (const jitter of [0, .08, .2, .01, .12, .22, 0, .04, .16, 0]) {
    move(s, .1);
    arrival = Math.max(arrival + .001, 10 + s.elapsed + jitter);
    packets.push({ state: clone(s), arrival });
  }
  let now = 10;
  for (const packet of packets) {
    while (now + 1 / 60 < packet.arrival) { now += 1 / 60; p.advance(now); }
    now = packet.arrival; p.advance(now);
    const before = p.position(u);
    p.sync(packet.state, now);
    assert(distance(p.position(u), before) < 1e-8, 'Jittered packets never jump the display');
    assert(distance(p.position(u), packet.state.soldiers[0]) < G.SOLDIER_SPEED * .35);
  }
  p.advance(now + .18);
  assert(distance(p.position(u), s.soldiers[0]) < G.SOLDIER_SPEED * .25);
});

test('pause, missing sequence and end of match freeze movement; resume rebases the clock', () => {
  const s = match(), u = add(s), p = N.createMotionPredictor();
  p.sync(s, 10); p.advance(10.1);
  const moving = p.position(u); p.advance(11, false);
  assert.deepEqual(p.position(u), moving);
  p.sync(s, 11, true); const stopped = p.position(u);
  p.advance(50); assert.deepEqual(p.position(u), stopped);
  p.sync(s, 50, false); p.advance(50.1);
  assert(distance(p.position(u), stopped) > G.SOLDIER_SPEED * .09);
  s.over = true; p.sync(s, 51); const ended = p.position(u);
  p.advance(52); assert.deepEqual(p.position(u), ended);
});

test('prediction follows turns and terrain, honors slowing and immobilization, and stops to attack without resolving damage', () => {
  const s = match(), u = add(s), before = clone(s);
  // Exercise several waypoints and a hostile gate without any server callbacks.
  const positions = [];
  for (let i = 0; i < 600; i++) {
    move(s, 1 / 30); positions.push({ x: u.x, y: u.y });
    assert(G.walkable(s, Math.round(u.x), Math.round(u.y)));
  }
  assert(positions.some(p => Math.abs(p.x - before.soldiers[0].x) > .5));
  assert(positions.some(p => Math.abs(p.y - before.soldiers[0].y) > .5));
  assert.deepEqual(s.buildings, before.buildings);
  assert.deepEqual(s.players, before.players);
  assert.equal(s.kills, 0); assert.equal(s.nextId, before.nextId);
  assert.equal(s.soldiers.length, 1); assert.deepEqual(s.projectiles, []);

  const normal = match(), a = add(normal), slow = clone(normal), b = slow.soldiers[0];
  b.slowed = 4; b.slowFactor = .4;
  const start = { x: a.x, y: a.y }; move(normal, .3); move(slow, .3);
  assert(Math.abs(distance(b, start) / distance(a, start) - .4) < .01);
  b.repelled = 4; const frozen = { x: b.x, y: b.y }; move(slow, .3);
  assert.equal(distance(b, frozen), 0);

  for (const troopType of ['infantry', 'archer']) {
    const combat = match(), attacker = add(combat, 0, { troopType });
    const target = add(combat, 2, { x: attacker.x + .5, y: attacker.y });
    const at = { x: attacker.x, y: attacker.y }; move(combat, .4);
    assert.equal(distance(attacker, at), 0);
    assert.equal(target.hp, 44); assert.equal(attacker.hp, 44);
    assert.equal(combat.projectiles.length, 0);
  }
});

test('wire deltas carry movement decisions, cooldowns and status changes including null/zero clearing', () => {
  const s = match(), u = add(s, 0, { waypoint: { x: 1, y: 2 }, targetOwner: 2, slowed: 4, slowFactor: .4, repelled: 1, attack: .8 });
  const initial = N.delta(s), row = initial.message.soldiers.upsert[0];
  for (const key of ['waypoint', 'targetOwner', 'slowed', 'slowFactor', 'repelled', 'attack']) assert.deepEqual(row[key], u[key]);
  assert(!('path' in row));
  const r = N.createReplica(N.snapshot(s, 0), 0, 1, 0);
  Object.assign(u, { waypoint: null, targetOwner: null, slowed: 0, slowFactor: 1, repelled: 0, attack: 0 });
  const patch = N.delta(s, initial.next).message;
  assert(r.apply({ session: 1, seq: 1, ack: 0, ...patch }));
  for (const key of ['waypoint', 'targetOwner', 'slowed', 'slowFactor', 'repelled', 'attack']) assert.deepEqual(r.state.soldiers[0][key], u[key]);
});
