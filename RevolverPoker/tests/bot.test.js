import test from 'node:test';
import assert from 'node:assert/strict';
import { PokerHand, shuffledDeck } from '../shared/poker.js';
import { estimateBotEquity, chooseBotAction } from '../server/bot.js';

const card = (rank, suit = 0) => suit * 13 + rank - 2;
function random(seed = 123) {
  return maximum => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return Math.floor(seed / 4294967296 * maximum); };
}
function view(cards = [card(14), card(14, 1)], board = [], count = 2) {
  return { button: 0, street: board.length === 5 ? 'river' : board.length ? 'flop' : 'preflop', bigBlind: 20, currentBet: 100,
    board, pot: count * 100, history: [], players: Array.from({ length: count }, (_, seat) => ({
      id: seat ? `p${seat}` : 'me', seat, chips: 1000, bet: 100, total: 100, folded: false, cards: seat ? [null, null] : cards })),
    legal: { toCall: 0, callAmount: 0, canCheck: true, canRaise: true, minTo: 120, maxTo: 1100, canAllIn: true } };
}
const royal = [10, 11, 12, 13, 14].map(rank => card(rank, 3));

test('preflop simulations distinguish premium and weak hands and include all seven opponents', () => {
  const aces = estimateBotEquity(view(), 'me', { trials: 1000, random: random(42) });
  const weak = estimateBotEquity(view([card(7), card(2, 1)]), 'me', { trials: 1000, random: random(42) });
  assert.ok(aces.equity > .78); assert.ok(weak.equity < .4);
  const table = estimateBotEquity(view([card(2), card(3)], royal, 8), 'me', { trials: 16, random: random() });
  assert.equal(table.equity, 1 / 8); assert.equal(table.callEquity, 1 / 8);
});

test('public preflop aggression narrows opponent ranges without reading their hole cards', () => {
  const open = view([card(14), card(12, 1)]);
  const tight = structuredClone(open);
  tight.history = [{ seat: 1, street: 'preflop', action: '加注至 400' }];
  const looseEquity = estimateBotEquity(open, 'me', { trials: 1600, random: random(7) }).equity;
  const tightEquity = estimateBotEquity(tight, 'me', { trials: 1600, random: random(7) }).equity;
  assert.ok(tightEquity < looseEquity - .03);
  const before = structuredClone(tight), revealed = structuredClone(tight);
  revealed.players[1].cards = [card(13, 2), card(13, 3)];
  assert.deepEqual(estimateBotEquity(tight, 'me', { random: random(9) }), estimateBotEquity(revealed, 'me', { random: random(9) }));
  assert.deepEqual(chooseBotAction(tight, 'me', 'hard', random(9)), chooseBotAction(revealed, 'me', 'hard', random(9)));
  assert.deepEqual(tight, before, 'deciding cannot mutate the rules snapshot');
});

test('call odds exclude unreachable side pots and split tied main and side pots by their eligible players', () => {
  const capped = view([card(2), card(3)], royal, 3);
  capped.players[0].total = 10; capped.players[0].bet = 10; capped.players[0].chips = 10;
  capped.players[1].total = 1000; capped.players[2].total = 1000;
  capped.legal.callAmount = 10;
  assert.equal(estimateBotEquity(capped, 'me', { trials: 4, random: random() }).eligiblePot, 60);
  const side = view([card(2), card(3)], royal, 3);
  side.players[1].total = 50; side.players[1].chips = 0; side.players[2].total = 200;
  side.legal.callAmount = 100;
  const result = estimateBotEquity(side, 'me', { trials: 12, random: random() });
  assert.equal(result.eligiblePot, 450);
  assert.ok(Math.abs(result.callEquity - 200 / 450) < 1e-10);
});

test('AI value-bets unbeatable cards, folds costly weak hands and never folds a free check', () => {
  const nuts = view([card(14), card(14, 3)], [card(14, 1), card(14, 2), card(7), card(6, 3), card(2, 1)]);
  const action = chooseBotAction(nuts, 'me', 'hard', random(23));
  assert.equal(action.type, 'raise'); assert.ok(action.amount >= nuts.legal.minTo && action.amount <= nuts.legal.maxTo);
  const weak = view([card(3), card(7, 3)], [card(2), card(5, 1), card(9, 2), card(11, 1), card(12, 3)]);
  weak.players[1].bet = 900; weak.players[1].total = 900; weak.pot = 1000; weak.currentBet = 900;
  weak.legal = { ...weak.legal, canCheck: false, canRaise: false, toCall: 800, callAmount: 800 };
  assert.equal(chooseBotAction(weak, 'me', 'hard', random(23)).type, 'fold');
  weak.legal = { ...weak.legal, canCheck: true, toCall: 0, callAmount: 0 };
  assert.equal(chooseBotAction(weak, 'me', 'hard', random(23)).type, 'check');
  const split = view([card(2), card(3)], royal);
  split.legal = { ...split.legal, canCheck: false, toCall: 900, callAmount: 900 };
  assert.equal(chooseBotAction(split, 'me', 'hard', random(23)).type, 'call', 'never fold a guaranteed profitable board split');
});

test('AI decisions obey real raise rights and short stacks through complete 2–8-player hands', () => {
  for (const count of [2, 3, 4, 8]) for (const seed of [17, 42]) {
    const rng = random(seed), chips = Array.from({ length: count }, (_, seat) => 35 + seat * 37);
    const hand = new PokerHand({ players: chips.map((chips, seat) => ({ id: `p${seat}`, seat, chips })),
      button: 0, smallBlind: 5, bigBlind: 10, deck: shuffledDeck(rng) });
    let actions = 0;
    while (!hand.done && actions < 200) {
      const player = hand.players.find(player => player.seat === hand.actor);
      const action = chooseBotAction(hand.snapshot(player.id), player.id, ['easy', 'normal', 'hard'][actions++ % 3], rng);
      assert.doesNotThrow(() => hand.act(player.id, action.type, action.amount));
    }
    assert.equal(hand.done, true);
    assert.equal(hand.players.reduce((sum, player) => sum + player.chips, 0), chips.reduce((sum, amount) => sum + amount, 0));
  }
});
