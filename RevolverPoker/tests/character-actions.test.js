import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import * as THREE from 'three';
import { ACTION_TIMING, presentationTiming } from '../shared/action-timing.js';
import { hasLocalTurn } from '../client/turn-highlight.js';
import { DEFAULT_VERA_APPEARANCE, veraAppearance } from '../client/vera-appearance.js';
import VeraMeshes from '../client/vera-mesh-data.js';
import { readFile } from 'node:fs/promises';

registerHooks({ resolve(specifier, context, next) { return next(specifier === '/vendor/three.js' ? 'three' : specifier, context); } });
const { actionPose, createCharacterArms, applyCharacterPose, applyFirstPersonPose, CharacterActions } = await import('../client/character-actions.js');
const { batchStaticMeshes } = await import('../client/mesh-batching.js');
const { createVera, createVeraHands } = await import('../client/vera-model.js');

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

test('Vera fits the character geometry budget and reaches the table and head with both gloves', () => {
  const vera = createVera();
  let triangles = 0;
  vera.traverseVisible(node => {
    if (!node.isMesh) return;
    triangles += (node.geometry.index?.count ?? node.geometry.attributes.position.count) / 3;
    assert.equal(node.material.map, null);
    assert.equal(node.geometry.hasAttribute('uv'), false);
  });
  assert.ok(triangles <= 4700);
  assert.ok(createVeraHands(-1).geometry.index.count / 3 <= 300);
  vera.updateMatrixWorld(true);
  for (const arm of Object.values(vera.userData.arms)) {
    const sleeveTop = new THREE.Box3().setFromObject(arm.upper, true).max.y;
    assert.ok(sleeveTop >= vera.userData.head.position.y - .45, 'the sleeve cap reaches the raised shoulder line');
    const handBounds = new THREE.Box3().setFromObject(arm.palm, true);
    assert.ok(arm.side < 0 ? handBounds.max.x < 0 : handBounds.min.x > 0, 'the hand stays on its physical side');
    assert.ok(handBounds.max.x - handBounds.min.x > .30, 'the edited hand scale was baked into the mesh');
    assert.ok(handBounds.min.y < arm.rest.y && handBounds.max.y > arm.rest.y, 'the hand surrounds its wrist pivot');
  }
  const gloves = Object.values(vera.userData.arms).map(arm => arm.palm);
  const rest = gloves.map(glove => glove.position.clone());
  applyCharacterPose(vera, actionPose('allin', 420));
  assert.ok(gloves.every((glove, i) => glove.position.z - rest[i].z > .25));
  applyCharacterPose(vera, actionPose('bust', 450));
  assert.ok(gloves.every(glove => glove.position.y > 3));
  applyCharacterPose(vera, actionPose(null, 0));
  assert.ok(gloves.every((glove, i) => glove.position.distanceTo(rest[i]) < 1e-9));
});

test('both of Vera’s expressions use the edited head and the two black eyes', () => {
  const vera = createVera();
  const [, neutral, angry] = vera.userData.head.children;
  const eyeColor = new THREE.Color(0x18141a).toArray();
  vera.userData.setAnger(2);
  assert.equal(neutral.visible, false);
  assert.equal(angry.visible, true);
  assert.notDeepEqual(neutral.geometry.attributes.position.array, angry.geometry.attributes.position.array);
  for (const { geometry } of [neutral, angry]) {
    geometry.computeBoundingBox();
    const size = geometry.boundingBox.getSize(new THREE.Vector3());
    assert.ok(geometry.boundingBox.getCenter(new THREE.Vector3()).length() < .12, 'the head is centered on its pivot');
    assert.ok(size.z > .69, 'the imported head is deeper than the earlier ellipsoid');
    const { index, attributes: { color } } = geometry;
    let eyeTriangles = 0;
    for (let i = 0; i < index.count; i += 3) {
      const corners = [index.getX(i), index.getX(i + 1), index.getX(i + 2)];
      if (corners.every(vertex => eyeColor.every((value, axis) => Math.abs(color.getComponent(vertex, axis) - value) < .0001))) eyeTriangles++;
    }
    assert.equal(eyeTriangles, 4);
  }
});

