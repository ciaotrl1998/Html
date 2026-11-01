import * as THREE from '/vendor/three.js';
import { BoardPresentation } from './board-presentation.js';
import { DEAL_TIMING } from '../shared/deal-timing.js';
import { cardArtImage } from './card-artwork.js';

const WIDTH = .5, HEIGHT = .73, THICKNESS = .014;
const DECK = new THREE.Vector3(-1.65, 1.80, -.25);
const X_AXIS = new THREE.Vector3(1, 0, 0);
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const TABLE_Y = 1.573;
export const BOARD_CENTER_Z = .65;
export const TABLE_POSITIONS = [[0, 5.5], [-3.15, 3.7], [-3.7, .4], [-2.65, -3.55], [0, -5.1], [2.65, -3.55], [3.7, .4], [3.15, 3.7]];

function roundedShape(width, height, radius) {
  const x = -width / 2, y = -height / 2;
  return new THREE.Shape().moveTo(x + radius, y).lineTo(x + width - radius, y)
    .quadraticCurveTo(x + width, y, x + width, y + radius).lineTo(x + width, y + height - radius)
    .quadraticCurveTo(x + width, y + height, x + width - radius, y + height).lineTo(x + radius, y + height)
    .quadraticCurveTo(x, y + height, x, y + height - radius).lineTo(x, y + radius)
    .quadraticCurveTo(x, y, x + radius, y);
}
function cardMap(card) {
  const map = new THREE.Texture(cardArtImage(card));
  map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 4; map.needsUpdate = true;
  return map;
}
function printedMaterial(map, color = 0xe6ddc6) {
  return new THREE.MeshBasicMaterial({ map, color, toneMapped: false, fog: false,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
}

class CardFactory {
  constructor() {
    const shape = roundedShape(WIDTH, HEIGHT, .025);
    this.bodyGeometry = new THREE.ExtrudeGeometry(shape, { depth: THICKNESS, bevelEnabled: true, bevelSegments: 2, steps: 1, bevelSize: .003, bevelThickness: .002, curveSegments: 5 });
    this.bodyGeometry.translate(0, 0, -THICKNESS / 2);
    this.faceGeometry = new THREE.ShapeGeometry(roundedShape(WIDTH - .008, HEIGHT - .008, .022), 6);
    const pos = this.faceGeometry.attributes.position, uv = this.faceGeometry.attributes.uv;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / WIDTH + .5, pos.getY(i) / HEIGHT + .5);
    this.paper = new THREE.MeshStandardMaterial({ color: 0xd6c9ae, roughness: 1 });
    this.back = printedMaterial(cardMap(null), 0xffffff);
    this.fronts = new Map(); this.lowQuality = false;
  }
  get backMaterial() {
    return this.back;
  }
  front(card) {
    if (card === null) return this.backMaterial;
    // Printed ink keeps the same brightness while cards rotate and across all
    // qualities. Only the paper edge/body responds to the room's illumination.
    if (!this.fronts.has(card)) this.fronts.set(card, printedMaterial(cardMap(card)));
    return this.fronts.get(card);
  }
  create(role) {
    const root = new THREE.Group(); root.userData.cardRole = role;
    const body = new THREE.Mesh(this.bodyGeometry, this.paper); body.castShadow = true; body.receiveShadow = true;
    const front = new THREE.Mesh(this.faceGeometry, this.backMaterial); front.position.z = THICKNESS / 2 + .006;
    const back = new THREE.Mesh(this.faceGeometry, this.backMaterial); back.position.z = -THICKNESS / 2 - .006; back.rotation.y = Math.PI;
    const display = new THREE.Group(); display.matrixAutoUpdate = false;
    display.add(body, front, back); root.add(display); root.visible = false;
    return { root, display, front, back, value: null, identity: '', animation: null };
  }
}
function rotation(x, y = 0, z = 0) { return new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z)); }

