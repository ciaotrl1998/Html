'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../js/game');
const A = require('../js/autoplay');
const advance = (s, seconds) => { for (let i = 0; i < seconds * 10; i++) G.step(s, .1); };

test('both layouts generate deterministic 25×40 or 40×25 estates with one closed shared wall', () => {
  for (const layout of ['vertical', 'horizontal']) for (let seed = 0; seed < 128; seed++) {
    const s = G.createCoopState(Math.imul(seed, 2654435761) >>> 0, layout), land = G.estate(s);
    const width = G.worldWidth(s), height = G.worldHeight(s);
    assert.deepEqual([width, height], layout === 'vertical' ? [25, 40] : [40, 25]);
    assert.equal(s.version, 7);
    assert.equal(land.gates.length, 6);
    assert(land.sharedWall.size >= 5);
    assert([...land.estates[0].cells].every(k => !land.estates[1].cells.has(k)));
    assert.deepEqual(G.estate(G.createCoopState(s.mapSeed, layout)), land);
    for (const k of land.sharedWall) assert(!G.walkable(s, k % width, Math.floor(k / width)));
    for (const k of [...land.cells, ...land.walls, ...land.roads]) assert(k >= 0 && k < width * height);
    for (const e of land.estates) {
      const shrine = s.buildings.find(b => b.type === 'shrine' && b.owner === e.owner);
      const inward = layout === 'vertical' ? (e.owner ? 0 : 2) : (e.owner ? 3 : 1);
      assert(!e.gates.some(g => g.direction === inward));
      const terrain = [...e.cells].map(k => G.terrain(k % width, Math.floor(k / width), s));
      for (const type of ['plain', 'shore', 'forest', 'mountain']) assert(terrain.includes(type), `${layout}/${seed}: ${type}`);
      for (const g of e.gates) {
        assert(G.walkable(s, g.x, g.y));
        assert(G.findPath(s, g, shrine).length > 0);
        const cross = layout === 'vertical' ? 'y' : 'x';
        if (g.direction % 2 === (layout === 'vertical' ? 1 : 0)) assert(e.owner ? g[cross] < e.center[cross] : g[cross] > e.center[cross]);
      }
    }
    for (let d = 0; d < 4; d++) {
      const plots = G.spawnPlots(s, d); assert.equal(plots.length, 5);
      for (const p of plots) {
        assert(d === 0 ? p.y === 0 : d === 1 ? p.x === width - 1 : d === 2 ? p.y === height - 1 : p.x === 0);
        assert(Math.abs((d % 2 ? p.y : p.x) - Math.floor((d % 2 ? height : width) / 2)) <= 2);
        const path = G.findPath(s, p); assert(path.length);
        assert(path.every(p => G.walkable(s, p.x, p.y)));
      }
    }
    const loaded = G.restore(G.serialize(s)); assert(loaded);
    assert.deepEqual(G.estate(loaded), land);
  }
});

test('resources, building permissions, upgrades and skill cooldowns belong to each player', () => {
  const s = G.createCoopState(42), p = G.playerView(s, 1), other = p.buildings.find(b => b.type === 'shrine');
  s.coins = s.materials = 10000; p.coins = p.materials = 10000;
  assert(!G.upgrade(s, other).ok);
  const gate = p.buildings.find(b => b.type === 'gate'), originalCoins = s.coins;
  assert(G.upgrade(p, gate).ok);
  assert.equal(s.coins, originalCoins);
  assert(p.buildings.filter(b => b.type === 'gate').every(b => b.level === 2));
  assert(G.playerView(s).buildings.filter(b => b.type === 'gate').every(b => b.level === 1));
  const width = G.worldWidth(s);
  const plot = [...G.estate(p).cells].map(k => ({x:k % width,y:Math.floor(k / width)})).find(p => !G.buildReason(G.playerView(s, 1), 'quarry', p.x, p.y));
  assert(plot);
  assert(!G.build(s, 'quarry', plot.x, plot.y).ok);
  assert(G.build(p, 'quarry', plot.x, plot.y).ok);
  const before = p.materials;
  advance(s, 1);
  assert(p.materials > before);
  assert.equal(s.materials, 10000);
  assert(G.chooseSkill(p, 'thunder').ok);G.startNight(s); assert(G.skill(p, 'thunder').ok);
  assert.equal(s.cooldowns.thunder, 0); assert(p.cooldowns.thunder > 0);
  advance(s, .5); assert(p.cooldowns.thunder < G.SKILLS.thunder.cooldown);
});

