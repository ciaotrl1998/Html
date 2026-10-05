'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const G = require('../js/game.js');
const KEY = 'gufang-qitan-save-v1';
const layoutFailures=[];
const shots = process.env.GUFANG_SHOTS || path.join(os.tmpdir(), 'gufang-screenshots');
fs.mkdirSync(shots, { recursive: true });
const root = path.join(__dirname, '..');
const sourceOnly = process.argv.includes('--source-only') || !!process.env.GUFANG_SOURCE_ONLY;
const url = file => pathToFileURL(path.join(root, sourceOnly ? 'index.html' : file)).href;
async function sourceContext(context) { await context.route('**/js/runtime.js', route => route.fulfill({contentType:'application/javascript', body:['game','art','autoplay','app'].map(name=>fs.readFileSync(path.join(root,'js',name+'.js'),'utf8')).join('\n;\n')})); }
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
  try {
    for (const viewport of [{width:1440,height:1000}, {width:390,height:844}, {width:320,height:568}, {width:375,height:667}]) {
      const context = await browser.newContext({ viewport }), page = await context.newPage(), errors = [];
      await sourceContext(context);
      page.on('pageerror', e => errors.push(e.message));
      await page.goto(url(viewport.width === 1440 ? 'index.html' : 'dist/古坊奇谭.html'));
      await page.waitForFunction(() => !!window.Gufang);
      assert(await page.locator('#start-menu').isVisible());
      assert.equal(await page.locator('#game button:visible').count(), 4);
      assert(await page.locator('#start-coop').isEnabled());
      assert(await page.locator('#start-load').isDisabled());
      assert(await page.locator('#modal').isHidden());
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
      console.log(`LAYOUT start menu ${viewport.width}x${viewport.height}: ${JSON.stringify(layout)}`);
      try {
        assert.equal(layout.height, layout.scrollHeight, 'Menu fits the portrait viewport');
      } catch(error) { layoutFailures.push(`${viewport.width}x${viewport.height}: ${error.message}; ${JSON.stringify(layout)}`); }
      await page.screenshot({ path:path.join(shots, `start-menu-${viewport.width}.png`) });
      await page.reload(); await page.waitForFunction(() => !!window.Gufang);
      assert.equal(await page.locator('#start-sound').getAttribute('aria-checked'), 'true', 'Enabled sound survives reload');
      await page.locator('#start-single').click();
      assert(await page.locator('#start-menu').isHidden());
      assert.equal(await page.evaluate(() => Gufang.state.selectedSkill), null);
      assert.equal(await page.evaluate(() => Gufang.paused), true);
      assert.equal(await page.locator('[data-modal="choose-skill"]:visible').count(), 3);
      assert(await page.locator('#close-modal').isHidden());
      const pending = await page.evaluate(() => GF.serialize(Gufang.state));
      await page.keyboard.press('Escape');
      await page.locator('#modal').click({position:{x:1,y:1}});
      await page.clock.runFor(1000);
      assert.equal(await page.locator('[data-modal="choose-skill"]:visible').count(), 3);
      assert.equal(await page.evaluate(() => GF.serialize(Gufang.state)), pending, 'Selection blocks simulation and dismissal');
      const choiceLayout = await page.locator('.skill-selection').evaluate(el => {
        const r=el.getBoundingClientRect();
        return {top:r.top,bottom:r.bottom,width:el.clientWidth,scrollWidth:el.scrollWidth,buttons:[...el.querySelectorAll('button')].map(b=>({height:b.getBoundingClientRect().height,overflow:b.scrollWidth>b.clientWidth}))};
      });
      assert(choiceLayout.top>=0 && choiceLayout.bottom<=viewport.height, 'Selection fits viewport');
      assert.equal(choiceLayout.width,choiceLayout.scrollWidth);
      assert(choiceLayout.buttons.every(b=>b.height>=30&&!b.overflow));
      await page.screenshot({path:path.join(shots,`skill-modal-${viewport.width}.png`)});
      await page.locator('[data-choice="thunder"]').focus();
      await page.keyboard.press('Enter');
      assert(await page.locator('#modal').isHidden());
      assert.equal(await page.evaluate(() => Gufang.paused), false);
      assert.equal(await page.evaluate(() => Gufang.state.selectedSkill), 'thunder');
      assert.deepEqual(await page.evaluate(() => [Gufang.state.coins,Gufang.state.materials]), [150,200]);
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
      assert.equal(await page.locator('[data-modal="choose-skill"]:visible').count(),3);
      await page.locator('[data-choice="repair"]').click();
      assert.equal(await page.evaluate(()=>Gufang.state.selectedSkill),'repair');
      assert(await page.locator('#start-menu').isHidden());
      assert.equal(await page.evaluate(() => Gufang.state.day), 1);
      assert.equal(await page.evaluate(() => Gufang.state.mapGeneration), 2);
      assert.notEqual(await page.evaluate(() => Gufang.state.mapSeed),JSON.parse(save).mapSeed,'New game uses a new procedural seed');
      const old=G.restore(save),size=G.worldSize(old),oldMap=Array.from({length:size*size},(_,k)=>G.terrain(k%size,Math.floor(k/size),old));
      assert.notDeepEqual(await page.evaluate(()=>Array.from({length:625},(_,k)=>GF.terrain(k%25,Math.floor(k/25),Gufang.state))),oldMap,'New game renders different terrain');
      assert.deepEqual(errors, []);
      await context.close();
      console.log(`PASS start menu ${viewport.width}×${viewport.height}: keyboard, pause, save protection, load, new game, sound (layout checked separately)`);
    }
    for (const kind of ['corrupt', 'unavailable', 'defeat']) {
      const context = await browser.newContext(), page = await context.newPage(), errors = [];
      await sourceContext(context);
      const state = G.createState(); state.selectedSkill='thunder'; state.over = true;
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
        await page.locator('[data-choice="thunder"]').click();
        assert(await page.locator('#start-menu').isHidden());
      }
      assert.deepEqual(errors, []); await context.close();
      console.log('PASS start menu storage: ' + kind);
    }
  } finally { await browser.close(); }
  assert.deepEqual(layoutFailures, [], 'Start menu layout failures:\n'+layoutFailures.join('\n'));
})().catch(e => { console.error(e); process.exitCode = 1; });
