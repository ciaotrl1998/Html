// Pure poker rules. Cards: rank = card % 13 + 2; suit = floor(card / 13).
export const HAND_NAMES = ['高牌', '一对', '两对', '三条', '顺子', '同花', '葫芦', '四条', '同花顺'];
export const cardRank = card => card % 13 + 2;
export const cardSuit = card => Math.floor(card / 13);
export function compareHands(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff) return diff;
  }
  return 0;
}
function five(cards) {
  const ranks = cards.map(cardRank).sort((a, b) => b - a);
  const flush = cards.every(c => cardSuit(c) === cardSuit(cards[0]));
  const unique = [...new Set(ranks)];
  let straight = unique.length === 5 && unique[0] - unique[4] === 4 ? unique[0] : 0;
  if (unique.join(',') === '14,5,4,3,2') straight = 5;
  const counts = new Map();
  for (const r of ranks) counts.set(r, (counts.get(r) || 0) + 1);
  const groups = [...counts].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  if (flush && straight) return [8, straight];
  if (groups[0][1] === 4) return [7, groups[0][0], groups[1][0]];
  if (groups[0][1] === 3 && groups[1][1] === 2) return [6, groups[0][0], groups[1][0]];
  if (flush) return [5, ...ranks];
  if (straight) return [4, straight];
  if (groups[0][1] === 3) return [3, groups[0][0], ...groups.slice(1).map(g => g[0])];
  if (groups[0][1] === 2 && groups[1][1] === 2) {
    return [2, Math.max(groups[0][0], groups[1][0]), Math.min(groups[0][0], groups[1][0]), groups[2][0]];
  }
  if (groups[0][1] === 2) return [1, groups[0][0], ...groups.slice(1).map(g => g[0])];
  return [0, ...ranks];
}
export function evaluate(cards) {
  if (cards.length < 5 || cards.length > 7) throw new Error('需要 5–7 张牌');
  let best = null;
  for (let a = 0; a < cards.length - 4; a++)
    for (let b = a + 1; b < cards.length - 3; b++)
      for (let c = b + 1; c < cards.length - 2; c++)
        for (let d = c + 1; d < cards.length - 1; d++)
          for (let e = d + 1; e < cards.length; e++) {
            const score = five([cards[a], cards[b], cards[c], cards[d], cards[e]]);
            if (!best || compareHands(score, best) > 0) best = score;
          }
  return best;
}
export function shuffledDeck(randomInt) {
  const deck = Array.from({ length: 52 }, (_, i) => i);
  for (let i = deck.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}
export function handName(score) {
  return score[0] === 8 && score[1] === 14 ? '皇家同花顺' : HAND_NAMES[score[0]];
}

export class PokerHand {
  constructor({ players, button, smallBlind, bigBlind, ante = 0, deck, number = 1 }) {
    if (players.length < 2 || players.length > 8) throw new Error('需要 2–8 名玩家');
    this.players = players.map(p => ({ ...p, cards: [], folded: false, bet: 0, total: 0, lastActBet: null, action: '' }));
    this.button = button;
    this.smallBlind = smallBlind;
    this.bigBlind = bigBlind;
    this.ante = ante;
    this.deck = [...deck];
    this.number = number;
    this.board = [];
    this.burned = [];
    this.street = 'preflop';
    this.currentBet = bigBlind;
    this.minRaise = bigBlind;
    this.done = false;
    this.result = null;
    this.history = [];
    const dealer = this.players.find(p => p.seat === button);
    if (!dealer) throw new Error('庄家座位无效');
    const sb = this.players.length === 2 ? dealer : this.next(button);
    const bb = this.next(sb.seat);
    this.sbSeat = sb.seat;
    this.bbSeat = bb.seat;
    for (const p of this.players) this.pay(p, Math.min(ante, p.chips), false);
    this.pay(sb, Math.min(smallBlind, sb.chips));
    this.pay(bb, Math.min(bigBlind, bb.chips));
    sb.action = '小盲';
    bb.action = '大盲';
    for (let i = 0; i < 2; i++) {
      let pos = button;
      for (let j = 0; j < this.players.length; j++) {
        const p = this.next(pos);
        p.cards.push(this.draw());
        pos = p.seat;
      }
    }
    this.actor = this.next(bb.seat, p => p.chips > 0)?.seat ?? null;
    this.progress(bb.seat);
  }
  draw() {
    if (!this.deck.length) throw new Error('牌堆为空');
    return this.deck.shift();
  }
  next(seat, predicate = () => true) {
    for (let offset = 1; offset <= 8; offset++) {
      const p = this.players.find(p => p.seat === (seat + offset) % 8);
      if (p && predicate(p)) return p;
    }
    return null;
  }
  pay(p, amount, street = true) {
    if (!Number.isSafeInteger(amount) || amount < 0 || amount > p.chips) throw new Error('筹码金额无效');
    p.chips -= amount;
    p.total += amount;
    if (street) p.bet += amount;
  }
  legal(id) {
    const p = this.players.find(p => p.id === id);
    if (this.done || !p || p.folded || p.chips === 0 || p.seat !== this.actor) return null;
    const toCall = Math.max(0, this.currentBet - p.bet);
    const maxTo = p.bet + p.chips;
    const raiseRight = p.lastActBet === null || this.currentBet - p.lastActBet >= this.minRaise;
    const otherCanBet = this.players.some(o => o.id !== id && !o.folded && o.chips > 0);
    const canRaise = raiseRight && otherCanBet && maxTo > this.currentBet;
    const minTo = this.currentBet < this.bigBlind ? this.bigBlind : this.currentBet + this.minRaise;
    return { toCall, callAmount: Math.min(toCall, p.chips), canCheck: toCall === 0, canRaise,
      minTo, maxTo, canAllIn: maxTo <= this.currentBet || canRaise };
  }
  act(id, type, amount) {
    const p = this.players.find(p => p.id === id);
    const legal = this.legal(id);
    if (!legal) throw new Error('尚未轮到你行动');
    let label;
    if (type === 'fold') { p.folded = true; label = '弃牌'; }
    else if (type === 'check') {
      if (!legal.canCheck) throw new Error('当前不能过牌');
      label = '过牌';
    } else if (type === 'call') {
      if (legal.canCheck) throw new Error('无需跟注，请过牌');
      this.pay(p, legal.callAmount);
      label = p.chips === 0 ? '全下' : `跟注 ${legal.callAmount}`;
    } else if (type === 'raise' || type === 'allin') {
      const target = type === 'allin' ? legal.maxTo : amount;
      if (type === 'allin' && !legal.canAllIn) throw new Error('当前无权全下加注');
      if (!Number.isSafeInteger(target) || target > legal.maxTo || target <= p.bet) throw new Error('下注金额无效');
      if (target <= this.currentBet) {
        if (type !== 'allin') throw new Error('请使用跟注');
        this.pay(p, p.chips);
      } else {
        if (!legal.canRaise) throw new Error('当前未重新开放加注');
        if (target < legal.minTo && target !== legal.maxTo) throw new Error(`最少加注至 ${legal.minTo}`);
        const increase = target - this.currentBet;
        this.pay(p, target - p.bet);
        if (this.currentBet < this.bigBlind && target >= this.bigBlind) this.minRaise = target;
        else if (increase >= this.minRaise) this.minRaise = increase;
        this.currentBet = target;
      }
      label = p.chips === 0 ? '全下' : `加注至 ${target}`;
    } else throw new Error('无效行动');
    p.lastActBet = this.currentBet;
    p.action = label;
    this.history.push({ name: p.name, seat: p.seat, action: label, street: this.street });
    this.progress(p.seat);
  }
  progress(afterSeat) {
    if (this.done) return;
    const live = this.players.filter(p => !p.folded);
    if (live.length === 1) { this.settle(false); return; }
    const active = live.filter(p => p.chips > 0);
    // No live opponent can match an extra wager: only the actual all-in bet is owed.
    if (active.length <= 1) this.currentBet = Math.min(this.currentBet, Math.max(...live.map(p => p.bet)));
    const closed = active.every(p => p.lastActBet !== null && p.bet >= this.currentBet);
    const noMoreBets = active.length <= 1 && active.every(p => p.bet >= this.currentBet);
    if (closed || noMoreBets) {
      if (this.street === 'river') { this.settle(true); return; }
      this.advanceStreet();
      return;
    }
    this.actor = this.next(afterSeat, p => !p.folded && p.chips > 0 && (p.lastActBet === null || p.bet < this.currentBet))?.seat ?? null;
    if (this.actor === null) throw new Error('行动顺序异常');
  }
  advanceStreet() {
    this.burned.push(this.draw());
    if (this.street === 'preflop') { this.street = 'flop'; this.board.push(this.draw(), this.draw(), this.draw()); }
    else if (this.street === 'flop') { this.street = 'turn'; this.board.push(this.draw()); }
    else { this.street = 'river'; this.board.push(this.draw()); }
    this.currentBet = 0;
    this.minRaise = this.bigBlind;
    for (const p of this.players) { p.bet = 0; p.lastActBet = null; if (!p.folded && p.chips === 0) p.action = '全下'; }
    this.progress(this.button);
  }
  settle(showdown) {
    // Return the unique unmatched contribution before constructing pot layers.
    const sorted = [...this.players].sort((a, b) => b.total - a.total);
    const refund = sorted[0].total - sorted[1].total;
    if (refund > 0 && !sorted[0].folded) {
      sorted[0].chips += refund;
      sorted[0].total -= refund;
      sorted[0].bet = Math.max(0, sorted[0].bet - refund);
    }
    const scores = new Map();
    if (showdown) for (const p of this.players.filter(p => !p.folded)) scores.set(p.id, evaluate([...p.cards, ...this.board]));
    const levels = [...new Set(this.players.map(p => p.total).filter(n => n > 0))].sort((a, b) => a - b);
    const pots = [];
    let previous = 0;
    for (const level of levels) {
      const contributors = this.players.filter(p => p.total >= level);
      const amount = (level - previous) * contributors.length;
      previous = level;
      const eligible = contributors.filter(p => !p.folded);
      let winners = eligible;
      if (showdown) {
        let best = null;
        for (const p of eligible) if (!best || compareHands(scores.get(p.id), best) > 0) best = scores.get(p.id);
        winners = eligible.filter(p => compareHands(scores.get(p.id), best) === 0);
      }
      if (!winners.length) throw new Error('底池无合法获胜者');
      winners.sort((a, b) => ((a.seat - this.button + 7) % 8) - ((b.seat - this.button + 7) % 8));
      const share = Math.floor(amount / winners.length);
      let remainder = amount % winners.length;
      const awards = winners.map(p => {
        const won = share + (remainder-- > 0 ? 1 : 0);
        p.chips += won;
        return { id: p.id, name: p.name, seat: p.seat, amount: won, hand: showdown ? handName(scores.get(p.id)) : '其余玩家弃牌' };
      });
      pots.push({ amount, awards });
    }
    this.done = true;
    this.actor = null;
    this.result = { showdown, pots, refund: refund > 0 && !sorted[0].folded ? { id: sorted[0].id, amount: refund } : null };
  }
  snapshot(viewerId) {
    const reveal = this.done && this.result.showdown;
    return { number: this.number, button: this.button, sbSeat: this.sbSeat, bbSeat: this.bbSeat,
      smallBlind: this.smallBlind, bigBlind: this.bigBlind, street: this.street, board: [...this.board],
      currentBet: this.currentBet, pot: this.players.reduce((s, p) => s + p.total, 0),
      actor: this.actor, done: this.done, result: this.result, history: this.history.slice(-16),
      legal: this.legal(viewerId), players: this.players.map(({ lastActBet, cards, ...p }) => ({ ...p,
        cards: p.id === viewerId || (reveal && !p.folded) ? [...cards] : [null, null] })) };
  }
}
