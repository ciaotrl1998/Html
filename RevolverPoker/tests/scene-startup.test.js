import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import * as THREE from 'three';
import savedScene from '../client/scene-layout.js';
import { RenderBudget } from '../client/render-budget.js';

// Keep actual Three.js geometry, transforms and cameras. Only the GPU renderer
// and browser surface are replaced; construct the complete production scene.
const threeURL = import.meta.resolve('three');
const rendererURL = `data:text/javascript,${encodeURIComponent(`
  export * from ${JSON.stringify(threeURL)};
  export class WebGLRenderer {
    constructor() {
      this.domElement = document.createElement('canvas');
      this.shadowMap = {};
      this.capabilities = { getMaxAnisotropy: () => 1 };
    }
    setPixelRatio() {} setSize() {} render() {}
    getRenderTarget() { return null; } setRenderTarget() {}
    readRenderTargetPixels(target, x, y, width, height, pixels) { pixels.fill(255); }
  }
`)}`;
registerHooks({ resolve(specifier, context, next) {
  if (specifier === '/vendor/three.js') return next(rendererURL, context);
  if (specifier === '/shared/scene-layout.js') return next(new URL('../shared/scene-layout.js', import.meta.url).href, context);
  return next(specifier, context);
} });
const { SaloonScene } = await import('../client/scene.js');

test('quality changes invalidate cached shadow shaders, including hidden and shared materials, in both directions', t => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'devicePixelRatio');
  Object.defineProperty(globalThis, 'devicePixelRatio', { configurable: true, value: 2 });
  t.after(() => { if (original) Object.defineProperty(globalThis, 'devicePixelRatio', original); else delete globalThis.devicePixelRatio; });
  const scene = Object.create(SaloonScene.prototype);
  scene.scene = new THREE.Scene();
  const felt = new THREE.MeshStandardMaterial(), hiddenMaterial = new THREE.MeshStandardMaterial();
  const geometry = new THREE.PlaneGeometry();
  const table = new THREE.Mesh(geometry, felt); table.receiveShadow = true;
  const hidden = new THREE.Mesh(geometry, [felt, hiddenMaterial]); hidden.visible = false;
  scene.scene.add(table, hidden);
  t.after(() => { geometry.dispose(); felt.dispose(); hiddenMaterial.dispose(); });
  let ratio, resets = 0, resizes = 0;
  scene.renderer = { shadowMap: { enabled: true, autoUpdate: false, needsUpdate: false }, setPixelRatio(value) { ratio = value; } };
  scene.renderBudget = new RenderBudget({ pixelRatio: 2 }); scene.pixelRatio = 1.7;
  scene.container = { getBoundingClientRect: () => ({ width: 390, height: 844 }) };
  scene.camera = new THREE.PerspectiveCamera(); scene.playerCamera = new THREE.PerspectiveCamera();
  scene.renderer.setSize = () => {};
  scene.shadowClock = { reset() { resets++; } }; scene.resize = () => { resizes++; SaloonScene.prototype.resize.call(scene); };
  const versions = [felt.version, hiddenMaterial.version];
  scene.setQuality(true);
  assert.equal(scene.renderer.shadowMap.enabled, false);
  assert.equal(scene.renderer.shadowMap.needsUpdate, false);
  assert.equal(ratio, 1);
  assert.deepEqual([felt.version, hiddenMaterial.version], versions.map(v => v + 1), 'all affected shaders are refreshed once, even when materials are shared or hidden');
  scene.setQuality(true);
  assert.deepEqual([felt.version, hiddenMaterial.version], versions.map(v => v + 1), 'unchanged quality does not recompile shaders');
  scene.setQuality(false);
  assert.equal(scene.renderer.shadowMap.enabled, true);
  assert.equal(scene.renderer.shadowMap.needsUpdate, true, 'standard quality requests a fresh shadow map');
  assert.equal(scene.renderer.shadowMap.autoUpdate, false, 'the 30 FPS shadow budget is preserved');
  assert.equal(ratio, 1.7);
  assert.deepEqual([felt.version, hiddenMaterial.version], versions.map(v => v + 2));
  assert.equal(table.receiveShadow, true);
  assert.equal(resets, 3); assert.equal(resizes, 3);
  scene.keyLight = new THREE.SpotLight(); scene.keyLight.shadow.mapSize.set(1024, 1024);
  let disposed = 0;
  scene.keyLight.shadow.map = { dispose() { disposed++; } };
  scene.setQuality('medium');
  assert.equal(scene.keyLight.shadow.mapSize.x, 512);
  assert.equal(scene.keyLight.shadow.map, null); assert.equal(disposed, 1, 'switching shadow resolution releases the old GPU buffer');
  assert.equal(scene.renderer.shadowMap.enabled, true);
  assert.equal(scene.renderer.shadowMap.needsUpdate, true);
  assert.deepEqual([felt.version, hiddenMaterial.version], versions.map(v => v + 2), 'medium retains shadow shaders and invalidates only the resized map');
  assert.equal(ratio, 1.7 * .9, 'medium lowers the scene render resolution');
  scene.keyLight.shadow.map = { dispose() { disposed++; } };
  scene.setQuality('low'); assert.equal(disposed, 2); assert.equal(scene.keyLight.shadow.map, null);
  assert.equal(scene.renderer.shadowMap.enabled, false);
  scene.setQuality('high'); assert.equal(scene.keyLight.shadow.mapSize.x, 1024);
  assert.equal(scene.renderer.shadowMap.needsUpdate, true);
  scene.keyLight.dispose();
});

