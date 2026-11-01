import { randomInt } from 'node:crypto';
import { evaluate, compareHands, cardRank, cardSuit } from '../shared/poker.js';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const LEVELS = {
  easy: { trials: 48, noise: .12, margin: .055, bluff: .025, reason: [.25, .55], mistake: .9, lossLimit: .8 },
  normal: { trials: 160, noise: .04, margin: .025, bluff: .04, reason: [.65, .82], mistake: .35, lossLimit: .18 },
  hard: { trials: 320, noise: .015, margin: .012, bluff: .05, reason: [.92, .99], mistake: .1, lossLimit: .025 }
};
// Server-only preferences. Each match gets a fresh, stable profile per AI;
// difficulty controls how far its preferences may depart from price/equity.
export const BOT_STYLES = {
  tight: { looseness: .12, aggression: .28, calling: .12, bluffing: .15, riskTolerance: .15, volatility: .15, betScale: .85 },
  balanced: { looseness: .5, aggression: .5, calling: .4, bluffing: .4, riskTolerance: .5, volatility: .35, betScale: 1 },
  caller: { looseness: .95, aggression: .18, calling: .95, bluffing: .08, riskTolerance: .85, volatility: .65, betScale: .75 },
  aggressive: { looseness: .8, aggression: .95, calling: .65, bluffing: .75, riskTolerance: .95, volatility: .75, betScale: 1.35 },
  tricky: { looseness: .6, aggression: .68, calling: .5, bluffing: .95, riskTolerance: .65, volatility: .55, betScale: 1.1 }
};
const DEFAULT_PERSONALITY = { ...BOT_STYLES.balanced, discipline: .5 };
const roll = random => random(10000) / 10000;
const bluffDecisions = new WeakMap();
// Intent stays attached to the server's decision object, never to public players,
// action JSON, history or the reconnect snapshot.
export const getBotBluff = action => bluffDecisions.get(action) || null;

export function botBluffShowChance(weakness, personality = DEFAULT_PERSONALITY) {
  const p = { ...DEFAULT_PERSONALITY, ...personality };
  const exhibition = clamp(.02 + .45 * p.bluffing + .15 * p.aggression + .05 * p.volatility - .1 * p.discipline - .05 * (1 - p.looseness), 0, .65);
  return exhibition * (.15 + .85 * clamp(weakness, 0, 1) ** 1.4);
}

export function shouldShowBotBluff(hand, id, bluff, personality = DEFAULT_PERSONALITY, random = randomInt) {
  const player = hand?.players.find(player => player.id === id);
  if (!player?.bot || !hand.done || hand.result?.showdown || player.folded || player.shown || !bluff || bluff.street !== hand.street) return false;
  if (!hand.result?.pots.some(pot => pot.awards.some(award => award.id === id && award.amount > 0))) return false;
  const lastRaise = hand.history.findLastIndex(entry => entry.street === hand.street && /^(加注|全下)/.test(entry.action));
  if (lastRaise !== bluff.index || hand.history[lastRaise]?.seat !== player.seat) return false;
  return roll(random) < botBluffShowChance(bluff.weakness, personality);
}

export function createBotPersonality(random = randomInt, style = null) {
  const styles = Object.keys(BOT_STYLES);
  const type = styles.includes(style) ? style : styles[random(styles.length)];
  const profile = { style: type, discipline: roll(random) };
  for (const [key, value] of Object.entries(BOT_STYLES[type])) {
    profile[key] = clamp(value + (roll(random) - .5) * (key === 'betScale' ? .16 : .18), key === 'betScale' ? .6 : 0, key === 'betScale' ? 1.5 : 1);
  }
  return Object.freeze(profile);
}

export function createBotPersonalities(ids, random = randomInt) {
  let available = [];
  return new Map(ids.map(id => {
    if (!available.length) available = Object.keys(BOT_STYLES);
    const [style] = available.splice(random(available.length), 1);
    return [id, createBotPersonality(random, style)];
  }));
}

export function botRationality(difficulty, personality = DEFAULT_PERSONALITY) {
  const [low, high] = (LEVELS[difficulty] || LEVELS.normal).reason;
  return low + clamp(personality.discipline ?? .5, 0, 1) * (high - low);
}

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

