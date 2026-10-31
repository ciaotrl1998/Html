import test from 'node:test';
import assert from 'node:assert/strict';
import { ChipSlider, chipSliderBounds } from '../client/chip-slider.js';
import { TableActions } from '../client/table-actions.js';
import { amountAtRatio, ratioForAmount, potStops, selectionAtRatio, stagedAction } from '../client/bet-sizing.js';

const context = (pot = 200, chips = 1000) => ({ pot, currentBet: 20, player: { id: 'me', seat: 0, bet: 0, chips }, legal: { toCall: 20, callAmount: 20, canRaise: true, minTo: 40, maxTo: chips, canAllIn: true } });

test('the pot is at the exact midpoint with linear lower/upper ranges and exact quarter/half/pot magnets', () => {
  const c = context();
  for (const [ratio, amount] of [[0, 0], [.125, 50], [.25, 100], [.375, 150], [.5, 200], [.75, 600], [1, 1000]]) {
    assert.equal(amountAtRatio(c, ratio), amount); assert.equal(ratioForAmount(c, amount), ratio);
  }
  for (const stop of potStops(c)) {
    for (const offset of [-.2, 0, .2]) {
      const selection = selectionAtRatio(c, stop.ratio + offset / 500, 500);
      assert.equal(selection.amount, stop.amount); assert.equal(selection.ratio, stop.ratio); assert.equal(selection.preset, stop.label);
    }
  }
  assert.notEqual(selectionAtRatio(c, .5 + 15 / 500, 500).amount, 200, 'leaving the magnetic zone resumes linear selection');
});

test('every legal chip remains selectable through the full pot, including next to each preset', () => {
  const c = context(1000, 5000);
  for (const [raw, expected] of [[41, 41], [123, 123], [249, 249], [250, 250], [276, 276], [284, 284], [499, 499], [506, 506], [999, 999], [1000, 1000], [1016, 1020]]) {
    assert.equal(amountAtRatio(c, ratioForAmount(c, raw)), expected);
  }
  for (const pot of [40, 80, 200, 203, 1000]) {
    const small = context(pot, 5000); small.currentBet = 0;
    Object.assign(small.legal, { toCall: 0, callAmount: 0, minTo: 1, canCheck: true });
    for (const travel of [180, 500, 900]) {
      for (let amount = 1; amount <= pot; amount++) {
        assert.equal(selectionAtRatio(small, ratioForAmount(small, amount), travel).amount, amount, `pot=${pot}, travel=${travel}, chip=${amount}`);
      }
    }
  }
});

test('presets release when dragging away without swallowing neighbouring chip amounts', () => {
  const c = context(100); c.currentBet = 0;
  Object.assign(c.legal, { toCall: 0, callAmount: 0, minTo: 1, canCheck: true });
  for (const travel of [180, 500, 900]) {
    for (const stop of potStops(c)) {
      for (const direction of [-1, 1]) {
        const close = selectionAtRatio(c, stop.ratio + direction * .2 / travel, travel);
        assert.equal(close.amount, stop.amount);
        const amount = stop.amount + direction * 2;
        const away = selectionAtRatio(c, ratioForAmount(c, amount), travel);
        if (amount <= c.pot) assert.equal(away.amount, amount);
      }
    }
  }
  // The former ten-chip magnet pulled this raise back to the odd full-pot amount.
  const odd = context(203, 2000);
  assert.equal(selectionAtRatio(odd, ratioForAmount(odd, 206), 180).amount, 210);
});

test('a held chip drag can choose every chip between quarter, half and full pot in both directions', () => {
  const c = context(80, 2000), sent = [], states = [];
  c.currentBet = 0;
  Object.assign(c.legal, { toCall: 0, callAmount: 0, minTo: 1, canCheck: true });
  const actions = new TableActions({ sliderTravel: () => 500, change: state => states.push(state), send: (...args) => sent.push(args) });
  actions.sync({ code: 'TEST', turnId: 1, phase: 'playing', hand: { number: 1, actor: 0, players: [c.player], legal: c.legal, pot: c.pot, currentBet: 0 } }, 'me');
  const start = { x: 300, y: 700 };
  actions.begin({ chipRole: 'bank' }, start, 0); actions.tick(400);
  for (const amounts of [Array.from({ length: 80 }, (_, i) => i + 1), Array.from({ length: 79 }, (_, i) => 79 - i)]) {
    for (const amount of amounts) {
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

test('short stacks, odd pots and minimum raises never produce unreachable presets or illegal draft amounts', () => {
  const short = context(200, 90);
  assert.equal(ratioForAmount(short, 90), 1); assert.equal(amountAtRatio(short, 1), 90);
  assert.deepEqual(potStops(short).map(stop => stop.label), ['1/4池']);
  const smallPot = context(40);
  assert.deepEqual(potStops(smallPot).map(stop => stop.label), ['半池', '满池']);
  assert.equal(selectionAtRatio(context(501), .5).amount, 500);
  assert.equal(selectionAtRatio(context(501), .501).amount, 501);
  for (const c of [context(), short, smallPot, context(501), context(0), context(1000, 1000)]) {
    for (let i = 0; i <= 500; i++) {
      const amount = selectionAtRatio(c, i / 500, 450).amount;
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
