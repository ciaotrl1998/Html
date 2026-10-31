import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import * as THREE from 'three';
import { PokerHand } from '../shared/poker.js';
import savedLayout from '../client/scene-layout.js';

registerHooks({ resolve(specifier, context, next) {
  if (specifier === '/vendor/three.js') return next('three', context);
  if (specifier === '/shared/scene-layout.js') return next(new URL('../shared/scene-layout.js', import.meta.url).href, context);
  return next(specifier, context);
} });
const { LayoutRegistry } = await import('../client/layout-registry.js');
const { TableBetView } = await import('../client/table-bet-view.js');
const { TablePotView } = await import('../client/table-pot-view.js');
const { TableActions, TABLE_GESTURES } = await import('../client/table-actions.js');
const { TableCards, TABLE_POSITIONS } = await import('../client/cards.js');
const sum = group => group.children.reduce((sum, coin) => sum + (coin.userData.value || 0), 0);
const close = (a, b) => assert.ok(a.distanceTo(b) < 1e-7, `${a.toArray()} != ${b.toArray()}`);
const hand = (balances = [2000, 2000, 2000], extra = {}) => new PokerHand({ players: balances.map((chips, seat) => ({ id: `p${seat}`, name: `P${seat}`, seat, chips })), button: 0, smallBlind: 5, bigBlind: 10, deck: Array.from({ length: 52 }, (_, i) => i), ...extra });

function fixture(t, viewerId = 'p0', focus = 0, editor = false) {
  const previous = globalThis.document;
  const context = new Proxy({ createLinearGradient: () => ({ addColorStop() {} }) }, { get: (target, key) => key in target ? target[key] : () => {} });
  const element = () => ({ style: {}, setAttribute() {}, textContent: '', querySelector: () => element() });
  globalThis.document = { createElement: tag => tag === 'canvas' ? { width: 0, height: 0, getContext: () => context } : element() };
  t.after(() => { globalThis.document = previous; });
  const scene = new THREE.Scene(), layout = new LayoutRegistry(), boardAnchor = new THREE.Object3D(); boardAnchor.position.set(0, 1.573, .65); scene.add(boardAnchor);
  const piles = TABLE_POSITIONS.map(([x, z], local) => {
    const pile = new THREE.Group(); pile.position.set(local ? x * .7 : -1.05, 1.56, local ? z * .7 : 3.75); pile.add(new THREE.Object3D()); scene.add(pile);
    layout.register(pile, `chips-${local}`, `筹码 ${local}`, '筹码'); return pile;
  });
  const camera = new THREE.PerspectiveCamera(74, 390 / 844, .1, 80); camera.position.set(0, 3.73, 4.65); camera.rotation.x = -.626; camera.updateMatrixWorld(true);
  const game = { scene, layout, piles, editor, viewerId, camera, cards: { boardAnchor }, container: { appendChild() {}, getBoundingClientRect: () => ({ width: 390, height: 844 }) } };
  game.betView = new TableBetView(game); game.betView.setActive(viewerId !== 'spectator');
  game.potView = new TablePotView(game, game.betView);
  const messages = [], actions = new TableActions({ send: (type, amount) => { messages.push({ type, amount }); return true; }, change: state => game.betView.setState(state), commit: action => game.betView.commit(action) });
  let turn = 0;
  const sync = (h, now = performance.now(), phase = 'playing') => {
    const room = h ? { code: 'TABLE', phase, hand: h.snapshot(viewerId), turnId: `turn-${++turn}` } : null;
    game.potView.sync(room, viewerId, focus, now); actions.sync(room, viewerId); return room;
  };
  const tick = now => { game.potView.tick(now); game.betView.tick(now); };
  const visible = () => sum(game.potView.coins) + game.potView.flights.reduce((value, flight) => value + sum(flight.group), 0)
    + game.potView.banks.filter(bank => bank.coins.visible).reduce((value, bank) => value + sum(bank.coins), 0)
    + (game.betView.active ? sum(game.betView.reserveCoins) : 0)
    + (game.betView.stage.visible ? sum(game.betView.stageCoins) : 0)
    + game.betView.transfers.reduce((value, transfer) => value + sum(transfer.group), 0);
  return { game, actions, messages, sync, tick, visible };
}