export class TableCards {
  constructor(scene, { animate = true } = {}) {
    this.animate = animate;
    this.factory = new CardFactory(); this.handKey = null; this.dealStart = null; this.seenState = false; this.peeking = false; this.folded = false;
    this.board = Array.from({ length: 5 }, () => this.factory.create('board'));
    this.boardPresentation = new BoardPresentation(this.board);
    this.hole = Array.from({ length: 2 }, () => this.factory.create('hand'));
    this.ownDiscard = Array.from({ length: 2 }, () => this.factory.create('discard'));
    this.opponents = Array.from({ length: 8 }, () => Array.from({ length: 2 }, () => this.factory.create('opponent')));
    this.discards = Array.from({ length: 8 }, () => Array.from({ length: 2 }, () => this.factory.create('discard')));
    this.all = [...this.board, ...this.hole, ...this.ownDiscard, ...this.opponents.flat(), ...this.discards.flat()];
    this.boardGroup = new THREE.Group(); this.handGroup = new THREE.Group();
    this.boardGroup.userData.layout = { id: 'board-group', label: '公共牌（整排）', category: '筹码与扑克' };
    this.boardGroup.userData.layoutBase = { position: [0, TABLE_Y, BOARD_CENTER_Z], rotation: [0, 0, 0], scale: [1, 1, 1] };
    this.handGroup.userData.layout = { id: 'hand-group', label: '自己的底牌（两张）', category: '筹码与扑克' };
    this.handGroup.userData.layoutBase = { position: [0, TABLE_Y, 3.95], rotation: [0, 0, 0], scale: [1, 1, 1] };
    scene.add(this.boardGroup, this.handGroup);
    this.boardAnchor = new THREE.Object3D(); this.boardAnchor.position.set(0, TABLE_Y, BOARD_CENTER_Z); this.boardGroup.add(this.boardAnchor);
    this.handAnchor = new THREE.Object3D(); this.handAnchor.position.set(0, TABLE_Y, 3.95); this.handGroup.add(this.handAnchor);
    this.board.forEach((card, i) => {
      this.boardGroup.add(card.root);
      card.root.userData.layout = { id: `board-card-${i}`, label: `公共牌 ${i + 1}`, category: '筹码与扑克' };
      card.root.userData.layoutBase = { position: [(i - 2) * .56, TABLE_Y, BOARD_CENTER_Z], rotation: [-Math.PI / 2, 0, (i % 2 ? 1 : -1) * .006], scale: [1, 1, 1] };
    });
    this.hole.forEach((card, i) => {
      this.handGroup.add(card.root);
      card.root.userData.layout = { id: `hand-card-${i}`, label: `自己的底牌 ${i + 1}`, category: '筹码与扑克' };
      card.root.userData.layoutBase = { position: [(i ? 1 : -1) * .145, TABLE_Y + i * .004, 3.95 + i * .005], rotation: [Math.PI / 2, 0, (i ? 1 : -1) * .1], scale: [.65, .65, .65] };
    });
    this.ownDiscardGroup = new THREE.Group(); this.ownDiscardGroup.position.set(-1, TABLE_Y, 1.45);
    this.ownDiscardGroup.userData.layout = { id: 'hand-discard', label: '自己 · 弃牌位置（第一人称）', category: '筹码与扑克' };
    scene.add(this.ownDiscardGroup); for (const card of this.ownDiscard) this.ownDiscardGroup.add(card.root);
    this.opponents.forEach((cards, i) => {
      const group = new THREE.Group(); group.userData.layout = { id: `opponent-cards-${i}`, label: `座位 ${i + 1} · 底牌`, category: '筹码与扑克' };
      group.userData.layoutBase = { position: [0, TABLE_Y, 0], rotation: [0, 0, 0], scale: [1, 1, 1] };
      scene.add(group); for (const card of cards) group.add(card.root);
    });
    this.discardGroups = TABLE_POSITIONS.map(([x, z], local) => {
      const group = new THREE.Group(); group.position.set(x * .43, TABLE_Y, z * .43); group.rotation.y = Math.atan2(-x, -z);
      if (local > 0) group.userData.layout = { id: `opponent-discard-${local}`, label: `座位 ${local + 1} · 弃牌位置`, category: '筹码与扑克' };
      scene.add(group); for (const card of this.discards[local]) group.add(card.root);
      return group;
    });
    // A real patterned top card on the deck, with the same paper thickness as dealt cards.
    const deckCard = this.factory.create('deck'); deckCard.root.position.set(-1.65, 1.785, -.25);
    deckCard.root.userData.layout = { id: 'deck-top', label: '牌堆 · 顶牌', category: '筹码与扑克' };
    deckCard.root.quaternion.copy(rotation(Math.PI / 2)); deckCard.root.visible = true; scene.add(deckCard.root);
    this.deckCard = deckCard;
  }
  prepareTextures(renderer) {
    if (!renderer.initTexture || this.preparedRenderer === renderer) return;
    renderer.initTexture(this.factory.back.map);
    for (let card = 0; card < 52; card++) renderer.initTexture(this.factory.front(card).map);
    this.preparedRenderer = renderer;
  }
  setQuality(quality) {
    const low = quality === 'low';
    if (this.factory.lowQuality === low) return;
    this.factory.lowQuality = low;
    for (const card of [...this.all, this.deckCard]) {
      card.front.material = this.factory.front(card.value);
      card.back.material = this.factory.backMaterial;
    }
  }
  place(card, value, identity, position, quaternion, { animate = false, delay = 0, scale = 1, flip = true, dealing = false, fromCurrent = false } = {}) {
    const changed = card.identity !== identity;
    card.value = value; card.front.material = this.factory.front(value); card.root.scale.setScalar(scale);
    if (changed) {
      card.identity = identity;
      if (animate) {
        if (!fromCurrent) {
          card.root.position.copy(DECK);
          card.root.quaternion.copy(quaternion);
          if (flip) card.root.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(X_AXIS, Math.PI));
        }
        card.animation = { kind: dealing ? 'deal' : 'reveal', start: (dealing && this.dealStart !== null ? this.dealStart : performance.now()) + delay, duration: fromCurrent ? 360 : DEAL_TIMING.card, from: card.root.position.clone(), to: position.clone(), fromQ: card.root.quaternion.clone(), toQ: quaternion.clone(), lift: fromCurrent ? .12 : .35 };
      } else { card.animation = null; card.root.position.copy(position); card.root.quaternion.copy(quaternion); }
    }
    card.root.visible = true;
  }
  placeDiscard(card, source, group, identity, position, quaternion, animate) {
    if (card.identity !== identity) {
      let from = null;
      if (source.root.visible && animate) { source.root.updateWorldMatrix(true, true); from = source.display.matrixWorld.clone(); }
      this.place(card, null, identity, position, quaternion, { scale: .65, flip: false });
      if (from) {
        group.updateWorldMatrix(true, false);
        const fromPosition = new THREE.Vector3(), fromQ = new THREE.Quaternion(), fromScale = new THREE.Vector3();
        from.premultiply(group.matrixWorld.clone().invert()).decompose(fromPosition, fromQ, fromScale);
        card.root.position.copy(fromPosition); card.root.quaternion.copy(fromQ); card.root.scale.copy(fromScale);
        card.animation = { start: performance.now(), duration: 440, from: fromPosition, to: position, fromQ, toQ: quaternion, fromScale, toScale: new THREE.Vector3(.65, .65, .65), lift: .12 };
      }
    }
    card.root.visible = true;
  }
  update(room, viewerId, positions, focus) {
    const hand = room?.hand, newKey = hand ? `${room.code}:${hand.number}` : null;
    const freshHand = newKey !== this.handKey;
    if (freshHand || !hand) { this.peeking = false; this.shown = false; this.boardPresentation.reset(); }
    const allowAnimation = this.seenState && this.animate;
    if (freshHand || !hand) for (const card of this.all) { card.root.visible = false; card.animation = null; card.identity = ''; card.peekPending = false; }
    this.handKey = newKey; this.seenState = true;
    if (!hand) return;
    if (room.opening) {
      for (const card of this.all) { card.root.visible = false; card.animation = null; card.identity = ''; card.peekPending = false; }
      return;
    }
    this.dealStart = room.deal?.hand === hand.number && room.deal.boardCount === hand.board.length && Number.isFinite(room.serverTime)
      ? performance.now() - (room.serverTime - room.deal.startedAt) : null;
    for (let i = 0; i < 5; i++) {
      if (i >= hand.board.length) { this.board[i].root.visible = false; continue; }
      this.place(this.board[i], hand.board[i], `${newKey}:board:${i}`, new THREE.Vector3((i - 2) * .56, TABLE_Y, BOARD_CENTER_Z), rotation(-Math.PI / 2, 0, (i % 2 ? 1 : -1) * .006), { animate: allowAnimation, delay: (i < 3 ? i : 0) * DEAL_TIMING.flopGap, dealing: !hand.done });
    }
    const me = hand.players.find(p => p.id === viewerId);
    this.folded = !me || me.folded;
    this.shown = !!me?.shown;
    if (this.folded || this.shown) this.peeking = false;
    for (let i = 0; i < 2; i++) {
      if (me?.folded) {
        this.placeDiscard(this.ownDiscard[i], this.hole[i], this.ownDiscardGroup, `${newKey}:own-discard:${me.id}:${i}`,
          new THREE.Vector3(i * .13, i * .005, 0), rotation(Math.PI / 2, 0, (i ? 1 : -1) * .1), allowAnimation && !freshHand);
        this.hole[i].root.visible = false; this.hole[i].animation = null; this.hole[i].identity = ''; continue;
      }
      this.ownDiscard[i].root.visible = false; this.ownDiscard[i].animation = null;
      if (!me || me.cards[i] === null) { this.hole[i].root.visible = false; continue; }
      const side = i ? 1 : -1;
      const position = new THREE.Vector3(side * (this.shown ? .23 : .145), TABLE_Y + i * .004, (this.shown ? 3.15 : 3.95) + i * .005);
      this.place(this.hole[i], me.cards[i], `${newKey}:own:${i}:${this.shown}`, position, rotation(this.peeking || this.shown ? -Math.PI / 2 : Math.PI / 2, 0, side * .1), { animate: allowAnimation, fromCurrent: this.shown && !freshHand, delay: this.shown ? 0 : i * DEAL_TIMING.holeGap, scale: .65, flip: false, dealing: !hand.done });
    }
    for (let local = 0; local < 8; local++) {
      const seat = (local + focus) % 8, player = hand.players.find(p => p.seat === seat);
      const [x, z] = positions[local];
      const yaw = Math.atan2(-x, -z);
      const sideways = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
      for (let i = 0; i < 2; i++) {
        const card = this.opponents[local][i];
        const discarded = this.discards[local][i];
        if (player && player.id !== viewerId && player.folded) {
          this.placeDiscard(discarded, card, this.discardGroups[local], `${newKey}:discard:${player.id}:${i}`,
            new THREE.Vector3((i ? 1 : -1) * .065, i * .005, i * .025), rotation(Math.PI / 2, 0, (i ? 1 : -1) * .18), allowAnimation && !freshHand);
        } else { discarded.root.visible = false; discarded.animation = null; }
        if (!player || player.id === viewerId || player.folded) { card.root.visible = false; card.animation = null; continue; }
        const known = player.cards[i] !== null;
        const reach = player.shown ? .47 : .59;
        const position = new THREE.Vector3(x * reach, TABLE_Y + i * .003, z * reach).addScaledVector(sideways, (i ? 1 : -1) * .14);
        const q = new THREE.Quaternion().setFromAxisAngle(Y_AXIS, yaw).multiply(rotation(known ? -Math.PI / 2 : Math.PI / 2, 0, i ? .08 : -.08));
        card.root.userData.seat = seat;
        this.place(card, player.cards[i], `${newKey}:other:${player.id}:${i}:${known}`, position, q, { animate: allowAnimation, fromCurrent: player.shown && !freshHand, delay: player.shown ? 0 : local * DEAL_TIMING.seatGap + i * DEAL_TIMING.opponentGap, scale: .65, dealing: !hand.done });
      }
    }
    if (room.dealing === false) this.finishDealing();
  }
  get dealing() { return this.all.some(card => card.animation?.kind === 'deal'); }
  finishDealing() {
    for (const card of this.all) if (card.animation?.kind === 'deal') {
      card.root.position.copy(card.animation.to); card.root.quaternion.copy(card.animation.toQ); card.root.visible = true; card.animation = null;
    }
    this.resolvePendingPeeks(performance.now());
  }
  flipHoleCard(card, index, now = performance.now()) {
    card.root.visible = true;
    card.animation = { start: now, duration: 240,
      from: card.root.position.clone(), to: new THREE.Vector3((index ? 1 : -1) * .145, TABLE_Y + index * .004, 3.95 + index * .005),
      fromQ: card.root.quaternion.clone(), toQ: rotation(this.peeking ? -Math.PI / 2 : Math.PI / 2, 0, (index ? 1 : -1) * .1), lift: .27 };
  }
  resolvePendingPeeks(now) {
    this.hole.forEach((card, index) => {
      if (!card.peekPending || card.animation?.kind === 'deal') return;
      card.peekPending = false;
      if (this.peeking && card.identity) this.flipHoleCard(card, index, now);
    });
  }
  setPeeking(peeking) {
    peeking = !!peeking && !this.folded && !this.shown;
    if (this.peeking === peeking) return;
    this.peeking = peeking;
    for (let i = 0; i < 2; i++) {
      const card = this.hole[i]; if (!card.identity) continue;
      // Holding a card must not skip its deal or reveal an undelivered card.
      if (card.animation?.kind === 'deal') { card.peekPending = true; continue; }
      this.flipHoleCard(card, i);
    }
  }
  setBoardPeeking(peeking) { this.boardPresentation.setRaised(peeking); }
  setHandDrag(progress) { this.handDrag = progress; }
  get boardRaised() { return this.boardPresentation.progress >= 1; }
  get boardResting() { return this.boardPresentation.progress <= 0; }
  tick(now, camera) {
    for (const card of this.all) {
      const a = card.animation; if (!a) continue;
      if (now < a.start) { card.root.visible = false; continue; }
      card.root.visible = true;
      const t = Math.min(1, (now - a.start) / a.duration), ease = 1 - (1 - t) ** 3;
      card.root.position.lerpVectors(a.from, a.to, ease);
      card.root.position.y += Math.sin(Math.PI * t) * a.lift;
      card.root.quaternion.slerpQuaternions(a.fromQ, a.toQ, ease);
      if (a.fromScale) card.root.scale.lerpVectors(a.fromScale, a.toScale, ease);
      if (t === 1) card.animation = null;
    }
    this.resolvePendingPeeks(now);
    this.boardPresentation.tick(now, camera);
    for (const card of this.hole) {
      card.display.matrix.identity();
      if (this.handDrag > 0 && !this.folded && !this.shown) {
        const world = card.root.getWorldPosition(new THREE.Vector3());
        const direction = this.boardAnchor.getWorldPosition(new THREE.Vector3()).sub(world); direction.y = 0; direction.normalize();
        const desired = world.clone().addScaledVector(direction, this.handDrag * .45); desired.y += this.handDrag * .06;
        const local = card.root.worldToLocal(desired);
        card.display.matrix.makeTranslation(local.x, local.y, local.z);
      }
      card.display.matrixWorldNeedsUpdate = true;
    }
  }
}
