'use strict';
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const G = require('../js/game');
const { createServer } = require('../server');
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

(async () => {
  const service = createServer();
  await new Promise(resolve => service.server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
    const address = `http://127.0.0.1:${service.server.address().port}`;
    const contexts = await Promise.all([browser.newContext(), browser.newContext()]);
    for (const context of contexts) await context.addInitScript(() => {
      window.__holdMotion = false; window.__motionInbox = [];
      window.__releaseMotion = () => {
        window.__holdMotion = false;
        for (const deliver of window.__motionInbox.splice(0)) deliver();
      };
      const descriptor = Object.getOwnPropertyDescriptor(WebSocket.prototype, 'onmessage');
      Object.defineProperty(WebSocket.prototype, 'onmessage', {
        configurable: true, get: descriptor.get,
        set(handler) {
          descriptor.set.call(this, function (event) {
            const message = JSON.parse(event.data);
            if (window.__holdMotion && ['delta', 'snapshot'].includes(message.type)) window.__motionInbox.push(() => handler.call(this, event));
            else handler.call(this, event);
          });
        }
      });
    });
    const [host, guest] = await Promise.all(contexts.map(context => context.newPage()));
    const errors = [];
    for (const page of [host, guest]) page.on('pageerror', error => errors.push(error.message));
    // Test both the runtime entry and the packaged HTML in the same real room.
    await host.goto(address);
    await guest.goto(address + '/dist/' + encodeURIComponent('古坊奇谭.html'));
    for (const page of [host, guest]) await page.locator('#start-coop').click();
    await host.locator('#coop-host').click();
    await host.waitForFunction(() => /^\d{6}$/.test(document.getElementById('coop-code').value));
    const code = await host.locator('#coop-code').inputValue();
    await guest.locator('#coop-code').fill(code); await guest.locator('#coop-join').click();
    await host.waitForFunction(() => !document.getElementById('coop-start').disabled);
    await host.locator('#coop-start').click();
    for (const page of [host, guest]) await page.locator('[data-choice="thunder"]').click();
    await guest.waitForFunction(() => Gufang.state.elapsed > .1);

    for (const page of [host, guest]) await page.evaluate(() => {
      window.__motionFrames = []; window.__combatCalls = 0;
      const step = GF.step; GF.step = (...args) => { __combatCalls++; return step(...args); };
      const render = GFArt.render;
      GFArt.render = (canvas, state, camera, selection, options) => {
        window.__motionPositions = () => state.soldiers.map(unit => ({ id: unit.id, ...options.unitPosition(unit, state.players[unit.owner].team === 0) }));
        return render(canvas, state, camera, selection, { ...options, unitPosition(unit, friendly) {
          const point = options.unitPosition(unit, friendly);
          __motionFrames.push({ at: performance.now(), id: unit.id, ...point });
          return point;
        } });
      };
    });
    const room = service.rooms.get(code);
    for (const player of room.state.players) player.controller = 'human';
    const ids = [1, 2].map(owner => {
      const home = G.estate(G.playerView(room.state, owner)).center, id = room.state.nextId++;
      room.state.soldiers.push({ id, owner, barracksId: 999999, troopType: 'infantry', x: home.x, y: home.y + 1,
        hp: 44, maxHp: 44, level: 1, baseDamage: 18, attack: 0, attackAt: 0, targetOwner: null,
        targetId: null, targetBuildingId: null, repelled: 0, slowed: 0, slowFactor: 1, waypoint: null });
      return id;
    });
    service.publish(room, true);
    await guest.waitForFunction(() => Gufang.state.soldiers.length === 2);
    await guest.waitForTimeout(950);
    for (const page of [host, guest]) {
      const frames = await page.evaluate(() => __motionFrames);
      for (const id of ids) {
        const samples = frames.filter(frame => frame.id === id);
        assert(samples.length >= 20, 'Host and guest continuously render both factions');
        const steps = samples.slice(1).map((sample, i) => ({ length: distance(sample, samples[i]), dt: (sample.at - samples[i].at) / 1000 }));
        assert(steps.filter(step => step.length > .0001).length >= steps.length * .7, 'Most frames advance each faction');
        assert(steps.every(step => step.length < .025 + step.dt * 1.6), 'No visible packet jump in either faction');
      }
      assert.equal(await page.evaluate(() => __combatCalls), 0, 'Clients never execute full game simulation');
    }

    await guest.evaluate(() => { __holdMotion = true; __motionFrames = []; });
    const confirmed = await guest.evaluate(() => JSON.stringify(Gufang.state.soldiers));
    const beforeGap = await guest.evaluate(() => __motionPositions());
    await guest.waitForTimeout(350);
    const duringGap = await guest.evaluate(() => __motionPositions());
    for (const [i, position] of duringGap.entries()) assert(distance(position, beforeGap[i]) > .12, 'Local prediction continues past the old interpolation interval');
    assert.equal(await guest.evaluate(() => JSON.stringify(Gufang.state.soldiers)), confirmed, 'Prediction leaves confirmed positions and HP untouched');
    await guest.waitForTimeout(350);
    const atLimit = await guest.evaluate(() => __motionPositions());
    await guest.waitForTimeout(200);
    const afterLimit = await guest.evaluate(() => __motionPositions());
    assert.deepEqual(afterLimit, atLimit, 'A prolonged outage stops extrapolation after 500ms');
    assert(await guest.evaluate(() => __motionInbox.length >= 3), 'Real server updates were delayed');
    await guest.evaluate(() => __releaseMotion());
    await guest.waitForTimeout(450);
    const recovered = await guest.evaluate(() => __motionPositions());
    for (const position of recovered) assert(distance(position, room.state.soldiers.find(u => u.id === position.id)) < .16, 'Display converges after delayed packets are released');

    await host.locator('#menu-pause').click();
    await guest.waitForTimeout(220);
    const paused = await guest.evaluate(() => __motionPositions());
    await guest.waitForTimeout(250);
    assert.deepEqual(await guest.evaluate(() => __motionPositions()), paused, 'Server pause freezes prediction');
    await host.evaluate(() => Gufang.setPaused(false));
    await guest.waitForTimeout(450);
    const resumed = await guest.evaluate(() => __motionPositions());
    for (const [i, position] of resumed.entries()) assert(distance(position, paused[i]) > .1, 'Both factions resume local movement');
    for (const page of [host, guest]) assert.equal(await page.evaluate(() => __combatCalls), 0);
    assert.deepEqual(errors, []);
    console.log('PASS motion prediction: host/runtime + guest/packaged HTML, both factions, 900ms delivery gap, recovery, pause/resume, server authority');
  } finally {
    if (browser) await browser.close();
    await service.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