test('the table pot amount follows confirmed wagers and has an independent editable anchor below the ring', t => {
  const { game, sync } = fixture(t), h = hand([2000, 2000]);
  sync(h);
  const pot = game.potView, entry = game.layout.entries.get('pot-value');
  assert.equal(pot.displayAmount, h.snapshot('p0').pot);
  assert.ok(entry.defaults.position[2] > .7, 'the amount sits outside the near edge of the pot circle');
  entry.proxy.position.x += .2; game.layout.sync(entry);
  const relative = pot.number.getWorldPosition(new THREE.Vector3()).sub(pot.target());
  close(relative, new THREE.Vector3(.2, .018, .82));
  const model = game.layout.entries.get('pot-chips'); model.proxy.position.x += .5; game.layout.sync(model);
  game.scene.updateMatrixWorld(true);
  close(pot.number.getWorldPosition(new THREE.Vector3()).sub(pot.target()), relative);
  h.act('p0', 'call'); sync(h);
  assert.equal(pot.displayAmount, 20, 'the number updates on confirmation before flying coins land');
  sync(null); assert.equal(pot.root.visible, false);
});

test('the default amount fits between the pot circle and public cards in the saved player view', t => {
  const { game, sync } = fixture(t), h = hand([2000, 2000]);
  game.cards = new TableCards(game.scene, { animate: false });
  const editables = []; game.scene.traverse(node => { if (node.userData.layout) editables.push(node); });
  for (const node of editables) { const { id, label, category } = node.userData.layout; game.layout.register(node, id, label, category); }
  game.layout.apply(savedLayout);
  // User-authored label sizing is free to overlap the ring; verify the default
  // placement independently without changing the saved editor configuration.
  game.layout.reset(game.potView.numberEntry);
  const cameraPose = savedLayout.objects['player-camera'];
  game.camera.position.fromArray(cameraPose.position); game.camera.rotation.set(...cameraPose.rotation);
  Object.assign(game.camera, cameraPose.camera); game.camera.updateProjectionMatrix();
  h.act('p0', 'call'); h.act('p1', 'check');
  const room = sync(h); game.cards.update(room, 'p0', TABLE_POSITIONS, 0);
  game.scene.updateMatrixWorld(true); game.camera.updateMatrixWorld(true);
  const amount = new THREE.Box3().setFromObject(game.potView.number);
  const board = new THREE.Box3(); game.cards.board.slice(0, 3).forEach(card => board.expandByObject(card.root));
  assert.ok(amount.min.z > game.potView.target().z + .7, 'the entire amount is below the pot circle');
  assert.ok(amount.max.z < board.min.z, 'the amount leaves the public card faces unobstructed');
  for (const x of [amount.min.x, amount.max.x]) for (const z of [amount.min.z, amount.max.z]) {
    const point = new THREE.Vector3(x, amount.max.y, z).project(game.camera);
    assert.ok(Math.abs(point.x) < 1 && Math.abs(point.y) < 1 && point.z < 1, 'the label fits the saved portrait view');
  }
});

test('confirmed blinds, antes and wagers move real coins into an editable pot and survive street changes', t => {
  const { game, sync, tick, visible } = fixture(t), h = hand([2000, 2000], { ante: 2 });
  const entry = game.layout.entries.get('pot-chips'); entry.proxy.position.set(.6, 1.62, -.7); entry.proxy.rotation.y = .4; entry.proxy.scale.setScalar(.9); game.layout.sync(entry);
  const bank = game.layout.entries.get('chips-0'); bank.proxy.scale.setScalar(.7); bank.proxy.rotation.y = -.3; game.layout.sync(bank);
  sync(h); assert.equal(visible(), 4000); assert.equal(game.potView.flights.length, 2);
  const flight = game.potView.flights[0]; close(flight.scale, new THREE.Vector3(.7, .7, .7));
  tick(flight.start + 325); close(flight.group.getWorldScale(new THREE.Vector3()), new THREE.Vector3(.875, .875, .875));
  assert.ok(game.potView.banks.every(bank => bank.decorations.every(prop => !prop.visible)));
  tick(performance.now() + 1000);
  assert.equal(sum(game.potView.coins), h.snapshot('p0').pot); assert.equal(visible(), 4000);
  close(game.potView.target(), entry.proxy.position);
  const before = [...game.potView.coins.children];
  h.act('p0', 'call'); sync(h); assert.equal(visible(), 4000); tick(performance.now() + 1000);
  assert.ok(before.every(coin => game.potView.coins.children.includes(coin)), 'landed coins remain in the pot');
  h.act('p1', 'check'); sync(h); assert.equal(h.street, 'flop'); assert.equal(game.potView.flights.length, 0);
  h.act('p1', 'raise', 20); sync(h); tick(performance.now() + 1000);
  h.act('p0', 'call'); sync(h);
  assert.equal(h.street, 'turn'); assert.ok(h.players.every(player => player.bet === 0));
  assert.equal(game.potView.flights.at(-1).amount, 20, 'a street reset cannot swallow the last call');
  assert.equal(visible(), 4000); tick(performance.now() + 1000);
  assert.equal(sum(game.potView.coins), h.snapshot('p0').pot); assert.equal(visible(), 4000);
  const saved = game.layout.export(); game.layout.apply({ version: 1, objects: {} }); game.layout.apply(saved);
  close(game.potView.target(), entry.proxy.position);
});

