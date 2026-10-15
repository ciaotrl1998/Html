'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../js/game.js');

// Spread seeds over the uint32 range, including its upper boundary.
const seeds = [...Array.from({length:256}, (_, i) => Math.imul(i, 2654435761) >>> 0), 0xffffffff];
const snapshot = s => {
  const size = G.worldSize(s);
  return Array.from({length:size * size}, (_, i) => G.terrain(i % size, Math.floor(i / size), s));
};
function neighbors(i, diagonal = false) {
  const x = i % G.SIZE, y = Math.floor(i / G.SIZE), result = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if ((!dx && !dy) || (!diagonal && Math.abs(dx) + Math.abs(dy) !== 1)) continue;
    if (x + dx >= 0 && x + dx < G.SIZE && y + dy >= 0 && y + dy < G.SIZE) result.push((y + dy) * G.SIZE + x + dx);
  }
  return result;
}
function components(cells, accepts) {
  const visited = new Set(), result = [];
  for (let i = 0; i < cells.length; i++) {
    if (visited.has(i) || !accepts(cells[i])) continue;
    const queue = [i];visited.add(i);
    for (let n = 0; n < queue.length; n++) for (const next of neighbors(queue[n])) {
      if (!visited.has(next) && accepts(cells[next])) { visited.add(next);queue.push(next); }
    }
    result.push(queue);
  }
  return result;
}
const maps = seeds.map(seed => {
  const state = G.createState(seed, 1), cells = snapshot(state);
  const water = components(cells, type => type === 'water').sort((a, b) => b.length - a.length);
  return {seed, state, cells, water};
});
const coordinate = i => `${i % G.SIZE},${Math.floor(i / G.SIZE)}`;

const varied = seeds.map(seed => {const state=G.createState(seed);return {seed,state,cells:snapshot(state)};});
test('new geography varies river sides, lakes, resource locations and estate outlines across 257 seeds', () => {
  const riverSides=new Set(),lakeQuadrants=new Set(),outlines=new Set(),gatePositions=Array.from({length:4},()=>new Set());
  const resourceQuadrants={forest:new Set(),mountain:new Set()};
  for(const {state,cells} of varied){
    const water=components(cells,t=>t==='water').sort((a,b)=>b.length-a.length),river=water[0];
    assert(river.length>23);
    const xs=river.map(k=>k%25),ys=river.map(k=>Math.floor(k/25));
    if(Math.min(...ys)===1 && Math.max(...ys)===23)riverSides.add(xs.reduce((a,b)=>a+b)/xs.length<12?'west':'east');
    else {assert.equal(Math.min(...xs),1);assert.equal(Math.max(...xs),23);riverSides.add(ys.reduce((a,b)=>a+b)/ys.length<12?'north':'south');}
    assert(water.length>=2,'At least one separate lake');
    for(const lake of water.slice(1)){
      assert(lake.length>=5,'No tiny accidental water pockets');
      const x=lake.reduce((sum,k)=>sum+k%25,0)/lake.length,y=lake.reduce((sum,k)=>sum+Math.floor(k/25),0)/lake.length;
      lakeQuadrants.add((x<12?'W':'E')+(y<12?'N':'S'));
    }
    for(const type of ['forest','mountain'])cells.forEach((t,k)=>{if(t===type)resourceQuadrants[type].add((k%25<12?'W':'E')+(Math.floor(k/25)<12?'N':'S'));});
    const land=G.estate(state);outlines.add([...land.cells].join(','));
    land.gates.forEach(g=>gatePositions[g.direction].add(`${g.x},${g.y}`));
  }
  assert.equal(riverSides.size,4);assert.equal(lakeQuadrants.size,4);
  assert.equal(resourceQuadrants.forest.size,4);assert.equal(resourceQuadrants.mountain.size,4);
  assert(outlines.size>150,'Estate outline must vary substantially');
  assert(gatePositions.every(s=>s.size>=3),'Every gate can move with its boundary');
  assert.equal(new Set(varied.map(m=>m.cells.join(','))).size,seeds.length);
});

test('257 new maps preserve the dry starting core, shore rings, connected land and deterministic saves', () => {
  for(const {seed,state,cells} of varied){
    for(let y=10;y<=14;y++)for(let x=10;x<=14;x++)assert.equal(cells[y*25+x],'plain',`core ${seed}`);
    const land=components(cells,t=>t!=='water');assert.equal(land.length,1,`connected land ${seed}`);
    for(let k=0;k<625;k++){
      if(cells[k]==='water')assert(neighbors(k,true).every(j=>['water','shore'].includes(cells[j])),`shore ring ${seed}`);
      if(cells[k]==='shore')assert(neighbors(k,true).some(j=>cells[j]==='water'),`real shore ${seed}`);
    }
    assert.deepEqual(snapshot(G.createState(seed)),cells);
    const restored=G.restore(G.serialize(state));assert(restored);assert.equal(restored.mapGeneration,2);
    assert.deepEqual(snapshot(restored),cells);assert.deepEqual(G.estate(restored),G.estate(state));
    restored.seed^=12345;G.startNight(restored);G.step(restored,.25);
    assert.deepEqual(snapshot(G.restore(G.serialize(restored))),cells);
  }
});

