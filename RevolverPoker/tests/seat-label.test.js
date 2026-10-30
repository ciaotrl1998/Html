import test from 'node:test';
import assert from 'node:assert/strict';
import { PokerHand } from '../shared/poker.js';
import { SeatActionLabels, paintSeatNameplate } from '../client/seat-label.js';

const make = number => new PokerHand({ players: Array.from({ length: 3 }, (_, seat) => ({ id: `p${seat}`, name: `P${seat}`, seat, chips: 200 })), button: 0, smallBlind: 5, bigBlind: 10, number, deck: Array.from({ length: 52 }, (_, i) => i) });
const room = hand => ({ code: '123456', hand: hand.snapshot('p0') });

test('actions and blind statuses stay visible through a hand and only change when that player acts', () => {
  const hand = make(1), labels = new SeatActionLabels(); labels.update(room(hand));
  assert.deepEqual(['p0', 'p1', 'p2'].map(id => labels.get(id)), ['等待行动', '小盲', '大盲']);
  hand.act('p0', 'call'); labels.update(room(hand));
  assert.equal(labels.get('p0'), '跟注 10'); assert.equal(labels.get('p1'), '小盲'); assert.equal(labels.get('p2'), '大盲');
  hand.act('p1', 'call'); hand.act('p2', 'check'); assert.equal(hand.street, 'flop');
  assert.deepEqual(hand.players.map(player => player.action), ['跟注 10', '跟注 5', '过牌'], 'server snapshots must retain actions after street resets');
  labels.update(room(hand)); assert.deepEqual(['p0', 'p1', 'p2'].map(id => labels.get(id)), ['跟注 10', '跟注 5', '过牌']);
  hand.act('p1', 'raise', 30); labels.update(room(hand));
  assert.equal(labels.get('p1'), '加注至 30'); assert.equal(labels.get('p0'), '跟注 10');
  labels.update(room(make(2))); assert.deepEqual(['p0', 'p1', 'p2'].map(id => labels.get(id)), ['等待行动', '小盲', '大盲']);
});

test('legacy running servers, reconnects, folds and all-ins retain the correct public status', () => {
  const hand = make(1); hand.act('p0', 'call'); hand.act('p1', 'call'); hand.act('p2', 'check');
  const state = room(hand); state.hand.players.forEach(player => { player.action = ''; });
  const labels = new SeatActionLabels(); labels.update(state);
  assert.deepEqual(['p0', 'p1', 'p2'].map(id => labels.get(id)), ['跟注 10', '跟注 5', '过牌']);
  state.hand.history = []; labels.update(state); assert.equal(labels.get('p0'), '跟注 10');
  state.hand.players[0].folded = true; state.hand.players[1].chips = 0; state.hand.players[1].action = '小盲'; labels.update(state);
  assert.equal(labels.get('p0'), '弃牌'); assert.equal(labels.get('p1'), '全下');
  labels.update(null); assert.equal(labels.get('p0'), undefined);
  labels.update({ ...state, code: 'OTHER' }); assert.equal(labels.get('p2'), '大盲', 'a different room cannot reuse its old action cache');
});

function drawing() {
  const calls = [], size = font => Number(font.match(/(\d+)px/)[1]);
  const ctx = new Proxy({ font: '12px sans-serif',
    measureText(text) { return { width: [...text].reduce((sum, char) => sum + (char.codePointAt(0) > 255 ? 1 : .56), 0) * size(this.font) }; },
    fillText(text, x, y, maxWidth) { calls.push({ text, x, y, size: size(this.font), align: this.textAlign, width: Math.min(this.measureText(text).width, maxWidth ?? Infinity) }); }
  }, { get: (target, key) => key in target ? target[key] : () => {} });
  return { ctx, calls };
}

test('nameplates use an inline small seat prefix, AI suffix, large centered action and small chips below', () => {
  for (const name of ['沃尔特', '这是一个长度达到二十个字的玩家自定义名称']) {
    const { ctx, calls } = drawing();
    paintSeatNameplate(ctx, { seat: 6, name, bot: true, action: '加注至 1000000', value: '2,655', badges: 'BB' });
    assert.deepEqual(calls.map(call => call.text), ['SEAT07', `${name}（AI）`, '加注至 1000000', '2,655']);
    const [seat, title, action, chips] = calls;
    assert.ok(seat.size < title.size); assert.equal(seat.y, title.y); assert.ok(seat.x < title.x);
    assert.ok(action.size > title.size && action.size > chips.size); assert.equal(action.align, 'center'); assert.equal(action.x, 256);
    assert.ok(title.y < action.y && action.y < chips.y); assert.equal(chips.align, 'center'); assert.equal(chips.x, 256);
    for (const call of calls) {
      const left = call.x - (call.align === 'center' ? call.width / 2 : 0);
      assert.ok(left >= 26 && left + call.width <= 486, `${call.text} overflows the nameplate`);
    }
  }
  const human = drawing(); paintSeatNameplate(human.ctx, { seat: 0, name: '玩家', value: '100', action: '大盲' });
  assert.equal(human.calls[1].text, '玩家'); assert.equal(human.calls[2].size, 74);
});
