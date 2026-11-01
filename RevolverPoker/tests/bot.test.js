import test from 'node:test';
import assert from 'node:assert/strict';
import { PokerHand, shuffledDeck } from '../shared/poker.js';
import { estimateBotEquity, chooseBotAction, decideBotAction, createBotPersonality, createBotPersonalities, botRationality, getBotBluff, botBluffShowChance, shouldShowBotBluff } from '../server/bot.js';

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

test('only an actual bluff decision carries private reveal intent and lower hole cards increase the show chance', () => {
  const board = [card(2, 2), card(5, 1), card(9, 3)], profile = createBotPersonality(random(12), 'tricky');
  const weak = view([card(7), card(2, 1)], board), strong = view([card(14), card(13, 1)], board);
  const analysis = { equity: .1, callEquity: .1, eligiblePot: 200 };
  const bluff = decideBotAction(weak, 'me', 'hard', analysis, profile, () => 0);
  const higher = decideBotAction(strong, 'me', 'hard', analysis, profile, () => 0);
  assert.equal(bluff.type, 'raise'); assert.ok(getBotBluff(bluff));
  assert.deepEqual(Object.keys(bluff).sort(), ['amount', 'type'], 'intent and personality cannot enter action JSON');
  assert.ok(getBotBluff(bluff).weakness > getBotBluff(higher).weakness);
  assert.ok(botBluffShowChance(getBotBluff(bluff).weakness, profile) > botBluffShowChance(getBotBluff(higher).weakness, profile));
  const value = decideBotAction(weak, 'me', 'hard', { ...analysis, equity: .95, callEquity: .95 }, profile, () => 0);
  assert.equal(value.type, 'raise'); assert.equal(getBotBluff(value), null, 'a value bet is not mislabeled because a bluff roll also succeeded');
});

test('personality and card weakness change bluff-show rates; only the winning final aggression can be revealed', t => {
  const hand = view([card(7), card(2, 1)]); hand.done = true; hand.players[0].bot = true;
  hand.result = { showdown: false, pots: [{ awards: [{ id: 'me', amount: 200 }] }] };
  hand.history = [{ seat: 0, street: 'preflop', action: '加注至 100' }, { seat: 1, street: 'preflop', action: '弃牌' }];
  const bluff = { index: 0, street: 'preflop', weakness: .9 };
  const styles = ['tight', 'balanced', 'caller', 'aggressive', 'tricky'];
  const counts = styles.map(style => {
    const profile = createBotPersonality(random(12), style), rng = random(42); let shows = 0;
    for (let i = 0; i < 4000; i++) shows += shouldShowBotBluff(hand, 'me', bluff, profile, rng);
    return shows;
  });
  assert.ok(counts[4] > counts[3] && counts[3] > counts[1] && counts[1] > counts[2] && counts[2] > counts[0]);
  const low = { ...bluff, weakness: .2 }, tricky = createBotPersonality(random(12), 'tricky');
  assert.ok(botBluffShowChance(low.weakness, tricky) < botBluffShowChance(bluff.weakness, tricky));
  for (const mutate of [h => { h.done = false; }, h => { h.result.showdown = true; }, h => { h.players[0].bot = false; }, h => { h.players[0].folded = true; }, h => { h.players[0].shown = true; }, h => { h.street = 'flop'; }, h => { h.result.pots[0].awards[0].id = 'p1'; }, h => { h.history.push({ seat: 1, street: 'preflop', action: '加注至 200' }); }]) {
    const invalid = structuredClone(hand); mutate(invalid); assert.equal(shouldShowBotBluff(invalid, 'me', bluff, tricky, () => 0), false);
  }
  assert.equal(shouldShowBotBluff(hand, 'me', null, tricky, () => 0), false);
  assert.equal(shouldShowBotBluff(hand, 'me', bluff, tricky, () => 9999), false);
  t.diagnostic(`Weak bluff-show rates (tight/balanced/caller/aggressive/tricky): ${counts.map(n => (n / 40).toFixed(1) + '%').join(' / ')}`);
});

test('match profiles are random, immutable and varied, with strictly higher rationality ranges at higher difficulty', () => {
  const ids = Array.from({ length: 7 }, (_, i) => `ai-${i}`);
  const profiles = createBotPersonalities(ids, random(24)), replay = createBotPersonalities(ids, random(24));
  assert.deepEqual(profiles, replay);
  assert.equal(new Set([...profiles.values()].slice(0, 5).map(p => p.style)).size, 5);
  assert.notDeepEqual(profiles, createBotPersonalities(ids, random(25)));
  for (const p of profiles.values()) {
    assert.equal(Object.isFrozen(p), true);
    for (const [key, value] of Object.entries(p)) if (key !== 'style') assert.ok(Number.isFinite(value) && value >= 0 && value <= (key === 'betScale' ? 1.5 : 1));
    assert.ok(botRationality('easy', p) >= .25 && botRationality('easy', p) <= .55);
    assert.ok(botRationality('normal', p) >= .65 && botRationality('normal', p) <= .82);
    assert.ok(botRationality('hard', p) >= .92 && botRationality('hard', p) <= .99);
  }
});

