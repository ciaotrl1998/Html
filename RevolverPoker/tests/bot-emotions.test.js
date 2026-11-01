import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import * as THREE from 'three';
import { reactToBluffReveal, settleBotAnger, botAngerLevel, foldedHandHasHigherEquity } from '../server/bot-emotions.js';
import { BOT_STYLES, decideBotAction } from '../server/bot.js';

registerHooks({ resolve(specifier, context, next) { return next(specifier === '/vendor/three.js' ? 'three' : specifier, context); } });
const { addAngryExpression, AngerFlames } = await import('../client/character-anger.js');
const card = (rank, suit = 0) => suit * 13 + rank - 2;
function bluffRoom() {
  return { hand: { number: 1, done: true, street: 'preflop', board: [], result: { showdown: false, pots: [{ awards: [{ id: 'winner', amount: 100 }] }] },
    players: [{ id: 'winner', seat: 0, cards: [card(7), card(2, 1)], shown: true }, { id: 'ai1', seat: 1, bot: true, folded: true, total: 150, cards: [card(14), card(14, 1)] }, { id: 'ai2', seat: 2, bot: true, folded: true, total: 101, cards: [card(13), card(13, 1)] }, { id: 'early', seat: 3, bot: true, folded: true, total: 200, cards: [card(12), card(12, 1)] }, { id: 'human', seat: 4, folded: true }],
    history: [{ seat: 3, street: 'preflop', action: '弃牌' }, { seat: 0, street: 'preflop', action: '加注至 40' }, { seat: 1, street: 'preflop', action: '弃牌' }, { seat: 2, street: 'preflop', action: '弃牌' }, { seat: 4, street: 'preflop', action: '弃牌' }] } };
}

test('shown human bluffs anger only AI folded to that final bet, once per hand, capped at three levels', () => {
  const room = bluffRoom(); assert.deepEqual(reactToBluffReveal(room, 'winner'), ['ai1', 'ai2']);
  assert.equal(botAngerLevel(room, 'ai1'), 1); assert.equal(botAngerLevel(room, 'early'), 0); assert.equal(botAngerLevel(room, 'human'), 0);
  assert.deepEqual(reactToBluffReveal(room, 'winner'), []);
  for (let hand = 2; hand <= 4; hand++) { room.hand.number = hand; reactToBluffReveal(room, 'winner'); }
  assert.equal(botAngerLevel(room, 'ai1'), 3);
  settleBotAnger(room); settleBotAnger(room); assert.equal(botAngerLevel(room, 'ai1'), 3, 'the provocation hand never immediately cools');
  room.hand.number++; settleBotAnger(room); assert.equal(botAngerLevel(room, 'ai1'), 2);
  settleBotAnger(room); assert.equal(botAngerLevel(room, 'ai1'), 2, 'reconnections or repeated settling cannot cool twice');
  room.hand.number++; settleBotAnger(room); assert.equal(botAngerLevel(room, 'ai1'), 1);
  room.hand.number++; settleBotAnger(room); assert.equal(botAngerLevel(room, 'ai1'), 0);
});

test('hidden hands, value reveals and earlier-street folds do not cause anger; AI reveals need actual private bluff intent', () => {
  for (const mutate of [r => { r.hand.players[0].shown = false; }, r => { r.hand.done = false; }, r => { r.hand.result.showdown = true; }, r => { r.hand.players[0].cards = [card(14), card(14, 1)]; }, r => { r.hand.players[0].bot = true; }, r => { r.hand.history[1].seat = 2; }]) {
    const room = bluffRoom(); mutate(room); assert.deepEqual(reactToBluffReveal(room, 'winner'), []);
  }
  const room = bluffRoom(); room.hand.players[0].bot = true; room.botBluffs = new Map([['winner', { index: 1, street: 'preflop' }]]);
  assert.deepEqual(reactToBluffReveal(room, 'winner'), ['ai1', 'ai2']);
  const earlier = bluffRoom(); earlier.hand.street = 'flop'; earlier.hand.board = [card(3), card(8, 1), card(13, 2)];
  assert.deepEqual(reactToBluffReveal(earlier, 'winner'), []);
});

test('anger requires strictly more than 100 committed and a genuinely higher heads-up equity', () => {
  const room = bluffRoom(); room.hand.players[1].total = 100; room.hand.players[2].total = 99;
  assert.deepEqual(reactToBluffReveal(room, 'winner'), []);
  room.hand.players[1].total = 101; assert.deepEqual(reactToBluffReveal(room, 'winner'), ['ai1']);
  const weaker = bluffRoom(); weaker.hand.players[0].cards = [card(14), card(14, 1)];
  weaker.hand.players[1].cards = [card(12), card(12, 1)]; weaker.hand.players[2].cards = [card(13), card(13, 1)];
  assert.deepEqual(reactToBluffReveal(weaker, 'winner'), [], 'folding the weaker hand correctly cannot cause anger');
  const aces = [card(14), card(14, 1)], sevenTwo = [card(7), card(2, 1)];
  const river = [card(3), card(5, 1), card(9, 2), card(11), card(12, 1)];
  assert.equal(foldedHandHasHigherEquity(aces, sevenTwo, river), true);
  assert.equal(foldedHandHasHigherEquity(sevenTwo, aces, river), false);
  assert.equal(foldedHandHasHigherEquity(aces, sevenTwo, river.slice(0, 4)), true);
  assert.equal(foldedHandHasHigherEquity(aces, sevenTwo, [8, 9, 10, 11, 12].map(card => card + 39)), false, 'a shared royal board gives equal equity');
  assert.equal(foldedHandHasHigherEquity([null, null], sevenTwo, []), false);
  const first = foldedHandHasHigherEquity(aces, sevenTwo, []);
  assert.equal(first, true); assert.equal(foldedHandHasHigherEquity(aces, sevenTwo, []), first, 'reconnections cannot reroll this comparison');
});

