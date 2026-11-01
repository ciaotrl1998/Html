import { amountAtRatio, ratioForAmount, stagedAction, selectionAtRatio, sliderStops, minimumBet, maximumBet } from './bet-sizing.js';
import { canShowWinningCards } from '../shared/poker.js';
export { amountAtRatio, ratioForAmount, stagedAction } from './bet-sizing.js';
export const TABLE_GESTURES = { hold: 350, sliderTravel: 320, forward: 38, doubleTap: 320, tapSlop: 8 };
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
export const tableTurnKey = room => room?.hand ? `${room.code}:${room.hand.number}:${room.turnId}` : null;

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
      ? { key: tableTurnKey(room), legal: hand.legal, player, currentBet: hand.currentBet, pot: hand.pot || 0 } : null;
    const revealKey = connected && !room?.dealing && ['playing', 'finished'].includes(room?.phase) && canShowWinningCards(hand, you) ? tableTurnKey(room) : null;
    const signature = context ? JSON.stringify([context.key, context.legal, player.bet, player.chips, context.pot]) : revealKey ? `show:${revealKey}` : null;
    if (signature !== this.signature) {
      this.pending = 0; this.gesture = null; this.lastTap = null; this.inFlight = false; this.signature = signature;
    }
    this.context = context; this.revealKey = revealKey; this.bankroll = player?.chips || 0; this.emit();
  }
  get key() { return this.context?.key ?? this.revealKey; }
  get enabled() { return (!!this.context || !!this.revealKey) && !this.inFlight; }
  get selecting() { return this.enabled && (this.gesture?.kind === 'bank' || this.gesture?.kind === 'select'); }
  emit() {
    const g = this.gesture, stops = sliderStops(this.context);
    this.change({ pending: this.pending, bankroll: this.bankroll, remaining: this.bankroll - this.pending,
      enabled: !!this.context && this.enabled, inFlight: this.inFlight, selecting: this.selecting,
      selected: g?.selected ?? this.pending, ratio: g?.ratio ?? ratioForAmount(this.context, this.pending), preset: g?.preset ?? stops.find(stop => stop.amount === this.pending)?.label ?? '', stops,
      hint: g?.hint || '', minimum: minimumBet(this.context), maximum: this.context ? maximumBet(this.context) : 0,
      progress: g?.progress || 0, dragging: g?.kind === 'staged' ? 'chips' : g?.kind === 'hand' ? 'hand' : null });
  }
  begin(target, point, time) {
    if (!this.enabled) return false;
    const kind = this.revealKey ? target?.cardRole === 'hand' ? 'hand' : null
      : target?.chipRole === 'bank' ? 'bank' : target?.chipRole === 'staged' && this.pending > 0 ? 'staged'
      : target?.cardRole === 'hand' ? 'hand' : target?.tableSurface ? 'table' : null;
    if (!kind) { this.lastTap = null; return false; }
    if (kind !== 'table') this.lastTap = null;
    this.gesture = { kind, start: { ...point }, point: { ...point }, time, key: this.key, moved: 0, progress: 0 };
    if (kind === 'bank') {
      const initial = this.pending || minimumBet(this.context);
      this.gesture.initialRatio = ratioForAmount(this.context, initial);
      this.gesture.rawRatio = this.gesture.initialRatio; this.gesture.lastY = point.y;
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
    const travel = this.sliderTravel();
    const ratio = clamp(g.rawRatio + (g.lastY - g.point.y) / travel, 0, 1);
    g.rawRatio = ratio; g.lastY = g.point.y;
    const selected = selectionAtRatio(this.context, ratio, travel);
    g.selected = selected.amount; g.ratio = selected.ratio; g.preset = selected.preset; g.hint = selected.hint; this.emit();
  }
  move(point, time) {
    const g = this.gesture;
    if (!g) return false;
    g.point = { ...point }; g.moved = Math.max(g.moved, Math.hypot(point.x - g.start.x, point.y - g.start.y));
    if (!this.enabled || g.key !== this.key) return true;
    if (g.kind === 'bank' && (g.moved > TABLE_GESTURES.tapSlop || time - g.time >= TABLE_GESTURES.hold)) g.kind = 'select';
    // Preview from the first pixel; keep tap slop only for deciding how release behaves.
    if (g.kind === 'bank' || g.kind === 'select') this.select(g);
    else if (g.kind === 'staged' || g.kind === 'hand') {
      g.progress = Math.max(0, this.forward(g.start, point)); this.emit();
    } else if (g.kind === 'table' && g.moved > TABLE_GESTURES.tapSlop) this.lastTap = null;
    return g.kind !== 'table';
  }
  release(point, time) {
    if (!this.gesture) return;
    this.move(point, time);
    const g = this.gesture; this.gesture = null;
    if (!this.enabled || g.key !== this.key) { this.emit(); return; }
    if (g.kind === 'select') this.pending = stagedAction(this.context, g.selected) ? g.selected
      : amountAtRatio(this.context, ratioForAmount(this.context, g.selected));
    else if (g.kind === 'bank' && g.moved <= TABLE_GESTURES.tapSlop) this.pending = this.context.legal.callAmount;
    else if (g.kind === 'staged') {
      if (g.moved <= TABLE_GESTURES.tapSlop) this.pending = 0;
      else if (g.progress >= 1) {
        const action = stagedAction(this.context, this.pending);
        if (action) this.submit(action);
      }
    } else if (g.kind === 'hand' && g.progress >= 1) this.submit({ type: this.revealKey ? 'show-cards' : 'fold' });
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
    if (!this.enabled || (this.revealKey ? action.type !== 'show-cards' : action.type === 'show-cards')) return false;
    const key = this.key, amount = this.pending;
    if (this.send(action.type, action.amount, key) === false) return false;
    this.inFlight = true; this.submittedAmount = amount; this.pending = 0; this.lastTap = null;
    if (action.type !== 'show-cards') this.commit({ type: action.type, amount });
    return true;
  }
  cancel() { this.gesture = null; this.lastTap = null; this.emit(); }
  reject() {
    if (this.inFlight && stagedAction(this.context, this.submittedAmount)) this.pending = this.submittedAmount;
    this.inFlight = false; this.cancel();
  }
}
