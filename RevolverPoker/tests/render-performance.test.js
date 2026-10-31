import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import * as THREE from 'three';
import { FrameClock } from '../client/frame-clock.js';
import { RenderBudget, normalizeQuality } from '../client/render-budget.js';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

registerHooks({ resolve(specifier, context, next) {
  if (specifier === '/vendor/three.js') return next('three', context);
  return next(specifier, context);
} });
const { batchStaticMeshes } = await import('../client/mesh-batching.js');

test('30/45/60 FPS pacing holds its target on 60/90/120/144 Hz displays despite RAF timestamp jitter', () => {
  for (const hz of [60, 90, 120, 144]) for (const fps of [30, 45, 60]) {
    const clock = new FrameClock(fps); let frames = 0;
    for (let i = 0; i < hz * 2; i++) {
      const time = i * 1000 / hz + Math.sin(i) * .15;
      if (clock.step(time) !== null) frames++;
    }
    assert.ok(Math.abs(frames - fps * 2) <= 1, `${hz} Hz / ${fps} FPS: rendered ${frames} frames in two seconds`);
  }
});

test('rate changes and background recovery start cleanly without catch-up bursts or huge animation steps', () => {
  const clock = new FrameClock(); assert.equal(clock.fps, 60);
  clock.step(0); assert.equal(clock.step(1), null);
  clock.step(10000); assert.equal(clock.step(10001), null);
  clock.setRate(30); assert.equal(clock.step(10002), 1 / 30);
  assert.equal(clock.step(10018), null);
  clock.reset(); assert.equal(clock.step(20000), 1 / 30);
  clock.setRate(60); assert.equal(clock.step(20001), 1 / 60);
  clock.setRate(45); assert.equal(clock.step(20002), 1 / 45);
  clock.setRate(144); assert.equal(clock.fps, 60, 'invalid settings use the default');
});

test('high quality matches native screen density while medium/low and editor retain their bounded resolution', () => {
  const phone = new RenderBudget({ pixelRatio: 3, mobile: true });
  phone.resize(400, 884); assert.equal(phone.ratio, 3);
  assert.equal(400 * phone.ratio, 1200); assert.equal(884 * phone.ratio, 2652);
  phone.resize(600, 1300); assert.equal(phone.ratio, 3);
  phone.setQuality('medium'); assert.ok(600 * 1300 * phone.ratio ** 2 <= 900000 * .81 + 1);
  phone.setQuality('low'); assert.ok(phone.ratio <= 1);
  phone.setQuality('high'); assert.equal(phone.ratio, 3);
  const desktop = new RenderBudget({ pixelRatio: 2 }); desktop.resize(1920, 1080);
  assert.equal(desktop.ratio, 2);
  desktop.setQuality('medium'); assert.ok(1920 * 1080 * desktop.ratio ** 2 <= 1400000 * .81 + 1);
  const editor = new RenderBudget({ pixelRatio: 2, editor: true }); editor.resize(1920, 1080);
  assert.equal(editor.ratio, 1.7);
});

test('medium adapts to sustained frame loss, recovers slowly, and discards background pauses', () => {
  const budget = new RenderBudget({ pixelRatio: 3, mobile: true }); budget.resize(400, 884);
  budget.setQuality('medium'); const maximum = budget.ratio;
  let now = 0;
  const run = (hz, seconds, target = 60) => { let changes = 0; for (let i = 0; i < hz * seconds; i++) { if (budget.sample(now, target)) changes++; now += 1000 / hz; } return changes; };
  assert.equal(run(60, 3), 0); assert.equal(budget.ratio, maximum);
  assert.ok(run(40, 3) > 0); const reduced = budget.ratio; assert.ok(reduced < maximum);
  budget.reset(); now += 60000;
  assert.equal(budget.sample(now, 60), false); assert.equal(budget.ratio, reduced);
  now += 60000;
  assert.equal(budget.sample(now, 60), false, 'a browser-suspended RAF gap is not mistaken for sustained GPU overload');
  assert.equal(budget.ratio, reduced);
  run(60, 9); assert.ok(budget.ratio > reduced && budget.ratio <= maximum);
  for (let i = 0; i < 20; i++) run(20, 3);
  assert.ok(budget.ratio >= .75, 'resolution is bounded even on a device that cannot reach the requested FPS');
  budget.setQuality(true); const low = budget.ratio;
  assert.equal(run(20, 9), 0); assert.equal(budget.ratio, low);
  budget.setQuality(false); assert.equal(budget.ratio, 3);
  assert.equal(run(20, 9), 0); assert.equal(budget.ratio, 3, 'high quality does not silently soften the screen under load');
});

