import { compareHands, evaluate } from '../shared/poker.js';

export const botAngerLevel = (room, id) => room.botAnger?.get(id)?.level || 0;

// Compare only the AI's own remembered cards, the exposed winner and the board
// at the fold. Other folded hands, burns and the server's real runout are unused.
export function foldedHandHasHigherEquity(own, exposed, board) {
  if (!Array.isArray(own) || own.length !== 2 || !Array.isArray(exposed) || exposed.length !== 2 || !Array.isArray(board) || ![0, 3, 4, 5].includes(board.length)) return false;
  const known = [...own, ...exposed, ...board];
  if (known.some(card => !Number.isInteger(card) || card < 0 || card >= 52) || new Set(known).size !== known.length) return false;
  const compare = runout => compareHands(evaluate([...own, ...runout]), evaluate([...exposed, ...runout]));
  if (board.length === 5) return compare(board) > 0;
  const unseen = Array.from({ length: 52 }, (_, card) => card).filter(card => !known.includes(card));
  if (board.length === 4) {
    let share = 0; for (const card of unseen) { const result = compare([...board, card]); share += result > 0 ? 1 : result === 0 ? .5 : 0; }
    return share > unseen.length / 2;
  }
  // Usually resolves in 128 trials for an obvious bluff. Spend more only on
  // close hands, and refuse to provoke anger while a coin flip remains unclear.
  let seed = 2166136261;
  for (const card of [...known].sort((a, b) => a - b)) seed = Math.imul(seed ^ (card + 1), 16777619) >>> 0;
  const random = max => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return Math.floor(seed / 4294967296 * max); };
  const sample = new Uint8Array(unseen.length), missing = 5 - board.length; let share = 0;
  for (let trial = 1; trial <= 1024; trial++) {
    sample.set(unseen);
    for (let i = 0; i < missing; i++) { const j = i + random(sample.length - i), card = sample[i]; sample[i] = sample[j]; sample[j] = card; }
    const result = compare([...board, ...sample.subarray(0, missing)]); share += result > 0 ? 1 : result === 0 ? .5 : 0;
    if (trial >= 128 && (trial & (trial - 1)) === 0) {
      const equity = share / trial, margin = 2.3 * Math.sqrt(equity * (1 - equity) / trial);
      if (equity > .5 + margin) return true;
      if (equity < .5 - margin) return false;
    }
  }
  return false;
}

export function reactToBluffReveal(room, winnerId) {
  const hand = room.hand, winner = hand?.players.find(player => player.id === winnerId);
  if (!hand?.done || hand.result?.showdown || !winner?.shown || winner.folded || !hand.result?.pots.some(pot => pot.awards.some(award => award.id === winnerId && award.amount > 0))) return [];
  const index = hand.history.findLastIndex(entry => entry.street === hand.street && /^(加注|全下)/.test(entry.action));
  if (index < 0 || hand.history[index].seat !== winner.seat) return [];
  const intent = room.botBluffs?.get(winnerId);
  if (winner.bot && (intent?.index !== index || intent.street !== hand.street)) return [];
  const foldedSeats = new Set(hand.history.slice(index + 1).filter(entry => entry.street === hand.street && entry.action === '弃牌').map(entry => entry.seat));
  room.botAnger ||= new Map(); const changed = [];
  for (const player of hand.players) {
    if (!player.bot || !player.folded || !foldedSeats.has(player.seat) || !(player.total > 100)) continue;
    const previous = room.botAnger.get(player.id);
    if (previous?.provokedHand === hand.number) continue;
    if (!foldedHandHasHigherEquity(player.cards, winner.cards, hand.board)) continue;
    const state = { level: Math.min(3, (previous?.level || 0) + 1), provokedHand: hand.number, settledHand: previous?.settledHand ?? hand.number - 1 };
    room.botAnger.set(player.id, state); changed.push(player.id);
  }
  return changed;
}

// Wait until the result window ends, allowing a winner to show first. The anger
// then survives a full following hand, and cools one level after a quiet hand.
export function settleBotAnger(room) {
  const hand = room.hand;
  if (!hand?.done) return;
  for (const state of room.botAnger?.values() || []) {
    if (state.settledHand >= hand.number) continue;
    if (state.provokedHand !== hand.number) state.level = Math.max(0, state.level - 1);
    state.settledHand = hand.number;
  }
}
