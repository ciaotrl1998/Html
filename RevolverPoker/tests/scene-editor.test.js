import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { registerHooks } from 'node:module';
import * as THREE from 'three';
import { RenderBudget } from '../client/render-budget.js';
import { createPokerServer } from '../server/index.js';
import { EMPTY_LAYOUT, validateLayout, parseLayoutModule } from '../shared/scene-layout.js';

registerHooks({ resolve(specifier, context, next) {
  if (specifier === '/vendor/three.js') return next('three', context);
  if (specifier === '/shared/scene-layout.js') return next(new URL('../shared/scene-layout.js', import.meta.url).href, context);
  return next(specifier, context);
} });
const { LayoutRegistry } = await import('../client/layout-registry.js');
const { createPlayerCamera, createBoardCamera, playerCameraPose, copyPlayerCamera } = await import('../client/player-camera.js');
const { SaloonScene } = await import('../client/scene.js');
const { EditorCameraPreview } = await import('../client/editor-camera.js');
const { settlementLabel } = await import('../client/settlement-label.js');
const { BoardPresentation } = await import('../client/board-presentation.js');
const { SceneViewControls } = await import('../client/view-controls.js');
const close = (a, b) => assert.ok(a.distanceTo(b) < 1e-7, `${a.toArray()} != ${b.toArray()}`);
const transform = (position = [1, 2, 3], rotation = [0, 0, 0], scale = [1, 1, 1]) => ({ position, rotation, scale });

test('static layout delivery does not depend on the running server understanding future configuration fields', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'revolver-layout-static-')), layoutFile = path.join(directory, 'scene-layout.js');
  const app = createPokerServer({ layoutFile }); await new Promise(r => app.server.listen(0, '127.0.0.1', r));
  t.after(async () => { await app.close(); await rm(directory, { recursive: true, force: true }); });
  const source = 'export default {"version":2,"objects":{},"futureCameras":[]};\n';
  await writeFile(layoutFile, source, 'utf8');
  const base = `http://127.0.0.1:${app.server.address().port}`;
  for (const route of ['/client/scene-layout.js', '/client//scene-layout.js']) {
    const response = await fetch(`${base}${route}`); assert.equal(response.status, 200); assert.equal(await response.text(), source);
  }
  await rm(layoutFile);
  assert.equal((await fetch(`${base}/client/scene-layout.js`)).status, 404, 'a missing scene cannot silently become the prototype layout');
});

test('saved transforms survive animation and state updates, with nested edits and true default reset', () => {
  const scene = new THREE.Scene(), registry = new LayoutRegistry();
  const body = new THREE.Group(); body.position.set(3, 0, 2); scene.add(body);
  const card = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()); card.position.set(1, 2, 0); body.add(card);
  registry.register(body, 'person-1', '人物', '人物'); registry.register(card, 'card-1', '牌', '牌');
  registry.apply({ version: 1, objects: { 'person-1': transform([6, 0, 2]), 'card-1': transform([2, 2, 0]) } });
  scene.updateMatrixWorld(true); close(card.getWorldPosition(new THREE.Vector3()), new THREE.Vector3(8, 2, 2));
  // Animation changes the original node while the editor delta remains outside it.
  body.position.y = .1; card.position.set(1, 3, 0); scene.updateMatrixWorld(true);
  close(card.getWorldPosition(new THREE.Vector3()), new THREE.Vector3(8, 3.1, 2));
  registry.apply(EMPTY_LAYOUT); scene.updateMatrixWorld(true);
  close(card.getWorldPosition(new THREE.Vector3()), new THREE.Vector3(4, 3.1, 2));
  assert.deepEqual(registry.export(), EMPTY_LAYOUT);
});

test('rotated and scaled objects preserve their pivot and round-trip saved edits', () => {
  const scene = new THREE.Scene(), registry = new LayoutRegistry();
  const node = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  node.position.set(2, 3, 4); node.rotation.set(.3, .5, -.2); node.scale.set(2, 1, .7); scene.add(node);
  const entry = registry.register(node, 'prop-1', '道具', '道具');
  entry.proxy.position.set(4, 6, 8); entry.proxy.rotation.set(.8, -.2, .6); entry.proxy.scale.set(3, 2, 1.5); registry.sync(entry);
  scene.updateMatrixWorld(true); const expected = entry.proxy.matrixWorld.clone();
  node.matrixWorld.elements.forEach((value, i) => assert.ok(Math.abs(value - expected.elements[i]) < 1e-7));
  const saved = registry.export(); registry.apply(EMPTY_LAYOUT); registry.apply(saved); scene.updateMatrixWorld(true);
  node.matrixWorld.elements.forEach((value, i) => assert.ok(Math.abs(value - expected.elements[i]) < 1e-7));
});

test('scene configuration rejects executable content, invalid transforms and hostile keys', () => {
  for (const bad of [null, { version: 2, objects: {} }, { version: 1, objects: { 'prop-1': transform([NaN, 0, 0]) } }, { version: 1, objects: { 'prop-1': transform([0, 0, 0], [0, 0, 0], [0, 1, 1]) } }, JSON.parse('{"version":1,"objects":{"__proto__":{}}}')]) assert.throws(() => validateLayout(bad));
  assert.throws(() => parseLayoutModule('export default (() => alert(1))();'));
  assert.throws(() => parseLayoutModule('export default {"version":1,"objects":{}}; alert(1);'));
});

