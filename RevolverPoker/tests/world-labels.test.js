import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import * as THREE from 'three';

registerHooks({ resolve(specifier, context, next) {
  if (specifier === '/vendor/three.js') return next('three', context);
  return next(specifier, context);
} });
const { WorldLabelLayer } = await import('../client/world-labels.js');

function surface(t) {
  const previous = globalThis.document;
  const element = () => ({ style: {}, children: [], setAttribute() {}, appendChild(child) { this.children.push(child); } });
  globalThis.document = { createElement: element }; t.after(() => { globalThis.document = previous; });
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(60, .5, .1, 50);
  camera.position.set(0, 2, 5); camera.lookAt(0, 2, 0); scene.add(camera);
  const parent = new THREE.Group(), sprite = new THREE.Sprite(new THREE.SpriteMaterial({ opacity: .65 }));
  sprite.position.set(0, 2, 0); sprite.center.set(.5, 0); sprite.scale.set(1, .5, 1); parent.add(sprite); scene.add(parent);
  const canvas = { width: 512, height: 240, style: {} }, label = { sprite, canvas };
  const layer = new WorldLabelLayer(element(), scene, camera, 3); layer.register(label);
  return { scene, camera, parent, sprite, canvas, label, layer };
}

test('head labels use native canvas resolution, follow their 3D anchors, and retain matching clickable sprites', t => {
  const s = surface(t); s.layer.update(0, 400, 800);
  assert.equal(s.canvas.hidden, false); assert.equal(s.canvas.width, 512); assert.equal(s.canvas.height, 240);
  assert.equal(s.canvas.style.opacity, '0.65');
  const fartherDepth = Number(s.canvas.style.zIndex);
  s.parent.position.z = 1; s.layer.update(20, 400, 800);
  assert.ok(Number(s.canvas.style.zIndex) > fartherDepth, 'closer overlapping labels draw above farther labels');
  s.parent.position.z = 0; s.layer.update(30, 400, 800);
  assert.ok(parseFloat(s.canvas.style.width) > 130 && parseFloat(s.canvas.style.width) < 140);
  assert.equal(s.camera.layers.test(s.sprite.layers), false, 'the low-resolution 3D pass does not redraw labels');
  const transform = s.canvas.style.transform;
  s.parent.position.x = 1; s.layer.update(50, 400, 800); assert.notEqual(s.canvas.style.transform, transform);
  const center = s.sprite.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, .25, 0)).project(s.camera);
  const ray = new THREE.Raycaster(); ray.layers.enable(1); ray.setFromCamera(new THREE.Vector2(center.x, center.y), s.camera);
  assert.ok(ray.intersectObject(s.sprite).length > 0, 'world-space label touch bounds remain available');
  s.sprite.visible = false; s.layer.update(70, 400, 800); assert.equal(s.canvas.hidden, true);
  s.sprite.visible = true; s.parent.position.x = 100; s.layer.update(90, 400, 800); assert.equal(s.canvas.hidden, true);
});

test('opaque furniture occludes native labels with cached checks, while translucent props do not hide them', t => {
  const s = surface(t), blocker = new THREE.Mesh(new THREE.BoxGeometry(2, 2, .2), new THREE.MeshBasicMaterial());
  blocker.position.set(0, 2.125, 2.5); s.scene.add(blocker); s.scene.updateMatrixWorld(true);
  s.layer.update(0, 400, 800); assert.equal(s.canvas.hidden, true);
  s.scene.remove(blocker); s.layer.update(100, 400, 800); assert.equal(s.canvas.hidden, true, 'occlusion checks are bounded to 5 Hz');
  s.layer.update(210, 400, 800); assert.equal(s.canvas.hidden, false);
  blocker.material.transparent = true; blocker.material.opacity = .2; s.scene.add(blocker);
  s.layer.invalidate(); s.layer.update(220, 400, 800); assert.equal(s.canvas.hidden, false);
  blocker.material.transparent = false; s.layer.invalidate(); s.layer.update(230, 400, 800); assert.equal(s.canvas.hidden, true);
  blocker.geometry.dispose(); blocker.material.dispose();
});