function costlyView() {
  const state = view([card(3), card(7, 3)], [card(2), card(5, 1), card(9, 2), card(11, 1), card(12, 3)]);
  state.currentBet = 900; state.pot = 1000;
  state.players[1].bet = 900; state.players[1].total = 900;
  state.legal = { ...state.legal, canCheck: false, canRaise: false, toCall: 800, callAmount: 800 };
  return state;
}

function actionCounts(state, profile, difficulty, analysis, seed = 71, count = 4000) {
  const rng = random(seed), counts = { call: 0, fold: 0, raise: 0, check: 0, amount: 0, allIn: 0 };
  for (let i = 0; i < count; i++) {
    const action = decideBotAction(state, 'me', difficulty, analysis, profile, rng);
    counts[action.type]++; counts.amount += action.amount || 0;
    if (action.type === 'raise' && action.amount === state.legal.maxTo) counts.allIn++;
  }
  return counts;
}

function openingView(cards, count = 8) {
  const state = view(cards, [], count);
  state.currentBet = 20; state.pot = count * 20;
  state.players.forEach(player => { player.bet = 20; player.total = 20; player.chips = 1980; });
  state.legal = { ...state.legal, minTo: 40, maxTo: 2000 };
  return state;
}

test('weak multiway preflop equity cannot trigger value raises, while personalities still open premium hands', () => {
  const weak = openingView([card(7), card(2, 1)]), strong = openingView([card(14), card(14, 1)]);
  const analysis = { equity: .25, callEquity: .25, eligiblePot: 160 };
  for (const difficulty of ['easy', 'normal', 'hard']) for (const style of ['tight', 'balanced', 'caller', 'aggressive', 'tricky']) {
    const profile = createBotPersonality(random(12), style);
    assert.equal(actionCounts(weak, profile, difficulty, analysis, 71, 400).raise, 0, `${difficulty} ${style} must not raise 7-2 solely on noisy multiway equity`);
  }
  const pressure = createBotPersonality(random(12), 'aggressive'), tight = createBotPersonality(random(12), 'tight');
  const premium = { ...analysis, equity: .4, callEquity: .4 };
  const active = actionCounts(strong, pressure, 'normal', premium), cautious = actionCounts(strong, tight, 'normal', premium);
  assert.ok(active.raise > 2500 && active.raise < 3800);
  assert.ok(active.raise > cautious.raise + 500); assert.equal(active.allIn, 0);
});

test('preflop re-raises tighten as public raises escalate instead of multiplying any favorable equity into an all-in', () => {
  const state = openingView([card(14), card(13, 1)]);
  state.currentBet = 400; state.pot = 1200;
  state.players[0].bet = 100; state.players[0].chips = 1900;
  state.players.slice(1).forEach(player => { player.bet = 400; player.chips = 1600; });
  state.legal = { ...state.legal, canCheck: false, callAmount: 300, minTo: 700 };
  state.history = [{ street: 'preflop', action: '加注至 100' }, { street: 'preflop', action: '加注至 400' }];
  const profile = createBotPersonality(random(12), 'aggressive');
  for (const difficulty of ['easy', 'normal', 'hard']) {
    assert.equal(actionCounts(state, profile, difficulty, { equity: .4, callEquity: .4, eligiblePot: 1500 }).raise, 0);
  }
});

test('even loose easy AI rarely call off their stack at a bad preflop price', () => {
  const state = costlyView(); state.board = []; state.street = 'preflop';
  state.players[1].bet = 1100; state.players[1].total = 1100; state.currentBet = 1100;
  state.legal = { ...state.legal, toCall: 1000, callAmount: 1000 };
  const caller = createBotPersonality(random(12), 'caller'), analysis = { equity: .12, callEquity: .12, eligiblePot: 2200 };
  const simple = actionCounts(state, caller, 'easy', analysis);
  assert.ok(simple.call > 0 && simple.call < 500, 'occasional low-level mistakes remain possible without habitual preflop stack-offs');
  assert.equal(actionCounts(state, caller, 'hard', analysis).call, 0);
});

