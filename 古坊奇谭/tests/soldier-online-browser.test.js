'use strict';
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const G = require('../js/game');
const { createServer } = require('../server');

const chrome = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

(async () => {
  const service = createServer();
  await new Promise(resolve => service.server.listen(0, '127.0.0.1', resolve));
  const address = `http://127.0.0.1:${service.server.address().port}/dist/%E5%8F%A4%E5%9D%8A%E5%A5%87%E8%B0%AD.html`;
  const browser = await chromium.launch({ executablePath: chrome, headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 900, height: 760 } });
    await context.addInitScript(() => {
      window.__soldierFrames = [];
      const original = CanvasRenderingContext2D.prototype.drawImage;
      CanvasRenderingContext2D.prototype.drawImage = function (...args) {
        if (this.canvas?.id === 'map' && args.length === 9 && args[3] === 20 && args[4] === 30) {
          const m = this.getTransform(); window.__soldierFrames.push({ at: performance.now(), x: m.e, y: m.f });
        }
        return original.apply(this, args);
      };
    });
    const host = await context.newPage(), guest = await context.newPage();
    for (const page of [host, guest]) { await page.goto(address); await page.locator('#start-coop').click(); }
    await host.locator('#coop-host').click();
    await host.waitForFunction(() => /^\d{6}$/.test(document.getElementById('coop-code').value));
    const code = await host.locator('#coop-code').inputValue();
    await guest.locator('#coop-code').fill(code); await guest.locator('#coop-join').click();
    await host.locator('#coop-start').waitFor({ state: 'visible' });
    await host.waitForFunction(() => !document.getElementById('coop-start').disabled);
    await host.locator('#coop-start').click();
    await Promise.all([host, guest].map(page => page.waitForFunction(() => Gufang.state.mode === 'coop')));
    await host.locator('[data-choice="thunder"]').click();
    await guest.locator('[data-choice="repair"]').click();
    await Promise.all([host, guest].map(page => page.waitForFunction(() => !Gufang.paused)));
    const liveAt=await guest.evaluate(() => Gufang.state.elapsed);
    await guest.waitForFunction(start => Gufang.state.elapsed > start + .1, liveAt);

    const room = [...service.rooms.values()][0], home = G.estate(G.playerView(room.state, 1)).center;
    room.state.soldiers.push({ id: room.state.nextId++, owner: 1, barracksId: 999999, x: home.x, y: home.y + 1,
      level: 1, hp: 44, maxHp: 44, baseDamage: 18, attack: 0, targetOwner: 0, targetId: null,
      repelled: 0, slowed: 0, slowFactor: 1, waypoint: null });
    service.publish(room, true);
    await guest.waitForFunction(() => Gufang.state.soldiers.length === 1);
    await guest.waitForTimeout(250);
    await guest.evaluate(() => { window.__soldierFrames = []; });
    await guest.waitForTimeout(900);

    const frames = await guest.evaluate(() => window.__soldierFrames.slice()), serverUnit = room.state.soldiers[0];
    const guestUnit = await guest.evaluate(() => ({ x: Gufang.state.soldiers[0].x, y: Gufang.state.soldiers[0].y }));
    assert(Math.hypot(serverUnit.x - guestUnit.x, serverUnit.y - guestUnit.y) < .12, 'Guest follows the latest authoritative position');
    assert(frames.length >= 20, `Expected continuous online drawing, got ${frames.length} frames`);
    const steps = frames.slice(1).map((frame, index) => Math.hypot(frame.x - frames[index].x, frame.y - frames[index].y));
    assert(steps.filter(step => step > .02).length >= steps.length * .6, 'Most online display frames advance the soldier');
    const maxStep=Math.max(...steps),maxIndex=steps.indexOf(maxStep);
    assert(maxStep < 2, `Online interpolation has a visible packet jump: ${maxStep}px near ${JSON.stringify(frames.slice(Math.max(0,maxIndex-1),maxIndex+3))}`);
    console.log(`PASS online soldier interpolation: ${frames.length} frames, max step ${Math.max(...steps).toFixed(3)}px`);
  } finally {
    await browser.close(); await service.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
