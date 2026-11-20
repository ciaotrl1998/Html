import * as THREE from '/vendor/three.js';
import { ACTION_TIMING } from '../shared/action-timing.js';

const clamp = value => Math.max(0, Math.min(1, value));
const smooth = value => { const t = clamp(value); return t * t * (3 - 2 * t); };
const envelope = (t, up, hold, down) => smooth(t / up) * (1 - smooth((t - hold) / (down - hold)));
const UP = new THREE.Vector3(0, 1, 0);
const UPPER_LENGTH = .76, FORE_LENGTH = .82;

export function actionPose(type, elapsed, duration = ACTION_TIMING.duration) {
  const t = clamp(elapsed / Math.max(1, duration));
  const pose = { rightPush: 0, leftPush: 0, check: 0, tap: 0, fold: 0, cover: 0, sway: 0 };
  if (type === 'bust') {
    pose.cover = 1;
    pose.sway = Math.sin(elapsed * Math.PI * 2 / 1800);
  } else if (type === 'check') {
    pose.check = envelope(t, .12, .76, 1);
    for (const start of [.15, .43]) {
      const phase = (t - start) / .22;
      if (phase >= 0 && phase <= 1) pose.tap += Math.sin(phase * Math.PI) ** 2;
    }
  } else if (['call', 'raise', 'allin', 'fold'].includes(type)) {
    pose.rightPush = envelope(t, .44, .62, 1);
    if (type === 'allin') pose.leftPush = pose.rightPush;
    if (type === 'fold') pose.fold = pose.rightPush;
  }
  return pose;
}

export function createCharacterArms(root, coat, skin, style) {
  const arms = {};
  for (const side of [-1, 1]) {
    const group = new THREE.Group(); root.add(group);
    const { upper, fore, palm } = style ? style.parts(side) : {
      upper: new THREE.Mesh(new THREE.CylinderGeometry(.14, .16, UPPER_LENGTH, 8), coat),
      fore: new THREE.Mesh(new THREE.CylinderGeometry(.12, .14, FORE_LENGTH, 8), coat),
      palm: new THREE.Mesh(new THREE.SphereGeometry(.14, 8, 6), skin)
    };
    for (const part of [upper, fore]) {
      part.castShadow = true; part.receiveShadow = true; part.userData.animatedArm = true; group.add(part);
    }
    if (!style) palm.scale.set(1.1, .55, 1.4);
    palm.castShadow = true; palm.userData.animatedArm = true; group.add(palm);
    const arm = { upper, fore, palm, side, upperLength: style?.upperLength ?? UPPER_LENGTH,
      foreLength: style?.foreLength ?? FORE_LENGTH,
      shoulder: new THREE.Vector3(side * (style?.shoulderWidth ?? .5), style?.shoulderHeight ?? 2.47, style?.shoulderDepth ?? -.03),
      rest: new THREE.Vector3(side * .47, 1.8, .96), target: new THREE.Vector3(),
      direction: new THREE.Vector3(), bend: new THREE.Vector3(), elbow: new THREE.Vector3(), segment: new THREE.Vector3() };
    arms[side < 0 ? 'right' : 'left'] = arm;
    positionArm(arm, arm.rest);
  }
  root.userData.arms = arms;
  return arms;
}

function positionArm(arm, target) {
  const { shoulder, direction, bend, elbow, segment, upperLength, foreLength } = arm;
  direction.copy(target).sub(shoulder);
  const distance = THREE.MathUtils.clamp(direction.length(), Math.abs(upperLength - foreLength) + .001, upperLength + foreLength - .001);
  direction.normalize();
  const along = (upperLength ** 2 - foreLength ** 2 + distance ** 2) / (2 * distance);
  const height = Math.sqrt(Math.max(0, upperLength ** 2 - along ** 2));
  bend.set(arm.side * .3, -1, -.3).addScaledVector(direction, -bend.dot(direction)).normalize();
  elbow.copy(shoulder).addScaledVector(direction, along).addScaledVector(bend, height);
  arm.target.copy(shoulder).addScaledVector(direction, distance);
  for (const [mesh, from, to] of [[arm.upper, shoulder, elbow], [arm.fore, elbow, arm.target]]) {
    mesh.position.copy(from).add(to).multiplyScalar(.5);
    segment.copy(to).sub(from).normalize(); mesh.quaternion.setFromUnitVectors(UP, segment);
  }
  arm.palm.position.copy(arm.target);
}

export function applyCharacterPose(model, pose) {
  for (const [side, arm] of Object.entries(model.userData.arms || {})) {
    const push = side === 'right' ? pose.rightPush : pose.leftPush;
    const target = arm.rest.clone();
    target.z += push * .38; target.y -= push * .13;
    if (side === 'right') target.x += pose.fold * .26;
    if (side === 'left') target.y += pose.check * (-.14 + pose.tap * .18);
    if (pose.cover) target.set(arm.side * .24, 3.13 + pose.sway * .025, .30);
    positionArm(arm, target);
  }
  if (pose.cover) {
    model.userData.head.rotation.x = .35 + pose.sway * .065;
    model.userData.head.rotation.z = pose.sway * .045;
  } else model.userData.head.rotation.z = 0;
}

export function applyFirstPersonPose(hands, pose) {
  // The head-cover reaction belongs to the visible character model.
  for (const [side, arm] of Object.entries(hands.userData.arms || {})) {
    const push = side === 'right' ? pose.rightPush : pose.leftPush;
    arm.group.position.copy(arm.position); arm.group.quaternion.copy(arm.quaternion);
    arm.group.position.z -= push * .66;
    arm.group.position.y -= push * .08;
    if (side === 'right') arm.group.position.x -= pose.fold * .40;
    if (side === 'left') {
      arm.group.position.y += pose.check * (-.13 + pose.tap * .16);
      arm.group.rotation.x -= pose.check * .12;
    }
  }
}

export class CharacterActions {
  constructor(saloon) { this.saloon = saloon; this.motions = new Map(); this.busted = new Set(); }
  sync(room, now = performance.now()) {
    const key = room?.hand ? `${room.code}:${room.hand.number}` : null;
    if (key !== this.key) { this.motions.clear(); this.seen = null; this.key = key; }
    this.busted.clear();
    if (!room?.hand || room.phase === 'lobby') return;
    for (const seat of room.seats) {
      const player = room.hand.players.find(player => player.id === seat.id);
      if (seat.kind !== 'open' && (player ? room.hand.done && player.chips === 0 : seat.chips === 0)) this.busted.add(seat.seat);
    }
    const action = room.actionPresentation;
    if (!action || action.id === this.seen) return;
    this.seen = action.id;
    const duration = action.endsAt - action.startedAt;
    const elapsed = Math.max(0, room.serverTime - action.startedAt);
    if (elapsed < duration) this.motions.set(action.seat, { type: action.type, start: now - elapsed, duration });
  }
  get moving() { return this.motions.size > 0 || this.busted.size > 0; }
  tick(now) {
    for (const [seat, motion] of this.motions) if (now - motion.start >= motion.duration) this.motions.delete(seat);
    for (const model of this.saloon.models) {
      const seat = model.userData.seat, motion = this.motions.get(seat);
      const pose = this.busted.has(seat) ? actionPose('bust', now)
        : actionPose(motion?.type, motion ? now - motion.start : 0, motion?.duration);
      if (model.visible) applyCharacterPose(model, pose);
      if (seat === this.saloon.focus && this.saloon.hands.visible) applyFirstPersonPose(this.saloon.hands, pose);
    }
  }
}
