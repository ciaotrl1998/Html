'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const root = path.join(__dirname, '..');
const sourceOnly = process.argv.includes('--source-only') || !!process.env.GUFANG_SOURCE_ONLY;
const failures = [];
const near = (actual, expected, message) => assert(Math.abs(actual - expected) < .05, `${message}: ${actual} != ${expected}`);

async function open(browser, file, viewport, reducedMotion = 'no-preference') {
  const context = await browser.newContext({ viewport, hasTouch: viewport.width < 500, reducedMotion });
  const page = await context.newPage();
  page.errors = [];
  page.on('pageerror', error => page.errors.push(error.message));
  if (file === 'index.html') await page.route('**/js/runtime.js', route => route.fulfill({
    contentType: 'application/javascript',
    body: ['game', 'art', 'autoplay', 'app'].map(name => fs.readFileSync(path.join(root, 'js', name + '.js'), 'utf8')).join('\n;\n')
  }));
  // A fresh context isolates storage; do not clear it on reload, which would mask persistence bugs.
  await context.addInitScript(() => {
    Object.defineProperty(document, 'hidden', { get: () => false, configurable: true });
    window.renderGrids = [];
    Object.defineProperty(window, 'GFArt', {
      configurable: true,
      get() { return this.displayTestArt; },
      set(art) {
        const render = art.render;
        art.render = function (canvas, state, camera, selected, options) {
          if (canvas.id === 'map') {
            window.renderGrids.push(options?.grid);
            if (window.renderGrids.length > 100) window.renderGrids.shift();
          }
          return render.apply(this, arguments);
        };
        this.displayTestArt = art;
      }
    });
  });
  await page.goto(pathToFileURL(path.join(root, file)).href);
  await page.waitForFunction(() => !!window.Gufang);
  await page.locator('#start-single').click();
  return page;
}

async function arrows(page, reduced = false) {
  await page.evaluate(() => {
    Object.assign(Gufang.state, { phase: 'dusk', day: 7, time: 0 });
    Gufang.refresh();
  });
  await page.waitForFunction(() => [...document.querySelectorAll('.invasion-arrow')].some(el => !el.hidden));
  const samples = await page.locator('.invasion-arrow').evaluateAll((elements, reduced) => elements.map(el => {
    const svg = el.querySelector('svg'), style = getComputedStyle(svg);
    const rect = node => { const r = node.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; };
    const matrix = () => { const m = new DOMMatrixReadOnly(getComputedStyle(svg).transform); return [m.a, m.b, m.c, m.d, m.e, m.f]; };
    const animations = svg.getAnimations();
    const result = { name: style.animationName, duration: style.animationDuration, count: animations.length };
    if (reduced) { result.rest = matrix(); return result; }
    if (!animations.length) return result;
    const animation = animations[0];
    animation.pause(); animation.currentTime = 0;
    result.rest = matrix(); result.anchor0 = rect(el); result.svg0 = rect(svg);
    animation.currentTime = 800;
    result.peak = matrix(); result.anchor800 = rect(el); result.svg800 = rect(svg);
    animation.currentTime = 1600; result.end = matrix();
    animation.currentTime = 0;
    return result;
  }), reduced);
  assert.equal(samples.length, 4);
  const rotations = [[1, 0, 0, 1], [0, 1, -1, 0], [-1, 0, 0, -1], [0, -1, 1, 0]];
  for (const [i, sample] of samples.entries()) {
    if (reduced) { assert.equal(sample.name, 'none'); assert.equal(sample.count, 0); }
    else {
      assert.equal(sample.name, 'invasion-' + ['north', 'east', 'south', 'west'][i]);
      assert.equal(sample.duration, '1.6s'); assert.equal(sample.count, 1);
      assert.deepEqual(sample.anchor800, sample.anchor0, 'Animation leaves the wrapper anchor fixed');
      for (let j = 0; j < 4; j++) near(sample.peak[j], rotations[i][j], 'Peak keeps outward rotation');
      const offset = [[0, -2], [2, 0], [0, 2], [-2, 0]][i];
      for (let j = 0; j < 2; j++) {
        near(sample.peak[j + 4] - sample.rest[j + 4], offset[j], 'Outward translation');
        near(sample.svg800[j] - sample.svg0[j], offset[j], 'Actual SVG movement');
      }
      sample.end.forEach((value, j) => near(value, sample.rest[j], 'Full cycle returns to rest'));
    }
    rotations[i].forEach((value, j) => near(sample.rest[j], value, 'Rest rotation'));
    near(sample.rest[4], 0, 'Rest x'); near(sample.rest[5], 0, 'Rest y');
  }
}

