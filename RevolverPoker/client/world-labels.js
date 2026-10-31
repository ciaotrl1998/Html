import * as THREE from '/vendor/three.js';

// Native-resolution canvases follow the same 3D sprite anchors. Lowering the
// scene render buffer never lowers the label/text resolution or touch geometry.
export class WorldLabelLayer {
  constructor(container, scene, camera, pixelRatio = 1) {
    this.scene = scene; this.camera = camera; this.pixelRatio = pixelRatio;
    this.root = document.createElement('div'); this.root.className = 'world-label-layer';
    this.root.setAttribute('aria-hidden', 'true'); container.appendChild(this.root);
    this.labels = []; this.ray = new THREE.Raycaster();
    this.position = new THREE.Vector3(); this.cameraPosition = new THREE.Vector3(); this.scale = new THREE.Vector3();
    this.projected = new THREE.Vector3(); this.center = new THREE.Vector3(); this.up = new THREE.Vector3(); this.origin = new THREE.Vector3();
  }
  register(label) {
    label.sprite.layers.set(1);
    label.canvas.hidden = true; label.screenLabel = { nextCheck: -Infinity, occluded: false };
    this.root.appendChild(label.canvas); this.labels.push(label);
  }
  invalidate() { for (const label of this.labels) label.screenLabel.nextCheck = -Infinity; }
  occluded(point) {
    this.camera.getWorldPosition(this.origin);
    this.ray.set(this.origin, this.projected.copy(point).sub(this.origin).normalize());
    this.ray.far = Math.max(0, this.origin.distanceTo(point) - .025);
    return this.ray.intersectObjects(this.scene.children, true).some(({ object }) => {
      if (!object.isMesh) return false;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      if (materials.every(material => !material.visible || material.transparent && material.opacity < .85)) return false;
      for (let node = object; node; node = node.parent) if (!node.visible) return false;
      return true;
    });
  }
  update(time, width, height) {
    if (!(width > 0 && height > 0)) return;
    this.camera.updateMatrixWorld();
    this.up.setFromMatrixColumn(this.camera.matrixWorld, 1).normalize();
    const factor = height / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)));
    const round = value => Math.round(value * this.pixelRatio) / this.pixelRatio;
    for (const label of this.labels) {
      const { sprite, canvas, screenLabel: state } = label;
      let visible = true;
      for (let node = sprite; node; node = node.parent) if (!node.visible) { visible = false; break; }
      if (!visible) { canvas.hidden = true; continue; }
      sprite.getWorldPosition(this.position); this.cameraPosition.copy(this.position).applyMatrix4(this.camera.matrixWorldInverse);
      if (this.cameraPosition.z >= -.001) { canvas.hidden = true; continue; }
      sprite.getWorldScale(this.scale);
      const w = this.scale.x * factor / -this.cameraPosition.z, h = this.scale.y * factor / -this.cameraPosition.z;
      this.projected.copy(this.position).project(this.camera);
      const x = (this.projected.x + 1) * width / 2 - w * sprite.center.x;
      const y = (1 - this.projected.y) * height / 2 - h * (1 - sprite.center.y);
      if (this.projected.z < -1 || this.projected.z > 1 || x + w < 0 || x > width || y + h < 0 || y > height) { canvas.hidden = true; continue; }
      if (time >= state.nextCheck) {
        this.center.copy(this.position).addScaledVector(this.up, this.scale.y * (.5 - sprite.center.y));
        state.occluded = this.occluded(this.center); state.nextCheck = time + 200;
      }
      canvas.hidden = state.occluded;
      if (state.occluded) continue;
      const values = { width: `${round(w)}px`, height: `${round(h)}px`, transform: `translate3d(${round(x)}px, ${round(y)}px, 0)`,
        opacity: String(sprite.material.opacity), zIndex: String(Math.round(100000 / -this.cameraPosition.z)) };
      for (const [key, value] of Object.entries(values)) if (canvas.style[key] !== value) canvas.style[key] = value;
    }
  }
}
