import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import * as THREE from 'three';
import { ACTION_TIMING, presentationTiming } from '../shared/action-timing.js';
import { hasLocalTurn } from '../client/turn-highlight.js';
import { readFile } from 'node:fs/promises';

registerHooks({ resolve(specifier, context, next) { return next(specifier === '/vendor/three.js' ? 'three' : specifier, context); } });
const { actionPose, createCharacterArms, applyCharacterPose, applyFirstPersonPose, CharacterActions } = await import('../client/character-actions.js');
const { batchStaticMeshes } = await import('../client/mesh-batching.js');

function model(seat = 0) {
  const root = new THREE.Group(); root.userData.seat = seat; root.userData.head = new THREE.Group(); root.add(root.userData.head);
  createCharacterArms(root, new THREE.MeshStandardMaterial(), new THREE.MeshStandardMaterial());
  return root;
}

test('bets and calls push the anatomical right arm, all-ins push both, and folding moves toward the cards', () => {
  for (const type of ['call', 'raise', 'allin', 'fold']) {
    const root = model(), arms = root.userData.arms;
    const left = arms.left.palm.position.clone(), right = arms.right.palm.position.clone();
    batchStaticMeshes(root);
    applyCharacterPose(root, actionPose(type, 420));
    assert.ok(arms.right.palm.position.z - right.z > .3);
    assert.equal(arms.right.palm.parent !== null, true, 'batching must preserve independently movable arms');
    if (type === 'allin') assert.ok(arms.left.palm.position.z - left.z > .3);
    else assert.ok(arms.left.palm.position.distanceTo(left) < 1e-9);
    if (type === 'fold') assert.ok(arms.right.palm.position.x > right.x + .2);
    applyCharacterPose(root, actionPose(type, 900));
    assert.ok(arms.right.palm.position.distanceTo(right) < 1e-9);
    assert.ok(arms.left.palm.position.distanceTo(left) < 1e-9);
  }
});

test('checking lifts and taps the left hand twice while keeping the right arm at rest', () => {
  const root = model(), arm = root.userData.arms.left, right = root.userData.arms.right.palm.position.clone();
  const heights = [];
  for (const t of [.26, .37, .54, .65]) {
    const pose = actionPose('check', t * 900);
    applyCharacterPose(root, pose); heights.push(arm.palm.position.y);
    assert.ok(root.userData.arms.right.palm.position.distanceTo(right) < 1e-9);
  }
  assert.ok(heights[0] > heights[1] + .15);
  assert.ok(heights[2] > heights[3] + .15);
});

test('busted players cover their head and keep a smooth, nonstatic looping pain pose', () => {
  const root = model(), hand = root.userData.arms.right.palm;
  applyCharacterPose(root, actionPose('bust', 0)); const first = hand.position.clone(), head = root.userData.head.rotation.x;
  assert.ok(hand.position.y > 3);
  applyCharacterPose(root, actionPose('bust', 450));
  assert.ok(hand.position.distanceTo(first) > .02);
  assert.ok(root.userData.head.rotation.x > head + .05);
  applyCharacterPose(root, actionPose('bust', 1800));
  assert.ok(hand.position.distanceTo(first) < 1e-9);
});

test('first-person arms express the same action, keep their editable base transforms and reset cleanly', () => {
  const hands = new THREE.Group(); hands.userData.arms = {};
  for (const side of ['left', 'right']) {
    const group = new THREE.Group(); group.position.set(side === 'right' ? .6 : -.6, 0, 0); group.rotation.y = .1;
    hands.add(group); hands.userData.arms[side] = { group, position: group.position.clone(), quaternion: group.quaternion.clone() };
  }
  applyFirstPersonPose(hands, actionPose('call', 420));
  assert.ok(hands.userData.arms.right.group.position.z < -.6); assert.equal(hands.userData.arms.left.group.position.z, 0);
  applyFirstPersonPose(hands, actionPose('allin', 420));
  assert.ok(hands.userData.arms.left.group.position.z < -.6);
  applyFirstPersonPose(hands, actionPose('bust', 450));
  assert.ok(hands.userData.arms.right.group.position.y > 1);
  applyFirstPersonPose(hands, actionPose('call', 900));
  for (const arm of Object.values(hands.userData.arms)) {
    assert.ok(arm.group.position.distanceTo(arm.position) < 1e-9);
    assert.ok(arm.group.quaternion.angleTo(arm.quaternion) < 1e-7);
  }
});

test('confirmed actions resume in progress without replaying on sync, and live all-ins are not busted', () => {
  const root = model(), saloon = { models: [root], hands: { visible: false }, focus: 0 }, animations = new CharacterActions(saloon);
  const state = { code: 'ROOM', phase: 'playing', serverTime: 1300,
    seats: [{ id: 'p', seat: 0, kind: 'ai', chips: 1000 }],
    hand: { number: 1, done: false, players: [{ id: 'p', seat: 0, chips: 0 }] },
    actionPresentation: { id: 'act-1', type: 'allin', seat: 0, startedAt: 1000, endsAt: 1900 } };
  animations.sync(state, 5000); assert.equal(animations.motions.get(0).start, 4700); assert.equal(animations.busted.size, 0);
  animations.sync({ ...state, serverTime: 1500 }, 5200); assert.equal(animations.motions.get(0).start, 4700);
  animations.tick(5600); assert.equal(animations.motions.size, 0);
  state.hand.done = true; animations.sync(state); assert.equal(animations.busted.has(0), true);
  state.hand = { number: 2, done: false, players: [] }; state.seats[0].chips = 0;
  animations.sync(state); assert.equal(animations.busted.has(0), true, 'eliminated seats continue the loop on subsequent hands');
  animations.sync(null); assert.equal(animations.moving, false);
});

test('only the local playable turn highlights the progress bar, with a one-second edge pulse', async () => {
  const room = { phase: 'playing', hand: { done: false, actor: 0, legal: { canCheck: true }, players: [{ id: 'me', seat: 0 }] } };
  assert.equal(hasLocalTurn(room, 'me'), true);
  for (const changes of [{ dealing: true }, { actionPresentation: {} }, { phase: 'lobby' }, { phase: 'finished' },
    { hand: { ...room.hand, done: true } }, { hand: { ...room.hand, legal: null } }, { hand: { ...room.hand, actor: 1 } }]) {
    assert.equal(hasLocalTurn({ ...room, ...changes }, 'me'), false);
  }
  assert.equal(hasLocalTurn(room, 'observer'), false); assert.equal(hasLocalTurn(room, 'me', false), false);
  assert.equal(hasLocalTurn(room, 'me', true, true), false); assert.equal(hasLocalTurn(null, 'me'), false);
  const css = await readFile(new URL('../client/view.css', import.meta.url), 'utf8');
  assert.match(css, /\.timer-track\.my-turn::after\s*\{\s*animation: turn-edge-glow 1s ease-in-out infinite/);
});

test('chip and card release timing follows the shared presentation clock including reconnects', () => {
  assert.equal(ACTION_TIMING.pause, 500);
  const presentation = { startedAt: 1000 };
  assert.deepEqual(presentationTiming(presentation, 1000), { elapsed: 0, delay: 180, duration: 540 });
  assert.deepEqual(presentationTiming(presentation, 1300), { elapsed: 300, delay: 0, duration: 420 });
});