function rng(seed = 71) { return max => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return Math.floor(seed / 4294967296 * max); }; }
test('each anger level increases chasing and raising while difficulty and preflop all-in safeguards remain effective', t => {
  const state = { button: 0, street: 'river', bigBlind: 20, currentBet: 300, board: [card(2), card(5, 1), card(9, 2), card(11, 1), card(12, 3)], pot: 400, history: [],
    players: [{ id: 'me', seat: 0, chips: 1000, bet: 100, cards: [card(3), card(7, 3)] }, { id: 'other', seat: 1, chips: 800, bet: 300 }],
    legal: { callAmount: 200, toCall: 200, canCheck: false, canRaise: true, minTo: 500, maxTo: 1100 } };
  const profile = { ...BOT_STYLES.balanced, discipline: .5 }, rates = [];
  for (const difficulty of ['easy', 'normal', 'hard']) {
    const counts = [];
    for (let anger = 0; anger <= 3; anger++) { const random = rng(); let calls = 0; for (let i = 0; i < 4000; i++) calls += decideBotAction(state, 'me', difficulty, { equity: .27, callEquity: .27, eligiblePot: 600 }, profile, random, anger).type === 'call'; counts.push(calls); }
    for (let i = 1; i < 4; i++) assert.ok(counts[i] > counts[i - 1], `${difficulty}: calls must rise at every level (${counts})`);
    rates.push(counts); t.diagnostic(`${difficulty} bad-price calls, calm through level 3: ${counts.map(n => (n / 40).toFixed(1) + '%').join(' / ')}`);
  }
  for (let i = 0; i < 4; i++) assert.ok(rates[0][i] > rates[1][i] && rates[1][i] > rates[2][i]);
  state.legal.canCheck = true; state.legal.callAmount = 0;
  const raises = [];
  for (let anger = 0; anger <= 3; anger++) { const random = rng(); let count = 0; for (let i = 0; i < 4000; i++) count += decideBotAction(state, 'me', 'normal', { equity: .61, callEquity: .61, eligiblePot: 400 }, profile, random, anger).type === 'raise'; raises.push(count); }
  for (let i = 1; i < 4; i++) assert.ok(raises[i] > raises[i - 1]);
  state.board = []; state.street = 'preflop'; state.legal.maxTo = state.legal.minTo = 1100;
  for (let i = 0; i < 100; i++) assert.notEqual(decideBotAction(state, 'me', 'hard', { equity: .4, callEquity: .4, eligiblePot: 600 }, profile, rng(i), 3).type, 'raise');
});

test('expression and GPU particles implement three tiers and restore normal without CPU particle updates', () => {
  const head = new THREE.Group(), neutral = new THREE.Group(), skin = new THREE.MeshStandardMaterial({ color: 0xc38f64 }), ink = new THREE.MeshStandardMaterial({ color: 0x171511 });
  head.add(neutral); const normal = skin.color.clone(), setAnger = addAngryExpression(head, neutral, skin, ink);
  setAnger(1); assert.equal(neutral.visible, false); assert.ok(skin.color.equals(normal));
  setAnger(2); assert.ok(!skin.color.equals(normal)); const red2 = skin.color.clone();
  setAnger(3); assert.ok(!skin.color.equals(red2)); setAnger(0); assert.equal(neutral.visible, true); assert.ok(skin.color.equals(normal));
  const flames = new AngerFlames(head, 1), data = flames.points.geometry.attributes.position.array, original = [...data];
  flames.setLevel(1); assert.equal(flames.points.visible, false);
  flames.setLevel(2); assert.equal(flames.points.geometry.drawRange.count, 8);
  flames.setLevel(3); assert.equal(flames.points.geometry.drawRange.count, 24);
  flames.setLevel(3, 'low'); assert.equal(flames.points.geometry.drawRange.count, 10);
  const camera = new THREE.PerspectiveCamera(); flames.tick(1000, camera, 884, 3); flames.tick(2000, camera, 884, 3);
  assert.equal(flames.points.geometry.attributes.position.array, data); assert.deepEqual([...data], original);
  assert.equal(flames.points.material.depthWrite, false); const hits = []; flames.points.raycast({}, hits); assert.deepEqual(hits, []);
  flames.setLevel(0); assert.equal(flames.points.visible, false); assert.equal(flames.points.geometry.drawRange.count, 0);
});