test('female player appearance varies by identity and remains stable across seat moves and reconnects', () => {
  const players = Array.from({ length: 36 }, (_, i) => ({ kind: 'human', id: `player-${i}`, seat: i % 8 }));
  const appearances = players.map(player => veraAppearance('ROOM', player));
  assert.equal(new Set(appearances.map(appearance => appearance.hairstyle)).size, 3);
  assert.ok(new Set(appearances.map(appearance => appearance.hairColor)).size > 1);
  assert.ok(new Set(appearances.map(appearance => appearance.outfitColor)).size > 1);
  assert.deepEqual(veraAppearance('ROOM', { ...players[0], seat: 7, connected: false }), appearances[0]);
  assert.equal(veraAppearance('ROOM', { kind: 'ai', id: 'maggie', hairstyle: 'bob' }).hairstyle, 'bob');
});

test('hair swaps preserve earrings and cloth dye affects only the marked burgundy fabric', () => {
  const vera = createVera();
  const hair = vera.userData.head.children[0];
  const accessoryComponents = atob(VeraMeshes.accessories.color).length / Float32Array.BYTES_PER_ELEMENT;
  const baseAccessories = hair.geometry.attributes.color.array.slice(-accessoryComponents);
  const { left, right } = vera.userData.arms;
  const clothing = [vera.children.find(node => node.isMesh), left.upper, right.upper];
  const source = clothing.map(part => part.geometry.attributes.color.array.slice());
  const indices = [hair.geometry.index.count];
  for (const hairstyle of ['bob', 'braid']) {
    vera.userData.setAppearance({ hairstyle, hairColor: 0xbf965c, outfitColor: 0x316d67 });
    assert.deepEqual(hair.geometry.attributes.color.array.slice(-accessoryComponents), baseAccessories);
    indices.push(hair.geometry.index.count);
    let triangles = 0;
    vera.traverseVisible(node => { if (node.isMesh) triangles += node.geometry.index.count / 3; });
    assert.ok(triangles <= 4700);
  }
  assert.equal(new Set(indices).size, 3);
  for (const [i, part] of clothing.entries()) {
    const { color, dye } = part.geometry.attributes;
    let changed = 0, fixed = 0;
    for (let v = 0; v < dye.count; v++) {
      const before = source[i].slice(v * 3, v * 3 + 3), after = color.array.slice(v * 3, v * 3 + 3);
      if (dye.getX(v)) {
        assert.notDeepEqual(after, before);
        changed++;
      } else {
        assert.deepEqual(after, before);
        fixed++;
      }
    }
    assert.ok(changed > 0 && fixed > 0);
  }
  vera.userData.setAppearance(DEFAULT_VERA_APPEARANCE);
  assert.deepEqual(clothing.map(part => part.geometry.attributes.color.array), source);
});

test('braided hair covers the scalp behind both ears in profile', () => {
  const vera = createVera({ ...DEFAULT_VERA_APPEARANCE, hairstyle: 'braid' });
  vera.updateMatrixWorld(true);
  const [hair, face] = vera.userData.head.children;
  for (const side of [-1, 1]) {
    for (const [y, z] of [[-.12, -.11], [-.17, -.18], [-.17, -.25]]) {
      const origin = new THREE.Vector3(side, vera.userData.head.position.y + y, z);
      const ray = new THREE.Raycaster(origin, new THREE.Vector3(-side, 0, 0));
      const [scalp] = ray.intersectObject(face);
      const [cover] = ray.intersectObject(hair);
      assert.ok(scalp && cover && cover.distance < scalp.distance, `side ${side}, ${y}, ${z}`);
    }
  }
});

test('first-person arms act normally and stay at rest during the bust reaction', () => {
  const hands = new THREE.Group(); hands.userData.arms = {};
  for (const side of ['left', 'right']) {
    const group = new THREE.Group(); group.position.set(side === 'right' ? .6 : -.6, 0, 0); group.rotation.y = .1;
    hands.add(group); hands.userData.arms[side] = { group, position: group.position.clone(), quaternion: group.quaternion.clone() };
  }
  applyFirstPersonPose(hands, actionPose('call', 420));
  assert.ok(hands.userData.arms.right.group.position.z < -.6); assert.equal(hands.userData.arms.left.group.position.z, 0);
  applyFirstPersonPose(hands, actionPose('allin', 420));
  assert.ok(hands.userData.arms.left.group.position.z < -.6);
  for (const pose of [actionPose('bust', 0), actionPose('bust', 450), actionPose('bust', 1800), actionPose('call', 900)]) {
    applyFirstPersonPose(hands, pose);
    for (const arm of Object.values(hands.userData.arms)) {
      assert.ok(arm.group.position.distanceTo(arm.position) < 1e-9);
      assert.ok(arm.group.quaternion.angleTo(arm.quaternion) < 1e-7);
    }
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

