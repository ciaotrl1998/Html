import test from 'node:test';
import assert from 'node:assert/strict';
import { SceneViewControls, OVERVIEW_LIMITS, TURN_FOLLOW, overviewResponse } from '../client/view-controls.js';
import { TableActions } from '../client/table-actions.js';

class Surface extends EventTarget {
  constructor() { super(); this.captures = new Set(); this.rect = { left: 10, top: 20, width: 400, height: 800 }; }
  getBoundingClientRect() { return this.rect; }
  focus() {}
  setPointerCapture(id) { this.captures.add(id); }
  hasPointerCapture(id) { return this.captures.has(id); }
  releasePointerCapture(id) { this.captures.delete(id); }
}
const event = (target, type, data = {}) => {
  const e = new Event(type, { cancelable: true });
  Object.assign(e, { isPrimary: true, button: 0, pointerId: 1, pointerType: 'mouse', clientX: 210, clientY: 420, ...data });
  target.dispatchEvent(e);
};
function fixture(firstPerson = false) {
  const canvas = new Surface(), doc = new EventTarget(), win = new EventTarget();
  Object.assign(doc, { hidden: false, modal: false, querySelector: () => doc.modal ? {} : null });
  let picks = 0, looks = 0, releases = 0, lockRequests = 0;
  let now = 0;
  const scene = { firstPerson, yaw: 0, pitch: -.4, overviewPitch: -.6, peekActive: false, target: null,
    lookTarget: null, getTurnLookTarget() { return scene.lookTarget; },
    applyView() { looks++; }, resetView() { controls.reset(); },
    hitTarget() { return scene.target; }, pickSeat() { picks++; },
    beginCardPeek() { scene.peekActive = true; return true; }, endCardPeek() { scene.peekActive = false; releases++; } };
  canvas.requestPointerLock = () => { lockRequests++; doc.pointerLockElement = canvas; event(doc, 'pointerlockchange'); return Promise.resolve(); };
  doc.exitPointerLock = () => { doc.pointerLockElement = null; event(doc, 'pointerlockchange'); };
  const controls = new SceneViewControls(scene, canvas, doc, win, () => now);
  return { canvas, doc, win, scene, controls, advance(milliseconds) { now += milliseconds; },
    get picks() { return picks; }, get looks() { return looks; }, get releases() { return releases; }, get lockRequests() { return lockRequests; } };
}

test('desktop view turns only while holding and dragging; release and hover leave it unchanged', () => {
  const f = fixture(true);
  event(f.canvas, 'pointermove', { clientX: 250, clientY: 440, buttons: 0 });
  assert.equal(f.looks, 0);
  event(f.canvas, 'pointerdown');
  event(f.canvas, 'pointermove', { clientX: 250, clientY: 440, buttons: 1 });
  assert.ok(f.scene.yaw < 0); assert.ok(f.scene.pitch < -.4); assert.equal(f.picks, 0);
  event(f.canvas, 'pointerup', { clientX: 250, clientY: 440 });
  const yaw = f.scene.yaw;
  event(f.canvas, 'pointerleave');
  event(f.canvas, 'pointermove', { clientX: 20 }); assert.equal(f.scene.yaw, yaw);
  event(f.canvas, 'pointerdown', { clientX: 20 });
  event(f.canvas, 'pointermove', { clientX: 50, buttons: 1 }); assert.ok(f.scene.yaw < yaw);
  event(f.canvas, 'pointermove', { clientY: -10000, buttons: 1 }); assert.equal(f.scene.pitch, 1.35);
  const heldYaw = f.scene.yaw;
  event(f.canvas, 'pointermove', { clientX: 100, buttons: 0 }); assert.equal(f.scene.yaw, heldYaw);
  assert.equal(f.controls.drag, null); assert.equal(f.canvas.captures.size, 0);
});

test('touch turns the view only while dragging and a drag cannot select a seat', () => {
  const f = fixture(true); f.scene.target = { seat: 2 };
  event(f.canvas, 'pointermove', { pointerType: 'touch', clientX: 300 }); assert.equal(f.looks, 0);
  event(f.canvas, 'pointerdown', { pointerType: 'touch' });
  event(f.canvas, 'pointermove', { pointerType: 'touch', clientX: 270 });
  assert.ok(f.scene.yaw < 0);
  event(f.canvas, 'pointerup', { pointerType: 'touch', clientX: 270 });
  assert.equal(f.picks, 0); assert.equal(f.lockRequests, 0); assert.equal(f.canvas.captures.size, 0);
  event(f.canvas, 'pointerdown', { pointerType: 'touch' }); event(f.canvas, 'pointerup', { pointerType: 'touch' });
  assert.equal(f.picks, 1);
});

