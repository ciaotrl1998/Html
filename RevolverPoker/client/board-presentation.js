import * as THREE from '/vendor/three.js';

// The temporary display layer sits inside the animated, editable card root.
// Layout transforms and dealing continue normally and are never saved as a peek.
export class BoardPresentation {
  constructor(cards, { width = .5, height = .73, thickness = .014 } = {}) {
    this.cards = cards; this.size = [width, height, thickness];
    this.progress = 0; this.target = 0; this.motion = null;
    this.position = new THREE.Vector3(); this.scale = new THREE.Vector3();
    this.baseQuaternion = new THREE.Quaternion(); this.cameraQuaternion = new THREE.Quaternion(); this.quaternion = new THREE.Quaternion();
    this.world = new THREE.Matrix4(); this.rotation = new THREE.Matrix4();
    this.center = new THREE.Vector3(); this.cameraCenter = new THREE.Vector3(); this.point = new THREE.Vector3();
    this.poses = cards.map(() => ({ position: new THREE.Vector3(), base: new THREE.Vector3(), quaternion: new THREE.Quaternion(), scale: new THREE.Vector3(), baseExtent: 0, active: false }));
  }
  advance(now) {
    if (!this.motion) return;
    const t = Math.max(0, Math.min(1, (now - this.motion.start) / 240)), ease = t * t * (3 - 2 * t);
    this.progress = THREE.MathUtils.lerp(this.motion.from, this.target, ease);
    if (t === 1) this.motion = null;
  }
  setRaised(raised, now = performance.now()) {
    this.advance(now);
    const target = raised ? 1 : 0;
    if (target === this.target) return;
    this.target = target; this.motion = { start: now, from: this.progress };
  }
  reset() {
    this.progress = 0; this.target = 0; this.motion = null;
    for (const card of this.cards) { card.display.matrix.identity(); card.display.matrixWorldNeedsUpdate = true; }
  }
  verticalExtent(elements, scale = [1, 1, 1]) {
    return (this.size[0] * Math.abs(elements[1]) * scale[0] + this.size[1] * Math.abs(elements[5]) * scale[1] + this.size[2] * Math.abs(elements[9]) * scale[2]) / 2;
  }
  tick(now, camera) {
    this.advance(now);
    if (this.progress <= 0) {
      for (const card of this.cards) { card.display.matrix.identity(); card.display.matrixWorldNeedsUpdate = true; }
      return;
    }
    if (!camera) return;
    camera.updateWorldMatrix(true, false); camera.getWorldQuaternion(this.cameraQuaternion);
    this.center.set(0, 0, 0); let count = 0;
    for (let i = 0; i < this.cards.length; i++) {
      const card = this.cards[i], pose = this.poses[i]; pose.active = card.root.visible;
      if (!pose.active) continue;
      card.root.updateWorldMatrix(true, false);
      const baseExtent = this.verticalExtent(card.root.matrixWorld.elements);
      card.root.matrixWorld.decompose(this.position, this.baseQuaternion, this.scale);
      this.quaternion.copy(this.baseQuaternion).slerp(this.cameraQuaternion, this.progress);
      this.rotation.makeRotationFromQuaternion(this.quaternion);
      const extent = this.verticalExtent(this.rotation.elements, this.scale.toArray());
      this.position.y += Math.max(0, extent - baseExtent) + .012 * this.progress;
      pose.position.copy(this.position); pose.base.setFromMatrixPosition(card.root.matrixWorld); pose.quaternion.copy(this.quaternion); pose.scale.copy(this.scale); pose.baseExtent = baseExtent;
      this.center.add(pose.position); count++;
    }
    if (!count) return;
    this.center.divideScalar(count); this.cameraCenter.copy(this.center).applyMatrix4(camera.matrixWorldInverse);
    let minDepth = Infinity, radius = 0;
    for (const pose of this.poses) if (pose.active) {
      this.world.compose(pose.position, pose.quaternion, pose.scale);
      for (const x of [-.5, .5]) for (const y of [-.5, .5]) {
        this.point.set(x * this.size[0], y * this.size[1], 0).applyMatrix4(this.world).applyMatrix4(camera.matrixWorldInverse);
        minDepth = Math.min(minDepth, -this.point.z); radius = Math.max(radius, Math.abs(this.point.x - this.cameraCenter.x));
      }
    }
    const available = minDepth * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect * .92 - Math.abs(this.cameraCenter.x);
    const fitted = minDepth > camera.near && available > 0 && radius > 0 ? THREE.MathUtils.clamp(available / radius, .35, 1) : 1;
    const fit = THREE.MathUtils.lerp(1, fitted, this.progress);
    for (let i = 0; i < this.cards.length; i++) {
      const card = this.cards[i], pose = this.poses[i]; if (!pose.active) continue;
      this.position.copy(pose.position).sub(this.center).multiplyScalar(fit).add(this.center);
      this.scale.copy(pose.scale).multiplyScalar(fit); this.rotation.makeRotationFromQuaternion(pose.quaternion);
      const extent = this.verticalExtent(this.rotation.elements, this.scale.toArray());
      this.position.y = pose.base.y + Math.max(0, extent - pose.baseExtent) + .012 * this.progress;
      this.world.compose(this.position, pose.quaternion, this.scale);
      card.display.matrix.copy(card.root.matrixWorld).invert().multiply(this.world);
      card.display.matrixWorldNeedsUpdate = true;
    }
  }
}
