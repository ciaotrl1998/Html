'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const { execFileSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const source = ['game', 'art', 'autoplay', 'app'].map(name =>
  fs.readFileSync(path.join(root, 'js', name + '.js'), 'utf8')).join('\n;\n');
const failures = [];
const mobile = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true };
const desktop = { viewport: { width: 1366, height: 768 }, deviceScaleFactor: 2, hasTouch: false, isMobile: false };

async function open(browser, options, manual = true) {
  const context = await browser.newContext(options);
  const page = await context.newPage();
  page.errors = [];
  page.on('pageerror', error => page.errors.push(error.message));
  if(!process.argv.includes('--built'))await page.route('**/js/runtime.js', route => route.fulfill({ contentType: 'application/javascript', body: source }));
  if (manual) await context.addInitScript(() => {
    // Start on the same time origin as closeModal/visibilitychange, never at zero.
    let now = performance.now() + 1, id = 0, hidden = false;
    const queue = new Map();
    Object.defineProperty(performance, 'now', { value: () => now, configurable: true });
    window.requestAnimationFrame = callback => { queue.set(++id, callback); return id; };
    window.cancelAnimationFrame = handle => queue.delete(handle);
    Object.defineProperty(document, 'hidden', { get: () => hidden, configurable: true });
    Object.defineProperty(document, 'visibilityState', { get: () => hidden ? 'hidden' : 'visible', configurable: true });
    const probe = window.mobileProbe = {
      steps: [], renders: [],
      advance(frames, hz = 120) {
        const before = { elapsed: window.Gufang?.state.elapsed, steps: this.steps.length, renders: this.renders.length, now };
        for (let i = 0; i < frames; i++) {
          now += 1000 / hz;
          const callbacks = [...queue.values()]; queue.clear();
          for (const callback of callbacks) callback(now);
        }
        return { seconds: (now - before.now) / 1000, elapsed: Gufang.state.elapsed - before.elapsed,
          steps: this.steps.slice(before.steps), renders: this.renders.slice(before.renders) };
      },
      setHidden(value) { hidden = value; document.dispatchEvent(new Event('visibilitychange')); }
    };
    for (const name of ['GF', 'GFArt']) {
      let exported;
      Object.defineProperty(window, name, {
        configurable: true, get: () => exported,
        set(value) {
          const method = name === 'GF' ? 'step' : 'render', original = value[method];
          value[method] = function (...args) {
            if (method === 'step') probe.steps.push({ now, dt: args[1] });
            else if (args[0].id === 'map') probe.renders.push({ now, elapsed: args[1].elapsed,
              animationTime: args[4]?.animationTime ?? args[1].elapsed,
              camera: { ...args[2] }, selected: args[3] && { ...args[3] } });
            return original.apply(this, args);
          };
          exported = value;
        }
      });
    }
  });
  await page.goto(pathToFileURL(path.join(root, process.argv.includes('--built') ? 'dist/古坊奇谭.html' : 'index.html')).href);
  await page.waitForFunction(() => !!window.Gufang, null, { polling: 20 });
  await page.evaluate(() => document.getElementById('start-single').click());
  await page.evaluate(() => document.querySelector('[data-choice="thunder"]').click());
  return page;
}

async function check(label, action) {
  try { await action(); console.log('PASS ' + label); }
  catch (error) { failures.push(label + ': ' + error.stack); console.error('FAIL ' + label + ': ' + error.message); }
}

const advance = (page, frames, hz = 120) => page.evaluate(({ frames, hz }) => mobileProbe.advance(frames, hz), { frames, hz });
async function dimensions(page, ratio) {
  const result = await page.evaluate(() => {
    const canvas = document.getElementById('map'), game = document.getElementById('game');
    const rect = canvas.getBoundingClientRect();
    return { width: canvas.width, height: canvas.height, cssWidth: rect.width, cssHeight: rect.height,
      viewWidth: game.clientWidth, viewHeight: game.clientHeight, dpr: devicePixelRatio,
      coarse: matchMedia('(pointer: coarse)').matches };
  });
  assert.equal(result.width, Math.round(result.viewWidth * ratio));
  assert.equal(result.height, Math.round(result.viewHeight * ratio));
  assert(Math.abs(result.width / result.cssWidth - ratio) < .01);
  assert(Math.abs(result.height / result.cssHeight - ratio) < .01);
  console.log('CANVAS ' + JSON.stringify(result));
  return result;
}

