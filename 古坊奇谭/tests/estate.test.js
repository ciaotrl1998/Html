'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../js/game.js');
const seeds = [...Array.from({length:256}, (_, i) => Math.imul(i, 2654435761) >>> 0), 0xffffffff];
const directions = [[0,-1],[1,0],[0,1],[-1,0]];
const maps = seeds.map(seed => {
  const state = G.createState(seed);
  state.coins = state.materials = 1e9;
  return {seed, state, land:G.estate(state), size:G.worldSize(state)};
});
function flood(size, starts, accepts) {
  const reached = new Set(starts.filter(accepts)), queue = [...reached];
  for (let i = 0; i < queue.length; i++) {
    const x = queue[i] % size, y = Math.floor(queue[i] / size);
    for (const [dx,dy] of directions) {
      const nx = x + dx, ny = y + dy, key = ny * size + nx;
      if (nx >= 0 && ny >= 0 && nx < size && ny < size && !reached.has(key) && accepts(key)) {
        reached.add(key);queue.push(key);
      }
    }
  }
  return reached;
}
const advance = (s, seconds) => { for (let i = 0; i < Math.round(seconds * 10); i++) G.step(s,.1); };
function attacker(s, x, y) {
  return {id:s.nextId++,type:'bandit',x,y,hp:100,maxHp:100,damage:14,speed:2,attack:0,repelled:0,slowed:0,slowFactor:1,path:[],pathRevision:-1};
}

test('257 estates are deterministic, four-connected and have no enclosed holes', () => {
  for (const {seed,state,land,size} of maps) {
    const label = `seed ${seed}`, center = G.worldCenter(state), root = center * size + center;
    assert(land.cells.has(root),label);
    assert.equal(flood(size,[root],key => land.cells.has(key)).size,land.cells.size,label);
    const outside = flood(size,[0],key => !land.cells.has(key));
    assert.equal(outside.size,size * size - land.cells.size,`${label}: hole`);
    assert.deepEqual(G.estate(G.createState(seed)),land,`${label}: deterministic`);
    const saved = G.restore(G.serialize(state));assert(saved,label);
    assert.deepEqual(G.estate(saved),land,`${label}: save reproduction`);
  }
});

test('257 estates have closed walls, four cardinal gates and at least five tiles of margin including walls', () => {
  for (const {seed,state,land,size} of maps) {
    const label = `seed ${seed}`, center = G.worldCenter(state);
    assert.equal(land.gates.length,4,label);
    assert.deepEqual(land.gates.map(g => g.direction).sort(),[0,1,2,3],label);
    const gateKeys = new Set(land.gates.map(g => g.y * size + g.x));assert.equal(gateKeys.size,4,label);
    for (const key of [...land.cells,...land.walls,...gateKeys]) {
      const x = key % size, y = Math.floor(key / size);
      assert(x >= 5 && y >= 5 && x <= size - 6 && y <= size - 6,`${label}: margin ${x},${y}`);
      assert.equal(G.owns(state,x,y),true,label);
    }
    for (const key of land.walls) {
      assert(!land.cells.has(key) && !gateKeys.has(key),label);
      assert.equal(G.isWall(state,key % size,Math.floor(key / size)),true,label);
      assert.equal(G.walkable(state,key % size,Math.floor(key / size)),false,label);
    }
    for (const g of land.gates) {
      const [dx,dy] = directions[g.direction];
      assert(g.direction % 2 ? g.y === center : g.x === center,`${label}: gate axis`);
      assert(land.cells.has((g.y - dy) * size + g.x - dx),`${label}: gate inward`);
      assert(!G.owns(state,g.x + dx,g.y + dy),`${label}: gate outward`);
      assert.equal(G.isWall(state,g.x,g.y),false,label);
      const b = G.at(state,g.x,g.y);assert.equal(b?.type,'gate',label);assert.equal(b.direction,g.direction,label);
    }
    // Ignore terrain so even water cannot conceal a gap in the wall enclosure.
    const outside = flood(size,[0],key => !land.walls.has(key) && !gateKeys.has(key));
    assert(![...land.cells].some(key => outside.has(key)),`${label}: wall leak`);
  }
});

