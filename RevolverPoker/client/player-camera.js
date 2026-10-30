import * as THREE from '/vendor/three.js';

export function createPlayerCamera() {
  const camera = new THREE.PerspectiveCamera(70, 390 / 844, .1, 80);
  camera.position.set(0, 3.22, 5.35); camera.rotation.set(-.18, 0, 0);
  camera.name = '玩家视角摄像机';
  camera.userData.layout = { id: 'player-camera', label: '玩家视角摄像机', category: '摄像机' };
  return camera;
}

export function createBoardCamera(boardCenterZ = .65) {
  const camera = new THREE.PerspectiveCamera(78, 390 / 844, .1, 80);
  camera.position.set(0, 4.9, boardCenterZ + 2.45);
  camera.rotation.set(Math.atan2(-3.327, 2.45), 0, 0);
  camera.name = '公共牌查看摄像机';
  camera.userData.layout = { id: 'board-camera', label: '公共牌查看摄像机', category: '摄像机' };
  return camera;
}

export function playerCameraPose(camera) {
  camera.updateWorldMatrix(true, false);
  const position = camera.getWorldPosition(new THREE.Vector3());
  const quaternion = camera.getWorldQuaternion(new THREE.Quaternion());
  const rotation = new THREE.Euler().setFromQuaternion(quaternion, 'YXZ');
  return { position, quaternion, pitch: rotation.x, yaw: rotation.y, roll: rotation.z, fov: camera.fov, near: camera.near, far: camera.far };
}

export function copyPlayerCamera(target, source, aspect = target.aspect) {
  const pose = playerCameraPose(source);
  target.position.copy(pose.position); target.quaternion.copy(pose.quaternion);
  target.scale.setScalar(1); target.aspect = aspect; target.fov = pose.fov; target.near = pose.near; target.far = pose.far;
  target.updateProjectionMatrix(); target.updateMatrixWorld(true);
  return pose;
}
