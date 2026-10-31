import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { RenderBudget } from '../client/render-budget.js';
registerHooks({ resolve(specifier, context, next) {
  if (specifier === '/vendor/three.js') return next('three', context);
  if (specifier === '/shared/scene-layout.js') return next(new URL('../shared/scene-layout.js', import.meta.url).href, context);
  return next(specifier, context);
} });
const { TableBetView, chipParts, bankChipParts } = await import('../client/table-bet-view.js');
const { TableCards } = await import('../client/cards.js');
const { SaloonScene } = await import('../client/scene.js');
const { LayoutRegistry } = await import('../client/layout-registry.js');
const { createPlayerCamera } = await import('../client/player-camera.js');
const { parseLayoutModule } = await import('../shared/scene-layout.js');

test('chip denominations represent reserved amounts exactly, including large stacks and change', () => {
  for (const amount of [0, 1, 20, 37, 999, 2000, 999999, 1000000, 8000000]) {
    const parts = chipParts(amount);
    assert.equal(parts.reduce((sum, part) => sum + part.value * part.count, 0), amount);
    assert.ok(parts.reduce((sum, part) => sum + part.count, 0) <= 65);
  }
});

test('a fresh bankroll already contains mixed denominations and remains exact before staging or after withdrawal', () => {
  const initial = bankChipParts(2000);
  assert.ok(initial.length >= 3); assert.ok(initial.reduce((sum, part) => sum + part.count, 0) >= 15);
  assert.ok(initial.some(part => part.value <= 5), 'change must be present before the first wager');
  for (const amount of [0, 1, 2, 6, 12, 25, 100, 1000, 1980, 2000, 2001, 1000000, 8000000]) {
    const parts = bankChipParts(amount);
    assert.equal(parts.reduce((sum, part) => sum + part.value * part.count, 0), amount);
    assert.ok(parts.every(part => Number.isInteger(part.count) && part.count > 0 && part.count <= 10));
    assert.ok(parts.reduce((sum, part) => sum + part.count, 0) <= 65);
  }
  assert.deepEqual(bankChipParts(2000), initial, 'returning the full draft restores the same bankroll arrangement');
});

test('dragging the hand previews a forward fold through edited transforms and cancellation restores the cards', () => {
  const world = new THREE.Scene(), parent = new THREE.Group(), boardAnchor = new THREE.Object3D();
  parent.position.set(.2, .1, -.3); parent.rotation.y = .2; parent.scale.setScalar(.8); world.add(parent, boardAnchor);
  boardAnchor.position.set(0, 1.573, .65);
  const hole = Array.from({ length: 2 }, (_, i) => {
    const root = new THREE.Group(), display = new THREE.Group(); display.matrixAutoUpdate = false;
    root.position.set(i * .2, 1.573, 3.5); root.rotation.x = Math.PI / 2; root.add(display); parent.add(root); return { root, display };
  });
  world.updateMatrixWorld(true);
  const cards = Object.create(TableCards.prototype);
  Object.assign(cards, { all: [], hole, boardAnchor, boardPresentation: { tick() {} }, folded: false });
  const before = hole.map(card => card.root.getWorldPosition(new THREE.Vector3()));
  cards.setHandDrag(1); cards.tick(0, new THREE.PerspectiveCamera()); world.updateMatrixWorld(true);
  hole.forEach((card, i) => {
    const moved = card.display.getWorldPosition(new THREE.Vector3()).sub(before[i]);
    const forward = boardAnchor.position.clone().sub(before[i]); forward.y = 0; forward.normalize();
    assert.ok(moved.dot(forward) > .44); assert.ok(moved.y > .05);
    assert.ok(card.root.getWorldPosition(new THREE.Vector3()).distanceTo(before[i]) < 1e-8);
  });
  cards.setHandDrag(0); cards.tick(25, new THREE.PerspectiveCamera());
  for (const card of hole) assert.ok(card.display.matrix.equals(new THREE.Matrix4()));
});