async function scheduling(page, label, hz) {
  await advance(page, 8, hz);
  const result = await advance(page, hz * 10, hz);
  assert(Math.abs(result.elapsed - result.seconds) <= 1 / 30 + 1e-8,
    `Simulation lost time: elapsed=${result.elapsed}, clock=${result.seconds}`);
  const simulated = result.steps.reduce((sum, step) => sum + step.dt, 0);
  assert(Math.abs(simulated - result.elapsed) < 1e-8);
  assert(result.steps.length >= 299 && result.steps.length <= 301, 'Simulation batches run at 30 Hz');
  assert(result.steps.every(step => step.dt > 0 && step.dt <= .1));
  assert.equal(result.renders.length, hz * 10, 'Every active RAF draws without a frame cap');
  assert(result.renders.some(render => render.animationTime > render.elapsed + 1e-8),
    'Animation advances between simulation batches');
  for (let i = 1; i < result.renders.length; i++) {
    const previous = result.renders[i - 1], current = result.renders[i];
    assert(current.animationTime > previous.animationTime, 'Animation clock increases every RAF');
    assert(Math.abs(current.animationTime - previous.animationTime - 1 / hz) < 1e-8,
      'Animation clock is smooth across simulation batches');
    assert(current.animationTime >= current.elapsed - 1e-8 && current.animationTime - current.elapsed < 1 / 30 + 1e-8);
  }
  console.log('SCHEDULING ' + JSON.stringify({ label, clockSeconds: result.seconds, simulatedSeconds: result.elapsed,
    hz, steps: result.steps.length, draws: result.renders.length }));
}

async function pausedChanges(page, hz) {
  await page.evaluate(() => { document.getElementById('close-panel').click(); Gufang.setPaused(true); });
  await advance(page, 12, hz);
  const frozenTime = await page.evaluate(() => Gufang.state.elapsed);
  let result = await advance(page, hz * 2, hz);
  assert.equal(result.steps.length, 0);
  assert.equal(result.elapsed, 0);
  assert.equal(result.renders.length, 0, 'Stable paused renderKey skips drawing');
  const target = await page.evaluate(() => {
    const b = Gufang.state.buildings.find(b => b.type === 'shrine');
    Gufang.select(b.x, b.y); return { x: b.x, y: b.y };
  });
  result = await advance(page, 12, hz);
  assert.equal(result.renders.length, 1, 'Paused selection invalidates drawing once');
  assert.deepEqual(result.renders[0].selected, target);
  assert.equal(result.renders[0].animationTime, frozenTime, 'Paused selection uses a fixed animation clock');
  await page.evaluate(() => {
    const canvas = document.getElementById('map'), rect = canvas.getBoundingClientRect();
    canvas.dispatchEvent(new WheelEvent('wheel', { clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2, deltaY: -100, cancelable: true }));
  });
  result = await advance(page, 12, hz);
  assert.equal(result.renders.length, 1, 'Paused camera change invalidates drawing once');
  assert.equal(result.renders[0].animationTime, frozenTime, 'Paused camera uses the same animation clock');
  result = await advance(page, hz * 2, hz);
  assert.equal(result.renders.length, 0);
  assert.equal(result.elapsed, 0);
  await page.evaluate(() => Gufang.setPaused(false));
  result = await advance(page, hz, hz);
  assert.equal(result.renders.length, hz, 'Pause restoration draws every RAF');
  assert(Math.abs(result.elapsed - 1) <= 1 / 30 + 1e-8, 'Pause restoration does not catch up paused time');
  for (let i = 0; i < result.renders.length; i++) {
    assert(Math.abs(result.renders[i].animationTime - frozenTime - (i + 1) / hz) < 1e-8,
      'Resumed animation clock advances smoothly from the frozen clock');
  }
}

