import test from 'node:test';
import assert from 'node:assert/strict';
import { ChipSlider, chipSliderBounds } from '../client/chip-slider.js';
import { TableActions } from '../client/table-actions.js';
import { amountAtRatio, ratioForAmount, potStops, sliderStops, minimumBet, selectionAtRatio, stagedAction } from '../client/bet-sizing.js';

const translatedY = element => Number(element.style.transform.match(/,\s*([-\d.]+)px/)[1]);
const context = (pot = 200, chips = 1000) => ({ pot, currentBet: 20, player: { id: 'me', seat: 0, bet: 0, chips }, legal: { toCall: 20, callAmount: 20, canRaise: true, minTo: 40, maxTo: chips, canAllIn: true } });

test('shortening the slider lowers only its top and preserves the bottom on tall phones and short windows', () => {
  for (const [height, header] of [[884, 140], [1500, 210], [600, 120], [300, 190]]) {
    const bounds = chipSliderBounds(height, header);
    const oldBottom = Math.max(80, Math.min(height - 70, height * .68));
    const oldTop = Math.max(10, Math.min(header + 10, Math.max(10, oldBottom - 60)));
    assert.equal(bounds.bottom, oldBottom);
    assert.ok(bounds.top >= oldTop);
    if (oldBottom - header - 10 >= 60) assert.ok(bounds.top >= header + 10);
    assert.ok(Math.abs(bounds.travel - Math.max(60, (oldBottom - oldTop) * .8)) < 1e-8);
  }
});

test('the lower range retains its linear pot scale and exact quarter/half/pot magnets', () => {
  const c = context();
  for (const [ratio, amount] of [[0, 20], [1 / 12, 50], [2 / 9, 100], [13 / 36, 150], [.5, 200], [1, 1000]]) {
    assert.equal(amountAtRatio(c, ratio), amount); assert.ok(Math.abs(ratioForAmount(c, amount) - ratio) < 1e-12);
  }
  for (const stop of potStops(c)) {
    for (const offset of [-.1, 0, .1]) {
      const selection = selectionAtRatio(c, stop.ratio + offset / 500, 500);
      assert.equal(selection.amount, stop.amount); assert.equal(selection.ratio, stop.ratio); assert.equal(selection.preset, stop.label);
    }
  }
  assert.notEqual(selectionAtRatio(c, .5 + 15 / 500, 500).amount, 200, 'leaving the magnetic zone resumes continuous selection');
});

test('the pot-to-all-in range retains geometric growth while rounding upper amounts to tens', () => {
  const geometric = context(40, 2560);
  for (let i = 0; i <= 6; i++) {
    const ratio = .5 + i / 12, amount = 40 * 2 ** i;
    assert.equal(amountAtRatio(geometric, ratio), amount);
    assert.ok(Math.abs(ratioForAmount(geometric, amount) - ratio) < 1e-12);
  }
  const phone = context(40, 1980);
  phone.currentBet = 0;
  Object.assign(phone.legal, { toCall: 0, callAmount: 0, minTo: 20, canCheck: true });
  assert.equal(selectionAtRatio(phone, .5, 700).amount, 40);
  assert.equal(selectionAtRatio(phone, .5 + 8.1 / 700, 700).amount, 40, 'leaving the pot magnet still does not jump straight to eighty');
  for (const [amount, expected] of [[43, 40], [44, 40], [46, 50], [51, 50], [79, 80], [80, 80], [81, 80], [321, 320], [1001, 1000], [1979, 1980], [1980, 1980]]) {
    assert.equal(amountAtRatio(phone, ratioForAmount(phone, amount)), expected);
  }
  const largePot = context(600, 1000);
  const anchor = (600 - 20) / (1000 - 20);
  assert.equal(ratioForAmount(largePot, 600), anchor);
  assert.equal(amountAtRatio(largePot, (anchor + 1) / 2), 770);
  assert.equal(amountAtRatio(largePot, 1), 1000);
});

