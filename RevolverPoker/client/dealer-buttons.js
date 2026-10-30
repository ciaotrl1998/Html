import * as THREE from '/vendor/three.js';
import { TABLE_POSITIONS } from './cards.js';

export class DealerButtons {
  constructor(saloon, original) {
    this.saloon = saloon; this.original = original;
    // Retain the legacy table object and its saved transform, so existing
    // layouts keep their dealer offset without shifting other table IDs.
    original.visible = false; original.userData.editorHidden = true;
    this.buttons = TABLE_POSITIONS.map(([x, z], local) => {
      const group = new THREE.Group();
      group.position.set(local === 0 ? -.6 : x * .7 + .3, local === 0 ? 1.6 : 1.65, local === 0 ? 3.25 : z * .7);
      group.userData.layout = { id: `dealer-button-${local}`, label: local === 0 ? '自己 · 庄家牌（第一人称）' : `座位 ${local + 1} · 庄家牌`, category: '筹码与扑克' };
      const model = new THREE.Mesh(original.geometry, original.material); model.castShadow = original.castShadow; model.receiveShadow = original.receiveShadow;
      group.add(model); saloon.scene.add(group);
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
  update(buttonSeat, focus) {
    const local = Number.isInteger(buttonSeat) && buttonSeat >= 0 && buttonSeat < 8 ? (buttonSeat - focus + 8) % 8 : -1;
    this.buttons.forEach((button, index) => { button.visible = this.saloon.editor || index === local; });
  }
}