test('original 25x25 saves retain their map and gates; unknown map generations are rejected', () => {
  for(const seed of [0,1,42,73193,0xffffffff]){
    const old=G.createState(seed,1);assert.equal(old.mapGeneration,undefined);
    const restored=G.restore(G.serialize(old));assert(restored);
    assert.equal(restored.mapGeneration,undefined);assert.deepEqual(snapshot(restored),snapshot(old));
    assert.deepEqual(G.estate(restored),G.estate(old));assert.deepEqual(restored.buildings,old.buildings);
    assert.notDeepEqual(snapshot(G.createState(seed)),snapshot(old));
  }
  for(const mapGeneration of [0,1,3,'2',null]){
    const state=G.createState(42);state.mapGeneration=mapGeneration;
    assert.equal(G.restore(G.serialize(state)),null);
  }
});

test('default maps are procedural; null and stateless queries preserve the legacy map', () => {
  const state = G.createState();
  assert(Number.isInteger(state.mapSeed) && state.mapSeed >= 0 && state.mapSeed <= 0xffffffff);
  const legacy = G.createState(null);
  assert.equal(G.SIZE, 25);
  assert.equal(G.worldSize(state), 25);
  assert.equal(G.worldSize(legacy), 17);
  assert.equal(legacy.mapSeed, undefined);
  assert.deepEqual(snapshot(legacy), snapshot(undefined));
  assert.equal(G.terrain(4, 8, legacy), 'water');
  assert(new Set(maps.map(({cells}) => cells.join(','))).size > 200, 'Seeds must produce varied maps');
});

test('257 seeds have one four-connected river spanning y=1..23 within x=6..8', () => {
  const failures = [];
  for (const {seed, water} of maps) {
    const rivers = water.filter(component => component.length > 9);
    if (rivers.length !== 1) { failures.push({seed, sizes:water.map(c => c.length)});continue; }
    const river = rivers[0], xs = river.map(i => i % G.SIZE), ys = river.map(i => Math.floor(i / G.SIZE));
    if (Math.min(...ys) !== 1 || Math.max(...ys) !== 23 || xs.some(x => x < 6 || x > 8)) failures.push({seed, river:river.map(coordinate)});
  }
  assert.deepEqual(failures, []);
});

test('257 seeds have at least one independent 5-9 tile lake, separated even diagonally', () => {
  const failures = [];
  for (const {seed, water} of maps) {
    const lakes = water.filter(component => component.length <= 9);
    if (!lakes.length || lakes.some(lake => lake.length < 5)) failures.push({seed, sizes:water.map(c => c.length)});
    const owner = new Map(water.flatMap((component, n) => component.map(i => [i, n])));
    const touching = water.flat().find(i => neighbors(i, true).some(j => owner.has(j) && owner.get(j) !== owner.get(i)));
    if (touching !== undefined) failures.push({seed, touching:coordinate(touching)});
  }
  assert.deepEqual(failures, []);
});

test('257 seeds have complete shore rings and no shore without neighboring water', () => {
  const failures = [];
  for (const {seed, cells} of maps) for (let i = 0; i < cells.length; i++) {
    const nearby = neighbors(i, true);
    if (cells[i] === 'water' && nearby.some(j => cells[j] !== 'water' && cells[j] !== 'shore')) failures.push({seed, water:coordinate(i)});
    if (cells[i] === 'shore' && !nearby.some(j => cells[j] === 'water')) failures.push({seed, shore:coordinate(i)});
  }
  assert.deepEqual(failures, []);
});

test('257 seeds keep the central 5x5 plain and contain both forest and mountain', () => {
  const failures = [];
  for (const {seed, cells} of maps) {
    for (let y = G.CENTER - 2; y <= G.CENTER + 2; y++) for (let x = G.CENTER - 2; x <= G.CENTER + 2; x++) {
      if (cells[y * G.SIZE + x] !== 'plain') failures.push({seed, center:`${x},${y}`, type:cells[y * G.SIZE + x]});
    }
    for (const type of ['forest', 'mountain']) if (!cells.includes(type)) failures.push({seed, missing:type});
  }
  assert.deepEqual(failures, []);
});

test('257 seeds reproduce saved maps and simulation randomness cannot change terrain', () => {
  for (const {seed, state, cells} of maps) {
    assert.deepEqual(snapshot(G.createState(seed, 1)), cells, `seed ${seed}: fresh state`);
    state.seed = (seed ^ 0xffffffff) >>> 0;
    // Restore uses a new object, so this also checks regeneration without the terrain cache.
    const restored = G.restore(G.serialize(state));
    assert(restored, `seed ${seed}: restore`);
    assert.equal(restored.mapSeed, seed);
    assert.deepEqual(snapshot(restored), cells, `seed ${seed}: save reproduction`);
    G.startNight(restored);
    for (let i = 0; i < 20; i++) G.step(restored, .25);
    assert.notEqual(restored.seed, state.seed, `seed ${seed}: simulation consumes randomness`);
    assert.deepEqual(snapshot(restored), cells, `seed ${seed}: simulation changed terrain`);
    assert.deepEqual(snapshot(G.restore(G.serialize(restored))), cells, `seed ${seed}: save after simulation`);
  }
});

test('257 seeds allow every non-water tile to reach the center orthogonally without walls or bridges', () => {
  const failures = [], center = G.CENTER * G.SIZE + G.CENTER;
  for (const {seed, cells} of maps) {
    const land = components(cells, type => type !== 'water');
    for (const component of land) if (!component.includes(center)) failures.push({seed, isolated:component.map(coordinate)});
  }
  assert.deepEqual(failures, []);
});
