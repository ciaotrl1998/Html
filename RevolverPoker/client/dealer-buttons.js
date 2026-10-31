import * as THREE from '/vendor/three.js';
import { TABLE_POSITIONS } from './cards.js';
import { NUMBER_FONT } from './typography.js';
import { OPENING_TIMING } from '../shared/deal-timing.js';

export const POSITION_MARKERS = [
  { role: 'BTN', name: '庄家', face: '#e2d1ad', side: 0xb5a17a, ink: '#302619' },
  { role: 'SB', name: '小盲', face: '#39766b', side: 0x2c5b52, ink: '#f5e6bf' },
  { role: 'BB', name: '大盲', face: '#9b503e', side: 0x743b30, ink: '#f5e6bf' }
];
const MARKER_RADIUS = .12, MARKER_HEIGHT = .045, MARKER_SPACING = .28;

function topMaterial(definition, renderer, doc) {
  const canvas = doc.createElement('canvas'); canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = definition.face; ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = definition.ink; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.arc(128, 128, 116, 0, Math.PI * 2); ctx.stroke();
  ctx.globalAlpha = .45; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(128, 128, 103, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
  ctx.fillStyle = definition.ink; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `bold ${definition.role === 'BTN' ? 80 : 96}px ${NUMBER_FONT}`;
  ctx.fillText(definition.role, 128, 135, 205);
  const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = Math.min(8, renderer?.capabilities?.getMaxAnisotropy?.() || 1);
  return new THREE.MeshBasicMaterial({ map, toneMapped: false });
}

export class DealerButtons {
  constructor(saloon, original, doc = document) {
    this.saloon = saloon; this.original = original;
    // Retain the legacy table object and its saved transform, so existing
    // layouts keep their dealer offset without shifting other table IDs.
    original.visible = false; original.userData.editorHidden = true;
    // Rotate the cap UVs so its lettering is upright from the player camera.
    this.geometry = new THREE.CylinderGeometry(MARKER_RADIUS, MARKER_RADIUS, MARKER_HEIGHT, 24).rotateY(Math.PI / 2);
    this.materials = new Map(POSITION_MARKERS.map(definition => {
      const side = new THREE.MeshStandardMaterial({ color: definition.side, roughness: .86, metalness: .04 });
      return [definition.role, [side, topMaterial(definition, saloon.renderer, doc), side]];
    }));
    this.buttons = TABLE_POSITIONS.map(([x, z], local) => {
      const group = new THREE.Group();
      group.position.set(local === 0 ? -.6 : x * .7 + .3, local === 0 ? 1.6 : 1.65, local === 0 ? 3.25 : z * .7);
      group.userData.layout = { id: `dealer-button-${local}`, label: local === 0 ? '自己 · 庄家牌 / 盲注牌（第一人称）' : `座位 ${local + 1} · 庄家牌 / 盲注牌`, category: '筹码与扑克' };
      for (const definition of POSITION_MARKERS) {
        const model = new THREE.Mesh(this.geometry, this.materials.get(definition.role));
        model.name = `${definition.name}牌 ${definition.role}`; model.userData.positionRole = definition.role;
        model.castShadow = original.castShadow; model.receiveShadow = original.receiveShadow;
        group.add(model);
      }
      saloon.scene.add(group);
      group.updateMatrix(); group.userData.dealerBase = group.matrix.clone();
      return group;
    });
    this.update(null, 0);
  }
  applyLayout(layout, registry) {
    const legacy = registry.entries.get(this.original.userData.layoutId);
    const delta = legacy?.wrapper.matrix || new THREE.Matrix4();
    for (const button of this.buttons) {
      const entry = registry.entries.get(button.userData.layoutId);
      const pose = delta.clone().multiply(button.userData.dealerBase);
      const position = new THREE.Vector3(), quaternion = new THREE.Quaternion(), scale = new THREE.Vector3(); pose.decompose(position, quaternion, scale);
      const rotation = new THREE.Euler().setFromQuaternion(quaternion);
      entry.defaults = { position: position.toArray(), rotation: rotation.toArray().slice(0, 3), scale: scale.toArray() };
      if (!layout.objects[entry.id]) {
        entry.proxy.position.copy(position); entry.proxy.quaternion.copy(quaternion); entry.proxy.scale.copy(scale);
      }
      registry.sync(entry);
    }
  }
  update(buttonSeat, focus, smallBlindSeat, bigBlindSeat, opening = null, serverTime = null, now = performance.now()) {
    const local = seat => Number.isInteger(seat) && seat >= 0 && seat < 8 ? (seat - focus + 8) % 8 : -1;
    const seats = { BTN: local(buttonSeat), SB: local(smallBlindSeat), BB: local(bigBlindSeat) };
    // The dealer also posts the small blind heads-up; display only its SB marker.
    if (seats.BTN >= 0 && seats.BTN === seats.SB) seats.BTN = -1;
    const roles = POSITION_MARKERS.map(marker => marker.role).filter(role => seats[role] >= 0);
    const placementKey = !this.saloon.editor && opening && Number.isFinite(serverTime) ? `${opening.hand}:${opening.startedAt}` : null;
    if (placementKey !== this.placementKey) {
      this.placementKey = placementKey;
      this.placement = placementKey ? { start: now - (serverTime - opening.startedAt),
        span: opening.smallBlindAt - opening.startedAt, roles } : null;
    }
    this.buttons.forEach((button, index) => {
      const visible = button.children.filter(model => this.saloon.editor
        ? model.userData.positionRole === POSITION_MARKERS[index % POSITION_MARKERS.length].role
        : seats[model.userData.positionRole] === index);
      button.visible = visible.length > 0;
      for (const model of button.children) {
        const slot = visible.indexOf(model);
        model.userData.positionWanted = slot >= 0; model.visible = slot >= 0;
        model.position.x = slot >= 0 ? (slot - (visible.length - 1) / 2) * MARKER_SPACING : 0;
        model.position.y = 0; model.scale.setScalar(1);
      }
    });
    this.tick(now);
  }
  tick(now) {
    const placement = this.placement;
    if (!placement) return;
    const gap = placement.span / Math.max(1, placement.roles.length), duration = Math.min(OPENING_TIMING.markerDrop, gap);
    for (const group of this.buttons) for (const model of group.children) if (model.userData.positionWanted) {
      const start = placement.start + placement.roles.indexOf(model.userData.positionRole) * gap;
      const t = Math.max(0, Math.min(1, (now - start) / Math.max(1, duration))), ease = 1 - (1 - t) ** 3;
      model.visible = now >= start; model.position.y = .45 * (1 - ease); model.scale.setScalar(.7 + .3 * ease);
    }
    if (now >= placement.start + placement.span) this.placement = null;
  }
}