async function hiddenStops(page, hz) {
  await page.evaluate(() => { document.getElementById('close-panel').click(); Gufang.setPaused(false); });
  await advance(page, 12, hz);
  await page.evaluate(() => {
    mobileProbe.setHidden(true);
    const b = Gufang.state.buildings.find(b => b.type === 'shrine');
    Gufang.select(b.x, b.y);
    window.dispatchEvent(new Event('resize'));
  });
  let result = await advance(page, hz * 2, hz);
  assert.equal(result.steps.length, 0);
  assert.equal(result.elapsed, 0);
  assert.equal(result.renders.length, 0, 'Hidden skips rendering even with invalidation');
  await page.evaluate(() => mobileProbe.setHidden(false));
  const frozenTime = await page.evaluate(() => Gufang.state.elapsed);
  result = await advance(page, hz, hz);
  assert(Math.abs(result.elapsed - 1) <= 1 / 30 + 1e-8, 'Visibility restoration does not catch up hidden time');
  assert.equal(result.renders.length, hz, 'Visible resumes drawing every RAF');
  for (let i = 0; i < result.renders.length; i++) {
    assert(Math.abs(result.renders[i].animationTime - frozenTime - (i + 1) / hz) < 1e-8,
      'Visible animation resumes smoothly without hidden time');
  }
}

async function overStops(page) {
  await page.evaluate(() => { Gufang.state.over = true; });
  const result = await advance(page, 240);
  assert.equal(result.steps.length, 0);
  assert.equal(result.elapsed, 0);
  assert.equal(result.renders.length, 1, 'Game over invalidates once then stops drawing');
  assert.equal(result.renders[0].animationTime, await page.evaluate(() => Gufang.state.elapsed));
}

async function resizedSelection(page) {
  await page.evaluate(() => document.getElementById('close-panel').click());
  await page.setViewportSize({ width: 412, height: 915 });
  await page.evaluate(() => window.dispatchEvent(new Event('resize')));
  await advance(page, 12);
  await dimensions(page, 1.25);
  const target = await page.evaluate(() => {
    const b = Gufang.state.buildings.find(b => b.type === 'shrine');
    return { x: b.x, y: b.y, point: Gufang.screenPoint(b.x, b.y) };
  });
  // Use real screen-coordinate touch input, not Gufang.select or backing-pixel coordinates.
  await page.touchscreen.tap(target.point.x, target.point.y);
  const result = await advance(page, 12);
  assert(result.renders.length > 0);
  assert.deepEqual(result.renders.at(-1).selected, { x: target.x, y: target.y });
  assert.equal(await page.locator('#panel').evaluate(el => el.hidden), false);
}

