import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import * as THREE from 'three';

registerHooks({ resolve(specifier, context, next) {
  if (specifier === '/vendor/three.js') return next('three', context);
  if (specifier === '/shared/scene-layout.js') return next(new URL('../shared/scene-layout.js', import.meta.url).href, context);
  return next(specifier, context);
} });
const { LayoutRegistry } = await import('../client/layout-registry.js');
const { TableCards, TABLE_POSITIONS } = await import('../client/cards.js');
const { TableBetView } = await import('../client/table-bet-view.js');
const close = (a, b) => assert.ok(a.distanceTo(b) < 1e-7, `${a.toArray()} != ${b.toArray()}`);

function fakeDocument(t) {
  const previous = globalThis.document;
  const context = new Proxy({ createLinearGradient: () => ({ addColorStop() {} }) }, { get: (target, key) => key in target ? target[key] : () => {} });
  const element = () => ({ style: {}, setAttribute() {}, textContent: '', querySelector: () => element() });
  globalThis.document = { createElement: tag => tag === 'canvas' ? { width: 0, height: 0, getContext: () => context } : element() };
  t.after(() => { globalThis.document = previous; });
}

function createGame(editor = false) {
  const scene = new THREE.Scene(), bank = new THREE.Group();
  bank.position.set(-1.05, 1.56, 3.75); bank.userData.layout = { id: 'chips-0', label: '自己 · 筹码堆', category: '筹码与扑克' }; scene.add(bank);
  const game = { scene, editor, piles: [bank], cards: new TableCards(scene, { animate: !editor }), layout: new LayoutRegistry(), container: { appendChild() {} } };
  const nodes = []; scene.traverse(node => { if (node.userData.layout) nodes.push(node); });
  for (const node of nodes) { const { id, label, category } = node.userData.layout; game.layout.register(node, id, label, category); }
  game.betView = new TableBetView(game); game.betView.setActive(true);
  return game;
}

test('editable bankroll and staged-chip transforms survive saving, reloading, reselection and throwing', t => {
  fakeDocument(t);
  const editor = createGame(true), view = editor.betView, bankEntry = editor.layout.entries.get('chips-0');
  bankEntry.proxy.position.set(.57, 1.56, 3.16); editor.layout.sync(bankEntry);
  const state = { pending: 100, bankroll: 2000, remaining: 1900, enabled: false };
  view.setState(state); view.tick(0);
  const initial = editor.piles[0].getWorldPosition(new THREE.Vector3());
  close(initial, bankEntry.proxy.position);
  assert.ok(view.home.distanceTo(initial) > .7, 'older layouts still place staged chips beside the edited bankroll');
  const stageEntry = editor.layout.entries.get('staged-chips');
  stageEntry.proxy.position.set(.2, 1.64, 2.4); stageEntry.proxy.rotation.set(0, .35, 0); stageEntry.proxy.scale.setScalar(.85); editor.layout.sync(stageEntry);
  view.tick(10); close(view.stage.getWorldPosition(new THREE.Vector3()), stageEntry.proxy.position);
  const saved = editor.layout.export(); assert.ok(saved.objects['chips-0']); assert.ok(saved.objects['staged-chips']);

  const game = createGame(); game.layout.apply(saved);
  game.betView.setState(state); game.betView.tick(20);
  close(game.piles[0].getWorldPosition(new THREE.Vector3()), initial);
  const expected = stageEntry.proxy.position.clone(), gameView = game.betView;
  close(gameView.stage.getWorldPosition(new THREE.Vector3()), expected);
  close(gameView.stage.getWorldScale(new THREE.Vector3()), new THREE.Vector3(.85, .85, .85));
  assert.ok(gameView.stage.getWorldQuaternion(new THREE.Quaternion()).angleTo(stageEntry.proxy.quaternion) < 1e-7);
  gameView.setState({ ...state, pending: 600, remaining: 1400 }); gameView.tick(25);
  close(gameView.stage.getWorldPosition(new THREE.Vector3()), expected);
  gameView.setState({ ...state, pending: 0, remaining: 2000 }); assert.equal(gameView.stage.visible, false);
  gameView.setState(state); gameView.tick(30); close(gameView.stage.getWorldPosition(new THREE.Vector3()), expected);
  const bank = game.layout.entries.get('chips-0'); bank.proxy.position.x += .2; game.layout.sync(bank); gameView.tick(40);
  close(gameView.stage.getWorldPosition(new THREE.Vector3()), expected, 'explicit stage placement is independent of the bankroll');
  gameView.commit({ type: 'raise', amount: 100 });
  close(gameView.flight.from, expected);
  gameView.tick(gameView.flight.start + 200);
  assert.ok(gameView.stage.getWorldPosition(new THREE.Vector3()).distanceTo(expected) > .1);
  close(gameView.stageAnchor.getWorldPosition(new THREE.Vector3()), expected, 'animation must not move the saved anchor');
  game.layout.reset(gameView.stageEntry); gameView.anchors();
  const automatic = game.piles[0].getWorldPosition(new THREE.Vector3());
  const direction = game.cards.boardAnchor.getWorldPosition(new THREE.Vector3()).sub(automatic); direction.y = 0; direction.normalize();
  automatic.addScaledVector(direction, .72); automatic.y += .025; close(gameView.home, automatic);
});