test('player camera transforms and lens persist, preview matches game pose including roll, and reset restores defaults', () => {
  const scene = new THREE.Scene(), registry = new LayoutRegistry(), camera = createPlayerCamera(); scene.add(camera);
  const entry = registry.register(camera, 'player-camera', '摄像机', '摄像机');
  const expected = new THREE.PerspectiveCamera(58, .5, .04, 150); expected.position.set(.4, 3.5, 5.8); expected.rotation.set(-.3, .25, .1);
  const layout = { version: 1, objects: { 'player-camera': { ...transform(expected.position.toArray(), expected.rotation.toArray().slice(0, 3)), camera: { fov: 58, near: .04, far: 150 } } } };
  registry.apply(validateLayout(layout)); const pose = playerCameraPose(camera);
  close(pose.position, expected.position); assert.ok(pose.quaternion.angleTo(expected.quaternion) < 1e-7);
  const game = new THREE.PerspectiveCamera(), preview = new THREE.PerspectiveCamera();
  copyPlayerCamera(game, camera, .5); copyPlayerCamera(preview, camera, .5);
  close(game.position, preview.position); assert.ok(game.quaternion.angleTo(preview.quaternion) < 1e-7);
  assert.deepEqual(game.projectionMatrix.elements, preview.projectionMatrix.elements);
  const reconstructed = new THREE.Quaternion().setFromEuler(new THREE.Euler(pose.pitch, pose.yaw, pose.roll, 'YXZ'));
  assert.ok(reconstructed.angleTo(expected.quaternion) < 1e-7);
  assert.deepEqual(registry.export().objects['player-camera'].camera, layout.objects['player-camera'].camera);
  const persisted = parseLayoutModule(`export default ${JSON.stringify(registry.export())};`);
  registry.reset(entry); assert.equal(camera.fov, 70); assert.equal(camera.near, .1); assert.equal(camera.far, 80);
  close(playerCameraPose(camera).position, new THREE.Vector3(0, 3.22, 5.35));
  registry.apply(persisted); assert.equal(camera.fov, 58); registry.apply(EMPTY_LAYOUT); assert.deepEqual(registry.export(), EMPTY_LAYOUT);
});

test('invalid camera lenses cannot be saved and earlier object-only layouts remain valid', () => {
  assert.deepEqual(validateLayout(EMPTY_LAYOUT), EMPTY_LAYOUT);
  for (const camera of [{ fov: 0, near: .1, far: 80 }, { fov: 70, near: 2, far: 1 }, { fov: 70, near: .1, far: Infinity }, { fov: 70, near: .001, far: 80 }]) assert.throws(() => validateLayout({ version: 1, objects: { 'player-camera': { ...transform(), camera } } }));
  assert.throws(() => validateLayout({ version: 1, objects: { 'prop-1': { ...transform(), camera: { fov: 70, near: .1, far: 80 } } } }));
});

test('pinned camera preview stays visible across selection changes and switches between both cameras', () => {
  const world = new THREE.Scene(), playerCamera = createPlayerCamera(), boardCamera = createBoardCamera();
  world.add(playerCamera, boardCamera); boardCamera.fov = 64;
  const saloon = { scene: world, playerCamera, boardCamera, camera: new THREE.PerspectiveCamera(), container: { clientHeight: 800 } };
  saloon.camera.position.set(8, 7, 10);
  const panel = { style: {}, hidden: true }, frame = { style: {} };
  const preview = new EditorCameraPreview(saloon, panel, frame);
  preview.update(null, null, true, 'player-camera'); assert.equal(panel.hidden, false); assert.equal(preview.preview.fov, 70);
  preview.update('table-0', null, true, 'player-camera'); assert.equal(panel.hidden, false);
  preview.update('board-camera', null, false, 'board-camera'); assert.equal(panel.hidden, true);
  preview.update(null, null, true, 'board-camera'); assert.equal(panel.hidden, false); assert.equal(preview.preview.fov, 64);
  assert.equal(preview.camera, boardCamera);
});

