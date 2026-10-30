export const TABLE_GESTURES = { hold: 350, sliderTravel: 320, forward: 38, doubleTap: 320, tapSlop: 8 };
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
export const tableTurnKey = room => room?.hand ? `${room.code}:${room.hand.number}:${room.turnId}` : null;

export function amountAtRatio(context, ratio) {
  const { legal, player } = context;
  if (!legal.canRaise) return legal.callAmount;
  const r = clamp(ratio, 0, 1), minimum = Math.min(legal.minTo, legal.maxTo) - player.bet;
  if (r <= 0) return legal.callAmount;
  if (r >= 1) return player.chips;
  const amount = minimum + (player.chips - minimum) * clamp((r - .05) / .95, 0, 1);
  const step = amount <= 50 ? 5 : 10;
  const firstRaise = Math.ceil(minimum / (minimum <= 50 ? 5 : 10)) * (minimum <= 50 ? 5 : 10);
  return Math.min(player.chips, Math.max(firstRaise, Math.round(amount / step) * step));
}
export function ratioForAmount(context, amount) {
  if (amount <= context.legal.callAmount) return 0;
  if (amount >= context.player.chips) return 1;
  const minimum = Math.min(context.legal.minTo, context.legal.maxTo) - context.player.bet;
  return .05 + .95 * clamp((amount - minimum) / Math.max(1, context.player.chips - minimum), 0, 1);
}
export function stagedAction(context, amount) {
  if (!context || !Number.isSafeInteger(amount) || amount <= 0 || amount > context.player.chips) return null;
  const { legal, player, currentBet } = context, total = player.bet + amount;
  if (legal.toCall > 0 && amount === legal.callAmount) return { type: 'call' };
  if (amount === player.chips && legal.canAllIn) return { type: 'allin' };
  if (legal.canRaise && total > currentBet && total >= legal.minTo && total <= legal.maxTo) return { type: 'raise', amount: total };
  return null;
}