test('opening snapshots animate the small blind before the big blind without creating or losing coins', t => {
  const { game, actions, tick, visible } = fixture(t), h = hand(), initial = h.snapshot('p0'), now = performance.now();
  const syncStage = (stage, time) => {
    const players = initial.players.map(player => {
      const paid = stage === 'markers' ? 0 : player.seat === initial.sbSeat ? 5 : stage === 'bigBlind' && player.seat === initial.bbSeat ? 10 : 0;
      return { ...player, chips: 2000 - paid, bet: paid, total: paid };
    });
    const room = { code: 'OPEN', phase: 'playing', dealing: true, opening: { hand: 1, stage },
      hand: { ...initial, players, actor: null, legal: null, pot: players.reduce((sum, player) => sum + player.total, 0) } };
    game.potView.sync(room, 'p0', 0, time); actions.sync(room, 'p0');
  };
  syncStage('markers', now);
  assert.equal(game.potView.flights.length, 0); assert.equal(game.potView.displayAmount, 0); assert.equal(visible(), 6000);
  syncStage('smallBlind', now + 1000);
  assert.deepEqual(game.potView.flights.map(flight => [flight.id, flight.amount]), [['p1', 5]]);
  assert.equal(visible(), 6000); tick(now + 1700);
  assert.equal(sum(game.potView.coins), 5);
  syncStage('bigBlind', now + 2000);
  assert.deepEqual(game.potView.flights.map(flight => [flight.id, flight.amount]), [['p2', 10]]);
  assert.equal(visible(), 6000); tick(now + 2700);
  assert.equal(sum(game.potView.coins), 15); assert.equal(visible(), 6000);
  syncStage('bigBlind', now + 2800);
  assert.equal(game.potView.flights.length, 0); assert.equal(sum(game.potView.coins), 15);
});

test('joining during posted blinds or the subsequent deal restores the pot without replaying the opening wagers', t => {
  const { game, actions, visible } = fixture(t), h = hand();
  for (const [index, metadata] of [{ opening: { hand: 1, stage: 'bigBlind' } }, { deal: { hand: 1, boardCount: 0, startedAt: Date.now() } }].entries()) {
    const room = { code: `JOIN${index}`, phase: 'playing', dealing: true, ...metadata, hand: h.snapshot('p0') };
    game.potView.sync(room, 'p0', 0); actions.sync(room, 'p0');
    assert.equal(game.potView.flights.length, 0); assert.equal(sum(game.potView.coins), 15); assert.equal(visible(), 6000);
  }
});

