import test from 'node:test';
import assert from 'node:assert/strict';
import { TableActions, TABLE_GESTURES, amountAtRatio, ratioForAmount, stagedAction, tableTurnKey } from '../client/table-actions.js';

const point = { x: 200, y: 300 };
function room(options = {}) {
  const player = { id: 'me', seat: 0, bet: 0, chips: 1000, folded: false, ...options.player };
  return { code: '123456', phase: 'playing', turnId: 'turn-1', hand: { number: 1, actor: 0, done: false, currentBet: 20,
    players: [player], legal: { toCall: 20, callAmount: 20, canCheck: false, canRaise: true, minTo: 40, maxTo: player.bet + player.chips, canAllIn: true, ...options.legal } } };
}
function fixture(input = room()) {
  const sent = [], states = [], commits = [];
  const actions = new TableActions({ send: (type, amount, key) => { sent.push({ type, amount, key }); return true; },
    change: state => states.push(state), commit: action => commits.push(action) });
  actions.sync(input, 'me');
  const tap = (target, time = 0) => { actions.begin(target, point, time); actions.release(point, time + 50); };
  const push = (target = { chipRole: 'staged' }, time = 2000, to = { x: 200, y: 250 }) => {
    actions.begin(target, point, time); actions.move(to, time + 60); actions.release(to, time + 100);
  };
  const select = (amount, time = 500) => {
    actions.begin({ chipRole: 'bank' }, point, time); actions.tick(time + TABLE_GESTURES.hold);
    const ratio = ratioForAmount(actions.context, amount), initial = actions.gesture.initialRatio;
    const to = { x: point.x, y: point.y - (ratio - initial) * TABLE_GESTURES.sliderTravel };
    actions.move(to, time + 400); actions.release(to, time + 450);
  };
  return { actions, sent, states, commits, tap, push, select };
}

test('one chip-bank click stages a call; only pushing the staged chips commits it once', () => {
  const f = fixture(); f.tap({ chipRole: 'bank' });
  assert.equal(f.actions.pending, 20); assert.equal(f.states.at(-1).remaining, 980); assert.equal(f.sent.length, 0);
  f.push(); assert.deepEqual(f.sent, [{ type: 'call', amount: undefined, key: tableTurnKey(room()) }]);
  assert.equal(f.actions.inFlight, true); assert.equal(f.actions.pending, 0);
  f.push(); assert.equal(f.sent.length, 1);
  assert.deepEqual(f.commits, [{ type: 'call', amount: 20 }]);
});

test('a dealing phase cancels staged wagers and blocks every poker gesture until unlocked', () => {
  const input = room(), f = fixture(input);
  f.tap({ chipRole: 'bank' }); assert.equal(f.actions.pending, 20);
  input.dealing = true; f.actions.sync(input, 'me');
  assert.equal(f.actions.enabled, false); assert.equal(f.actions.pending, 0);
  for (const target of [{ chipRole: 'bank' }, { chipRole: 'staged' }, { cardRole: 'hand' }, { tableSurface: true }]) {
    assert.equal(f.actions.begin(target, point, 0), false);
  }
  assert.deepEqual(f.sent, []);
  input.dealing = false; input.turnId = 'turn-2'; f.actions.sync(input, 'me');
  assert.equal(f.actions.enabled, true); f.tap({ chipRole: 'bank' });
  assert.equal(f.actions.pending, 20);
});

test('a single staged-chip tap returns the entire draft without betting; sideways drags preserve it', () => {
  const f = fixture();
  for (const amount of [20, 600, 1000]) {
    if (amount === 20) f.tap({ chipRole: 'bank' }); else f.select(amount);
    assert.equal(f.actions.pending, amount);
    f.tap({ chipRole: 'staged' }, 1500);
    assert.equal(f.actions.pending, 0); assert.equal(f.states.at(-1).remaining, 1000);
    assert.equal(f.sent.length, 0); assert.equal(f.commits.length, 0);
  }
  f.tap({ chipRole: 'bank' }); f.push({ chipRole: 'staged' }, 2000, { x: 250, y: 300 });
  assert.equal(f.actions.pending, 20); assert.equal(f.sent.length, 0);
  f.push(); assert.equal(f.sent[0].type, 'call');
  f.tap({ chipRole: 'staged' }, 2400); assert.equal(f.sent.length, 1, 'a submitted wager cannot be withdrawn');
});

test('pressing the chip bank immediately shows the slider without motion or a timer tick', () => {
  const f = fixture();
  f.actions.begin({ chipRole: 'bank' }, point, 0);
  assert.equal(f.states.at(-1).selecting, true);
  assert.equal(f.states.at(-1).selected, 20);
  assert.equal(f.actions.pending, 0); assert.equal(f.sent.length, 0);
  f.actions.release(point, 80);
  assert.equal(f.states.at(-1).selecting, false); assert.equal(f.actions.pending, 20);
  f.actions.begin({ chipRole: 'bank' }, point, 200);
  f.actions.move({ x: 200, y: 200 }, 220); f.actions.release({ x: 200, y: 200 }, 250);
  assert.ok(f.actions.pending > 20, 'drag selection works immediately without waiting for long-press detection');
  assert.equal(f.sent.length, 0);
});

