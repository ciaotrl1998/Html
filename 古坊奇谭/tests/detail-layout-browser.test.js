'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const root = path.join(__dirname, '..');
const sourceOnly = process.argv.includes('--source-only') || !!process.env.GUFANG_SOURCE_ONLY;
const failures = [];
const near = (a, b, message) => assert(Math.abs(a - b) < .1, `${message}: ${a} != ${b}`);

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
  try {
    for (const file of sourceOnly ? ['index.html'] : ['index.html', 'dist/古坊奇谭.html']) {
      for (const viewport of [{ width: 320, height: 740 }, { width: 390, height: 844 }, { width: 1440, height: 1000 }]) {
        const context = await browser.newContext({ viewport, hasTouch: viewport.width < 500 });
        const page = await context.newPage(), errors = [], label = `${file} ${viewport.width}`;
        const check = async (name, action) => {
          try { await action(); console.log(`PASS ${label} ${name}`); }
          catch (error) { failures.push(`${label} ${name}: ${error.message}`); console.error(`FAIL ${label} ${name}: ${error.message}`); }
        };
        page.on('pageerror', error => errors.push(error.message));
        try {
          if (file === 'index.html') await context.route('**/js/runtime.js', route => route.fulfill({
            contentType: 'application/javascript',
            body: ['game', 'art', 'autoplay', 'app'].map(name => fs.readFileSync(path.join(root, 'js', name + '.js'), 'utf8')).join('\n;\n')
          }));
          await context.addInitScript(() => Object.defineProperty(document, 'hidden', { get: () => true, configurable: true }));
          await page.goto(pathToFileURL(path.join(root, file)).href);
          await page.waitForFunction(() => !!window.Gufang);
          await page.locator('#start-single').click();
          await page.locator('[data-choice="thunder"]').click();
          const types = await page.evaluate(() => Object.keys(GF.DEFS));
          assert.equal(types.length, 25);
          const samples = [];
          for (const type of types) for (const level of [1, 4, 9]) {
            await page.evaluate(({ type, level }) => {
              const s = Gufang.state;
              for (const key of Object.keys(s)) delete s[key];
              Object.assign(s, GF.createState(null), {selectedSkill:'thunder'});
              s.coins = s.materials = 1e12;
              const shrine = s.buildings[0]; shrine.level = 15; shrine.hp = GF.maxHP(shrine);
              // Fixed, unique and fortune buildings also need detail layout coverage.
              const b = type === 'shrine' ? shrine : { ...shrine, id: s.nextId++, type, x: 8, y: 7 };
              if (b !== shrine) s.buildings.push(b);
              b.level = level; b.hp = GF.maxHP(b); b.direction = 0;
              Gufang.select(b.x, b.y);
            }, { type, level });
            await page.locator('.detail-art img').evaluate(image => image.decode());
            await page.locator('#panel').evaluate(async panel => {
              await Promise.all(panel.getAnimations().map(animation => animation.finished));
            });
            samples.push(await page.evaluate(({ type, level }) => {
              const detail = document.querySelector('.detail');
              const rect = node => {
                const r = node.getBoundingClientRect();
                return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom };
              };
              const boxes = Object.fromEntries(['.detail-title', '.detail-art', '.detail-art img', '.health-row', '.upgrade-stats', '.detail-actions'].map(selector => [selector, rect(detail.querySelector(selector))]));
              const title = detail.querySelector('.detail-title');
              const titleChildren = [...title.children].map(rect);
              const buttons = [...detail.querySelectorAll('.detail-actions button')].filter(b => !b.hidden).map(rect);
              const fonts = [...detail.querySelectorAll('.upgrade-stats > div')].map(row => [getComputedStyle(row).fontSize, getComputedStyle(row.querySelector('strong')).fontSize]);
              return { type, level, boxes, titleChildren, buttons, fonts, panel: rect(document.getElementById('panel')), game: rect(document.getElementById('game')),
                descriptions: detail.querySelectorAll('p,.detail-description,.detail-art span').length,
                titleOverflow: title.scrollWidth > title.clientWidth, statsOverflow: detail.querySelector('.upgrade-stats').scrollWidth > detail.querySelector('.upgrade-stats').clientWidth,
                pageOverflow: document.documentElement.scrollWidth > innerWidth };
            }, { type, level }));
          }
          await check('75 fixed detail layouts and uniform stats fonts', async () => {
            const baseline = samples[0], issues = [];
            for (const sample of samples) {
              try {
                const name = `${sample.type} Lv.${sample.level}`;
                assert.equal(sample.descriptions, 0, name + ' descriptions/labels');
                near(sample.panel.bottom, sample.game.bottom, name + ' panel flush with game');
                for (const [selector, box] of Object.entries(sample.boxes)) for (const key of ['x', 'y', 'width', 'height']) near(box[key], baseline.boxes[selector][key], name + ' ' + selector + ' ' + key);
                for (const font of sample.fonts) assert.deepEqual(font, baseline.fonts[0], name + ' uniform stat fonts');
                assert(!sample.titleOverflow && !sample.statsOverflow && !sample.pageOverflow, name + ` overflow (title=${sample.titleOverflow}, stats=${sample.statsOverflow}, page=${sample.pageOverflow})`);
                const title = sample.boxes['.detail-title'];
                for (const child of sample.titleChildren) assert(child.x >= title.x - .1 && child.right <= title.right + .1, name + ' title child outside title');
                for (let i = 1; i < sample.titleChildren.length; i++) assert(sample.titleChildren[i - 1].right <= sample.titleChildren[i].x + .1, name + ' title children overlap');
                const health = sample.boxes['.health-row'], stats = sample.boxes['.upgrade-stats'], actions = sample.boxes['.detail-actions'];
                assert(health.bottom <= stats.y && stats.bottom <= actions.y, name + ' health/stats/actions overlap');
                assert(actions.bottom <= sample.panel.bottom, name + ' actions outside panel');
                for (const button of sample.buttons) { near(button.height, 56, name + ' button height'); near(button.y, actions.y, name + ' button top'); }
                if (sample.buttons.length === 2) { near(sample.buttons[0].width, sample.buttons[1].width, name + ' equal button widths'); assert(sample.buttons[0].right <= sample.buttons[1].x, name + ' buttons overlap'); }
              } catch (error) { issues.push(error.message); }
            }
            assert(samples.some(s => s.buttons.length === 1) && samples.some(s => s.buttons.length === 2), 'Both single and double actions covered');
            assert.deepEqual(issues, []);
          });
          await check('night skill column, build/detail bottom and actual actions', async () => {
            await page.evaluate(() => {
              const s = Gufang.state;
              for (const key of Object.keys(s)) delete s[key];
              Object.assign(s, GF.createState(null), {selectedSkill:'repel'}); s.coins = s.materials = 1e9;
              s.buildings[0].level = 15; s.buildings[0].hp = GF.maxHP(s.buildings[0]);
              GF.grantBuilding(s, 'tower', 8, 7, 1); GF.startNight(s); s.wave.timer = 1e6; Gufang.select(8, 7);
            });
            await page.locator('#panel').evaluate(async panel => { await Promise.all(panel.getAnimations().map(a => a.finished)); });
            const panel = await page.locator('#panel').boundingBox(), game = await page.locator('#game').boundingBox();
            near(panel.y + panel.height, game.y + game.height, 'Detail bottom');
            assert(await page.locator('#skills').isVisible());
            const skills = await page.locator('#skills').boundingBox();
            near(panel.y - skills.y - skills.height, 14, 'Skills 14px above panel');
            near(game.x + game.width - skills.x - skills.width, 12, 'Skills at right');
            assert.deepEqual(await page.locator('[data-skill]:visible').evaluateAll(els=>els.map(el=>el.dataset.skill)), ['repel']);
            for (const id of ['repair','thunder']) assert.equal(await page.evaluate(id=>GF.skillReason(Gufang.state,id),id), '未选择此神技');
            const buttons = await page.locator('[data-skill]:visible').all();
            let previous;
            for (const button of buttons) {
              const box = await button.boundingBox(); near(box.x, skills.x, 'Vertical column x');
              assert(box.y >= game.y && box.y + box.height <= panel.y, 'Skill inside game above panel');
              if (previous) assert(previous.y + previous.height < box.y, 'Vertical skills do not overlap');
              previous = box;
            }
            await page.locator('[data-skill="repel"]').click();
            assert(await page.evaluate(() => Gufang.state.cooldowns.repel > 0), 'Actual skill click');
            await page.locator('#upgrade-building').click();
            assert.equal(await page.evaluate(() => GF.at(Gufang.state, 8, 7).level), 2, 'Actual upgrade click');
            await page.locator('#bulk-upgrade-building').click();
            assert.equal(await page.evaluate(() => GF.at(Gufang.state, 8, 7).level), 9, 'Actual bulk click');
            await page.locator('#demolish-building').click();
            await page.locator('[data-modal="confirm-demolish"]').click();
            assert.equal(await page.evaluate(() => !!GF.at(Gufang.state, 8, 7)), false, 'Actual demolish click');
            assert(await page.locator('#build-view').isVisible());
            const buildPanel = await page.locator('#panel').boundingBox();
            near(buildPanel.y + buildPanel.height, game.y + game.height, 'Build list bottom');
            near(buildPanel.y, panel.y, 'Build/detail same top');
            await page.locator('[data-build="tower"] .build-action').click();
            assert.equal(await page.evaluate(() => GF.at(Gufang.state, 8, 7).type), 'tower', 'Actual night build click');
          });
          await check('browser errors', async () => assert.deepEqual(errors, []));
        } finally { await context.close(); }
      }
    }
  } finally { await browser.close(); }
  assert.equal(failures.length, 0, failures.join('\n\n'));
})().catch(error => { console.error(error); process.exitCode = 1; });
