'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const G = require('../js/game.js');
const KEY = 'gufang-qitan-save-v1';
const shots = process.env.GUFANG_SHOTS || path.join(os.tmpdir(), 'gufang-screenshots');
fs.mkdirSync(shots, { recursive: true });
const url = file => pathToFileURL(path.join(__dirname, '..', file)).href;
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
  try {
    for (const viewport of [{width:1440,height:1000}, {width:390,height:844}, {width:320,height:568}, {width:375,height:667}]) {
      const context = await browser.newContext({ viewport }), page = await context.newPage(), errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.goto(url(viewport.width === 1440 ? 'index.html' : 'dist/古坊奇谭.html'));
      await page.waitForFunction(() => !!window.Gufang);
      assert(await page.locator('#start-menu').isVisible());
      assert.equal(await page.locator('#game button:visible').count(), 4);
      assert(await page.locator('#start-coop').isEnabled());
      assert(await page.locator('#start-load').isDisabled());
      const before = await page.evaluate(() => GF.serialize(Gufang.state));
      await page.keyboard.press('Escape');
      await page.locator('#start-sound').focus();
      await page.keyboard.press('Space');
      assert.equal(await page.locator('#start-sound').getAttribute('aria-checked'), 'true');
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'start-single');
      // Exercise autosave and page-lifecycle hooks without waiting eight real seconds.
      await page.clock.install(); await page.clock.runFor(9000);
      await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
      assert.equal(await page.evaluate(() => GF.serialize(Gufang.state)), before);
      assert.equal(await page.evaluate(key => localStorage.getItem(key), KEY), null);
      assert.equal(await page.evaluate(() => Gufang.paused), true);
      const layout = await page.locator('#start-menu').evaluate(el => ({ width:el.clientWidth, scroll:el.scrollWidth, height:el.clientHeight, scrollHeight:el.scrollHeight }));
      assert.equal(layout.width, layout.scroll);
      assert.equal(layout.height, layout.scrollHeight, 'Menu fits the portrait viewport');
      await page.screenshot({ path:path.join(shots, `start-menu-${viewport.width}.png`) });
      await page.reload(); await page.waitForFunction(() => !!window.Gufang);
      assert.equal(await page.locator('#start-sound').getAttribute('aria-checked'), 'true', 'Enabled sound survives reload');
      await page.locator('#start-single').click();
      assert(await page.locator('#start-menu').isHidden());
      assert.equal(await page.evaluate(() => Gufang.paused), false);
      await page.clock.runFor(1000);
      assert((await page.evaluate(() => Gufang.state.time)) > 0);
      await page.locator('#menu-pause').click();
      assert.equal(await page.locator('[data-modal="sound"]').textContent(), '音效：开');
      await page.locator('[data-modal="sound"]').click();
      await page.locator('[data-modal="title"]').click();
      assert(await page.locator('#start-load').isEnabled());
      assert.equal(await page.locator('#start-sound').getAttribute('aria-checked'), 'false');
      const save = await page.evaluate(key => localStorage.getItem(key), KEY);
      await page.locator('#start-single').click();
      assert(await page.locator('[data-modal="new"]').isVisible());
      await page.keyboard.press('Escape');
      assert(await page.locator('#start-menu').isVisible());
      assert.equal(await page.evaluate(() => Gufang.paused), true);
      assert.equal(await page.evaluate(key => localStorage.getItem(key), KEY), save);
      await page.reload(); await page.waitForFunction(() => !!window.Gufang);
      assert(await page.locator('#start-menu').isVisible());
      assert.equal(await page.locator('#start-sound').getAttribute('aria-checked'), 'false');
      await page.locator('#start-load').click();
      await page.locator('#menu-pause').click();
      assert.equal(await page.evaluate(() => Gufang.state.mapSeed), JSON.parse(save).mapSeed);
      await page.locator('[data-modal="title"]').click();
      await page.locator('#start-single').click();
      await page.locator('[data-modal="new"]').click();
      assert(await page.locator('#start-menu').isHidden());
      assert.equal(await page.evaluate(() => Gufang.state.day), 1);
      assert.equal(await page.evaluate(() => Gufang.state.mapGeneration), 2);
      assert.notEqual(await page.evaluate(() => Gufang.state.mapSeed),JSON.parse(save).mapSeed,'New game uses a new procedural seed');
      const old=G.restore(save),size=G.worldSize(old),oldMap=Array.from({length:size*size},(_,k)=>G.terrain(k%size,Math.floor(k/size),old));
      assert.notDeepEqual(await page.evaluate(()=>Array.from({length:625},(_,k)=>GF.terrain(k%25,Math.floor(k/25),Gufang.state))),oldMap,'New game renders different terrain');
      assert.deepEqual(errors, []);
      await context.close();
      console.log(`PASS start menu ${viewport.width}×${viewport.height}: layout, keyboard, pause, save protection, load, new game, sound`);
    }
    for (const kind of ['corrupt', 'unavailable', 'defeat']) {
      const context = await browser.newContext(), page = await context.newPage(), errors = [];
      const state = G.createState(); state.over = true;
      page.on('pageerror', e => errors.push(e.message));
      await context.addInitScript(({kind, key, raw}) => {
        if (kind === 'unavailable') {
          Storage.prototype.getItem = Storage.prototype.setItem = () => { throw new Error('Storage blocked'); };
        } else localStorage.setItem(key, kind === 'corrupt' ? '{broken' : raw);
      }, {kind, key:KEY, raw:G.serialize(state)});
      await page.goto(url('dist/古坊奇谭.html')); await page.waitForFunction(() => !!window.Gufang);
      assert(await page.locator('#start-menu').isVisible());
      assert(await page.locator('#modal').isHidden());
      if (kind === 'defeat') {
        await page.locator('#start-load').click();
        assert.equal(await page.locator('#modal h2').textContent(), '古坊失守');
      } else {
        assert(await page.locator('#start-load').isDisabled());
        await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
        if (kind === 'corrupt') assert.equal(await page.evaluate(key => localStorage.getItem(key), KEY), '{broken');
        await page.locator('#start-single').click();
        if (kind === 'corrupt') await page.locator('[data-modal="new"]').click();
        assert(await page.locator('#start-menu').isHidden());
      }
      assert.deepEqual(errors, []); await context.close();
      console.log('PASS start menu storage: ' + kind);
    }
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
