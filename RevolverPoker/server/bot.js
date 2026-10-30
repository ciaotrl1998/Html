import { randomInt } from 'node:crypto';
import { evaluate, compareHands, cardRank, cardSuit } from '../shared/poker.js';

// Intentionally accepts only the same redacted view delivered to this seat.
export function chooseBotAction(view, id, difficulty = 'normal') {
  const me = view.players.find(p => p.id === id);
  const legal = view.legal;
  if (!me || !legal) return null;
  const known = new Set([...me.cards, ...view.board]);
  let strength;
  if (!view.board.length) {
    const [a, b] = me.cards.map(cardRank).sort((x, y) => y - x);
    strength = 0.2 + (a + b) / 65 + (a === b ? 0.22 : 0) +
      (cardSuit(me.cards[0]) === cardSuit(me.cards[1]) ? 0.04 : 0) + (a - b === 1 ? 0.025 : 0);
  } else {
    const unknown = Array.from({ length: 52 }, (_, i) => i).filter(c => !known.has(c));
    const trials = difficulty === 'easy' ? 20 : difficulty === 'hard' ? 100 : 50;
    const opponents = Math.min(3, view.players.filter(p => p.id !== id && !p.folded).length);
    let equity = 0;
    for (let trial = 0; trial < trials; trial++) {
      const sample = [...unknown];
      const count = 5 - view.board.length + 2 * opponents;
      for (let j = 0; j < count; j++) {
        const k = j + randomInt(sample.length - j);
        [sample[j], sample[k]] = [sample[k], sample[j]];
      }
      let cursor = 5 - view.board.length;
      const board = [...view.board, ...sample.slice(0, cursor)];
      const own = evaluate([...me.cards, ...board]);
      let lost = false, ties = 1;
      for (let j = 0; j < opponents; j++) {
        const score = evaluate([sample[cursor++], sample[cursor++], ...board]);
        const cmp = compareHands(own, score);
        if (cmp < 0) lost = true;
        if (cmp === 0) ties++;
      }
      if (!lost) equity += 1 / ties;
    }
    strength = equity / trials;
  }
  strength += (randomInt(100) / 100 - 0.5) * (difficulty === 'easy' ? 0.25 : 0.1);
  const odds = legal.callAmount / Math.max(1, view.pot + legal.callAmount);
  if (legal.toCall > 0 && strength < odds + 0.06 && randomInt(100) > 13) return { type: 'fold' };
  const wantsRaise = strength > 0.66 || randomInt(100) < (difficulty === 'easy' ? 4 : 9);
  if (wantsRaise && legal.canRaise && legal.maxTo >= legal.minTo) {
    const amount = Math.min(legal.maxTo, Math.max(legal.minTo, view.currentBet + Math.round(view.pot * 0.45 / view.bigBlind) * view.bigBlind));
    return { type: 'raise', amount };
  }
  return { type: legal.canCheck ? 'check' : 'call' };
}
