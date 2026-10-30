import test from 'node:test';
import assert from 'node:assert/strict';
import { bindHoldToView } from '../client/hold-to-view.js';

class Button extends EventTarget {
  disabled = false;
  captured = new Set();
  attrs = new Map();
  setAttribute(k, v) { this.attrs.set(k, v); }
  setPointerCapture(id) { this.captured.add(id); }
  hasPointerCapture(id) { return this.captured.has(id); }
  releasePointerCapture(id) { this.captured.delete(id); this.emit('lostpointercapture', { pointerId: id }); }
  emit(type, fields = {}) { const e = new Event(type, { cancelable: true }); Object.assign(e, fields); this.dispatchEvent(e); }
}
const down = (b, id = 1) => b.emit('pointerdown', { isPrimary: true, button: 0, pointerId: id });
function setup(accepted = true) {
  const b = new Button(), events = [];
  const cancel = bindHoldToView(b, () => { events.push('open'); return accepted; }, () => events.push('cover'));
  return { b, events, cancel };
}
test('hold shows cards once and release outside the button covers exactly once', () => {
  const { b, events } = setup(); down(b); down(b, 2);
  assert.deepEqual(events, ['open']); assert.equal(b.hasPointerCapture(1), true);
  b.emit('pointerup', { pointerId: 2 }); assert.deepEqual(events, ['open']);
  b.emit('pointerup', { pointerId: 1 }); assert.deepEqual(events, ['open', 'cover']);
  assert.equal(b.hasPointerCapture(1), false);
});
test('cancellation, lost capture, blur and explicit cleanup always cover the cards', () => {
  for (const event of ['pointercancel', 'lostpointercapture', 'blur', 'cleanup']) {
    const { b, events, cancel } = setup(); down(b);
    if (event === 'cleanup') cancel(); else b.emit(event, { pointerId: 1 });
    cancel(); assert.deepEqual(events, ['open', 'cover'], event);
  }
});
test('Space and Enter hold without auto-repeat reopening or a click leaving cards open', () => {
  for (const key of [' ', 'Enter']) {
    const { b, events } = setup();
    b.emit('keydown', { key, repeat: false }); b.emit('keydown', { key, repeat: true });
    b.emit('click'); assert.deepEqual(events, ['open']);
    b.emit('keyup', { key }); b.emit('click'); assert.deepEqual(events, ['open', 'cover']);
  }
});
test('disabled or invalid holds cannot open cards, and a normal click never toggles a peek', () => {
  const { b, events } = setup(); b.disabled = true; down(b); b.emit('click'); assert.deepEqual(events, []);
  const rejected = setup(false); down(rejected.b); rejected.b.emit('pointerup', { pointerId: 1 });
  assert.deepEqual(rejected.events, ['open']); assert.equal(rejected.b.hasPointerCapture(1), false);
});
