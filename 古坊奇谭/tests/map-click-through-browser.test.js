'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
  try {
    for (const file of ['index.html', 'dist/古坊奇谭.html']) {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
      const errors = []; page.on('pageerror', error => errors.push(error.message));
      await page.goto(pathToFileURL(path.join(__dirname, '..', file)).href);
      await page.waitForFunction(() => !!window.Gufang);
      await page.locator('#start-single').click();
      const result = await page.evaluate(() => {
        const s = Gufang.state;
        for (const key of Object.keys(s)) delete s[key];
        Object.assign(s, GF.createState(null)); s.coins = s.materials = 10000;
        Gufang.refresh();
        const canvas = document.getElementById('map'), p = Gufang.screenPoint(8, 9);
        // Simulate the delayed compatibility click retargeted to the newly opened card.
        const pointer = type => canvas.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 99, pointerType: 'touch', button: 0, clientX: p.x, clientY: p.y }));
        const before = { count: s.buildings.length, coins: s.coins, materials: s.materials };
        const capture = canvas.setPointerCapture;
        canvas.setPointerCapture = () => {};
        try { pointer('pointerdown'); pointer('pointerup'); }
        finally { canvas.setPointerCapture = capture; }
        const card = document.querySelector('[data-build="tea"]');
        if (!card || document.getElementById('panel').hidden) throw Error('Panel fixture failed');
        const delayed = () => card.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
        delayed(); delayed();
        return { before, after: { count: s.buildings.length, coins: s.coins, materials: s.materials }, selected: document.getElementById('plot-label').textContent };
      });
      assert.deepEqual(result.after, result.before, 'Map release cannot build through the newly opened panel');
      await page.locator('[data-build="tea"]').tap();
      assert.equal(await page.evaluate(() => GF.at(Gufang.state, 8, 9)?.type), 'tea', 'A new deliberate touch still builds');
      const keyboardPlot = await page.evaluate(() => {
        document.getElementById('close-panel').click();
        const s=Gufang.state;
        for(let y=1;y<16;y++)for(let x=1;x<16;x++)if(!GF.buildReason(s,'tea',x,y)){
          Gufang.select(x,y);document.querySelector('[data-build="tea"]').click();return {x,y};
        }
        throw Error('No keyboard fixture plot');
      });
      assert.equal(await page.evaluate(p => GF.at(Gufang.state, p.x, p.y)?.type,keyboardPlot), 'tea', 'Keyboard/programmatic activation remains available');
      assert.deepEqual(errors, []);
      console.log('PASS ' + file + ': delayed map click blocked, next touch builds, keyboard activation preserved');
      await page.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
