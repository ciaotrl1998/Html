import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import * as THREE from 'three';

registerHooks({ resolve(specifier, context, next) {
  if (specifier === '/vendor/three.js') return next('three', context);
  if (specifier === '/shared/scene-layout.js') return next(new URL('../shared/scene-layout.js', import.meta.url).href, context);
  return next(specifier, context);
} });
const { PlayerRosterState, PlayerRoster } = await import('../client/player-roster.js');
const { createPlayerPortraits } = await import('../client/player-portraits.js');

function room(count = 8) {
  const seats = Array.from({ length: 8 }, (_, seat) => seat < count ? { id: `p${seat}`, seat, name: `玩家${seat}`, kind: seat ? 'ai' : 'human', connected: true } : { seat, kind: 'open' });
  return { code: '123456', phase: 'playing', config: { startingChips: 2000 }, seats,
    hand: { number: 1, street: 'preflop', button: 0, sbSeat: 1, bbSeat: 2, actor: 0, board: [], history: [], done: false,
      players: seats.slice(0, count).map(seat => ({ ...seat, chips: 1980, bet: 20, total: 20, cards: seat.seat ? [null, null] : [12, 25], folded: false })) } };
}

test('all occupied seats, including self, show exact bankrolls and current-street bets with a stable seat order', () => {
  const state = room(), roster = new PlayerRosterState(), players = roster.update(state, 'p0');
  assert.equal(players.length, 8); assert.deepEqual(players.map(player => player.id), state.seats.map(seat => seat.id));
  assert.equal(players[0].mine, true); assert.equal(players[0].active, true);
  for (const player of players) {
    assert.equal(player.chips, 1980); assert.equal(player.bet, 20); assert.equal(player.status, player.name);
    assert.equal(player.result, null);
  }
  assert.equal(players[0].badge, 'D'); assert.equal(players[1].badge, 'SB'); assert.equal(players[2].badge, 'BB');
  state.dealing = true; assert.ok(roster.update(state, 'p0').every(player => !player.active));
  state.hand = null; state.phase = 'lobby'; state.seats[0].connected = false;
  const lobby = roster.update(state, 'p0'); assert.equal(lobby[0].chips, 2000); assert.equal(lobby[0].disconnected, true);
  assert.equal(roster.update(room(2), 'p0').length, 2, 'open seats do not become fake players');
});

test('actions replace names for this round, survive partial histories, and reset on a new street or hand', () => {
  const state = room(), roster = new PlayerRosterState();
  state.hand.players[0].action = '小盲';
  assert.equal(roster.update(state, 'p0')[0].status, '玩家0');
  state.hand.history.push({ seat: 0, street: 'preflop', action: '跟注 10' });
  assert.equal(roster.update(state, 'p0')[0].status, '已跟注');
  state.hand.history = [];
  assert.equal(roster.update(state, 'p0')[0].status, '已跟注');
  state.hand.street = 'flop'; state.hand.players.forEach(player => { player.bet = 0; });
  const flop = roster.update(state, 'p0'); assert.equal(flop[0].status, '玩家0'); assert.equal(flop[0].bet, 0);
  state.hand.history.push({ seat: 0, street: 'flop', action: '加注至 1000' });
  assert.equal(roster.update(state, 'p0')[0].status, '已加注');
  state.hand.players[1].folded = true; state.hand.players[2].chips = 0;
  const statuses = roster.update(state, 'p0'); assert.equal(statuses[1].status, '已弃牌'); assert.equal(statuses[2].status, '已全下');
  state.hand.number++; state.hand.history = [];
  assert.equal(roster.update(state, 'p0')[0].status, '玩家0');
  assert.deepEqual(roster.update(null, 'p0'), []);
});

function settledRoom() {
  const state = room(4);
  Object.assign(state.hand, { done: true, board: [0, 18, 28, 49, 38], result: { showdown: true, pots: [{ awards: [{ id: 'p1', amount: 100 }] }] } });
  state.hand.players[1].cards = [25, 43]; state.hand.players[2].cards = [12, 11]; state.hand.players[2].folded = true;
  state.seats[4] = { id: 'busted', seat: 4, name: '出局玩家', kind: 'ai', chips: 0 };
  return state;
}

test('settlement uses only publicly revealed cards; folds, non-showdowns and eliminated players keep card backs', () => {
  const state = settledRoom(), roster = new PlayerRosterState(), players = roster.update(state, 'p0');
  assert.deepEqual(players[1].result.cards, [25, 43]); assert.equal(players[1].result.winner, true);
  assert.deepEqual(players[2].result.cards, [null, null]); assert.equal(players[2].status, '已弃牌');
  assert.deepEqual(players[3].result.cards, [null, null]); assert.equal(players[3].status, '未公开');
  assert.equal(players[4].status, '已出局'); assert.deepEqual(players[4].result.cards, [null, null]);
  state.hand.result.showdown = false;
  assert.ok(roster.update(state, 'p0').every(player => player.result.cards.every(card => card === null)));
});