test('three raid choices include simultaneous opposite spawns, double totals and two bosses', () => {
  for (const layout of ['vertical', 'horizontal']) for (const day of [1, 7, 20]) for (let choice = 0; choice < 3; choice++) {
    const s = G.createCoopState(42, layout), single = G.createState(42);
    s.day = single.day = day; s.direction = choice;
    G.startNight(single); G.startNight(s);
    assert.equal(s.wave.total, single.wave.total * 2);
    const dirs = G.raidDirections(s);
    assert.deepEqual(dirs, (layout === 'vertical' ? [[3],[1],[0,2]] : [[0],[2],[3,1]])[choice]);
    advance(s, .4); assert.equal(s.enemies.length, 2);
    const edge = e => e.y < 1 ? 0 : e.x > G.worldWidth(s) - 2 ? 1 : e.y > G.worldHeight(s) - 2 ? 2 : 3;
    assert(s.enemies.every(e => e.x >= 0 && e.y >= 0 && e.x <= G.worldWidth(s) - 1 && e.y <= G.worldHeight(s) - 1));
    assert.deepEqual(s.enemies.map(edge), dirs.length === 2 ? dirs : [dirs[0], dirs[0]]);
    assert(G.restore(G.serialize(s)));
    if (day === 7) { s.enemies = []; s.wave.spawned = s.wave.total - 2; s.wave.timer = 0; G.step(s, .1); assert.equal(s.enemies.filter(e => e.boss).length, 2); }
  }
});

test('every coop raid pair is assigned to the two intended gates, including both bosses', () => {
  for (const layout of ['vertical', 'horizontal']) for (let choice = 0; choice < 3; choice++) {
    const s = G.createCoopState(42, layout); s.direction = choice;
    G.startNight(s);
    const directions = G.raidDirections(s);
    const expected = owner => G.estate(s).gates.find(g => g.owner === owner && g.direction === (directions.length === 2 ? directions[owner] : directions[0]));
    for (let pair = 0; pair < 4; pair++) {
      s.wave.timer = 0; G.step(s, .1);
      const spawned = s.enemies.slice(-2);
      assert.equal(spawned.length, 2);
      for (let owner = 0; owner < 2; owner++) {
        const e = spawned[owner], gate = expected(owner), building = G.at(s, gate.x, gate.y);
        assert.equal(e.targetGateId, building.id);
        assert.equal(e.targetOwner, owner);
        assert(G.findPath(s, e).some(p => p.x === gate.x && p.y === gate.y));
      }
    }
    s.day = 7; s.wave.boss = true; s.wave.spawned = s.wave.total - 2; s.wave.timer = 0;
    G.step(s, .1);
    const bosses = s.enemies.slice(-2);
    assert(bosses.every(e => e.boss));
    assert.deepEqual(bosses.map(e => e.targetOwner), [0, 1]);
    assert.deepEqual(bosses.map(e => e.targetGateId), [0, 1].map(owner => G.at(s, expected(owner).x, expected(owner).y).id));
  }
});

test('assigned gate survives rerouting, a destroyed gate, and save/load', () => {
  for (const layout of ['vertical', 'horizontal']) {
    const s = G.createCoopState(42, layout); s.direction = 0; G.startNight(s);
    advance(s, .4);
    const [first, second] = s.enemies, gates = s.buildings.filter(b => b.type === 'gate' && b.direction === G.raidDirections(s)[0]);
    assert.equal(gates.length, 2);
    assert.notEqual(first.targetGateId, second.targetGateId);
    const target = s.buildings.find(b => b.id === second.targetGateId), route = G.findPath(s, second);
    assert(route.some(p => p.x === target.x && p.y === target.y));
    s.revision++;
    assert(G.findPath(s, second).some(p => p.x === target.x && p.y === target.y));
    target.hp = 0; s.revision++;
    assert(G.findPath(s, second).some(p => p.x === target.x && p.y === target.y));
    assert.equal(second.targetGateId, target.id);
    const restored = G.restore(G.serialize(s)); assert(restored);
    const reloaded = restored.enemies.find(e => e.id === second.id);
    assert.equal(reloaded.targetGateId, target.id);
    assert(G.findPath(restored, reloaded).some(p => p.x === target.x && p.y === target.y));
    const invalid = JSON.parse(G.serialize(restored));
    invalid.enemies.find(e => e.id === second.id).targetGateId = 987654;
    assert.equal(G.restore(JSON.stringify(invalid)), null);
    const old = JSON.parse(G.serialize(s));
    delete old.enemies[0].targetGateId; delete old.enemies[0].targetOwner;
    const oldSave = G.restore(JSON.stringify(old)); assert(oldSave);
    const legacyEnemy = oldSave.enemies[0];
    G.findPath(oldSave, legacyEnemy);
    assert(oldSave.buildings.some(b => b.id === legacyEnemy.targetGateId && b.type === 'gate'));
  }
});

test('enemies on each outer flank choose that estate and shared-side attackers choose a nearby gate', () => {
  for (const layout of ['vertical', 'horizontal']) {
    const s = G.createCoopState(42, layout), land = G.estate(s);
    const enemies = layout === 'vertical' ? [{x:12,y:0},{x:12,y:39}] : [{x:0,y:12},{x:39,y:12}];
    enemies.forEach((e, owner) => {
      const path = G.findPath(s, e), gate = path.map(p => G.at(s, p.x, p.y)).find(b => b?.type === 'gate');
      assert.equal(gate.owner, owner); assert.equal(e.targetOwner, owner);
    });
    for (const g of land.gates) {
      const [dx,dy] = [[0,-1],[1,0],[0,1],[-1,0]][g.direction];
      const e = {x:g.x+dx,y:g.y+dy}, path = G.findPath(s,e);
      assert.deepEqual(path[0], {x:g.x,y:g.y});
    }
  }
});

