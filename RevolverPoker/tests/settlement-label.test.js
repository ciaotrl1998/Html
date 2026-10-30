import test from 'node:test';
import assert from 'node:assert/strict';
import { settlementLabel, settlementLabelHeight, paintSettlementLabel, winPulseScale, paintWinLabel, WIN_COLOR } from '../client/settlement-label.js';

const player = { id: 'winner', cards: [25, 43], folded: false };
const hand = { done: true, board: [0, 18, 28, 49, 38], result: { showdown: true,
  pots: [{ awards: [{ id: 'winner', amount: 100 }] }] } };

test('settlement marks pot winners, split winners and side-pot winners without marking refunds or losers', () => {
  assert.equal(settlementLabel(hand, player).winner, true);
  assert.equal(settlementLabel(hand, { ...player, id: 'loser' }).winner, undefined);
  const split = { ...hand, result: { showdown: true, pots: [
    { awards: [{ id: 'winner', amount: 50 }, { id: 'tied', amount: 50 }] },
    { awards: [{ id: 'side-pot', amount: 20 }] }
  ], refund: { id: 'refund-only', amount: 30 } } };
  for (const id of ['winner', 'tied', 'side-pot']) assert.equal(settlementLabel(split, { ...player, id }).winner, true);
  assert.equal(settlementLabel(split, { ...player, id: 'refund-only' }).winner, undefined);
  assert.equal(settlementLabel(hand, { ...player, folded: true }).winner, undefined);
  assert.equal(settlementLabel({ ...hand, done: false }, player), null);
});

test('WIN does not reveal cards that were not publicly shown', () => {
  assert.deepEqual(settlementLabel({ ...hand, result: { ...hand.result, showdown: false } }, player),
    { cards: [null, null], handName: '未摊牌', winner: true });
  assert.deepEqual(settlementLabel(hand, { ...player, cards: [null, null] }),
    { cards: [null, null], handName: '未公开', winner: true });
});

function drawing() {
  const calls = [], state = {};
  const ctx = new Proxy(state, { get(target, key) {
    if (key in target) return target[key];
    return (...args) => calls.push({ method: key, args, color: key === 'stroke' ? target.strokeStyle : target.fillStyle, width: target.lineWidth, shadowColor: target.shadowColor, shadowBlur: target.shadowBlur });
  } });
  return { ctx, calls };
}

test('winner cards retain their size, share the result-card gold glow, and leave room for WIN and the hand name', () => {
  const win = settlementLabel(hand, player), normal = settlementLabel(hand, { ...player, id: 'loser' });
  const winner = drawing(), loser = drawing();
  paintSettlementLabel(winner.ctx, win); paintSettlementLabel(loser.ctx, normal);
  const winText = winner.calls.find(call => call.method === 'fillText' && call.args[0] === 'WIN');
  assert.ok(winText); assert.equal(winText.color, WIN_COLOR);
  const winCards = winner.calls.filter(call => call.method === 'roundRect').slice(0, 2);
  const normalCards = loser.calls.filter(call => call.method === 'roundRect').slice(0, 2);
  for (let i = 0; i < 2; i++) {
    assert.deepEqual(winCards[i].args.slice(2, 4), normalCards[i].args.slice(2, 4));
    const origin = winner.calls.find(call => call.method === 'translate');
    assert.ok(origin.args[1] + winText.args[2] < winCards[i].args[1]);
    assert.ok(winCards[i].args[1] + winCards[i].args[3] < settlementLabelHeight(win));
  }
  const glowing = winner.calls.filter(call => call.method === 'stroke' && call.color === WIN_COLOR && call.width === 7);
  assert.equal(glowing.length, 2);
  assert.ok(glowing.every(call => call.shadowColor === WIN_COLOR && call.shadowBlur === 20));
  const margin = 20 + 7 / 2, nameBar = winner.calls.filter(call => call.method === 'roundRect')[2].args;
  for (const card of winCards) {
    const [x, y, width, height] = card.args;
    assert.ok(x - margin >= 0 && x + width + margin <= 512);
    assert.ok(y - margin >= 67, 'WIN animation must not erase the upper glow');
    assert.ok(y + height + margin < nameBar[1], 'the hand name must not cover the lower glow');
  }
  assert.ok(winner.calls.filter(call => call.method === 'fillText').every(call => !call.shadowBlur), 'ranks and suits remain sharp');
  assert.ok(!loser.calls.some(call => call.method === 'fillText' && call.args[0] === 'WIN'));
  assert.equal(settlementLabelHeight(normal), 240); assert.equal(settlementLabelHeight(win), 350);
  const name = winner.calls.find(call => call.method === 'fillText' && call.args[0] === win.handName);
  assert.ok(name.args[2] > winCards[0].args[1] + winCards[0].args[3]);
  assert.ok(name.args[2] < settlementLabelHeight(win));
});

test('WIN smoothly pulses from 100% to 120% and back in a one-second loop', () => {
  assert.equal(winPulseScale(0), 1);
  assert.ok(Math.abs(winPulseScale(250) - 1.1) < 1e-10);
  assert.equal(winPulseScale(500), 1.2);
  assert.ok(Math.abs(winPulseScale(750) - 1.1) < 1e-10);
  assert.equal(winPulseScale(1000), 1);
  assert.equal(winPulseScale(1500), 1.2);
  for (let time = 0; time <= 3000; time += 25) {
    const scale = winPulseScale(time);
    assert.ok(scale >= 1 && scale <= 1.2);
    assert.ok(Math.abs(scale - winPulseScale(time + 1000)) < 1e-10);
  }
});

test('WIN animation repaints and scales only its title band, leaving the card outlines and hand name untouched', () => {
  const { ctx, calls } = drawing();
  paintWinLabel(ctx, 500);
  assert.deepEqual(calls.find(call => call.method === 'scale').args, [1.2, 1.2]);
  const clear = calls.find(call => call.method === 'clearRect').args;
  assert.ok(clear[1] + clear[3] < 94 - 23.5, 'animation cannot erase the top gold card glow');
  assert.ok(!calls.some(call => call.method === 'roundRect'));
  const text = calls.filter(call => call.method === 'fillText');
  assert.deepEqual(text.map(call => call.args[0]), ['WIN']);
  assert.equal(calls[0].method, 'clearRect');
  assert.equal(calls[calls.length - 1].method, 'restore', 'the scale must not affect subsequent card painting');
});