export function chooseBotAction(view, id, difficulty = 'normal', random = randomInt, personality = DEFAULT_PERSONALITY) {
  const me = view.players.find(player => player.id === id), legal = view.legal;
  if (!me || !legal) return null;
  if (view.board.length === 5) {
    const boardScore = evaluate(view.board);
    if (boardScore[0] === 8 && boardScore[1] === 14) return { type: legal.canCheck ? 'check' : 'call' };
  }
  const level = LEVELS[difficulty] || LEVELS.normal;
  const analysis = estimateBotEquity(view, id, { trials: level.trials, random });
  return decideBotAction(view, id, difficulty, analysis, personality, random);
}

// Separate price/behavior decisions from Monte Carlo sampling so the same
// public-information equity estimate can be evaluated without rerunning it.
export function decideBotAction(view, id, difficulty, analysis, personality = DEFAULT_PERSONALITY, random = randomInt) {
  const me = view.players.find(player => player.id === id), legal = view.legal;
  if (!me || !legal) return null;
  const level = LEVELS[difficulty] || LEVELS.normal;
  const profile = { ...DEFAULT_PERSONALITY, ...personality };
  const preflop = view.board.length === 0;
  const reason = botRationality(difficulty, profile), impulse = 1 - reason;
  const opponents = view.players.filter(player => player.id !== id && !player.folded);
  const noise = (roll(random) - .5) * level.noise * (1 + profile.volatility * impulse);
  const equity = clamp(analysis.equity + noise, 0, 1), callEquity = clamp(analysis.callEquity + noise, 0, 1);
  const odds = legal.callAmount / Math.max(1, analysis.eligiblePot);
  const cost = legal.callAmount / Math.max(1, me.chips);
  const risk = cost * (.02 + .08 * reason) * (1 - profile.riskTolerance * .5);
  const requiredEdge = level.margin + risk + (.5 - profile.looseness) * .22 * impulse;
  const expectedCallValue = analysis.callEquity * analysis.eligiblePot - legal.callAmount;
  const trueEdge = expectedCallValue / Math.max(1, analysis.eligiblePot);
  // Do not let sampling noise alone justify committing most of a stack before
  // the flop. Loose personalities may still make mistakes, at a reduced rate.
  const pricedEquity = preflop && cost >= .5 ? analysis.callEquity : callEquity;
  if (!legal.canCheck && pricedEquity - odds < requiredEdge) {
    const errorBudget = Math.min(level.lossLimit, impulse * (.5 + .6 * profile.calling));
    const chaseChance = level.mistake * impulse * (.2 + .8 * profile.calling) *
      (.4 + .6 * profile.riskTolerance) * (1 - .35 * Math.min(1, cost) * reason) *
      (preflop ? cost >= .8 ? .15 : cost >= .25 ? .4 : 1 : 1);
    // Low discipline can pay a bad price to chase a weak hand. Stronger AI
    // caps the size of this error instead of randomly ignoring huge losses.
    if (trueEdge >= -errorBudget && roll(random) < chaseChance) return { type: 'call' };
    return { type: 'fold' };
  }

  const order = [me, ...opponents].sort((a, b) => ((a.seat - view.button + 7) % 8) - ((b.seat - view.button + 7) % 8));
  const position = order.indexOf(me) / Math.max(1, order.length - 1);
  const fair = 1 / (opponents.length + 1);
  const threshold = Math.max(fair + .025, Math.max(fair * 1.35, fair + (opponents.length === 1 ? .12 : .08)) +
    (.5 - profile.aggression) * (.1 + .12 * impulse));
  const quality = preflop ? preflopQuality(me.cards) : 0;
  const facingRaise = preflop && view.currentBet > view.bigBlind;
  const preflopRaises = (view.history || []).filter(action => action.street === 'preflop' && /^(加注|全下)/.test(action.action)).length;
  // Multiway equity alone is not a license to repeatedly raise before seeing
  // the board. Re-raises need stronger hole cards, especially in an escalated pot.
  const raiseQuality = facingRaise ? preflopRaises >= 2 || view.currentBet >= view.bigBlind * 10 ? .90 : .76 : .58 - position * .08;
  const premium = preflop && quality >= .81 && equity > fair + .04;
  const opening = preflop && view.currentBet <= view.bigBlind && quality > .70 - position * .12 - (profile.looseness - .5) * .18 * impulse && equity > fair;
  const bluff = opponents.length <= 2 && opponents.every(player => player.chips > 0) &&
    (legal.canCheck || preflop && view.currentBet <= view.bigBlind) &&
    roll(random) < level.bluff * (.2 + 2 * profile.bluffing) * (position > .5 ? 1 : .5) * (preflop ? .2 : 1);
  const valueRaise = preflop ? quality >= raiseQuality && (equity > threshold || !facingRaise && (premium || opening)) : equity > threshold;
  const raiseChance = facingRaise ? .20 + .35 * profile.aggression : .55 + .35 * profile.aggression;
  if (legal.canRaise && (valueRaise || bluff) && (!preflop || roll(random) < raiseChance)) {
    let target;
    if (preflop) {
      const limpers = new Set((view.history || []).filter(action => action.street === 'preflop' && /^跟注/.test(action.action)).map(action => action.seat)).size;
      target = view.currentBet <= view.bigBlind ? view.bigBlind * ((position > .5 ? 2.5 : 3) + limpers) : view.currentBet * (position > .5 ? 2.5 : 3);
    } else target = me.bet + legal.callAmount + analysis.eligiblePot * (equity > .8 ? .75 : bluff ? .45 : .6);
    // Different betting sizes remain plausible at high difficulty; the random
    // variation narrows as rationality rises, while the habitual size persists.
    const sizeScale = 1 + (profile.betScale - 1) * (.45 + .55 * impulse);
    const variation = 1 + (roll(random) - .5) * profile.volatility * (.08 + .35 * impulse);
    target = me.bet + legal.callAmount + Math.max(0, target - me.bet - legal.callAmount) * sizeScale * variation;
    const cover = Math.max(legal.minTo, ...opponents.map(player => player.bet + player.chips));
    const maximum = Math.min(legal.maxTo, cover), step = target <= 50 ? 5 : 10;
    target = clamp(Math.ceil(target / step) * step, legal.minTo, maximum);
    const potCommitted = maximum === legal.maxTo && me.chips - legal.callAmount < analysis.eligiblePot * 1.2 && equity > Math.max(.65, threshold + .1);
    if (preflop) {
      const effectiveChips = Math.max(1, Math.min(me.chips, cover - me.bet));
      const short = effectiveChips <= view.bigBlind * 25;
      const large = target - me.bet > effectiveChips * .25 || target > view.bigBlind * 12;
      const largeQuality = effectiveChips <= view.bigBlind * 10 ? .72 : short ? .76 : .86;
      if (large && (bluff || quality < largeQuality || analysis.equity < Math.max(fair + .08, threshold + .03) ||
        roll(random) >= .18 + .35 * profile.aggression)) return { type: legal.canCheck ? 'check' : 'call' };
      const jamQuality = effectiveChips <= view.bigBlind * 10 ? .72 : short ? .81 : .93;
      const jamEquity = Math.max(fair + (short ? .08 : .18), fair * (short ? 1.15 : 1.5));
      const canJam = !bluff && quality >= jamQuality && analysis.equity >= jamEquity;
      if ((target === legal.maxTo || potCommitted) && canJam && roll(random) < .08 + .18 * profile.aggression + (short ? .15 : 0)) target = maximum;
      else if (target === legal.maxTo) {
        // Declining a shove must not turn into a nearly identical 99%-stack bet.
        target = Math.min(target, me.bet + Math.floor(me.chips * .4 / step) * step);
        if (target < legal.minTo) return { type: legal.canCheck ? 'check' : 'call' };
      }
    } else if (potCommitted) target = maximum;
    if (target >= legal.minTo || target === legal.maxTo && !bluff) {
      const action = { type: 'raise', amount: target };
      if (bluff && !valueRaise) {
        const made = view.board.length >= 3 ? evaluate([...me.cards, ...view.board])[0] : 0;
        const madeStrength = [0, .35, .55, .7, .9, .9, .95, .98, 1][made];
        const weakness = (1 - preflopQuality(me.cards)) * (1 - madeStrength);
        bluffDecisions.set(action, Object.freeze({ street: view.street, weakness }));
      }
      return action;
    }
  }
  return { type: legal.canCheck ? 'check' : 'call' };
}
