import test from 'node:test';
import assert from 'node:assert/strict';
import { ChipSlider, chipSliderBounds } from '../client/chip-slider.js';
import { TableActions } from '../client/table-actions.js';
import { amountAtRatio, ratioForAmount, potStops, sliderStops, selectionAtRatio, stagedAction } from '../client/bet-sizing.js';

const context = (pot = 200, chips = 1000) => ({ pot, currentBet: 20, player: { id: 'me', seat: 0, bet: 0, chips }, legal: { toCall: 20, callAmount: 20, canRaise: true, minTo: 40, maxTo: chips, canAllIn: true } });

test('the pot is at the exact midpoint with linear lower/upper ranges and exact quarter/half/pot magnets', () => {
  const c = context();
  for (const [ratio, amount] of [[0, 0], [.125, 50], [.25, 100], [.375, 150], [.5, 200], [.75, 600], [1, 1000]]) {
    assert.equal(amountAtRatio(c, ratio), amount); assert.equal(ratioForAmount(c, amount), ratio);
  }
  for (const stop of potStops(c)) {
    for (const offset of [-.1, 0, .1]) {
      const selection = selectionAtRatio(c, stop.ratio + offset / 500, 500);
      assert.equal(selection.amount, stop.amount); assert.equal(selection.ratio, stop.ratio); assert.equal(selection.preset, stop.label);
    }
  }
  assert.notEqual(selectionAtRatio(c, .5 + 15 / 500, 500).amount, 200, 'leaving the magnetic zone resumes linear selection');
});

test('unsnapped sizing retains one-chip precision through the full pot', () => {
  const c = context(1000, 5000);
  for (const [raw, expected] of [[41, 41], [123, 123], [249, 249], [250, 250], [276, 276], [284, 284], [499, 499], [506, 506], [999, 999], [1000, 1000], [1016, 1020]]) {
    assert.equal(amountAtRatio(c, ratioForAmount(c, raw)), expected);
  }
  for (const pot of [40, 80, 200, 203, 1000]) {
    const small = context(pot, 5000); small.currentBet = 0;
    Object.assign(small.legal, { toCall: 0, callAmount: 0, minTo: 1, canCheck: true });
    for (const travel of [180, 500, 900]) {
      for (let amount = 1; amount <= pot; amount++) {
        assert.equal(amountAtRatio(small, ratioForAmount(small, amount)), amount, `pot=${pot}, travel=${travel}, chip=${amount}`);
      }
    }
  }
});

test('all pot presets attract within four CSS pixels and release outside that range at different track heights', () => {
  const c = context(1000, 5000); c.currentBet = 0;
  Object.assign(c.legal, { toCall: 0, callAmount: 0, minTo: 1, canCheck: true });
  for (const travel of [180, 500, 900]) {
    for (const stop of potStops(c)) {
      for (const offset of [-4.1, -3.9, 0, 3.9, 4.1]) {
        const ratio = stop.ratio + offset / travel, selected = selectionAtRatio(c, ratio, travel);
        if (Math.abs(offset) < 4) {
          assert.equal(selected.amount, stop.amount); assert.equal(selected.ratio, stop.ratio); assert.equal(selected.preset, stop.label);
        } else {
          assert.equal(selected.amount, amountAtRatio(c, ratio)); assert.equal(selected.ratio, ratio); assert.equal(selected.preset, '');
        }
      }
    }
  }
  const nearAllIn = context(999, 1000);
  assert.equal(selectionAtRatio(nearAllIn, 1, 500).amount, 1000, 'a nearby full-pot stop cannot replace ALL IN at the endpoint');
  assert.equal(selectionAtRatio(nearAllIn, 0, 500).amount, 0);
});

