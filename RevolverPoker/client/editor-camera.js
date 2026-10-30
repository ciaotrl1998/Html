import * as THREE from '/vendor/three.js';
import { copyPlayerCamera } from './player-camera.js';

export class EditorCameraPreview {
  constructor(saloon, panel, frame) {
    this.saloon = saloon; this.panel = panel; this.frame = frame;
    this.cameras = new Map([['player-camera', saloon.playerCamera], ['board-camera', saloon.boardCamera]]);
    this.camera = saloon.playerCamera; this.visuals = new Map();
    this.preview = new THREE.PerspectiveCamera();
    for (const [id, camera] of this.cameras) {
      const icon = new THREE.Group(); camera.add(icon);
      const material = new THREE.MeshBasicMaterial({ color: id === 'board-camera' ? 0xe1b66b : 0x81c4eb, toneMapped: false });
      const body = new THREE.Mesh(new THREE.BoxGeometry(.28, .18, .2), material); body.position.z = .06;
      const lens = new THREE.Mesh(new THREE.CylinderGeometry(.075, .1, .18, 8), material); lens.rotation.x = Math.PI / 2; lens.position.z = -.12;
      const top = new THREE.Mesh(new THREE.BoxGeometry(.12, .05, .07), material); top.position.set(0, .12, .06);
      icon.add(body, lens, top);
      const guide = new THREE.PerspectiveCamera(), frustum = new THREE.CameraHelper(guide);
      frustum.material.depthTest = false; frustum.material.transparent = true; frustum.material.opacity = .6;
      saloon.scene.add(frustum); frustum.visible = false;
      this.visuals.set(id, { camera, icon, guide, frustum });
    }
    this.aspect = 390 / 844; this.visible = false;
  }
  update(selectedId, viewId, enabled, sourceId = 'player-camera') {
    for (const [id, visual] of this.visuals) {
      const position = visual.camera.getWorldPosition(new THREE.Vector3());
      visual.icon.visible = viewId !== id && this.saloon.camera.position.distanceTo(position) > .5;
      visual.frustum.visible = selectedId === id && viewId !== id;
      if (visual.frustum.visible) {
        copyPlayerCamera(visual.guide, visual.camera, this.aspect);
        visual.guide.far = Math.max(visual.guide.near * 1.1, Math.min(visual.guide.far, 4.5)); visual.guide.updateProjectionMatrix(); visual.frustum.update();
      }
    }
    this.camera = this.cameras.get(sourceId) || this.saloon.playerCamera;
    this.visible = !!enabled;
    this.panel.hidden = !this.visible;
    if (!this.visible) return;
    copyPlayerCamera(this.preview, this.camera, this.aspect);
    const height = Math.max(100, Math.min(300, this.saloon.container.clientHeight * .5));
    const width = `${height * this.aspect}px`, h = `${height}px`;
    if (this.panel.style.width !== width) this.panel.style.width = width;
    if (this.frame.style.height !== h) this.frame.style.height = h;
  }
  render() {
    if (!this.visible) return;
    const saloon = this.saloon, renderer = saloon.renderer;
    const canvas = renderer.domElement.getBoundingClientRect(), frame = this.frame.getBoundingClientRect();
    const x = frame.left - canvas.left, y = canvas.bottom - frame.bottom;
    if (frame.width <= 0 || frame.height <= 0 || y < 0) return;
    const objects = [...this.visuals.values()].flatMap(visual => [visual.icon, visual.frustum]).concat(this.editorHelpers);
    const visible = objects.map(object => object.visible);
    const shell = this.shellObjects || [], shellVisible = shell.map(object => object.visible);
    try {
      objects.forEach(object => object.visible = false);
      shell.forEach(object => object.visible = true);
      renderer.setViewport(x, y, frame.width, frame.height); renderer.setScissor(x, y, frame.width, frame.height); renderer.setScissorTest(true);
      renderer.render(saloon.scene, this.preview);
    } finally {
      objects.forEach((object, i) => object.visible = visible[i]);
      shell.forEach((object, i) => object.visible = shellVisible[i]);
      renderer.setScissorTest(false); renderer.setViewport(0, 0, canvas.width, canvas.height);
    }
  }
}
