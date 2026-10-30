import * as THREE from '/vendor/three.js';
import { BoardPresentation } from './board-presentation.js';

const WIDTH = .5, HEIGHT = .73, THICKNESS = .014;
const SUITS = ['♣', '♦', '♥', '♠'];
const RANKS = '23456789TJQKA';
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
function canvasMap(paint) {
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 744;
  const ctx = canvas.getContext('2d'); paint(ctx);
  const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  return map;
}
function drawBack(ctx) {
  ctx.fillStyle = '#efe3c9'; ctx.fillRect(0, 0, 512, 744);
  ctx.fillStyle = '#473a2c'; ctx.fillRect(22, 22, 468, 700);
  ctx.strokeStyle = '#c5a76b'; ctx.lineWidth = 3;
  ctx.strokeRect(35, 35, 442, 674); ctx.strokeRect(46, 46, 420, 652);
  ctx.save(); ctx.beginPath(); ctx.rect(50, 50, 412, 644); ctx.clip();
  ctx.strokeStyle = '#9b805233'; ctx.lineWidth = 2;
  for (let x = -744; x < 1256; x += 24) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 744, 744); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x - 744, 744); ctx.stroke();
  }
  ctx.restore();
  ctx.fillStyle = '#302a20'; ctx.beginPath(); ctx.ellipse(256, 372, 124, 155, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#bda16a'; ctx.lineWidth = 5; ctx.stroke();
  ctx.textAlign = 'center'; ctx.fillStyle = '#d6bc84'; ctx.font = '172px Georgia, serif'; ctx.fillText('♠', 256, 407);
  ctx.font = 'bold 25px Georgia, serif'; ctx.fillText('RevolverPoker', 256, 466);
}
function drawFront(ctx, card) {
  const suit = SUITS[Math.floor(card / 13)], rank = RANKS[card % 13].replace('T', '10');
  const ink = card >= 13 && card < 39 ? '#922e2b' : '#202b27';
  const paper = ctx.createLinearGradient(0, 0, 512, 744); paper.addColorStop(0, '#f5ead4'); paper.addColorStop(1, '#e2d4b9');
  ctx.fillStyle = paper; ctx.fillRect(0, 0, 512, 744);
  // Subtle fixed paper fibres sit beneath the ink, so symbols stay crisp.
  ctx.fillStyle = '#71573509';
  for (let i = 0; i < 1600; i++) ctx.fillRect((i * 137.17) % 512, (i * 79.37) % 744, 2, i % 3 ? 2 : 4);
  ctx.strokeStyle = '#bba77a66'; ctx.lineWidth = 2; ctx.strokeRect(17, 17, 478, 710);
  const corner = () => {
    ctx.fillStyle = ink; ctx.textAlign = 'center'; ctx.font = `bold ${rank === '10' ? 112 : 130}px Georgia, serif`;
    ctx.fillText(rank, 78, 137); ctx.font = '87px Georgia, serif'; ctx.fillText(suit, 78, 216);
  };
  corner(); ctx.save(); ctx.translate(512, 744); ctx.rotate(Math.PI); corner(); ctx.restore();
  ctx.fillStyle = ink; ctx.textAlign = 'center';
  const pip = (x, y, invert = false, size = 86) => {
    ctx.save(); ctx.translate(256 + x * 240, 372 + y * 400); if (invert) ctx.rotate(Math.PI);
    ctx.font = `${size}px Georgia, serif`; ctx.textBaseline = 'middle'; ctx.fillText(suit, 0, 0); ctx.restore();
  };
  const n = card % 13 + 2;
  if (n === 14) pip(0, 0, false, 202);
  else if (n >= 11) {
    ctx.strokeStyle = ink; ctx.lineWidth = 4; ctx.strokeRect(150, 220, 212, 304);
    ctx.save(); ctx.translate(256, 372);
    for (let side = 0; side < 2; side++) {
      ctx.save(); if (side) ctx.rotate(Math.PI);
      ctx.fillStyle = '#ba985a'; ctx.beginPath(); ctx.moveTo(-64, -38); ctx.lineTo(-83, -109); ctx.lineTo(-32, -82); ctx.lineTo(0, -129); ctx.lineTo(32, -82); ctx.lineTo(83, -109); ctx.lineTo(64, -38); ctx.closePath(); ctx.fill();
      ctx.fillStyle = ink; ctx.font = 'bold 110px Georgia, serif'; ctx.fillText(rank, 0, 29);
      ctx.restore();
    }
    ctx.restore();
    pip(0, .35, false, 53); pip(0, -.35, true, 53);
  } else {
    const patterns = {
      2: [[0, -.4], [0, .4]], 3: [[0, -.4], [0, 0], [0, .4]],
      4: [[-.3, -.4], [.3, -.4], [-.3, .4], [.3, .4]],
      5: [[-.3, -.4], [.3, -.4], [0, 0], [-.3, .4], [.3, .4]],
      6: [[-.3, -.4], [.3, -.4], [-.3, 0], [.3, 0], [-.3, .4], [.3, .4]],
      7: [[-.3, -.4], [.3, -.4], [0, -.2], [-.3, 0], [.3, 0], [-.3, .4], [.3, .4]],
      8: [[-.3, -.4], [.3, -.4], [0, -.2], [-.3, 0], [.3, 0], [0, .2], [-.3, .4], [.3, .4]],
      9: [[-.3, -.42], [.3, -.42], [-.3, -.14], [.3, -.14], [0, 0], [-.3, .14], [.3, .14], [-.3, .42], [.3, .42]],
      10: [[-.3, -.42], [.3, -.42], [0, -.28], [-.3, -.14], [.3, -.14], [-.3, .14], [.3, .14], [0, .28], [-.3, .42], [.3, .42]]
    };
    for (const [x, y] of patterns[n]) pip(x, y, y > 0, n >= 8 ? 73 : 86);
  }
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
    this.back = new THREE.MeshStandardMaterial({ map: canvasMap(drawBack), roughness: .73, metalness: 0 });
    this.fronts = new Map();
  }
  front(card) {
    if (card === null) return this.back;
    // Matte paper still responds to warm saloon lights, with less highlight washout.
    if (!this.fronts.has(card)) this.fronts.set(card, new THREE.MeshPhysicalMaterial({ color: 0x8a8a8a, map: canvasMap(ctx => drawFront(ctx, card)), roughness: 1, metalness: 0, specularIntensity: .12 }));
    return this.fronts.get(card);
  }
  create(role) {
    const root = new THREE.Group(); root.userData.cardRole = role;
    const body = new THREE.Mesh(this.bodyGeometry, this.paper); body.castShadow = true; body.receiveShadow = true;
    const front = new THREE.Mesh(this.faceGeometry, this.back); front.position.z = THICKNESS / 2 + .003; front.receiveShadow = true;
    const back = new THREE.Mesh(this.faceGeometry, this.back); back.position.z = -THICKNESS / 2 - .003; back.rotation.y = Math.PI;
    const display = new THREE.Group(); display.matrixAutoUpdate = false;
    display.add(body, front, back); root.add(display); root.visible = false;
    return { root, display, front, identity: '', animation: null };
  }
}
function rotation(x, y = 0, z = 0) { return new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z)); }

