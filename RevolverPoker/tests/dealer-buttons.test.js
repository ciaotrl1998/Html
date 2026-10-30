import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { registerHooks } from 'node:module';
import * as THREE from 'three';
import { EMPTY_LAYOUT, parseLayoutModule } from '../shared/scene-layout.js';

registerHooks({ resolve(specifier, context, next) {
  if (specifier === '/vendor/three.js') return next('three', context);
  if (specifier === '/shared/scene-layout.js') return next(new URL('../shared/scene-layout.js', import.meta.url).href, context);
  return next(specifier, context);
} });
const { LayoutRegistry } = await import('../client/layout-registry.js');
const { DealerButtons } = await import('../client/dealer-buttons.js');
const { SaloonScene } = await import('../client/scene.js');
const { TableCards, TABLE_POSITIONS } = await import('../client/cards.js');
const { createPlayerCamera, copyPlayerCamera } = await import('../client/player-camera.js');
const closeMatrix = (a, b) => a.elements.forEach((value, index) => assert.ok(Math.abs(value - b.elements[index]) < 1e-7));

function registerScene(game) {
  const nodes = []; game.scene.traverse(node => { if (node.userData.layout) nodes.push(node); });
  game.layout = new LayoutRegistry();
  for (const node of nodes) { const { id, label, category } = node.userData.layout; game.layout.register(node, id, label, category); }
  game.layout.onApply = () => game.dealerButtons.applyLayout(game.layout.current, game.layout);
  game.layout.apply(EMPTY_LAYOUT);
}
function fixture(editor = false) {
  const scene = new THREE.Scene(), original = new THREE.Mesh(new THREE.CylinderGeometry(.16, .16, .06, 24), new THREE.MeshStandardMaterial());
  original.position.set(1.4, 1.65, 1); original.userData.layout = { id: 'table-9', label: '庄家按钮', category: '牌桌与道具' }; scene.add(original);
  const game = { scene, editor }; game.dealerButtons = new DealerButtons(game, original); registerScene(game);
  return game;
}

test('each dealer position is editable, including own first-person view; only the real dealer is shown during a game', () => {
  const editor = fixture(true), own = editor.layout.entries.get('dealer-button-0');
  assert.equal(editor.dealerButtons.original.visible, false); assert.ok(editor.dealerButtons.original.userData.editorHidden);
  assert.ok(own.label.includes('自己') && own.label.includes('第一人称')); assert.equal(editor.dealerButtons.buttons.filter(button => button.visible).length, 8);
  own.proxy.position.set(-.5, 1.61, 3.1); own.proxy.rotation.set(.1, .4, .2); own.proxy.scale.setScalar(1.4); editor.layout.sync(own);
  const other = editor.layout.entries.get('dealer-button-1'); other.proxy.position.set(-1.6, 1.62, 2.4); editor.layout.sync(other);
  const saved = editor.layout.export(), game = fixture(); game.layout.apply(saved);
  const buttons = game.dealerButtons.buttons;
  game.dealerButtons.update(6, 6); game.scene.updateMatrixWorld(true);
  assert.deepEqual(buttons.map(button => button.visible), [true, false, false, false, false, false, false, false]);
  closeMatrix(buttons[0].matrixWorld, own.proxy.matrix);
  game.dealerButtons.update(7, 6); game.scene.updateMatrixWorld(true); closeMatrix(buttons[1].matrixWorld, other.proxy.matrix);
  assert.equal(buttons[0].visible, false); assert.equal(buttons[1].visible, true);
  for (let index = 0; index < 8; index++) {
    game.dealerButtons.update((index + 3) % 8, 3);
    assert.equal(buttons.filter(button => button.visible).length, 1); assert.equal(buttons[index].visible, true);
  }
  game.dealerButtons.update(null, 0); assert.ok(buttons.every(button => !button.visible));
  game.scene.updateMatrixWorld(true); closeMatrix(buttons[0].matrixWorld, own.proxy.matrix);
  assert.deepEqual(game.layout.export(), saved);
});