test('other players discard face down from their edited hands onto independent saved landing points', t => {
  fakeDocument(t);
  const game = createGame(), cards = game.cards, focus = 4, local = 2;
  const entry = game.layout.entries.get(`opponent-discard-${local}`);
  entry.proxy.position.set(-.9, 1.6, -.8); entry.proxy.rotation.set(0, .4, 0); entry.proxy.scale.setScalar(1.2); game.layout.sync(entry);
  const handEntry = game.layout.entries.get(`opponent-cards-${local}`); handEntry.proxy.position.x += .25; game.layout.sync(handEntry);
  const players = Array.from({ length: 8 }, (_, seat) => ({ id: seat === focus ? 'me' : `p${seat}`, seat, folded: false, cards: seat === focus ? [12, 11] : [null, null] }));
  const room = { code: 'TEST', hand: { number: 1, players, board: [] } };
  cards.update(room, 'me', TABLE_POSITIONS, focus);
  const from = cards.opponents[local].map(card => card.root.getWorldPosition(new THREE.Vector3()));
  players[(local + focus) % 8].folded = true;
  cards.update(room, 'me', TABLE_POSITIONS, focus);
  cards.discards[local].forEach((card, i) => {
    assert.equal(cards.opponents[local][i].root.visible, false); assert.equal(card.root.visible, true);
    assert.equal(card.front.material, cards.factory.back, 'folded cards never disclose their front faces');
    close(card.root.getWorldPosition(new THREE.Vector3()), from[i]);
  });
  cards.tick(performance.now() + 1000, new THREE.PerspectiveCamera());
  const landing = cards.discards[local].map((card, i) => {
    const expected = cards.discardGroups[local].localToWorld(new THREE.Vector3((i ? 1 : -1) * .065, i * .005, i * .025));
    close(card.root.getWorldPosition(new THREE.Vector3()), expected);
    const front = new THREE.Vector3(0, 0, 1).applyQuaternion(card.root.getWorldQuaternion(new THREE.Quaternion()));
    assert.ok(front.y < -.99); return expected;
  });
  const reloaded = createGame(true); reloaded.layout.apply(game.layout.export());
  reloaded.cards.update(room, 'me', TABLE_POSITIONS, focus);
  reloaded.cards.discards[local].forEach((card, i) => { close(card.root.getWorldPosition(new THREE.Vector3()), landing[i]); assert.equal(card.animation, null); });
  room.hand.number++;
  for (const player of players) player.folded = false;
  cards.update(room, 'me', TABLE_POSITIONS, focus);
  assert.ok(cards.discards.flat().every(card => !card.root.visible), 'the next deal removes all previous discarded cards');
});