test('3D chip staging, returns, slider placement and forward dragging respect edited scene positions', () => {
  const previousDocument = globalThis.document;
  const node = () => ({ style: {}, hidden: false, setAttribute() {}, textContent: '' });
  const nodes = Object.fromEntries(['.chip-selector-value', 'i', 'b', '.chip-selector-max', '.chip-selector-track'].map(key => [key, node()]));
  const ctx = new Proxy({}, { get: (target, key) => key in target ? target[key] : () => {} });
  globalThis.document = { createElement(tag) { return tag === 'canvas' ? { width: 0, height: 0, getContext: () => ctx }
    : { ...node(), querySelector: key => nodes[key] ||= node() }; } };
  try {
    const world = new THREE.Scene(), bank = new THREE.Group(), boardAnchor = new THREE.Object3D();
    const decoration = new THREE.Object3D(); bank.add(decoration); bank.position.set(.57, 1.56, 3.16); bank.rotation.y = -.39;
    boardAnchor.position.set(0, 1.573, .65); world.add(bank, boardAnchor);
    const camera = new THREE.PerspectiveCamera(74, 390 / 844, .1, 80); camera.position.set(0, 3.73, 4.65); camera.rotation.x = -.626;
    world.add(camera); world.updateMatrixWorld(true);
    const rect = { left: 0, top: 0, width: 390, height: 844 };
    const saloon = { scene: world, camera, piles: [bank], cards: { boardAnchor, setHandDrag() {} }, container: { appendChild() {}, getBoundingClientRect: () => rect }, renderer: { domElement: { getBoundingClientRect: () => rect } } };
    const view = new TableBetView(saloon), sum = group => group.children.reduce((amount, coin) => amount + coin.userData.value, 0);
    view.setActive(true);
    view.setState({ pending: 0, bankroll: 2000, remaining: 2000, enabled: true });
    assert.equal(sum(view.reserveCoins), 2000); assert.ok(view.reserveCoins.children.length >= 15);
    const initialValues = view.reserveCoins.children.map(coin => coin.userData.value);
    view.setState({ pending: 20, bankroll: 2000, remaining: 1980, enabled: true });
    view.setState({ pending: 0, bankroll: 2000, remaining: 2000, enabled: true });
    view.tick(performance.now() + 400);
    assert.deepEqual(view.reserveCoins.children.map(coin => coin.userData.value), initialValues);
    const state = { pending: 20, bankroll: 1000, remaining: 980, enabled: true, ratio: 0, maximum: 1000 };
    view.setState(state); view.tick(performance.now() + 400);
    assert.equal(sum(view.stageCoins), 20); assert.equal(sum(view.reserveCoins), 980); assert.equal(decoration.visible, false);
    view.setState({ ...state, pending: 600, remaining: 400 });
    assert.equal(sum(view.stageCoins), 20); assert.equal(sum(view.reserveCoins), 400); assert.equal(sum(view.transfers.at(-1).group), 580);
    view.tick(performance.now() + 400); assert.equal(sum(view.stageCoins), 600);
    view.setState({ ...state, pending: 100, remaining: 900 });
    assert.equal(sum(view.stageCoins), 100); assert.equal(sum(view.transfers.at(-1).group), 500);
    view.anchors(); assert.ok(view.transfers.at(-1).to.distanceTo(bank.getWorldPosition(new THREE.Vector3())) < 1e-8);
    view.tick(performance.now() + 400); assert.equal(sum(view.reserveCoins), 900);
    const screen = worldPoint => { const p = worldPoint.clone().project(camera); return { x: (p.x + 1) * rect.width / 2, y: (1 - p.y) * rect.height / 2 }; };
    const start = screen(view.home), ahead = screen(view.home.clone().addScaledVector(view.forward, .55));
    assert.ok(view.measureForward(start, ahead) > 1); assert.ok(view.measureForward(ahead, start) < 0);
    const preview = { ...state, selecting: true, selected: 60, ratio: .2, dragging: null, progress: 0 };
    view.setState(preview); view.tick(performance.now() + 400);
    const originalFill = view.fill, originalHandDrag = saloon.cards.setHandDrag;
    view.fill = () => { throw new Error('drag preview must not rebuild 3D coins'); };
    saloon.cards.setHandDrag = () => { throw new Error('chip preview must not update the hand'); };
    view.setState({ ...preview, selected: 70, ratio: .3 });
    assert.equal(nodes['.chip-selector-value'].textContent, '70');
    view.fill = originalFill; saloon.cards.setHandDrag = originalHandDrag;
    view.setState({ ...state, selecting: true, selected: 1000, ratio: 1 }); view.tick(performance.now());
    assert.equal(view.slider.hidden, false); assert.equal(nodes['.chip-selector-preset'].textContent, 'ALL IN');
    assert.equal(nodes.i.style.transform, 'scaleY(1)');
    const originalTop = view.slider.style.top, originalHeight = nodes['.chip-selector-track'].style.height;
    assert.ok(Number.parseFloat(originalHeight) > 320);
    camera.rotation.y += .8; view.positionSlider();
    assert.equal(view.slider.style.top, originalTop); assert.equal(nodes['.chip-selector-track'].style.height, originalHeight, 'camera rotation cannot move the UI track');
    rect.height = 360; view.positionSlider();
    assert.ok(Number.parseFloat(nodes['.chip-selector-track'].style.height) < Number.parseFloat(originalHeight));
    assert.ok(Number.parseFloat(view.slider.style.top) >= 10);
    assert.ok(Number.parseFloat(view.slider.style.top) + Number.parseFloat(nodes['.chip-selector-track'].style.height) <= rect.height - 70);
    rect.height = 844; view.positionSlider();
    const map = view.numberMap; view.commit({ type: 'call', amount: 20 }); view.setState({ ...state, pending: 0, remaining: 1000, inFlight: true });
    view.tick(view.flight.start + 500); assert.ok(view.flight); assert.equal(view.stage.visible, true); assert.equal(view.numberMap, map);
    const adopted = view.takeCommitted(20, view.flight.start + 501);
    assert.equal(sum(adopted.group), 20); assert.equal(view.flight, null); assert.equal(view.stage.visible, false);
    view.setActive(false); assert.equal(decoration.visible, true); assert.equal(view.slider.hidden, true);
  } finally { globalThis.document = previousDocument; }
});

