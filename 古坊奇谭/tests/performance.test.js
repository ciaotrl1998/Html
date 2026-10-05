'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../js/game.js');

function building(s, type, x, y, level = 1, owner) {
  const b = { id: s.nextId++, type, x, y, level, hp: G.maxHP({ type, level }),
    cooldown: 0, incomeTime: 0, coinPending: 0, materialPending: 0 };
  if (owner !== undefined) b.owner = owner;
  s.buildings.push(b);
  return b;
}

// Use the uncached public formula as an oracle for the original settlement rules.
function checkSettlement(s, dt = .25) {
  const players = s.mode === 'coop' && s.actorId === undefined ? [G.playerView(s, 0), G.playerView(s, 1)] : [s];
  const payouts = [], expected = [];
  const balances = players.map(player => {
    const balance = { coins: player.coins, materials: player.materials };
    for (const b of player.buildings) {
      const d = G.DEFS[b.type];
      if (!d.income) continue;
      const next = { incomeTime: b.incomeTime + dt, coinPending: b.coinPending, materialPending: b.materialPending };
      next[d.resource === 'materials' ? 'materialPending' : 'coinPending'] += G.income(player, b) * dt;
      if (next.incomeTime >= 1 - 1e-8) {
        next.incomeTime = Math.max(0, next.incomeTime - 1);
        for (const [resource, pending] of [['coins', 'coinPending'], ['materials', 'materialPending']]) {
          const paid = Math.floor(next[pending] + 1e-8);
          next[pending] = Math.max(0, next[pending] - paid);
          balance[resource] += paid;
          if (paid > 0) payouts.push([b.id, resource, paid, b.x, b.y]);
        }
      }
      expected.push([b, next]);
    }
    return balance;
  });
  s.effects = [];
  G.step(s, dt);
  players.forEach((player, i) => assert.deepEqual({ coins: player.coins, materials: player.materials }, balances[i]));
  for (const [b, next] of expected) for (const key of Object.keys(next)) assert.equal(b[key], next[key], `${b.type}.${key}`);
  assert.deepEqual(s.effects.filter(e => e.type === 'income').map(e => [e.buildingId, e.resource, e.amount, e.x, e.y]), payouts);
}

test('cached settlement preserves fractions and detects direct dependency edits without revision changes', () => {
  const s = G.createState(null); s.mission = G.MISSIONS.length;
  const tea = building(s, 'tea', 7, 7), inn = building(s, 'inn', 7, 6);
  building(s, 'farm', 5, 8); building(s, 'well', 5, 9);
  building(s, 'mulberry', 10, 4); building(s, 'guild', 9, 9);
  building(s, 'port', 10, 9); const stage = building(s, 'stage', 9, 7);
  const revision = s.revision;
  const edits = [
    () => {}, () => {}, () => {}, () => {},
    () => { tea.level = 4; },
    () => { tea.x = 0; },
    () => { tea.x = 7; tea.y = 0; },
    () => { tea.y = 7; tea.type = 'mill'; },
    () => { stage.level = 9; },
    () => { s.day = 7; },
    () => { s.day = 8; },
    () => { building(s, 'stage', 6, 7, 2); },
    () => { s.buildings.splice(s.buildings.indexOf(stage), 1); },
    () => { s.buildings = s.buildings.map(b => ({ ...b })); },
    () => { s.buildings.reverse(); },
    () => { inn.type = 'bank'; }
  ];
  for (const edit of edits) { edit(); checkSettlement(s); }
  assert.equal(s.revision, revision);
});

test('coop caches isolate players and invalidate ownership through world and playerView settlement', () => {
  const s = G.createCoopState(42), p0 = G.playerView(s, 0), p1 = G.playerView(s, 1);
  s.mission = s.partner.mission = G.MISSIONS.length;
  const tea = building(s, 'tea', 12, 12, 2, 0);
  building(s, 'inn', 12, 13, 1, 0);
  building(s, 'mulberry', 12, 14, 1, 1);
  const stage = building(s, 'stage', 13, 13, 3, 0);
  for (let i = 0; i < 4; i++) checkSettlement(s);
  stage.owner = 1; checkSettlement(s);
  tea.owner = 1; checkSettlement(s);
  for (let i = 0; i < 4; i++) checkSettlement(p1);
  checkSettlement(p0);
  p1.buildings = p1.buildings.map(b => ({ ...b, level: b.level + 1 }));
  checkSettlement(s);
  s.day = 7; checkSettlement(p1); checkSettlement(s);
});