test('preflop deep-stack shoves are rare and need premium cards; short-stack value shoves remain possible', t => {
  const state = view(); state.currentBet = 700; state.pot = 1400;
  state.players[0].chips = 900; state.players[1].bet = 700; state.players[1].chips = 300;
  state.legal = { ...state.legal, canCheck: false, callAmount: 600, minTo: 1000, maxTo: 1000 };
  state.history = [{ street: 'preflop', action: '加注至 700' }];
  const profile = createBotPersonality(random(12), 'aggressive'), analysis = { equity: .85, callEquity: .85, eligiblePot: 2000 };
  const aces = actionCounts(state, profile, 'normal', analysis);
  assert.ok(aces.allIn > 0 && aces.allIn < 600, 'deep-stack aces do not automatically shove as soon as the pot grows');
  state.players[0].cards = [card(12), card(12, 1)];
  assert.equal(actionCounts(state, profile, 'normal', analysis).allIn, 0, 'a lucky estimate cannot bypass the deep-stack hand gate');
  state.players[0].cards = [card(10), card(10, 1)]; state.players[0].bet = 20; state.players[0].chips = 180;
  state.players[1].bet = 80; state.players[1].chips = 120; state.currentBet = 80; state.pot = 100;
  state.legal = { ...state.legal, callAmount: 60, minTo: 140, maxTo: 200 }; state.history = [];
  const short = actionCounts(state, profile, 'normal', { equity: .72, callEquity: .72, eligiblePot: 160 });
  assert.ok(short.allIn > 0 && short.allIn < 1000);
  t.diagnostic(`Seeded aggressive preflop shove rates: deep AA ${(aces.allIn / 40).toFixed(1)}%, short TT ${(short.allIn / 40).toFixed(1)}%`);
});

test('postflop value shoves retain their original pot/equity behavior', () => {
  const state = view([card(14), card(14, 1)], [card(14, 2), card(13), card(2)]);
  state.players[0].chips = 200; state.legal = { ...state.legal, maxTo: 300 };
  const profile = createBotPersonality(random(12), 'aggressive');
  assert.equal(actionCounts(state, profile, 'hard', { equity: .95, callEquity: .95, eligiblePot: 400 }, 71, 400).allIn, 400);
});

test('easy callers sometimes pay most of their stack with low equity; stronger difficulty bounds bad-price calls', t => {
  const state = costlyView(), caller = createBotPersonality(random(12), 'caller'), tight = createBotPersonality(random(12), 'tight');
  const expensive = { equity: .12, callEquity: .12, eligiblePot: 1800 };
  const loose = actionCounts(state, caller, 'easy', expensive), cautious = actionCounts(state, tight, 'easy', expensive);
  assert.ok(loose.call > 600, 'a loose low-level AI can overcall an 800-chip cost with 12% equity');
  assert.ok(loose.call > cautious.call * 2 + 100);
  assert.equal(actionCounts(state, caller, 'hard', expensive).call, 0);
  const near = { ...expensive, equity: .39, callEquity: .39 };
  const rates = ['easy', 'normal', 'hard'].map(level => actionCounts(state, caller, level, near).call / 4000);
  assert.ok(rates[0] > rates[1] && rates[1] > rates[2]); assert.equal(rates[2], 0);
  t.diagnostic(`Bad-price call rates at the same equity/cost: ${rates.map(rate => (rate * 100).toFixed(1) + '%').join(' / ')}`);
});

test('aggression, bluff preference and habitual bet size differ even with the same cards, equity and legal actions', () => {
  const state = view([card(14), card(13, 1)], [card(2), card(5, 1), card(9, 2), card(11, 1), card(12, 3)]);
  const caller = createBotPersonality(random(12), 'caller'), pressure = createBotPersonality(random(12), 'aggressive');
  const tricky = createBotPersonality(random(12), 'tricky'), tight = createBotPersonality(random(12), 'tight');
  const fair = { equity: .66, callEquity: .66, eligiblePot: 200 };
  assert.ok(actionCounts(state, pressure, 'normal', fair).raise > 3000);
  assert.ok(actionCounts(state, caller, 'normal', fair).raise < 400);
  const weak = { ...fair, equity: .15, callEquity: .15 };
  assert.ok(actionCounts(state, tricky, 'hard', weak).raise > actionCounts(state, tight, 'hard', weak).raise * 2);
  const strong = { ...fair, equity: .9, callEquity: .9 };
  const small = actionCounts(state, caller, 'hard', strong), large = actionCounts(state, pressure, 'hard', strong);
  assert.equal(small.raise, 4000); assert.equal(large.raise, 4000);
  assert.ok(large.amount / large.raise > small.amount / small.raise + 15, 'hard AI retain different value-bet size habits');
  state.legal.canRaise = false;
  for (const profile of [caller, pressure, tricky, tight]) assert.deepEqual(decideBotAction(state, 'me', 'easy', weak, profile, random(2)), { type: 'check' });
});

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
    const personalities = createBotPersonalities(hand.players.map(p => p.id), rng);
    let actions = 0;
    while (!hand.done && actions < 200) {
      const player = hand.players.find(player => player.seat === hand.actor);
      const action = chooseBotAction(hand.snapshot(player.id), player.id, ['easy', 'normal', 'hard'][actions++ % 3], rng, personalities.get(player.id));
      assert.doesNotThrow(() => hand.act(player.id, action.type, action.amount));
    }
    assert.equal(hand.done, true);
    assert.equal(hand.players.reduce((sum, player) => sum + player.chips, 0), chips.reduce((sum, amount) => sum + amount, 0));
  }
});
