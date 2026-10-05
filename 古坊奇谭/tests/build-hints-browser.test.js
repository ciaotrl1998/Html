'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const root = path.join(__dirname, '..');
const sourceOnly = process.argv.includes('--source-only') || !!process.env.GUFANG_SOURCE_ONLY;
const shots = process.env.GUFANG_SHOTS || path.join(os.tmpdir(), 'gufang-screenshots');
fs.mkdirSync(shots, { recursive: true });
const near = (a, b) => assert(Math.abs(a - b) < 1e-6, `${a} != ${b}`);

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
  try {
    for (const file of sourceOnly ? ['index.html'] : ['index.html', 'dist/古坊奇谭.html']) {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
      try {
        const page = await context.newPage(), errors = [];
        page.on('pageerror', error => errors.push(error.message));
        if (file === 'index.html') await page.route('**/js/runtime.js', route => route.fulfill({ contentType: 'application/javascript',
          body: ['game', 'art', 'autoplay', 'app'].map(name => fs.readFileSync(path.join(root, 'js', name + '.js'), 'utf8')).join('\n;\n') }));
        await context.addInitScript(() => Object.defineProperty(document, 'hidden', { get: () => true, configurable: true }));
        await page.goto(pathToFileURL(path.join(root, file)).href);
        await page.waitForFunction(() => !!window.Gufang);
        await page.locator('#start-single').click();
        const result = await page.evaluate(() => {
          const canvas = document.createElement('canvas');
          canvas.width = 390; canvas.height = 844; canvas.style.cssText = 'width:390px;height:844px'; document.body.append(canvas);
           const c = canvas.getContext('2d'), begin = c.beginPath, move = c.moveTo, line = c.lineTo, stroke = c.stroke, fillRect = c.fillRect;
           c.fillStyle = '#19395878'; const nightColor = c.fillStyle;
           let points = [], markers = [], paint = [];
          c.beginPath = function () { points = []; return begin.apply(this, arguments); };
          for (const [name, original] of [['moveTo', move], ['lineTo', line]]) c[name] = function (x, y) { points.push({ op: name, x, y }); return original.apply(this, arguments); };
          c.stroke = function () {
             if (this.strokeStyle === '#f5d978' || this.strokeStyle === '#d7b8f0') {
               const m = this.getTransform();
               paint.push({ kind: 'marker', composite: this.globalCompositeOperation });
               markers.push({ color: this.strokeStyle, width: this.lineWidth, alpha: this.globalAlpha, cap: this.lineCap, join: this.lineJoin,
                dash: this.getLineDash(), matrix: [m.a, m.b, m.c, m.d, m.e, m.f], points: points.slice() });
            }
             return stroke.apply(this, arguments);
           };
           c.fillRect = function () {
             paint.push({ kind: this.fillStyle === nightColor ? 'night' : this.fillStyle === '#bb775a' || this.fillStyle === '#91c967' ? 'unit-health' : 'fill', composite: this.globalCompositeOperation });
             return fillRect.apply(this, arguments);
           };
          const scene = entries => {
            const s = GF.createState(null); s.coins = s.materials = 1e6; s.mission = GF.MISSIONS.length;
             for (const [type, x, y, level = 1] of entries) if (!GF.grantBuilding(s, type, x, y, level)) throw Error('Fixture: ' + type);
            return s;
          };
          const cam = { x: -320, y: 40, zoom: .75 };
          const capture = (s, elapsed = 0, options = {}) => {
             s.elapsed = elapsed; markers = []; paint = [];
            const before = GF.serialize(s); GFArt.render(canvas, s, cam, null, options);
            if (GF.serialize(s) !== before) throw Error('Render mutated state');
            return markers.slice();
          };
           const at = (records, x = 8, y = 4) => records.filter(r => Math.abs(r.matrix[5] - (cam.y + (y * 64 + 32) * cam.zoom)) < 1e-8 &&
             Math.abs(r.matrix[4] - (cam.x + (x * 64 + 32) * cam.zoom)) < 1e-8);
           const incomes = s => GF.buildHints(s, 8, 4).map(h => {
             const preview = { type: h.type, x: 8, y: 4, level: 1 };
             return { ...h, base: GF.DEFS[h.type].income, income: GF.income({ ...s, buildings: [...s.buildings, preview] }, preview), withoutSelf: GF.income(s, preview) };
           });
          try {
            const cases = [];
            for (const [start, middle, end] of GF.chains) for (const [prev, type, tier] of [[start, middle, 1], [middle, end, 2]]) {
              const s = scene([[prev, 7, 3]]), hints = GF.buildHints(s, 8, 4), rich = capture(s);
              s.coins = s.materials = 0;
              cases.push({ type, tier, resource: GF.DEFS[type].resource, hints, rich: at(rich), poor: at(capture(s)), allRich: rich, allPoor: capture(s) });
            }
            const dual = scene([['tea', 7, 3], ['bank', 9, 3], ['wine', 9, 4], ['mulberry', 9, 5], ['tailor', 7, 5], ['trade', 7, 4]]);
            const dualHints = GF.buildHints(dual, 8, 4), zero = capture(dual), peak = capture(dual, Math.PI / 4.8), trough = capture(dual, 3 * Math.PI / 4.8);
            const reducedZero = capture(dual, 0, { reducedMotion: true }), reducedPeak = capture(dual, Math.PI / 4.8, { reducedMotion: true });
             const precedence = [];
            for (const entries of [[['tea', 7, 3], ['mill', 9, 3]], [['mulberry', 7, 3], ['kiln', 9, 3]]]) {
               const s = scene(entries); precedence.push({ hints: GF.buildHints(s, 8, 4), incomes: incomes(s), markers: at(capture(s)) });
             }
             const actual = [];
             for (const entries of [
               [['tea', 7, 3], ['mulberry', 9, 3, 3], ['mulberry', 9, 4, 3], ['mulberry', 9, 5, 3]],
               [['mill', 7, 3, 3], ['mill', 7, 4, 3], ['mill', 7, 5, 3], ['kiln', 9, 3]],
               [['bank', 7, 3, 4], ['wine', 7, 5], ['tailor', 9, 3], ['trade', 9, 5]]
             ]) {
               const s = scene(entries); actual.push({ incomes: incomes(s), markers: at(capture(s)) });
             }
             const ties = [], originalIncome = GF.income;
             try {
               for (const entries of [[['tea', 7, 3], ['kiln', 9, 3]], [['tea', 7, 3], ['quarry', 9, 3]]]) {
                 const s = scene(entries);
                 GF.income = () => 10;
                 ties.push({ hints: GF.buildHints(s, 8, 4), markers: at(capture(s)) });
               }
             } finally { GF.income = originalIncome; }
             dual.phase = 'night';
             dual.enemies = [{ id: 901, type: 'ghost', x: 10, y: 4, hp: 100, maxHp: 100 }];
             dual.soldiers = [{ id: 902, x: 10, y: 5, hp: 100, maxHp: 100 }];
             const night = at(capture(dual)), nightPaint = paint.slice();
             const estate = GF.createState(42); estate.mission = GF.MISSIONS.length;
             if (!GF.grantBuilding(estate, 'tea', 11, 11)) throw Error('Estate fixture');
             estate.coins = estate.materials = 1e6;
             const estateRich = capture(estate);
             estate.coins = estate.materials = 0;
             const estatePoor = capture(estate), blocked = [...GF.estate(estate).walls].map(key => [key % 25, Math.floor(key / 25)]).concat(GF.estate(estate).gates.map(g => [g.x, g.y]));
             const estateBlocked = blocked.map(([x, y]) => ({ hints: GF.buildHints(estate, x, y), markers: at(estatePoor, x, y) }));
            const legal = scene([['tea', 7, 3]]), states = [];
            const record = label => {
              const hints = GF.buildHints(legal, 8, 4);
              const candidates = Object.values(GF.DEFS).filter(d => d.cat === 'economy' && (d.tier >= 1 || d.required) && !GF.buildReason(legal, d.id, 8, 4, true)).map(d => d.id);
              states.push({ label, hints: hints.map(h => h.type), candidates, markers: at(capture(legal)) });
            };
            record('initial'); legal.buildings.find(b => b.type === 'tea').x = 6; record('distance');
            legal.buildings.find(b => b.type === 'tea').x = 7; record('restored');
            const occupant = GF.grantBuilding(legal, 'tower', 8, 4); record('occupied'); legal.buildings = legal.buildings.filter(b => b !== occupant);
            for (const [x, y] of [[5, 3], [11, 7], [14, 7]]) if (!GF.grantBuilding(legal, 'inn', x, y)) throw Error('Limit fixture');
            record('limit'); legal.buildings = legal.buildings.filter(b => b.type !== 'inn');
            legal.phase = 'night'; record('night');
            legal.enemies = [{ id: 900, type: 'ghost', x: 8.64, y: 4, hp: 100, maxHp: 100 }]; record('enemy-block');
            legal.enemies[0].x = 8.66; record('enemy-clear');
             return { cases, dualHints, dualIncomes: incomes(dual), dual: at(zero), zero, peak, trough, reducedZero, reducedPeak, precedence, actual, ties, night, nightPaint, estateRich, estatePoor, estateBlocked, estateEmpty: at(estatePoor, 12, 10), states, cam };
          } finally { canvas.remove(); }
        });
        for (const item of result.cases) {
          assert(item.hints.some(h => h.type === item.type && h.tier === item.tier));
          assert.deepEqual(item.rich, item.poor); assert.deepEqual(item.allRich, item.allPoor, 'Funds do not change any hint marker');
          assert.equal(item.rich.length, 1);
           assert.equal(item.rich[0].color, item.resource === 'coins' ? '#f5d978' : '#d7b8f0');
          assert.equal(item.rich[0].points.filter(p => p.op === 'lineTo').length, item.tier === 2 ? 16 : 8);
          assert.equal(item.rich[0].points.filter(p => p.op === 'moveTo').length, item.tier === 2 ? 8 : 4);
        }
        assert.deepEqual(result.dualHints.map(h => h.type).sort(), ['guild', 'inn', 'port', 'weaver']);
         assert.equal(result.dual.length, 1, 'Coins and materials share one winning marker');
         assert(result.dualIncomes.find(h => h.type === 'port').income > result.dualIncomes.find(h => h.type === 'guild').income);
         for (const marker of result.dual) {
           assert.equal(marker.color, '#d7b8f0');
           near(marker.matrix[4], result.cam.x + (8 * 64 + 32) * result.cam.zoom);
           assert.equal(marker.points.filter(p => p.op === 'lineTo').length, 18, 'Ultimate uses two layers of four L corners and a plus');
           assert.equal(marker.points.filter(p => p.op === 'moveTo').length, 10);
           assert.equal(Math.max(...marker.points.map(p => Math.abs(p.x))), 26, 'One marker spans the full tile');
          assert.deepEqual(marker.points.slice(-4), [{ op: 'moveTo', x: -5, y: 0 }, { op: 'lineTo', x: 5, y: 0 }, { op: 'moveTo', x: 0, y: -5 }, { op: 'lineTo', x: 0, y: 5 }]);
        }
         for (const sample of result.precedence) {
           assert.deepEqual(sample.hints.map(h => h.tier).sort(), [1, 2]); assert.equal(sample.markers.length, 1);
           assert(sample.incomes.find(h => h.tier === 2).income > sample.incomes.find(h => h.tier === 1).income);
           assert.equal(sample.markers[0].points.filter(p => p.op === 'lineTo').length, 16, 'Higher actual income endpoint uses two layers');
         }
         for (const [i, winner, loser, color] of [[0, 'weaver', 'inn', '#d7b8f0'], [1, 'wine', 'trade', '#f5d978'], [2, 'guild', 'port', '#f5d978']]) {
           const sample = result.actual[i], win = sample.incomes.find(h => h.type === winner), lose = sample.incomes.find(h => h.type === loser);
           assert(win.base < lose.base); assert(win.income > lose.income, 'Real prerequisite bonuses reverse base-income ranking');
           assert.equal(sample.markers.length, 1); assert.equal(sample.markers[0].color, color);
           assert.equal(sample.markers[0].points.filter(p => p.op === 'lineTo').length, i === 0 ? 8 : i === 1 ? 16 : 18);
           if (i === 2) assert(win.withoutSelf < lose.income, 'Preview self aura changes the winner');
         }
         assert.deepEqual(result.ties[0].hints.map(h => h.tier).sort(), [1, 2]);
         assert.equal(result.ties[0].markers.length, 1); assert.equal(result.ties[0].markers[0].color, '#d7b8f0');
         assert.equal(result.ties[0].markers[0].points.filter(p => p.op === 'lineTo').length, 16, 'Equal income prefers higher tier');
         assert.deepEqual(result.ties[1].hints.map(h => h.tier), [1, 1]);
         assert.equal(result.ties[1].markers.length, 1); assert.equal(result.ties[1].markers[0].color, '#f5d978', 'Equal income and tier prefer coins');
         assert.deepEqual(result.estateRich, result.estatePoor); assert.equal(result.estateEmpty.length, 1);
         for (const blocked of result.estateBlocked) { assert.deepEqual(blocked.hints, []); assert.deepEqual(blocked.markers, []); }
         assert.deepEqual(result.night, result.dual, 'Night preserves bright, opaque marker style');
         const overlay = result.nightPaint.findIndex(p => p.kind === 'night'), firstMarker = result.nightPaint.findIndex(p => p.kind === 'marker');
         assert(overlay >= 0 && firstMarker > overlay);
         assert(result.nightPaint.some(p => p.composite === 'screen'), 'Night glow is painted');
         for (const [i, p] of result.nightPaint.entries()) {
           if (p.kind === 'unit-health') assert(i < overlay, 'Units finish before night overlay');
           if (p.kind === 'marker') assert.equal(p.composite, 'source-over');
           if (p.composite === 'screen') assert(i < firstMarker, 'Markers follow the last night glow');
         }
         assert.equal(result.nightPaint.filter(p => p.kind === 'unit-health').length, 2);
        assert(result.zero.length > 2);
        assert.equal(result.zero.length, result.peak.length); assert.equal(result.zero.length, result.trough.length);
         for (const [i, marker] of result.zero.entries()) {
           near(marker.width, 3.5); near(marker.alpha, .7); assert.equal(marker.cap, 'butt'); assert.equal(marker.join, 'miter'); assert.deepEqual(marker.dash, []);
           assert.equal(Math.max(...marker.points.map(p => Math.abs(p.x))), 26);
           const expected = [];
           const layers = marker.points.length >= 24 ? 2 : 1;
           for (let layer = 0; layer < layers; layer++) for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
             const half = layer ? 20 : 26, arm = layer ? 8 : 12;
             expected.push({ op: 'moveTo', x: sx * (half - arm), y: sy * half }, { op: 'lineTo', x: sx * half, y: sy * half }, { op: 'lineTo', x: sx * half, y: sy * (half - arm) });
           }
           if (marker.points.length === 28) expected.push({ op: 'moveTo', x: -5, y: 0 }, { op: 'lineTo', x: 5, y: 0 }, { op: 'moveTo', x: 0, y: -5 }, { op: 'lineTo', x: 0, y: 5 });
           assert.deepEqual(marker.points, expected, 'Full frame has complete outer and inner L corners');
           near((marker.matrix[4] - result.cam.x) / result.cam.zoom % 64, 32);
           near((marker.matrix[5] - result.cam.y) / result.cam.zoom % 64, 32);
          for (const [records, scale] of [[result.zero, 1], [result.peak, 1.035], [result.trough, .965]]) {
            const actual = records[i]; assert.deepEqual(actual.points, marker.points); assert.equal(actual.color, marker.color);
            near(actual.matrix[0], result.cam.zoom * scale); near(actual.matrix[3], result.cam.zoom * scale);
            near(actual.matrix[1], 0); near(actual.matrix[2], 0); near(actual.matrix[4], marker.matrix[4]); near(actual.matrix[5], marker.matrix[5]);
         }
         assert.equal(new Set(result.zero.map(m => `${m.matrix[4]},${m.matrix[5]}`)).size, result.zero.length, 'Exactly one stroke per hinted tile');
        }
        assert.deepEqual(result.reducedZero, result.reducedPeak); assert.deepEqual(result.zero, result.reducedZero);
        for (const state of result.states) {
          assert.deepEqual(state.hints, state.candidates, state.label);
          const expected = ['initial', 'restored', 'night', 'enemy-clear'].includes(state.label);
          assert.deepEqual(state.hints, expected ? ['inn'] : [], state.label);
          assert.equal(state.markers.length, expected ? 1 : 0, state.label);
        }
        // A compact legacy scene uses real chain history and legal target plots for the visual artifact.
        await page.evaluate(() => {
          const s = GF.createState(null); s.coins = s.materials = 1e6; s.mission = GF.MISSIONS.length;
          for (const [type, x, y] of [['tea', 6, 3], ['tea', 9, 1], ['inn', 9, 2], ['tea', 6, 7], ['inn', 7, 7], ['bank', 7, 6], ['farm', 5, 8], ['mill', 6, 9], ['wine', 7, 8], ['mulberry', 10, 6], ['weaver', 9, 5]]) {
            const built = GF.build(s, type, x, y); if (!built.ok) throw Error(type + ': ' + built.reason);
          }
          for (const [type, x, y] of [['inn', 6, 2], ['guild', 8, 7], ['tailor', 8, 4]]) {
            if (GF.buildReason(s, type, x, y, true)) throw Error('Artifact target: ' + type);
          }
          for (const key of Object.keys(Gufang.state)) delete Gufang.state[key];
          Object.assign(Gufang.state, s);
          const render = GFArt.render;
          GFArt.render = function (canvas, state, cam, ...args) {
            if (canvas.id === 'map') Object.assign(cam, { zoom: .7, x: -150, y: 180 });
            return render.call(this, canvas, state, cam, ...args);
          };
          Gufang.refresh(); document.getElementById('toast').style.display = 'none';
        });
        await page.waitForTimeout(100);
        await page.screenshot({ path: path.join(shots, `build-hints-${file === 'index.html' ? 'source' : 'dist'}.png`) });
        await page.evaluate(() => {
          const s = Gufang.state, bank = s.buildings.find(b => b.type === 'bank');
          const removed = GF.demolish(s, bank), reason = GF.buildReason(s, 'bank', 8, 7, true);
          if (!removed.ok || reason) throw Error('Artifact endpoint plot: ' + JSON.stringify(removed) + ' ' + reason);
          Gufang.refresh();
        });
        await page.waitForTimeout(100);
         await page.screenshot({ path: path.join(shots, `build-hints-endpoint-${file === 'index.html' ? 'source' : 'dist'}.png`) });
         await page.evaluate(() => { Gufang.state.phase = 'night'; Gufang.refresh(); });
         await page.waitForTimeout(100);
         await page.screenshot({ path: path.join(shots, `build-hints-night-${file === 'index.html' ? 'source' : 'dist'}.png`) });
        assert.deepEqual(errors, []);
         console.log(`PASS build hints: ${file}, actual income and self aura, ties, one full-frame marker, funds, blocked estate plots, night paint order, synchronized pulse and screenshots`);
      } finally { await context.close(); }
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