test('257 estates connect only gate roads to the shrine and each gate outward to a map edge', () => {
  for (const {seed,state,land,size} of maps) {
    const label = `seed ${seed}`, center = G.worldCenter(state);
    const reached = flood(size,[center * size + center],key => G.walkable(state,key % size,Math.floor(key / size)));
    for (const key of land.roads) {
      assert(reached.has(key),`${label}: isolated road ${key}`);
      assert(key % size === center || Math.floor(key / size) === center,`${label}: road outside gate routes ${key}`);
    }
    for (const key of land.cells) if (G.terrain(key % size,Math.floor(key / size),state) === 'water' && key % size !== center && Math.floor(key / size) !== center) {
      assert(!land.roads.has(key),`${label}: extra bridge ${key}`);
      assert.equal(G.walkable(state,key % size,Math.floor(key / size)),false,`${label}: water without a road`);
    }
    for (const g of land.gates) {
      assert(reached.has(g.y * size + g.x),`${label}: unreachable gate`);
      const [dx,dy] = directions[g.direction];
      for (let x = g.x, y = g.y; x >= 0 && y >= 0 && x < size && y < size; x += dx,y += dy) {
        assert(land.roads.has(y * size + x),`${label}: missing outward road ${x},${y}`);
        assert(G.walkable(state,x,y),`${label}: blocked outward road ${x},${y}`);
      }
      const path = G.findPath(state,{x:g.x + dx,y:g.y + dy,type:'bandit',damage:14});
      assert(path.length,`${label}: enemy route`);
      assert.deepEqual(path.at(-1),{x:center,y:center},label);
      let prev = {x:g.x + dx,y:g.y + dy};
      for (const p of path) {
        assert.equal(Math.abs(p.x - prev.x) + Math.abs(p.y - prev.y),1,label);
        assert(G.walkable(state,p.x,p.y),label);prev = p;
      }
    }
  }
});

test('257 estates contain buildable plain, forest, mountain and shore economy plots', () => {
  for (const {seed,state,land,size} of maps) for (const [terrain,type] of [['plain','tea'],['forest','mulberry'],['mountain','quarry'],['shore','farm']]) {
    const key = [...land.cells].find(key => G.terrain(key % size,Math.floor(key / size),state) === terrain && !G.buildReason(state,type,key % size,Math.floor(key / size)));
    assert.notEqual(key,undefined,`seed ${seed}: missing buildable ${terrain}/${type}`);
    const s = G.createState(seed);s.coins = s.materials = 1e9;
    assert.equal(G.build(s,type,key % size,Math.floor(key / size)).ok,true,`seed ${seed}: ${type}`);
  }
});

test('257 estates overlay walls and bridges without rewriting any underlying terrain', () => {
  const wallTypes = new Set();let waterBridge = false;
  for (const {seed,state,land,size} of maps) {
    const terrainOnly = {worldSize:size,mapSeed:seed,mapGeneration:state.mapGeneration};
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      assert.equal(G.terrain(x,y,state),G.terrain(x,y,terrainOnly),`seed ${seed}: altered ${x},${y}`);
      if (land.walls.has(y * size + x)) wallTypes.add(G.terrain(x,y,state));
      if (land.roads.has(y * size + x) && G.terrain(x,y,state) === 'water') {
        waterBridge = true;assert(G.walkable(state,x,y));
      }
    }
  }
  assert(waterBridge,'Road coverage must exercise a water bridge');
  for (const type of ['plain','shore','water','forest','mountain']) assert(wallTypes.has(type),`Walls must exercise ${type}`);
});

test('257 estates reject outside construction, grants, fortune, upgrading and demolition atomically', () => {
  for (const {seed,size} of maps) {
    const s = G.createState(seed);s.coins = s.materials = 1e9;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!G.owns(s,x,y) || G.isWall(s,x,y)) {
      const before = G.serialize(s);
      assert.equal(G.build(s,'tower',x,y).ok,false,`seed ${seed}: outside tower`);
      assert.equal(G.build(s,'fortune',x,y).ok,false,`seed ${seed}: outside fortune`);
      assert.equal(G.grantBuilding(s,'tower',x,y),null);
      assert.deepEqual(G.fortuneCandidates(s,x,y),[]);
      assert.equal(G.serialize(s),before);
    }
    const tower = G.grantBuilding(s,'tower',12,11);assert(tower);
    const wall = [...G.estate(s).walls][0];
    for (const [x,y] of [[0,0],[wall % size,Math.floor(wall / size)]]) {
      tower.x = x;tower.y = y;
      const before = G.serialize(s);
      assert.equal(G.upgrade(s,tower).ok,false);
      assert.equal(G.demolish(s,tower).ok,false);
      assert.equal(G.serialize(s),before);
    }
  }
});