test('minimum bets, calls and closed raising rights never pin the thumb or masquerade as a pot magnet', () => {
  const call = context(40), check = context(40), closed = context(40);
  check.currentBet = 0;
  Object.assign(check.legal, { toCall: 0, callAmount: 0, minTo: 20, canCheck: true });
  Object.assign(closed.legal, { canRaise: false, canAllIn: false });
  for (const [c, hint] of [[call, '跟注至少 20'], [check, '最低下注'], [closed, '跟注至少 20']]) {
    const start = ratioForAmount(c, 20) / 2;
    for (const offset of [-.01, 0, .01]) {
      const ratio = start + offset, selection = selectionAtRatio(c, ratio, 500);
      assert.equal(selection.ratio, ratio, 'the thumb follows even when the legal amount is unchanged');
      assert.equal(selection.amount, 20); assert.ok(stagedAction(c, selection.amount));
      assert.equal(selection.preset, '', 'a legal floor equal to half pot is not a half-pot snap');
      assert.equal(selection.hint, hint);
    }
    const zero = selectionAtRatio(c, 0, 500);
    assert.equal(zero.amount, 0); assert.equal(zero.ratio, 0); assert.equal(zero.hint, '');
  }
});

test('a thirty-chip pot only locks to a ten-chip call in the bottom third of its zero-to-pot segment', () => {
  const c = context(30, 1945);
  c.player.bet = 10;
  Object.assign(c.legal, { toCall: 10, callAmount: 10, minTo: 40, maxTo: 1955 });
  assert.equal(ratioForAmount(c, 10), ratioForAmount(c, 30) / 3);
  for (const raw of [0, 5, 9, 10, 11, 16, 24, 28, 29, 30]) {
    const ratio = ratioForAmount(c, raw), selected = selectionAtRatio(c, ratio, 900);
    assert.equal(selected.amount, raw === 0 ? 0 : Math.max(10, raw), `drag scale at ${raw}`);
    assert.equal(selected.hint, raw > 0 && raw <= 10 ? '跟注至少 10' : raw > 10 && raw <= 30 ? '加注至少 30' : '', `limit hint at ${raw}`);
    assert.ok(Math.abs(selected.ratio - ratio) < 1e-12);
  }
  const sent = [], states = [], start = { x: 300, y: 700 };
  const actions = new TableActions({ sliderTravel: () => 900, change: state => states.push(state), send: (...args) => sent.push(args) });
  actions.sync({ code: 'TEST', turnId: 1, phase: 'playing', hand: { number: 1, actor: 0, players: [c.player], legal: c.legal, pot: c.pot, currentBet: c.currentBet } }, 'me');
  actions.begin({ chipRole: 'bank' }, start, 0);
  const target = { x: 0, y: start.y - (ratioForAmount(c, 28) - actions.gesture.initialRatio) * 900 };
  actions.move(target, 400);
  assert.equal(states.at(-1).selected, 28); assert.equal(states.at(-1).hint, '加注至少 30');
  assert.equal(actions.pending, 0); assert.deepEqual(sent, []);
  actions.release(target, 450);
  assert.equal(actions.pending, 30, 'releasing an incomplete raise stages the legal minimum for review');
  assert.deepEqual(sent, [], 'staging does not submit the corrected wager');
  actions.begin({ chipRole: 'staged' }, start, 500);
  actions.release({ x: start.x, y: start.y - 50 }, 600);
  assert.deepEqual(sent, [['raise', 40, 'TEST:1:1']], 'only the subsequent forward push submits a legal total');
});

test('call and minimum-raise nodes use the same four-pixel attraction as pot nodes, including shared positions', () => {
  const c = context(30, 1945);
  c.player.bet = 10;
  Object.assign(c.legal, { toCall: 10, callAmount: 10, minTo: 40, maxTo: 1955 });
  const limits = sliderStops(c).filter(stop => stop.kind === 'call' || stop.kind === 'raise');
  assert.deepEqual(limits.map(stop => stop.amount), [10, 30]);
  for (const travel of [180, 500, 900]) {
    for (const stop of limits) {
      for (const offset of [-4.1, -3.9, 0, 3.9, 4.1]) {
        const ratio = stop.ratio + offset / travel, selected = selectionAtRatio(c, ratio, travel);
        if (Math.abs(offset) < 4) {
          assert.equal(selected.amount, stop.amount); assert.equal(selected.ratio, stop.ratio);
          assert.equal(selected.hint, stop.label); assert.equal(selected.preset, stop.label);
        } else {
          assert.equal(selected.ratio, ratio); assert.equal(selected.preset, '');
        }
      }
    }
  }
  assert.equal(selectionAtRatio(c, 0, 500).amount, 0);
  assert.equal(selectionAtRatio(c, 1, 500).amount, 1945);
});

