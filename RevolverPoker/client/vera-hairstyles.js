import * as THREE from '/vendor/three.js';
import { mergeGeometries } from './vendor/BufferGeometryUtils.js';
import { DEFAULT_VERA_APPEARANCE } from './vera-appearance.js';

const TURN = 2 * Math.PI;
const pigment = new THREE.Color(DEFAULT_VERA_APPEARANCE.hairColor);

function strands(rows, sides, sample) {
  const positions = [], colors = [], indices = [];
  for (let row = 0; row <= rows; row++) {
    for (let side = 0; side < sides; side++) {
      const [x, y, z, shade] = sample(row / rows, side / sides * TURN);
      positions.push(x, y, z);
      colors.push(pigment.r * shade, pigment.g * shade, pigment.b * shade);
      if (row === rows) continue;
      const a = row * sides + side, b = row * sides + (side + 1) % sides;
      indices.push(a, b, a + sides, b, b + sides, a + sides);
    }
  }
  const result = new THREE.BufferGeometry();
  result.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  result.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  result.setIndex(indices);
  result.computeVertexNormals();
  return result;
}

// The upper rings narrow into the crown. A tucked rim returns the lower edge
// into the scalp so the hair has a continuous underside in profile.
function cap(edgeHeight, width, top, tuck = 0) {
  const rows = 6 + Number(tuck > 0);
  return strands(rows, 22, (progress, angle) => {
    const row = Math.round(progress * rows), inner = tuck > 0 && row === 0;
    const t = Math.max(0, row - Number(tuck > 0)) / 6;
    const c = Math.cos(angle), s = Math.sin(angle);
    const y = THREE.MathUtils.lerp(edgeHeight(angle), top, t);
    const radius = Math.sqrt(Math.max(.00001, 1 - ((y - .026) / (top - .026)) ** 2));
    const widthScale = radius * (1 + .016 * Math.cos(8 * angle + 2 * t)) * (inner ? 1 - tuck : 1);
    return [s * width * widthScale, y + (inner ? .018 : 0), -.024 + c * (c > 0 ? .395 : .420) * widthScale,
      inner ? .72 : .88 + .13 * Math.sin(t * Math.PI) + .06 * Math.cos(8 * angle + 2 * t)];
  });
}

// Sculpt a few broad locks with sparse cross-sections. Width and depth follow
// the control points, and the braided version adds raised, interleaved ridges.
function lock(points, light, sides = 8, steps = 10, braids = 0) {
  const curve = new THREE.CatmullRomCurve3(points.map(([x, y, z]) => new THREE.Vector3(x, y, z)));
  const frames = Array.from({ length: steps + 1 }, (_, i) => {
    const t = i / steps, tangent = curve.getTangent(t);
    const guide = Math.abs(tangent.z) > .95 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1);
    const across = tangent.clone().cross(guide).normalize();
    const pos = curve.getPoint(t), front = across.clone().cross(tangent).normalize();
    const index = t * (points.length - 1), from = Math.min(Math.floor(index), points.length - 2);
    const width = THREE.MathUtils.lerp(points[from][3], points[from + 1][3], index - from);
    const depth = THREE.MathUtils.lerp(points[from][4], points[from + 1][4], index - from);
    return { pos, across, front, width, depth };
  });
  return strands(steps, sides, (t, angle) => {
    const { pos, across, front, width, depth } = frames[Math.round(t * steps)];
    const fold = braids ? Math.cos(TURN * braids * t + 2 * angle) : 0;
    const vertex = pos.clone()
      .addScaledVector(across, width * Math.sin(angle) * (1 + .21 * fold))
      .addScaledVector(front, depth * Math.cos(angle) * (1 + .24 * fold));
    return [vertex.x, vertex.y, vertex.z, light * (.83 + .21 * Math.max(0, Math.cos(angle - .40)) + .14 * fold)];
  });
}

