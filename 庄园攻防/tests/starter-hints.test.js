'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PNG } = require('pngjs');
const G = require('../js/game');

function plot(s, type, exclude) {
  const p = G.playerView(s, 0);
  for (let y = 0; y < G.worldHeight(s); y++) for (let x = 0; x < G.worldWidth(s); x++) if ((!exclude || G.dist8(x,y,exclude.x,exclude.y)>1) && !G.buildReason(p, type, x, y, true)) return { x, y };
  throw Error('No legal plot for ' + type);
}
for (const type of ['tea', 'farm', 'mulberry', 'quarry']) test(type + ' starter candidates obey placement rules and actual current cost', () => {
  const s = G.createState(42), p = G.playerView(s, 0), { x, y } = plot(s, type);
  const eligible = () => G.buildHints(p, x, y, false, true).some(h => h.type === type && h.tier === 0);
  assert(eligible());
  assert(!G.buildHints(p, x, y).some(h => h.type === type), 'Existing callers retain higher-tier-only hints');
  const cost = G.buildCost(p, type); p.coins = cost.coins; p.materials = cost.materials;
  assert.equal(G.buildReason(p, type, x, y), '');
  if (cost.coins) { p.coins--; assert(G.buildReason(p, type, x, y)); p.coins++; }
  if (cost.materials) { p.materials--; assert(G.buildReason(p, type, x, y)); p.materials++; }
  assert(eligible(), 'Structural candidates remain independent of funds');
  const enemy = { id: 9000, owner: 1, hp: 100, x, y };
  s.soldiers.push(enemy); assert(!eligible());
  assert(G.buildHints(p, x, y, true, true).some(h => h.type === type), 'Renderer may separately cull hostile occupancy');
  s.soldiers = [];
  for (let i = 0; i < G.DEFS[type].limit; i++) { const other=plot(s,'tower',{x,y}); assert(G.grantBuilding(p,type,other.x,other.y)); }
  assert(!eligible(), 'Count limit suppresses starter candidates');
});
test('white starter PNG exactly reuses the middle-industry marker silhouette', () => {
  const dir = path.join(__dirname, '../assets/overlays/hints');
  const white = PNG.sync.read(fs.readFileSync(path.join(dir, 'starter-white.png')));
  assert.deepEqual([white.width, white.height], [64, 64]);
  for (const resource of ['coins', 'materials']) {
    const reference = PNG.sync.read(fs.readFileSync(path.join(dir, resource + '-tier-1.png')));
    for (let i = 0; i < white.data.length; i += 4) {
      assert.equal(white.data[i + 3], reference.data[i + 3], 'Pixel geometry and alpha remain identical');
      if (white.data[i + 3]) assert.deepEqual([...white.data.subarray(i, i + 4)], [255, 255, 255, 255]);
    }
  }
});
