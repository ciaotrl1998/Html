import * as THREE from '/vendor/three.js';
import { EMPTY_LAYOUT, validateLayout } from '/shared/scene-layout.js';

const snapshot = object => ({ position: object.position.toArray(), rotation: object.rotation.toArray().slice(0, 3), scale: object.scale.toArray() });
const set = (object, t) => { object.position.fromArray(t.position); object.rotation.set(...t.rotation); object.scale.fromArray(t.scale); object.updateMatrix(); };

// Apply edits outside the animated node: dealing, breathing and state updates
// continue inside this wrapper and cannot overwrite the saved arrangement.
export class LayoutRegistry {
  constructor() { this.entries = new Map(); this.current = EMPTY_LAYOUT; }
  register(node, id, label, category) {
    const parent = node.parent;
    const proxy = new THREE.Object3D(); proxy.name = `编辑锚点 ${label}`;
    set(proxy, node.userData.layoutBase || snapshot(node));
    const defaults = snapshot(proxy), inverseBase = proxy.matrix.clone().invert();
    const wrapper = new THREE.Group(); wrapper.name = label; wrapper.matrixAutoUpdate = false;
    parent.add(wrapper, proxy); wrapper.add(node);
    const defaultsCamera = node.isPerspectiveCamera ? { fov: node.fov, near: node.near, far: node.far } : null;
    const entry = { id, label, category, node, proxy, wrapper, defaults, defaultsCamera, inverseBase };
    node.userData.layoutId = id;
    this.entries.set(id, entry);
    return entry;
  }
  sync(entry) {
    entry.proxy.scale.clampScalar(.01, 100);
    entry.proxy.updateMatrix();
    entry.wrapper.matrix.multiplyMatrices(entry.proxy.matrix, entry.inverseBase);
    entry.wrapper.matrixWorldNeedsUpdate = true;
    if (entry.defaultsCamera) entry.node.updateProjectionMatrix();
  }
  apply(layout) {
    this.current = validateLayout(layout);
    for (const entry of this.entries.values()) {
      if (entry.defaultsCamera) Object.assign(entry.node, this.current.objects[entry.id]?.camera || entry.defaultsCamera);
      set(entry.proxy, this.current.objects[entry.id] || entry.defaults); this.sync(entry);
    }
    this.onApply?.();
  }
  export() {
    const objects = {};
    for (const entry of this.entries.values()) {
      const value = snapshot(entry.proxy);
      let changed = ['position', 'rotation', 'scale'].some(key => value[key].some((v, i) => Math.abs(v - entry.defaults[key][i]) > 1e-6));
      if (entry.defaultsCamera) {
        value.camera = { fov: entry.node.fov, near: entry.node.near, far: entry.node.far };
        changed ||= Object.keys(value.camera).some(key => value.camera[key] !== entry.defaultsCamera[key]);
      }
      if (changed) objects[entry.id] = value;
    }
    return validateLayout({ version: 1, objects });
  }
  reset(entry) { if (entry.defaultsCamera) Object.assign(entry.node, entry.defaultsCamera); set(entry.proxy, entry.defaults); this.sync(entry); }
}
