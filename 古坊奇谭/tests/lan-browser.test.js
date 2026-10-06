'use strict';
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { createServer } = require('../server');
const fs=require('node:fs'),path=require('node:path');

(async () => {
  const service = createServer();
  await new Promise(resolve => service.server.listen(0, '127.0.0.1', resolve));
  const address = `http://127.0.0.1:${service.server.address().port}`;
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
  try {
    const phone = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
    const hostContext = await browser.newContext(phone);
    const guestContext = await browser.newContext(phone);
    const host = await hostContext.newPage(), guest = await guestContext.newPage(), errors = [];
    const choices=[]; let motionFrames=0;
    guest.on('websocket',socket=>{
      socket.on('framesent',({payload})=>{
        const message=JSON.parse(String(payload));
        if(message.type==='action'&&message.kind==='choose-skill')choices.push(message);
      });
      socket.on('framereceived',({payload})=>{ try { if(JSON.parse(String(payload)).type==='motion') motionFrames++; } catch { /* Ignore non-JSON frames. */ } });
    });
    for(const context of [hostContext,guestContext]) await context.route('**/js/runtime.js',route=>route.fulfill({contentType:'application/javascript',body:['game','art','autoplay','app'].map(name=>fs.readFileSync(path.join(__dirname,'..','js',name+'.js'),'utf8')).join('\n;\n')}));
    host.on('pageerror', error => errors.push('host: ' + error.message));
    guest.on('pageerror', error => errors.push('guest: ' + error.message));
    await Promise.all([host.goto(address), guest.goto(address)]);
    await Promise.all([host.waitForFunction(() => !!window.Gufang), guest.waitForFunction(() => !!window.Gufang)]);
    await host.locator('#start-coop').click();
    await host.locator('#coop-host').click();
    await host.waitForFunction(() => /^\d{6}$/.test(Gufang.online?.code || ''));
    const code = await host.evaluate(() => Gufang.online.code);
    assert.equal(await host.locator('#coop-code').inputValue(), code, 'Host shows the six-digit room code');
    assert(await host.locator('#coop-code').evaluate(el => el.readOnly), 'Host room code is read-only');
    await guest.locator('#start-coop').click();
    await guest.locator('#coop-code').fill(code);
    await guest.locator('#coop-join').click();
    await host.waitForFunction(() => Gufang.online?.peerConnected);
    assert(await guest.locator('#coop-code').evaluate(el => el.readOnly), 'Guest code locks once joined');
    assert(await host.locator('#coop-start').isEnabled());
    await host.locator('#coop-start').click();
    await guest.waitForFunction(() => Gufang.state.mode === 'coop' && Gufang.online?.role === 'guest');
    for(const page of [host,guest]) {
      await page.locator('[data-choice="thunder"]').waitFor({state:'visible'});
      assert.equal(await page.locator('[data-modal="choose-skill"]:visible').count(),3);
      assert(await page.locator('#close-modal').isHidden());
      await page.keyboard.press('Escape');
      await page.locator('#modal').click({position:{x:1,y:1}});
      assert.equal(await page.locator('[data-modal="choose-skill"]:visible').count(),3);
    }
    assert.deepEqual(await host.evaluate(()=>[Gufang.state.selectedSkill,Gufang.state.partner.selectedSkill]),[null,null]);
    assert.equal(choices.length,0,'Guest does not select automatically');
    await host.locator('[data-choice="thunder"]').click();
    await guest.evaluate(()=>{
      window.skillAtModalClose=[];
      new MutationObserver(()=>{if(document.getElementById('modal').hidden)skillAtModalClose.push(Gufang.state.partner.selectedSkill);}).observe(document.getElementById('modal'),{attributes:true,attributeFilter:['hidden']});
    });
    await guest.locator('[data-choice="repel"]').click();
    try { await host.waitForFunction(()=>Gufang.state.partner.selectedSkill==='repel',{},{timeout:5000}); }
    catch(error) { throw new Error('LAN guest opening skill was not accepted: '+JSON.stringify({sent:choices,state:await host.evaluate(()=>({hostSkill:Gufang.state.selectedSkill,guestSkill:Gufang.state.partner.selectedSkill,elapsed:Gufang.state.elapsed}))})+'; '+error.message); }
    assert(choices.some(message=>message.skill==='repel'),'Guest sends its modal choice through the network');
    await guest.waitForFunction(()=>Gufang.state.partner.selectedSkill==='repel');
    await guest.locator('#modal').waitFor({state:'hidden'});
    assert.deepEqual(await guest.evaluate(()=>skillAtModalClose),['repel'],'Guest closes only after its confirmed skill arrives');
    assert.equal(await host.evaluate(()=>Gufang.state.selectedSkill),'thunder');
    await host.locator('#menu-pause').click();
    await host.evaluate(()=>{Gufang.state.partner.coins=Gufang.state.partner.materials=1000;});
    await guest.waitForFunction(()=>Gufang.state.partner.materials>=1000);
    const hostMap = await host.evaluate(() => ({ seed: Gufang.state.mapSeed, width: GF.worldWidth(Gufang.state), height: GF.worldHeight(Gufang.state) }));
    const guestMap = await guest.evaluate(() => ({ seed: Gufang.state.mapSeed, width: GF.worldWidth(Gufang.state), height: GF.worldHeight(Gufang.state) }));
    assert.deepEqual(guestMap, hostMap);
    const target = await guest.evaluate(() => {
      const s = Gufang.state, mine = GF.playerView(s, 1);
      for (let y = 0; y < GF.worldHeight(s); y++) for (let x = 0; x < GF.worldWidth(s); x++)
        for (const type of ['tea', 'tower', 'mulberry', 'quarry']) if (!GF.buildReason(mine, type, x, y)) return { x, y, type };
      return null;
    });
    assert(target, 'Guest estate has a buildable tile');
    await guest.evaluate(({ x, y }) => Gufang.select(x, y), target);
    await guest.locator(`[data-build="${target.type}"] .build-action`).click();
    await host.waitForFunction(({ x, y }) => Gufang.state.buildings.some(b => b.owner === 1 && b.x === x && b.y === y), target);
    await guest.waitForFunction(({ x, y }) => Gufang.state.buildings.some(b => b.owner === 1 && b.x === x && b.y === y), target);
    await host.evaluate(({ x, y }) => Gufang.select(x, y), target);
    assert(await host.locator('#panel').isHidden(), 'Host cannot edit the guest estate');
    const guestFunds = await guest.evaluate(() => [Gufang.state.partner.coins, Gufang.state.partner.materials]);
    const hostFunds = await host.evaluate(() => [Gufang.state.partner.coins, Gufang.state.partner.materials]);
    assert.deepEqual(guestFunds, hostFunds);
    await host.evaluate(() => {
      const s = Gufang.state;
      s.partner.coins = 10000; s.partner.materials = 10000;
      s.buildings.find(b => b.owner === 1 && b.type === 'shrine').level = 2;
    });
    await guest.waitForFunction(() => Gufang.state.partner.coins === 10000 && Gufang.state.buildings.some(b => b.owner === 1 && b.type === 'shrine' && b.level === 2));
    await guest.evaluate(({ x, y }) => Gufang.select(x, y), target);
    await guest.locator('#upgrade-building').click();
    await host.waitForFunction(({ x, y }) => Gufang.state.buildings.some(b => b.owner === 1 && b.x === x && b.y === y && b.level === 2), target);
    await guest.locator('#demolish-building').click();
    await guest.locator('[data-modal="confirm-demolish"]').click();
    await host.waitForFunction(({ x, y }) => !Gufang.state.buildings.some(b => b.owner === 1 && b.x === x && b.y === y), target);
    const elapsed = await host.evaluate(() => Gufang.state.elapsed);
    await host.waitForTimeout(350);
    assert.equal(await host.evaluate(() => Gufang.state.elapsed), elapsed);
    await host.evaluate(() => { while (Gufang.state.phase !== 'night') GF.step(Gufang.state, .25); Gufang.refresh(); });
    await guest.waitForFunction(() => Gufang.state.phase === 'night');
    await guest.locator('[data-skill="repel"]').click();
    await host.waitForFunction(() => Gufang.state.partner.cooldowns.repel > 0);
    await host.locator('[data-modal="close"]').click();
    await guest.reload();
    await host.waitForFunction(() => Gufang.online && !Gufang.online.peerConnected);
    await guest.locator('#start-coop').click();
    await guest.locator('#coop-code').fill(code);
    await guest.locator('#coop-join').click();
    await guest.waitForFunction(() => Gufang.state.mode === 'coop' && Gufang.online?.peerConnected);
    assert.equal(await guest.evaluate(()=>Gufang.state.partner.selectedSkill),'repel');
    assert(await guest.locator('#modal').isHidden(),'Reconnect preserves the confirmed skill');
    assert(await host.evaluate(() => Gufang.online.peerConnected));
    const motionBefore = motionFrames;
    await guest.waitForTimeout(1000);
    assert(motionFrames - motionBefore >= 6, 'Guest receives high-frequency motion packets while the host runs');
    await host.locator('#menu-pause').click();
    await host.locator('[data-modal="reset"]').click();
    await host.locator('[data-modal="new"]').click();
    const newSeed = await host.evaluate(() => Gufang.state.mapSeed);
    await guest.waitForFunction(seed => Gufang.state.mapSeed === seed && Gufang.state.day === 1, newSeed);
    await host.locator('[data-choice="thunder"]').click();
    await guest.locator('[data-choice="repel"]').click();
    await guest.waitForFunction(()=>Gufang.state.partner.selectedSkill==='repel');
    await guest.locator('#modal').waitFor({state:'hidden'});
    await host.locator('#menu-pause').click();
    await host.locator('[data-modal="title"]').click();
    await guest.waitForFunction(() => !Gufang.online && !document.getElementById('start-menu').hidden);
    assert.deepEqual(errors, []);
    console.log('PASS LAN browser: room, two devices, guest build/upgrade/demolish/skill, ownership, state sync, pause, reconnect, restart, host departure');
  } finally {
    await browser.close();
    await service.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
