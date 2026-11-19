import test from 'node:test';
import assert from 'node:assert/strict';
import { PokerHand } from '../shared/poker.js';
import { chipGiftLimit } from '../shared/chip-gifts.js';
import { giftSeatState, lobbyChips, settleChipGifts, transferChipGift } from '../server/chip-gifts.js';
import { PlayerInfo } from '../client/player-info.js';

function room() {
  const players = Array.from({ length: 3 }, (_, seat) => ({ id: `p${seat}`, name: `玩家${seat}`, seat, chips: 100 }));
  const hand = new PokerHand({ players, button: 0, smallBlind: 5, bigBlind: 10, deck: Array.from({ length: 52 }, (_, i) => i) });
  return { code: '123456', phase: 'playing', supportsChipGifts: true, hand, handNumber: 1, turnId: 'turn-1', deadline: 12345,
    players: structuredClone(players), seats: players.map(p => ({ ...p, kind: 'human', connected: true })), config: { startingChips: 100 } };
}

const publish = state => ({ ...state, seats: state.seats.map(seat => ({ ...seat, ...giftSeatState(state, seat) })) });

test('gifts move only free chips, preserve the pot, legal turn and timer, and retain conservation through settlement', () => {
  const state = room(), before = state.hand.snapshot('p0');
  assert.equal(chipGiftLimit(publish(state), 'p0', 'p1').maximum, 99);
  transferChipGift(state, 'p0', 'p1', 40);
  assert.deepEqual(state.hand.players.map(p => p.chips), [60, 135, 90]);
  assert.deepEqual(state.players.map(p => p.chips), [60, 140, 100], 'match records retain committed chips until settlement');
  const after = state.hand.snapshot('p0');
  assert.equal(after.pot, before.pot); assert.deepEqual(after.players.map(p => [p.bet, p.total]), before.players.map(p => [p.bet, p.total]));
  assert.equal(after.actor, before.actor); assert.equal(state.turnId, 'turn-1'); assert.equal(state.deadline, 12345);
  while (!state.hand.done) { const actor = state.hand.players.find(p => p.seat === state.hand.actor), legal = state.hand.legal(actor.id); state.hand.act(actor.id, legal.canCheck ? 'check' : 'call'); }
  assert.equal(state.hand.players.reduce((sum, p) => sum + p.chips, 0), 300);
});

test('invalid, self and spectator transfers never change funds', () => {
  for (const amount of [0, -1, 1.5, '10', NaN, Infinity, 100, 101]) {
    const state = room(), before = state.hand.players.map(p => p.chips);
    assert.throws(() => transferChipGift(state, 'p0', 'p1', amount)); assert.deepEqual(state.hand.players.map(p => p.chips), before);
  }
  for (const ids of [['p0', 'p0'], ['observer', 'p1'], ['p0', 'unknown']]) assert.throws(() => transferChipGift(room(), ...ids, 1));
});

test('gifts during an all-in keep that player out of betting until the credits are applied at settlement', () => {
  const state = room();
  const recipient = state.hand.players[1];
  state.hand.pay(recipient, recipient.chips);
  state.actionPresentation = { type: 'allin' };
  const pot = state.hand.snapshot('p0').pot;
  const receipt = transferChipGift(state, 'p0', 'p1', 40);
  assert.equal(receipt.deferred, true);
  assert.equal(recipient.chips, 0);
  assert.equal(state.hand.snapshot('p0').pot, pot);
  assert.equal(publish(state).seats[1].pendingGift, 40);
  transferChipGift(state, 'p1', 'p2', 10);
  assert.equal(recipient.chips, 0);
  assert.equal(publish(state).seats[1].pendingGift, 30);
  settleChipGifts(state);
  assert.equal(recipient.chips, 30);
  assert.equal(state.hand.players.reduce((sum, player) => sum + player.chips + player.total, 0), 300);
});

test('gifts restore players missing from the current hand and keep their balance available for the next hand', () => {
  const state = room();
  const [, absent] = state.players;
  state.hand.players = state.hand.players.filter(player => player.id !== absent.id);
  absent.chips = 0; absent.eliminatedAt = 1; absent.beforeBust = 100;
  state.dealing = true;
  transferChipGift(state, 'p0', absent.id, 50);
  assert.equal(absent.chips, 50); assert.equal(absent.eliminatedAt, undefined);
  assert.equal(state.hand.players.some(player => player.id === absent.id), false);
  assert.equal(chipGiftLimit(publish(state), absent.id, 'p0').maximum, 50);
});

test('gifts during settlement can spend a free stack but cannot spend a payout before it is revealed', () => {
  const state = room();
  state.hand.act('p0', 'fold'); state.hand.act('p1', 'fold');
  state.dealing = true; state.settling = true;
  const result = structuredClone(state.hand.result);
  assert.equal(chipGiftLimit(publish(state), 'p2', 'p0').maximum, 89);
  assert.throws(() => transferChipGift(state, 'p2', 'p0', 90));
  transferChipGift(state, 'p2', 'p0', 89);
  assert.deepEqual(state.hand.result, result);
  state.dealing = state.settling = false;
  assert.equal(chipGiftLimit(publish(state), 'p2', 'p0').maximum, 16);
});

test('gifts between matches prepare upcoming stacks without changing final scores', () => {
  const state = room(); state.phase = 'finished';
  const records = structuredClone(state.players);
  assert.equal(transferChipGift(state, 'p0', 'p1', 30).nextMatch, true);
  assert.deepEqual(state.players, records);
  state.phase = 'lobby';
  assert.deepEqual(['p0', 'p1', 'p2'].map(id => lobbyChips(state, id)), [70, 130, 100]);
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
  const state = room(), update = (connected = true) => info.update(publish(state), 'p0', connected);
  update();
  return { root, info, state, sent, messages, handlers, update };
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

test('gift form stays usable across hands and clamps to current funds', () => {
  const f = surface(); f.info.show(1); f.info.gift.onclick(); f.info.slider.value = '90'; f.info.slider.oninput();
  f.state.hand.players[0].chips = 10; f.update(); assert.equal(f.info.slider.max, '9'); assert.equal(f.info.selected, 9);
  f.info.confirm.onclick(); assert.equal(f.info.reject({ requestId: 'gift-test-1', message: '牌局已更新' }), true);
  assert.equal(f.info.pending, null); assert.equal(f.info.reason.textContent, '牌局已更新');
  f.state.handNumber++; f.update(); assert.equal(f.info.mode, 'gift');
  f.info.close(); f.state.supportsChipGifts = false; f.update(); f.info.show(1);
  assert.equal(f.info.gift.disabled, true); assert.match(f.info.reason.textContent, /重启/);
  f.update(false); assert.equal(f.root.hidden, true);
});

test('closing an unsent gift from outside the panel or with Escape resets its mode and amount', () => {
  const f = surface();
  for (const [event, detail] of [['pointerdown', { target: {} }], ['keydown', { key: 'Escape' }]]) {
    f.info.show(1); f.info.gift.onclick(); f.info.slider.value = '23'; f.info.slider.oninput();
    f.handlers.get(event)(detail);
    assert.equal(f.root.hidden, true);
    f.info.confirm.onclick(); assert.deepEqual(f.sent, []);
    f.info.show(1);
    assert.equal(f.info.summary.hidden, false); assert.equal(f.info.amountRow.hidden, true);
    f.info.gift.onclick(); assert.equal(f.info.slider.value, '1');
  }
});
