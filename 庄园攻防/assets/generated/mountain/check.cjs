'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const { PNG } = require('pngjs');
const root = path.resolve(__dirname, '../../..');
const asset = 'assets/tiles/resources/mountain.png';
(async () => {
  const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
  try {
    const png = PNG.sync.read(fs.readFileSync(path.join(root, asset)));
    assert.equal(png.width, 64); assert.equal(png.height, 64);
    for (let i = 3; i < png.data.length; i += 4) assert(png.data[i] === 0 || png.data[i] === 255);
    for (const offline of [false, true]) {
      const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      page.on('requestfailed', r => errors.push(r.url()));
      await page.goto(pathToFileURL(path.join(root, offline ? 'dist/庄园攻防.html' : 'index.html')).href);
      await page.waitForFunction(() => window.Gufang && window.GFUI);
      if (offline) {
        const embedded = await page.evaluate(asset => GF_ASSET_URLS[asset], asset);
        assert.equal(embedded, 'data:image/png;base64,' + fs.readFileSync(path.join(root, asset)).toString('base64'));
      }
      await page.locator('#start-single').click();
      await page.locator('#single-start').click();
      await page.locator('[data-choice="thunder"]').click();
      const target = await page.evaluate(async () => {
        Object.defineProperty(document, 'hidden', { get: () => true, configurable: true });
        document.dispatchEvent(new Event('visibilitychange'));
        const s = Gufang.state, map = document.getElementById('map');
        const size = GF.worldWidth(s), land = GF.estate(s);
        const mountains = [];
        for (let y = 3; y < GF.worldHeight(s) - 3; y++) for (let x = 3; x < size - 3; x++) {
          if (GF.terrain(x, y, s) !== 'mountain' || GF.isWall(s, x, y) || land?.roads.has(y * size + x) || s.buildings.some(b => b.x === x && b.y === y)) continue;
          let trees = 0;
          for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) if (GF.terrain(x + dx, y + dy, s) === 'forest') trees++;
          mountains.push({ x, y, trees });
        }
        const p = mountains.sort((a, b) => b.trees - a.trees)[0];
        if (!p) throw Error('No mountain tile found');
        const cam = { x: map.width / 2 - (p.x + .5) * 64, y: map.height / 2 - (p.y + .5) * 64, zoom: 1 };
        const draw = () => GFArt.render(map, s, cam, null, { player: 0, animationTime: 0, reducedMotion: true, grid: true });
        draw(); await GFArt.ready(); draw();
        return p;
      });
      await page.locator('#map').screenshot({ path: path.join(__dirname, offline ? 'game-offline.png' : 'game-source.png') });
      assert.deepEqual(errors, []);
      console.log(`${offline ? 'Offline' : 'Source'}: mountain loaded and rendered at ${target.x},${target.y}; no browser errors`);
      await page.close();
    }
    const page = await browser.newPage({ viewport: { width: 768, height: 280 }, deviceScaleFactor: 1 });
    const image = file => 'data:image/png;base64,' + fs.readFileSync(file).toString('base64');
    await page.setContent('<body style="margin:0;background:#b8c090;display:flex;font:18px sans-serif;color:#4a2e20">' +
      [['原图', path.join(__dirname, 'before.png')], ['新山体', path.join(root, asset)], ['相邻森林', path.join(root, 'assets/tiles/resources/forest.png')]].map(([label, file]) => `<div style="width:256px;text-align:center"><img src="${image(file)}" style="width:256px;height:256px;image-rendering:pixelated;display:block">${label}</div>`).join('') + '</body>');
    await page.screenshot({ path: path.join(__dirname, 'comparison.png') });
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
