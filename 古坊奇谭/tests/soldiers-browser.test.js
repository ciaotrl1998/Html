'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const root = path.join(__dirname, '..');
const sourceOnly = process.argv.includes('--source-only') || !!process.env.GUFANG_SOURCE_ONLY;
const failures = [];
const near = (actual, expected, label) => assert(Math.abs(actual - expected) < .001, `${label}: ${actual} != ${expected}`);

async function open(browser, file, viewport) {
  const context = await browser.newContext({ viewport, hasTouch: viewport.width < 500 });
  const page = await context.newPage();
  page.errors = [];
  page.on('pageerror', error => page.errors.push(error.message));
  // Source uses current modules; the default run also checks the caller's built dist verbatim.
  if (file === 'index.html') await page.route('**/js/runtime.js', route => route.fulfill({
    contentType: 'application/javascript',
    body: ['game', 'art', 'autoplay', 'app'].map(name => fs.readFileSync(path.join(root, 'js', name + '.js'), 'utf8')).join('\n;\n')
  }));
  await context.addInitScript(() => {
    // Stop automatic simulation, while retaining the app's real render loop and reload storage.
    Object.defineProperty(document, 'hidden', { get: () => true, configurable: true });
    window.captureSoldiers = camera => {
      const canvas = document.getElementById('map'), c = canvas.getContext('2d');
      const calls = [], originals = {}, colors = new Set([
        '#818967', '#916b60', '#526d60', '#254a31', '#c9dfaa', '#91c967', '#273e3480', '#bb775a'
      ]);
      for (const method of ['fill', 'fillRect', 'strokeRect']) {
        originals[method] = c[method];
        c[method] = function (...args) {
          const color = method === 'strokeRect' ? this.strokeStyle : this.fillStyle;
          if (colors.has(color)) {
            const m = this.getTransform();
            calls.push({ method, color, args, matrix: [m.a, m.b, m.c, m.d, m.e, m.f],
              alpha: this.globalAlpha, composite: this.globalCompositeOperation });
          }
          return originals[method].apply(this, args);
        };
      }
      try { GFArt.render(canvas, Gufang.state, camera || Gufang.camera, null, { grid: false }); }
      finally { for (const method of Object.keys(originals)) c[method] = originals[method]; }
      const s = Gufang.state;
      return { calls, camera: camera || Gufang.camera, width: canvas.clientWidth, height: canvas.clientHeight,
        dpr: canvas.width / canvas.clientWidth, tile: GFArt.T,
        units: s.soldiers.map(u => ({ id: u.id, x: u.x, y: u.y, hp: u.hp, maxHp: u.maxHp })),
        enemies: s.enemies.map(e => ({ id: e.id, x: e.x, y: e.y })),
        barracks: s.buildings.filter(b => b.type === 'barracks').map(b => ({ x: b.x, y: b.y })) };
    };
  });
  await page.goto(pathToFileURL(path.join(root, file)).href);
  await page.waitForFunction(() => !!window.Gufang);
  await page.locator('#start-single').click();
  return page;
}