test('board reference camera remains editable while both hold actions leave the current camera untouched', () => {
  const world = new THREE.Scene(), group = new THREE.Group(), player = createPlayerCamera(), board = createBoardCamera(), anchor = new THREE.Object3D();
  world.add(group, player); group.add(board, anchor);
  group.userData.layoutBase = transform([0, 1.573, .65]);
  const registry = new LayoutRegistry(); registry.register(group, 'board-group', '公共牌', '牌'); registry.register(board, 'board-camera', '公共牌摄像机', '摄像机'); registry.register(player, 'player-camera', '玩家摄像机', '摄像机');
  registry.apply({ version: 1, objects: { 'board-group': transform([0, 1.573, 1.65]), 'board-camera': { ...transform([.2, 5.2, 3.5], [-1, .15, .1]), camera: { fov: 63, near: .05, far: 140 } } } });
  close(playerCameraPose(board).position, new THREE.Vector3(.2, 5.2, 4.5)); assert.equal(player.fov, 70);
  assert.equal(registry.export().objects['board-camera'].camera.fov, 63);
  const game = Object.assign(Object.create(SaloonScene.prototype), { renderBudget: new RenderBudget(), pixelRatio: 1 });
  const eye = new THREE.PerspectiveCamera(61, .5, .07, 135); eye.position.set(.5, 3.8, 5.1); eye.rotation.set(-.4, .2, .1); eye.updateProjectionMatrix();
  let raised = false, flipped = false;
  Object.assign(game, { scene: world, camera: eye, playerCamera: player, boardCamera: board, yaw: .2, pitch: -.4, roll: .1, seated: true, editor: false, viewerId: 'me',
    room: { code: '123456', phase: 'playing', hand: { number: 1, board: [0, 18, 28], players: [{ id: 'me', folded: false }] } }, cards: { setPeeking(value) { flipped = value; }, setBoardPeeking(value) { raised = value; } },
    container: { getBoundingClientRect: () => ({ width: 390, height: 844 }) }, renderer: { setSize() {}, setPixelRatio() {}, domElement: { setAttribute() {} } } });
  const view = () => JSON.stringify([eye.position.toArray(), eye.quaternion.toArray(), eye.projectionMatrix.toArray(), eye.fov, eye.near, eye.far, game.yaw, game.pitch, game.roll]);
  const before = view();
  assert.equal(game.beginCardPeek('board'), true);
  assert.equal(raised, true); assert.equal(flipped, false); assert.equal(view(), before); assert.equal(game.viewTransition, null);
  game.endCardPeek(); assert.equal(raised, false); assert.equal(view(), before);
  assert.equal(game.beginCardPeek('hand'), true); assert.equal(flipped, true); assert.equal(raised, false); assert.equal(view(), before);
  game.endCardPeek(); assert.equal(flipped, false); assert.equal(view(), before);
});

test('standing public cards follow camera orientation through edited parents and restore exact saved transforms', () => {
  const world = new THREE.Scene(), parent = new THREE.Group(), registry = new LayoutRegistry();
  parent.position.set(.3, .2, -.1); parent.rotation.set(.08, .2, -.05); parent.scale.set(1.2, .9, 1.1); world.add(parent);
  const cards = Array.from({ length: 5 }, (_, i) => {
    const root = new THREE.Group(), display = new THREE.Group(); display.matrixAutoUpdate = false;
    root.position.set((i - 2) * .56, 1.573, .65); root.rotation.set(-Math.PI / 2, 0, i * .006);
    display.add(new THREE.Mesh(new THREE.BoxGeometry(.5, .73, .014), new THREE.MeshBasicMaterial())); root.add(display); parent.add(root);
    registry.register(root, `board-card-${i}`, `牌 ${i}`, '牌'); return { root, display };
  });
  const entry = registry.entries.get('board-card-0'); entry.proxy.position.x += .12; entry.proxy.rotation.z += .15; entry.proxy.scale.x = 1.15; registry.sync(entry);
  const saved = registry.export(), camera = new THREE.PerspectiveCamera(); camera.position.set(.5, 3.5, 5); camera.rotation.set(-.5, .2, .1); world.add(camera);
  world.updateMatrixWorld(true);
  const original = cards.map(card => ({ matrix: card.display.matrixWorld.clone(), root: card.root.matrix.clone(), floor: new THREE.Box3().setFromObject(card.display).min.y }));
  const presentation = new BoardPresentation(cards); presentation.setRaised(true, 0); presentation.tick(240, camera); world.updateMatrixWorld(true);
  for (let i = 0; i < cards.length; i++) {
    assert.ok(cards[i].display.getWorldQuaternion(new THREE.Quaternion()).angleTo(camera.quaternion) < 1e-7);
    assert.ok(new THREE.Box3().setFromObject(cards[i].display).min.y >= original[i].floor - 1e-8);
    assert.deepEqual(cards[i].root.matrix.toArray(), original[i].root.toArray());
  }
  camera.position.set(-1, 4, 5.5); camera.rotation.set(-.35, -.3, -.1); presentation.tick(500, camera); world.updateMatrixWorld(true);
  assert.ok(cards[2].display.getWorldQuaternion(new THREE.Quaternion()).angleTo(camera.quaternion) < 1e-7);
  assert.deepEqual(registry.export(), saved);
  presentation.setRaised(false, 500); presentation.tick(740, camera); world.updateMatrixWorld(true);
  for (let i = 0; i < cards.length; i++) cards[i].display.matrixWorld.elements.forEach((value, j) => assert.ok(Math.abs(value - original[i].matrix.elements[j]) < 1e-8));
  assert.equal(presentation.progress, 0); assert.deepEqual(registry.export(), saved);
});

test('quick release and new-hand reset never leave public cards standing or alter the underlying card pose', () => {
  const world = new THREE.Scene(), root = new THREE.Group(), display = new THREE.Group(), camera = new THREE.PerspectiveCamera();
  display.matrixAutoUpdate = false; root.add(display); world.add(root, camera); root.position.set(0, 1.573, .65); root.rotation.x = -Math.PI / 2; camera.rotation.x = -.5;
  const presentation = new BoardPresentation([{ root, display }]);
  presentation.setRaised(true, 0); presentation.tick(100, camera); const halfway = display.matrix.clone();
  presentation.setRaised(false, 100); presentation.tick(100, camera); assert.deepEqual(display.matrix.toArray(), halfway.toArray());
  presentation.tick(340, camera); assert.equal(presentation.progress, 0); assert.ok(display.matrix.equals(new THREE.Matrix4()));
  presentation.setRaised(true, 400); presentation.tick(640, camera); presentation.reset();
  assert.equal(presentation.progress, 0); assert.ok(display.matrix.equals(new THREE.Matrix4())); assert.equal(root.rotation.x, -Math.PI / 2);
});