function bob() {
  const outer = cap(angle => {
    const front = THREE.MathUtils.smoothstep(Math.cos(angle), .47, .88);
    return -.203 + .444 * front - .031 * Math.sin(angle) + .019 * Math.cos(3 * angle);
  }, .343, .441);
  const fringe = lock([[.139,.322,.202,.019,.022], [.058,.346,.277,.083,.066],
    [-.108,.274,.277,.108,.081], [-.228,.186,.231,.091,.078], [-.306,.046,.190,.083,.065],
    [-.301,-.081,.177,.068,.055], [-.250,-.176,.163,.034,.036], [-.231,-.167,.192,.005,.005]], 1.16, 9, 13);
  const tucked = lock([[.122,.352,.207,.011,.013], [.228,.268,.198,.073,.074],
    [.319,.125,.143,.089,.066], [.349,-.021,.079,.073,.061], [.326,-.131,.097,.049,.049],
    [.285,-.152,.126,.006,.006]], 1.02, 8, 11);
  const nape = lock([[-.253,.158,-.190,.011,.013], [-.303,.043,-.202,.055,.046],
    [-.303,-.132,-.181,.052,.053], [-.232,-.232,-.161,.025,.035], [-.197,-.208,-.157,.005,.006]], .88, 7, 9);
  const backWave = lock([[.014,.401,-.164,.012,.014], [.087,.337,-.250,.052,.041],
    [.158,.228,-.333,.083,.049], [.199,.075,-.362,.073,.044], [.190,-.102,-.337,.048,.039],
    [.161,-.167,-.301,.006,.007]], 1.07, 8, 10);
  return [outer, fringe, tucked, nape, backWave];
}

function braid() {
  const scalp = cap(angle => {
    const c = Math.cos(angle);
    const temple = .041 + .190 * THREE.MathUtils.smoothstep(c, .18, .88);
    return THREE.MathUtils.lerp(-.260, temple, THREE.MathUtils.smoothstep(c, -.39, -.025));
  }, .325, .428, .30);
  const twist = lock([[-.275,.105,.116,.010,.012], [-.281,.201,.204,.046,.043],
    [-.181,.337,.258,.056,.057], [-.057,.379,.275,.060,.052], [.076,.374,.249,.063,.049],
    [.205,.308,.203,.060,.050], [.287,.175,.132,.051,.039], [.294,.100,.015,.035,.027],
    [.223,.215,-.135,.038,.037], [.122,.331,-.176,.007,.009]], 1.16, 8, 26, 7);
  const sweep = lock([[-.277,.116,.044,.008,.010], [-.261,.200,-.089,.055,.053],
    [-.180,.333,-.132,.086,.060], [-.090,.397,-.174,.085,.064], [.028,.454,-.234,.046,.050]], .99, 8, 11);
  const roll = strands(7, 12, (t, angle) => {
    const radius = Math.max(.004, Math.sin(t * Math.PI));
    return [.035 + .179 * Math.sin(angle) * radius, .451 - .172 * Math.cos(t * Math.PI),
      -.232 + .173 * Math.cos(angle) * radius, .88 + .18 * Math.sin(t * Math.PI)];
  });
  const coil = lock([[.035,.366,-.118,.009,.011], [.159,.390,-.123,.041,.039], [.215,.484,-.194,.054,.048],
    [.122,.594,-.289,.051,.044], [-.021,.595,-.350,.054,.044], [-.142,.522,-.330,.048,.046],
    [-.155,.425,-.241,.046,.043], [-.081,.381,-.140,.039,.035], [.022,.413,-.111,.010,.013]], 1.10, 8, 24, 6);
  return [scalp, sweep, roll, coil, twist];
}

const templates = new Map();

export function alternateVeraHair(name) {
  if (!templates.has(name)) {
    const parts = name === 'bob' ? bob() : braid();
    templates.set(name, mergeGeometries(parts));
    for (const part of parts) part.dispose();
  }
  return templates.get(name).clone();
}
