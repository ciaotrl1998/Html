'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const { createServer } = require('../server');
const root = path.resolve(__dirname, '..'), qa = path.join(root, 'assets/generated/qa/grid');
fs.mkdirSync(qa, { recursive: true });
(async () => {
  const server = createServer();
  await new Promise(resolve => server.server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
  const report = [];
  try {
    for (const offline of [false, true]) for (const dpr of [1, 1.5, 2]) {
      const page = await browser.newPage({ viewport: { width: 480, height: 360 }, deviceScaleFactor: dpr, reducedMotion: 'reduce' });
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      page.on('requestfailed', r => errors.push(r.url()));
      await page.addInitScript(() => Object.defineProperty(document, 'hidden', { get: () => true, configurable: true }));
      await page.goto(offline ? pathToFileURL(path.join(root, 'dist/庄园攻防.html')).href : `http://127.0.0.1:${server.server.address().port}`);
      await page.waitForFunction(() => window.Gufang && window.GFArt);
      await page.evaluate(dpr => {
        const canvas = document.createElement('canvas'); canvas.width = 480 * dpr; canvas.height = 360 * dpr;
        canvas.style = 'position:fixed;inset:0;width:480px;height:360px;z-index:9999'; document.body.append(canvas);
        const s = GF.createState(42); s.soldiers = []; s.effects = []; s.projectiles = []; s.elapsed = 0;
        window.gridScene = { canvas, s };
      }, dpr);
      for (const zoom of [.12, .25, .4, .65, .9, 1, 1.8]) {
        const result = await page.evaluate(async ({ zoom, dpr }) => {
          const { canvas, s } = gridScene, c = canvas.getContext('2d'), records = [];
          // Keep the origin fractional to exercise alignment and dash phase.
          const cam = { x: 12.37, y: 15.61, zoom }, originalCam = JSON.stringify(cam);
          const options = { player: 0, animationTime: 0, reducedMotion: true };
          GFArt.render(canvas, s, cam, null, options); await GFArt.ready(); GFArt.render(canvas, s, cam, null, options);
          const original = { beginPath: c.beginPath, moveTo: c.moveTo, lineTo: c.lineTo, stroke: c.stroke };
          let points = [];
          c.beginPath = function () { points = []; return original.beginPath.call(this); };
          c.moveTo = function (x, y) { points.push([x, y]); return original.moveTo.call(this, x, y); };
          c.lineTo = function (x, y) { points.push([x, y]); return original.lineTo.call(this, x, y); };
          c.stroke = function () {
            if (this.strokeStyle === '#587850') {
              const m = this.getTransform();
              records.push({ width: this.lineWidth, dash: this.getLineDash(), offset: this.lineDashOffset,
                transform: [m.a, m.b, m.c, m.d, m.e, m.f], points: points.slice(), cap: this.lineCap });
            }
            return original.stroke.call(this);
          };
          let disabled;
          try {
            GFArt.render(canvas, s, cam, null, options); disabled = records.length;
            GFArt.render(canvas, s, cam, null, { ...options, grid: true });
          } finally { Object.assign(c, original); }
          // Rasterize one actual captured grid segment in isolation. Its width
          // and complete on/off runs must contain full, evenly spaced pixels.
          const vertical = records[0], probe = document.createElement('canvas'); probe.width = 48; probe.height = 96;
          const p = probe.getContext('2d'), [a, b] = vertical.points;
          p.lineWidth = vertical.width; p.lineCap = vertical.cap; p.setLineDash(vertical.dash); p.lineDashOffset = vertical.offset;
          p.translate(16 - Math.floor(a[0]), -a[1]); p.beginPath(); p.moveTo(...a); p.lineTo(...b); p.stroke();
          const pixels = p.getImageData(0, 0, 48, 96).data, widths = [], runs = [];
          let previous, length = 0, fractionalAlpha = 0;
          for (let y = 0; y < 96; y++) {
            let count = 0;
            for (let x = 0; x < 48; x++) { const alpha = pixels[(y * 48 + x) * 4 + 3]; if (alpha) count++; if (alpha && alpha !== 255) fractionalAlpha++; }
            if (count) widths.push(count);
            const on = count > 0;
            if (previous === undefined || previous === on) length++;
            else { runs.push(length); length = 1; }
            previous = on;
          }
          runs.push(length);
          return { zoom, dpr, disabled, records, widths: [...new Set(widths)], runs: runs.slice(1, -1), fractionalAlpha, cameraPreserved: originalCam === JSON.stringify(cam) };
        }, { zoom, dpr });
        assert.equal(result.disabled, 0, 'Grid toggle off draws no grid');
        assert.equal(result.records.length, 2, 'Grid uses two batched strokes');
        for (const stroke of result.records) {
          assert.deepEqual(stroke.transform, [1, 0, 0, 1, 0, 0], 'Grid uses physical screen coordinates');
          assert(stroke.width / dpr >= 1, 'Grid is at least one CSS screen pixel wide');
          assert.equal(stroke.width, Math.ceil(dpr));
          assert.deepEqual(stroke.dash, [4 * dpr, 4 * dpr], 'Dash and gap remain four CSS pixels at every zoom');
        }
        assert.deepEqual(result.widths, [Math.ceil(dpr)], 'Rasterized dashes never become thin hairlines');
        assert(result.runs.length > 2 && result.runs.every(n => n === 4 * dpr), 'Actual raster dash/gap intervals remain equal');
        assert.equal(result.fractionalAlpha, 0, 'Pixel-aligned grid has no antialiased hairlines');
        assert(result.cameraPreserved);
        report.push({ offline, ...result });
        if (dpr === 1 && [.4, .65, 1.8].includes(zoom)) await page.locator('canvas').last().screenshot({ path: path.join(qa, `${offline ? 'offline' : 'source'}-${zoom}.png`) });
      }
      assert.deepEqual(errors, []);
      console.log(`${offline ? 'Offline' : 'Source'} DPR ${dpr}: seven zooms, fixed width/dashes, raster alignment and grid toggle passed`);
      await page.close();
    }
    fs.writeFileSync(path.join(qa, 'report.json'), JSON.stringify(report, null, 2));
  } finally { await browser.close(); await server.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