test('game and editor initialize every saved anchor before the first frame, without a layout request or poll', t => {
  const gradient = () => ({ addColorStop() {} });
  const ctx = new Proxy({
    createLinearGradient: gradient, createRadialGradient: gradient,
    measureText: text => ({ width: String(text).length * 16 }),
    createImageData: (width, height) => ({ data: new Uint8ClampedArray(width * height * 4) })
  }, { get: (target, key) => key in target ? target[key] : () => {} });
  const element = () => ({
    style: {}, children: [], appendChild(child) { this.children.push(child); },
    getContext: () => ctx, toDataURL: () => 'data:image/png;base64,',
    setAttribute() {}, addEventListener() {}, removeEventListener() {},
    querySelector: () => element(),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 390, height: 844 })
  });
  let frames = 0, renderTicks = 0;
  const values = {
    document: { createElement: element, addEventListener() {}, removeEventListener() {}, querySelector: () => null },
    window: { addEventListener() {}, removeEventListener() {} }, devicePixelRatio: 1,
    ResizeObserver: class { observe() {} disconnect() {} },
    requestAnimationFrame: () => ++frames,
    fetch: () => { assert.fail('Scene initialization must not fetch a layout'); },
    setInterval: () => { assert.fail('Scene initialization must not poll a layout'); },
    AbortSignal: {} // Older WebViews do not provide AbortSignal.timeout.
  };
  const originals = new Map();
  for (const [key, value] of Object.entries(values)) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  t.after(() => {
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    }
  });
  for (const editor of [false, true]) {
    const scene = new SaloonScene(element(), { editor });
    const stats = [...scene.models, ...scene.chairs].reduce((total, node) => ({ before: total.before + node.userData.meshBatching.before, after: total.after + node.userData.meshBatching.after }), { before: 0, after: 0 });
    assert.ok(stats.after < stats.before * .6, 'batching reduces character/chair meshes without changing layout anchors');
    if (!editor) t.diagnostic(`Character/chair meshes: ${stats.before} -> ${stats.after}`);
    const chipStats = scene.piles.reduce((total, node) => ({ before: total.before + node.userData.meshBatching.before, after: total.after + node.userData.meshBatching.after }), { before: 0, after: 0 });
    assert.ok(chipStats.after < chipStats.before / 4, 'static chip decorations are batched without changing their saved anchors');
    assert.ok(scene.hands.userData.meshBatching.after < scene.hands.userData.meshBatching.before);
    if (!editor) t.diagnostic(`Static chip meshes: ${chipStats.before} -> ${chipStats.after}; arm/hand meshes: ${scene.hands.userData.meshBatching.before} -> ${scene.hands.userData.meshBatching.after}`);
    for (const id of ['table-8', 'player-camera', 'board-camera', 'hand-group', 'staged-chips', 'pot-chips', 'pot-value']) {
      const entry = scene.layout.entries.get(id), expected = savedScene.objects[id];
      assert.ok(entry && expected, `${id} exists in the scene and editor save`);
      for (const key of ['position', 'rotation', 'scale']) {
        entry.proxy[key].toArray().slice(0, 3).forEach((value, axis) => assert.ok(Math.abs(value - expected[key][axis]) < 1e-8, `${id}.${key}[${axis}]`));
      }
      if (expected.camera) assert.equal(entry.node.fov, expected.camera.fov);
    }
    assert.equal(scene.ready, undefined, 'no second asynchronous scene initialization');
    let draws = 0, shadows = 0;
    scene.renderer.render = () => { draws++; if (scene.renderer.shadowMap.enabled && (scene.renderer.shadowMap.autoUpdate || scene.renderer.shadowMap.needsUpdate)) { shadows++; scene.renderer.shadowMap.needsUpdate = false; } };
    for (let i = 0; i < 120; i++) { scene.tick(i * 1000 / 60); renderTicks++; }
    assert.equal(draws, 120, 'default scene renders every refresh on a 60 Hz display');
    assert.equal(shadows, editor ? 120 : 8, 'idle game shadows update at 4 Hz; editor views retain their own complete shadow passes');
    if (!editor) t.diagnostic(`Idle shadow passes over 2 seconds: 60 -> ${shadows}`);
    scene.setFrameRate(30);
    for (let i = 120; i < 240; i++) { scene.tick(i * 1000 / 60); renderTicks++; }
    assert.equal(draws, 180, 'switching to 30 FPS takes effect without reconstructing the scene');
    document.hidden = true; scene.tick(5000); renderTicks++;
    assert.equal(draws, 180, 'hidden pages do not render');
    document.hidden = false; scene.tick(15000); renderTicks++;
    assert.equal(draws, 181, 'returning from the background resumes immediately');
    scene.setFrameRate(45);
    let before = draws;
    for (let i = 0; i < 120; i++) { scene.tick(16000 + i * 1000 / 60); renderTicks++; }
    assert.equal(draws - before, 90, '45 FPS is applied to the production render loop');
    if (!editor) {
      scene.setFrameRate(60); scene.cards.handDrag = .1;
      before = shadows;
      for (let i = 0; i < 120; i++) { scene.tick(20000 + i * 1000 / 60); renderTicks++; }
      assert.equal(shadows - before, 60, 'moving cards retain 30 Hz shadow updates');
      scene.cards.handDrag = 0; before = shadows;
      scene.tick(22000); renderTicks++;
      assert.equal(shadows, before + 1, 'the final resting pose refreshes without waiting for the idle interval');
      scene.tableActions.context = {}; scene.tableActions.gesture = { kind: 'select' }; before = shadows;
      for (let i = 1; i < 60; i++) { scene.tick(22000 + i * 1000 / 60); renderTicks++; }
      assert.equal(shadows, before, 'holding the UI slider reuses shadows');
      scene.tableActions.gesture = null; scene.tableActions.context = null;
      scene.setQuality(true); before = shadows;
      assert.equal(scene.cards.factory.lowQuality, true, 'the scene quality setting also switches printed card materials');
      assert.equal(scene.cards.deckCard.back.material.isMeshBasicMaterial, true);
      for (let i = 0; i < 60; i++) { scene.tick(24000 + i * 1000 / 60); renderTicks++; }
      assert.equal(shadows, before, 'low quality performs no shadow passes');
      scene.setQuality('high'); const highRatio = scene.pixelRatio;
      const cardMaterial = scene.cards.factory.front(12), cardMap = cardMaterial.map;
      scene.setQuality('medium');
      assert.equal(scene.pixelRatio, highRatio * .9);
      assert.equal(scene.cards.factory.front(12), cardMaterial);
      assert.equal(cardMaterial.map, cardMap);
      assert.equal(cardMap.image.width, 384); assert.equal(cardMap.image.height, 558);
      assert.equal(cardMap.anisotropy, 4, 'medium retains card filtering for oblique table views');
      assert.equal(scene.keyLight.shadow.mapSize.x, 512);
      scene.cards.handDrag = .1; before = shadows;
      for (let i = 0; i < 120; i++) { scene.tick(26000 + i * 1000 / 60); renderTicks++; }
      assert.equal(shadows - before, 30, 'medium updates moving shadows at 15 Hz');
      scene.cards.handDrag = 0; before = shadows;
      for (let i = 0; i < 120; i++) { scene.tick(28000 + i * 1000 / 60); renderTicks++; }
      assert.equal(shadows - before, 4, 'medium idle shadows update at 2 Hz with the final pose refreshed');
    }
    scene.controls?.dispose(); scene.resizeObserver.disconnect();
  }
  assert.equal(frames, 2 + renderTicks, 'one initial frame and one following callback per RAF tick');
});
