import * as THREE from '/vendor/three.js';

export function addAngryExpression(head, neutral, skin, ink) {
  const angry = new THREE.Group(); angry.visible = false; head.add(angry);
  const box = (width, height, depth, material, x, y, z) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
    mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; angry.add(mesh); return mesh;
  };
  for (const side of [-1, 1]) {
    box(.084, .017, .035, ink, side * .115, .055, .272);
    box(.135, .036, .035, ink, side * .12, .115, .278).rotation.z = side * .5;
  }
  box(.20, .078, .025, ink, 0, -.14, .32);
  box(.158, .045, .014, new THREE.MeshStandardMaterial({ color: 0xe0cfaf, roughness: 1 }), 0, -.14, .34);
  for (const x of [-.04, 0, .04]) box(.007, .044, .009, ink, x, -.14, .352);
  const normal = skin.color.clone(), red = new THREE.Color(0xe04430);
  let current = 0;
  return level => {
    level = Math.max(0, Math.min(3, Math.floor(level) || 0));
    if (current === level) return false;
    current = level; neutral.visible = level === 0; angry.visible = level > 0;
    skin.color.copy(normal).lerp(red, level >= 2 ? level === 3 ? .68 : .48 : 0);
    return true;
  };
}

// One small GPU point draw per angry character. No lights, per-frame allocation,
// raycasts, texture generation, or CPU particle simulation.
export class AngerFlames {
  constructor(head, seed = 0) {
    const positions = new Float32Array(24 * 3); let state = 811 + seed * 97;
    const rand = () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < 24; i++) { positions[i * 3] = (rand() - .5) * .65; positions[i * 3 + 1] = rand(); positions[i * 3 + 2] = (rand() - .5) * .35; }
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.ShaderMaterial({
      uniforms: { time: { value: seed * .37 }, pixelScale: { value: 400 } },
      transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending, toneMapped: false,
      vertexShader: `uniform float time; uniform float pixelScale; varying float fade;
        void main(){float life=fract(time*(.8+abs(position.x)*.5)+position.y);
          vec3 p=vec3(position.x+sin(time*3.+position.y*17.)*.045,.65+life*.85,position.z);
          vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;
          gl_PointSize=clamp((.16+position.y*.1)*(1.-life*.65)*pixelScale/max(.1,-mv.z),1.,64.);
          fade=sin(life*3.14159265);}`,
      fragmentShader: `varying float fade;void main(){vec2 uv=gl_PointCoord;
          float width=mix(.08,.48,uv.y);float edge=1.-smoothstep(.45,1.,abs(uv.x-.5)/width);
          float alpha=edge*sin(uv.y*3.14159265)*fade*.8;if(alpha<.015)discard;
          vec3 color=mix(vec3(1.,.18,.015),vec3(1.,.83,.18),uv.y);
          gl_FragColor=vec4(color,alpha);
          #include <colorspace_fragment>
        }`
    });
    this.points = new THREE.Points(geometry, material); this.points.visible = false; this.points.frustumCulled = false; this.points.renderOrder = -1;
    this.points.raycast = () => {}; head.add(this.points); this.seed = seed; this.level = 0;
  }
  setLevel(level, quality = 'high') {
    this.level = Math.max(0, Math.min(3, level || 0)); this.points.visible = this.level >= 2;
    const count = this.level < 2 ? 0 : quality === 'low' ? this.level === 3 ? 10 : 4 : quality === 'medium' ? this.level === 3 ? 16 : 6 : this.level === 3 ? 24 : 8;
    this.points.geometry.setDrawRange(0, count);
  }
  tick(time, camera, height, pixelRatio) {
    if (!this.points.visible) return;
    this.points.material.uniforms.time.value = time * .001 + this.seed * .37;
    this.points.material.uniforms.pixelScale.value = height * pixelRatio / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
  }
}