test('stable 45 FPS does not trigger resolution reductions', () => {
  for (const hz of [60, 90, 120]) {
    const clock = new FrameClock(45), budget = new RenderBudget({ pixelRatio: 3, mobile: true });
    budget.resize(400, 884);
    for (let i = 0; i < hz * 12; i++) { const now = i * 1000 / hz; if (clock.step(now) !== null) assert.equal(budget.sample(now, 45), false); }
    assert.equal(budget.ratio, 3);
  }
});

test('medium quality keeps its previous resolution budget, textures and shadow cost independently of native high quality', () => {
  const budget = new RenderBudget({ pixelRatio: 3, mobile: true }); budget.resize(400, 884);
  const highRatio = budget.ratio;
  budget.setQuality('medium'); const mediumRatio = 1.5 * .9;
  assert.equal(budget.ratio, mediumRatio);
  assert.ok(Math.abs((budget.ratio / 1.5) ** 2 - .81) < 1e-9, 'medium retains the previous 19 percent reduction from its bounded budget');
  assert.equal(budget.settings.shadowSize, 512); assert.equal(budget.settings.shadowFps, 15);
  assert.equal(budget.settings.idleShadowFps, 2);
  for (let i = 0; i < 20 * 30; i++) budget.sample(i * 50, 60);
  assert.ok(budget.ratio >= mediumRatio * .95, 'medium quality limits further softening to protect card readability');
  budget.resize(600, 1300);
  assert.ok(budget.ratio <= Math.sqrt(900000 / (600 * 1300)) * .9, 'the medium reduction survives viewport resizing');
  budget.resize(400, 884);
  budget.setQuality('low'); assert.equal(budget.ratio, 1);
  budget.setQuality('high'); assert.equal(budget.ratio, highRatio);
  assert.equal(budget.settings.shadowSize, 1024); assert.equal(budget.settings.shadowFps, 30);
});

test('quality menu cycles high/medium/low, restores every level and migrates the old standard preference', async () => {
  const source = await readFile(new URL('../client/app.js', import.meta.url), 'utf8');
  const declaration = source.match(/^let quality = .*;$/m)[0];
  const handler = source.slice(source.indexOf('const qualityLabels'), source.indexOf("$('frame-rate-state').textContent"));
  const labels = { high: '高', medium: '中', low: '低' };
  for (const stored of [null, 'standard', 'high', 'medium', 'low', 'invalid']) {
    const settings = new Map([['rp-quality', stored]]), nodes = new Map(), applied = [];
    const context = vm.createContext({ normalizeQuality,
      localStorage: { getItem: key => settings.get(key), setItem: (key, value) => settings.set(key, value) },
      $: id => { if (!nodes.has(id)) nodes.set(id, {}); return nodes.get(id); }, scene: { setQuality: value => applied.push(value) } });
    vm.runInContext(declaration + '\n' + handler, context);
    let expected = stored === 'medium' ? 'medium' : stored === 'low' ? 'low' : 'high';
    assert.equal(nodes.get('quality-state').textContent, labels[expected]);
    for (let i = 0; i < 3; i++) {
      nodes.get('quality-button').onclick(); expected = expected === 'high' ? 'medium' : expected === 'medium' ? 'low' : 'high';
      assert.equal(applied.at(-1), expected); assert.equal(settings.get('rp-quality'), expected);
      assert.equal(nodes.get('quality-state').textContent, labels[expected]);
    }
  }
});