test('legacy dealer edits are preserved without double offsets, while individual edits, reloads and resets remain independent', () => {
  const game = fixture(), original = game.layout.entries.get('table-9');
  const legacy = { position: [1.64, 1.7, 1.1], rotation: [.1, .3, -.05], scale: [1.2, .9, 1.1] };
  game.layout.apply({ version: 1, objects: { 'table-9': legacy } }); game.scene.updateMatrixWorld(true);
  const own = game.layout.entries.get('dealer-button-0'), expected = original.wrapper.matrix.clone().multiply(game.dealerButtons.buttons[0].userData.dealerBase);
  closeMatrix(game.dealerButtons.buttons[0].matrixWorld, expected);
  own.proxy.position.set(-.6, 1.62, 3.2); game.layout.sync(own);
  const saved = game.layout.export(); assert.deepEqual(saved.objects['table-9'], legacy); assert.ok(saved.objects['dealer-button-0']);
  assert.equal(Object.keys(saved.objects).length, 2, 'unchanged seats inherit the old layout without duplicating offsets');
  const reloaded = fixture(); reloaded.layout.apply(saved); reloaded.layout.apply(saved); reloaded.scene.updateMatrixWorld(true);
  game.scene.updateMatrixWorld(true);
  game.dealerButtons.buttons.forEach((button, index) => closeMatrix(button.matrixWorld, reloaded.dealerButtons.buttons[index].matrixWorld));
  game.layout.reset(own); game.scene.updateMatrixWorld(true); closeMatrix(game.dealerButtons.buttons[0].matrixWorld, expected);
  assert.equal(game.layout.export().objects['dealer-button-0'], undefined);
  game.layout.apply(EMPTY_LAYOUT); game.scene.updateMatrixWorld(true);
  for (const button of game.dealerButtons.buttons) closeMatrix(button.matrixWorld, button.userData.dealerBase);
});

test('own dealer marker is visible and selectable from the saved portrait player camera', async t => {
  const previous = globalThis.document;
  const ctx = new Proxy({ createLinearGradient: () => ({ addColorStop() {} }) }, { get: (target, key) => key in target ? target[key] : () => {} });
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) }; t.after(() => { globalThis.document = previous; });
  const game = Object.create(SaloonScene.prototype);
  Object.assign(game, { scene: new THREE.Scene(), editor: false, camera: new THREE.PerspectiveCamera(74, 390 / 844, .1, 80),
    wood: new THREE.MeshStandardMaterial(), darkWood: new THREE.MeshStandardMaterial(), brass: new THREE.MeshStandardMaterial() });
  game.buildTable(); game.tagEditables(0, 'table', '牌桌与道具'); game.dealerButtons = new DealerButtons(game, game.dealer);
  game.buildHands(); game.hands.visible = true; game.hands.userData.layout = { id: 'player-hands', label: '双臂', category: '玩家与座位' };
  game.cards = new TableCards(game.scene, { animate: false }); game.playerCamera = createPlayerCamera(); game.scene.add(game.playerCamera);
  registerScene(game); game.layout.apply(parseLayoutModule(await readFile(new URL('../client/scene-layout.js', import.meta.url), 'utf8')));
  game.cards.update({ code: 'TEST', hand: { number: 1, players: [{ id: 'me', seat: 0, cards: [12, 11], chips: 2000 }], board: [] } }, 'me', TABLE_POSITIONS, 0);
  game.dealerButtons.update(0, 0); copyPlayerCamera(game.camera, game.playerCamera); game.scene.updateMatrixWorld(true);
  const marker = game.dealerButtons.buttons[0], point = marker.getWorldPosition(new THREE.Vector3()); point.y += .03;
  const projected = point.clone().project(game.camera);
  assert.ok(Math.abs(projected.x) < 1 && Math.abs(projected.y) < 1 && Math.abs(projected.z) < 1, 'own dealer must fit the first-person viewport');
  const ray = new THREE.Raycaster(); ray.setFromCamera(new THREE.Vector2(projected.x, projected.y), game.camera);
  const hit = ray.intersectObjects(game.scene.children, true).find(({ object }) => {
    for (let node = object; node; node = node.parent) if (!node.visible) return false;
    return object.isMesh;
  });
  assert.equal(hit?.object.parent, marker, 'the dealer marker must not be hidden behind arms, cards or table props');
});