test('five standing cards fit a portrait viewport without moving or changing the camera', () => {
  const world = new THREE.Scene(), camera = new THREE.PerspectiveCamera(74, 390 / 844, .1, 80);
  camera.position.set(0, 3.567, 4.704); camera.rotation.x = -.626; world.add(camera);
  const cards = Array.from({ length: 5 }, (_, i) => {
    const root = new THREE.Group(), display = new THREE.Group(); display.matrixAutoUpdate = false;
    root.position.set((i - 2) * .56, 1.573, 1.378); root.rotation.x = -Math.PI / 2; root.add(display); world.add(root); return { root, display };
  });
  const before = camera.position.toArray(); const presentation = new BoardPresentation(cards); presentation.setRaised(true, 0); presentation.tick(240, camera); world.updateMatrixWorld(true);
  for (const card of cards) for (const x of [-.25, .25]) for (const y of [-.365, .365]) {
    const point = new THREE.Vector3(x, y, 0).applyMatrix4(card.display.matrixWorld).project(camera);
    assert.ok(point.x >= -.94 && point.x <= .94, `card clipped at ${point.x}`);
  }
  assert.deepEqual(camera.position.toArray(), before); assert.equal(camera.fov, 74);
});

test('settlement nameplates expose only public hole cards and the best final hand name', () => {
  const hand = { done: true, result: { showdown: true }, board: [0, 18, 28, 49, 38] };
  const player = { cards: [25, 43], name: 'PRIVATE NAME', chips: 1234, folded: false };
  assert.deepEqual(settlementLabel(hand, player), { cards: [25, 43], handName: '一对' });
  assert.deepEqual(settlementLabel({ ...hand, board: [8, 9, 10, 11, 12] }, player), { cards: [25, 43], handName: '皇家同花顺' });
  assert.deepEqual(settlementLabel(hand, { ...player, folded: true }), { cards: [null, null], handName: '已弃牌' });
  assert.deepEqual(settlementLabel(hand, { ...player, cards: [null, null] }), { cards: [null, null], handName: '未公开' });
  assert.deepEqual(settlementLabel({ ...hand, result: { showdown: false } }, player), { cards: [null, null], handName: '未摊牌' });
  assert.equal(settlementLabel({ ...hand, done: false }, player), null);
  assert.equal(settlementLabel(hand, undefined), null);
});

test('winner nameplates replace GPU textures on resize and restore normal labels without stale images', () => {
  const ctx = new Proxy({ measureText: () => ({ width: 60 }) }, { get(target, key) { return key in target ? target[key] : () => {}; } });
  const canvas = { width: 512, height: 240, getContext: () => ctx };
  const initialMap = new THREE.CanvasTexture(canvas); initialMap.colorSpace = THREE.SRGBColorSpace;
  const label = { canvas, map: initialMap, sprite: new THREE.Sprite(new THREE.SpriteMaterial({ map: initialMap, opacity: .5 })), key: '' };
  let initialDisposed = 0; initialMap.addEventListener('dispose', () => initialDisposed++);
  const game = Object.assign(Object.create(SaloonScene.prototype), { renderBudget: new RenderBudget(), pixelRatio: 1 });
  const winner = { settlement: { cards: [25, 43], handName: '一对', winner: true } };
  const normal = { name: '玩家', seat: 0, value: '2000', action: '', badges: '' };
  game.paintSeatLabel(label, normal); assert.equal(label.map, initialMap);
  game.paintSeatLabel(label, winner);
  assert.equal(canvas.height, 350); assert.ok(label.map.version > 0); assert.equal(label.sprite.material.opacity, 1);
  assert.notEqual(label.map, initialMap, 'a taller WIN label needs a new GPU texture');
  assert.notEqual(label.map.source, initialMap.source, 'the resized image needs fresh texture storage');
  assert.equal(label.sprite.material.map, label.map); assert.equal(label.map.colorSpace, THREE.SRGBColorSpace);
  assert.equal(initialDisposed, 1);
  const winningMap = label.map, winningVersion = winningMap.version;
  game.paintSeatLabel(label, winner);
  assert.equal(label.map, winningMap); assert.equal(label.map.version, winningVersion, 'unchanged labels reuse their texture');
  const winningScale = label.sprite.scale.clone(), animationStart = label.winPulse.start;
  game.animateSeatLabel(label, animationStart + 500);
  assert.equal(label.map, winningMap); assert.ok(label.map.version > winningVersion);
  assert.equal(canvas.height, 350); close(label.sprite.scale, winningScale, 'only WIN text pulses, not the entire label');
  assert.equal(label.winPulse.start, animationStart);
  let winningDisposed = 0; winningMap.addEventListener('dispose', () => winningDisposed++);
  game.paintSeatLabel(label, normal);
  assert.equal(canvas.height, 240);
  assert.notEqual(label.map, winningMap); assert.equal(winningDisposed, 1);
  assert.equal(label.sprite.material.map, label.map);
  const normalMap = label.map;
  const normalVersion = normalMap.version;
  assert.equal(label.winPulse, null); game.animateSeatLabel(label, animationStart + 1500);
  assert.equal(normalMap.version, normalVersion, 'next-hand labels stop the WIN animation');
  game.paintSeatLabel(label, { settlement: { cards: [25, 43], handName: '一对' } });
  assert.equal(canvas.height, 240); assert.equal(label.map, normalMap, 'same-size card changes only repaint');
  let replacementDisposals = 0;
  for (let i = 0; i < 6; i++) {
    for (const state of [winner, normal]) {
      const before = label.map;
      before.addEventListener('dispose', () => replacementDisposals++);
      game.paintSeatLabel(label, state);
      assert.notEqual(label.map, before); assert.equal(label.sprite.material.map, label.map);
    }
  }
  assert.equal(replacementDisposals, 12, 'repeated hands release every replaced GPU texture');
  label.map.dispose(); label.sprite.material.dispose();
});

