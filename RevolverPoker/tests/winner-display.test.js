import test from 'node:test';
import assert from 'node:assert/strict';
import { bestFive, cardRank, evaluate, PokerHand } from '../shared/poker.js';
import { winningHands, winnerAwards, paintWinningCards, renderWinnerResult, WINNING_CARDS_SIZE } from '../client/winner-display.js';
import { WIN_COLOR } from '../client/settlement-label.js';

const c = (rank, suit = 0) => suit * 13 + rank - 2;
function showdown(board, hole, extra = {}) {
  return { done: true, board, players: [{ id: 'winner', name: '赢家', cards: hole, folded: false }],
    result: { showdown: true, pots: [{ awards: [{ id: 'winner', name: '赢家', amount: 100, hand: '牌型' }] }] }, ...extra };
}

test('the five-card result selects the strongest combination and highlights only the made hand', () => {
  const cases = [
    { board: [c(13), c(11, 1), c(7, 2), c(4), c(2, 2)], hole: [c(14, 3), c(9, 1)], type: 0, ranks: [14, 13, 11, 9, 7], gold: 1 },
    { board: [c(13, 2), c(11, 3), c(8), c(5, 1), c(2, 3)], hole: [c(14), c(14, 1)], type: 1, ranks: [14, 14, 13, 11, 8], gold: 2 },
    { board: [c(14, 1), c(13, 1), c(12, 2), c(8, 3), c(2, 2)], hole: [c(14), c(13)], type: 2, ranks: [14, 14, 13, 13, 12], gold: 4 },
    { board: [c(9, 2), c(14, 3), c(13), c(5, 1), c(2, 3)], hole: [c(9), c(9, 1)], type: 3, ranks: [9, 9, 9, 14, 13], gold: 3 },
    { board: [c(3, 2), c(4, 3), c(5), c(9, 1), c(13, 2)], hole: [c(14), c(2, 1)], type: 4, ranks: [5, 4, 3, 2, 14], gold: 5 },
    { board: [c(13, 2), c(11, 2), c(8, 2), c(4, 2), c(12)], hole: [c(14, 2), c(2, 2)], type: 5, ranks: [14, 13, 11, 8, 4], gold: 5 },
    { board: [c(12, 2), c(8), c(8, 1), c(14, 3), c(2, 2)], hole: [c(12), c(12, 1)], type: 6, ranks: [12, 12, 12, 8, 8], gold: 5 },
    { board: [c(7, 2), c(7, 3), c(14), c(11, 1), c(2, 2)], hole: [c(7), c(7, 1)], type: 7, ranks: [7, 7, 7, 7, 14], gold: 4 },
    { board: [c(11, 3), c(12, 3), c(13, 3), c(2), c(3, 2)], hole: [c(9, 3), c(10, 3)], type: 8, ranks: [13, 12, 11, 10, 9], gold: 5 }
  ];
  for (const fixture of cases) {
    const hand = showdown(fixture.board, fixture.hole), original = structuredClone(hand);
    const [winner] = winningHands(hand);
    assert.equal(winner.cards.length, 5); assert.equal(new Set(winner.cards).size, 5);
    assert.deepEqual(winner.cards.map(cardRank), fixture.ranks); assert.equal(evaluate(winner.cards)[0], fixture.type);
    assert.deepEqual(evaluate(winner.cards), evaluate([...fixture.board, ...fixture.hole]));
    assert.equal(winner.highlighted.length, fixture.gold);
    assert.ok(winner.highlighted.every(card => winner.cards.includes(card)));
    assert.deepEqual(hand, original, 'displaying the result must not reorder the actual board or hole cards');
  }
});

test('a board-only royal flush uses all five public cards and leaves hole cards out', () => {
  const board = [c(10), c(11), c(12), c(13), c(14)];
  const [winner] = winningHands(showdown(board, [c(2, 1), c(3, 2)]));
  assert.deepEqual(new Set(winner.cards), new Set(board)); assert.equal(winner.handName, '皇家同花顺'); assert.equal(winner.highlighted.length, 5);
  const selection = bestFive([...board, c(2, 1), c(3, 2)]); assert.deepEqual(selection.cards, board);
  assert.throws(() => bestFive(board.slice(0, 4))); assert.throws(() => bestFive([...board, 13, 14, 15]));
});

function sidePots() {
  const hand = new PokerHand({ players: [50, 100, 200].map((chips, seat) => ({ id: `p${seat}`, name: `玩家${seat}`, seat, chips })),
    button: 0, smallBlind: 5, bigBlind: 10, deck: Array.from({ length: 52 }, (_, i) => i) });
  hand.players.forEach((player, index) => { player.chips = 0; player.total = [50, 100, 200][index]; });
  hand.board = [c(2), c(4, 1), c(6, 2), c(8, 3), c(10)];
  hand.players[0].cards = [c(14, 1), c(14, 2)]; hand.players[1].cards = [c(13, 1), c(13, 2)]; hand.players[2].cards = [c(12, 1), c(12, 2)];
  hand.settle(true); return hand.snapshot('spectator');
}

test('main-pot and side-pot winners get their own hands; refunds are not treated as wins', () => {
  const hand = sidePots(), winners = winningHands(hand);
  assert.deepEqual(winners.map(winner => winner.id), ['p0', 'p1']); assert.deepEqual(winners.map(winner => winner.amount), [150, 100]);
  assert.deepEqual(winners.map(winner => winner.highlighted.length), [2, 2]);
  assert.equal(hand.result.refund.id, 'p2'); assert.ok(!winners.some(winner => winner.id === 'p2'));
  const split = structuredClone(hand); split.result.pots[1].awards.push({ ...split.result.pots[0].awards[0], amount: 20 });
  assert.equal(winnerAwards(split).find(winner => winner.id === 'p0').amount, 170);
});