test('warm settlement inspects dependencies linearly once even with two coop players', () => {
  for (const coop of [false, true]) {
    const s = coop ? G.createCoopState(42) : G.createState(null);
    s.mission = G.MISSIONS.length;
    if (coop) s.partner.mission = G.MISSIONS.length;
    for (let i = 0; i < 60; i++) building(s, 'tea', i % 17, Math.floor(i / 17), 1, coop ? i % 2 : undefined);
    const stage = building(s, 'stage', 0, 0, 1, coop ? 0 : undefined);
    let reads = 0;
    Object.defineProperty(stage, 'x', { enumerable: true, get() { reads++; return 0; } });
    G.step(s, .1); assert(reads > 30, 'cold settlement calculates bonuses');
    reads = 0;
    G.step(s, .1); assert.equal(reads, 1, 'one world signature and no repeated bonus scans');
  }
});

test('income cache adds no state or save fields and reload preserves pending payouts', () => {
  const s = G.createState(null); s.mission = G.MISSIONS.length;
  building(s, 'tea', 7, 8); building(s, 'stage', 7, 7);
  const keys = Object.keys(s), buildingKeys = s.buildings.map(b => Object.keys(b));
  checkSettlement(s); checkSettlement(s);
  assert.deepEqual(Object.keys(s), keys);
  assert.deepEqual(s.buildings.map(b => Object.keys(b)), buildingKeys);
  const saved = JSON.parse(G.serialize(s));
  assert.deepEqual(Object.keys(saved), keys);
  const loaded = G.restore(JSON.stringify(saved)); assert(loaded);
  for (let i = 0; i < 10; i++) { checkSettlement(s); checkSettlement(loaded); }
  assert.equal(loaded.coins, s.coins);
  assert.deepEqual(loaded.buildings.map(b => [b.incomeTime, b.coinPending, b.materialPending]),
    s.buildings.map(b => [b.incomeTime, b.coinPending, b.materialPending]));
});

function combatScene(type = 'tower') {
  const s = G.createState(null); s.mission = G.MISSIONS.length;
  const tower = building(s, type, 8, 7);
  G.startNight(s); s.wave.spawned = s.wave.total;
  const enemy = (x, y, hp = 100) => ({ id: s.nextId++, type: 'bandit', x, y, hp, maxHp: 100,
    speed: .65, damage: 14, attack: 0, repelled: 10, path: [], pathRevision: -1 });
  s.enemies = [enemy(8, 3), enemy(9, 7), enemy(7, 7), enemy(8, 12), enemy(8, 7, 0)];
  return { s, tower };
}

test('cooling towers do no distance checks and ready towers scan once with stable nearest ties', t => {
  const { s, tower } = combatScene();
  const hypot = t.mock.method(Math, 'hypot');
  tower.cooldown = .5;
  G.step(s, .25);
  assert.equal(tower.cooldown, .25); assert.equal(s.projectiles.length, 0);
  assert.equal(hypot.mock.callCount(), 0);
  G.step(s, .25);
  assert.equal(hypot.mock.callCount(), 4, 'one distance check per living enemy');
  assert.equal(s.projectiles.length, 1);
  assert.equal(s.projectiles[0].targetId, s.enemies[1].id);
  assert.equal(s.projectiles[0].damage, 22);
  assert.equal(tower.cooldown, G.DEFS.tower.interval);
  assert.equal(s.enemies[1].hp, 100, 'arrows retain delayed impact');
});

test('ready towers retain cooldown without a target and include enemies on the range boundary', () => {
  const { s, tower } = combatScene();
  s.enemies = [s.enemies[3]];
  G.step(s, .1); assert.equal(s.projectiles.length, 0); assert.equal(tower.cooldown, -.1);
  s.enemies[0].y = 3;
  G.step(s, .1); assert.equal(s.projectiles[0].targetId, s.enemies[0].id);
});

test('rock targeting preserves nearest tie order and immediate splash damage', () => {
  const { s } = combatScene('rock');
  s.enemies[2].x = 9.5;
  G.step(s, .1);
  assert.equal(s.projectiles[0].tx, 9); assert.equal(s.projectiles[0].ty, 7);
  assert.equal(s.enemies[1].hp, 54); assert.equal(s.enemies[2].hp, 54);
  assert.equal(s.enemies[0].hp, 100);
});
