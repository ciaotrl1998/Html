'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const { chromium } = require('playwright');
const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js/art.js'), 'utf8');
const benchmark = process.argv.includes('--benchmark');
const original = benchmark ? execFileSync('git', ['show', 'HEAD:古坊奇谭/js/art.js'], { cwd: root, encoding: 'utf8' }) : source;

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
  try {
    for (const viewport of [{ width: 390, height: 844 }, { width: 1366, height: 768 }]) {
      const page = await browser.newPage({ viewport });
      await page.setContent('<canvas style="width:100vw;height:100vh"></canvas>');
      await page.addScriptTag({ content: fs.readFileSync(path.join(root, 'js/game.js'), 'utf8') });
      await page.addScriptTag({ content: original });
      await page.evaluate(() => { window.originalArt = GFArt; });
      await page.addScriptTag({ content: source });
      const result = await page.evaluate(({ width, height }) => {
        const canvas = document.querySelector('canvas'); canvas.width = width * 2; canvas.height = height * 2;
        const s = GF.createState(null); s.mission = GF.MISSIONS.length;
        for (const [i, type] of Object.keys(GF.DEFS).filter(type => type !== 'shrine').entries()) {
          s.buildings.push({ id: i + 100, type, x: 2 + i % 6 * 2, y: 2 + Math.floor(i / 6) * 3, level: i % 3 + 1, hp: GF.maxHP({ type, level: i % 3 + 1 }) });
        }
        const cam = { x: 0, y: 80, zoom: Math.min(width / 1088, (height - 100) / 1088) };
        const ctx = canvas.getContext('2d');
        const pixels = art => { art.render(canvas, s, cam, null); return ctx.getImageData(0, 0, canvas.width, canvas.height).data; };
        const before = pixels(originalArt), after = pixels(GFArt);
        let changed = 0, painted = 0;
        for (let i = 0; i < after.length; i += 4) {
          if (after[i] || after[i + 1] || after[i + 2]) painted++;
          if (Math.abs(before[i] - after[i]) + Math.abs(before[i + 1] - after[i + 1]) + Math.abs(before[i + 2] - after[i + 2]) > 60) changed++;
        }
        const measure = art => {
          let paths = 0;
          const begin = ctx.beginPath; ctx.beginPath = function () { paths++; return begin.apply(this, arguments); };
          const start = performance.now();
          for (let i = 0; i < 30; i++) art.render(canvas, s, cam, null);
          const ms = (performance.now() - start) / 30;
          ctx.beginPath = begin;
          return { ms, paths: paths / 30 };
        };
        let hintCalls = 0;
        const buildHints = GF.buildHints; GF.buildHints = function () { hintCalls++; return buildHints.apply(this, arguments); };
        const optimized = measure(GFArt), warmCalls = hintCalls;
        s.coins++; GFArt.render(canvas, s, cam, null);
        const fundsCalls = hintCalls;
        s.buildings[1].level++; GFArt.render(canvas, s, cam, null);
        const invalidatedCalls = hintCalls;
        GF.buildHints = buildHints;
        const baseline = measure(originalArt);
        const backgroundChecks = () => {
          const fill = CanvasRenderingContext2D.prototype.fillRect;
          let fills = 0, liveBlur = false;
          const draw = ctx.drawImage;
          ctx.drawImage = function () { if(this.shadowBlur>0&&this.shadowColor!=='rgba(0, 0, 0, 0)')liveBlur=true;return draw.apply(this,arguments); };
          CanvasRenderingContext2D.prototype.fillRect = function () { if(this.canvas!==canvas&&this.canvas.width>512)fills++;return fill.apply(this,arguments); };
          try {
            GFArt.render(canvas,s,cam,null);fills=0;
            GFArt.render(canvas,s,cam,null);const warm=fills;
            GFArt.render(canvas,s,{...cam,x:cam.x+16},null);const moved=fills;
            fills=0;GFArt.render(canvas,s,cam,null,{grid:true});const grid=fills;
            fills=0;s.phase='night';GFArt.render(canvas,s,cam,null,{grid:true});const night=fills;
            fills=0;s.buildings[1].level++;GFArt.render(canvas,s,cam,null,{grid:true});const upgrade=fills;
            fills=0;s.buildings[1].x+=1;GFArt.render(canvas,s,cam,null,{grid:true});const building=fills;
            return {warm,moved,grid,night,upgrade,building,liveBlur};
          } finally { CanvasRenderingContext2D.prototype.fillRect=fill;ctx.drawImage=draw;s.phase='day';s.buildings[1].x-=1;s.buildings[1].level--; }
        };
        const dynamic = type => {
          const b = s.buildings.find(b => b.type === type), camera = { x: width / 2 - (b.x * 64 + 32), y: height / 2 - (b.y * 64 + 32), zoom: 1 };
          const capture = t => { GFArt.render(canvas, s, camera, null, { animationTime: t }); return ctx.getImageData(width, height - 120, 100, 140).data; };
          const a = capture(0), bPixels = capture(1); return a.some((v, i) => v !== bPixels[i]);
        };
        const culling = () => {
          const original = {stroke:ctx.stroke,fill:ctx.fill,fillText:ctx.fillText};let calls=0;
          for(const name of Object.keys(original))ctx[name]=function(){calls++;return original[name].apply(this,arguments);};
          try {
            const camera={x:0,y:0,zoom:1};
            const frame = options => {calls=0;GFArt.render(canvas,s,camera,null,options);return calls;};
            frame({});const empty=frame({});
            const offscreen=frame({effects:[{type:'income',amount:10,x:100,y:100,life:.5,total:1},{type:'thunder',x:100,y:100,life:.5,total:1},{type:'zhong-pulse',x:100,y:100,life:.5,total:1}],projectiles:[{type:'rock',x:100,y:100,tx:101,ty:101,life:.2,total:.3}]});
            const onscreen=frame({effects:[{type:'income',amount:10,x:1,y:2,life:.5,total:1}],projectiles:[]});
            const overlapping=frame({effects:[{type:'zhong-pulse',x:-1,y:2,life:.5,total:1}],projectiles:[]});
            return {empty,offscreen,onscreen,overlapping};
          } finally {for(const name of Object.keys(original))ctx[name]=original[name];}
        };
        const ripples = () => {
          const move=ctx.moveTo,stroke=ctx.stroke;let points=[],draws=0;
          ctx.strokeStyle='#e1ebd880';const first=ctx.strokeStyle;ctx.strokeStyle='#e1ebd860';const second=ctx.strokeStyle;
          ctx.moveTo=function(x,y){if(this.strokeStyle===first||this.strokeStyle===second)points.push([x,y]);return move.apply(this,arguments);};
          ctx.stroke=function(){if(this.strokeStyle===first||this.strokeStyle===second)draws++;return stroke.apply(this,arguments);};
          try {
            const capture=(camera,time)=>{points=[];draws=0;GFArt.render(canvas,s,camera,null,{animationTime:time});return {points:points.slice(),draws};};
            const a=capture(cam,0),b=capture(cam,1),offscreen=capture({x:-10000,y:-10000,zoom:1},1);
            return {moves:JSON.stringify(a.points)!==JSON.stringify(b.points),draws:b.draws,offscreen:offscreen.draws};
          } finally {ctx.moveTo=move;ctx.stroke=stroke;}
        };
        return { baseline, optimized, warmCalls, fundsCalls, invalidatedCalls, changed: changed / painted, painted, background:backgroundChecks(),culling:culling(),ripples:ripples(),millMoves: dynamic('mill'), kilnMoves: dynamic('kiln') };
      }, viewport);
      assert(result.painted > viewport.width * viewport.height, 'Canvas is nonblank');
      assert(result.changed < .03, `Baking changed too much of the scene: ${result.changed}`);
      assert.equal(result.warmCalls, 0, 'Warm frames reuse build recommendations');
      assert.equal(result.fundsCalls, 0, 'Funds do not invalidate recommendations');
      assert(result.invalidatedCalls > 0, 'Building changes invalidate recommendations');
      assert(result.optimized.paths < 500, 'Warm frames avoid expensive vector reconstruction');
      if (benchmark) assert(result.optimized.paths <= result.baseline.paths, 'Optimizations do not add vector reconstruction');
      assert(result.millMoves && result.kilnMoves, 'Animated overlays still move');
      assert.equal(result.background.warm,0,'Warm frames reuse viewport scenery');
      for(const key of ['moved','grid','night','upgrade'])assert.equal(result.background[key],0,`${key} reuses baked terrain`);
      assert(result.background.building>0,'Building occupancy invalidates terrain');
      assert.equal(result.background.liveBlur,false,'Live canvas never blurs the full map');
      assert.equal(result.culling.offscreen,result.culling.empty,'Offscreen effects and projectiles make no draw calls');
      assert(result.culling.onscreen>result.culling.empty,'Visible effects remain drawn');
      assert(result.culling.overlapping>result.culling.empty,'Large effects whose center is offscreen remain drawn when overlapping');
      assert(result.ripples.moves,'Water ripples continue moving over static terrain');
      assert(result.ripples.draws>0&&result.ripples.draws<=4,'Visible water is batched in at most four strokes');
      assert.equal(result.ripples.offscreen,0,'Offscreen water is not drawn');
      console.log(JSON.stringify({ viewport, ...result }));
      await page.screenshot({ path: path.join(os.tmpdir(), `gufang-baked-${viewport.width}.png`) });
      await page.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