test('game reset and viewport resize use the edited player camera; releasing hole cards retains that view', () => {
  const world = new THREE.Scene(), source = createPlayerCamera(), registry = new LayoutRegistry(); world.add(source);
  registry.register(source, 'player-camera', '摄像机', '摄像机');
  registry.apply({ version: 1, objects: { 'player-camera': { ...transform([.3, 3.6, 5.2], [-.25, .3, .15]), camera: { fov: 61, near: .05, far: 160 } } } });
  let covered = false;
  const game = Object.assign(Object.create(SaloonScene.prototype), { renderBudget: new RenderBudget(), pixelRatio: 1 });
  Object.assign(game, { playerCamera: source, camera: new THREE.PerspectiveCamera(), seated: true, editor: false, room: { phase: 'playing' },
    cards: { setPeeking(value) { covered = !value; }, setBoardPeeking() {} }, container: { getBoundingClientRect: () => ({ width: 390, height: 844 }) },
    renderer: { setSize() {}, setPixelRatio() {}, domElement: { setAttribute() {} } } });
  game.resetView(); const expected = playerCameraPose(source);
  close(game.camera.position, expected.position); assert.ok(game.camera.quaternion.angleTo(expected.quaternion) < 1e-7);
  assert.equal(game.camera.fov, 61); assert.equal(game.camera.near, .05); assert.equal(game.camera.far, 160);
  game.resize(); assert.equal(game.camera.fov, 61);
  game.pitch -= .2; game.yaw += .1; game.applyView();
  const position = game.camera.position.clone(), quaternion = game.camera.quaternion.clone();
  game.peekActive = true; game.inspectMode = 'hand'; game.viewTransition = {};
  game.endCardPeek(); assert.ok(covered); assert.equal(game.viewTransition, null);
  close(game.camera.position, position); assert.ok(game.camera.quaternion.angleTo(quaternion) < 1e-7);
});

function stateScene() {
  const game = Object.assign(Object.create(SaloonScene.prototype), { renderBudget: new RenderBudget(), pixelRatio: 1 }), world = new THREE.Scene();
  const models = Array.from({ length: 8 }, () => { const model = new THREE.Group(); model.userData.head = new THREE.Group(); model.add(model.userData.head); return model; });
  Object.assign(game, { scene: world, playerCamera: createPlayerCamera(), camera: new THREE.PerspectiveCamera(),
    seated: false, focus: 0, room: null, overviewPitch: -.58, editor: false, models,
    chairs: Array.from({ length: 8 }, () => new THREE.Group()), piles: Array.from({ length: 8 }, () => new THREE.Group()),
    markers: Array.from({ length: 8 }, () => new THREE.Group()), labels: Array.from({ length: 8 }, () => ({ sprite: new THREE.Sprite() })),
    hands: new THREE.Group(), dealer: new THREE.Group(), paintSeatLabel() {},
    cards: { setPeeking() {}, setBoardPeeking() {}, update(room, you, positions, focus) { game.cardFocus = focus; } },
    container: { getBoundingClientRect: () => ({ width: 390, height: 844 }) }, renderer: { setSize() {}, setPixelRatio() {}, domElement: { setAttribute() {} } } });
  return game;
}

