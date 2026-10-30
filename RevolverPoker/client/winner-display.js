import { bestFive, cardRank, handName } from '../shared/poker.js';
import { paintSettlementCard } from './settlement-label.js';

const valid = card => Number.isInteger(card) && card >= 0 && card < 52;
const money = amount => Number(amount || 0).toLocaleString('zh-CN');
export const WINNING_CARDS_SIZE = { width: 764, height: 221 };

export function winnerAwards(hand) {
  const awards = new Map();
  for (const pot of hand?.result?.pots || []) for (const award of pot.awards || []) {
    if (!(award.amount > 0)) continue;
    const current = awards.get(award.id) || { ...award, amount: 0 };
    current.amount += award.amount; awards.set(award.id, current);
  }
  return [...awards.values()];
}

export function winningHands(hand) {
  if (!hand?.done || !hand.result?.showdown || !Array.isArray(hand.players) || !Array.isArray(hand.board) || hand.board.length < 3 || hand.board.length > 5 || !hand.board.every(valid)) return [];
  return winnerAwards(hand).flatMap(award => {
    const player = hand.players.find(player => player.id === award.id);
    if (!player || player.folded || !Array.isArray(player.cards) || player.cards.length !== 2 || !player.cards.every(valid)) return [];
    // Board-first ordering prefers the public board when it already plays.
    const available = [...hand.board, ...player.cards];
    if (new Set(available).size !== available.length) return [];
    const best = bestFive(available), [type, rank] = best.score;
    const straight = type === 4 || type === 8;
    const ranks = straight ? Array.from({ length: 5 }, (_, i) => rank === 5 && i === 4 ? 14 : rank - i) : best.score.slice(1);
    const cards = [...best.cards].sort((a, b) => ranks.indexOf(cardRank(a)) - ranks.indexOf(cardRank(b)) || a - b);
    const highlighted = cards.filter(card => {
      const r = cardRank(card);
      if ([0, 1, 3, 7].includes(type)) return r === rank;
      if (type === 2) return r === rank || r === best.score[2];
      return true;
    });
    return [{ ...award, cards, highlighted, handName: handName(best.score) }];
  });
}

export function paintWinningCards(ctx, hand) {
  ctx.clearRect(0, 0, WINNING_CARDS_SIZE.width, WINNING_CARDS_SIZE.height);
  const gold = new Set(hand.highlighted);
  hand.cards.forEach((card, index) => {
    const highlighted = gold.has(card), scale = highlighted ? 1 : .82;
    const x = 24 + index * 146 + 132 * (1 - scale) / 2, y = 24 + 173 * (1 - scale) / 2;
    paintSettlementCard(ctx, card, x, y, highlighted, { scale, glow: highlighted });
  });
}

export function renderWinnerResult(container, hand, { nextHand = false } = {}) {
  container.hidden = !hand?.done;
  if (container.hidden) { container.replaceChildren(); return; }
  const doc = container.ownerDocument, awards = winnerAwards(hand);
  const summary = doc.createElement('div'); summary.className = 'result-summary';
  summary.textContent = awards.map(award => `${award.name} +${money(award.amount)}`).join(' · ');
  const detail = doc.createElement('small');
  detail.textContent = [...new Set(awards.map(award => award.hand).filter(Boolean))].join(' / ') + (nextHand ? ' · 即将开始下一手' : '');
  summary.appendChild(detail); container.replaceChildren(summary);

  // Shared-board split winners need just one identical five-card row.
  const groups = new Map();
  for (const winner of winningHands(hand)) {
    const key = winner.cards.join(',');
    if (!groups.has(key)) groups.set(key, { ...winner, names: [] });
    groups.get(key).names.push(winner.name);
  }
  if (!groups.size) return;
  const hands = doc.createElement('div'); hands.className = 'winner-hands';
  for (const group of groups.values()) {
    const figure = doc.createElement('figure'); figure.className = 'winner-hand';
    if (groups.size > 1) {
      const caption = doc.createElement('figcaption'); caption.textContent = `${group.names.join('、')} · ${group.handName}`; figure.appendChild(caption);
    }
    const canvas = doc.createElement('canvas'); canvas.width = WINNING_CARDS_SIZE.width; canvas.height = WINNING_CARDS_SIZE.height;
    canvas.setAttribute('role', 'img');
    const cards = group.cards.map(card => `${'23456789TJQKA'[card % 13].replace('T', '10')}${['♣', '♦', '♥', '♠'][Math.floor(card / 13)]}`).join('、');
    canvas.setAttribute('aria-label', `${group.names.join('、')}：${group.handName}，${cards}。金边标出组成牌型的牌。`);
    paintWinningCards(canvas.getContext('2d'), group);
    figure.appendChild(canvas); hands.appendChild(figure);
  }
  container.appendChild(hands);
}