test('saved game layout allows actual ray hits on own chip bank, staged chips, hand and felt despite furniture occlusion', async () => {
  const saved = parseLayoutModule(await readFile(new URL('../client/scene-layout.js', import.meta.url), 'utf8'));
  const previousDocument = globalThis.document;
  const ctx = new Proxy({ createLinearGradient: () => ({ addColorStop() {} }) }, { get: (target, key) => key in target ? target[key] : () => {} });
  const node = () => ({ style: {}, setAttribute() {}, textContent: '' });
  globalThis.document = { createElement(tag) { return tag === 'canvas' ? { width: 0, height: 0, getContext: () => ctx }
    : { ...node(), querySelector: () => node() }; } };
  try {
    const game = Object.create(SaloonScene.prototype), world = new THREE.Scene();
    Object.assign(game, { scene: world, camera: new THREE.PerspectiveCamera(), wood: new THREE.MeshStandardMaterial(),
      darkWood: new THREE.MeshStandardMaterial(), brass: new THREE.MeshStandardMaterial(),
      raycaster: new THREE.Raycaster(), pointer: new THREE.Vector2(), editor: false, seated: true, viewerId: 'me', overviewPitch: -.58 });
    game.buildTable(); game.tagEditables(0, 'table', '牌桌与道具');
    game.buildHands(); game.hands.visible = true; game.hands.userData.layout = { id: 'player-hands', label: '自己的双臂', category: '玩家与座位' };
    const bank = game.makeChips(0); bank.position.set(-1.05, 1.56, 3.75);
    bank.userData.layout = { id: 'chips-0', label: '筹码', category: '筹码' }; world.add(bank); game.piles = [bank];
    game.cards = new TableCards(world); game.playerCamera = createPlayerCamera(); world.add(game.playerCamera);
    game.layout = new LayoutRegistry(); const editables = [];
    world.traverse(node => { if (node.userData.layout) editables.push(node); });
    for (const node of editables) { const { id, label, category } = node.userData.layout; game.layout.register(node, id, label, category); }
    game.layout.apply(saved);
    const rect = { left: 0, top: 0, width: 390, height: 844 };
    game.container = { appendChild() {}, getBoundingClientRect: () => rect };
    game.renderBudget = new RenderBudget(); game.pixelRatio = game.renderBudget.ratio;
    game.renderer = { setSize() {}, setPixelRatio() {}, domElement: { getBoundingClientRect: () => rect, setAttribute() {} } };
    game.room = { code: '123456', phase: 'playing', hand: { number: 1, players: [{ id: 'me', seat: 0, chips: 2000, folded: false, cards: [0, 13] }], board: [], done: false } };
    game.resetView();
    game.cards.update(game.room, 'me', [[0, 5.5], [-3.15, 3.7], [-3.7, .4], [-2.65, -3.55], [0, -5.1], [2.65, -3.55], [3.7, .4], [3.15, 3.7]], 0);
    game.betView = new TableBetView(game); game.betView.setActive(true);
    game.betView.setState({ pending: 20, bankroll: 2000, remaining: 1980, enabled: true }); game.betView.tick(performance.now() + 400); world.updateMatrixWorld(true);
    const hit = object => {
      const point = object.getWorldPosition(new THREE.Vector3()); point.y += .025; point.project(game.camera);
      return game.hitTarget((point.x + 1) * rect.width / 2, (1 - point.y) * rect.height / 2);
    };
    assert.ok(game.betView.reserveCoins.children.some(coin => hit(coin)?.chipRole === 'bank'), 'own bankroll must be reachable through raycasting');
    assert.equal(hit(game.betView.stageCoins.children[0])?.chipRole, 'staged');
    assert.ok(game.cards.hole.some(card => hit(card.root)?.cardRole === 'hand'));
    const empty = new THREE.Vector3(-.8, 1.573, 2.1).project(game.camera);
    assert.equal(game.hitTarget((empty.x + 1) * rect.width / 2, (1 - empty.y) * rect.height / 2)?.tableSurface, true);
  } finally { globalThis.document = previousDocument; }
});
