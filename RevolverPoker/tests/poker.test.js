import test from 'node:test';
import assert from 'node:assert/strict';
import { randomInt } from 'node:crypto';
import { PokerHand, evaluate, compareHands, shuffledDeck, handName } from '../shared/poker.js';

const c = (rank, suit = 0) => suit * 13 + rank - 2;
const make = (chips = [200, 200, 200], extra = {}) => new PokerHand({ players: chips.map((chips, seat) => ({ id: `p${seat}`, name: `P${seat}`, seat, chips })), button: 0, smallBlind: 5, bigBlind: 10, deck: shuffledDeck(randomInt), ...extra });
function doAction(hand, type = 'call', amount) {
  const p = hand.players.find(p => p.seat === hand.actor);
  if (type === 'call' && hand.legal(p.id).canCheck) type = 'check';
  hand.act(p.id, type, amount);
}

test('best five cards: wheel, double trips, kicker and royal flush', () => {
  assert.deepEqual(evaluate([c(14), c(2, 1), c(3, 2), c(4, 3), c(5), c(9), c(10)]), [4, 5]);
  assert.deepEqual(evaluate([c(14), c(14, 1), c(14, 2), c(13), c(13, 1), c(13, 2), c(2)]), [6, 14, 13]);
  assert.equal(handName(evaluate([10, 11, 12, 8, 9, c(2, 1), c(3, 1)])), '皇家同花顺');
  assert.ok(compareHands([1, 13, 14, 9, 8], [1, 13, 12, 11, 10]) > 0);
  assert.ok(compareHands([5, 14, 10, 8, 7, 2], [4, 14]) > 0);
});
test('heads-up button is small blind, acts first preflop and last postflop', () => {
  const h = make([200, 200]);
  assert.equal(h.sbSeat, 0); assert.equal(h.bbSeat, 1); assert.equal(h.actor, 0);
  doAction(h); assert.equal(h.actor, 1); doAction(h);
  assert.equal(h.street, 'flop'); assert.equal(h.actor, 1); assert.equal(h.burned.length, 1);
});
test('big blind keeps its option; illegal action cannot change funds', () => {
  const h = make();
  const before = h.players.reduce((n, p) => n + p.chips + p.total, 0);
  assert.throws(() => h.act('p1', 'fold'));
  assert.throws(() => h.act('p0', 'check'));
  doAction(h); doAction(h);
  assert.equal(h.street, 'preflop'); assert.equal(h.actor, 2);
  assert.equal(h.players.reduce((n, p) => n + p.chips + p.total, 0), before);
  doAction(h); assert.equal(h.street, 'flop');
});
test('minimum raise uses the last full increment', () => {
  const h = make();
  doAction(h, 'raise', 30);
  assert.equal(h.legal('p1').minTo, 50);
  assert.throws(() => h.act('p1', 'raise', 40));
  doAction(h, 'raise', 50);
  assert.equal(h.legal('p2').minTo, 70);
});
test('short all-in does not reopen betting; cumulative short raises can reopen', () => {
  const h = make([200, 35, 200]);
  doAction(h, 'raise', 30); doAction(h, 'allin'); doAction(h);
  assert.equal(h.actor, 0); assert.equal(h.legal('p0').canRaise, false);
  assert.throws(() => h.act('p0', 'raise', 60));
  doAction(h); assert.equal(h.street, 'flop');
  const x = make([200, 40, 50, 200]);
  // Order preflop: seat 3 -> 0 -> 1 -> 2.
  doAction(x, 'raise', 30); doAction(x); doAction(x, 'allin'); doAction(x, 'allin');
  assert.equal(x.actor, 3); assert.equal(x.legal('p3').canRaise, true);
});
test('different all-ins create independent side pots and return unmatched chips', () => {
  const h = make([50, 100, 200]);
  // Arrange showdown directly to isolate pot accounting.
  for (const p of h.players) { p.chips = 0; p.total = [50, 100, 200][p.seat]; p.folded = false; }
  h.board = [c(2), c(4, 1), c(6, 2), c(8, 3), c(10)];
  h.players[0].cards = [c(14, 1), c(14, 2)];
  h.players[1].cards = [c(13, 1), c(13, 2)];
  h.players[2].cards = [c(12, 1), c(12, 2)];
  h.settle(true);
  assert.deepEqual(h.result.pots.map(p => p.amount), [150, 100]);
  assert.deepEqual(h.players.map(p => p.chips), [150, 100, 100]);
  assert.equal(h.result.refund.amount, 100);
});
test('split pot odd chip goes to the first winner left of button; folded cards stay hidden', () => {
  const h = make([100, 100, 100]);
  h.board = [c(10), c(11), c(12), c(13), c(14)];
  for (const p of h.players) { p.chips = 99; p.total = 1; }
  h.players[2].folded = true;
  h.settle(true);
  assert.equal(h.players[1].chips, 101); assert.equal(h.players[0].chips, 100);
  const v = h.snapshot('p0');
  assert.ok(v.players[1].cards.every(c => c !== null));
  assert.deepEqual(v.players[2].cards, [null, null]);
  assert.equal('deck' in v, false);
});
test('short blind all-in cannot force a lone opponent to call a phantom full blind', () => {
  const h = make([100, 3]);
  assert.equal(h.done, true);
  assert.equal(h.board.length, 5);
  assert.equal(h.players.reduce((s, p) => s + p.chips, 0), 103);
});
test('1000 random 2–8-player hands terminate, preserve money and never duplicate a card', () => {
  for (let trial = 0; trial < 1000; trial++) {
    const count = 2 + randomInt(7);
    const chips = Array.from({ length: count }, () => 1 + randomInt(500));
    const total = chips.reduce((a, b) => a + b, 0);
    const h = make(chips, { ante: trial % 7 });
    let steps = 0;
    while (!h.done && steps++ < 500) {
      const p = h.players.find(p => p.seat === h.actor), l = h.legal(p.id);
      const choice = randomInt(10);
      if (choice === 0) h.act(p.id, 'fold');
      else if (choice < 3 && l.canAllIn) h.act(p.id, 'allin');
      else if (choice < 5 && l.canRaise && l.maxTo >= l.minTo) h.act(p.id, 'raise', l.minTo);
      else h.act(p.id, l.canCheck ? 'check' : 'call');
      assert.equal(h.players.reduce((n, p) => n + p.chips + (h.done ? 0 : p.total), 0), total);
    }
    assert.equal(h.done, true, `trial ${trial}`);
    const used = [...h.board, ...h.burned, ...h.players.flatMap(p => p.cards)];
    assert.equal(new Set(used).size, used.length);
  }
});