async function marker(page, reduced = false) {
  const captures = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 390; canvas.height = 844;
    canvas.style.cssText = 'position:fixed;left:-10000px;width:390px;height:844px';
    document.body.append(canvas);
    try {
      const c = canvas.getContext('2d'), s = GF.createState(null);
      s.buildings = [s.buildings.find(b => b.type === 'shrine')];
      s.coins = s.materials = 1e6;
      const b = s.buildings[0], cam = { x: 195 - (b.x * 64 + 32), y: 400 - (b.y * 64 + 32), zoom: 1 };
      if (GF.upgradeReason(s, b)) throw Error('Shrine fixture must be upgradeable');
      let points = [], polygons = [];
      const begin = c.beginPath, move = c.moveTo, line = c.lineTo, fill = c.fill;
      c.beginPath = function () { points = []; return begin.apply(this, arguments); };
      for (const [name, original] of [['moveTo', move], ['lineTo', line]]) c[name] = function (x, y) {
        const p = new DOMPoint(x, y).matrixTransform(this.getTransform()); points.push([p.x, p.y]);
        return original.apply(this, arguments);
      };
      c.fill = function () { if (this.fillStyle === '#b4df63') polygons.push(points.slice()); return fill.apply(this, arguments); };
      const capture = (elapsed, options = {}) => {
        s.elapsed = elapsed; polygons = []; GFArt.render(canvas, s, cam, null, options);
        if (polygons.length !== 1 || polygons[0].length !== 7) throw Error('Expected one seven-point upgrade marker');
        const p = polygons[0], xs = p.map(v => v[0]), ys = p.map(v => v[1]);
        return { points: p, bbox: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] };
      };
      return { id: b.id, zero: capture(0), half: capture(.5), optionZero: capture(0, { reducedMotion: true }), optionHalf: capture(.5, { reducedMotion: true }) };
    } finally { canvas.remove(); }
  });
  assert.deepEqual(captures.optionZero, captures.optionHalf, 'Explicit reducedMotion stops marker motion');
  const delta = reduced ? 0 : (Math.sin(1.5 + captures.id * 2.399963229728653) - Math.sin(captures.id * 2.399963229728653)) * 2.5;
  if (!reduced) assert(Math.abs(delta) > .1, 'Fixture samples different marker heights');
  captures.zero.points.forEach((point, i) => {
    near(captures.half.points[i][0], point[0], 'Marker x fixed');
    near(captures.half.points[i][1] - point[1], delta, 'Marker follows elapsed/id sine phase');
  });
  for (const i of [1, 3]) near(captures.half.bbox[i] - captures.zero.bbox[i], delta, 'Marker bbox motion');
  if (reduced) assert.deepEqual(captures.zero, captures.optionZero, 'Media preference and explicit option agree');
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
  const check = async (label, action) => {
    try { await action(); console.log('PASS ' + label); }
    catch (error) { failures.push(label + ': ' + error.stack); console.error('FAIL ' + label + ': ' + error.message); }
  };
  try {
    for (const file of sourceOnly ? ['index.html'] : ['index.html', 'dist/古坊奇谭.html']) {
      for (const viewport of [{ width: 1440, height: 1000 }, { width: 320, height: 740 }, { width: 390, height: 844 }]) {
        const page = await open(browser, file, viewport), label = `${file} ${viewport.width}`;
        try {
          const originalBuildings = await page.evaluate(() => JSON.parse(JSON.stringify(Gufang.state.buildings)));
          await check(label + ' thumbnails/detail (25 types, three stages)', async () => {
            const thumbnails = await page.evaluate(async () => {
              const results = [], original = CanvasRenderingContext2D.prototype.drawImage;
              let sourceBounds;
              const bounds = canvas => {
                const { width: w, height: h } = canvas, pixels = canvas.getContext('2d').getImageData(0, 0, w, h).data;
                let left = w, top = h, right = -1, bottom = -1, roofPixels = 0;
                for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
                  const i = (y * w + x) * 4;
                  if (!pixels[i + 3]) continue;
                  left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y);
                  if (y < h / 3 && pixels[i + 3] > 128 && pixels[i + 1] > pixels[i]) roofPixels++;
                }
                return { left, top, right, bottom, roofPixels };
              };
              CanvasRenderingContext2D.prototype.drawImage = function (source, ...args) {
                if (source instanceof HTMLCanvasElement && source.width === 240 && source.height === 260 && args.length === 8) {
                  const b = bounds(source), [x, y, w, h] = args;
                  sourceBounds = { ...b, complete: x <= b.left && y <= b.top && x + w > b.right && y + h > b.bottom,
                    safe: b.left > 0 && b.top > 0 && b.right < 239 && b.bottom < 259 };
                }
                return original.apply(this, arguments);
              };
              try {
                for (const type of Object.keys(GF.DEFS)) for (const level of [1, 4, 9]) {
                  sourceBounds = null;
                  const image = new Image(); image.src = GFArt.thumbnail(type, level); await image.decode();
                  const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
                  canvas.getContext('2d').drawImage(image, 0, 0);
                  results.push({ type, level, width: image.width, height: image.height, bounds: bounds(canvas), sourceBounds });
                }
              } finally { CanvasRenderingContext2D.prototype.drawImage = original; }
              return results;
            });
            assert.equal(thumbnails.length, 75);
            for (const item of thumbnails) {
              const message = `${item.type} Lv.${item.level}: ${JSON.stringify(item)}`;
              assert.equal(item.width, 180, message); assert.equal(item.height, 210, message);
              const b = item.bounds;
              assert(b.right >= b.left && b.bottom >= b.top && b.left > 0 && b.top > 0 && b.right < 179 && b.bottom < 209, message);
              assert(item.sourceBounds?.complete && item.sourceBounds.safe, 'Every source sprite is uncropped: ' + message);
              if (item.type === 'mill' && item.level === 9) assert(b.roofPixels > 100 && b.bottom - b.top > 150 && item.sourceBounds?.complete, 'Lv.9 mill retains opaque upper roof and full-height art: ' + message);
              await page.evaluate(({ type, level }) => {
                const b = Gufang.state.buildings[0];
                Object.assign(b, { type, level }); b.hp = GF.maxHP(b); Gufang.select(b.x, b.y);
              }, item);
              await page.locator('.detail-art img').evaluate(image => image.decode());
              const layout = await page.locator('.detail').evaluate(detail => {
                const art = detail.querySelector('.detail-art'), image = art.querySelector('img');
                const a = art.getBoundingClientRect(), i = image.getBoundingClientRect(), t = detail.querySelector('.detail-title').getBoundingClientRect();
                return { inside: i.left >= a.left - .5 && i.right <= a.right + .5 && i.top >= a.top - .5 && i.bottom <= a.bottom + .5,
                  belowTitle: i.top >= t.bottom, labels: art.querySelectorAll('span').length, descriptions: detail.querySelectorAll('p,.detail-description').length, padding: getComputedStyle(art).paddingBottom,
                  fit: getComputedStyle(image).objectFit, overflow: document.documentElement.scrollWidth > innerWidth };
              });
              assert(layout.inside && layout.belowTitle && !layout.overflow, message + ' ' + JSON.stringify(layout));
              assert.equal(layout.labels, 0); assert.equal(layout.descriptions, 0);
              assert.equal(layout.padding, '0px'); assert.equal(layout.fit, 'contain');
            }
          });
          await page.evaluate(buildings => { Gufang.state.buildings = buildings; Gufang.refresh(); }, originalBuildings);
          await check(label + ' grid/menu/persistence', async () => {
            const grid = await page.evaluate(() => {
              const canvas = document.createElement('canvas');
              canvas.width = 390; canvas.height = 844; canvas.style.cssText = 'width:390px;height:844px'; document.body.append(canvas);
              try {
                 const c = canvas.getContext('2d'), original = CanvasRenderingContext2D.prototype.stroke, s = GF.createState(null);
                 let strokes = [];
                 CanvasRenderingContext2D.prototype.stroke = function () { if (Math.abs(this.lineWidth - 1.4) < 1e-6 && this.getLineDash().length) strokes.push({ color: this.strokeStyle, dash: this.getLineDash() }); return original.apply(this, arguments); };
                const capture = (phase, enabled) => { s.phase = phase; strokes = []; GFArt.render(canvas, s, { x: 0, y: 0, zoom: .3 }, null, { grid: enabled }); return strokes; };
                c.strokeStyle = '#5d785055'; const dayColor = c.strokeStyle;
                c.strokeStyle = '#c6d7a855'; const nightColor = c.strokeStyle;
                 try { return { day: capture('day', true), night: capture('night', true), off: capture('day', false), dayColor, nightColor, count: 1 }; }
                 finally { CanvasRenderingContext2D.prototype.stroke = original; }
              } finally { canvas.remove(); }
            });
            assert.equal(grid.day.length, grid.count); assert.equal(grid.night.length, grid.count);
            assert.deepEqual(grid.off, []);
            for (const phase of ['day', 'night']) for (const stroke of grid[phase]) {
              assert.deepEqual(stroke.dash, [4, 4]);
              assert.equal(stroke.color, phase === 'day' ? grid.dayColor : grid.nightColor);
            }
             const waitGrid = async value => {
               await page.evaluate(() => { window.renderGrids = []; window.dispatchEvent(new Event('resize')); });
               await page.waitForFunction(value => window.renderGrids.length >= 1 && window.renderGrids.every(v => v === value), value);
            };
            const snapshot = () => page.evaluate(() => ({ time: Gufang.state.time, elapsed: Gufang.state.elapsed, coins: Gufang.state.coins, materials: Gufang.state.materials }));
            await waitGrid(true);
            assert.equal(await page.evaluate(() => localStorage.getItem('gufang-qitan-grid')), null);
            await page.locator('#menu-pause').click();
            assert(await page.evaluate(() => Gufang.paused));
            const button = page.locator('[data-modal="grid"]');
            assert.equal(await button.getAttribute('aria-pressed'), 'true');
            assert.match(await button.textContent(), /：开$/);
            assert.equal(await page.locator('#modal-content').evaluate(el => /在庄园内建设经营|城墙与庄园外不可操作|水上道路为桥栈道|拖拽巡视|双指或滚轮缩放/.test(el.textContent)), false);
            const before = await snapshot();
            await button.click(); await waitGrid(false);
            assert.equal(await button.getAttribute('aria-pressed'), 'false');
            assert.match(await button.textContent(), /：关$/);
            assert.equal(await page.evaluate(() => localStorage.getItem('gufang-qitan-grid')), 'off');
            assert.deepEqual(await snapshot(), before);
            await page.locator('[data-modal="close"]').click(); await waitGrid(false);
            await page.locator('#menu-pause').click();
            assert.equal(await button.getAttribute('aria-pressed'), 'false');
            await page.reload(); await page.waitForFunction(() => !!window.Gufang); await page.locator('#start-load').click();
            await waitGrid(false); await page.locator('#menu-pause').click();
            assert.equal(await button.getAttribute('aria-pressed'), 'false');
            const reloaded = await snapshot();
            await button.click(); await waitGrid(true);
            assert.equal(await button.getAttribute('aria-pressed'), 'true');
            assert.match(await button.textContent(), /：开$/);
            assert.equal(await page.evaluate(() => localStorage.getItem('gufang-qitan-grid')), 'on');
            assert.deepEqual(await snapshot(), reloaded);
            await page.reload(); await page.waitForFunction(() => !!window.Gufang); await page.locator('#start-load').click();
            await waitGrid(true); await page.locator('#menu-pause').click();
            assert.equal(await button.getAttribute('aria-pressed'), 'true');
            await page.locator('[data-modal="close"]').click();
          });
          await check(label + ' outward CSS arrows', () => arrows(page));
          await check(label + ' canvas upgrade marker', () => marker(page));
          await check(label + ' browser errors', async () => assert.deepEqual(page.errors, []));
        } finally { await page.context().close(); }
      }
      const page = await open(browser, file, { width: 390, height: 844 }, 'reduce');
      try {
        await check(file + ' reduced-motion CSS arrows', () => arrows(page, true));
        await check(file + ' reduced-motion canvas marker', () => marker(page, true));
        await check(file + ' reduced-motion browser errors', async () => assert.deepEqual(page.errors, []));
      } finally { await page.context().close(); }
    }
  } finally { await browser.close(); }
  assert.equal(failures.length, 0, failures.join('\n\n'));
})().catch(error => { console.error(error); process.exitCode = 1; });