test('taking a lobby seat keeps the overview and own avatar; starting enters first person and reset restores overview', () => {
  const game = stateScene();
  const seats = Array.from({ length: 8 }, (_, seat) => ({ seat, kind: 'open' }));
  let room = { code: '123456', hostId: 'me', seats, phase: 'lobby', hand: null };
  game.resetView(); game.update(room, 'me');
  const before = game.camera.position.clone(), rotation = game.camera.quaternion.clone(), fov = game.camera.fov;
  // Join a nonzero seat: neither the camera nor the table should rotate.
  room = { ...room, seats: seats.map(s => s.seat === 3 ? { ...s, kind: 'human', id: 'me', name: '玩家' } : s) };
  game.update(room, 'me');
  assert.equal(game.seated, true); assert.equal(game.firstPerson, false); assert.equal(game.focus, 0); assert.equal(game.cardFocus, 0);
  close(game.camera.position, before); assert.ok(game.camera.quaternion.angleTo(rotation) < 1e-7); assert.equal(game.camera.fov, fov);
  assert.equal(game.models[3].visible, true); assert.equal(game.hands.visible, false); assert.equal(game.labels[3].sprite.visible, true);
  game.resize(); assert.equal(game.camera.fov, fov);
  game.update({ ...room, phase: 'playing' }, 'me');
  assert.equal(game.firstPerson, true); assert.equal(game.focus, 3); assert.equal(game.cardFocus, 3);
  close(game.camera.position, playerCameraPose(game.playerCamera).position);
  assert.equal(game.models[0].visible, false); assert.equal(game.hands.visible, true);
  // Ordinary state updates do not reset the player's look direction.
  game.yaw += .4; game.pitch -= .2; game.applyView(); const turned = game.camera.quaternion.clone();
  game.update({ ...room, phase: 'playing' }, 'me'); assert.ok(game.camera.quaternion.angleTo(turned) < 1e-7);
  game.update({ ...room, phase: 'finished' }, 'me'); assert.equal(game.firstPerson, true);
  game.update(room, 'me');
  assert.equal(game.firstPerson, false); assert.equal(game.focus, 0); assert.equal(game.models[3].visible, true);
  assert.equal(game.hands.visible, false); close(game.camera.position, before);
  game.update(null, 'me'); assert.equal(game.firstPerson, false);
});

test('own-card viewing is allowed during dealing and persists across street reveals, but folded hands cannot be viewed', () => {
  const game = stateScene(); let flipped = false;
  game.cards.setPeeking = value => { flipped = value; };
  const seats = Array.from({ length: 8 }, (_, seat) => ({ seat, id: seat ? `p${seat}` : 'me', name: `玩家${seat}`, kind: seat < 2 ? 'human' : 'open' }));
  const players = seats.slice(0, 2).map(seat => ({ ...seat, chips: 1000, folded: false, cards: seat.seat ? [null, null] : [12, 11] }));
  const room = { code: 'TEST', phase: 'playing', hostId: 'me', seats, dealing: true,
    hand: { number: 1, board: [0, 1, 2], players, actor: null, done: false } };
  game.update(room, 'me');
  assert.equal(game.beginCardPeek('board'), false, 'public-card inspection stays locked during its deal');
  assert.equal(game.beginCardPeek('hand'), true); assert.equal(flipped, true);
  const view = game.camera.quaternion.clone();
  const turn = { ...room, hand: { ...room.hand, board: [0, 1, 2, 3] } };
  game.update(turn, 'me');
  assert.equal(game.peekActive, true); assert.equal(flipped, true, 'a street reveal cannot close a held private hand');
  assert.ok(game.camera.quaternion.angleTo(view) < 1e-7);
  game.update({ ...turn, dealing: false }, 'me'); assert.equal(game.peekActive, true);
  game.endCardPeek(); assert.equal(game.peekActive, false); assert.equal(flipped, false);
  game.update(turn, 'me'); assert.equal(game.beginCardPeek('hand'), true);
  const folded = { ...turn, hand: { ...turn.hand, players: players.map(player => ({ ...player, folded: player.id === 'me' })) } };
  game.update(folded, 'me'); assert.equal(game.peekActive, false); assert.equal(flipped, false);
  assert.equal(game.beginCardPeek('hand'), false);
  game.update(turn, 'me'); assert.equal(game.beginCardPeek('hand'), true);
  game.update({ ...turn, hand: { ...turn.hand, number: 2 } }, 'me');
  assert.equal(game.peekActive, false); assert.equal(flipped, false, 'a new hand clears the old hold');
});

