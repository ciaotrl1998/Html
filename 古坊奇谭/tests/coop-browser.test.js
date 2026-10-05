'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const root=path.join(__dirname,'..'),sourceOnly=process.argv.includes('--source-only')||!!process.env.GUFANG_SOURCE_ONLY;
const layoutFailures=[];
const shots = process.env.GUFANG_SHOTS || path.join(os.tmpdir(), 'gufang-screenshots');
fs.mkdirSync(shots, {recursive:true});
(async () => {
  const browser = await chromium.launch({executablePath:process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',headless:true});
  try {
    for (const viewport of [{width:1440,height:1000},{width:390,height:844},{width:320,height:568}]) for (const layout of ['vertical','horizontal']) {
      const context = await browser.newContext({viewport}), page = await context.newPage(), errors = [];
      await context.addInitScript(seed => { Math.random = () => seed / 4294967296; }, layout === 'vertical' ? 43 : 42);
      page.on('pageerror', e => errors.push(e.message));
      await context.route('**/js/runtime.js',route=>route.fulfill({contentType:'application/javascript',body:['game','art','autoplay','app'].map(name=>fs.readFileSync(path.join(root,'js',name+'.js'),'utf8')).join('\n;\n')}));
      await page.goto(pathToFileURL(path.join(root, sourceOnly || viewport.width === 1440 ? 'index.html' : 'dist/古坊奇谭.html')).href);
      await page.waitForFunction(() => !!window.Gufang);
      await page.locator('#start-coop').click();
      assert(await page.locator('#coop-lobby').isVisible());
      assert(await page.locator('#coop-start').isDisabled());
      assert.equal(await page.evaluate(() => Gufang.paused), true);
      await page.locator('#coop-seat').click();
      assert(await page.locator('#coop-start').isEnabled());
      await page.locator('#coop-seat').click();
      assert(await page.locator('#coop-start').isDisabled());
      await page.locator('#coop-seat').click();
      const bounds = await page.locator('#coop-lobby').evaluate(el => ({w:el.clientWidth,sw:el.scrollWidth,h:el.clientHeight,sh:el.scrollHeight}));
      console.log(`LAYOUT coop lobby ${viewport.width}x${viewport.height} ${layout}: ${JSON.stringify(bounds)}`);
      try { assert.equal(bounds.w,bounds.sw); assert.equal(bounds.h,bounds.sh); }
      catch(error) { layoutFailures.push(`${viewport.width}x${viewport.height} ${layout}: ${JSON.stringify(bounds)}; ${error.message}`); }
      await page.screenshot({path:path.join(shots,`coop-lobby-${viewport.width}-${layout}.png`)});
      await page.locator('#coop-start').click();
      assert.equal(await page.evaluate(()=>Gufang.state.selectedSkill),null);
      assert.equal(await page.locator('[data-modal="choose-skill"]:visible').count(),3);
      assert(await page.locator('#close-modal').isHidden());
      await page.locator('[data-choice="thunder"]').click();
      assert.equal(await page.evaluate(()=>Gufang.state.selectedSkill),'thunder');
      await page.evaluate(()=>{Gufang.state.partner.coins=Gufang.state.partner.materials=1000;});
      await page.waitForFunction(() => Gufang.partnerReport?.builds > 0);
      assert.equal(await page.evaluate(() => Gufang.state.mode),'coop');
      assert.equal(await page.evaluate(() => Gufang.state.coopLayout),layout);
      assert(await page.evaluate(() => { const s=Gufang.state; return s.coopLayout==='vertical' ? GF.worldWidth(s)===25&&GF.worldHeight(s)===40 : GF.worldWidth(s)===40&&GF.worldHeight(s)===25; }));
      await page.locator('#menu-pause').click();
      const time = await page.evaluate(() => Gufang.state.elapsed);
      const pausedReport = await page.evaluate(() => Gufang.partnerReport.activeSeconds);
      await page.waitForTimeout(250);
      assert.equal(await page.evaluate(() => Gufang.state.elapsed),time);
      assert.equal(await page.evaluate(() => Gufang.partnerReport.activeSeconds),pausedReport);
      await page.locator('[data-modal="close"]').click();
      await page.locator('#coop-ally').click();
      await page.evaluate(() => { const s=Gufang.state,b=s.buildings.find(b=>b.owner===1);Gufang.select(b.x,b.y); });
      assert(await page.locator('#panel').isHidden());
      await page.locator('#coop-home').click();
      // Render the entire joined estate at an overview scale for visual inspection.
      await page.locator('#map').hover(); await page.mouse.wheel(0,600);
      await page.waitForTimeout(200);
      await page.screenshot({path:path.join(shots,`coop-game-${viewport.width}-${layout}.png`)});
      await page.locator('#menu-pause').click();
      await page.locator('[data-modal="title"]').click();
      const saved = await page.evaluate(() => localStorage.getItem('gufang-qitan-save-v1'));
      assert.equal(JSON.parse(saved).mode,'coop');
      await page.locator('#start-coop').click(); await page.locator('#coop-seat').click();
      await page.locator('#coop-start').click(); assert(await page.locator('[data-modal="coop-new"]').isVisible());
      await page.keyboard.press('Escape');
      assert(await page.locator('#coop-lobby').isVisible());
      assert.equal(await page.evaluate(() => localStorage.getItem('gufang-qitan-save-v1')),saved);
      await page.locator('#coop-back').click();
      await page.locator('#start-load').click();
      assert(await page.locator('#coop-status').isVisible());
      assert.equal(await page.evaluate(() => Gufang.state.mapSeed),JSON.parse(saved).mapSeed);
      assert(await page.evaluate(() => !!Gufang.partnerReport));
      // Coop dual-flank direction arrows, including special waves.
      await page.evaluate(() => { const s=Gufang.state;s.day=7;s.direction=2;s.phase='dusk';Gufang.refresh(); });
      assert.equal(await page.locator('.invasion-arrow:visible').count(),2);
      await page.locator('#menu-pause').click(); await page.locator('[data-modal="title"]').click();
      await page.locator('#start-single').click(); await page.locator('[data-modal="new"]').click();
      await page.locator('[data-choice="thunder"]').click();
      assert.equal(await page.evaluate(() => Gufang.state.worldSize),25);
      assert(await page.locator('#coop-status').isHidden());
      assert.deepEqual(errors,[]);
      await context.close(); console.log(`PASS coop ${viewport.width} ${layout}: rectangle, seat toggle, start, ownership, AI, pause, save/load, arrows, single-player switch (lobby layout checked separately)`);
    }
  } finally { await browser.close(); }
  assert.deepEqual(layoutFailures,[],'Coop lobby layout failures:\n'+layoutFailures.join('\n'));
})().catch(error => {console.error(error);process.exitCode=1;});