function drawn(frame, label) {
  const { calls, camera: cam, dpr, tile } = frame;
  const bodies = calls.filter(c => c.method === 'fill' && ['#818967', '#916b60'].includes(c.color));
  assert.equal(bodies.filter(c => c.color === '#818967').length, frame.units.length, label + ' soldier bodies');
  assert.equal(bodies.filter(c => c.color === '#916b60').length, frame.enemies.length, label + ' enemy bodies');
  for (const [color, entities] of [['#818967', frame.units], ['#916b60', frame.enemies]]) {
    const remaining = bodies.filter(c => c.color === color).slice();
    for (const u of entities) {
      const x = (cam.x + (u.x * tile + tile / 2) * cam.zoom) * dpr;
      const y = (cam.y + (u.y * tile + tile / 2) * cam.zoom) * dpr;
      const index = remaining.findIndex(c => Math.abs(c.matrix[4] - x) < .001 && Math.abs(c.matrix[5] - y) < .001);
      assert(index >= 0, label + ' body at actual entity x*T/y*T: ' + JSON.stringify(u));
      const body = remaining.splice(index, 1)[0];
      near(body.matrix[0], cam.zoom * dpr, label + ' body scale');
      near(body.matrix[3], cam.zoom * dpr, label + ' body scale y');
    }
  }
  const lastBody = Math.max(...bodies.map(c => calls.indexOf(c)));
  for (const [color, method] of [['#254a31', 'fillRect'], ['#91c967', 'fillRect'], ['#c9dfaa', 'strokeRect']]) {
    const bars = calls.filter(c => c.color === color && c.method === method);
    assert.equal(bars.length, frame.units.length, label + ' unit-specific HP ' + color);
    const remaining = bars.slice();
    for (const u of frame.units) {
      const x = (cam.x + (u.x * tile + tile / 2) * cam.zoom) * dpr;
      const y = (cam.y + (u.y * tile + tile / 2) * cam.zoom) * dpr;
      const index = remaining.findIndex(c => Math.abs(c.matrix[4] - x) < .001 && Math.abs(c.matrix[5] - y) < .001);
      assert(index >= 0, label + ' HP follows soldier ' + u.id);
      const bar = remaining.splice(index, 1)[0];
      const expected = color === '#91c967' ? [-13, -26, 26 * u.hp / u.maxHp, 2.5] : [-14, -27, 28, 4.5];
      bar.args.forEach((value, i) => near(value, expected[i], label + ' HP rectangle'));
      near(bar.matrix[0], cam.zoom * dpr, label + ' HP scale');
      assert.equal(bar.alpha, 1, label + ' HP is opaque');
      assert.equal(bar.composite, 'source-over', label + ' HP composite');
      assert(calls.indexOf(bar) > lastBody, label + ' HP drawn after every unit body');
    }
  }
}

async function scene(page, level = 2) {
  await page.evaluate(level => {
    // The public legacy-map constructor supplies known traversable combat plots.
    const s = Gufang.state;
    for (const key of Object.keys(s)) delete s[key];
    Object.assign(s, GF.createState(null));
    s.coins = s.materials = 1e9;
    const shrine = s.buildings.find(b => b.type === 'shrine');
    shrine.level = 15; shrine.hp = GF.maxHP(shrine);
    const b = GF.grantBuilding(s, 'barracks', 8, 7, level);
    if (!b) throw Error('Cannot grant barracks fixture');
    GF.startNight(s); s.wave.timer = 1e6; Gufang.refresh();
  }, level);
}