test('overview responds only to dragging, has soft edges, and returns to center on leave', () => {
  const f = fixture();
  event(f.canvas, 'pointermove', { clientX: 410, clientY: 820 });
  assert.deepEqual(f.controls.input, { x: 0, y: 0 });
  event(f.canvas, 'pointerdown');
  event(f.canvas, 'pointermove', { clientX: 510, clientY: 820, buttons: 1 });
  event(f.canvas, 'pointerup', { clientX: 510, clientY: 820 });
  assert.equal(f.looks, 0, 'pointer input does not snap the camera');
  f.controls.tick(1 / 40); assert.ok(f.scene.yaw < 0); assert.ok(Math.abs(f.scene.yaw) < OVERVIEW_LIMITS.yaw);
  for (let i = 0; i < 100; i++) f.controls.tick(1 / 40);
  assert.ok(Math.abs(f.scene.yaw) <= OVERVIEW_LIMITS.yaw);
  assert.ok(Math.abs(f.scene.pitch - f.scene.overviewPitch) <= OVERVIEW_LIMITS.pitch);
  assert.ok(overviewResponse(.2) - overviewResponse(0) > overviewResponse(1) - overviewResponse(.8), 'response becomes gentler near the limit');
  const edgeYaw = Math.abs(f.scene.yaw); event(f.canvas, 'pointerleave'); f.controls.tick(1 / 40);
  assert.ok(Math.abs(f.scene.yaw) < edgeYaw);
  for (let i = 0; i < 100; i++) f.controls.tick(1 / 40);
  assert.ok(Math.abs(f.scene.yaw) < .00001);
});

test('touch and keyboard cannot rotate the overview outside its limits', () => {
  const f = fixture();
  event(f.canvas, 'pointerdown', { pointerType: 'touch' });
  event(f.canvas, 'pointermove', { pointerType: 'touch', clientX: -10000, clientY: 10000 });
  event(f.canvas, 'pointerup', { pointerType: 'touch', clientX: -10000, clientY: 10000 });
  for (let i = 0; i < 100; i++) { event(f.canvas, 'keydown', { key: 'ArrowRight' }); event(f.canvas, 'keydown', { key: 'ArrowUp' }); f.controls.tick(.025); }
  assert.ok(Math.abs(f.scene.yaw) <= OVERVIEW_LIMITS.yaw);
  assert.ok(Math.abs(f.scene.pitch - f.scene.overviewPitch) <= OVERVIEW_LIMITS.pitch + 1e-10);
  assert.equal(f.picks, 0); assert.equal(f.lockRequests, 0);
});

test('mouse and touch use the same drag motion; blank clicks never lock the pointer', () => {
  const mouse = fixture(true), touch = fixture(true);
  for (const [f, pointerType] of [[mouse, 'mouse'], [touch, 'touch']]) {
    event(f.canvas, 'pointerdown', { pointerType }); event(f.canvas, 'pointerup', { pointerType });
    assert.equal(f.lockRequests, 0);
    event(f.canvas, 'pointerdown', { pointerType });
    event(f.canvas, 'pointermove', { pointerType, clientX: 310, clientY: 450, buttons: 1 });
    event(f.canvas, 'pointerup', { pointerType, clientX: 310, clientY: 450 });
    assert.equal(f.picks, 0); assert.equal(f.canvas.captures.size, 0);
  }
  assert.equal(mouse.scene.yaw, touch.scene.yaw); assert.equal(mouse.scene.pitch, touch.scene.pitch);
});

test('holding a card freezes camera motion; cancellation, lost capture and blur end peeking', () => {
  const f = fixture(true); f.scene.target = { cardRole: 'hand' };
  event(f.canvas, 'pointerdown');
  event(f.canvas, 'pointermove', { clientX: 300 }); assert.equal(f.looks, 0);
  event(f.canvas, 'pointercancel'); assert.equal(f.scene.peekActive, false); assert.equal(f.releases, 1); assert.equal(f.canvas.captures.size, 0);
  event(f.canvas, 'pointerdown'); event(f.canvas, 'lostpointercapture');
  assert.equal(f.scene.peekActive, false); assert.equal(f.releases, 2);
  event(f.canvas, 'pointerdown'); event(f.win, 'blur');
  assert.equal(f.scene.peekActive, false); assert.equal(f.releases, 3);
  assert.equal(f.picks, 0);
});