test('one-chip precision ends at either the pot or one hundred, whichever is lower', () => {
  const c = context(1000, 5000);
  for (const [raw, expected] of [[41, 41], [99, 99], [100, 100], [101, 100], [106, 110], [123, 120], [249, 250], [250, 250], [276, 280], [284, 280], [499, 500], [506, 510], [999, 1000], [1000, 1000], [1016, 1020]]) {
    assert.equal(amountAtRatio(c, ratioForAmount(c, raw)), expected);
  }
  for (const pot of [40, 80, 200, 203, 1000]) {
    const small = context(pot, 5000); small.currentBet = 0;
    Object.assign(small.legal, { toCall: 0, callAmount: 0, minTo: 1, canCheck: true });
    for (const travel of [180, 500, 900]) {
      for (let amount = 1; amount <= Math.min(pot, 100); amount++) {
        assert.equal(amountAtRatio(small, ratioForAmount(small, amount)), amount, `pot=${pot}, travel=${travel}, chip=${amount}`);
      }
    }
  }
  for (const [pot, raw, expected] of [[40, 46, 50], [1000, 46, 46], [1000, 126, 130], [100, 106, 110]]) {
    const c = context(pot);
    assert.equal(amountAtRatio(c, ratioForAmount(c, raw)), expected);
  }
});

test('all pot presets attract within eight CSS pixels and release outside that range at different track heights', () => {
  const c = context(1000, 5000); c.currentBet = 0;
  Object.assign(c.legal, { toCall: 0, callAmount: 0, minTo: 1, canCheck: true });
  for (const travel of [180, 500, 900]) {
    for (const stop of potStops(c)) {
      for (const offset of [-8.1, -7.9, 0, 7.9, 8.1]) {
        const ratio = stop.ratio + offset / travel, selected = selectionAtRatio(c, ratio, travel);
        if (Math.abs(offset) < 8) {
          assert.equal(selected.amount, stop.amount); assert.equal(selected.ratio, stop.ratio); assert.equal(selected.preset, stop.label);
        } else {
          assert.equal(selected.amount, amountAtRatio(c, ratio)); assert.equal(selected.ratio, ratio); assert.equal(selected.preset, '');
        }
      }
    }
  }
  const nearAllIn = context(999, 1000);
  assert.equal(selectionAtRatio(nearAllIn, 1, 500).amount, 1000, 'a nearby full-pot stop cannot replace ALL IN at the endpoint');
  assert.equal(selectionAtRatio(nearAllIn, 0, 500).amount, 20);
});

test('the bottom is the exact minimum call or opening bet, including short all-ins and single-value ranges', () => {
  const call = context(40), check = context(40), closed = context(40);
  check.currentBet = 0;
  Object.assign(check.legal, { toCall: 0, callAmount: 0, minTo: 20, canCheck: true });
  Object.assign(closed.legal, { canRaise: false, canAllIn: false });
  for (const [c, hint] of [[call, '跟注至少 20'], [check, '最低下注'], [closed, '跟注至少 20']]) {
    const bottom = selectionAtRatio(c, 0, 500);
    assert.equal(minimumBet(c), 20); assert.equal(ratioForAmount(c, 20), 0);
    assert.equal(bottom.amount, 20); assert.equal(bottom.ratio, 0); assert.equal(bottom.hint, hint);
    assert.ok(stagedAction(c, bottom.amount));
  }
  const short = context(200, 12);
  Object.assign(short.legal, { callAmount: 12, canRaise: false });
  for (const ratio of [0, .25, .5, 1]) assert.equal(selectionAtRatio(short, ratio, 500).amount, 12);
  const sameAsPot = context(20, 1000);
  assert.equal(ratioForAmount(sameAsPot, 20), 0);
  assert.equal(amountAtRatio(sameAsPot, 0), 20); assert.equal(amountAtRatio(sameAsPot, 1), 1000);
});