test('initial and subsequent deals smoothly return to the edited default pose using the normal one-second follow', () => {
  const game = stateScene();
  game.playerCamera.position.set(.3, 3.6, 5.2); game.playerCamera.rotation.set(-.38, .24, .12, 'YXZ');
  const pose = playerCameraPose(game.playerCamera);
  let time = 0;
  const doc = new EventTarget(); Object.assign(doc, { hidden: false, querySelector: () => null });
  game.controls = new SceneViewControls(game, new EventTarget(), doc, new EventTarget(), () => time);
  const seats = Array.from({ length: 8 }, (_, seat) => ({ seat, kind: seat === 3 || seat === 0 ? 'human' : 'open',
    id: seat === 3 ? 'me' : `p${seat}`, name: `玩家${seat}` }));
  const players = [0, 3].map(seat => ({ ...seats[seat], chips: 2000, cards: seat === 3 ? [12, 11] : [null, null] }));
  const lobby = { code: '123456', hostId: 'me', seats, phase: 'lobby', hand: null };
  game.update(lobby, 'me'); game.resetView();
  const overview = game.camera.position.clone(), rotation = game.camera.quaternion.clone();
  const room = { ...lobby, phase: 'playing', dealing: true, hand: { number: 1, board: [], players, actor: null, done: false } };
  game.update(room, 'me');
  close(game.camera.position, overview); assert.ok(game.camera.quaternion.angleTo(rotation) < 1e-7, 'entering the deal never snaps the camera');
  const target = game.getTurnLookTarget(); close(target.position, pose.position);
  assert.equal(target.yaw, pose.yaw); assert.equal(target.pitch, pose.pitch); assert.equal(target.roll, pose.roll);
  assert.equal(game.beginCardPeek('board'), false);
  let previousStep = 0;
  for (let i = 0; i < 40; i++) {
    const position = game.camera.position.clone(); time += 25; game.controls.tick(.025);
    const step = position.distanceTo(game.camera.position);
    if (i < 24) assert.ok(step > previousStep); else assert.ok(step < previousStep);
    previousStep = step;
  }
  close(game.camera.position, pose.position); assert.ok(game.camera.quaternion.angleTo(pose.quaternion) < 1e-7);
  game.update({ ...room, dealing: false, hand: { ...room.hand, actor: 0 } }, 'me');
  for (let i = 0; i < 40; i++) { time += 25; game.controls.tick(.025); }
  assert.ok(Math.abs(game.yaw - pose.yaw) > .01, 'the next actor can be followed after dealing ends');
  const opponent = game.camera.quaternion.clone();
  game.peekActive = true; game.inspectMode = 'hand';
  const nextHand = { ...room, hand: { ...room.hand, number: 2 } };
  game.update(nextHand, 'me');
  assert.ok(game.camera.quaternion.angleTo(opponent) < 1e-7, 'the next hand also starts from the current direction');
  assert.equal(game.cardPeekClosing, null, 'closing old cards cannot delay the return');
  assert.notEqual(game.getTurnLookTarget().key, target.key);
  for (let i = 0; i < 40; i++) { time += 25; game.controls.tick(.025); }
  assert.ok(game.camera.quaternion.angleTo(pose.quaternion) < 1e-7);
  game.yaw += .5; game.applyView(); const turned = game.camera.quaternion.clone();
  game.update({ ...nextHand, hand: { ...nextHand.hand, board: [0, 1, 2] } }, 'me');
  assert.ok(game.camera.quaternion.angleTo(turned) < 1e-7, 'community dealing does not snap either');
  for (let i = 0; i < 40; i++) { time += 25; game.controls.tick(.025); }
  assert.ok(game.camera.quaternion.angleTo(pose.quaternion) < 1e-7);
  game.controls.dispose();
});

test('turn aiming uses the acting seat and edited world-space character position without moving the camera', () => {
  const world = new THREE.Scene(), camera = new THREE.PerspectiveCamera(); camera.position.set(.3, 3.5, 5);
  const playerCamera = createPlayerCamera(); playerCamera.rotation.set(-.38, .24, .12, 'YXZ'); world.add(playerCamera);
  const parent = new THREE.Group(), model = new THREE.Group(), head = new THREE.Group();
  parent.position.set(2, 0, -2); parent.rotation.y = .3; parent.scale.setScalar(1.2);
  model.position.set(.5, .1, -1); head.position.set(0, 3.17, 0);
  model.userData = { seat: 6, head }; model.add(head); parent.add(model); world.add(parent, camera);
  const game = Object.assign(Object.create(SaloonScene.prototype), { renderBudget: new RenderBudget(), pixelRatio: 1 });
  Object.assign(game, { scene: world, camera, playerCamera, models: [model], seated: true, viewerId: 'me', editor: false,
    room: { phase: 'playing', hand: { actor: 6, done: false, players: [{ id: 'other', seat: 6 }, { id: 'me', seat: 3 }] } } });
  const position = camera.position.clone(), orientation = camera.quaternion.clone();
  const direction = head.getWorldPosition(new THREE.Vector3()); direction.y -= .35; direction.sub(position).normalize();
  const target = game.getTurnLookTarget();
  const forward = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(target.pitch, target.yaw, 0, 'YXZ'));
  close(forward, direction); close(camera.position, position); assert.ok(camera.quaternion.angleTo(orientation) < 1e-7);
  parent.position.x -= 1; assert.notEqual(game.getTurnLookTarget().yaw, target.yaw, 'layout changes update the aim target');
  game.room.hand.actor = 3;
  const ownTarget = game.getTurnLookTarget(), initialPose = playerCameraPose(playerCamera);
  assert.ok(Math.abs(ownTarget.yaw - initialPose.yaw) < 1e-10);
  assert.ok(Math.abs(ownTarget.pitch - initialPose.pitch) < 1e-10);
  assert.notEqual(ownTarget.key, target.key, 'own turn starts a fresh return to the initial camera pose');
  close(camera.position, position); assert.ok(camera.quaternion.angleTo(orientation) < 1e-7, 'target selection does not snap the camera');
  game.room.hand.actor = 6; game.room.hand.done = true; assert.equal(game.getTurnLookTarget(), null);
  game.room.hand.result = { showdown: false, pots: [{ awards: [{ id: 'me', amount: 30 }] }] };
  game.followOtherPlayers = false;
  close(game.getTurnLookTarget().position, initialPose.position, 'a fold winner returns to their own cards even with opponent follow disabled');
  game.room.hand.players.find(p => p.id === 'me').shown = true; assert.equal(game.getTurnLookTarget(), null);
  game.room.hand.done = false; game.room.phase = 'lobby'; assert.equal(game.getTurnLookTarget(), null);
  game.room.phase = 'finished'; assert.equal(game.getTurnLookTarget(), null);
  game.room.phase = 'playing'; game.editor = true; assert.equal(game.getTurnLookTarget(), null);
  game.editor = false; game.seated = false; assert.equal(game.getTurnLookTarget(), null, 'spectators stay in overview');
});