test('gates cannot be built, granted, rolled or demolished; upgrades scale HP and preserve damage ratio', () => {
  for (const {seed} of maps) {
    const s = G.createState(seed);s.coins = s.materials = 1e9;
    const before = G.serialize(s);
    assert.equal(G.build(s,'gate',12,11).ok,false);
    assert.equal(G.grantBuilding(s,'gate',12,11),null);
    for (const key of G.estate(s).cells) assert(!G.fortuneCandidates(s,key % 25,Math.floor(key / 25)).some(d => d.id === 'gate'));
    for (const gate of s.buildings.filter(b => b.type === 'gate')) {
      assert.equal(G.demolish(s,gate).ok,false);
      assert.equal(G.build(s,'fortune',gate.x,gate.y).ok,false);
      assert.equal(G.grantBuilding(s,'tower',gate.x,gate.y),null);
    }
    assert.equal(G.serialize(s),before);
    const shrine = s.buildings[0];shrine.level = 15;shrine.hp = G.maxHP(shrine);
    const gates = s.buildings.filter(b => b.type === 'gate'),ratios = [0,.25,.5,1];
    assert.equal(s.gateLevel,1);
    gates.forEach((gate,i) => {gate.hp = G.maxHP(gate) * ratios[i];});
    const selected = gates[seed % 4],oldMax = G.maxHP(selected),cost = G.upgradeCost(selected),coins = s.coins,materials = s.materials,revision = s.revision;
    assert.equal(G.upgrade(s,selected).ok,true);
    assert.equal(s.gateLevel,2);
    for (const [i,gate] of gates.entries()) {
      assert.equal(gate.level,2);assert.equal(G.maxHP(gate),Math.round(oldMax * G.HP_GROWTH));
      assert.equal(gate.hp,G.maxHP(gate) * ratios[i]);
    }
    assert.equal(s.coins,coins - cost.coins);assert.equal(s.materials,materials - cost.materials);
    assert(s.revision > revision);
  }
});

test('unified gate upgrades reject either resource shortage without changing any gate or state', () => {
  for (const resource of ['coins','materials']) {
    const s = G.createState(42),gates = s.buildings.filter(b => b.type === 'gate');
    s.buildings[0].level = 2;s.buildings[0].hp = G.maxHP(s.buildings[0]);
    s.coins = s.materials = 1000;gates[0].hp = 0;gates[1].hp /= 2;
    s[resource] = G.upgradeCost(gates[0])[resource] - 1;
    const before = G.serialize(s);
    assert.match(G.upgradeReason(s,gates[0]),/差/);
    assert.equal(G.upgrade(s,gates[0]).ok,false);
    assert.equal(G.serialize(s),before,resource);
  }
});

test('attackers choose the nearest gate route even when it has stronger gates and buildings', () => {
  for (const seed of seeds) {
    const s = G.createState(seed), size = G.worldSize(s), center = G.worldCenter(s);
    for (const g of G.estate(s).gates) {
      const [dx,dy] = directions[g.direction], gate = G.at(s,g.x,g.y);
      const e = attacker(s,g.direction === 1 ? size - 1 : g.direction === 3 ? 0 : g.x,g.direction === 0 ? 0 : g.direction === 2 ? size - 1 : g.y);
      const direct = G.findPath(s,e);
      assert.equal(direct.length,Math.abs(e.x - center) + Math.abs(e.y - center),`seed ${seed}: direct distance`);
      gate.level = 9;gate.hp = G.maxHP(gate);
      const tower = G.grantBuilding(s,'tower',g.x - dx,g.y - dy,9);
      const blocked = G.findPath(s,e);
      assert.deepEqual(blocked,direct,`seed ${seed}: durability changed route`);
      const gateStep = blocked.findIndex(p => p.x === g.x && p.y === g.y);
      assert(gateStep >= 0,`seed ${seed}: nearest gate skipped`);
      assert.equal(blocked.filter(p => G.at(s,p.x,p.y)?.type === 'gate').length,1);
      assert.deepEqual(blocked.at(-1),{x:center,y:center});
      if (tower) s.buildings = s.buildings.filter(b => b !== tower);
      gate.hp = 0;
      assert.deepEqual(G.findPath(s,e),direct,`seed ${seed}: broken gate changed route`);
    }
  }
});

