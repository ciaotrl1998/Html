import * as THREE from '/vendor/three.js';
import { mergeGeometries } from './vendor/BufferGeometryUtils.js';
import { createCharacterArms } from './character-actions.js';
import { DEFAULT_VERA_APPEARANCE } from './vera-appearance.js';
import { alternateVeraHair } from './vera-hairstyles.js';
import VeraMeshes from './vera-mesh-data.js';

const templates = new Map();

function geometry(name) {
  if (!templates.has(name)) {
    const attributes = VeraMeshes[name];
    const decode = value => Uint8Array.from(atob(value), character => character.charCodeAt(0)).buffer;
    const mesh = new THREE.BufferGeometry();
    for (const attribute of ['position', 'normal', 'color']) {
      mesh.setAttribute(attribute, new THREE.BufferAttribute(new Float32Array(decode(attributes[attribute])), 3));
    }
    if (attributes.dye) mesh.setAttribute('dye', new THREE.BufferAttribute(new Uint8Array(decode(attributes.dye)), 1));
    mesh.setIndex(new THREE.BufferAttribute(new Uint16Array(decode(attributes.index)), 1));
    templates.set(name, mesh);
  }
  return templates.get(name).clone();
}

function mergeParts(parts) {
  const result = parts.length === 1 ? parts[0] : mergeGeometries(parts);
  if (parts.length > 1) for (const part of parts) part.dispose();
  return result;
}

function mesh(material, ...parts) {
  const object = new THREE.Mesh(mergeParts(parts), material);
  object.castShadow = object.receiveShadow = true;
  return object;
}

function dyeColors(meshGeometry, source, originalColor, selectedColor) {
  const original = new THREE.Color(originalColor), selected = new THREE.Color(selectedColor);
  const r = selected.r / original.r, g = selected.g / original.g, b = selected.b / original.b;
  const { color, dye } = meshGeometry.attributes;
  for (let i = 0; i < color.count; i++) {
    if (dye && !dye.getX(i)) continue;
    color.setXYZ(i, Math.min(1, source.getX(i) * r), Math.min(1, source.getY(i) * g), Math.min(1, source.getZ(i) * b));
  }
  color.needsUpdate = true;
}

function styledHair({ hairstyle, hairColor }) {
  const hair = hairstyle === DEFAULT_VERA_APPEARANCE.hairstyle ? geometry('hair') : alternateVeraHair(hairstyle);
  if (hairColor !== DEFAULT_VERA_APPEARANCE.hairColor) {
    dyeColors(hair, hair.attributes.color, DEFAULT_VERA_APPEARANCE.hairColor, hairColor);
  }
  return mergeParts([hair, geometry('accessories')]);
}

export function createVeraHands(side) {
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .84 });
  // First person faces -Z, so the player's physical right is at positive X.
  const label = side > 0 ? 'Right' : 'Left';
  const fore = geometry(`${label}_Forearm`).scale(1.15, 1.43 * .80 / .89, 1.12)
    .rotateX(-Math.PI / 2).translate(side * .035, -.017, .44);
  const hand = geometry(`${label}_Hand`).scale(1.22, 1.24, 1.45).rotateY(Math.PI).translate(0, .012, -.13);
  return mesh(material, fore, hand);
}

export function createVera(appearance = DEFAULT_VERA_APPEARANCE) {
  const root = new THREE.Group(), head = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .83, side: THREE.DoubleSide });
  const skin = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .89 });
  root.name = '红桃薇拉';
  head.position.y = 3.17;
  const outfit = mesh(material, geometry('outfit'));
  const hair = mesh(material, styledHair(appearance));
  root.add(head, outfit);
  const neutral = mesh(skin, geometry('head'), geometry('neutral'));
  const angry = mesh(skin, geometry('head'), geometry('angry'));
  angry.visible = false;
  head.add(hair, neutral, angry);
  const flushed = new THREE.Color(0xed8b78);
  root.userData.setAnger = level => {
    neutral.visible = !level;
    angry.visible = !!level;
    skin.color.setRGB(1, 1, 1).lerp(flushed, level === 3 ? .61 : level === 2 ? .34 : 0);
  };
  root.userData.head = head;
  const arms = createCharacterArms(root, null, null, {
    shoulderWidth: .425, shoulderHeight: 2.66, shoulderDepth: .025, upperLength: .77, foreLength: .89,
    parts: side => {
      const label = side < 0 ? 'Right' : 'Left';
      return {
        upper: mesh(material, geometry(`${label}_Upper_Arm`)),
        fore: mesh(material, geometry(`${label}_Forearm`)),
        palm: mesh(material, geometry(`${label}_Hand`)),
      };
    },
  });
  const clothing = [[outfit, 'outfit'], [arms.left.upper, 'Left_Upper_Arm'], [arms.right.upper, 'Right_Upper_Arm']];
  const dyeClothing = color => {
    for (const [part, template] of clothing) {
      dyeColors(part.geometry, templates.get(template).attributes.color, DEFAULT_VERA_APPEARANCE.outfitColor, color);
    }
  };
  if (appearance.outfitColor !== DEFAULT_VERA_APPEARANCE.outfitColor) dyeClothing(appearance.outfitColor);
  root.userData.setAppearance = (next = DEFAULT_VERA_APPEARANCE) => {
    if (appearance.hairstyle !== next.hairstyle || appearance.hairColor !== next.hairColor) {
      const replacement = styledHair(next);
      hair.geometry.dispose();
      hair.geometry = replacement;
    }
    if (appearance.outfitColor !== next.outfitColor) dyeClothing(next.outfitColor);
    appearance = next;
  };
  // Seven outfit parts, three hair/accessory parts and a head plus the facial
  // marks for each of the two expressions are batched into four static meshes.
  root.userData.meshBatching = { before: 14, after: 4 };
  return root;
}