test('unknown, folded, invalid or non-showdown hands never expose private cards or fabricate five cards', () => {
  const hand = showdown([0, 18, 28, 49, 38], [25, 43]);
  for (const edit of [
    h => { h.done = false; }, h => { h.result.showdown = false; }, h => { h.players[0].folded = true; },
    h => { h.players[0].cards = [null, null]; }, h => { h.players[0].cards = [25]; },
    h => { h.board = [0, 18]; }, h => { h.board[0] = 60; }, h => { h.players[0].cards[0] = h.board[0]; }
  ]) {
    const copy = structuredClone(hand); edit(copy); assert.deepEqual(winningHands(copy), []);
  }
  assert.deepEqual(winningHands(null), []);
});

function drawing() {
  const calls = [], state = {};
  const ctx = new Proxy(state, { get(target, key) {
    if (key in target) return target[key];
    return (...args) => calls.push({ method: key, args, color: key === 'stroke' ? target.strokeStyle : target.fillStyle, width: target.lineWidth, shadowColor: target.shadowColor, shadowBlur: target.shadowBlur });
  } });
  return { ctx, calls };
}

test('the five-card row reduces kickers and highlights made cards with the logo yellow and unclipped glow', () => {
  const [winner] = winningHands(showdown([c(13, 2), c(11, 3), c(8), c(5, 1), c(2, 3)], [c(14), c(14, 1)]));
  const { ctx, calls } = drawing(); paintWinningCards(ctx, winner);
  const cards = calls.filter(call => call.method === 'roundRect'); assert.equal(cards.length, 5);
  const strokes = calls.filter(call => call.method === 'stroke');
  assert.equal(strokes.filter(call => call.color === WIN_COLOR && call.width === 7).length, 2);
  for (const [index, card] of cards.entries()) {
    const [x, y, width, height] = card.args;
    const made = index < 2, scale = made ? 1 : .82;
    assert.equal(width, 132 * scale); assert.equal(height, 173 * scale);
    const margin = made ? 23.5 : 1.5;
    assert.ok(x - margin >= 0 && x + width + margin <= WINNING_CARDS_SIZE.width); assert.ok(y - margin >= 0 && y + height + margin <= WINNING_CARDS_SIZE.height);
    assert.equal(strokes[index].shadowBlur, made ? 20 : 0);
    if (made) assert.equal(strokes[index].shadowColor, WIN_COLOR);
  }
  assert.ok(calls.filter(call => call.method === 'fillText').every(call => call.shadowBlur === 0), 'the glow must not blur the card ranks or suits');
});

function document() {
  const doc = { createElement(tag) {
    const recording = drawing();
    return { ownerDocument: doc, tag, children: [], attributes: {}, className: '', recording,
      set textContent(text) { this.text = String(text); this.children = []; },
      get textContent() { return (this.text || '') + this.children.map(child => child.textContent).join(''); },
      appendChild(child) { this.children.push(child); return child; },
      replaceChildren(...children) { this.text = ''; this.children = children; },
      setAttribute(key, value) { this.attributes[key] = value; }, getContext: () => recording.ctx
    };
  } }; return doc;
}

test('winner UI places card rows below the summary and clears them on the next hand', () => {
  const doc = document(), container = doc.createElement('div'), hand = sidePots();
  renderWinnerResult(container, hand, { nextHand: true });
  assert.equal(container.hidden, false); assert.deepEqual(container.children.map(child => child.className), ['result-summary', 'winner-hands']);
  assert.ok(container.children[0].textContent.includes('玩家0 +150')); assert.ok(container.children[0].textContent.includes('即将开始下一手'));
  const figures = container.children[1].children; assert.equal(figures.length, 2);
  for (const figure of figures) {
    const canvas = figure.children.find(child => child.tag === 'canvas');
    assert.equal(canvas.width, WINNING_CARDS_SIZE.width); assert.equal(canvas.height, WINNING_CARDS_SIZE.height); assert.equal(canvas.attributes.role, 'img');
    assert.equal(canvas.recording.calls.filter(call => call.method === 'roundRect').length, 5);
  }
  renderWinnerResult(container, { ...hand, done: false }); assert.equal(container.hidden, true); assert.equal(container.children.length, 0);
  renderWinnerResult(container, hand); assert.ok(!container.children[0].textContent.includes('即将开始下一手'));
  renderWinnerResult(container, null); assert.equal(container.hidden, true); assert.equal(container.children.length, 0);
});

test('split winners playing the board share one five-card row without duplicate canvases', () => {
  const hand = showdown([c(10), c(11), c(12), c(13), c(14)], [c(2, 1), c(3, 2)]);
  hand.players.push({ id: 'tied', name: '并列', cards: [c(4, 1), c(5, 2)], folded: false });
  hand.result.pots[0].awards.push({ id: 'tied', name: '并列', amount: 100, hand: '皇家同花顺' });
  const doc = document(), container = doc.createElement('div'); renderWinnerResult(container, hand);
  assert.equal(container.children[1].children.length, 1);
  const canvas = container.children[1].children[0].children[0];
  assert.ok(canvas.attributes['aria-label'].includes('赢家、并列'));
  assert.equal(canvas.recording.calls.filter(call => call.method === 'stroke' && call.color === WIN_COLOR).length, 5);
});