test('long hold selects a wager without submitting; reselection reserves or returns the exact difference', () => {
  const f = fixture(); f.tap({ chipRole: 'bank' });
  f.select(600); assert.equal(f.actions.pending, 600); assert.equal(f.states.at(-1).remaining, 400);
  f.select(100, 1100); assert.equal(f.actions.pending, 100); assert.equal(f.states.at(-1).remaining, 900);
  assert.equal(f.sent.length, 0);
  for (const state of f.states) assert.equal(state.pending + state.remaining, state.bankroll);
  f.push(); assert.equal(f.sent[0].type, 'raise'); assert.equal(f.sent[0].amount, 100);
});

test('a full slider selects ALL IN and a short stack can still stage a partial call', () => {
  const f = fixture(); f.select(1000); assert.equal(f.actions.pending, 1000); f.push(); assert.equal(f.sent[0].type, 'allin');
  const short = fixture(room({ player: { chips: 12 }, legal: { callAmount: 12, maxTo: 12, canRaise: false } }));
  short.tap({ chipRole: 'bank' }); assert.equal(short.actions.pending, 12); short.push(); assert.equal(short.sent[0].type, 'call');
  const shortRaise = fixture(room({ player: { chips: 30 }, legal: { maxTo: 30 } }));
  shortRaise.select(30); shortRaise.push(); assert.equal(shortRaise.sent[0].type, 'allin');
});

test('pending labels count new chips, while raise messages include the player existing street bet', () => {
  const f = fixture(room({ player: { bet: 10, chips: 990 }, legal: { toCall: 10, callAmount: 10 } }));
  f.select(50); assert.equal(f.actions.pending, 50); f.push(); assert.equal(f.sent[0].amount, 60);
  for (let ratio = 0; ratio <= 1; ratio += .01) {
    const amount = amountAtRatio(f.actions.context, ratio);
    assert.ok(amount === 0 || amount === 10 || amount >= 30);
    if (amount) assert.ok(stagedAction(f.actions.context, amount));
  }
});

test('the wager slider snaps by five through 50 and by ten above 50 without skipping the boundary', () => {
  const input = room({ legal: { toCall: 0, callAmount: 0, canCheck: true, minTo: 4 } }); input.hand.currentBet = 0;
  const { actions } = fixture(input), context = actions.context;
  for (const [raw, expected] of [[5, 5], [7.4, 5], [7.6, 10], [32, 30], [33, 35], [47, 45], [49, 50], [50, 50], [51, 50], [54.9, 50], [55.1, 60], [64, 60], [66, 70], [232, 230], [236, 240]]) {
    assert.equal(amountAtRatio(context, ratioForAmount(context, raw)), expected, `snap ${raw}`);
  }
  let previous = 0;
  for (let index = 1; index <= 1000; index++) {
    const amount = amountAtRatio(context, index / 1000);
    assert.equal(amount % (amount <= 50 ? 5 : 10), 0);
    assert.ok(amount >= previous); assert.ok(stagedAction(context, amount)); previous = amount;
  }
});

test('snapping preserves exact calls and odd all-ins while rounding raises up to legal minimums', () => {
  const input = room({ player: { chips: 1373 }, legal: { toCall: 23, callAmount: 23, minTo: 57, maxTo: 1373 } }); input.hand.currentBet = 23;
  const { actions } = fixture(input), context = actions.context;
  assert.equal(amountAtRatio(context, 0), 0); assert.equal(amountAtRatio(context, -1), 0);
  assert.equal(amountAtRatio(context, ratioForAmount(context, 23)), 23);
  assert.equal(amountAtRatio(context, ratioForAmount(context, 57)), 60); assert.equal(amountAtRatio(context, 1), 1373); assert.equal(ratioForAmount(context, 1373), 1);
  for (let index = 1; index <= 1000; index++) {
    const amount = amountAtRatio(context, index / 1000);
    assert.ok(amount === 23 || amount >= 60 && amount <= 1373); assert.ok(stagedAction(context, amount));
    if (amount !== 1373 && amount !== 23) assert.equal(amount % 10, 0);
  }
  const short = fixture(room({ player: { chips: 57 }, legal: { minTo: 58, maxTo: 57 } }));
  assert.equal(amountAtRatio(short.actions.context, .05), 20); assert.equal(ratioForAmount(short.actions.context, 57), 1);
});