export class TableCards {
  constructor(scene, { animate = true } = {}) {
    this.animate = animate;
    this.factory = new CardFactory(); this.handKey = null; this.seenState = false; this.peeking = false; this.folded = false;
    this.board = Array.from({ length: 5 }, () => this.factory.create('board'));
    this.boardPresentation = new BoardPresentation(this.board);
    this.hole = Array.from({ length: 2 }, () => this.factory.create('hand'));
    this.opponents = Array.from({ length: 8 }, () => Array.from({ length: 2 }, () => this.factory.create('opponent')));
    this.discards = Array.from({ length: 8 }, () => Array.from({ length: 2 }, () => this.factory.create('discard')));
    this.all = [...this.board, ...this.hole, ...this.opponents.flat(), ...this.discards.flat()];
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
  }
  place(card, value, identity, position, quaternion, { animate = false, delay = 0, scale = 1, flip = true } = {}) {
    const changed = card.identity !== identity;
    card.front.material = this.factory.front(value); card.root.scale.setScalar(scale);
    if (changed) {
      card.identity = identity;
      if (animate) {
        card.root.position.copy(DECK);
        card.root.quaternion.copy(quaternion);
        if (flip) card.root.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(X_AXIS, Math.PI));
        card.animation = { start: performance.now() + delay, duration: 660, from: card.root.position.clone(), to: position.clone(), fromQ: card.root.quaternion.clone(), toQ: quaternion.clone(), lift: .35 };
      } else { card.animation = null; card.root.position.copy(position); card.root.quaternion.copy(quaternion); }
    }
    card.root.visible = true;
  }
  update(room, viewerId, positions, focus) {
    const hand = room?.hand, newKey = hand ? `${room.code}:${hand.number}` : null;
    const freshHand = newKey !== this.handKey;
    if (freshHand || !hand) { this.peeking = false; this.boardPresentation.reset(); }
    const allowAnimation = this.seenState && this.animate;
    if (freshHand || !hand) for (const card of this.all) { card.root.visible = false; card.animation = null; card.identity = ''; }
    this.handKey = newKey; this.seenState = true;
    if (!hand) return;
    for (let i = 0; i < 5; i++) {
      if (i >= hand.board.length) { this.board[i].root.visible = false; continue; }
      this.place(this.board[i], hand.board[i], `${newKey}:board:${i}`, new THREE.Vector3((i - 2) * .56, TABLE_Y, BOARD_CENTER_Z), rotation(-Math.PI / 2, 0, (i % 2 ? 1 : -1) * .006), { animate: allowAnimation, delay: (i < 3 ? i : 0) * 130 });
    }
    const me = hand.players.find(p => p.id === viewerId);
    this.folded = !me || me.folded;
    for (let i = 0; i < 2; i++) {
      if (!me || me.cards[i] === null) { this.hole[i].root.visible = false; continue; }
      const side = i ? 1 : -1;
      const position = me.folded ? new THREE.Vector3(-1.0 + i * .13, TABLE_Y + i * .005, 1.45) : new THREE.Vector3(side * .145, TABLE_Y + i * .004, 3.95 + i * .005);
      const quaternion = rotation(!me.folded && this.peeking ? -Math.PI / 2 : Math.PI / 2, 0, side * .1);
      const card = this.hole[i], identity = `${newKey}:own:${i}:${me.folded}`;
      const wasHeld = card.identity && card.identity !== identity && !freshHand;
      if (wasHeld && me.folded) {
        card.animation = { start: performance.now(), duration: 440, from: card.root.position.clone(), to: position.clone(), fromQ: card.root.quaternion.clone(), toQ: quaternion.clone(), lift: .12 };
        card.identity = identity;
      } else this.place(card, me.cards[i], identity, position, quaternion, { animate: allowAnimation && !me.folded, delay: i * 160, scale: .65, flip: false });
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
          const identity = `${newKey}:discard:${player.id}:${i}`;
          if (discarded.identity !== identity) {
            const position = new THREE.Vector3((i ? 1 : -1) * .065, i * .005, i * .025);
            const quaternion = rotation(Math.PI / 2, 0, (i ? 1 : -1) * .18);
            const from = card.root.visible && allowAnimation && !freshHand ? card.root.matrixWorld.clone() : null;
            if (from) { card.root.updateWorldMatrix(true, false); from.copy(card.root.matrixWorld); }
            this.place(discarded, null, identity, position, quaternion, { scale: .65, flip: false });
            if (from) {
              const group = this.discardGroups[local]; group.updateWorldMatrix(true, false);
              const fromPosition = new THREE.Vector3(), fromQ = new THREE.Quaternion(), fromScale = new THREE.Vector3();
              from.premultiply(group.matrixWorld.clone().invert()).decompose(fromPosition, fromQ, fromScale);
              discarded.root.position.copy(fromPosition); discarded.root.quaternion.copy(fromQ); discarded.root.scale.copy(fromScale);
              discarded.animation = { start: performance.now(), duration: 440, from: fromPosition, to: position, fromQ, toQ: quaternion, fromScale, toScale: new THREE.Vector3(.65, .65, .65), lift: .12 };
            }
          }
          discarded.root.visible = true;
        } else { discarded.root.visible = false; discarded.animation = null; }
        if (!player || player.id === viewerId || player.folded) { card.root.visible = false; card.animation = null; continue; }
        const known = player.cards[i] !== null;
        const position = new THREE.Vector3(x * .59, TABLE_Y + i * .003, z * .59).addScaledVector(sideways, (i ? 1 : -1) * .14);
        const q = new THREE.Quaternion().setFromAxisAngle(Y_AXIS, yaw).multiply(rotation(known ? -Math.PI / 2 : Math.PI / 2, 0, i ? .08 : -.08));
        card.root.userData.seat = seat;
        this.place(card, player.cards[i], `${newKey}:other:${player.id}:${i}:${known}`, position, q, { animate: allowAnimation, delay: local * 35 + i * 70, scale: .65 });
      }
    }
  }
  setPeeking(peeking) {
    peeking = !!peeking && !this.folded;
    if (this.peeking === peeking) return;
    this.peeking = peeking;
    for (let i = 0; i < 2; i++) {
      const card = this.hole[i]; if (!card.identity) continue;
      card.root.visible = true;
      card.animation = { start: performance.now(), duration: 240,
        from: card.root.position.clone(), to: new THREE.Vector3((i ? 1 : -1) * .145, TABLE_Y + i * .004, 3.95 + i * .005),
        fromQ: card.root.quaternion.clone(), toQ: rotation(peeking ? -Math.PI / 2 : Math.PI / 2, 0, (i ? 1 : -1) * .1), lift: .27 };
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
    this.boardPresentation.tick(now, camera);
    for (const card of this.hole) {
      card.display.matrix.identity();
      if (this.handDrag > 0 && !this.folded) {
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