test('dialogs suspend dragging and reset clears active gestures', () => {
  const f = fixture(true); f.doc.modal = true;
  event(f.canvas, 'pointerdown'); event(f.canvas, 'pointermove', { clientX: 250 });
  assert.equal(f.looks, 0); assert.equal(f.lockRequests, 0);
  f.doc.modal = false;
  event(f.canvas, 'pointerdown', { pointerType: 'touch' }); event(f.canvas, 'pointerup', { pointerType: 'touch' });
  assert.equal(f.lockRequests, 0);
  event(f.canvas, 'pointerdown');
  f.doc.modal = true; event(f.canvas, 'pointermove', { clientX: 250, buttons: 1 });
  assert.equal(f.controls.drag, null); assert.equal(f.looks, 0);
  f.doc.modal = false; event(f.canvas, 'pointerdown');
  f.scene.firstPerson = false; f.controls.reset();
  assert.equal(f.controls.drag, null); assert.equal(f.canvas.captures.size, 0); assert.equal(f.controls.offset.yaw, 0);
});

test('turn following accelerates for 0.6 seconds, decelerates for 0.4 seconds and aligns within one second', () => {
  const f = fixture(true); f.scene.lookTarget = { key: 'opponent-1', yaw: .8, pitch: -.1 };
  let previousStep = 0;
  for (let i = 0; i < 40; i++) {
    const yaw = f.scene.yaw, pitch = f.scene.pitch;
    f.advance(25); f.controls.tick(.025);
    assert.ok(f.scene.yaw > yaw && f.scene.yaw <= .8 + 1e-10);
    assert.ok(f.scene.pitch > pitch && f.scene.pitch <= -.1 + 1e-10);
    const step = f.scene.yaw - yaw;
    if (i < 24) assert.ok(step > previousStep, 'angular speed increases through 0.6 seconds');
    else assert.ok(step < previousStep, 'angular speed decreases after 0.6 seconds');
    previousStep = step;
    if (i === 19) assert.ok(Math.abs(f.scene.yaw - .8 * .25 / .6) < 1e-10);
    if (i === 23) assert.ok(Math.abs(f.scene.yaw - .48) < 1e-10, 'the curve reaches its speed peak at 0.6 seconds');
    // Live head motion must not restart the one-second approach every frame.
    f.scene.lookTarget = { key: 'opponent-1', yaw: .8, pitch: -.1 };
  }
  assert.ok(Math.abs(f.scene.yaw - .8) < 1e-10); assert.ok(Math.abs(f.scene.pitch + .1) < 1e-10);
  f.scene.lookTarget = { key: 'opponent-2', yaw: -.7, pitch: -.7 };
  const yaw = f.scene.yaw, pitch = f.scene.pitch;
  f.advance(25); f.controls.tick(.025);
  assert.ok(f.scene.yaw < yaw); assert.ok(f.scene.pitch < pitch);
  assert.ok(yaw - f.scene.yaw < .01, 'a new actor restarts with a gentle pull from the current pose');
  f.advance(975); f.controls.tick(.025);
  assert.ok(Math.abs(f.scene.yaw + .7) < 1e-10); assert.ok(Math.abs(f.scene.pitch + .7) < 1e-10);
  f.scene.lookTarget = null;
  const stopped = [f.scene.yaw, f.scene.pitch]; f.controls.tick(.025);
  assert.deepEqual([f.scene.yaw, f.scene.pitch], stopped, 'a completed hand does not pull the camera');
});

for (const pointerType of ['mouse', 'touch']) {
  test(`${pointerType} dragging interrupts turn following until one second after release`, () => {
    const f = fixture(true); f.scene.lookTarget = { yaw: 1, pitch: -.1 };
    f.controls.tick(.025); assert.ok(f.scene.yaw > 0);
    event(f.canvas, 'pointerdown', { pointerType });
    event(f.canvas, 'pointermove', { pointerType, clientX: 250, buttons: 1 });
    const manual = [f.scene.yaw, f.scene.pitch];
    f.advance(2000); f.controls.tick(.025);
    assert.deepEqual([f.scene.yaw, f.scene.pitch], manual, 'holding the gesture keeps automatic motion suspended');
    event(f.canvas, 'pointerup', { pointerType, clientX: 250 });
    f.advance(999); f.controls.tick(.025);
    assert.deepEqual([f.scene.yaw, f.scene.pitch], manual);
    f.advance(1); f.controls.tick(.025); assert.ok(f.scene.yaw > manual[0]);
    // A subsequent manual gesture restarts the full grace period.
    event(f.canvas, 'pointerdown', { pointerType });
    event(f.canvas, 'pointermove', { pointerType, clientX: 240, buttons: 1 });
    event(f.canvas, 'pointerup', { pointerType, clientX: 240 });
    const second = f.scene.yaw; f.advance(999); f.controls.tick(.025);
    assert.equal(f.scene.yaw, second);
  });
}

