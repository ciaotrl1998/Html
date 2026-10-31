const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
export const BET_SNAP_PIXELS = 8;
const sizingCache = new WeakMap();
const emptyStops = [];
function sizingFor(context) {
  const { legal, player } = context;
  let cached = sizingCache.get(context);
  if (cached && cached.pot === context.pot && cached.currentBet === context.currentBet &&
      cached.bet === player.bet && cached.chips === player.chips && cached.canRaise === legal.canRaise &&
      cached.callAmount === legal.callAmount && cached.toCall === legal.toCall && cached.minTo === legal.minTo &&
      cached.maxTo === legal.maxTo && cached.canAllIn === legal.canAllIn) return cached;
  cached = { pot: context.pot, currentBet: context.currentBet, bet: player.bet, chips: player.chips,
    canRaise: legal.canRaise, callAmount: legal.callAmount, toCall: legal.toCall,
    minTo: legal.minTo, maxTo: legal.maxTo, canAllIn: legal.canAllIn };
  sizingCache.set(context, cached);
  return cached;
}
export const maximumBet = context => context.legal.canRaise ? context.player.chips : context.legal.callAmount;
const hasPotMidpoint = (pot, maximum) => pot > 0 && pot <= maximum / 2;
const amountStep = (context, amount) => context.pot > 0
  ? amount <= context.pot && amount <= 100 ? 1 : 10
  : amount <= 50 ? 5 : 10;
const bandBounds = (context, amount) => {
  if (!(context.pot > 0)) return [0, maximumBet(context)];
  const maximum = maximumBet(context);
  // Rounding must not cross a neighbouring exact preset and reverse the drag.
  const cached = sizingFor(context);
  const boundaries = cached.boundaries ||= [Math.min(context.pot, 100), context.pot, ...sliderStops(context).map(stop => stop.amount)]
    .filter(value => value > 0 && value <= maximum).sort((a, b) => a - b);
  let low = 0;
  for (const high of boundaries) {
    if (amount <= high) return [low, high];
    low = high;
  }
  return [low, maximum];
};
const rawAmount = (context, ratio) => {
  const maximum = maximumBet(context), pot = context.pot || 0;
  const midpoint = hasPotMidpoint(pot, maximum), anchor = midpoint ? .5 : pot / maximum;
  if (pot > 0 && pot < maximum && ratio > anchor) {
    return pot * (maximum / pot) ** ((ratio - anchor) / (1 - anchor));
  }
  return midpoint ? pot * ratio * 2 : maximum * ratio;
};

export function ratioForAmount(context, amount) {
  if (!context) return 0;
  const maximum = maximumBet(context), pot = context.pot || 0;
  const value = clamp(amount, 0, maximum);
  if (!maximum) return 0;
  const midpoint = hasPotMidpoint(pot, maximum), anchor = midpoint ? .5 : pot / maximum;
  if (pot > 0 && pot < maximum && value > pot) {
    return anchor + Math.log(value / pot) / Math.log(maximum / pot) * (1 - anchor);
  }
  if (midpoint) return value / pot * .5;
  return value / maximum;
}

export function stagedAction(context, amount) {
  if (!context || !Number.isSafeInteger(amount) || amount <= 0 || amount > context.player.chips) return null;
  const { legal, player, currentBet } = context, total = player.bet + amount;
  if (legal.toCall > 0 && amount === legal.callAmount) return { type: 'call' };
  if (amount === player.chips && legal.canAllIn) return { type: 'allin' };
  if (legal.canRaise && total > currentBet && total >= legal.minTo && total <= legal.maxTo) return { type: 'raise', amount: total };
  return null;
}

export function potStops(context) {
  if (!context || !(context.pot > 0)) return emptyStops;
  const cached = sizingFor(context);
  return cached.pots ||= [[.25, '1/4池'], [.5, '半池'], [1, '满池']].map(([fraction, label]) => {
    const amount = Math.round(context.pot * fraction);
    return { label, amount, ratio: ratioForAmount(context, amount) };
  }).filter(stop => stop.amount <= maximumBet(context) && stagedAction(context, stop.amount));
}