export class TableActions {
  constructor({ send = () => false, change = () => {}, commit = () => {}, forward, sliderTravel = () => TABLE_GESTURES.sliderTravel } = {}) {
    this.send = send; this.change = change; this.commit = commit;
    this.sliderTravel = sliderTravel;
    this.forward = forward || ((start, point) => {
      const dy = start.y - point.y, dx = Math.abs(start.x - point.x);
      return dx <= Math.max(18, dy * 1.5) ? dy / TABLE_GESTURES.forward : 0;
    });
    this.context = null; this.pending = 0; this.bankroll = 0; this.gesture = null; this.lastTap = null; this.inFlight = false;
  }
  sync(room, you, connected = true) {
    const hand = room?.hand, player = hand?.players.find(p => p.id === you);
    const context = connected && room?.phase === 'playing' && !room.dealing && !hand?.done && hand?.legal && player?.seat === hand.actor
      ? { key: tableTurnKey(room), legal: hand.legal, player, currentBet: hand.currentBet } : null;
    const signature = context ? JSON.stringify([context.key, context.legal, player.bet, player.chips]) : null;
    if (signature !== this.signature) {
      this.pending = 0; this.gesture = null; this.lastTap = null; this.inFlight = false; this.signature = signature;
    }
    this.context = context; this.bankroll = player?.chips || 0; this.emit();
  }
  get enabled() { return !!this.context && !this.inFlight; }
  emit() {
    const g = this.gesture;
    this.change({ pending: this.pending, bankroll: this.bankroll, remaining: this.bankroll - this.pending,
      enabled: this.enabled, inFlight: this.inFlight, selecting: g?.kind === 'bank' || g?.kind === 'select',
      selected: g?.selected ?? this.pending, ratio: g?.ratio ?? 0,
      maximum: this.context?.legal.canRaise ? this.bankroll : this.context?.legal.callAmount || 0,
      progress: g?.progress || 0, dragging: g?.kind === 'staged' ? 'chips' : g?.kind === 'hand' ? 'hand' : null });
  }
  begin(target, point, time) {
    if (!this.enabled) return false;
    const kind = target?.chipRole === 'bank' ? 'bank' : target?.chipRole === 'staged' && this.pending > 0 ? 'staged'
      : target?.cardRole === 'hand' ? 'hand' : target?.tableSurface ? 'table' : null;
    if (!kind) { this.lastTap = null; return false; }
    if (kind !== 'table') this.lastTap = null;
    this.gesture = { kind, start: { ...point }, point: { ...point }, time, key: this.context.key, moved: 0, progress: 0 };
    if (kind === 'bank') {
      const initial = this.pending || this.context.legal.callAmount || Math.min(this.context.legal.minTo, this.context.legal.maxTo) - this.context.player.bet;
      this.gesture.initialRatio = ratioForAmount(this.context, initial);
      this.select(this.gesture);
    }
    return true;
  }
  tick(time) {
    const g = this.gesture;
    if (g?.kind === 'bank' && this.enabled && g.key === this.context.key && time - g.time >= TABLE_GESTURES.hold) {
      g.kind = 'select';
      this.select(g);
    }
  }
  select(g) {
    const ratio = this.context.legal.canRaise ? clamp(g.initialRatio + (g.start.y - g.point.y) / this.sliderTravel(), 0, 1) : 0;
    g.selected = amountAtRatio(this.context, ratio);
    g.ratio = ratioForAmount(this.context, g.selected); this.emit();
  }
  move(point, time) {
    const g = this.gesture;
    if (!g) return false;
    g.point = { ...point }; g.moved = Math.max(g.moved, Math.hypot(point.x - g.start.x, point.y - g.start.y));
    if (!this.enabled || g.key !== this.context.key) return true;
    if (g.kind === 'bank' && g.moved > TABLE_GESTURES.tapSlop) g.kind = 'select';
    this.tick(time);
    if (g.kind === 'select') this.select(g);
    else if (g.kind === 'staged' || g.kind === 'hand') {
      g.progress = Math.max(0, this.forward(g.start, point)); this.emit();
    } else if (g.kind === 'table' && g.moved > TABLE_GESTURES.tapSlop) this.lastTap = null;
    return g.kind !== 'table';
  }
  release(point, time) {
    if (!this.gesture) return;
    this.move(point, time);
    const g = this.gesture; this.gesture = null;
    if (!this.enabled || g.key !== this.context.key) { this.emit(); return; }
    if (g.kind === 'select') this.pending = g.selected;
    else if (g.kind === 'bank' && g.moved <= TABLE_GESTURES.tapSlop) this.pending = this.context.legal.callAmount;
    else if (g.kind === 'staged') {
      if (g.moved <= TABLE_GESTURES.tapSlop) this.pending = 0;
      else if (g.progress >= 1) {
        const action = stagedAction(this.context, this.pending);
        if (action) this.submit(action);
      }
    } else if (g.kind === 'hand' && g.progress >= 1) this.submit({ type: 'fold' });
    else if (g.kind === 'table' && g.moved <= TABLE_GESTURES.tapSlop) {
      const previous = this.lastTap;
      if (previous && time - previous.time <= TABLE_GESTURES.doubleTap && Math.hypot(point.x - previous.x, point.y - previous.y) <= 28) {
        this.lastTap = null;
        if (this.context.legal.canCheck) this.submit({ type: 'check' });
      } else this.lastTap = { ...point, time };
    }
    this.emit();
  }
  submit(action) {
    if (!this.enabled) return false;
    const key = this.context.key, amount = this.pending;
    if (this.send(action.type, action.amount, key) === false) return false;
    this.inFlight = true; this.submittedAmount = amount; this.pending = 0; this.lastTap = null;
    this.commit({ type: action.type, amount }); return true;
  }
  cancel() { this.gesture = null; this.lastTap = null; this.emit(); }
  reject() {
    if (this.inFlight && stagedAction(this.context, this.submittedAmount)) this.pending = this.submittedAmount;
    this.inFlight = false; this.cancel();
  }
}