test('keyboard look and Home defer automatic turn following for one second', () => {
  const f = fixture(true); f.scene.lookTarget = { yaw: 1, pitch: 0 };
  event(f.canvas, 'keydown', { key: 'ArrowLeft' }); const yaw = f.scene.yaw;
  f.advance(999); f.controls.tick(.025); assert.equal(f.scene.yaw, yaw);
  f.advance(1); f.controls.tick(.025); assert.ok(f.scene.yaw > yaw);
  event(f.canvas, 'keydown', { key: 'Home' }); const resetYaw = f.scene.yaw;
  f.advance(999); f.controls.tick(.025); assert.equal(f.scene.yaw, resetYaw);
});

test('peeking, card animations, dialogs and lost focus suspend automatic aiming', () => {
  const f = fixture(true); f.scene.lookTarget = { yaw: 1, pitch: -.1 };
  for (const flag of ['peekActive', 'cardPeekClosing', 'viewTransition']) {
    f.scene[flag] = true; f.controls.tick(.025); assert.equal(f.looks, 0); f.scene[flag] = false;
  }
  f.doc.modal = true; f.controls.tick(.025); assert.equal(f.looks, 0); f.doc.modal = false;
  event(f.win, 'blur'); f.advance(2000); f.controls.tick(.025); assert.equal(f.looks, 0);
  event(f.win, 'focus'); f.advance(999); f.controls.tick(.025); assert.equal(f.looks, 0);
  f.advance(1); f.controls.tick(.025); assert.ok(f.looks > 0);
});

test('automatic aiming takes the shortest path across the yaw wrap and starts a new target gently after a long frame', () => {
  const f = fixture(true);
  f.scene.yaw = Math.PI - .05; f.scene.lookTarget = { yaw: -Math.PI + .05, pitch: -.4 };
  f.controls.tick(.025); assert.ok(f.scene.yaw > Math.PI - .05);
  for (let i = 0; i < 40; i++) { f.advance(25); f.controls.tick(.025); }
  assert.ok(f.scene.yaw < 0, 'the camera crosses the nearby wrap boundary');
  const before = f.scene.yaw;
  f.scene.lookTarget = { yaw: 0, pitch: -.4 }; f.controls.tick(30);
  assert.ok(Math.abs(f.scene.yaw - before) < .06);
  f.advance(900); f.controls.tick(.025); assert.ok(Math.abs(f.scene.yaw) < 1e-10);
});

test('the one-second aim deadline is independent of frame rate and follows the current target pose', () => {
  for (const fps of [10, 30, 40, 60]) {
    const f = fixture(true); f.scene.lookTarget = { key: 'same-actor', yaw: 2.4, pitch: .1 };
    for (let i = 0; i < fps; i++) { f.advance(TURN_FOLLOW.duration / fps); f.controls.tick(1 / fps); }
    assert.ok(Math.abs(f.scene.yaw - 2.4) < 1e-10, `yaw completes at ${fps} fps`);
    assert.ok(Math.abs(f.scene.pitch - .1) < 1e-10, `pitch completes at ${fps} fps`);
    f.scene.lookTarget = { key: 'same-actor', yaw: 2.41, pitch: .11 };
    f.advance(25); f.controls.tick(.025);
    assert.ok(Math.abs(f.scene.yaw - 2.41) < 1e-10, 'completed aim tracks the live pose without restarting');
  }
});