function fakeDocument() {
  const calls = [], ctx = new Proxy({ measureText: text => ({ width: String(text).length * 12 }) }, { get: (target, key) => key in target ? target[key] : (...args) => calls.push({ method: key, args }) });
  const doc = { createElement(tag) {
    const classes = new Set();
    return { ownerDocument: doc, tag, children: [], attributes: {}, style: { setProperty(key, value) { this[key] = value; } }, clientWidth: 40,
      classList: { toggle(key, active) { if (active) classes.add(key); else classes.delete(key); }, contains: key => classes.has(key) },
      append(...children) { this.children.push(...children); children.forEach(child => { child.parentNode = this; }); },
      replaceChildren(...children) { this.children = children; children.forEach(child => { child.parentNode = this; }); },
      setAttribute(key, value) { this.attributes[key] = value; }, remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(child => child !== this); },
      getContext: () => ctx
    };
  } }; return { doc, calls };
}

test('rendering swaps money for cards at settlement, restores it next hand, and clears on leaving', () => {
  const { doc, calls } = fakeDocument(), container = doc.createElement('div'); container.clientWidth = 496;
  const roster = new PlayerRoster(container), playing = room(4);
  roster.render(playing, 'p0'); const entry = roster.entries.get('p1');
  assert.equal(entry.chips.textContent, '1,980'); assert.equal(entry.bet.textContent, '20'); assert.equal(entry.status.textContent, '玩家1');
  assert.equal(entry.cards.hidden, true); assert.equal(entry.chips.hidden, false);
  const settled = settledRoom(); roster.render(settled, 'p0');
  assert.equal(roster.entries.get('p1'), entry, 'state updates reuse portraits and elements');
  assert.equal(entry.chips.hidden, true); assert.equal(entry.bet.hidden, true); assert.equal(entry.cards.hidden, false);
  assert.equal(entry.chips.textContent, ''); assert.equal(entry.bet.textContent, '');
  assert.ok(!entry.root.attributes['aria-label'].includes('筹码'));
  assert.equal(calls.filter(call => call.method === 'roundRect').length, 10);
  assert.equal(entry.status.textContent, '一对'); assert.match(entry.root.className, /winner/);
  const paints = calls.length; roster.render(settled, 'p0'); assert.equal(calls.length, paints, 'unchanged results do not repaint canvases');
  roster.setPortraits(Array.from({ length: 8 }, (_, seat) => `portrait-${seat}`)); assert.equal(entry.image.src, 'portrait-1');
  playing.hand.number++; roster.render(playing, 'p0');
  assert.equal(entry.cards.hidden, true); assert.equal(entry.chips.hidden, false); assert.equal(entry.chips.textContent, '1,980');
  container.clientWidth = 320; roster.updateLayout(); assert.equal(container.classList.contains('crowded'), true);
  roster.render(null, 'p0'); assert.equal(roster.entries.size, 0); assert.equal(container.children.length, 0);
});

test('portraits render all eight seat characters, flip GPU rows and restore the shared renderer even on failure', () => {
  const geometries = [], materials = [], scenes = [], created = [], targetBefore = { original: true };
  let target = targetBefore, images = 0;
  const doc = { createElement: () => ({ getContext: () => ({ createImageData: (width, height) => ({ data: new Uint8Array(width * height * 4) }),
    putImageData(image) { assert.equal(image.data[0], 159); assert.equal(image.data[(160 - 1) * 128 * 4], 0); }
  }), toDataURL: () => `portrait-${images++}` }) };
  const renderer = { shadowMap: { enabled: true }, getRenderTarget: () => target, setRenderTarget(value) { target = value; },
    render(scene) { scenes.push(scene); }, readRenderTargetPixels(target, x, y, width, height, pixels) { for (let row = 0; row < height; row++) pixels.fill(row, row * width * 4, (row + 1) * width * 4); } };
  const factory = seat => {
    created.push(seat); const geometry = new THREE.BoxGeometry(), material = new THREE.MeshBasicMaterial();
    geometry.addEventListener('dispose', () => geometries.push(seat)); material.addEventListener('dispose', () => materials.push(seat));
    const character = new THREE.Group(); character.add(new THREE.Mesh(geometry, material)); return character;
  };
  assert.equal(createPlayerPortraits(renderer, factory, doc).length, 8);
  assert.deepEqual(created, [0, 1, 2, 3, 4, 5, 6, 7]); assert.equal(geometries.length, 8); assert.equal(materials.length, 8);
  assert.equal(target, targetBefore); assert.equal(renderer.shadowMap.enabled, true);
  assert.ok(scenes.every(scene => scene.children.every(child => !child.isGroup)), 'temporary portrait models are removed');
  renderer.render = () => { throw new Error('GPU unavailable'); };
  assert.throws(() => createPlayerPortraits(renderer, factory, doc), /GPU unavailable/);
  assert.equal(target, targetBefore); assert.equal(renderer.shadowMap.enabled, true);
});