test('the thumb follows the drag while chip rounding uses the displayed slider height without drift', () => {
  const f = fixture(); f.actions.sliderTravel = () => 240;
  f.actions.begin({ chipRole: 'bank' }, point, 0);
  const rawRatio = ratioForAmount(f.actions.context, 232), end = { x: point.x, y: point.y - (rawRatio - f.actions.gesture.initialRatio) * 240 };
  f.actions.move(end, 400);
  assert.equal(f.states.at(-1).selected, 230); assert.ok(Math.abs(f.states.at(-1).ratio - rawRatio) < 1e-12);
  f.actions.move(end, 450); assert.equal(f.states.at(-1).selected, 230); assert.equal(f.actions.pending, 0);
  f.actions.release(end, 500); assert.equal(f.actions.pending, 230); assert.equal(f.sent.length, 0);
});

test('a closed raise right prevents illegal selection and ALL IN raises', () => {
  const f = fixture(room({ legal: { canRaise: false, canAllIn: false } }));
  f.actions.begin({ chipRole: 'bank' }, point, 0); f.actions.tick(350);
  f.actions.move({ x: 200, y: 0 }, 400);
  assert.equal(f.states.at(-1).selected, 20); assert.equal(f.states.at(-1).maximum, 20);
  f.actions.release({ x: 200, y: 0 }, 450); f.push(); assert.equal(f.sent[0].type, 'call');
  assert.equal(stagedAction(f.actions.context, 1000), null);
});

test('a double table tap checks, while a single tap, drag, delayed taps or owed call never check', () => {
  const free = room({ legal: { toCall: 0, callAmount: 0, canCheck: true } }); free.hand.currentBet = 0;
  const f = fixture(free); f.tap({ tableSurface: true }, 0); assert.equal(f.sent.length, 0);
  f.tap({ tableSurface: true }, 150); assert.equal(f.sent[0].type, 'check');
  f.tap({ tableSurface: true }, 240); assert.equal(f.sent.length, 1);
  const delayed = fixture(free); delayed.tap({ tableSurface: true }, 0); delayed.tap({ tableSurface: true }, 500); assert.equal(delayed.sent.length, 0);
  const drag = fixture(free); drag.tap({ tableSurface: true }, 0); drag.push({ tableSurface: true }, 150); drag.tap({ tableSurface: true }, 280); assert.equal(drag.sent.length, 0);
  const owed = fixture(); owed.tap({ tableSurface: true }, 0); owed.tap({ tableSurface: true }, 150); assert.equal(owed.sent.length, 0);
});

test('holding or dragging cards sideways only looks; pushing the hand forward folds once', () => {
  const f = fixture(); f.tap({ cardRole: 'hand' }); assert.equal(f.sent.length, 0);
  f.push({ cardRole: 'hand' }, 500, { x: 280, y: 295 }); assert.equal(f.sent.length, 0);
  f.push({ cardRole: 'hand' }, 800, { x: 200, y: 330 }); assert.equal(f.sent.length, 0);
  f.push({ cardRole: 'hand' }, 1100); assert.equal(f.sent[0].type, 'fold');
  f.push({ cardRole: 'hand' }, 1300); assert.equal(f.sent.length, 1);
});

test('cancellation preserves staged funds and a new turn or disconnection discards stale gestures', () => {
  const f = fixture(); f.tap({ chipRole: 'bank' });
  f.actions.begin({ chipRole: 'bank' }, point, 500); f.actions.tick(850); f.actions.move({ x: 200, y: 120 }, 900); f.actions.cancel();
  assert.equal(f.actions.pending, 20); assert.equal(f.states.at(-1).selecting, false); assert.equal(f.sent.length, 0);
  f.actions.begin({ chipRole: 'staged' }, point, 1000); f.actions.move({ x: 200, y: 250 }, 1100);
  f.actions.sync({ ...room(), turnId: 'new-turn' }, 'me'); f.actions.release({ x: 200, y: 250 }, 1200);
  assert.equal(f.actions.pending, 0); assert.equal(f.sent.length, 0);
  f.tap({ chipRole: 'bank' }); f.actions.sync(room(), 'me', false);
  assert.equal(f.actions.enabled, false); assert.equal(f.actions.pending, 0); f.push(); assert.equal(f.sent.length, 0);
  f.actions.sync(null, 'me'); assert.equal(f.states.at(-1).bankroll, 0);
});

test('failed sends do not discard the wager, and server rejection restores a submitted draft', () => {
  const f = fixture(); f.tap({ chipRole: 'bank' });
  f.actions.send = () => false; f.push(); assert.equal(f.actions.pending, 20); assert.equal(f.actions.inFlight, false);
  f.actions.send = () => true; f.push(); assert.equal(f.actions.pending, 0); assert.equal(f.actions.inFlight, true);
  f.actions.reject(); assert.equal(f.actions.pending, 20); assert.equal(f.actions.inFlight, false);
});
