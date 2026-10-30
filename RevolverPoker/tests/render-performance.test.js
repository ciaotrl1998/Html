import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import * as THREE from 'three';
import { FrameClock } from '../client/frame-clock.js';

registerHooks({ resolve(specifier, context, next) {
  if (specifier === '/vendor/three.js') return next('three', context);
  return next(specifier, context);
} });
const { batchStaticMeshes } = await import('../client/mesh-batching.js');

test('30/60 FPS pacing holds its target on 60/90/120/144 Hz displays despite RAF timestamp jitter', () => {
  for (const hz of [60, 90, 120, 144]) for (const fps of [30, 60]) {
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