export function sliderStops(context) {
  if (!context) return emptyStops;
  const cached = sizingFor(context);
  if (cached.stops) return cached.stops;
  const kinds = { '1/4池': 'quarter', '半池': 'half', '满池': 'full' };
  const stops = potStops(context).map(stop => ({ ...stop, kind: kinds[stop.label] }));
  const { legal, player } = context;
  if (legal.callAmount > 0) {
    const minimum = Math.min(legal.minTo, legal.maxTo) - player.bet;
    const limits = [{ kind: 'call', amount: legal.callAmount, label: `跟注至少 ${legal.callAmount.toLocaleString('zh-CN')}` }];
    if (legal.canRaise && minimum > legal.callAmount) limits.push({ kind: 'raise', amount: minimum, label: `加注至少 ${minimum.toLocaleString('zh-CN')}` });
    // Prefer the legal-limit label when a limit shares a position with a pot preset.
    stops.unshift(...limits.map(stop => ({ ...stop, ratio: ratioForAmount(context, stop.amount) })));
  }
  cached.callHint = limitsLabel(context.legal.callAmount, '跟注至少');
  cached.raiseHint = limitsLabel(Math.min(legal.minTo, legal.maxTo) - player.bet, '加注至少');
  return cached.stops = stops;
}

const limitsLabel = (amount, label) => amount > 0 ? `${label} ${amount.toLocaleString('zh-CN')}` : '';

export function amountAtRatio(context, ratio, preview = false) {
  const { legal, player } = context, r = clamp(ratio, 0, 1), maximum = maximumBet(context);
  if (r <= 0 || maximum <= 0) return 0;
  if (!legal.canRaise) return legal.callAmount;
  if (r >= 1) return player.chips;
  const raw = rawAmount(context, r);
  const exact = potStops(context).find(stop => Math.abs(stop.amount - raw) < 1e-7);
  if (exact) return exact.amount;
  const minimum = Math.min(legal.minTo, legal.maxTo) - player.bet;
  if (legal.callAmount > 0 && raw <= legal.callAmount + 1e-7) return legal.callAmount;
  const step = amountStep(context, raw), minimumStep = amountStep(context, minimum);
  const [low, high] = bandBounds(context, raw);
  const firstRaise = Math.min(bandBounds(context, minimum)[1], Math.ceil(minimum / minimumStep) * minimumStep);
  const floor = preview && legal.callAmount > 0 ? legal.callAmount : firstRaise;
  return Math.min(player.chips, Math.max(floor, clamp(Math.round(raw / step) * step, low, high)));
}

export function selectionAtRatio(context, ratio, travel = 320) {
  const r = clamp(ratio, 0, 1), stops = sliderStops(context);
  const nearest = stops.reduce((found, stop) => Math.abs(stop.ratio - r) < Math.abs((found?.ratio ?? Infinity) - r) ? stop : found, null);
  const raw = rawAmount(context, r);
  // All legal limits and pot presets share the same physical snap radius.
  const snapped = r > 0 && r < 1 && nearest && Math.abs(nearest.ratio - r) <= BET_SNAP_PIXELS / Math.max(1, travel);
  // Show the actual scale during a hold; legal raise sizing is applied when staging.
  const amount = snapped ? nearest.amount : amountAtRatio(context, r, true);
  const { legal, player } = context, minimum = Math.min(legal.minTo, legal.maxTo) - player.bet;
  const cached = sizingFor(context);
  const value = snapped ? nearest.amount : raw;
  const hint = amount <= 0 ? '' : legal.callAmount > 0
    ? value <= legal.callAmount + 1e-7 ? cached.callHint
      : legal.canRaise && value <= minimum + 1e-7 ? cached.raiseHint : ''
    : raw < minimum ? '最低下注' : '';
  // Legal minimums and integer rounding constrain the wager, not the drag position.
  return { amount, ratio: snapped ? nearest.ratio : r, preset: snapped ? nearest.label : '', hint };
}
