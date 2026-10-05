'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.join(__dirname, '..');
const artSource = fs.readFileSync(path.join(root, 'js/art.js'), 'utf8');
const gameSource = fs.readFileSync(path.join(root, 'js/game.js'), 'utf8');

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
  const failures = [];
  try {
    for (const scenario of ['legacy-null', 'estate-42', 'coop-horizontal', 'coop-vertical']) {
      const page = await browser.newPage({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.setContent('<body style="margin:0"></body>');
      await page.evaluate(() => {
        // Keep local and freshly baked canvases on the same CPU rasterization path.
        const getContext = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function (type, options) {
          return getContext.call(this, type, type === '2d' ? { ...options, willReadFrequently: true } : options);
        };
      });
      await page.addScriptTag({ content: gameSource });
      await page.addScriptTag({ content: artSource });
      const setup = await page.evaluate(scenario => {
        const state = scenario === 'legacy-null' ? GF.createState(null) : scenario === 'estate-42' ? GF.createState(42) : GF.createCoopState(42, scenario.slice(5));
        const width = GF.worldWidth(state), height = GF.worldHeight(state), land = GF.estate(state), T = GFArt.T;
        state.elapsed = 0; state.mission = GF.MISSIONS.length;
        const noise = (x, y) => { const v = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return v - Math.floor(v); };
        const cells = [];
        for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
          if (!state.buildings.some(b => b.x === x && b.y === y)) cells.push({ x, y, type: GF.terrain(x, y, state) });
        }
        const decor = p => !GF.isWall(state, p.x, p.y) && !land?.roads.has(p.y * width + p.x) && ['forest', 'mountain'].includes(p.type);
        const targets = [];
        const choose = (name, predicate) => {
          const p = cells.find(predicate);
          if (!p) throw Error('Missing coverage: ' + name);
          targets.push({ name, ...p });
        };
        choose('forest', p => decor(p) && p.type === 'forest');
        choose('mountain', p => decor(p) && p.type === 'mountain');
        for (const side of ['top', 'right', 'bottom', 'left']) choose('border-tree-' + side, p => p.type === 'plain' && noise(p.x, p.y) > .35 && !land?.roads.has(p.y * width + p.x) && ({ top: p.y === 0, right: p.x === width - 1, bottom: p.y === height - 1, left: p.x === 0 })[side]);
        if (land) {
          for (const estate of land.estates || [land]) for (const type of ['forest', 'mountain']) choose('interior-' + (estate.owner ?? 0) + '-' + type, p => decor(p) && p.type === type && estate.cells.has(p.y * width + p.x));
          for (const name of ['roads', 'walls']) choose('decor-near-' + name, p => decor(p) && [...land[name]].some(k => Math.max(Math.abs(k % width - p.x), Math.abs(Math.floor(k / width) - p.y)) <= 1));
          choose('road', p => land.roads.has(p.y * width + p.x));
        } else choose('legacy-road-near', p => decor(p) && Math.max(Math.abs(p.x - GF.worldCenter(state)), Math.abs(p.y - GF.worldCenter(state))) <= 3);
        const makeCanvas = () => {
          const c = document.createElement('canvas');
          c.width = width * T + 96; c.height = height * T + 96;
          c.style.width = c.width + 'px'; c.style.height = c.height + 'px';
          document.body.appendChild(c); return c;
        };
        const localCanvas = makeCanvas(), fullCanvas = makeCanvas(), localArt = GFArt;
        const camera = { x: 48, y: 48, zoom: 1 }, options = { animationTime: 0, reducedMotion: true, player: 0 };
        const proto = CanvasRenderingContext2D.prototype, create = document.createElement;
        const originals = { clearRect: proto.clearRect, drawImage: proto.drawImage, fillRect: proto.fillRect };
        let record = null;
        document.createElement = function (...args) {
          const result = create.apply(this, args);
          if (record && args[0].toLowerCase() === 'canvas') record.allocations.push(result);
          return result;
        };
        proto.clearRect = function (...args) {
          if (record && this.canvas !== localCanvas && this.canvas !== fullCanvas) record.clears.push({ canvas: this.canvas, args });
          return originals.clearRect.apply(this, args);
        };
        proto.drawImage = function (...args) {
          if (record) {
            if (args[0]?.base && (this.canvas === localCanvas || this.canvas === fullCanvas)) record.ground = args[0];
            if (this.canvas !== localCanvas && this.canvas !== fullCanvas) record.draws.push({ canvas: this.canvas, source: args[0], args: args.slice(1) });
          }
          return originals.drawImage.apply(this, args);
        };
        proto.fillRect = function (...args) {
          if (record && this.canvas !== localCanvas && this.canvas !== fullCanvas && this.canvas.width > 512) record.mapFills++;
          return originals.fillRect.apply(this, args);
        };
        const render = (art, canvas) => {
          // Output context history must not contaminate the terrain-cache comparison.
          canvas.getContext('2d').reset();
          record = { allocations: [], clears: [], draws: [], mapFills: 0, ground: null };
          try { art.render(canvas, state, camera, null, options); return record; }
          finally { record = null; }
        };
        const add = p => {
          const b = { id: state.nextId++, type: 'tower', x: p.x, y: p.y, level: 1, hp: GF.maxHP({ type: 'tower', level: 1 }), owner: 0 };
          state.buildings.push(b); return b;
        };
        const initialBuilding = add(targets[0]);
        const initial = render(localArt, localCanvas), ground = initial.ground, base = ground.base;
        const basePixels = base.getContext('2d').getImageData(0, 0, base.width, base.height).data;
        const operations = [{ name: 'initial', count: 0, mutate() {} }];
        const destination = cells.find(p => decor(p) && (p.x !== initialBuilding.x || p.y !== initialBuilding.y));
        operations.push({ name: 'move-initial-building', count: 2, mutate() { initialBuilding.x = destination.x; initialBuilding.y = destination.y; } });
        operations.push({ name: 'remove-initial-building', count: 1, mutate() { state.buildings.splice(state.buildings.indexOf(initialBuilding), 1); } });
        for (const target of targets) {
          let b;
          operations.push({ name: 'add-' + target.name, count: 1, mutate() { b = add(target); } });
          operations.push({ name: 'upgrade-' + target.name, count: 0, mutate() { b.level = 4; b.hp = GF.maxHP(b); } });
          operations.push({ name: 'remove-' + target.name, count: 1, mutate() { state.buildings = state.buildings.filter(n => n !== b); } });
        }
        const anchor = cells.find(p => decor(p) && p.x + 1 < width && p.y + 1 < height && [cells.find(q => q.x === p.x + 1 && q.y === p.y), cells.find(q => q.x === p.x && q.y === p.y + 1)].every(Boolean));
        if (!anchor) throw Error('Missing adjacent cells');
        const cluster = [anchor, { x: anchor.x + 1, y: anchor.y }, { x: anchor.x, y: anchor.y + 1 }];
        let group;
        operations.push({ name: 'add-three-adjacent', count: 3, mutate() { group = cluster.map(add); } });
        operations.push({ name: 'remove-middle-adjacent', count: 1, mutate() { state.buildings.splice(state.buildings.indexOf(group[1]), 1); } });
        operations.push({ name: 'restore-middle-adjacent', count: 1, mutate() { state.buildings.push(group[1]); } });
        operations.push({ name: 'remove-three-adjacent-reverse', count: 3, mutate() { for (const b of [...group].reverse()) state.buildings.splice(state.buildings.indexOf(b), 1); } });
        operations.push({ name: 'warm-final', count: 0, mutate() {} });
        window.terrainTest = { state, localArt, localCanvas, fullCanvas, render, operations, ground, base, basePixels, camera, options };
        return { width, height, targets, operations: operations.length, initialMapAllocations: initial.allocations.filter(c => c.width > 512).map(c => [c.width, c.height]), initialMapFills: initial.mapFills };
      }, scenario);
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      const results = [];
      for (let index = 0; index < setup.operations; index++) {
        const local = await page.evaluate(index => {
          const t = terrainTest, op = t.operations[index]; op.mutate();
          const r = t.render(t.localArt, t.localCanvas); t.localGround = r.ground;
          const clears = r.clears.map(c => c.args);
          const patches = r.draws.filter(d => d.canvas === t.ground && d.source === t.base).map(d => d.args);
          const unexpectedDraws = r.draws.filter(d => d.canvas.width > 512 && !(d.canvas === t.ground && (d.source === t.base && d.args.length === 8 && d.args[2] === 128 && d.args[3] === 128 || d.source.width <= 256))).length;
          return { name: op.name, expected: op.count, clears, patches, sameGround: r.ground === t.ground && r.ground.base === t.base, allocations: r.allocations.map(c => [c.width, c.height]), mapFills: r.mapFills, unexpectedDraws };
        }, index);
        // Reinject the unchanged source, never reuse the reference closure's ground cache.
        await page.addScriptTag({ content: artSource });
        const pixels = await page.evaluate(() => {
          const t = terrainTest, fullArt = GFArt;
          const r = t.render(fullArt, t.fullCanvas);
          window.GFArt = t.localArt;
          const compare = (a, b) => {
            let changedPixels = 0, substantialPixels = 0, maxChannelError = 0, totalError = 0;
            let left = Infinity, top = Infinity, right = -1, bottom = -1;
            const ap = a.getContext('2d').getImageData(0, 0, a.width, a.height).data;
            const bp = b.getContext('2d').getImageData(0, 0, b.width, b.height).data;
            for (let i = 0; i < ap.length; i += 4) {
              let maximum = 0;
              for (let k = 0; k < 4; k++) { const d = Math.abs(ap[i + k] - bp[i + k]); maximum = Math.max(maximum, d); totalError += d; }
              maxChannelError = Math.max(maxChannelError, maximum);
              if (maximum) { changedPixels++; const x = i / 4 % a.width, y = Math.floor(i / 4 / a.width); left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y); }
              if (maximum > 2) substantialPixels++;
            }
            return { changedPixels, substantialPixels, maxChannelError, meanChannelError: totalError / ap.length, changedFraction: changedPixels / (ap.length / 4), bounds: changedPixels ? [left, top, right, bottom] : null };
          };
          const baseNow = t.base.getContext('2d').getImageData(0, 0, t.base.width, t.base.height).data;
          return { scene: compare(t.localCanvas, t.fullCanvas), ground: compare(t.localGround, r.ground), baseUnchanged: baseNow.every((v, i) => v === t.basePixels[i]), freshMapAllocations: r.allocations.filter(c => c.width > 512).length };
        });
        results.push({ ...local, ...pixels });
      }
      const checks = (condition, message) => { if (!condition) failures.push(scenario + ': ' + message); };
      checks(setup.initialMapAllocations.length === 3 && setup.initialMapFills > setup.width * setup.height, 'initial render must generate the three map surfaces');
      for (const r of results) {
        checks(r.sameGround && r.baseUnchanged, r.name + ': ground/base identity or static base changed');
        checks(r.allocations.every(([w, h]) => w <= 256 && h <= 256), r.name + ': allocated a new map canvas');
        checks(r.mapFills === 0 && r.unexpectedDraws === 0, r.name + ': full-map drawing during update');
        checks(r.clears.length === r.expected && r.patches.length === r.expected, r.name + ': expected ' + r.expected + ' patches, got ' + r.clears.length + '/' + r.patches.length);
        checks(r.clears.every(p => p[2] === 128 && p[3] === 128) && r.patches.every((p, i) => JSON.stringify(p) === JSON.stringify([...r.clears[i], ...r.clears[i]])), r.name + ': patch is not an exact 128x128 base copy');
        checks(r.freshMapAllocations === 3, r.name + ': reference did not freshly bake the map');
        for (const kind of ['ground', 'scene']) checks(r[kind].substantialPixels === 0 && r[kind].changedFraction <= .001 && r[kind].meanChannelError <= .001, r.name + ': ' + kind + ' pixel mismatch ' + JSON.stringify(r[kind]));
      }
      checks(errors.length === 0, 'browser errors: ' + JSON.stringify(errors));
      const summary = { scenario, ...setup, checkpoints: results.length, totalPatches: results.reduce((n, r) => n + r.clears.length, 0), updateMapAllocations: results.flatMap(r => r.allocations).filter(([w]) => w > 512).length, updateMapFills: results.reduce((n, r) => n + r.mapFills, 0) };
      for (const kind of ['ground', 'scene']) summary[kind] = { maxChangedPixels: Math.max(...results.map(r => r[kind].changedPixels)), maxChannelError: Math.max(...results.map(r => r[kind].maxChannelError)), maxMeanChannelError: Math.max(...results.map(r => r[kind].meanChannelError)) };
      summary.pixelDifferences = results.filter(r => r.ground.changedPixels || r.scene.changedPixels).map(r => ({ name: r.name, ground: r.ground, scene: r.scene }));
      console.log(JSON.stringify(summary));
      await page.close();
    }
    assert.deepEqual(failures, [], 'Terrain patch regressions');
    console.log('PASS terrain patches: fresh-closure pixel equivalence, static base, occupancy patch counts, no map regeneration');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