test('a thirty-chip pot rescales its lower segment from the ten-chip minimum to thirty', () => {
  const c = context(30, 1945);
  c.player.bet = 10;
  Object.assign(c.legal, { toCall: 10, callAmount: 10, minTo: 40, maxTo: 1955 });
  assert.equal(ratioForAmount(c, 10), 0); assert.equal(ratioForAmount(c, 20), .25); assert.equal(ratioForAmount(c, 30), .5);
  for (const raw of [0, 5, 9, 10, 11, 16, 24, 28, 29, 30]) {
    const ratio = ratioForAmount(c, raw), selected = selectionAtRatio(c, ratio, 900);
    assert.equal(selected.amount, Math.max(10, raw), `drag scale at ${raw}`);
    assert.equal(selected.hint, raw <= 10 ? '跟注至少 10' : raw <= 30 ? '加注至少 30' : '', `limit hint at ${raw}`);
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

test('call and minimum-raise nodes use the same eight-pixel attraction as pot nodes, including shared positions', () => {
  const c = context(30, 1945);
  c.player.bet = 10;
  Object.assign(c.legal, { toCall: 10, callAmount: 10, minTo: 40, maxTo: 1955 });
  const limits = sliderStops(c).filter(stop => stop.kind === 'call' || stop.kind === 'raise');
  assert.deepEqual(limits.map(stop => stop.amount), [10, 30]);
  for (const travel of [180, 500, 900]) {
    for (const stop of limits) {
      for (const offset of [-8.1, -7.9, 0, 7.9, 8.1]) {
        const ratio = stop.ratio + offset / travel;
        if (ratio < 0 || ratio > 1) continue;
        const selected = selectionAtRatio(c, ratio, travel);
        if (Math.abs(offset) < 8) {
          assert.equal(selected.amount, stop.amount); assert.equal(selected.ratio, stop.ratio);
          assert.equal(selected.hint, stop.label); assert.equal(selected.preset, stop.label);
        } else {
          assert.equal(selected.ratio, ratio); assert.equal(selected.preset, '');
        }
      }
    }
  }
  assert.equal(selectionAtRatio(c, 0, 500).amount, 10);
  assert.equal(selectionAtRatio(c, 1, 500).amount, 1945);
});

test('cached sizing follows pot, legal-action and existing-bet changes without reusing stale nodes', () => {
  const c = context();
  const initial = sliderStops(c);
  assert.equal(sliderStops(c), initial, 'unchanged turns reuse their node definitions');
  c.pot = 400;
  const changed = sliderStops(c);
  assert.notEqual(changed, initial);
  assert.equal(changed.find(stop => stop.kind === 'full').amount, 400);
  c.legal.callAmount = c.legal.toCall = 30; c.legal.minTo = 70; c.currentBet = 30;
  assert.equal(sliderStops(c).find(stop => stop.kind === 'call').amount, 30);
  assert.equal(sliderStops(c).find(stop => stop.kind === 'raise').amount, 70);
  c.player.bet = 10;
  assert.equal(sliderStops(c).find(stop => stop.kind === 'raise').amount, 60);
  c.legal.canRaise = false;
  assert.ok(sliderStops(c).every(stop => stop.kind === 'call'));
});

test('a held chip drag retains fine selection outside the eight-pixel pot magnets in both directions', () => {
  const c = context(80, 2000), sent = [], states = [];
  c.currentBet = 0;
  Object.assign(c.legal, { toCall: 0, callAmount: 0, minTo: 1, canCheck: true });
  const actions = new TableActions({ sliderTravel: () => 500, change: state => states.push(state), send: (...args) => sent.push(args) });
  actions.sync({ code: 'TEST', turnId: 1, phase: 'playing', hand: { number: 1, actor: 0, players: [c.player], legal: c.legal, pot: c.pot, currentBet: 0 } }, 'me');
  const start = { x: 300, y: 700 };
  actions.begin({ chipRole: 'bank' }, start, 0); actions.tick(400);
  const amounts = Array.from({ length: 80 }, (_, i) => i + 1).filter(amount => ![18, 19, 21, 22, 38, 39, 41, 42, 78, 79].includes(amount));
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
    assert.equal(ratioForAmount(c, pot), (pot - 20) / (1000 - 20));
    assert.equal(amountAtRatio(c, .5), 510);
    assert.equal(amountAtRatio(c, 1), 1000);
  }
});

test('rounding never reverses an upward drag when an odd pot crosses the quarter, half or full thresholds', () => {
  for (const pot of [101, 203, 253, 501, 508, 510, 518, 524, 799]) {
    const c = context(pot, 2000); c.currentBet = 0;
    Object.assign(c.legal, { toCall: 0, callAmount: 0, canCheck: true, minTo: 1 });
    for (const travel of [180, 500, 900]) {
      let previous = 0;
      for (let i = 0; i <= 5000; i++) {
        const selected = selectionAtRatio(c, i / 5000, travel).amount;
        assert.ok(selected >= previous, `pot=${pot}, travel=${travel}, ratio=${i / 5000}: ${previous} -> ${selected}`);
        previous = selected;
      }
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
      assert.ok(Number.isSafeInteger(preview) && preview >= minimumBet(c) && preview <= c.player.chips);
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

test('repeated drag updates follow immediately without remeasuring geometry or rewriting unchanged numbers', t => {
  const previous = globalThis.document; globalThis.document = { createElement: () => new Element() };
  t.after(() => { globalThis.document = previous; });
  let measurements = 0, numberWrites = 0, maximumWrites = 0;
  const container = new Element();
  container.querySelector = () => null;
  container.getBoundingClientRect = () => { measurements++; return { top: 0, height: 844, width: 390 }; };
  const slider = new ChipSlider(container);
  for (const [node, count] of [[slider.value, () => numberWrites++], [slider.maximum, () => maximumWrites++]]) {
    let text = '';
    Object.defineProperty(node, 'textContent', { get: () => text, set: value => { text = value; count(); } });
  }
  const state = { enabled: true, selecting: true, pending: 0, selected: 20, bankroll: 1000, maximum: 1000,
    hint: '跟注至少 20', ratio: .01, stops: sliderStops(context()) };
  slider.render(state, true);
  for (let i = 1; i <= 100; i++) slider.render({ ...state, ratio: .01 + i * .0001 }, true);
  assert.equal(measurements, 1); assert.equal(numberWrites, 1); assert.equal(maximumWrites, 1);
  assert.ok(Math.abs(translatedY(slider.thumb) + .02 * slider.bounds.travel) < 1e-8);
  assert.equal(slider.thumb.style.bottom, undefined, 'dragging changes a transform rather than the layout position');
  assert.equal(slider.fill.style.height, undefined, 'dragging scales the fill rather than resizing its layout');
});
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
  assert.ok(Math.abs(slider.bounds.top - (106 + (844 * .68 - 106) * .2)) < 1e-8);
  assert.equal(slider.bounds.bottom, 844 * .68); assert.equal(slider.root.parentElement, host);
  const y = ratio => start.y - (ratio - actions.gesture.initialRatio) * slider.bounds.travel;
  actions.move({ x: -1000, y: y(0) }, 380);
  assert.equal(slider.value.textContent, '20'); assert.equal(slider.preset.textContent, '跟注至少 20');
  assert.equal(translatedY(slider.thumb), 0); assert.equal(slider.root.attributes['aria-valuemin'], '20');
  assert.ok(slider.stops[3].className.includes('snapped'));
  actions.move({ x: -1000, y: y(ratioForAmount(c, 30)) }, 390);
  assert.equal(slider.value.textContent, '30'); assert.equal(slider.preset.textContent, '加注至少 40');
  assert.equal(slider.stops[3].hidden, false); assert.equal(slider.stops[4].hidden, false);
  assert.equal(slider.stops[3].style.bottom, '0%');
  assert.ok(Math.abs(parseFloat(slider.stops[4].style.bottom) - ratioForAmount(c, 40) * 100) < 1e-8);
  actions.move({ x: -1000, y: y(.5) }, 400);
  assert.equal(slider.value.textContent, '200'); assert.equal(slider.preset.textContent, '满池'); assert.equal(actions.pending, 0);
  const middleLabel = translatedY(slider.label);
  actions.move({ x: 5000, y: y(.75) }, 450);
  assert.equal(slider.value.textContent, '450'); assert.ok(translatedY(slider.label) < middleLabel);
  actions.release({ x: 5000, y: y(.75) }, 500);
  assert.equal(actions.pending, 450); assert.ok(Math.abs(translatedY(slider.thumb) + slider.bounds.travel * .75) < 1e-8); assert.equal(sent.length, 0);
  assert.equal(slider.root.hidden, true);
  actions.begin({ chipRole: 'bank' }, start, 600); actions.tick(1000);
  assert.equal(slider.root.hidden, false); actions.cancel();
  assert.equal(slider.root.hidden, true); assert.equal(actions.pending, 450);
  headerBottom += 40; slider.layout();
  assert.ok(Math.abs(slider.bounds.top - (146 + (844 * .68 - 146) * .2)) < 1e-8, 'the shortened top continues to adapt below the roster');
  rect.height = 600; slider.layout(); assert.ok(slider.bounds.bottom <= rect.height - 70);
  assert.deepEqual(slider.bounds, chipSliderBounds(600, 136));
  room.hand.actor = 1; actions.sync(room, 'me'); assert.equal(slider.root.hidden, true);
  assert.equal(sent.length, 0);
});