test('draft transfers and delayed confirmations conserve chips; the same submitted meshes land exactly once', t => {
  const { game, actions, messages, sync, tick, visible } = fixture(t), h = hand();
  sync(h); tick(performance.now() + 1000); assert.equal(visible(), 6000);
  actions.begin({ chipRole: 'bank' }, { x: 0, y: 100 }, 0); actions.release({ x: 0, y: 100 }, 1);
  assert.equal(actions.pending, 10); assert.equal(visible(), 6000);
  tick(performance.now() + 400); assert.equal(sum(game.betView.stageCoins), 10); assert.equal(visible(), 6000);
  actions.begin({ chipRole: 'staged' }, { x: 0, y: 100 }, 10); actions.release({ x: 0, y: 100 }, 11);
  assert.equal(actions.pending, 0); assert.equal(visible(), 6000); tick(performance.now() + 400); assert.equal(visible(), 6000);
  actions.begin({ chipRole: 'bank' }, { x: 0, y: 100 }, 20); actions.release({ x: 0, y: 100 }, 21);
  actions.begin({ chipRole: 'staged' }, { x: 0, y: 100 }, 30); actions.release({ x: 0, y: 0 }, 40);
  assert.equal(messages.length, 1); assert.equal(visible(), 6000);
  const submitted = [...game.betView.stageCoins.children], now = game.betView.flight.start + 2000;
  tick(now); assert.ok(game.betView.flight); assert.equal(sum(game.betView.stageCoins), 10); assert.equal(visible(), 6000);
  h.act('p0', messages[0].type, messages[0].amount); sync(h, now);
  assert.equal(game.betView.flight, null); assert.equal(visible(), 6000);
  assert.ok(submitted.every(coin => game.potView.coins.children.includes(coin)), 'confirmation must move the submitted coin meshes into the pot');
  const amount = game.potView.amount; sync(h, now + 1); assert.equal(game.potView.amount, amount); assert.equal(visible(), 6000);
});

test('rejected wagers restore the draft without creating pot money', t => {
  const { game, actions, sync, tick, visible } = fixture(t), h = hand();
  sync(h); tick(performance.now() + 1000); const amount = game.potView.amount;
  actions.begin({ chipRole: 'bank' }, { x: 0, y: 100 }, 0); actions.release({ x: 0, y: 100 }, 1);
  actions.begin({ chipRole: 'staged' }, { x: 0, y: 100 }, 2); actions.release({ x: 0, y: 0 }, 3);
  tick(game.betView.flight.start + 900); assert.equal(visible(), 6000);
  game.betView.cancelFlight(); actions.reject(); assert.equal(actions.pending, 10); assert.equal(visible(), 6000);
  tick(performance.now() + 400); assert.equal(sum(game.betView.stageCoins), 10); assert.equal(game.potView.amount, amount); assert.equal(visible(), 6000);
});

test('a wager confirmed from another client discards the old local draft instead of returning nonexistent chips', t => {
  const { game, actions, sync, tick, visible } = fixture(t), h = hand();
  sync(h); tick(performance.now() + 1000);
  const start = { x: 0, y: TABLE_GESTURES.sliderTravel };
  actions.begin({ chipRole: 'bank' }, start, 0); actions.move({ x: 0, y: 0 }, 400); actions.release({ x: 0, y: 0 }, 410);
  assert.equal(actions.pending, h.players[0].chips); assert.equal(visible(), 6000);
  h.act('p0', 'allin'); sync(h);
  assert.equal(actions.pending, 0); assert.equal(game.betView.transfers.length, 0); assert.equal(visible(), 6000);
  tick(performance.now() + 1000); assert.equal(visible(), 6000); assert.equal(sum(game.betView.reserveCoins), 0);
});

test('side pots, split awards and unmatched refunds leave the pot and enter the correct bankrolls without duplication', t => {
  const { game, sync, tick, visible } = fixture(t), h = hand([50, 100, 200]);
  h.players.forEach((player, index) => { player.total = [50, 100, 200][index]; player.chips = 0; });
  h.board = [0, 15, 30, 45, 8]; h.players[0].cards = [25, 38]; h.players[1].cards = [24, 37]; h.players[2].cards = [23, 36];
  sync(h); assert.equal(visible(), 350);
  h.settle(true); const now = performance.now(); sync(h, now);
  assert.equal(h.result.pots.length, 2); assert.equal(h.result.refund.amount, 100); assert.equal(visible(), 350);
  tick(now + 1000); assert.equal(game.potView.amount, 350); assert.equal(visible(), 350);
  tick(now + 1700); assert.equal(game.potView.amount, 0); assert.equal(sum(game.potView.coins), 0); assert.equal(visible(), 350);
  tick(now + 2400); assert.equal(game.potView.flights.length, 0); assert.equal(visible(), 350);
  for (const player of h.players) {
    const model = player.id === 'p0' ? game.betView.reserveCoins : game.potView.playerBank(player.id).coins;
    assert.equal(sum(model), player.chips);
  }
  sync(h, now + 2500); assert.equal(game.potView.flights.length, 0); assert.equal(game.potView.amount, 0); assert.equal(visible(), 350);
});