test('a held chip drag retains fine selection outside the four-pixel pot magnets in both directions', () => {
  const c = context(80, 2000), sent = [], states = [];
  c.currentBet = 0;
  Object.assign(c.legal, { toCall: 0, callAmount: 0, minTo: 1, canCheck: true });
  const actions = new TableActions({ sliderTravel: () => 500, change: state => states.push(state), send: (...args) => sent.push(args) });
  actions.sync({ code: 'TEST', turnId: 1, phase: 'playing', hand: { number: 1, actor: 0, players: [c.player], legal: c.legal, pot: c.pot, currentBet: 0 } }, 'me');
  const start = { x: 300, y: 700 };
  actions.begin({ chipRole: 'bank' }, start, 0); actions.tick(400);
  const amounts = Array.from({ length: 80 }, (_, i) => i + 1).filter(amount => ![19, 21, 39, 41, 79].includes(amount));
  for (const direction of [amounts, [...amounts].reverse()]) {
    for (const amount of direction) {
      actions.move({ x: -300, y: start.y - (ratioForAmount(c, amount) - actions.gesture.initialRatio) * 500 }, 500);
      assert.equal(states.at(-1).selected, amount, `drag to ${amount}`);
      assert.equal(actions.pending, 0);
    }
  }
  actions.release(actions.gesture.point, 600);
  assert.equal(actions.pending, 1); assert.deepEqual(sent, []);
});

test('the pot uses the midpoint only when at most half the available stack', () => {
  for (const pot of [200, 500]) assert.equal(ratioForAmount(context(pot), pot), .5);
  for (const pot of [501, 600, 800, 1000]) {
    const c = context(pot);
    assert.equal(ratioForAmount(c, pot), pot / 1000);
    assert.equal(amountAtRatio(c, .5), 500);
    assert.equal(amountAtRatio(c, 1), 1000);
  }
});

test('rounding never reverses an upward drag when an odd pot crosses the quarter, half or full thresholds', () => {
  for (const pot of [101, 203, 253, 501, 508, 510, 518, 524, 799]) {
    const c = context(pot, 2000); c.currentBet = 0;
    Object.assign(c.legal, { toCall: 0, callAmount: 0, canCheck: true, minTo: 1 });
    let previous = 0;
    for (let i = 0; i <= 5000; i++) {
      const selected = selectionAtRatio(c, i / 5000, 500).amount;
      assert.ok(selected >= previous, `pot=${pot}, ratio=${i / 5000}: ${previous} -> ${selected}`);
      previous = selected;
    }
  }
});

test('short stacks, odd pots and minimum raises keep presets reachable and released drafts legal', () => {
  const short = context(200, 90);
  assert.equal(ratioForAmount(short, 90), 1); assert.equal(amountAtRatio(short, 1), 90);
  assert.deepEqual(potStops(short).map(stop => stop.label), ['1/4池']);
  const smallPot = context(40);
  assert.deepEqual(potStops(smallPot).map(stop => stop.label), ['半池', '满池']);
  assert.equal(selectionAtRatio(context(501), .5).amount, 501);
  assert.equal(selectionAtRatio(context(501), .501).amount, 501);
  for (const c of [context(), short, smallPot, context(501), context(0), context(1000, 1000)]) {
    for (let i = 0; i <= 500; i++) {
      const preview = selectionAtRatio(c, i / 500, 450).amount;
      assert.ok(Number.isSafeInteger(preview) && preview >= 0 && preview <= c.player.chips);
      const amount = amountAtRatio(c, ratioForAmount(c, preview));
      assert.ok(amount === 0 || stagedAction(c, amount), `pot=${c.pot}, stack=${c.player.chips}, amount=${amount}`);
    }
  }
});

