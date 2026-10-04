'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
  try {
    const files = process.env.GUFANG_SOURCE_ONLY ? ['index.html'] : ['index.html', 'dist/古坊奇谭.html'];
    for (const file of files) for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }, { width: 320, height: 740 }, { width: 375, height: 667 }]) {
      const context = await browser.newContext({ viewport, hasTouch: true });
      const page = await context.newPage(), errors = [];
      if (file === 'index.html') await page.route('**/js/runtime.js', route => route.fulfill({
        contentType: 'application/javascript',
        body: ['game', 'art', 'autoplay', 'app'].map(name => fs.readFileSync(path.join(__dirname, '..', 'js', name + '.js'), 'utf8')).join('\n;\n')
      }));
      page.on('pageerror', error => errors.push(error.message));
      await context.addInitScript(() => {
        Object.defineProperty(document, 'hidden', { get: () => true, configurable: true });
      });
      await page.goto(pathToFileURL(path.join(__dirname, '..', file)).href);
      await page.waitForFunction(() => !!window.Gufang);
      const arrows = page.locator('.invasion-arrow');
      const visibleDirections = () => page.locator('.invasion-arrow:visible').evaluateAll(els => els.map(el => Number(el.dataset.direction)));
      const setPhase = (phase, direction = 0, day = 1, boss = false) => page.evaluate(({ phase, direction, day, boss }) => {
        Object.assign(Gufang.state, { phase, direction, day, time: 0, wave: { boss, spawned: 0, total: 10 } });
        Gufang.refresh();
      }, { phase, direction, day, boss });
      await setPhase('dusk', 0, 7);
      assert.deepEqual(await visibleDirections(), [], 'Title hides even boss warnings');
      assert(await page.locator('#invasion-indicators').evaluate(el => el.hidden));
      await page.locator('#start-single').click();
      assert.deepEqual(await visibleDirections(), [], 'Day hides arrows');
      for (const phase of ['dusk', 'night']) for (let direction = 0; direction < 4; direction++) {
        await setPhase(phase, direction);
        assert.deepEqual(await visibleDirections(), [direction], phase + ' direction ' + direction);
        assert.equal(await arrows.nth(direction).getAttribute('aria-label'), ['北', '东', '南', '西'][direction] + '方来袭');
      }
      await setPhase('dusk', 2, 7);
      assert.deepEqual(await visibleDirections(), [0, 1, 2, 3], 'Seventh-day dusk announces all directions');
       assert.equal(await page.locator('#night-warning').count(), 0);
      await setPhase('night', 1, 8, true);
      assert.deepEqual(await visibleDirections(), [0, 1, 2, 3], 'Boss wave announces all directions regardless of day');
      assert(await page.locator('#invasion-indicators').evaluate(el => getComputedStyle(el).pointerEvents === 'none'));
      assert((await arrows.evaluateAll(els => els.every(el => getComputedStyle(el).pointerEvents === 'none' && getComputedStyle(el.querySelector('svg')).pointerEvents === 'none'))));
      const boxes = async () => Promise.all([0, 1, 2, 3].map(i => arrows.nth(i).boundingBox()));
      const before = await boxes(), frame = await page.locator('#game').boundingBox();
       const timeBar = await page.locator('.daybar').boundingBox();
       assert.equal(before[0].y - timeBar.y - timeBar.height, 8);
       assert(before.every(box => box.width === 24 && box.height === 24), 'Indicators are smaller');
       assert.equal(frame.x + frame.width - before[1].x - before[1].width, 2);
       assert.equal(frame.y + frame.height - before[2].y - before[2].height, 2);
       assert.equal(before[3].x - frame.x, 2);
       assert.equal(await page.locator('#countdown').textContent(), '');
       assert(await arrows.evaluateAll(els => els.every(el => {
         const style = getComputedStyle(el);
         return style.backgroundColor === 'rgba(0, 0, 0, 0)' && style.borderTopWidth === '0px' && style.boxShadow === 'none' && el.querySelector('path').getAttribute('d') === 'M0 24L18 0L36 24Z';
       })), 'Plain outward triangles have no background, border or shadow');
      const cx = frame.x + frame.width / 2, cy = frame.y + frame.height * .43;
      const camera = await page.evaluate(() => Gufang.camera);
      await page.mouse.move(cx, cy); await page.mouse.down();
      await page.mouse.move(cx + 40, cy + 25, { steps: 6 }); await page.mouse.up();
      const panned = await page.evaluate(() => Gufang.camera);
      assert(panned.x !== camera.x && panned.y !== camera.y, 'Drag really pans the camera');
      assert.deepEqual(await boxes(), before, 'Pan leaves all arrow bounds unchanged');
      await page.mouse.wheel(0, -200);
      await page.waitForFunction(z => Gufang.camera.zoom > z, panned.zoom);
      assert.deepEqual(await boxes(), before, 'Wheel zoom leaves all arrow bounds unchanged');
      if (viewport.width < 500) {
        const cdp = await context.newCDPSession(page), zoom = await page.evaluate(() => Gufang.camera.zoom);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx - 45, y: cy, id: 1 }, { x: cx + 45, y: cy, id: 2 }] });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cx - 75, y: cy, id: 1 }, { x: cx + 75, y: cy, id: 2 }] });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        assert((await page.evaluate(() => Gufang.camera.zoom)) > zoom, 'Pinch really zooms the camera');
        assert.deepEqual(await boxes(), before, 'Pinch leaves all arrow bounds unchanged');
      }
      assert.equal(await arrows.nth(3).evaluate(el => { const r = el.getBoundingClientRect(); return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2).id; }), 'map', 'Pointer input passes through arrow to map');
      await page.evaluate(() => { const b = Gufang.state.buildings.find(b => b.type === 'shrine'); Gufang.select(b.x, b.y); });
       assert.deepEqual(await boxes(), before, 'Open panel leaves triangles at the screen edges');
      await page.locator('#close-panel').click();
      assert.deepEqual(await boxes(), before, 'Closing panel restores south edge position');
      const canvasTexts = await page.evaluate(() => {
        const canvas = document.getElementById('map'), ctx = canvas.getContext('2d'), original = ctx.fillText, texts = [];
        ctx.fillText = function (text, ...args) { texts.push(String(text)); return original.call(this, text, ...args); };
        try { for (const phase of ['dusk', 'night']) { Gufang.state.phase = phase; GFArt.render(canvas, Gufang.state, Gufang.camera, null); } }
        finally { ctx.fillText = original; }
        return texts;
      });
      assert(!canvasTexts.some(text => text.includes('来袭')), 'Canvas no longer draws invasion warnings');
      await setPhase('day', 0, 7, true);
      assert.deepEqual(await visibleDirections(), [], 'Day hides even a stale boss wave');
      await setPhase('dusk', 0, 7);
      await page.locator('#menu-pause').click();
      assert(await page.locator('#modal').isVisible());
      assert.deepEqual(await visibleDirections(), [0, 1, 2, 3], 'Paused game retains invasion directions beneath menu');
      await page.locator('[data-modal="title"]').click();
      assert(await page.locator('#invasion-indicators').evaluate(el => el.hidden), 'Returning to title immediately hides indicators');
      assert.deepEqual(errors, []);
      console.log(`PASS invasion indicators: ${file} ${viewport.width}x${viewport.height}`);
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
