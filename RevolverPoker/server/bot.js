import { randomInt } from 'node:crypto';
import { evaluate, compareHands, cardRank, cardSuit } from '../shared/poker.js';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const LEVELS = { easy: { trials: 48, noise: .12, margin: .055, bluff: .025 },
  normal: { trials: 160, noise: .04, margin: .025, bluff: .04 }, hard: { trials: 320, noise: .015, margin: .012, bluff: .05 } };

function preflopQuality(cards) {
  const [a, b] = cards.map(cardRank).sort((x, y) => y - x);
  if (a === b) return .45 + (a - 2) * .045;
  return clamp(.06 + (a + b - 4) / 32 * .65 + (cardSuit(cards[0]) === cardSuit(cards[1]) ? .08 : 0) +
    (a - b === 1 ? .05 : a - b === 2 ? .03 : a - b > 4 ? -.06 : 0) + (b >= 10 ? .13 : 0) + (a === 14 ? .07 : 0), .05, .99);
}
function rangeProfile(view, player) {
  const raises = (view.history || []).filter(action => action.seat === player.seat && /^(加注|全下)/.test(action.action));
  const preflop = raises.filter(action => action.street === 'preflop');
  const largest = Math.max(0, ...preflop.map(action => Number(action.action.match(/加注至\s*(\d+)/)?.[1]) || 0));
  return { preflop: preflop.length ? preflop.length > 1 || largest >= view.bigBlind * 10 ? 4 : 2 : 0,
    postflop: raises.some(action => action.street !== 'preflop') };
}
function rangeWeight(cards, board, score, profile) {
  let weight = profile.preflop ? .04 + .96 * preflopQuality(cards) ** profile.preflop : 1;
  if (profile.postflop && board.length >= 3) {
    const made = board.length === 5 ? score : evaluate([...cards, ...board]);
    const quality = made[0] === 0 ? .25 : made[0] === 1 ? .35 + made[1] / 14 * .25 : made[0] === 2 ? .75 : made[0] === 3 ? .86 : .96;
    weight *= .08 + .92 * quality ** 2;
  }
  return weight;
}

// Only our own cards and public information are used, including for range estimates.
export function estimateBotEquity(view, id, { trials = 160, random = randomInt } = {}) {
  const me = view.players.find(player => player.id === id);
  const opponents = view.players.filter(player => player.id !== id && !player.folded);
  const profiles = opponents.map(player => rangeProfile(view, player));
  const known = new Set([...me.cards, ...view.board]);
  const unknown = Array.from({ length: 52 }, (_, card) => card).filter(card => !known.has(card));
  const gap = 5 - view.board.length, count = gap + opponents.length * 2;
  const cap = (me.total ?? me.bet ?? 0) + view.legal.callAmount;
  const contributions = view.players.map(player => ({ ...player, amount: (player.total ?? player.bet ?? 0) + (player.id === id ? view.legal.callAmount : 0) }));
  const levels = [...new Set(contributions.map(player => Math.min(cap, player.amount)).filter(amount => amount > 0))].sort((a, b) => a - b);
  let previous = 0;
  const pots = levels.map(level => {
    const contributing = contributions.filter(player => player.amount >= level);
    const pot = { amount: (level - previous) * contributing.length, eligible: contributing.filter(player => !player.folded).map(player => player.id) };
    previous = level; return pot;
  });
  if (!pots.length) pots.push({ amount: view.pot + view.legal.callAmount, eligible: [id, ...opponents.map(player => player.id)] });
  const eligiblePot = pots.reduce((sum, pot) => sum + pot.amount, 0);
  let equity = 0, winnings = 0, weights = 0;
  const riverScore = gap === 0 ? evaluate([...me.cards, ...view.board]) : null;
  for (let trial = 0; trial < trials; trial++) {
    const sample = [...unknown];
    for (let j = 0; j < count; j++) { const k = j + random(sample.length - j); [sample[j], sample[k]] = [sample[k], sample[j]]; }
    const board = [...view.board, ...sample.slice(0, gap)], own = riverScore || evaluate([...me.cards, ...board]);
    const comparisons = new Map([[id, 0]]);
    let weight = 1, cursor = gap, lost = false, ties = 1;
    opponents.forEach((opponent, index) => {
      const cards = [sample[cursor++], sample[cursor++]], score = evaluate([...cards, ...board]);
      const comparison = compareHands(own, score); comparisons.set(opponent.id, comparison);
      lost ||= comparison < 0; if (comparison === 0) ties++;
      weight *= rangeWeight(cards, view.board, score, profiles[index]);
    });
    if (!lost) equity += weight / ties;
    for (const pot of pots) {
      const scores = pot.eligible.map(playerId => comparisons.get(playerId));
      if (scores.every(comparison => comparison >= 0)) winnings += weight * pot.amount / scores.filter(comparison => comparison === 0).length;
    }
    weights += weight;
  }
  return { equity: equity / weights, callEquity: eligiblePot ? winnings / weights / eligiblePot : equity / weights, eligiblePot };
}