test('each cardinal gate blocks attackers until destroyed, then permits passage', () => {
  for (const direction of [0,1,2,3]) {
    const s = G.createState(42),gate = s.buildings.find(b => b.type === 'gate' && b.direction === direction);
    const [dx,dy] = directions[direction];
    G.startNight(s);s.wave.spawned = s.wave.total;
    const e = attacker(s,gate.x + dx,gate.y + dy);s.enemies = [e];
    advance(s,2);
    assert(gate.hp > 0 && gate.hp < G.maxHP(gate),`direction ${direction}: attack gate`);
    assert.equal(e.x,gate.x + dx);assert.equal(e.y,gate.y + dy);
    assert.equal(s.buildings[0].hp,G.maxHP(s.buildings[0]));
    gate.hp = 1;e.attack = 0;const revision = s.revision;
    G.step(s,.1);
    assert.equal(gate.hp,0);assert(s.buildings.includes(gate));assert(s.revision > revision);
    advance(s,1.2);
    assert((e.x - gate.x) * dx + (e.y - gate.y) * dy < 0,`direction ${direction}: pass destroyed gate`);
  }
});

test('repair delays a destroyed gate while occupied or being crossed and invalidates paths on resurrection', () => {
  for (const offset of [0,.75]) {
    const s = G.createState(42),gate = s.buildings.find(b => b.type === 'gate' && b.direction === 0);
    gate.hp = 0;G.startNight(s);s.wave.spawned = s.wave.total;
    const e = attacker(s,gate.x,gate.y - offset);e.path = [{x:gate.x,y:gate.y}];e.pathRevision = s.revision;s.enemies = [e];
    const revision = s.revision;
    assert.equal(G.skill(s,'repair').ok,true);assert.equal(gate.hp,0);assert.equal(s.revision,revision);
    assert.equal(e.pathRevision,revision);
    e.y = 0;e.path = [{x:24,y:24}];s.cooldowns.repair = 0;
    assert.equal(G.skill(s,'repair').ok,true);
    assert.equal(gate.hp,G.maxHP(gate) * .35);assert(s.revision > revision);
    assert.deepEqual(e.path,[]);assert.equal(e.pathRevision,-1);
    G.step(s,.1);assert.equal(e.pathRevision,s.revision);
    assert(e.path.some(p => p.x === gate.x && p.y === gate.y));
  }
  const s = G.createState(42),gate = s.buildings.find(b => b.type === 'gate');gate.hp = 0;
  const e = attacker(s,gate.x,gate.y);s.enemies = [e];const revision = s.revision;
  advance(s,1);assert.equal(gate.hp,0);assert.equal(s.revision,revision);
  e.y = 0;e.path = [{x:24,y:24}];e.pathRevision = revision;
  advance(s,1);assert.equal(gate.hp,G.maxHP(gate) * .1);assert(s.revision > revision);
  assert.deepEqual(e.path,[]);assert.equal(e.pathRevision,-1);
});

