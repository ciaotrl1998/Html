import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import * as THREE from 'three';
import { DEAL_TIMING, dealDuration } from '../shared/deal-timing.js';
import { TURN_FOLLOW } from '../client/view-controls.js';

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

test('all hole and community animations finish inside their server phase, which also covers camera return', t => {
  fakeDocument(t);
  const { cards } = createGame(); cards.update(null, 'me', TABLE_POSITIONS, 0);
  const players = Array.from({ length: 8 }, (_, seat) => ({ id: seat ? `p${seat}` : 'me', seat, folded: false, cards: seat ? [null, null] : [12, 11] }));
  const room = { code: 'TEST', dealing: true, serverTime: Date.now(), hand: { number: 1, players, board: [], done: false } };
  let previousBoard = 0;
  for (const count of [0, 3, 4, 5]) {
    room.hand.board = [0, 1, 2, 3, 4].slice(0, count);
    room.deal = { hand: 1, boardCount: count, startedAt: room.serverTime - 200 };
    cards.update(room, 'me', TABLE_POSITIONS, 0);
    const animations = cards.all.flatMap(card => card.animation?.kind === 'deal' ? [card.animation] : []);
    assert.equal(animations.length, count === 0 ? 16 : count === 3 ? 3 : 1);
    assert.equal(cards.dealing, true);
    const end = Math.max(...animations.map(animation => animation.start + animation.duration)) - cards.dealStart;
    const duration = dealDuration(count === 0, previousBoard, count);
    assert.ok(end < duration); assert.ok(TURN_FOLLOW.duration <= duration);
    assert.ok(Math.abs(performance.now() - (cards.dealStart + 200)) < 50, 'late packets use the shared phase start');
    if (count === 0) assert.ok(Math.abs(end - (7 * DEAL_TIMING.seatGap + DEAL_TIMING.opponentGap + DEAL_TIMING.card)) < 1e-6);
    cards.tick(cards.dealStart + duration, new THREE.PerspectiveCamera());
    assert.equal(cards.dealing, false); previousBoard = count;
  }
  assert.equal(dealDuration(false, 0, 5), DEAL_TIMING.flop, 'all-in runouts still include the staggered flop');
});

test('hole cards remain hidden during the initial half-second pause and reconnects retain the original start', t => {
  fakeDocument(t);
  const { cards } = createGame(); cards.update(null, 'me', TABLE_POSITIONS, 0);
  const serverTime = Date.now();
  const room = { code: 'TEST', dealing: true, serverTime, deal: { hand: 1, boardCount: 0, startedAt: serverTime + 500 },
    hand: { number: 1, board: [], done: false, players: [{ id: 'me', seat: 0, cards: [12, 11] }, { id: 'other', seat: 1, cards: [null, null] }] } };
  cards.update(room, 'me', TABLE_POSITIONS, 0);
  const start = cards.dealStart;
  assert.ok(start - performance.now() >= 490);
  cards.tick(start - 1, new THREE.PerspectiveCamera());
  assert.ok(cards.all.filter(card => card.animation?.kind === 'deal').every(card => !card.root.visible));
  cards.update({ ...room, serverTime: serverTime + 200 }, 'me', TABLE_POSITIONS, 0);
  assert.equal(cards.hole[0].animation.start, start, 'sync packets cannot restart an existing animation');
  cards.tick(start + 1, new THREE.PerspectiveCamera());
  assert.equal(cards.hole[0].root.visible, true);
});

test('opening keeps every card hidden until the following shared deal timeline begins', t => {
  fakeDocument(t);
  const { cards } = createGame(); cards.update(null, 'me', TABLE_POSITIONS, 0);
  const serverTime = Date.now();
  const room = { code: 'TEST', dealing: true, serverTime, opening: { hand: 1, stage: 'markers' },
    hand: { number: 1, board: [], done: false, players: [{ id: 'me', seat: 0, cards: [12, 11] }, { id: 'other', seat: 1, cards: [null, null] }] } };
  cards.update(room, 'me', TABLE_POSITIONS, 0); cards.tick(performance.now() + 2000, new THREE.PerspectiveCamera());
  assert.ok(cards.all.every(card => !card.root.visible && !card.animation));
  cards.update({ ...room, opening: null, serverTime: serverTime + 3000,
    deal: { hand: 1, boardCount: 0, startedAt: serverTime + 3500 } }, 'me', TABLE_POSITIONS, 0);
  assert.equal(cards.hole[0].animation.kind, 'deal');
  assert.ok(cards.hole[0].animation.start - performance.now() >= 490);
  cards.tick(cards.dealStart - 1, new THREE.PerspectiveCamera());
  assert.ok(cards.all.every(card => !card.root.visible));
  cards.tick(cards.dealStart + 1, new THREE.PerspectiveCamera());
  assert.equal(cards.hole[0].root.visible, true);
});

