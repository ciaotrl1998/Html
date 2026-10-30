import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import savedScene from '../client/scene-layout.js';

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
  let frames = 0;
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
    for (const id of ['table-8', 'player-camera', 'board-camera', 'hand-group', 'staged-chips', 'pot-chips', 'pot-value']) {
      const entry = scene.layout.entries.get(id), expected = savedScene.objects[id];
      assert.ok(entry && expected, `${id} exists in the scene and editor save`);
      for (const key of ['position', 'rotation', 'scale']) {
        entry.proxy[key].toArray().slice(0, 3).forEach((value, axis) => assert.ok(Math.abs(value - expected[key][axis]) < 1e-8, `${id}.${key}[${axis}]`));
      }
      if (expected.camera) assert.equal(entry.node.fov, expected.camera.fov);
    }
    assert.equal(scene.ready, undefined, 'no second asynchronous scene initialization');
    scene.controls?.dispose(); scene.resizeObserver.disconnect();
  }
  assert.equal(frames, 2, 'one initial frame is scheduled for each already initialized scene');
});