test('the menu cycles 60/45/30 FPS and restores a stored 45 FPS selection', async () => {
  const source = await readFile(new URL('../client/app.js', import.meta.url), 'utf8');
  const declaration = source.match(/^let frameRate = .*;$/m)[0];
  const handler = source.slice(source.indexOf("$('frame-rate-state').textContent"), source.indexOf('function renderFollowSetting'));
  for (const stored of [null, '45', '30', 'invalid']) {
    const settings = new Map([['rp-frame-rate', stored]]), nodes = new Map(), applied = [];
    const context = vm.createContext({ localStorage: { getItem: key => settings.get(key), setItem: (key, value) => settings.set(key, value) },
      $: id => { if (!nodes.has(id)) nodes.set(id, {}); return nodes.get(id); }, scene: { setFrameRate: fps => applied.push(fps) } });
    vm.runInContext(declaration + '\n' + handler, context);
    let expected = stored === '45' ? 45 : stored === '30' ? 30 : 60;
    assert.equal(nodes.get('frame-rate-state').textContent, `${expected} 帧`);
    for (let i = 0; i < 3; i++) {
      nodes.get('frame-rate-button').onclick(); expected = expected === 60 ? 45 : expected === 45 ? 30 : 60;
      assert.equal(applied.at(-1), expected); assert.equal(settings.get('rp-frame-rate'), String(expected));
      assert.equal(nodes.get('frame-rate-state').textContent, `${expected} 帧`);
    }
  }
});

test('static batching reduces meshes while preserving bounds, triangle counts, animated heads and hit targets', () => {
  const root = new THREE.Group(), head = new THREE.Group(); root.add(head);
  const wood = new THREE.MeshStandardMaterial(), other = new THREE.MeshStandardMaterial();
  for (const parent of [root, head]) for (let i = 0; i < 2; i++) {
    const mesh = new THREE.Mesh(i ? new THREE.CylinderGeometry(.2, .3, .8, 8) : new THREE.BoxGeometry(.3, .5, .7), wood);
    mesh.position.set(i * .6, i * .2, i * .1); mesh.scale.set(1, 1.3, .8); mesh.rotation.z = .25;
    mesh.castShadow = true; parent.add(mesh);
  }
  root.add(new THREE.Mesh(new THREE.BoxGeometry(), other));
  const hit = new THREE.Mesh(new THREE.BoxGeometry(.2, .2, .2), wood); hit.userData.chipRole = 'bank'; root.add(hit);
  head.position.set(0, 3, 0); head.rotation.x = .2;
  const counts = () => { let meshes = 0, triangles = 0; root.traverse(node => { if (node.isMesh) { meshes++; triangles += (node.geometry.index?.count ?? node.geometry.attributes.position.count) / 3; } }); return { meshes, triangles }; };
  const before = counts(), bounds = new THREE.Box3().setFromObject(root, true);
  batchStaticMeshes(root);
  const after = counts(), mergedBounds = new THREE.Box3().setFromObject(root, true);
  assert.equal(before.meshes, 6); assert.equal(after.meshes, 4);
  assert.equal(before.triangles, after.triangles);
  assert.ok(bounds.min.distanceTo(mergedBounds.min) < 1e-5 && bounds.max.distanceTo(mergedBounds.max) < 1e-5);
  assert.equal(hit.parent, root); assert.equal(head.parent, root);
  head.rotation.x = .6;
  const moved = new THREE.Box3().setFromObject(root, true);
  assert.ok(moved.min.distanceTo(mergedBounds.min) + moved.max.distanceTo(mergedBounds.max) > .01, 'the head remains independently animated');
});
