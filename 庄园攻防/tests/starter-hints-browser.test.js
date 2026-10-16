'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const { createServer } = require('../server');
const root = path.resolve(__dirname, '..'), qa = path.join(root, 'assets/generated/qa/starter-hints');
fs.mkdirSync(qa, { recursive: true });
(async () => {
  const server = createServer(); await new Promise(resolve => server.server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
  try {
    for (const offline of [false, true]) {
      const page = await browser.newPage({ viewport: { width: 640, height: 480 }, reducedMotion: 'reduce' }), errors = [];
      page.on('pageerror', e => errors.push(e.message)); page.on('requestfailed', r => errors.push(r.url()));
      await page.addInitScript(() => Object.defineProperty(document, 'hidden', { get: () => true, configurable: true }));
      await page.goto(offline ? pathToFileURL(path.join(root, 'dist/庄园攻防.html')).href : `http://127.0.0.1:${server.server.address().port}`);
      await page.waitForFunction(() => window.Gufang && window.GFArt);
      const results = await page.evaluate(async () => {
        const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 480;
        canvas.style = 'position:fixed;inset:0;width:640px;height:480px;z-index:9999'; document.body.append(canvas);
        const c = canvas.getContext('2d'), white = GFUI.image('assets/overlays/hints/starter-white.png'); await white.decode();
        const find = (s, type, exclude) => {
          const p = GF.playerView(s, 0);
          for (let y = 0; y < GF.worldHeight(s); y++) for (let x = 0; x < GF.worldWidth(s); x++) {
            if ((!exclude || GF.dist8(x,y,exclude.x,exclude.y)>1) && !GF.buildReason(p, type, x, y, true)) return { x, y };
          }
          throw Error('No plot for ' + type);
        };
        const rows = [];
        for (const type of ['tea', 'farm', 'mulberry', 'quarry']) {
          const s = GF.createState(42), p = GF.playerView(s, 0), target = find(s, type), cost = GF.buildCost(p, type);
          const cam = { x: 320 - (target.x + .5) * 64, y: 240 - (target.y + .5) * 64, zoom: 1 };
          const options = { player: 0, animationTime: 0, reducedMotion: true };
          const render = () => GFArt.render(canvas, s, cam, null, options);
          render(); await GFArt.ready(); render();
          const draw = c.drawImage, buildHints = GF.buildHints; let draws = [], queries = 0;
          c.drawImage = function (image, ...args) {
            const m = this.getTransform();
            if (Math.abs(m.e - 320) < .01 && Math.abs(m.f - 240) < .01) {
              const file = Object.entries(window.GF_ASSET_URLS || {}).find(([file, url]) => file.includes('/hints/') && image.src === url)?.[0] || image.src || '';
              if (image === white || file.includes('/hints/')) draws.push(image === white ? 'white' : file);
            }
            return draw.call(this, image, ...args);
          };
          GF.buildHints = function (...args) { queries++; return buildHints(...args); };
          const capture = () => { draws = []; render(); return draws.slice(); };
          const row = { type, cost };
          try {
            p.coins = p.materials = 0; row.empty = capture();
            p.coins = cost.coins; p.materials = cost.materials; row.exact = capture();
            if (cost.coins) { p.coins--; row.shortCoins = capture(); p.coins++; }
            if (cost.materials) { p.materials--; row.shortMaterials = capture(); p.materials++; }
            row.restored = capture(); row.fundQueries = queries;
            const before = GF.serialize(s); capture(); row.pure = GF.serialize(s) === before;
            const other = find(s, type, target); GF.grantBuilding(p, type, other.x, other.y);
            const higherCost = GF.buildCost(p, type); row.nextCost = higherCost;
            row.afterNewBuilding = capture();
            p.coins = higherCost.coins; p.materials = higherCost.materials; row.nextAffordable = capture();
            while (p.buildings.filter(b => b.type === type).length < GF.DEFS[type].limit) { const q=find(s,'tower',target); if(!GF.grantBuilding(p,type,q.x,q.y)) throw Error('Invalid limit fixture'); }
            p.coins = p.materials = 1e9; row.atLimit = capture();
            p.buildings = p.buildings.filter(b => b.type !== type); row.belowLimit = capture();
            const enemy = { id: 9999, owner: 1, x: target.x, y: target.y, hp: 100, maxHp: 100, level: 1, troopType: 'infantry', attack: 0, slowed: 0, repelled: 0 };
            s.soldiers.push(enemy); row.enemy = capture(); s.soldiers = []; row.enemyGone = capture();
            const tower = GF.grantBuilding(p, 'tower', target.x, target.y); row.occupied = capture();
            p.buildings = p.buildings.filter(b => b.id !== tower.id); row.vacant = capture();
            s.over = true; row.over = capture(); s.over = false;
            p.eliminated = true; row.eliminated = capture(); p.eliminated = false;
            capture();
          } finally { c.drawImage = draw; GF.buildHints = buildHints; }
          rows.push(row);
        }
        // Existing higher-tier recommendations retain priority and their colors.
        const s = GF.createState(42), p = GF.playerView(s, 0); p.coins = p.materials = 1e9;
        const target = find(s, 'tea');
        const neighbor = [[-1,0],[1,0],[0,-1],[0,1]].map(([dx,dy]) => ({ x: target.x + dx, y: target.y + dy })).find(q => GF.owns(p,q.x,q.y) && !GF.at(p,q.x,q.y) && !GF.isWall(p,q.x,q.y));
        if (!neighbor) throw Error('Missing predecessor fixture');
        GF.grantBuilding(p, 'tea', neighbor.x, neighbor.y);
        const cam = { x: 320 - (target.x + .5) * 64, y: 240 - (target.y + .5) * 64, zoom: 1 };
        const render = () => GFArt.render(canvas, s, cam, null, { player: 0, animationTime: 0, reducedMotion: true });
        render(); await GFArt.ready(); render();
        const coin = GFUI.image('assets/overlays/hints/coins-tier-1.png'), draw = c.drawImage; const priority = [];
        c.drawImage = function (img, ...args) { const m = this.getTransform(); if (Math.abs(m.e - 320) < .01 && Math.abs(m.f - 240) < .01 && (img === white || img === coin)) priority.push(img === white ? 'white' : 'coins'); return draw.call(this,img,...args); };
        try { render(); } finally { c.drawImage = draw; }
        return { rows, priority };
      });
      for (const row of results.rows) {
        assert.deepEqual(row.empty, [], row.type + ': no funds');
        for (const name of ['exact', 'restored', 'nextAffordable', 'belowLimit', 'enemyGone', 'vacant']) assert.deepEqual(row[name], ['white'], row.type + ': ' + name);
        for (const name of ['shortCoins', 'shortMaterials', 'atLimit', 'enemy', 'occupied', 'over', 'eliminated']) if (name in row) assert.deepEqual(row[name], [], row.type + ': ' + name);
        if (row.nextCost.coins > row.cost.coins || row.nextCost.materials > row.cost.materials) assert.deepEqual(row.afterNewBuilding, [], 'Rising build costs immediately hide white markers');
        assert.equal(row.fundQueries, 0, 'Balance changes reuse structural candidates'); assert(row.pure, 'Render does not change game state');
      }
      assert.deepEqual(results.priority, ['coins'], 'Higher-tier color/priority remain unchanged');
      assert.deepEqual(errors, []);
      await page.locator('canvas').last().screenshot({ path: path.join(qa, `${offline ? 'offline' : 'source'}.png`) });
      fs.writeFileSync(path.join(qa, `${offline ? 'offline' : 'source'}-report.json`), JSON.stringify(results, null, 2));
      console.log(`${offline ? 'Offline' : 'Source'}: all four starters, exact/insufficient funds, cost increases, limits, enemies, occupancy, end states and priority passed`);
      await page.close();
    }
  } finally { await browser.close(); await server.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