class Element extends EventTarget {
  constructor() { super(); this.style = {}; this.nodes = {}; this.attributes = {}; this.captures = new Set(); }
  setAttribute(key, value) { this.attributes[key] = value; }
  querySelector(key) { return this.nodes[key] ||= new Element(); }
  appendChild(child) { child.parentElement = this; }
  focus() {} setPointerCapture(id) { this.captures.add(id); }
  hasPointerCapture(id) { return this.captures.has(id); } releasePointerCapture(id) { this.captures.delete(id); }
}
test('the fixed UI track appears only during a chip-bank hold and hides on release or cancellation', t => {
  const previous = globalThis.document; globalThis.document = { createElement: () => new Element() };
  t.after(() => { globalThis.document = previous; });
  const rect = { top: 200, height: 844, width: 390 }, header = new Element(), host = new Element(), container = new Element();
  host.id = 'game'; host.nodes['.topbar'] = header; container.parentElement = host;
  let headerBottom = rect.top + 96;
  container.getBoundingClientRect = () => rect; header.getBoundingClientRect = () => ({ bottom: headerBottom });
  const sent = []; let slider;
  const actions = new TableActions({ change: state => slider.render(state, true), send: (...args) => sent.push(args), sliderTravel: () => slider.layout(false) });
  slider = new ChipSlider(container);
  slider.track.getBoundingClientRect = () => ({ bottom: rect.top + slider.bounds.bottom, height: slider.bounds.travel });
  const c = context();
  const room = { code: 'TEST', turnId: 1, phase: 'playing', hand: { number: 1, actor: 0, players: [c.player], legal: c.legal, pot: c.pot, currentBet: c.currentBet } };
  actions.sync(room, 'me'); assert.equal(slider.root.hidden, true);
  const start = { x: 250, y: 700 };
  assert.equal(actions.begin({ chipRole: 'slider', ratio: .5 }, start, 0), false, 'the UI cannot initiate an independent wager gesture');
  actions.begin({ chipRole: 'bank' }, start, 0);
  assert.equal(slider.root.hidden, false);
  assert.equal(slider.bounds.top, 106); assert.equal(slider.root.parentElement, host);
  const y = ratio => start.y - (ratio - actions.gesture.initialRatio) * slider.bounds.travel;
  actions.move({ x: -1000, y: y(.025) }, 380);
  assert.equal(slider.value.textContent, '20'); assert.equal(slider.preset.textContent, '跟注至少 20');
  assert.ok(Math.abs(parseFloat(slider.thumb.style.bottom) - 2.5) < 1e-8, 'legal clamping cannot move the thumb back to the minimum');
  assert.ok(slider.stops.every(stop => !stop.className?.includes('snapped')));
  actions.move({ x: -1000, y: y(.075) }, 390);
  assert.equal(slider.value.textContent, '30'); assert.equal(slider.preset.textContent, '加注至少 40');
  assert.equal(slider.stops[3].hidden, false); assert.equal(slider.stops[4].hidden, false);
  assert.equal(slider.stops[3].style.bottom, '5%'); assert.equal(slider.stops[4].style.bottom, '10%');
  actions.move({ x: -1000, y: y(.5) }, 400);
  assert.equal(slider.value.textContent, '200'); assert.equal(slider.preset.textContent, '满池'); assert.equal(actions.pending, 0);
  const middleLabel = parseFloat(slider.label.style.top);
  actions.move({ x: 5000, y: y(.75) }, 450);
  assert.equal(slider.value.textContent, '600'); assert.ok(parseFloat(slider.label.style.top) < middleLabel);
  actions.release({ x: 5000, y: y(.75) }, 500);
  assert.equal(actions.pending, 600); assert.equal(slider.thumb.style.bottom, '75%'); assert.equal(sent.length, 0);
  assert.equal(slider.root.hidden, true);
  actions.begin({ chipRole: 'bank' }, start, 600); actions.tick(1000);
  assert.equal(slider.root.hidden, false); actions.cancel();
  assert.equal(slider.root.hidden, true); assert.equal(actions.pending, 600);
  headerBottom += 40; slider.layout(); assert.equal(slider.bounds.top, 146, 'roster height determines the track start plus 10px');
  rect.height = 600; slider.layout(); assert.ok(slider.bounds.bottom <= rect.height - 70);
  assert.deepEqual(slider.bounds, chipSliderBounds(600, 136));
  room.hand.actor = 1; actions.sync(room, 'me'); assert.equal(slider.root.hidden, true);
  assert.equal(sent.length, 0);
});
