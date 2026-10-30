const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
export const maximumBet = context => context.legal.canRaise ? context.player.chips : context.legal.callAmount;
const hasPotMidpoint = (pot, maximum) => pot > 0 && pot <= maximum / 2;
const amountStep = (context, amount) => context.pot > 0
  ? amount <= Math.round(context.pot / 4) ? 1 : amount <= Math.round(context.pot / 2) ? 5 : 10
  : amount <= 50 ? 5 : 10;
const bandBounds = (context, amount) => {
  if (!(context.pot > 0)) return [0, maximumBet(context)];
  const quarter = Math.round(context.pot / 4), half = Math.round(context.pot / 2);
  return amount <= quarter ? [0, quarter] : amount <= half ? [quarter, half] : [half, maximumBet(context)];
};
const rawAmount = (context, ratio) => {
  const maximum = maximumBet(context), pot = context.pot || 0;
  return hasPotMidpoint(pot, maximum) ? ratio <= .5 ? pot * ratio * 2 : pot + (maximum - pot) * (ratio - .5) * 2 : maximum * ratio;
};

export function ratioForAmount(context, amount) {
  if (!context) return 0;
  const maximum = maximumBet(context), pot = context.pot || 0;
  const value = clamp(amount, 0, maximum);
  if (!maximum) return 0;
  if (hasPotMidpoint(pot, maximum)) return value <= pot ? value / pot * .5 : .5 + (value - pot) / (maximum - pot) * .5;
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
  if (!context || !(context.pot > 0)) return [];
  return [[.25, '1/4池'], [.5, '半池'], [1, '满池']].map(([fraction, label]) => {
    const amount = Math.round(context.pot * fraction);
    return { label, amount, ratio: ratioForAmount(context, amount) };
  }).filter(stop => stop.amount <= maximumBet(context) && stagedAction(context, stop.amount));
}

export function amountAtRatio(context, ratio) {
  const { legal, player } = context, r = clamp(ratio, 0, 1), maximum = maximumBet(context);
  if (r <= 0 || maximum <= 0) return 0;
  if (!legal.canRaise) return legal.callAmount;
  if (r >= 1) return player.chips;
  const raw = rawAmount(context, r);
  const exact = potStops(context).find(stop => Math.abs(stop.amount - raw) < 1e-7);
  if (exact) return exact.amount;
  const minimum = Math.min(legal.minTo, legal.maxTo) - player.bet;
  if (legal.callAmount > 0 && raw < minimum) return legal.callAmount;
  const step = amountStep(context, raw), minimumStep = amountStep(context, minimum);
  const [low, high] = bandBounds(context, raw);
  const firstRaise = Math.min(bandBounds(context, minimum)[1], Math.ceil(minimum / minimumStep) * minimumStep);
  return Math.min(player.chips, Math.max(firstRaise, clamp(Math.round(raw / step) * step, low, high)));
}

export function selectionAtRatio(context, ratio, travel = 320) {
  const r = clamp(ratio, 0, 1), stops = potStops(context);
  const nearest = stops.reduce((found, stop) => Math.abs(stop.ratio - r) < Math.abs((found?.ratio ?? Infinity) - r) ? stop : found, null);
  const raw = rawAmount(context, r);
  // Magnets must not swallow independently selectable small-chip amounts.
  const snapped = nearest && Math.abs(nearest.ratio - r) <= Math.min(.025, 4 / Math.max(1, travel)) &&
    Math.abs(nearest.amount - raw) <= amountStep(context, raw) * .49;
  const amount = snapped ? nearest.amount : amountAtRatio(context, r);
  return { amount, ratio: ratioForAmount(context, amount), preset: stops.find(stop => stop.amount === amount)?.label || '' };
}