async function ui(page) {
  const plot = await page.evaluate(() => {
    const s = Gufang.state;
    s.coins = s.materials = 1e9;
    const shrine = s.buildings.find(b => b.type === 'shrine');
    shrine.level = 15; shrine.hp = GF.maxHP(shrine);
    for (let y = 1; y < GF.worldSize(s) - 1; y++) for (let x = 1; x < GF.worldSize(s) - 1; x++) {
      if (GF.terrain(x, y, s) === 'plain' && !GF.buildReason(s, 'barracks', x, y)) {
        Gufang.select(x, y); return { x, y };
      }
    }
    throw Error('No buildable barracks plot');
  });
  const card = page.locator('[data-build="barracks"]');
  assert.equal(await card.locator('.card-effect').innerText(), '\u81ea\u52a8\u6d3e\u51fa1\u540d\u6c11\u5175');
  assert.equal(await card.getAttribute('aria-disabled'), 'false');
  await card.click();
  const expectedStats = () => page.evaluate(() => {
    const s = Gufang.state, b = s.buildings.find(b => b.type === 'barracks'), next = { ...b, level: b.level + 1 };
    const preview = api => String(api(b)) + (b.level >= GF.maxLevel(b) ? '' : ' \u2192 ' + api(next));
    return [preview(GF.maxHP), preview(GF.soldierLimit), preview(b => GF.soldierPower(s, b))];
  });
  const stats = () => page.locator('.upgrade-stats strong').allTextContents();
  const first = await expectedStats();
  assert.equal(first[1], '1 \u2192 2');
  assert(first[2].startsWith(Math.round(Math.sqrt(120 * 18)) + ' \u2192 '));
  assert.deepEqual(await stats(), first, 'Exact current/next stats from public API');
  assert.equal(await page.locator('.detail-description,.detail-art span').count(), 0);
  assert.deepEqual(await page.locator('.upgrade-stats > div').evaluateAll(rows => rows.map(row => row.firstChild.textContent)),
    ['\u8010\u4e45\u4e0a\u9650', '\u51fa\u5175\u4e0a\u9650', '\u58eb\u5175\u6218\u529b']);
  for (let level = 1; level <= 9; level++) {
    await page.evaluate(level => {
      const b = Gufang.state.buildings.find(b => b.type === 'barracks');
      b.level = level; b.hp = GF.maxHP(b); Gufang.select(b.x, b.y);
    }, level);
    assert.deepEqual(await stats(), await expectedStats(), 'Public API preview at level ' + level);
    assert(await page.evaluate(() => {
      const s = Gufang.state, b = s.buildings.find(b => b.type === 'barracks');
      return GF.soldierPower(s, b) === Math.round(Math.sqrt(GF.soldierHP(b) * GF.soldierDamage(s, b)));
    }), 'Power uses rounded geometric mean at level ' + level);
  }
  await page.evaluate(() => {
    const b = Gufang.state.buildings.find(b => b.type === 'barracks');
    b.level = 1; b.hp = GF.maxHP(b); Gufang.select(b.x, b.y);
  });
  await page.evaluate(() => { GF.startNight(Gufang.state); Gufang.state.wave.timer = 1e6; Gufang.refresh(); });
  let frame = await page.evaluate(() => captureSoldiers());
  assert.equal(frame.units.length, 1, 'Level one automatically recruits one real entity');
  drawn(frame, 'level one night');
  const direct = await page.evaluate(() => {
    const s = Gufang.state, b = s.buildings.find(b => b.type === 'barracks');
    s.soldiers[0].hp *= .5;
    const copy = GF.restore(GF.serialize(s));
    if (!copy) throw Error('Pre-upgrade snapshot rejected');
    const result = GF.upgrade(copy, copy.buildings.find(n => n.id === b.id));
    if (!result.ok) throw Error(result.reason);
    return { coins: copy.coins, materials: copy.materials, building: copy.buildings.find(n => n.id === b.id), soldiers: copy.soldiers };
  });
  assert.equal(await page.locator('#upgrade-building').getAttribute('aria-disabled'), 'false');
  await page.locator('#upgrade-building').click();
  const actual = await page.evaluate(() => ({ coins: Gufang.state.coins, materials: Gufang.state.materials,
    building: Gufang.state.buildings.find(b => b.type === 'barracks'), soldiers: Gufang.state.soldiers }));
  assert.deepEqual(actual, direct, 'UI upgrade equals public GF.upgrade, including cost and wounded army');
  assert.equal(actual.building.level, 2); assert.equal(actual.soldiers.length, 2);
  assert.equal(actual.soldiers[0].hp, actual.soldiers[0].maxHp / 2);
  assert.deepEqual(await stats(), await expectedStats(), 'Upgraded detail refreshes exact next stats');
  frame = await page.evaluate(() => captureSoldiers()); drawn(frame, 'level two night');
  const layout = await page.locator('.detail').evaluate(el => ({ overflow: document.documentElement.scrollWidth > innerWidth,
    statsOverflow: el.querySelector('.upgrade-stats').scrollWidth > el.querySelector('.upgrade-stats').clientWidth }));
  assert(!layout.overflow && !layout.statsOverflow, JSON.stringify(layout));
  await page.locator('#close-panel').click();
  assert(await page.evaluate(plot => GF.at(Gufang.state, plot.x, plot.y).type === 'barracks', plot));
}

