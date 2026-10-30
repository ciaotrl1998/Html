import * as THREE from '/vendor/three.js';
import { mergeGeometries } from './vendor/BufferGeometryUtils.js';

// Merge only untagged sibling leaves. Animated heads and editable roots retain
// their hierarchy, transforms and hit targets; distinct materials stay distinct.
export function batchStaticMeshes(root) {
  const parents = []; root.traverse(node => parents.push(node));
  let before = 0, after = 0;
  for (const parent of parents.reverse()) {
    const groups = new Map();
    for (const mesh of [...parent.children]) {
      if (!mesh.isMesh || mesh.children.length || Array.isArray(mesh.material) ||
          Object.keys(mesh.userData).length || mesh.morphTargetInfluences || mesh.material.transparent || !mesh.visible) continue;
      mesh.updateMatrix();
      if (mesh.matrix.determinant() <= 0) continue;
      const attributes = Object.entries(mesh.geometry.attributes).map(([key, attr]) => `${key}:${attr.itemSize}:${attr.normalized}:${attr.array.constructor.name}`).sort().join('|');
      const key = `${mesh.material.uuid}:${mesh.castShadow}:${mesh.receiveShadow}:${mesh.renderOrder}:${mesh.layers.mask}:${mesh.frustumCulled}:${!!mesh.geometry.index}:${attributes}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(mesh);
    }
    for (const meshes of groups.values()) {
      before += meshes.length; after++;
      if (meshes.length < 2) continue;
      const copies = meshes.map(mesh => mesh.geometry.clone().applyMatrix4(mesh.matrix));
      const geometry = mergeGeometries(copies, false);
      copies.forEach(copy => copy.dispose());
      if (!geometry) { after += meshes.length - 1; continue; }
      geometry.computeBoundingSphere();
      const first = meshes[0], batch = new THREE.Mesh(geometry, first.material);
      batch.castShadow = first.castShadow; batch.receiveShadow = first.receiveShadow;
      batch.renderOrder = first.renderOrder; batch.layers.mask = first.layers.mask;
      batch.frustumCulled = first.frustumCulled;
      parent.remove(...meshes); parent.add(batch);
    }
  }
  return { before, after };
}