test('spectators see exact bankrolls; settled reconnects do not replay payouts and leaving clears all chip flights', t => {
  const { game, sync, tick, visible } = fixture(t, 'spectator'), h = hand([200, 200]);
  h.act('p0', 'fold'); assert.ok(h.done);
  sync(h); assert.equal(game.potView.amount, 0); assert.equal(game.potView.flights.length, 0); assert.equal(visible(), 400);
  const next = hand(h.players.map(player => player.chips), { number: 2 }); sync(next);
  assert.equal(visible(), 400); assert.ok(game.potView.flights.length > 0);
  sync(null); assert.equal(game.potView.root.visible, false); assert.equal(game.potView.flights.length, 0); assert.equal(game.betView.transfers.length, 0);
  tick(performance.now() + 2000); assert.equal(game.potView.root.visible, false);
});

test('long sequences of small wagers keep exact pot values with bounded mesh counts', t => {
  const { game, sync, tick, visible } = fixture(t, 'spectator'), h = hand([1000, 1000]);
  sync(h); tick(performance.now() + 1000);
  for (let index = 0; index < 220; index++) {
    const player = h.players[index % 2]; player.chips--; player.total++;
    sync(h); tick(performance.now() + 1000);
    assert.equal(game.potView.amount, h.snapshot('spectator').pot); assert.equal(visible(), 2000);
    assert.ok(game.potView.coins.children.length <= 96);
  }
});

test('split pots preserve odd chips and each recipient receives their exact server award', t => {
  const { game, sync, tick, visible } = fixture(t), h = hand([100, 100, 100]);
  h.board = [8, 9, 10, 11, 12]; h.players.forEach(player => { player.chips = 99; player.total = 1; }); h.players[2].folded = true;
  sync(h); tick(performance.now() + 1000);
  h.settle(true); const now = performance.now(); sync(h, now); assert.equal(visible(), 300);
  tick(now + 700); assert.equal(visible(), 300); tick(now + 1400); assert.equal(visible(), 300);
  assert.equal(sum(game.betView.reserveCoins), 100); assert.equal(sum(game.potView.playerBank('p1').coins), 101); assert.equal(sum(game.potView.playerBank('p2').coins), 99);
  assert.equal(game.potView.amount, 0);
});

test('complete varied multi-player hands conserve visible chips through every server action and settlement', t => {
  const { game, sync, tick, visible } = fixture(t);
  let seed = 20261030; const random = size => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % size; };
  for (let number = 1; number <= 24; number++) {
    const balances = Array.from({ length: 2 + random(5) }, () => 40 + random(400)), capital = balances.reduce((sum, chips) => sum + chips, 0);
    const h = hand(balances, { number, ante: random(4) });
    sync(h); assert.equal(visible(), capital);
    let steps = 0;
    while (!h.done && steps++ < 300) {
      const player = h.players.find(player => player.seat === h.actor), legal = h.legal(player.id), choice = random(8);
      if (choice === 0) h.act(player.id, 'fold');
      else if (choice === 1 && legal.canAllIn) h.act(player.id, 'allin');
      else if (choice === 2 && legal.canRaise && legal.minTo <= legal.maxTo) h.act(player.id, 'raise', legal.minTo);
      else h.act(player.id, legal.canCheck ? 'check' : 'call');
      sync(h); assert.equal(visible(), capital, `hand ${number}, action ${steps}`);
      tick(performance.now() + 1000); assert.equal(visible(), capital);
    }
    assert.ok(h.done);
    const now = performance.now(); tick(now + 2000); tick(now + 3000); tick(now + 4000);
    assert.equal(visible(), capital); assert.equal(game.potView.amount, 0); assert.equal(game.potView.flights.length, 0);
    for (const player of h.players) assert.equal(sum(player.id === 'p0' ? game.betView.reserveCoins : game.potView.playerBank(player.id).coins), player.chips);
  }
});