test('disabling opponent follow stops an active pan but preserves own-turn and dealing returns', () => {
  const world = new THREE.Scene(), playerCamera = createPlayerCamera(), camera = new THREE.PerspectiveCamera();
  world.add(playerCamera, camera);
  const model = new THREE.Group(), head = new THREE.Group(); model.position.set(3, 0, -2); head.position.y = 3.2;
  model.userData = { seat: 1, head }; model.add(head); world.add(model);
  const pose = playerCameraPose(playerCamera), game = Object.assign(Object.create(SaloonScene.prototype), { renderBudget: new RenderBudget(), pixelRatio: 1 });
  Object.assign(game, { scene: world, playerCamera, camera, models: [model], seated: true, viewerId: 'me',
    yaw: .8, pitch: -.1, roll: 0, followOtherPlayers: true,
    room: { code: 'TEST', phase: 'playing', hand: { number: 1, actor: 1, done: false, players: [{ id: 'me', seat: 0 }, { id: 'other', seat: 1 }] } } });
  camera.position.copy(pose.position); game.applyView();
  const doc = new EventTarget(); doc.querySelector = () => null;
  let now = 0;
  const controls = new SceneViewControls(game, new EventTarget(), doc, new EventTarget(), () => now);
  const advance = count => { for (let i = 0; i < count; i++) { now += 25; controls.tick(.025); } };
  advance(8); assert.ok(controls.turnFollow, 'opponent following is initially enabled');
  game.setFollowOtherPlayers(false);
  const paused = camera.quaternion.clone(); advance(8);
  assert.equal(controls.turnFollow, null);
  assert.ok(camera.quaternion.angleTo(paused) < 1e-7, 'disabling leaves the current view still');
  game.room.hand.actor = 0; advance(40);
  assert.ok(camera.quaternion.angleTo(pose.quaternion) < 1e-7, 'own turn returns to the saved initial direction with following disabled');
  close(camera.position, pose.position);
  game.room.hand.actor = 1; advance(8);
  assert.ok(camera.quaternion.angleTo(pose.quaternion) < 1e-7, 'the next opponent does not pull the camera away');
  game.room.dealing = { key: 'next-street' };
  close(game.getTurnLookTarget().position, pose.position);
  delete game.room.dealing;
  game.setFollowOtherPlayers(true); advance(40);
  const direction = head.getWorldPosition(new THREE.Vector3()); direction.y -= .35; direction.sub(camera.position).normalize();
  close(camera.getWorldDirection(new THREE.Vector3()), direction);
  controls.dispose();
});

test('editor HTTP saves atomically, survives server restart, detects conflicts and resets', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'revolver-editor-'));
  const layoutFile = path.join(directory, 'scene-layout.js');
  let app = createPokerServer({ layoutFile });
  await new Promise(r => app.server.listen(0, '127.0.0.1', r));
  let base = `http://127.0.0.1:${app.server.address().port}`;
  t.after(async () => { await app.close(); await rm(directory, { recursive: true, force: true }); });
  const send = body => fetch(`${base}/api/scene-layout`, { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const initial = await (await fetch(`${base}/api/scene-layout`)).json();
  const layout = { version: 1, objects: { 'board-group': transform([0, 1.573, 1.1], [0, .2, 0], [1.2, 1.2, 1.2]), 'player-camera': { ...transform([.4, 3.5, 5.8], [-.3, .25, .1]), camera: { fov: 58, near: .04, far: 150 } }, 'board-camera': { ...transform([.1, 5, 3.4], [-.9, .1, 0]), camera: { fov: 66, near: .05, far: 120 } } } };
  assert.equal((await fetch(`${base}/editor`)).status, 200);
  const controls = await (await fetch(`${base}/vendor/TransformControls.js`)).text();
  assert.ok(controls.includes("from '/vendor/three.js'"));
  const saved = await (await send({ revision: initial.revision, layout })).json();
  assert.deepEqual(saved.layout, layout); assert.notEqual(saved.revision, initial.revision);
  assert.deepEqual(parseLayoutModule(await readFile(layoutFile, 'utf8')), layout);
  assert.deepEqual(parseLayoutModule(await (await fetch(`${base}/client/scene-layout.js`)).text()), layout);
  assert.equal((await send({ revision: initial.revision, layout: EMPTY_LAYOUT })).status, 409);
  const hostile = await fetch(`${base}/api/scene-layout`, { method: 'POST', headers: { Origin: 'http://other.example', 'Content-Type': 'application/json' }, body: JSON.stringify({ revision: saved.revision, layout: EMPTY_LAYOUT }) });
  assert.equal(hostile.status, 403);
  assert.equal((await send({ revision: saved.revision, layout: { version: 1, objects: { 'bad-1': transform([Infinity, 0, 0]) } } })).status, 400);
  await app.close(); app = createPokerServer({ layoutFile }); await new Promise(r => app.server.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${app.server.address().port}`;
  assert.deepEqual((await (await fetch(`${base}/api/scene-layout`)).json()).layout, layout);
  const reset = await (await send({ revision: saved.revision, layout: EMPTY_LAYOUT })).json();
  assert.deepEqual(reset.layout, EMPTY_LAYOUT);
});
