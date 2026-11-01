import * as THREE from '/vendor/three.js';

// Render the actual table characters once. Portraits stay attached to absolute
// seats, independent of the viewer's camera or the table's edited arrangement.
export function createPlayerPortraits(renderer, createCharacter, doc = document, { seats = [0, 1, 2, 3, 4, 5, 6, 7], anger = 0 } = {}) {
  const width = 128, height = 160, target = new THREE.WebGLRenderTarget(width, height);
  target.texture.colorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x282218);
  scene.add(new THREE.HemisphereLight(0xf7dfb4, 0x30251d, 2.4));
  const light = new THREE.DirectionalLight(0xffe0ad, 3.2); light.position.set(-2, 5, 4); scene.add(light);
  const camera = new THREE.PerspectiveCamera(28, width / height, .1, 12);
  camera.position.set(.1, 3.3, 3.4); camera.lookAt(0, 3.22, 0);
  const canvas = doc.createElement('canvas'); canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d'), pixels = new Uint8Array(width * height * 4), image = ctx.createImageData(width, height);
  const previousTarget = renderer.getRenderTarget(), shadows = renderer.shadowMap.enabled;
  const portraits = [];
  try {
    renderer.shadowMap.enabled = false;
    for (const seat of seats) {
      const character = createCharacter(seat); scene.add(character);
      character.userData.setAnger?.(anger);
      try {
        renderer.setRenderTarget(target); renderer.render(scene, camera);
        renderer.readRenderTargetPixels(target, 0, 0, width, height, pixels);
        // GPU rows start at the bottom; ImageData starts at the top.
        for (let y = 0; y < height; y++) image.data.set(pixels.subarray((height - 1 - y) * width * 4, (height - y) * width * 4), y * width * 4);
        ctx.putImageData(image, 0, 0); portraits.push(canvas.toDataURL('image/png'));
      } finally {
        scene.remove(character);
        const geometries = new Set(), materials = new Set();
        character.traverse(node => {
          if (node.geometry) geometries.add(node.geometry);
          for (const material of Array.isArray(node.material) ? node.material : node.material ? [node.material] : []) materials.add(material);
        });
        for (const geometry of geometries) geometry.dispose();
        for (const material of materials) material.dispose();
      }
    }
  } finally {
    renderer.setRenderTarget(previousTarget); renderer.shadowMap.enabled = shadows; target.dispose();
  }
  return portraits;
}

// Keep the status bar usable if WebGL is unavailable.
export function fallbackPortrait(seat) {
  const coat = ['#494336', '#64482f', '#45504a', '#554439', '#3e4140', '#63533e', '#47504a', '#5d4537'][seat % 8];
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 100"><rect width="80" height="100" fill="#282218"/><path d="M8 100V83L25 72H55L72 83V100" fill="${coat}"/><path d="M34 72H46L49 100H30Z" fill="#b8a583"/><path d="M23 37Q22 72 40 76Q58 72 57 37" fill="#b3946d"/><path d="M25 56Q40 ${seat % 3 === 1 ? 69 : 86} 55 56L51 74H29Z" fill="#42382b"/><path d="M29 47H35M45 47H51" stroke="#201c15" stroke-width="3"/><path d="M14 35L25 28L28 10L49 8L56 29L68 35L65 41H17Z" fill="#4a3d29"/><path d="M25 29L56 29" stroke="#b2955d" stroke-width="3"/><path d="M17 3L12 91M64 7L69 95" stroke="#d5bd8a" opacity=".08"/></svg>`)}`;
}