test('estate saves preserve partially damaged and destroyed gates and reject malformed estate data', () => {
  const s = G.createState(42),gates = s.buildings.filter(b => b.type === 'gate');
  s.coins = s.materials = 1000;s.buildings[0].level = 2;s.buildings[0].hp = G.maxHP(s.buildings[0]);
  assert.equal(G.upgrade(s,gates[0]).ok,true);
  gates[0].hp = 0;gates[1].hp = 123.5;
  const restored = G.restore(G.serialize(s));assert(restored);
  assert.equal(restored.worldSize,25);assert.equal(restored.version,5);
  assert.equal(restored.gateLevel,2);
  assert.deepEqual(restored.buildings.filter(b => b.type === 'gate'),gates);
  const mutations = [
    ['inconsistent gate level',s => {s.buildings[1].level = 3;}],
    ['inconsistent shared level',s => {s.gateLevel = 3;}],
    ...[null,0,-1,.5,10,'1'].map(value => ['invalid shared level '+value,s => {s.gateLevel = value;}]),
    ['missing gate',s => {s.buildings.splice(1,1);}],
    ['duplicate gate',s => {s.buildings.push({...s.buildings[1],id:99});}],
    ['wrong direction',s => {s.buildings[1].direction = 1;}],
    ['missing direction',s => {delete s.buildings[1].direction;}],
    ['moved gate',s => {s.buildings[1].x++;}],
    ['negative gate HP',s => {s.buildings[1].hp = -1;}],
    ['excess gate HP',s => {s.buildings[1].hp = 1e9;}],
    ['zero shrine HP',s => {s.buildings[0].hp = 0;}],
    ['outside shrine',s => {s.buildings[0].x = 0;}],
    ['outside building',s => {s.buildings.push({...s.buildings[0],type:'tower',id:99,x:0,y:0,hp:300});}],
    ['wall building',s => {const key = [...G.estate(s).walls][0];s.buildings.push({...s.buildings[0],type:'tower',id:99,x:key % 25,y:Math.floor(key / 25),hp:300});}],
    ['missing estate seed',s => {delete s.estateSeed;}],
    ['missing map seed',s => {delete s.mapSeed;}],
    ['fractional estate seed',s => {s.estateSeed = .5;}],
    ['negative estate seed',s => {s.estateSeed = -1;}],
    ['oversized estate seed',s => {s.estateSeed = 0x100000000;}],
    ['invalid size',s => {s.worldSize = 24;}],
    ['legacy size with estate',s => {s.worldSize = 17;}],
    ['legacy version with estate',s => {s.version = 4;}]
  ];
  for (const [label,mutate] of mutations) {
    const saved = JSON.parse(G.serialize(s));mutate(saved);
    assert.equal(G.restore(JSON.stringify(saved)),null,label);
  }
});

test('old independent gate upgrades migrate to the highest level and preserve each HP ratio', () => {
  const s = G.createState(42),raw = JSON.parse(G.serialize(s)),ratios = [0,.25,.5,1],levels = [2,4,1,3];
  delete raw.gateLevel;
  const gates = raw.buildings.filter(b => b.type === 'gate');
  gates.forEach((gate,i) => {gate.level = levels[i];gate.hp = G.maxHP(gate) * ratios[i];});
  const restored = G.restore(JSON.stringify(raw));assert(restored);
  assert.equal(restored.gateLevel,4);assert.equal(restored.coins,s.coins);assert.equal(restored.materials,s.materials);
  restored.buildings.filter(b => b.type === 'gate').forEach((gate,i) => {
    assert.equal(gate.level,4);assert.equal(gate.hp,G.maxHP(gate) * ratios[i]);
  });
  const reloaded = G.restore(G.serialize(restored));assert(reloaded);
  assert.equal(reloaded.gateLevel,4);
  assert.deepEqual(reloaded.buildings,restored.buildings);
});

test('old 17x17 saves without worldSize or estate metadata remain playable', () => {
  for (const procedural of [false,true]) {
    const s = G.createState(null);
    if (procedural) s.mapSeed = 42;
    const raw = JSON.parse(G.serialize(s));delete raw.worldSize;
    const restored = G.restore(JSON.stringify(raw));assert(restored);
    assert.equal(G.worldSize(restored),17);assert.equal(G.worldCenter(restored),8);
    assert.equal(restored.version,4);assert.equal(G.estate(restored),null);
    assert.equal(restored.buildings.length,1);assert.deepEqual(restored.buildings[0],s.buildings[0]);
    for (let y = 0; y < 17; y++) for (let x = 0; x < 17; x++) assert.equal(G.terrain(x,y,restored),G.terrain(x,y,s));
    restored.coins = restored.materials = 1e6;
    assert.equal(G.build(restored,'tower',8,7).ok,true);
    assert.equal(G.build(restored,'tower',17,7).ok,false);
    assert(G.findPath(restored,{x:8,y:0,type:'bandit',damage:14}).length);
    assert(G.restore(G.serialize(restored)));
  }
});