async function rendering(page) {
  await scene(page);
  const samples = await page.evaluate(() => {
    const s = Gufang.state;
    s.wave.timer = 0; GF.step(s, .1);
    if (!s.enemies.length) throw Error('Night wave did not spawn a real enemy');
    s.wave.timer = 1e6;
    const e = s.enemies[0];
    Object.assign(e, { x: 16, y: 7, hp: 100000, maxHp: 100000, repelled: 1000, path: [], pathRevision: -1 });
    const samples = [captureSoldiers()], start = { x: s.soldiers[0].x, y: s.soldiers[0].y };
    for (let i = 0; i < 200 && e.hp === e.maxHp; i++) {
      GF.step(s, .1);
      if (i % 20 === 0) samples.push(captureSoldiers());
    }
    samples.push(captureSoldiers());
    return { samples, start, enemyHP: e.hp, maxHP: e.maxHp, target: e.id, targets: s.soldiers.map(u => u.targetId) };
  });
  assert(samples.enemyHP < samples.maxHP, 'Soldiers actually pursue and hit a distant enemy');
  assert(samples.targets.every(id => id === samples.target), 'Army targets the real enemy');
  const last = samples.samples.at(-1).units[0];
  assert(Math.hypot(last.x - samples.start.x, last.y - samples.start.y) > 4.5, 'Soldier moved beyond barracks range');
  samples.samples.forEach((frame, i) => drawn(frame, 'pursuit frame ' + i));
  const overlap = await page.evaluate(() => {
    const s = Gufang.state, e = s.enemies[0], canvas = document.getElementById('map');
    // Frame the actual distant units with a viewport that culls their owner building.
    const cam = { zoom: 1.8, x: canvas.clientWidth / 2 - (e.x * GFArt.T + 32) * 1.8,
      y: canvas.clientHeight * .4 - (e.y * GFArt.T + 32) * 1.8 };
    for (const u of s.soldiers) { u.x = e.x; u.y = e.y; }
    return [captureSoldiers(cam), ...[.5, .1].map(ratio => {
      for (const u of s.soldiers) u.hp = u.maxHp * ratio;
      return captureSoldiers(cam);
    })];
  });
  for (const [i, frame] of overlap.entries()) {
    drawn(frame, 'same-position full/wounded HP ' + i);
    const cam = frame.camera, b = frame.barracks[0], u = frame.units[0];
    const left = Math.max(0, Math.floor(-cam.x / cam.zoom / frame.tile) - 1);
    const right = Math.ceil((frame.width - cam.x) / cam.zoom / frame.tile) + 1;
    assert(b.x < left || b.x > right, 'Barracks excluded by actual render culling bounds');
    const x = cam.x + (u.x * frame.tile + 32) * cam.zoom, y = cam.y + (u.y * frame.tile + 32) * cam.zoom;
    assert(x > 28 && x < frame.width - 28 && y > 50 && y < frame.height - 28, 'Soldier and HP inside canvas viewport');
    const green = frame.calls.filter(c => c.color === '#91c967');
    const red = frame.calls.filter(c => c.color === '#bb775a');
    assert(green.every(c => frame.calls.indexOf(c) > Math.max(...red.map(r => frame.calls.indexOf(r)))), 'Overlapping enemy HP cannot overwrite soldier green HP');
  }
}