test('own turn returns from the opponent to the initial view using the same acceleration and braking', () => {
  const f = fixture(true);
  f.scene.lookTarget = { key: 'other-turn', yaw: .9, pitch: -.1 };
  for (let i = 0; i < 40; i++) { f.advance(25); f.controls.tick(.025); }
  const fromYaw = f.scene.yaw, fromPitch = f.scene.pitch;
  const initial = { yaw: .24, pitch: -.38 };
  f.scene.lookTarget = { key: 'my-turn', ...initial };
  let previousStep = 0;
  for (let i = 0; i < 40; i++) {
    const before = f.scene.yaw;
    f.advance(25); f.controls.tick(.025);
    const step = before - f.scene.yaw;
    if (i < 24) assert.ok(step > previousStep); else assert.ok(step < previousStep);
    previousStep = step;
    if (i === 23) {
      assert.ok(Math.abs(f.scene.yaw - (fromYaw + (initial.yaw - fromYaw) * .6)) < 1e-10);
      assert.ok(Math.abs(f.scene.pitch - (fromPitch + (initial.pitch - fromPitch) * .6)) < 1e-10);
    }
  }
  assert.ok(Math.abs(f.scene.yaw - initial.yaw) < 1e-10);
  assert.ok(Math.abs(f.scene.pitch - initial.pitch) < 1e-10);
  event(f.canvas, 'pointerdown'); event(f.canvas, 'pointermove', { clientX: 250, buttons: 1 });
  event(f.canvas, 'pointerup', { clientX: 250 });
  const manual = f.scene.yaw;
  f.advance(999); f.controls.tick(.025); assert.equal(f.scene.yaw, manual);
  f.advance(1); f.controls.tick(.025); assert.ok(f.scene.yaw > manual);
});

test('prop gestures select and push chips without turning the camera; table drags still turn and double taps check', () => {
  const f = fixture(true), sent = [];
  f.scene.tableActions = new TableActions({ send: type => { sent.push(type); return true; } });
  const room = { code: '123456', phase: 'playing', turnId: '1', hand: { number: 1, done: false, actor: 0, currentBet: 20,
    players: [{ id: 'me', seat: 0, bet: 0, chips: 1000 }], legal: { toCall: 20, callAmount: 20, canCheck: false, canRaise: true, minTo: 40, maxTo: 1000, canAllIn: true } } };
  f.scene.tableActions.sync(room, 'me'); f.scene.target = { chipRole: 'bank' };
  event(f.canvas, 'pointerdown'); f.advance(400); f.controls.tick(.025);
  assert.equal(f.scene.tableActions.gesture.kind, 'select');
  event(f.canvas, 'pointermove', { clientY: 360, buttons: 1 }); event(f.canvas, 'pointerup', { clientY: 360 });
  assert.ok(f.scene.tableActions.pending > 20); assert.equal(f.looks, 0); assert.deepEqual(sent, []);
  f.scene.target = { chipRole: 'staged' }; event(f.canvas, 'pointerdown');
  event(f.canvas, 'pointermove', { clientY: 360, buttons: 1 }); event(f.canvas, 'pointerup', { clientY: 360 });
  assert.deepEqual(sent, ['raise']); assert.equal(f.looks, 0);
  room.turnId = '2'; room.hand.legal = { ...room.hand.legal, toCall: 0, callAmount: 0, canCheck: true }; room.hand.currentBet = 0;
  f.scene.tableActions.sync(room, 'me'); f.scene.target = { tableSurface: true };
  event(f.canvas, 'pointerdown'); event(f.canvas, 'pointermove', { clientX: 260, buttons: 1 }); event(f.canvas, 'pointerup', { clientX: 260 });
  assert.ok(f.looks > 0); assert.equal(sent.length, 1);
  f.advance(500); event(f.canvas, 'pointerdown'); event(f.canvas, 'pointerup');
  f.advance(100); event(f.canvas, 'pointerdown'); event(f.canvas, 'pointerup');
  assert.deepEqual(sent, ['raise', 'check']);
});

test('hand gestures preserve peeking and submit a forward fold without rotating the view', () => {
  const f = fixture(true), sent = [];
  f.scene.tableActions = new TableActions({ send: type => { sent.push(type); return true; } });
  f.scene.tableActions.sync({ code: '123456', phase: 'playing', turnId: '1', hand: { number: 1, done: false, actor: 0, currentBet: 20,
    players: [{ id: 'me', seat: 0, bet: 0, chips: 1000 }], legal: { toCall: 20, callAmount: 20, canCheck: false, canRaise: true, minTo: 40, maxTo: 1000, canAllIn: true } } }, 'me');
  f.scene.target = { cardRole: 'hand' };
  event(f.canvas, 'pointerdown'); assert.equal(f.scene.peekActive, true);
  event(f.canvas, 'pointerup'); assert.equal(f.scene.peekActive, false); assert.deepEqual(sent, []);
  event(f.canvas, 'pointerdown'); event(f.canvas, 'pointermove', { clientY: 360, buttons: 1 });
  event(f.canvas, 'pointerup', { clientY: 360 });
  assert.deepEqual(sent, ['fold']); assert.equal(f.scene.peekActive, false); assert.equal(f.looks, 0);
});
