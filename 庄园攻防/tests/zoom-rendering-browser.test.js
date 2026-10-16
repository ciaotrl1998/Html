'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const { createServer } = require('../server');
const root = path.resolve(__dirname, '..');
const qa = path.join(root, 'assets/generated/qa/zoom-filtering');
const source = fs.readFileSync(path.join(root, 'js/art.js'), 'utf8');
const baselineFile = path.join(qa, 'art-before.js');
const baseline = fs.existsSync(baselineFile) ? fs.readFileSync(baselineFile, 'utf8') : null;
fs.mkdirSync(qa, { recursive: true });
(async () => {
  const server = createServer();
  await new Promise(resolve => server.server.listen(0, '127.0.0.1', resolve));
  const baseURL = `http://127.0.0.1:${server.server.address().port}`;
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
  const report = [];
  try {
    for (const offline of [false, true]) for (const dpr of [1, 1.5]) {
      const page = await browser.newPage({ viewport: { width: 720, height: 600 }, deviceScaleFactor: dpr, reducedMotion: 'reduce' });
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      page.on('requestfailed', r => errors.push(r.url()));
      await page.addInitScript(() => Object.defineProperty(document, 'hidden', { get: () => true, configurable: true }));
      await page.goto(offline ? pathToFileURL(path.join(root, 'dist/庄园攻防.html')).href : baseURL);
      await page.waitForFunction(() => window.Gufang && window.GFArt);
      await page.evaluate(dpr => {
        const canvas = document.createElement('canvas');
        canvas.width = 720 * dpr; canvas.height = 600 * dpr;
        canvas.style = 'position:fixed;inset:0;width:720px;height:600px;z-index:9999';
        document.body.append(canvas);
        const s = GF.createState(42), home = s.buildings[0];
        s.elapsed = 0; s.effects = []; s.projectiles = []; s.soldiers = [];
        const types = ['farm', 'mulberry', 'quarry', 'tower', 'inn', 'barracks'];
        for (let y = -3; y <= 3; y += 2) for (let x = -3; x <= 3; x += 2) {
          const type = types[(x + y + 6) % types.length];
          const b = { id: s.nextId++, owner: 0, type, x: home.x + x, y: home.y + y, level: 1 };
          b.hp = GF.maxHP(b); s.buildings.push(b);
        }
        const camera = zoom => ({ x: 360 - (home.x + .5) * 64 * zoom, y: 300 - (home.y + .5) * 64 * zoom, zoom });
        const options = { player: 0, animationTime: 0, reducedMotion: true };
        const draw = async (art, cam) => { art.render(canvas, s, cam, null, options); await art.ready(); art.render(canvas, s, cam, null, options); };
        window.zoomScene = { canvas, s, camera, options, draw, current: GFArt };
      }, dpr);
      if (baseline && !offline && dpr === 1) {
        await page.addScriptTag({ content: baseline });
        await page.evaluate(() => { zoomScene.before = GFArt; GFArt = zoomScene.current; });
      }
      for (const zoom of [.2, .4, .5, .65, .85, 1, 1.5]) {
        const result = await page.evaluate(async zoom => {
          const t = zoomScene, art = t.current, c = t.canvas.getContext('2d'), cam = t.camera(zoom), originalCam = JSON.stringify(cam);
          const buildingURLs=new Set(Object.entries(window.GF_ASSET_URLS||{}).filter(([file])=>file.includes('sprites/buildings')).map(([,url])=>url));
          await t.draw(art, cam);
          let created = 0, groundDraws = 0, filteredGround = 0, filteredBuildings = 0, sharpBuildings = 0;
          const create = document.createElement, draw = c.drawImage;
          document.createElement = function (...args) { if (args[0] === 'canvas') created++; return create.apply(this, args); };
          c.drawImage = function (img, ...args) {
            if (img instanceof HTMLCanvasElement && args.length === 8 && img.width >= 100) { groundDraws++; if (this.imageSmoothingEnabled) filteredGround++; }
            if (img instanceof HTMLImageElement && (img.src.includes('sprites/buildings')||buildingURLs.has(img.src))) { if (this.imageSmoothingEnabled) filteredBuildings++; else sharpBuildings++; }
            return draw.call(this, img, ...args);
          };
          const start = performance.now();
          try { for (let i = 0; i < 20; i++) art.render(t.canvas, t.s, cam, null, t.options); }
          finally { document.createElement = create; c.drawImage = draw; }
          const ms = (performance.now() - start) / 20;
          return { zoom, ms, created, groundDraws, filteredGround, filteredBuildings, sharpBuildings, cameraPreserved: JSON.stringify(cam) === originalCam, cache: art.cacheStats() };
        }, zoom);
        assert(result.cameraPreserved, 'Rendering must not move the input camera');
        assert.equal(result.created, 0, 'Warm frames reuse cached terrain');
        assert(result.groundDraws > 0, 'Map chunks are drawn');
        assert.equal(result.filteredGround, zoom < .9 ? result.groundDraws : 0, 'Only distant terrain uses minification filtering');
        assert(result.cache.chunks <= 40 && result.cache.largestSide <= 1120, 'Terrain retains bounded chunk caches');
        {
          assert(result.filteredBuildings + result.sharpBuildings > 0, 'Loaded buildings exercised');
          const nativePixel=zoom*dpr;
          if (zoom >= .9 || nativePixel >= 1 && Math.abs(nativePixel-Math.round(nativePixel))<.001) assert.equal(result.filteredBuildings, 0, 'Near or exact integer sprite pixels remain crisp');
          else assert(result.filteredBuildings > 0, 'Fractional distant sprites are filtered');
        }
        report.push({ offline, dpr, ...result });
        if (dpr === 1 && [.4, .65, 1].includes(zoom)) {
          await page.locator('canvas').last().screenshot({ path: path.join(qa, `${offline ? 'offline' : 'after'}-${zoom}.png`) });
          if (!offline && baseline) {
            await page.evaluate(async zoom => { const t = zoomScene; await t.draw(t.before, t.camera(zoom)); }, zoom);
            await page.locator('canvas').last().screenshot({ path: path.join(qa, `before-${zoom}.png`) });
            await page.evaluate(async zoom => { const t = zoomScene; await t.draw(t.current, t.camera(zoom)); }, zoom);
          }
        }
      }
      const stability = await page.evaluate(async () => {
        const t = zoomScene, c = t.canvas.getContext('2d'), cam = { ...t.camera(1), x: .1, y: .1 };
        const capture = async camera => { await t.draw(t.current, camera); return c.getImageData(0, 0, t.canvas.width, t.canvas.height).data; };
        const a = await capture(cam), b = await capture({ ...cam, x: .2, y: .2 });
        // Building changes must invalidate filtered terrain as well as native chunks.
        const far = t.camera(.4); await t.draw(t.current, far);
        t.s.buildings.pop(); await t.draw(t.current, far);
        const changed = c.getImageData(0, 0, t.canvas.width, t.canvas.height).data;
        t.expected=changed;
        return { stable: a.every((v, i) => v === b[i]), far };
      });
      assert(stability.stable, 'Subpixel near-camera movement within one physical pixel is stable');
      await page.addScriptTag({ content: source });
      const fresh = await page.evaluate(async far => {
        const t = zoomScene; await t.draw(GFArt, far);
        return t.canvas.getContext('2d').getImageData(0, 0, t.canvas.width, t.canvas.height).data.every((v,i)=>v===t.expected[i]);
      }, stability.far);
      assert(fresh, 'Changed occupancy matches a fresh filtered terrain cache');
      if (!offline && dpr === 1) {
        const large = await page.evaluate(async () => {
          const t=zoomScene,s=GF.createMatch({mode:'coop',enemyCount:6,mapSeed:42}),rows=[];
          for(const zoom of [.12,.2,.4,.65,1]){
            const cam={x:360-GF.worldWidth(s)*32*zoom,y:300-GF.worldHeight(s)*32*zoom,zoom};
            const draw=()=>GFArt.render(t.canvas,s,cam,null,t.options);
            draw();await GFArt.ready();draw();
            let allocations=0;const create=document.createElement;
            document.createElement=function(...args){if(args[0]==='canvas')allocations++;return create.apply(this,args);};
            const start=performance.now();
            try{for(let i=0;i<20;i++)draw();}finally{document.createElement=create;}
            rows.push({zoom,ms:(performance.now()-start)/20,allocations,cache:GFArt.cacheStats()});
          }
          return {width:GF.worldWidth(s),height:GF.worldHeight(s),rows};
        });
        for(const row of large.rows){assert.equal(row.allocations,0,'Large-map warm frames never reconstruct terrain');assert(row.cache.chunks<=40);}
        fs.writeFileSync(path.join(qa,'large-map-report.json'),JSON.stringify(large,null,2));
        console.log(`Large ${large.width}x${large.height} map: five zooms keep warm caches bounded and reusable`);
      }
      assert.deepEqual(errors, [], 'No missing assets or browser errors');
      console.log(`${offline ? 'Offline' : 'Source'} DPR ${dpr}: seven zooms, crisp integer pixels, filtered distance, stable pan and cache invalidation passed`);
      await page.close();
    }
    fs.writeFileSync(path.join(qa, 'report.json'), JSON.stringify(report, null, 2));
  } finally { await browser.close(); await server.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