export function chooseBotAction(view, id, difficulty = 'normal', random = randomInt) {
  const me = view.players.find(player => player.id === id), legal = view.legal;
  if (!me || !legal) return null;
  if (view.board.length === 5) {
    const boardScore = evaluate(view.board);
    if (boardScore[0] === 8 && boardScore[1] === 14) return { type: legal.canCheck ? 'check' : 'call' };
  }
  const level = LEVELS[difficulty] || LEVELS.normal;
  const opponents = view.players.filter(player => player.id !== id && !player.folded);
  const analysis = estimateBotEquity(view, id, { trials: level.trials, random });
  const noise = (random(10000) / 10000 - .5) * level.noise;
  const equity = clamp(analysis.equity + noise, 0, 1), callEquity = clamp(analysis.callEquity + noise, 0, 1);
  const odds = legal.callAmount / Math.max(1, analysis.eligiblePot);
  const risk = legal.callAmount / Math.max(1, me.chips) > .3 ? .02 : 0;
  if (!legal.canCheck && callEquity < odds + level.margin + risk) return { type: 'fold' };

  const order = [me, ...opponents].sort((a, b) => ((a.seat - view.button + 7) % 8) - ((b.seat - view.button + 7) % 8));
  const position = order.indexOf(me) / Math.max(1, order.length - 1);
  const fair = 1 / (opponents.length + 1), threshold = Math.max(fair * 1.35, fair + (opponents.length === 1 ? .12 : .08));
  const preflop = view.board.length === 0, quality = preflop ? preflopQuality(me.cards) : 0;
  const premium = preflop && quality >= .81 && equity > fair + .04;
  const opening = preflop && view.currentBet <= view.bigBlind && quality > .70 - position * .12 && equity > fair;
  const bluff = opponents.length <= 2 && opponents.every(player => player.chips > 0) &&
    (legal.canCheck || preflop && view.currentBet <= view.bigBlind) && random(10000) < level.bluff * (position > .5 ? 1 : .5) * 10000;
  if (legal.canRaise && (equity > threshold || premium || opening || bluff)) {
    let target;
    if (preflop) {
      const limpers = new Set((view.history || []).filter(action => action.street === 'preflop' && /^跟注/.test(action.action)).map(action => action.seat)).size;
      target = view.currentBet <= view.bigBlind ? view.bigBlind * ((position > .5 ? 2.5 : 3) + limpers) : view.currentBet * (position > .5 ? 2.5 : 3);
    } else target = me.bet + legal.callAmount + analysis.eligiblePot * (equity > .8 ? .75 : bluff ? .45 : .6);
    const cover = Math.max(legal.minTo, ...opponents.map(player => player.bet + player.chips));
    const maximum = Math.min(legal.maxTo, cover), step = target <= 50 ? 5 : 10;
    target = clamp(Math.ceil(target / step) * step, legal.minTo, maximum);
    if (maximum === legal.maxTo && me.chips - legal.callAmount < analysis.eligiblePot * 1.2 && equity > Math.max(.65, threshold + .1)) target = maximum;
    if (target >= legal.minTo || target === legal.maxTo && !bluff) return { type: 'raise', amount: target };
  }
  return { type: legal.canCheck ? 'check' : 'call' };
}