test('holding during a deal preserves its timeline and flips each own card only after it lands', t => {
  fakeDocument(t);
  const { cards } = createGame(); cards.update(null, 'me', TABLE_POSITIONS, 0);
  const serverTime = Date.now(), room = { code: 'TEST', dealing: true, serverTime,
    deal: { hand: 1, boardCount: 0, startedAt: serverTime + 500 },
    hand: { number: 1, board: [], done: false, players: [{ id: 'me', seat: 0, cards: [12, 11] }, { id: 'other', seat: 7, cards: [null, null] }] } };
  cards.update(room, 'me', TABLE_POSITIONS, 0);
  const flights = cards.hole.map(card => card.animation), firstEnd = flights[0].start + flights[0].duration + 1;
  cards.setPeeking(true);
  cards.hole.forEach((card, index) => assert.equal(card.animation, flights[index], 'peeking cannot replace an unfinished deal'));
  cards.tick(flights[0].start - 1, new THREE.PerspectiveCamera());
  assert.ok(cards.hole.every(card => !card.root.visible), 'the initial pause still hides undelivered cards');
  cards.tick(firstEnd, new THREE.PerspectiveCamera());
  assert.notEqual(cards.hole[0].animation, flights[0]);
  close(cards.hole[0].root.position, flights[0].to);
  assert.equal(cards.hole[0].animation.start, firstEnd);
  assert.equal(cards.hole[1].animation, flights[1], 'the second card must finish its own flight');
  const secondEnd = flights[1].start + flights[1].duration + 1;
  cards.tick(secondEnd, new THREE.PerspectiveCamera());
  assert.equal(cards.hole[1].animation.start, secondEnd);
  cards.update({ ...room, dealing: false }, 'me', TABLE_POSITIONS, 0);
  assert.equal(cards.peeking, true); assert.equal(cards.dealing, false);
  cards.setPeeking(false); cards.tick(performance.now() + 500, new THREE.PerspectiveCamera());
  cards.hole.forEach((card, index) => {
    const covered = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, (index ? 1 : -1) * .1));
    assert.ok(card.root.quaternion.angleTo(covered) < 1e-7);
  });
});

test('releasing or starting a new hand cancels pending peeks without revealing cards later', t => {
  fakeDocument(t);
  const { cards } = createGame(); cards.update(null, 'me', TABLE_POSITIONS, 0);
  const room = { code: 'TEST', dealing: true, hand: { number: 1, board: [], done: false,
    players: [{ id: 'me', seat: 0, cards: [12, 11] }, { id: 'other', seat: 7, cards: [null, null] }] } };
  cards.update(room, 'me', TABLE_POSITIONS, 0);
  const end = Math.max(...cards.all.flatMap(card => card.animation ? [card.animation.start + card.animation.duration] : []));
  cards.setPeeking(true); cards.setPeeking(false); cards.tick(end, new THREE.PerspectiveCamera());
  assert.equal(cards.peeking, false);
  cards.hole.forEach((card, index) => {
    assert.equal(card.animation, null); assert.equal(card.peekPending, false);
    const covered = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, (index ? 1 : -1) * .1));
    assert.ok(card.root.quaternion.angleTo(covered) < 1e-7);
  });
  cards.update({ ...room, hand: { ...room.hand, number: 2 } }, 'me', TABLE_POSITIONS, 0);
  cards.setPeeking(true);
  cards.update({ ...room, hand: { ...room.hand, number: 3 } }, 'me', TABLE_POSITIONS, 0);
  assert.equal(cards.peeking, false); assert.ok(cards.hole.every(card => !card.peekPending));
});

test('an authoritative phase end settles deal motion while preserving peek and reveal animations', t => {
  fakeDocument(t);
  const { cards } = createGame(); cards.update(null, 'me', TABLE_POSITIONS, 0);
  const room = { code: 'TEST', dealing: true, hand: { number: 1, board: [], done: false,
    players: [{ id: 'me', seat: 0, cards: [12, 11] }, { id: 'other', seat: 7, cards: [null, null] }] } };
  cards.update(room, 'me', TABLE_POSITIONS, 0);
  const landing = cards.opponents[7][0].animation.to.clone();
  // Own cards can already be at rest while distant seats are still receiving.
  cards.tick(cards.hole[1].animation.start + DEAL_TIMING.card + 1, new THREE.PerspectiveCamera());
  cards.setPeeking(true); const peek = cards.hole[0].animation;
  cards.update({ ...room, dealing: false }, 'me', TABLE_POSITIONS, 0);
  assert.equal(cards.dealing, false); close(cards.opponents[7][0].root.position, landing);
  assert.equal(cards.hole[0].animation, peek);
  cards.update({ ...room, dealing: false, hand: { ...room.hand, done: true,
    players: room.hand.players.map(p => p.id === 'other' ? { ...p, cards: [0, 1] } : p) } }, 'me', TABLE_POSITIONS, 0);
  assert.equal(cards.opponents[7][0].animation.kind, 'reveal');
  assert.equal(cards.dealing, false, 'showdown reveals do not reopen the dealing phase');
});

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