async function rasterMeasurement(browser) {
  const page = await open(browser, mobile, false);
  try {
    await page.evaluate(() => { Gufang.setPaused(true); });
    const session = await page.context().newCDPSession(page);
    await session.send('Emulation.setCPUThrottlingRate', { rate: 6 });
    const live = await page.evaluate(async () => {
      Gufang.setPaused(false);
      for(let i=0;i<20;i++)await new Promise(resolve=>requestAnimationFrame(resolve));
      const render=GFArt.render,times=[],costs=[];
      GFArt.render=function(...args){const start=performance.now();const result=render.apply(this,args);times.push(start);costs.push(performance.now()-start);return result;};
      try {await new Promise(resolve=>setTimeout(resolve,3000));}
      finally {GFArt.render=render;Gufang.setPaused(true);}
      const intervals=times.slice(1).map((time,i)=>time-times[i]).sort((a,b)=>a-b);
      costs.sort((a,b)=>a-b);
      return {frames:times.length,fps:(times.length-1)*1000/(times.at(-1)-times[0]),
        frameIntervalP95:intervals[Math.floor(intervals.length*.95)],renderMsP95:costs[Math.floor(costs.length*.95)]};
    });
    assert(live.frames>0,'Real RAF renders a live scene');
    console.log('LIVE RAF (desktop Chrome, mobile viewport, CPU 6x; not phone FPS) '+JSON.stringify(live));
    if(process.argv.includes('--benchmark')) {
      await page.addScriptTag({ content: execFileSync('git', ['show', 'HEAD:古坊奇谭/js/art.js'], { cwd: root, encoding: 'utf8' }) });
      await page.evaluate(() => { window.baselineArt=GFArt; });
      await page.addScriptTag({ content: fs.readFileSync(path.join(root, 'js/art.js'), 'utf8') });
    }
    const result = await page.evaluate(() => {
      const canvas = document.getElementById('map'), ctx = canvas.getContext('2d');
      const seed = Gufang.state.mapSeed === 0x12345678 ? 0x12345679 : 0x12345678;
      const state = GF.createState(seed), camera = Gufang.camera;
      const measure = (art = GFArt) => {
        const start = performance.now();
        art.render(canvas, state, camera, null, { grid: true });
        const rendered = performance.now();
        const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        const rasterized = performance.now();
        let painted = 0;
        for (let i = 0; i < pixels.length; i += 4) if (pixels[i] || pixels[i + 1] || pixels[i + 2]) painted++;
        return { renderMs: rendered - start, readbackMs: rasterized - rendered, totalMs: rasterized - start, painted };
      };
      const cold = measure(), warm = Array.from({ length: 12 }, () => measure());
      let baseline;
      if(window.baselineArt){
        const cold=measure(baselineArt),warm=Array.from({length:12},()=>measure(baselineArt));
        baseline={cold,warm};
      }
      return { cpuSlowdown: 6, mapSeed: state.mapSeed, phase: state.phase, buildings: state.buildings.length,
        canvas: [canvas.width, canvas.height], cold, warm, baseline };
    });
    assert.equal(result.phase, 'day');
    assert(result.cold.painted > 0 && result.warm.every(sample => sample.painted > 0));
    console.log('MEASUREMENT (render + forced full-canvas readback; not FPS) ' + JSON.stringify(result));
    assert.deepEqual(page.errors, []);
    await session.detach();
  } finally { await page.context().close(); }
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
  try {
    for (const [label, options, ratio] of [['mobile', mobile, 1.25], ['desktop', desktop, 2]]) {
      const page = await open(browser, options);
      try {
        await check(label + ' pointer/DPR/canvas', async () => {
          const result = await dimensions(page, ratio);
          assert.equal(result.coarse, label === 'mobile');
          assert.equal(result.dpr, options.deviceScaleFactor);
        });
        for (const hz of [120, 60, 90]) {
          await check(label + ' ' + hz + 'Hz RAF and smooth animation', () => scheduling(page, label, hz));
          await check(label + ' ' + hz + 'Hz paused stable/selection/camera/resume', () => pausedChanges(page, hz));
          await check(label + ' ' + hz + 'Hz hidden stops and resumes', () => hiddenStops(page, hz));
        }
        await page.screenshot({path:path.join(os.tmpdir(),`gufang-mobile-pass2-${label}.png`)});
        if (label === 'mobile') await check('mobile resize and screen-coordinate touch selection', () => resizedSelection(page));
        await check(label + ' game over fixed animation and dirty-only render', () => overStops(page));
        await check(label + ' browser errors', async () => assert.deepEqual(page.errors, []));
      } finally { await page.context().close(); }
    }
    await check('CPU 6x sparse new day cold/warm forced raster', () => rasterMeasurement(browser));
  } finally { await browser.close(); }
  assert.equal(failures.length, 0, failures.join('\n\n'));
})().catch(error => { console.error(error); process.exitCode = 1; });
