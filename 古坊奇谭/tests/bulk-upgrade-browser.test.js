'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const root = path.join(__dirname, '..');
const sourceOnly = process.argv.includes('--source-only') || !!process.env.GUFANG_SOURCE_ONLY;

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
  try {
    // Source always uses current modules; dist is tested verbatim after the caller builds it.
    for (const file of sourceOnly ? ['index.html'] : ['index.html', 'dist/古坊奇谭.html']) {
      for (const viewport of [{ width: 320, height: 740 }, { width: 390, height: 844 }, { width: 1440, height: 1000 }]) {
        const context = await browser.newContext({ viewport, hasTouch: viewport.width < 500 });
        try {
          const page = await context.newPage(), errors = [];
          page.on('pageerror', error => errors.push(error.message));
          if (file === 'index.html') await page.route('**/js/runtime.js', route => route.fulfill({
            contentType: 'application/javascript',
            body: ['game', 'art', 'autoplay', 'app'].map(name => fs.readFileSync(path.join(root, 'js', name + '.js'), 'utf8')).join('\n;\n')
          }));
          await context.addInitScript(() => {
            localStorage.clear();
            Object.defineProperty(document, 'hidden', { get: () => true, configurable: true });
          });
          await page.goto(pathToFileURL(path.join(root, file)).href);
          await page.waitForFunction(() => !!window.Gufang);
          await page.locator('#start-single').click();
          const single = page.locator('#upgrade-building'), bulk = page.locator('#bulk-upgrade-building');
          const text = button => button.evaluate(el => el.firstChild.textContent);
          const select = type => page.evaluate(type => {
            const b = Gufang.state.buildings.find(b => b.type === type);
            Gufang.select(b.x, b.y);
          }, type);
          const snapshot = () => page.evaluate(() => ({
            coins: Gufang.state.coins, materials: Gufang.state.materials,
            levels: Gufang.state.buildings.map(b => [b.id, b.level, b.hp]), gateLevel: Gufang.state.gateLevel
          }));
          const costs = (type, levels) => page.evaluate(({ type, levels }) => {
            const b = { ...Gufang.state.buildings.find(b => b.type === type) }, total = { coins: 0, materials: 0 };
            for (let i = 0; i < levels; i++, b.level++) {
              const cost = GF.upgradeCost(b);
              total.coins += cost.coins; total.materials += cost.materials;
            }
            return total;
          }, { type, levels });
          const assertCost = async (id, expected, funds) => {
            for (const [resource, icon] of [['coins', 'coin-icon'], ['materials', 'material-icon']]) {
              const number = page.locator(`#${id} .cost-part:has(.${icon}) .cost-number`);
              if (!expected[resource]) { assert.equal(await number.count(), 0); continue; }
              assert.equal(await number.textContent(), String(expected[resource]), id + ' ' + resource);
              if (funds) assert.equal(await number.evaluate(el => el.classList.contains('insufficient')), funds[resource] < expected[resource]);
            }
          };
          await page.evaluate(() => {
            const s = Gufang.state, size = GF.worldSize(s);
            for (let y = 1; y < size - 1; y++) for (let x = 1; x < size - 1; x++) {
              if (![x, x + 1].every(px => GF.owns(s, px, y) && !GF.isWall(s, px, y) && !GF.at(s, px, y) && GF.terrain(px, y, s) === 'plain')) continue;
              if (!GF.grantBuilding(s, 'tea', x, y) || !GF.grantBuilding(s, 'inn', x + 1, y)) throw Error('Industry fixture failed');
              // These two fixture buildings already satisfy the first two missions.
              s.mission = 2; Gufang.select(x + 1, y); return;
            }
            throw Error('No adjacent industry plots');
          });
          assert.equal(await text(single), '升级');
          assert(await bulk.isHidden(), 'Missing shrine and neighboring level prerequisites hide bulk');
          assert.equal(await single.getAttribute('aria-disabled'), 'true');

          await select('shrine');
          await page.evaluate(() => { Gufang.state.coins = Gufang.state.materials = 0; Gufang.refresh(); });
          const shrineTotal = await costs('shrine', 14);
          assert(await bulk.isVisible(), 'Zero funds do not hide structurally available bulk');
          assert.equal(await text(bulk), '连升14级');
          await assertCost('bulk-upgrade-label', shrineTotal, { coins: 0, materials: 0 });
          assert.equal(await bulk.getAttribute('aria-disabled'), 'true');
          const zero = await snapshot(), zeroButton = await bulk.boundingBox();
          await page.mouse.click(zeroButton.x + zeroButton.width / 2, zeroButton.y + zeroButton.height / 2);
          assert.deepEqual(await snapshot(), zero, 'Zero affordable levels leave all levels, HP and resources unchanged');

          // Changing prerequisites must update this panel without replacing its buttons.
          await select('inn');
          await page.evaluate(() => {
            window.bulkNode = document.getElementById('bulk-upgrade-building');
            window.singleNode = document.getElementById('upgrade-building');
            const s = Gufang.state, shrine = s.buildings.find(b => b.type === 'shrine');
            shrine.level = 15; shrine.hp = GF.maxHP(shrine); Gufang.refresh();
          });
          assert(await bulk.isHidden(), 'Neighbor prerequisite still blocks bulk with high shrine');
          await page.evaluate(() => {
            const b = Gufang.state.buildings.find(b => b.type === 'tea'); b.level = 5; b.hp = GF.maxHP(b); Gufang.refresh();
          });
          assert(await bulk.isVisible()); assert.equal(await text(bulk), '连升4级');
          assert(await page.evaluate(() => window.bulkNode === document.getElementById('bulk-upgrade-building') && window.singleNode === document.getElementById('upgrade-building')), 'Prerequisites update existing nodes');
          await page.evaluate(() => { Gufang.state.buildings.find(b => b.type === 'tea').level = 2; Gufang.refresh(); });
          assert(await bulk.isHidden(), 'Only one structurally available level hides bulk');
          await page.evaluate(() => { Gufang.state.buildings.find(b => b.type === 'tea').level = 5; Gufang.refresh(); });
          assert.equal(await text(bulk), '连升4级');
          assert(await page.evaluate(() => window.bulkNode === document.getElementById('bulk-upgrade-building')));

          const firstTwo = await costs('inn', 2), innTotal = await costs('inn', 4);
          // One resource covers all levels, the other covers exactly two: bulk must partially succeed.
          for (const limited of ['coins', 'materials']) {
            await page.evaluate(({ limited, firstTwo, innTotal }) => {
              const s = Gufang.state, b = s.buildings.find(b => b.type === 'inn'); b.level = 1; b.hp = GF.maxHP(b);
              s.coins = innTotal.coins; s.materials = innTotal.materials; s[limited] = firstTwo[limited]; Gufang.refresh();
            }, { limited, firstTwo, innTotal });
            await assertCost('bulk-upgrade-label', innTotal, await snapshot());
            assert.equal(await bulk.getAttribute('aria-disabled'), 'false', 'Affordable first level permits partial bulk despite red total');
            const before = await snapshot(); await bulk.click();
            assert.equal(await page.evaluate(() => Gufang.state.buildings.find(b => b.type === 'inn').level), 3);
            const after = await snapshot();
            assert.equal(after.coins, before.coins - firstTwo.coins); assert.equal(after.materials, before.materials - firstTwo.materials);
            assert.equal(await text(bulk), '连升2级', 'Remaining structurally available levels refresh after partial success');
          }
          await page.evaluate(() => { const s = Gufang.state; s.coins = s.materials = 1e9; Gufang.refresh(); });
          const oneCost = await costs('inn', 1), beforeSingle = await snapshot();
          await assertCost('upgrade-label', oneCost); await single.click();
          assert.equal(await page.evaluate(() => Gufang.state.buildings.find(b => b.type === 'inn').level), 4, 'Left button upgrades exactly one level');
          const afterSingle = await snapshot();
          assert.equal(afterSingle.coins, beforeSingle.coins - oneCost.coins); assert.equal(afterSingle.materials, beforeSingle.materials - oneCost.materials);
          assert(await bulk.isHidden(), 'One remaining level hides bulk');

          await select('gate');
          assert.equal(await text(single), '升级'); assert.equal(await text(bulk), '连升8级');
          assert.equal(await page.locator('.detail-actions.bulk #upgrade-building,.detail-actions.bulk #bulk-upgrade-building').count(), 2, 'Gate single and bulk buttons share the bulk action group');
          const gateTotal = await costs('gate', 8), beforeGates = await snapshot();
          await assertCost('bulk-upgrade-label', gateTotal); await bulk.click();
          assert.deepEqual(await page.evaluate(() => ({ level: Gufang.state.gateLevel, gates: Gufang.state.buildings.filter(b => b.type === 'gate').map(b => b.level) })), { level: 9, gates: [9, 9, 9, 9] });
          const afterGates = await snapshot();
          assert.equal(afterGates.coins, beforeGates.coins - gateTotal.coins); assert.equal(afterGates.materials, beforeGates.materials - gateTotal.materials);
          assert(await bulk.isHidden()); assert.equal(await text(single), '已臻化境');
          assert.equal(await page.locator('#upgrade-label .cost-number').count(), 0);

          await page.evaluate(() => {
            const s = Gufang.state, b = s.buildings.find(b => b.type === 'inn'), bank = s.buildings.find(b => b.type === 'tea');
            b.type = 'guild'; b.level = 6; b.hp = GF.maxHP(b);
            bank.type = 'bank'; bank.level = 9; bank.hp = GF.maxHP(bank);
            const size = GF.worldSize(s);
            for (let y = 1; y < size - 1; y++) for (let x = 1; x < size - 1; x++) {
              if (!GF.owns(s, x, y) || GF.isWall(s, x, y) || GF.at(s, x, y) || GF.dist8(b.x, b.y, x, y) !== 1) continue;
              if (!GF.grantBuilding(s, 'wine', x, y, 9)) continue;
              s.coins = s.materials = 1e9; Gufang.select(b.x, b.y); return;
            }
            throw Error('No guild prerequisite plot');
          });
          const highCost = await costs('guild', 3);
          assert(highCost.coins >= 1e6 && highCost.materials >= 1e6, 'Layout fixture has million-scale costs in both resources');
          assert.equal(await text(single), '升级'); assert.equal(await text(bulk), '连升3级');
          assert(await bulk.isVisible()); await assertCost('bulk-upgrade-label', highCost);
          const layout = await page.locator('.detail-actions').evaluate(actions => {
            const bounds = actions.getBoundingClientRect(), buttons = [...actions.querySelectorAll('button')];
            return {
              pageOverflow: document.documentElement.scrollWidth > innerWidth,
              actionOverflow: actions.scrollWidth > actions.clientWidth,
              buttons: buttons.map(button => {
                const r = button.getBoundingClientRect(), label = button.querySelector('small').getBoundingClientRect();
                const range = document.createRange(); range.selectNode(button.firstChild); const title = range.getBoundingClientRect();
                return { width: r.width, height: r.height, fits: r.left >= bounds.left - 1 && r.right <= bounds.right + 1 && button.scrollWidth <= button.clientWidth,
                  priceBelowText: label.top >= title.bottom - 1,
                  costFits: [...button.querySelectorAll('.cost-number')].every(el => { const c = el.getBoundingClientRect(); return c.left >= r.left && c.right <= r.right && c.bottom <= r.bottom; }),
                  clickable: button.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)) };
              }),
              separate: buttons[0].getBoundingClientRect().right <= buttons[1].getBoundingClientRect().left
            };
          });
          assert(!layout.pageOverflow && !layout.actionOverflow && layout.separate, JSON.stringify(layout));
           for (const button of layout.buttons) assert(button.width >= 80 && button.height === 56 && button.fits && button.priceBelowText && button.costFits && button.clickable, JSON.stringify(layout));
          await bulk.click();
          assert.equal(await page.evaluate(() => Gufang.state.buildings.find(b => b.type === 'guild').level), 9);
          assert(await bulk.isHidden()); assert.equal(await text(single), '已臻化境');
          assert.equal(await page.locator('#upgrade-label .cost-number,#bulk-upgrade-label .cost-number').count(), 0);
          await select('shrine');
          assert(await bulk.isHidden()); assert.equal(await text(single), '已臻化境');
          assert.deepEqual(errors, []);
          console.log(`PASS bulk upgrades: ${file} ${viewport.width}x${viewport.height}`);
        } finally { await context.close(); }
      }
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