async function persistence(page) {
  await scene(page);
  const before = await page.evaluate(() => {
    const s = Gufang.state, u = s.soldiers[0];
    s.soldiers[1].hp = 0; GF.step(s, .1);
    Object.assign(u, { x: 9, y: 8 });
    const e = { id: s.nextId++, type: 'bandit', x: 9.6, y: 8, hp: 10000, maxHp: 10000, damage: 14,
      speed: .65, attack: 0, repelled: 0, slowed: 0, slowFactor: 1, laneX: 0, laneY: 0, path: [], pathRevision: -1 };
    s.enemies.push(e);
    const hp = u.hp, damage = GF.soldierDamage(s, s.buildings.find(b => b.type === 'barracks'));
    GF.step(s, .1);
    const first = { soldier: u.hp, enemy: e.hp };
    for (let i = 0; i < 9; i++) GF.step(s, .1);
    const cooldown = { soldier: u.hp, enemy: e.hp };
    GF.step(s, .1); Gufang.refresh();
    return { hp, damage, first, cooldown, second: { soldier: u.hp, enemy: e.hp },
      soldiers: JSON.parse(JSON.stringify(s.soldiers)), target: e.soldierTargetId, enemy: e.id,
      quota: s.buildings.find(b => b.type === 'barracks').musteredCount };
  });
  near(before.first.soldier, before.hp - 14, 'Enemy really damages soldier HP');
  near(before.first.enemy, 10000 - before.damage, 'Soldier really damages enemy HP');
  assert.deepEqual(before.cooldown, before.first, 'No second hit before one second');
  near(before.second.soldier, before.hp - 28, 'Enemy second hit at one second');
  near(before.second.enemy, 10000 - 2 * before.damage, 'Soldier second hit at one second');
  assert.equal(before.quota, 2); assert.equal(before.soldiers.length, 1);
  drawn(await page.evaluate(() => captureSoldiers()), 'real combat wounded HP');
  await page.locator('#menu-pause').click();
  await page.locator('[data-modal="save"]').click();
  const snapshot = () => page.evaluate(() => {
    const s = Gufang.state;
    return { soldiers: s.soldiers.map(({ id, barracksId, x, y, hp, maxHp, level, attack, targetId }) =>
      ({ id, barracksId, x, y, hp, maxHp, level, attack, targetId })),
    enemies: s.enemies.map(({ id, hp, soldierTargetId }) => ({ id, hp, soldierTargetId })),
    quota: s.buildings.find(b => b.type === 'barracks').musteredCount, nextId: s.nextId };
  });
  const saved = await snapshot();
  assert.equal(saved.soldiers[0].targetId, before.enemy); assert.equal(saved.enemies[0].soldierTargetId, before.soldiers[0].id);
  for (let i = 0; i < 3; i++) {
    await page.reload(); await page.waitForFunction(() => !!window.Gufang);
    assert(await page.locator('#start-load').isEnabled()); await page.locator('#start-load').click();
    assert.deepEqual(await snapshot(), saved, 'UI save/reload preserves wounded army and both target IDs, round ' + i);
    drawn(await page.evaluate(() => captureSoldiers()), 'loaded night ' + i);
    assert(await page.evaluate(() => {
      const s = Gufang.state, entities = [...s.buildings, ...s.enemies, ...s.soldiers];
      return new Set(entities.map(e => e.id)).size === entities.length && entities.every(e => e.id < s.nextId);
    }), 'No duplicate entity IDs after reload');
    await page.evaluate(() => Gufang.save());
  }
  const ending = await page.evaluate(() => {
    const s = Gufang.state;
    s.enemies = []; s.wave.timer = 1e6;
    for (let i = 0; i < 20; i++) GF.step(s, .1);
    const idle = captureSoldiers();
    s.wave.spawned = s.wave.total; GF.step(s, .1);
    const day = { phase: s.phase, frame: captureSoldiers(), quota: s.buildings.find(b => b.type === 'barracks').musteredCount };
    GF.startNight(s); s.wave.timer = 1e6;
    const next = captureSoldiers();
    const quota = s.buildings.find(b => b.type === 'barracks').musteredCount;
    s.wave.timer = 0; GF.step(s, .1);
    return { idle, day, next, quota, spawn: captureSoldiers() };
  });
  assert.equal(ending.idle.units.length, 1, 'Reload does not replenish casualties or hide idle night army');
  drawn(ending.idle, 'idle night');
  assert.equal(ending.day.phase, 'day'); assert.equal(ending.day.quota, undefined);
  assert.deepEqual(ending.day.frame.units, []); drawn(ending.day.frame, 'day clears unit art and HP');
  assert.equal(ending.next.units.length, 2); assert.equal(ending.quota, 2);
  assert(ending.next.units.every(u => u.hp === u.maxHp && !saved.soldiers.some(old => old.id === u.id)), 'Next night resets IDs, HP and army quota');
  drawn(ending.next, 'next night auto recruitment');
  assert(ending.spawn.enemies.length > 0, 'Next night actually spawns enemies');
  assert.equal(ending.spawn.units.length, 2); drawn(ending.spawn, 'night spawn retains soldier art and HP');
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
  const check = async (label, action) => {
    try { await action(); console.log('PASS ' + label); }
    catch (error) { failures.push(label + ': ' + error.stack); console.error('FAIL ' + label + ': ' + error.message); }
  };
  try {
    for (const file of sourceOnly ? ['index.html'] : ['index.html', 'dist/古坊奇谭.html']) {
      for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }, { width: 320, height: 740 }]) {
        const page = await open(browser, file, viewport), label = `${file} ${viewport.width}x${viewport.height}`;
        try {
          await check(label + ' barracks card/detail/UI upgrade and recruitment', () => ui(page));
          await check(label + ' pursuit/overlap/offscreen owner/HP draw order', () => rendering(page));
          await check(label + ' combat/save/load/night reset/day clear', () => persistence(page));
          await check(label + ' browser errors', async () => assert.deepEqual(page.errors, []));
        } finally { await page.context().close(); }
      }
    }
  } finally { await browser.close(); }
  assert.equal(failures.length, 0, failures.join('\n\n'));
})().catch(error => { console.error(error); process.exitCode = 1; });