test('computer teammate develops only its own estate and survives save/reload', () => {
  let s = G.createCoopState(123);s.partner.coins=200;s.partner.materials=220;let pilot = A.create(G.playerView(s, 1));
  for (let i = 0; i < 1200 && !s.over; i++) {
    pilot.tick(.1); G.step(s, .1);
    if (i === 600) { s = G.restore(G.serialize(s)); assert(s); pilot = A.create(G.playerView(s, 1)); }
  }
  assert(!s.over); assert(pilot.report().builds > 0);
  assert.equal(G.playerView(s).buildings.length, 4);
  assert(G.playerView(s, 1).buildings.length > 10);
  for (const b of s.buildings) assert(G.owns(G.playerView(s, b.owner), b.x, b.y));
  assert(G.restore(G.serialize(s)));
});

test('coop save validation rejects invalid ownership, layout, levels and resources', () => {
  const original = G.serialize(G.createCoopState(42));
  for (const mutate of [s => s.coopLayout = 'diagonal', s => s.partner.coins = -1, s => s.buildings[0].owner = 1, s => s.partner.gateLevel = 3, s => s.direction = 3, s => s.worldSize = 41, s => s.worldHeight = 50, s => delete s.worldHeight, s => s.actorId = 1]) {
    const s = JSON.parse(original); mutate(s); assert.equal(G.restore(JSON.stringify(s)), null);
  }
});

test('random new games produce both orientations and retain dimensions through saves', () => {
  const layouts = new Set();
  for (let seed = 0; seed < 32; seed++) {
    const s = G.createCoopState(seed), saved = G.restore(G.serialize(s));
    layouts.add(s.coopLayout); assert(saved);
    assert.deepEqual([saved.worldSize, saved.worldHeight, saved.coopLayout], [s.worldSize, s.worldHeight, s.coopLayout]);
  }
  assert.equal(layouts.size, 2);
});

test('version 6 square coop saves retain their terrain, positions and dimensions', () => {
  for (const old of require('./fixtures/coop-v6.json')) {
    const s = G.restore(JSON.stringify(old)); assert(s);
    assert.equal(s.version, 6); assert.equal(G.worldWidth(s), 40); assert.equal(G.worldHeight(s), 40);
    assert.deepEqual(s.buildings.map(b => [b.x,b.y,b.owner]), old.buildings.map(b => [b.x,b.y,b.owner]));
    for (let d = 0; d < 4; d++) assert.equal(G.spawnPlots(s,d).length, 5);
    assert(G.restore(G.serialize(s)));
  }
});

test('earlier 25×50 and 50×25 saves retain their dimensions and building positions', () => {
  for (const old of require('./fixtures/coop-v7-long.json')) {
    const s = G.restore(JSON.stringify(old)); assert(s);
    assert.deepEqual([G.worldWidth(s), G.worldHeight(s)], old.coopLayout === 'vertical' ? [25,50] : [50,25]);
    assert.deepEqual(s.buildings.map(b=>[b.x,b.y,b.owner]),old.buildings.map(b=>[b.x,b.y,b.owner]));
    for (let d=0;d<4;d++) assert.equal(G.spawnPlots(s,d).length,5);
    assert(G.restore(G.serialize(s)));
  }
});

test('units and projectiles beyond coordinate 25 survive rectangular save validation and movement', () => {
  for (const layout of ['vertical', 'horizontal']) {
    const s = G.createCoopState(42,layout), p = G.playerView(s,1), shrine = p.buildings.find(b=>b.type==='shrine');
    const barracks = G.grantBuilding(p,'barracks',shrine.x+1,shrine.y);
    assert(barracks); s.direction=2; G.startNight(s); advance(s,.4);
    assert(s.soldiers.length);
    const target = s.enemies.find(e => layout === 'vertical' ? e.y > 25 : e.x > 25);
    assert(target);
    s.projectiles.push({type:'tower',targetId:target.id,damage:10,life:.2,total:.3,x:barracks.x,y:barracks.y,tx:target.x,ty:target.y});
    const restored=G.restore(G.serialize(s)); assert(restored); assert.equal(restored.projectiles.length,1);
    advance(restored,1);
    assert(restored.soldiers.every(u=>u.x>=0&&u.x<G.worldWidth(s)&&u.y>=0&&u.y<G.worldHeight(s)));
    const invalid=JSON.parse(G.serialize(s));invalid.enemies[0].y=G.worldHeight(s);assert.equal(G.restore(JSON.stringify(invalid)),null);
  }
});
