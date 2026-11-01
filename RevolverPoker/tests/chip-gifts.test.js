import test from 'node:test';
import assert from 'node:assert/strict';
import { PokerHand } from '../shared/poker.js';
import { chipGiftLimit } from '../shared/chip-gifts.js';
import { transferChipGift } from '../server/chip-gifts.js';
import { PlayerInfo } from '../client/player-info.js';

function room() {
  const players = Array.from({ length: 3 }, (_, seat) => ({ id: `p${seat}`, name: `玩家${seat}`, seat, chips: 100 }));
  const hand = new PokerHand({ players, button: 0, smallBlind: 5, bigBlind: 10, deck: Array.from({ length: 52 }, (_, i) => i) });
  return { code: '123456', phase: 'playing', supportsChipGifts: true, hand, handNumber: 1, turnId: 'turn-1', deadline: 12345,
    players: structuredClone(players), seats: players.map(p => ({ ...p, kind: 'human', connected: true })), config: { startingChips: 100 } };
}

test('gifts move only free chips, preserve the pot, legal turn and timer, and retain conservation through settlement', () => {
  const state = room(), before = state.hand.snapshot('p0');
  assert.equal(chipGiftLimit(state, 'p0', 'p1').maximum, 99);
  transferChipGift(state, 'p0', 'p1', 40);
  assert.deepEqual(state.hand.players.map(p => p.chips), [60, 135, 90]);
  assert.deepEqual(state.players.map(p => p.chips), [60, 140, 100], 'match records retain committed chips until settlement');
  const after = state.hand.snapshot('p0');
  assert.equal(after.pot, before.pot); assert.deepEqual(after.players.map(p => [p.bet, p.total]), before.players.map(p => [p.bet, p.total]));
  assert.equal(after.actor, before.actor); assert.equal(state.turnId, 'turn-1'); assert.equal(state.deadline, 12345);
  while (!state.hand.done) { const actor = state.hand.players.find(p => p.seat === state.hand.actor), legal = state.hand.legal(actor.id); state.hand.act(actor.id, legal.canCheck ? 'check' : 'call'); }
  assert.equal(state.hand.players.reduce((sum, p) => sum + p.chips, 0), 300);
});

test('invalid, self, spectator, all-in and stale-stage transfers never change funds', () => {
  for (const amount of [0, -1, 1.5, '10', NaN, Infinity, 100, 101]) {
    const state = room(), before = state.hand.players.map(p => p.chips);
    assert.throws(() => transferChipGift(state, 'p0', 'p1', amount)); assert.deepEqual(state.hand.players.map(p => p.chips), before);
  }
  for (const ids of [['p0', 'p0'], ['observer', 'p1'], ['p0', 'unknown']]) assert.throws(() => transferChipGift(room(), ...ids, 1));
  for (const property of ['dealing', 'settling', 'opening']) { const state = room(); state[property] = true; assert.throws(() => transferChipGift(state, 'p0', 'p1', 1)); }
  const allIn = room(); allIn.hand.players[1].chips = 0;
  assert.match(chipGiftLimit(allIn, 'p0', 'p1').reason, /全下/); assert.throws(() => transferChipGift(allIn, 'p0', 'p1', 1));
});

test('settled transfers can restore a just-busted player for the next hand without changing awards or the countdown', () => {
  const state = room(); state.hand.done = true; state.hand.result = { showdown: false, pots: [] };
  state.hand.players.forEach((p, i) => { p.chips = i ? 0 : 300; state.players[i].chips = p.chips; });
  state.players[1].eliminatedAt = 1; state.players[1].beforeBust = 100; state.finishing = true;
  const result = structuredClone(state.hand.result);
  transferChipGift(state, 'p0', 'p1', 50);
  assert.equal(state.players[1].chips, 50); assert.equal(state.players[1].eliminatedAt, undefined);
  assert.equal(state.finishing, false); assert.equal(state.deadline, 12345); assert.deepEqual(state.hand.result, result);
  state.stopAfterHand = true; transferChipGift(state, 'p0', 'p1', 1); assert.equal(state.finishing, true);
});

function surface() {
  const handlers = new Map(), doc = { addEventListener(type, fn) { handlers.set(type, fn); } };
  doc.createElement = () => ({ ownerDocument: doc, children: [], hidden: false, append(...children) { this.children.push(...children); },
    setAttribute() {}, contains(node) { return node === this || this.children.some(child => child.contains(node)); } });
  const root = doc.createElement(), sent = [], messages = [], info = new PlayerInfo(root, { send: (...args) => { sent.push(args); return true; }, notify: text => messages.push(text), makeId: () => 'gift-test-1' });
  const state = room(); info.update(state, 'p0', true);
  return { root, info, state, sent, messages, handlers };
}

test('player info opens a horizontal gift form, cancel sends nothing, and confirmation waits for one server receipt', () => {
  const f = surface(); assert.equal(f.info.show(0), false); assert.equal(f.info.show(1), true);
  assert.match(f.info.summary.textContent, /玩家1.*剩余 95.*本手投入 5/);
  assert.equal(f.info.amountRow.hidden, true); f.info.gift.onclick(); assert.equal(f.info.amountRow.hidden, false);
  assert.equal(f.info.slider.max, '99'); f.info.slider.value = '27'; f.info.slider.oninput(); assert.equal(f.info.amount.textContent, '27');
  f.info.cancel.onclick(); assert.equal(f.root.hidden, true); assert.deepEqual(f.sent, []);
  f.info.show(1); f.info.gift.onclick(); f.info.slider.value = '27'; f.info.slider.oninput();
  f.info.confirm.onclick(); f.info.confirm.onclick(); assert.equal(f.sent.length, 1);
  assert.equal(f.sent[0][0], 'gift-chips'); assert.equal(f.sent[0][1].amount, 27); assert.equal(f.sent[0][1].targetId, 'p1');
  assert.equal(f.state.hand.players[0].chips, 100, 'the client cannot deduct chips optimistically');
  f.info.accept({ requestId: 'other', amount: 27 }); assert.equal(f.root.hidden, false);
  f.info.accept({ requestId: 'gift-test-1', amount: 27 }); assert.equal(f.root.hidden, true); assert.match(f.messages[0], /玩家1.*27/);
});

test('gift form clamps against current funds, handles errors, stale hands, old servers and disconnection', () => {
  const f = surface(); f.info.show(1); f.info.gift.onclick(); f.info.slider.value = '90'; f.info.slider.oninput();
  f.state.hand.players[0].chips = 10; f.info.update(f.state, 'p0', true); assert.equal(f.info.slider.max, '9'); assert.equal(f.info.selected, 9);
  f.info.confirm.onclick(); assert.equal(f.info.reject({ requestId: 'gift-test-1', message: '牌局已更新' }), true);
  assert.equal(f.info.pending, null); assert.equal(f.info.reason.textContent, '牌局已更新');
  f.state.handNumber++; f.info.update(f.state, 'p0', true); assert.equal(f.info.mode, 'info');
  f.state.supportsChipGifts = false; f.info.update(f.state, 'p0', true); assert.equal(f.info.gift.disabled, true); assert.match(f.info.reason.textContent, /重启/);
  f.info.update(f.state, 'p0', false); assert.equal(f.root.hidden, true);
});