test('own folded cards fly from the dragged, edited hand onto an independently saved landing point', t => {
  fakeDocument(t);
  const game = createGame(), cards = game.cards, focus = 5;
  const entry = game.layout.entries.get('hand-discard'), hand = game.layout.entries.get('hand-group');
  assert.ok(entry.label.includes('自己') && entry.label.includes('第一人称'));
  entry.proxy.position.set(-.72, 1.6, 1.25); entry.proxy.rotation.set(0, .3, 0); entry.proxy.scale.setScalar(.9); game.layout.sync(entry);
  hand.proxy.position.set(.3, 1.65, 3.6); hand.proxy.rotation.set(.05, .2, -.03); hand.proxy.scale.setScalar(.85); game.layout.sync(hand);
  const single = game.layout.entries.get('hand-card-0'); single.proxy.position.x -= .12; game.layout.sync(single);
  const me = { id: 'me', seat: focus, cards: [12, 11], folded: false };
  const room = { code: 'OWN', hand: { number: 1, players: [me], board: [] } };
  cards.update(room, 'me', TABLE_POSITIONS, focus); cards.setHandDrag(1); cards.tick(0, new THREE.PerspectiveCamera());
  cards.hole.forEach(card => card.root.updateWorldMatrix(true, true));
  const from = cards.hole.map(card => card.display.getWorldPosition(new THREE.Vector3()));
  me.folded = true; cards.update(room, 'me', TABLE_POSITIONS, focus);
  cards.ownDiscard.forEach((card, i) => {
    assert.equal(cards.hole[i].root.visible, false); assert.equal(card.root.visible, true);
    assert.equal(card.front.material, cards.factory.back); close(card.root.getWorldPosition(new THREE.Vector3()), from[i]);
  });
  cards.tick(performance.now() + 600, new THREE.PerspectiveCamera());
  const landing = cards.ownDiscard.map((card, i) => {
    const expected = cards.ownDiscardGroup.localToWorld(new THREE.Vector3(i * .13, i * .005, 0));
    close(card.root.getWorldPosition(new THREE.Vector3()), expected); return expected;
  });
  cards.setPeeking(true); assert.ok(cards.hole.every(card => !card.root.visible), 'discarded cards cannot be picked up by peeking');
  const saved = game.layout.export(), preview = createGame(true); preview.layout.apply(saved); preview.cards.update(room, 'me', TABLE_POSITIONS, focus);
  preview.cards.ownDiscard.forEach((card, i) => { assert.equal(card.animation, null); close(card.root.getWorldPosition(new THREE.Vector3()), landing[i]); });
  hand.proxy.position.x += 2; game.layout.sync(hand); cards.update(room, 'me', TABLE_POSITIONS, focus);
  cards.ownDiscard.forEach((card, i) => close(card.root.getWorldPosition(new THREE.Vector3()), landing[i]));
  me.folded = false; room.hand.number++; cards.setHandDrag(0); cards.update(room, 'me', TABLE_POSITIONS, focus);
  assert.ok(cards.ownDiscard.every(card => !card.root.visible)); assert.ok(cards.hole.every(card => card.root.visible || card.animation));
});

test('own discard preview can be toggled, reset and reloaded without showing hidden card faces', t => {
  fakeDocument(t);
  const game = createGame(true), cards = game.cards, entry = game.layout.entries.get('hand-discard');
  const me = { id: 'me', seat: 0, cards: [null, null], folded: true }, room = { code: 'PREVIEW', hand: { number: 1, players: [me], board: [] } };
  cards.update(room, 'me', TABLE_POSITIONS, 0);
  assert.ok(cards.ownDiscard.every(card => card.root.visible && card.front.material === cards.factory.back && !card.animation));
  entry.proxy.position.set(-.8, 1.6, 1.2); game.layout.sync(entry); const saved = game.layout.export();
  const point = cards.ownDiscard[0].root.getWorldPosition(new THREE.Vector3());
  me.folded = false; me.cards = [12, 11]; cards.update(room, 'me', TABLE_POSITIONS, 0);
  assert.ok(cards.ownDiscard.every(card => !card.root.visible)); assert.ok(cards.hole.every(card => card.root.visible));
  me.folded = true; cards.update(room, 'me', TABLE_POSITIONS, 0); close(cards.ownDiscard[0].root.getWorldPosition(new THREE.Vector3()), point);
  game.layout.reset(entry); close(cards.ownDiscard[0].root.getWorldPosition(new THREE.Vector3()), new THREE.Vector3(-1, 1.573, 1.45));
  game.layout.apply(saved); close(cards.ownDiscard[0].root.getWorldPosition(new THREE.Vector3()), point);
  cards.update(null, 'me', TABLE_POSITIONS, 0); assert.ok(cards.ownDiscard.every(card => !card.root.visible));
});
