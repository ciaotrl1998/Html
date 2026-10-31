import * as THREE from '/vendor/three.js';
import SAVED_SCENE from './scene-layout.js';
import { FrameClock } from './frame-clock.js';
import { RenderBudget } from './render-budget.js';
import { batchStaticMeshes } from './mesh-batching.js';
import { TableCards, BOARD_CENTER_Z, TABLE_POSITIONS as POSITIONS } from './cards.js';
import { LayoutRegistry } from './layout-registry.js';
import { createPlayerCamera, createBoardCamera, playerCameraPose } from './player-camera.js';
import { settlementLabel, paintSettlementLabel, settlementLabelHeight, paintWinLabel } from './settlement-label.js';
import { SceneViewControls } from './view-controls.js';
import { TableActions } from './table-actions.js';
import { TableBetView } from './table-bet-view.js';
import { TablePotView } from './table-pot-view.js';
import { SeatActionLabels, paintSeatNameplate } from './seat-label.js';
import { DealerButtons } from './dealer-buttons.js';
import { dealKey } from '../shared/deal-timing.js';
import { createPlayerPortraits } from './player-portraits.js';

const COLORS = [0x4a4437, 0x5f3e2c, 0x3a4540, 0x57453c, 0x383c3e, 0x60503c, 0x434e42, 0x563b32];
const OVERVIEW_EYE = [0, 8.8, 10.5];
function texture(draw, size = 512) {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
  draw(canvas.getContext('2d'), size);
  const t = new THREE.CanvasTexture(canvas); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function woodTexture() {
  return texture((ctx, n) => {
    ctx.fillStyle = '#49301d'; ctx.fillRect(0, 0, n, n);
    let seed = 736;
    const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < 3500; i++) {
      ctx.strokeStyle = `rgba(${rand() > .5 ? '145,100,58' : '15,9,5'},${rand() * .16})`;
      const y = rand() * n; ctx.lineWidth = rand() * 2; ctx.beginPath(); ctx.moveTo(0, y);
      ctx.bezierCurveTo(n / 3, y + rand() * 12, n * .6, y - rand() * 12, n, y + rand() * 5); ctx.stroke();
    }
    for (let y = 0; y < n; y += 85) { ctx.fillStyle = '#120c0877'; ctx.fillRect(0, y, n, 3); }
  });
}
function feltTexture() {
  return texture((ctx, n) => {
    ctx.fillStyle = '#254133'; ctx.fillRect(0, 0, n, n);
    for (let i = 0; i < 15000; i++) { ctx.fillStyle = i % 2 ? '#aec9990b' : '#00100016'; ctx.fillRect((i * 137.17) % n, (i * 79.37) % n, 2, 1); }
    ctx.strokeStyle = '#b7b28a44'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(n / 2, n / 2, n * .41, n * .41, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#c2bc9066'; ctx.textAlign = 'center'; ctx.font = 'bold 25px Georgia'; ctx.fillText('R E V O L V E R', n / 2, n * .72);
    ctx.font = '13px Georgia'; ctx.fillText('T E X A S   H O L D ’ E M', n / 2, n * .76);
    ctx.font = '32px Georgia'; ctx.fillText('♠', n / 2, n * .67);
  });
}
const material = (color, options = {}) => new THREE.MeshStandardMaterial({ color, roughness: .87, ...options });
function mesh(geo, mat, x = 0, y = 0, z = 0) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; return m; }
function box(parent, w, h, d, mat, x, y, z) { const m = mesh(new THREE.BoxGeometry(w, h, d), mat, x, y, z); parent.add(m); return m; }
function cylinder(parent, r1, r2, h, mat, x, y, z, sides = 16) { const m = mesh(new THREE.CylinderGeometry(r1, r2, h, sides), mat, x, y, z); parent.add(m); return m; }

function makePerson(index) {
  const root = new THREE.Group();
  const skin = material([0xc38f64, 0xaa7550, 0xb7865f, 0xd0a378][index % 4]);
  const coat = material(COLORS[index]), shirt = material(0xb6a68a), dark = material(0x261d16), hatMat = material(index % 3 === 0 ? 0x26231e : 0x614831);
  box(root, .85, 1.05, .5, coat, 0, 2.08, 0);
  const shoulder = mesh(new THREE.SphereGeometry(.48, 10, 6), coat, 0, 2.58, 0); shoulder.scale.set(1.16, .5, .68); root.add(shoulder);
  box(root, .26, .73, .018, shirt, 0, 2.18, .26);
  const lapel1 = box(root, .15, .69, .05, dark, -.19, 2.22, .29); lapel1.rotation.z = -.17;
  const lapel2 = box(root, .15, .69, .05, dark, .19, 2.22, .29); lapel2.rotation.z = .17;
  for (let k = 0; k < 3; k++) cylinder(root, .024, .024, .025, material(0x9d8350, { metalness: .6 }), .02, 2.32 - k * .18, .3).rotation.x = Math.PI / 2;
  cylinder(root, .15, .17, .24, skin, 0, 2.83, 0);
  const head = new THREE.Group(); head.position.y = 3.17; root.add(head);
  const face = mesh(new THREE.SphereGeometry(.33, 10, 8), skin); face.scale.set(.85, 1.12, .87); head.add(face);
  box(head, .08, .13, .11, skin, 0, -.01, .29);
  const eyes = material(0x171511);
  for (const side of [-1, 1]) {
    box(head, .075, .024, .035, eyes, side * .115, .065, .258);
    const brow = box(head, .10, .035, .035, dark, side * .12, .116, .26); brow.rotation.z = side * -.1;
    const ear = mesh(new THREE.SphereGeometry(.078, 7, 5), skin, side * .28, -.015, 0); head.add(ear);
  }
  box(head, .12, .018, .025, dark, 0, -.16, .26);
  if (index % 3 !== 1) {
    const beard = mesh(new THREE.SphereGeometry(.275, 8, 6), material(index % 2 ? 0x3a2a20 : 0x554b3d), 0, -.17, .03); beard.scale.set(.93, .62, 1); head.add(beard);
    box(head, .22, .045, .05, dark, 0, -.12, .28);
  }
  const brim = cylinder(head, .59, .59, .055, hatMat, 0, .28, 0, 12); brim.scale.z = .8;
  cylinder(head, .29, .34, .38, hatMat, 0, .47, 0, 10);
  cylinder(head, .335, .35, .075, dark, 0, .32, 0, 10);
  for (const side of [-1, 1]) {
    const upper = cylinder(root, .14, .16, .68, coat, side * .5, 2.17, .16, 8); upper.rotation.z = side * .26; upper.rotation.x = -.6;
    const fore = cylinder(root, .12, .14, .7, coat, side * .47, 1.8, .61, 8); fore.rotation.x = Math.PI / 2;
    const hand = mesh(new THREE.SphereGeometry(.14, 8, 6), skin, side * .47, 1.8, .96); hand.scale.set(1.1, .55, 1.4); root.add(hand);
  }
  root.userData.head = head;
  root.userData.meshBatching = batchStaticMeshes(root);
  return root;
}
function chair(wood) {
  const g = new THREE.Group();
  box(g, 1.12, .17, .92, wood, 0, .84, 0);
  for (const x of [-.45, .45]) for (const z of [-.34, .34]) box(g, .12, .9, .12, wood, x, .42, z);
  for (const x of [-.46, .46]) box(g, .12, 1.6, .12, wood, x, 1.52, -.38);
  box(g, 1.1, .23, .14, wood, 0, 2.27, -.38);
  box(g, .13, .9, .12, wood, 0, 1.7, -.38);
  g.userData.meshBatching = batchStaticMeshes(g);
  return g;
}

export class SaloonScene {
  constructor(container, { editor = false, followOtherPlayers = true, frameRate = 60 } = {}) {
    this.editor = editor;
    this.followOtherPlayers = followOtherPlayers;
    this.frameClock = new FrameClock(frameRate); this.shadowClock = new FrameClock(30);
    this.renderBudget = new RenderBudget({ pixelRatio: devicePixelRatio, mobile: !!window.matchMedia?.('(pointer: coarse)').matches, editor });
    this.shadowDirty = true; this.lastShadowUpdate = -Infinity;
    this.container = container; this.models = []; this.chairs = []; this.piles = []; this.markers = []; this.labels = []; this.focus = 0; this.seated = false;
    this.room = null; this.viewerId = null; this.yaw = 0; this.pitch = 0; this.roll = 0;
    this.overviewPitch = Math.atan2(1.9 - OVERVIEW_EYE[1], OVERVIEW_EYE[2]);
    this.raycaster = new THREE.Raycaster(); this.pointer = new THREE.Vector2();
    this.labelPosition = new THREE.Vector3();
    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color(0x211a11); this.scene.fog = new THREE.FogExp2(0x261d11, .027);
    this.camera = new THREE.PerspectiveCamera(53, 1, .1, 80);
    this.camera.position.set(...OVERVIEW_EYE); this.camera.lookAt(0, 1.9, 0);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.pixelRatio = this.renderBudget.ratio;
    this.renderer.setPixelRatio(this.pixelRatio); this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.autoUpdate = editor; this.renderer.shadowMap.needsUpdate = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap; this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.28;
    container.appendChild(this.renderer.domElement);
    this.scene.add(new THREE.HemisphereLight(0xd7bb87, 0x3a2e22, 2.0));
    const key = new THREE.SpotLight(0xffd294, 340, 35, Math.PI / 3, .65, 1.8);
    this.keyLight = key;
    key.position.set(1, 10, 3); key.target.position.set(0, 1, 0); key.castShadow = true; key.shadow.mapSize.set(1024, 1024); key.shadow.bias = -.002;
    this.scene.add(key, key.target);
    const fill = new THREE.PointLight(0xd3a464, 65, 25, 1.6); fill.position.set(-7, 5, -4); this.scene.add(fill);
    const cold = new THREE.PointLight(0x8a9d9c, 35, 22, 1.7); cold.position.set(5, 5, -8); this.scene.add(cold);
    this.wood = material(0xc6a16d, { map: woodTexture() });
    this.darkWood = material(0x64452d, { map: this.wood.map });
    this.brass = material(0xaa8850, { roughness: .43, metalness: .75 });
    let start = this.scene.children.length;
    this.buildRoom(); this.tagEditables(start, 'room', '酒馆');
    start = this.scene.children.length;
    this.buildTable(); this.tagEditables(start, 'table', '牌桌与道具');
    this.dealerButtons = new DealerButtons(this, this.dealer);
    this.buildHands(); this.hands.userData.layout = { id: 'player-hands', label: '自己的双臂', category: '玩家与座位' };
    this.cards = new TableCards(this.scene, { animate: !editor });
    for (let i = 0; i < 8; i++) {
      const [x, z] = POSITIONS[i];
      const a = chair(this.wood); a.position.set(x * 1.07, 0, z * 1.07); a.rotation.y = Math.atan2(-x, -z); this.scene.add(a); this.chairs.push(a);
      a.userData.layout = { id: `chair-${i}`, label: `座位 ${i + 1} · 椅子`, category: '玩家与座位' };
      const model = makePerson(i); model.position.set(x, 0, z); model.rotation.y = Math.atan2(-x, -z); this.scene.add(model); this.models.push(model);
      model.userData.layout = { id: `person-${i}`, label: `座位 ${i + 1} · 人物`, category: '玩家与座位' };
      this.labels.push(this.makeSeatLabel());
      const pile = this.makeChips(i); pile.position.set(x * .70, 1.56, z * .70); this.scene.add(pile); this.piles.push(pile);
      if (i === 0) pile.position.set(-1.05, 1.56, 3.75);
      pile.userData.layout = { id: `chips-${i}`, label: i === 0 ? '自己 · 筹码堆' : `座位 ${i + 1} · 筹码堆`, category: '筹码与扑克' };
      const ring = mesh(new THREE.RingGeometry(.49, .53, 40), new THREE.MeshBasicMaterial({ color: 0xe6c27c, transparent: true, opacity: .7, side: THREE.DoubleSide }), x * .78, 1.55, z * .78);
      ring.rotation.x = -Math.PI / 2; ring.visible = false; this.scene.add(ring); this.markers.push(ring);
    }
    this.playerCamera = createPlayerCamera(); this.scene.add(this.playerCamera);
    this.boardCamera = createBoardCamera(BOARD_CENTER_Z); this.cards.boardGroup.add(this.boardCamera);
    this.layout = new LayoutRegistry();
    const editables = [];
    this.scene.traverse(node => { if (node.userData.layout) editables.push(node); });
    for (const node of editables) { const { id, label, category } = node.userData.layout; this.layout.register(node, id, label, category); }
    let cameraState = '';
    this.layout.onApply = () => {
      this.shadowDirty = true;
      this.dealerButtons.applyLayout(this.layout.current, this.layout);
      const pose = playerCameraPose(this.playerCamera);
      const state = JSON.stringify([pose.position.toArray(), pose.quaternion.toArray(), pose.fov, pose.near, pose.far]);
      if (cameraState && cameraState !== state && !this.editor && this.firstPerson) this.resetView();
      cameraState = state;
    };
    this.betView = new TableBetView(this);
    this.potView = new TablePotView(this, this.betView);
    // Register every anchor, including chips and pot labels, before applying
    // the saved scene synchronously. No frame or layout request precedes it.
    this.layout.apply(SAVED_SCENE);
    if (!editor) {
      this.actionConnected = true;
      this.tableActions = new TableActions({
        send: (type, amount, key) => this.onPokerAction?.(type, amount, key) ?? false,
        change: state => {
          const previous = this.betView.state;
          this.betView.setState(state);
          if (['pending', 'remaining', 'inFlight'].some(key => state[key] !== previous[key])) this.shadowDirty = true;
        }, commit: action => this.betView.commit(action),
        forward: (start, point) => this.betView.measureForward(start, point),
        sliderTravel: () => this.betView.sliderHeight()
      });
    }
    if (!editor) {
      try { this.portraits = createPlayerPortraits(this.renderer, makePerson); }
      catch (error) { console.warn('Player portraits:', error); this.portraits = []; }
    }
    this.showPreview();
    this.resizeObserver = new ResizeObserver(() => this.resize()); this.resizeObserver.observe(container); this.resize();
    this.resetView();
    const canvas = this.renderer.domElement;
    canvas.tabIndex = 0;
    canvas.setAttribute('aria-label', '3D 牌桌；电脑按住鼠标左键拖动转向，手机按住画面拖动转向');
    if (!editor) this.controls = new SceneViewControls(this, canvas);
    this.tick = this.tick.bind(this); this.frame = requestAnimationFrame(this.tick);
  }
  tagEditables(start, prefix, category) {
    this.scene.children.slice(start).forEach((node, i) => {
      if (!node.isMesh && !node.isGroup) return;
      const geometry = node.geometry?.type === 'BoxGeometry' ? '木构件' : node.geometry?.type === 'CylinderGeometry' ? '圆柱物件' : '物件';
      node.userData.layout = { id: `${prefix}-${i}`, label: node.name || `${category} · ${geometry} ${i + 1}`, category };
    });
  }
  buildRoom() {
    const s = this.scene, wood = this.wood, dark = this.darkWood;
    const floor = box(s, 35, .2, 35, material(0x97724c, { map: wood.map }), 0, -.12, -2);
    floor.name = '酒馆木地板';
    for (let x = -14; x <= 14; x += 1.4) box(s, .025, .01, 30, material(0x1e160f), x, 0, -2);
    box(s, 28, 11, .35, material(0x4f4030, { map: wood.map }), 0, 5, -12);
    box(s, 28, 11, .35, material(0x4f4030, { map: wood.map }), 0, 5, 12);
    box(s, 28, .3, 27, dark, 0, 10.6, 0);
    for (const x of [-11, 11]) box(s, .4, 11, 30, dark, x, 5, -2);
    for (let x = -10; x <= 10; x += 5) {
      box(s, .3, 10, .6, dark, x, 4.5, -11.7);
      box(s, .4, .4, 28, dark, x, 9, -1);
    }
    for (let y = 1; y < 11; y += 2) box(s, 27, .12, .45, dark, 0, y, -11.7);
    // Complete the room behind the player now that the seated camera can turn 360 degrees.
    for (const x of [-10, -5, 5, 10]) box(s, .3, 10, .6, dark, x, 4.5, 11.7);
    box(s, 3.7, 5, .1, material(0x15110c), 0, 2.5, 11.7);
    for (const x of [-1.9, 1.9]) box(s, .22, 5.3, .4, wood, x, 2.65, 11.5);
    box(s, 4.1, .28, .4, wood, 0, 5.25, 11.5);
    for (const side of [-1, 1]) {
      box(s, 1.65, 1.9, .16, wood, side * .88, 2.55, 11.45);
      for (let k = 0; k < 7; k++) box(s, 1.55, .055, .18, dark, side * .88, 1.85 + k * .23, 11.35);
      const barrel = cylinder(s, .63, .59, 1.5, wood, side * 5.5, .75, 10.2, 14);
      for (const y of [.25, 1.22]) cylinder(s, .65, .65, .09, this.brass, side * 5.5, y, 10.2, 14);
    }
    box(s, 10, 1.8, 1.3, dark, -3, .9, -9);
    box(s, 10.4, .18, 1.8, wood, -3, 1.9, -9);
    for (let x = -7; x <= 1; x += .8) box(s, .09, 1.7, .05, wood, x, .9, -8.3);
    const shelf = new THREE.Group(); shelf.name = '酒架（整体）'; shelf.position.set(-4, 3.6, -11.3); s.add(shelf);
    for (const y of [0, 1.4, 2.8]) {
      box(shelf, 8, .12, .8, wood, 0, y, 0);
      for (let i = 0; i < 11; i++) {
        const mat = material([0x4d5835, 0x80572d, 0x3b4b3e][i % 3], { roughness: .35, metalness: .1 });
        const xx = -3.5 + i * .67;
        const bottle = new THREE.Group(); bottle.position.set(xx, y + .36, 0); shelf.add(bottle);
        bottle.userData.layout = { id: `bottle-${Math.round(y / 1.4)}-${i}`, label: `酒瓶 ${Math.round(y / 1.4) + 1} 排 ${i + 1}`, category: '酒瓶' };
        cylinder(bottle, .12, .15, .57 + (i % 3) * .08, mat, 0, 0, 0, 8);
        cylinder(bottle, .045, .07, .24, mat, 0, .4 + (i % 3) * .08, 0, 8);
        box(bottle, .2, .18, .25, material(0xc1a576), 0, -.01, .015);
      }
    }
    const sign = texture((ctx, n) => {
      ctx.fillStyle = '#221d14'; ctx.fillRect(0, 0, n, n); ctx.strokeStyle = '#a18758'; ctx.lineWidth = 7; ctx.strokeRect(20, 130, n - 40, 250);
      ctx.fillStyle = '#c5ab79'; ctx.textAlign = 'center'; ctx.font = 'bold 48px Georgia'; ctx.fillText('THE DUSK', n / 2, 238);
      ctx.font = '34px Georgia'; ctx.fillText('S A L O O N', n / 2, 298); ctx.font = '17px Georgia'; ctx.fillText('TEXAS · 1876', n / 2, 343);
    });
    box(s, 4, 3.2, .12, material(0xffffff, { map: sign }), 4.4, 4.4, -11.45);
    for (const x of [-8, 8]) {
      box(s, 2.4, 3.8, .2, dark, x, 4.4, -11.3);
      box(s, 2.1, 3.5, .08, material(0x8b7954, { emissive: 0x44361c, emissiveIntensity: .6 }), x, 4.4, -11.15);
      box(s, .09, 3.5, .14, dark, x, 4.4, -11.05); box(s, 2.1, .09, .14, dark, x, 4.4, -11.05);
    }
    // Low hanging shades, a warm centrepiece and smaller lights behind the players.
    for (const [x, z, y] of [[0, -1, 7.3], [-7, -7, 5.5], [7, -7, 5.5]]) {
      cylinder(s, .018, .018, 4, dark, x, y + 2, z, 6);
      cylinder(s, .3, 1.0, .47, material(0x403629, { metalness: .5 }), x, y, z);
      const glow = material(0xffd397, { emissive: 0xffbf67, emissiveIntensity: 2.0 });
      cylinder(s, .82, .82, .025, glow, x, y - .23, z);
      const lamp = new THREE.PointLight(0xffc77f, x === 0 ? 38 : 28, 15, 1.7); lamp.position.set(x, y - .4, z); s.add(lamp);
    }
    // Peripheral saloon tables.
    for (const x of [-8, 8]) { cylinder(s, 1.5, 1.5, .16, wood, x, 1.4, -4); cylinder(s, .2, .35, 1.4, dark, x, .7, -4); }
  }
  buildTable() {
    const s = this.scene;
    for (const z of [-2.6, 2.6]) { box(s, .4, 1.2, .4, this.darkWood, 0, .6, z); box(s, 3, .2, .5, this.darkWood, 0, .18, z); }
    const rim = cylinder(s, 3.28, 3.25, .29, this.wood, 0, 1.36, 0, 80); rim.scale.z = 1.47;
    rim.name = '牌桌 · 木质桌体';
    const brass = cylinder(s, 3.10, 3.10, .025, this.brass, 0, 1.52, 0, 80); brass.scale.z = 1.47;
    const felt = cylinder(s, 3.03, 3.03, .03, material(0xffffff, { map: feltTexture() }), 0, 1.54, 0, 80); felt.scale.z = 1.47;
    felt.userData.tableSurface = true;
    felt.name = '牌桌 · 绿色桌布';
    const leather = material(0x332b1e);
    const rail = mesh(new THREE.TorusGeometry(3.2, .12, 8, 80), leather, 0, 1.58, 0); rail.rotation.x = Math.PI / 2; rail.scale.y = 1.47; s.add(rail);
    rail.name = '牌桌 · 皮革扶手';
    // Deck and a physical dealer button.
    const deck = material(0x8e6342); const deckStack = box(s, .51, .16, .74, deck, -1.65, 1.68, -.25); deckStack.name = '牌堆 · 纸张堆叠';
    this.dealer = cylinder(s, .16, .16, .06, material(0xe2d1ad), 1.4, 1.65, 1, 24);
    this.dealer.name = '庄家按钮';
    for (const [x, z] of [[2.1, 1.8], [-1.9, 1.4], [1.9, -2]]) {
      const glass = material(0x8e744b, { transparent: true, opacity: .6, roughness: .2, metalness: .15 });
      const cup = new THREE.Group(); cup.position.set(x, 1.75, z); cup.name = `酒杯 ${x}, ${z}`; s.add(cup);
      cylinder(cup, .13, .10, .34, glass, 0, 0, 0, 12); cylinder(cup, .115, .09, .16, material(0x8f561e), 0, -.08, 0, 12);
    }
    // Holstered revolver beside the near rail: a prop, never an action.
    const prop = new THREE.Group(); prop.position.set(2.35, 1.72, 2.4); prop.rotation.y = -.7; s.add(prop);
    prop.name = '左轮枪';
    const steel = material(0x777068, { metalness: .85, roughness: .35 });
    box(prop, .13, .14, .67, steel, 0, 0, -.2); cylinder(prop, .17, .17, .27, steel, 0, 0, .18, 10).rotation.x = Math.PI / 2;
    const grip = box(prop, .14, .35, .2, this.darkWood, 0, -.11, .37); grip.rotation.x = -.4;
  }
  makeChips(index) {
    const g = new THREE.Group();
    const mats = [material(0xd4c2a1), material(0x8e4336), material(0x4d6757)];
    for (let stack = 0; stack < 3; stack++) for (let j = 0; j < 3 + (index + stack) % 4; j++) {
      cylinder(g, .105, .105, .045, mats[stack], (stack - 1) * .24, j * .048, 0, 16);
      if (j % 2 === 0) for (let k = 0; k < 4; k++) { const t = k * Math.PI / 2; box(g, .035, .025, .04, mats[0], (stack - 1) * .24 + Math.cos(t) * .087, j * .048, Math.sin(t) * .087); }
    }
    g.userData.meshBatching = batchStaticMeshes(g);
    return g;
  }
  buildHands() {
    // Arms rest on the rail in world space. Looking around moves only the head.
    this.hands = new THREE.Group(); this.hands.position.set(0, 1.79, 3.65); this.scene.add(this.hands, this.camera);
    const skin = material(0xbf936e), sleeve = material(0x65553e);
    for (const side of [-1, 1]) {
      const g = new THREE.Group(); g.position.set(side * .6, 0, 0); g.rotation.y = side * -.13;
      const arm = cylinder(g, .11, .15, 1.3, sleeve, side * .04, -.02, .55, 8); arm.rotation.x = Math.PI / 2;
      const palm = mesh(new THREE.SphereGeometry(.16, 8, 6), skin, 0, .015, -.16); palm.scale.set(1, .48, 1.3); g.add(palm);
      for (let j = 0; j < 4; j++) box(g, .05, .055, .22, skin, (j - 1.5) * .067, .01, -.38);
      const thumb = box(g, .09, .07, .19, skin, -side * .15, .015, -.19); thumb.rotation.y = side * .4;
      this.hands.add(g);
    }
    this.hands.visible = false;
    this.hands.userData.meshBatching = batchStaticMeshes(this.hands);
  }
  makeSeatLabel() {
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 240;
    const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, depthTest: true, depthWrite: false, toneMapped: false, fog: false }));
    sprite.center.set(.5, 0); sprite.scale.set(2.1, .984, 1); sprite.visible = false;
    return { canvas, map, sprite, key: '' };
  }
  paintSeatLabel(label, data) {
    const key = JSON.stringify(data);
    if (key === label.key) return;
    const height = settlementLabelHeight(data.settlement);
    if (label.canvas.height !== height) {
      // Uploaded textures have fixed GPU dimensions. Resizing the canvas and
      // setting needsUpdate alone leaves the previous image on the sprite.
      const previousMap = label.map;
      label.canvas.height = height;
      label.map = new THREE.CanvasTexture(label.canvas);
      label.map.colorSpace = THREE.SRGBColorSpace;
      label.sprite.material.map = label.map;
      label.sprite.material.needsUpdate = true;
      previousMap.dispose();
    }
    const ctx = label.canvas.getContext('2d');
    label.winPulse = data.settlement?.winner ? label.winPulse ?? { start: performance.now() } : null;
    if (data.settlement) {
      paintSettlementLabel(ctx, data.settlement);
      label.map.needsUpdate = true; label.sprite.material.opacity = 1;
      label.key = key;
      return;
    }
    paintSeatNameplate(ctx, data);
    label.map.needsUpdate = true;
    label.sprite.material.opacity = data.folded ? .65 : 1;
    label.key = key;
  }
  animateSeatLabel(label, time) {
    if (!label.winPulse) return;
    if (time - (label.winPulse.lastPaint ?? -Infinity) < 1000 / 30 - .5) return;
    label.winPulse.lastPaint = time;
    paintWinLabel(label.canvas.getContext('2d'), time - label.winPulse.start);
    label.map.needsUpdate = true;
  }
  get firstPerson() { return this.seated && (this.room?.phase === 'playing' || this.room?.phase === 'finished'); }
  get dealing() { return !this.editor && (!!this.room?.dealing || !!this.cards?.dealing); }
  getTurnLookTarget() {
    const hand = this.room?.hand;
    if (this.editor || !this.firstPerson || this.room.phase !== 'playing' || !hand) return null;
    const pose = playerCameraPose(this.playerCamera);
    if (this.dealing) return { key: `deal:${dealKey(this.room)}`, ...pose };
    if (hand.done || !Number.isInteger(hand.actor)) return null;
    const actor = hand.players.find(player => player.seat === hand.actor);
    if (!actor) return null;
    const key = `${this.room.code}:${hand.number}:${hand.actor}`;
    if (actor.id === this.viewerId) {
      return { key, ...pose };
    }
    if (this.followOtherPlayers === false) return null;
    // Models are arranged relative to the viewer's seat. Use their live world
    // positions so edited characters and seats stay correctly aligned.
    const model = this.models.find(model => model.userData.seat === hand.actor);
    if (!model?.visible || !model.userData.head) return null;
    const target = model.userData.head.getWorldPosition(new THREE.Vector3());
    target.y -= .35; // Upper body, below the floating label.
    target.sub(this.camera.getWorldPosition(new THREE.Vector3()));
    const horizontal = Math.hypot(target.x, target.z);
    if (horizontal < .001) return null;
    return { key, position: pose.position, roll: pose.roll, yaw: Math.atan2(-target.x, -target.z), pitch: Math.atan2(target.y, horizontal) };
  }
  setFollowOtherPlayers(enabled) { this.followOtherPlayers = !!enabled; }
  cancelViewInput() { this.controls?.cancel(); }
  setActionConnection(connected) {
    this.actionConnected = connected;
    this.tableActions?.sync(this.room, this.viewerId, connected && !this.dealing);
  }
  rejectTableAction() { this.betView?.cancelFlight(); this.tableActions?.reject(); }
  resetView() {
    this.controls?.reset();
    this.viewTransition = null;
    this.peekActive = false;
    this.cards?.setPeeking(false);
    this.cards?.setBoardPeeking(false);
    this.cardPeekClosing = null;
    this.inspectMode = null;
    if (this.firstPerson) {
      const pose = playerCameraPose(this.playerCamera);
      this.camera.position.copy(pose.position); this.yaw = pose.yaw; this.pitch = pose.pitch; this.roll = pose.roll;
    }
    else {
      // The overview must stay inside the rear wall (z = 12), including after standing up.
      this.camera.position.set(...OVERVIEW_EYE); this.yaw = 0; this.roll = 0;
      this.pitch = this.overviewPitch;
    }
    this.applyView(); this.resize();
    this.renderer.domElement.setAttribute('aria-description', this.firstPerson ? '第一人称视角' : '俯视视角');
  }
  beginCardPeek(kind) {
    if (this.peekActive || this.room?.opening || !['hand', 'board'].includes(kind) || !this.firstPerson || !this.room?.hand || (this.dealing && kind !== 'hand')) return false;
    const me = this.room.hand.players.find(p => p.id === this.viewerId);
    if (kind === 'hand' && (!me || me.folded)) return false;
    if (kind === 'board' && !this.room.hand.board.length) return false;
    this.peekActive = true; this.peekHandKey = `${this.room.code}:${this.room.hand.number}`;
    this.inspectMode = kind; this.cardPeekClosing = null; this.viewTransition = null;
    this.cards.setPeeking(kind === 'hand');
    this.cards.setBoardPeeking(kind === 'board');
    this.renderer.domElement.setAttribute('aria-description', kind === 'hand' ? '正在翻开底牌' : '正在立起公共牌');
    return true;
  }
  endCardPeek() {
    if (!this.peekActive) return;
    const kind = this.inspectMode;
    this.peekActive = false; this.cards.setPeeking(false); this.cards.setBoardPeeking(false); this.inspectMode = null;
    this.viewTransition = null; this.cardPeekClosing = kind;
    this.renderer.domElement.setAttribute('aria-description', kind === 'hand' ? '正在盖回底牌' : '正在放回公共牌');
  }
  applyView() {
    this.camera.quaternion.setFromEuler(new THREE.Euler(this.pitch, this.yaw, this.roll, 'YXZ'));
    this.camera.updateMatrixWorld(true);
  }
  hitTarget(clientX, clientY) {
    if (!this.room) return null;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set((clientX - rect.left) / rect.width * 2 - 1, -(clientY - rect.top) / rect.height * 2 + 1);
    this.scene.updateMatrixWorld(true); this.raycaster.setFromCamera(this.pointer, this.camera);
    // Include furniture as occluders: chairs cannot be clicked through the table or a wall.
    const hit = this.raycaster.intersectObjects(this.scene.children, true).find(({ object }) => {
      for (let o = object; o; o = o.parent) if (!o.visible) return false;
      return true;
    });
    for (let o = hit?.object; o; o = o.parent) {
      if (o.userData.chipRole) return { chipRole: o.userData.chipRole };
      if (o.userData.cardRole === 'hand' || o.userData.cardRole === 'board') return { cardRole: o.userData.cardRole };
      if (o.userData.tableSurface) return { tableSurface: true };
      if (Number.isInteger(o.userData.seat)) return { seat: o.userData.seat };
    }
    return null;
  }
  pickSeat(clientX, clientY) {
    const target = this.hitTarget(clientX, clientY);
    if (Number.isInteger(target?.seat)) this.onSeatSelect?.(target.seat);
  }
  showPreview() {
    this.shadowDirty = true;
    this.dealerButtons?.update(null, 0);
    this.models.forEach((p, i) => { p.visible = [2, 4, 6].includes(i); });
    this.piles.forEach((p, i) => { p.visible = [2, 4, 6].includes(i); });
    this.labels.forEach(label => { label.sprite.visible = false; });
    this.markers.forEach(marker => { marker.visible = false; });
  }
  update(room, you) {
    this.shadowDirty = true;
    const wasFirstPerson = this.firstPerson;
    const freshDeal = !!dealKey(room) && dealKey(room) !== dealKey(this.room);
    this.room = room; this.viewerId = you;
    this.seatActions ||= new SeatActionLabels(); this.seatActions.update(room);
    if (this.peekActive && (!room?.hand || this.peekHandKey !== `${room.code}:${room.hand.number}` ||
      (this.inspectMode === 'hand' && !room.hand.players.some(p => p.id === you && !p.folded)))) this.endCardPeek();
    if (!room) {
      const changed = wasFirstPerson || this.focus !== 0; this.seated = false; this.focus = 0;
      this.showPreview(); this.hands.visible = false;
      if (changed) this.resetView();
      this.cards.update(null, you, POSITIONS, 0);
      this.betView?.setActive(false); this.potView?.sync(null, you); this.tableActions?.sync(null, you, false);
      return;
    }
    const mine = room.seats.find(s => s.id === you);
    this.seated = !!mine;
    // Keep the table and avatars in the same seats until the match starts.
    const focus = this.firstPerson ? mine.seat : 0;
    const changed = this.focus !== focus || wasFirstPerson !== this.firstPerson;
    this.focus = focus; this.hands.visible = this.firstPerson;
    if (freshDeal && !this.editor && !(this.peekActive && this.inspectMode === 'hand')) {
      this.peekActive = false; this.cardPeekClosing = null; this.inspectMode = null; this.viewTransition = null;
      this.cards.setPeeking(false); this.cards.setBoardPeeking(false);
    }
    if (changed) {
      if (freshDeal && room.dealing && this.firstPerson && !this.editor) {
        // Enter the seat through the same eased follow as subsequent deals.
        this.controls?.resumeTurnFollow();
        this.resize(); this.renderer.domElement.setAttribute('aria-description', '第一人称视角');
      } else this.resetView();
    }
    this.cards.update(room, you, POSITIONS, this.focus);
    for (let i = 0; i < 8; i++) {
      const seat = room.seats[(i + this.focus) % 8];
      const p = room.hand?.players.find(p => p.id === seat.id);
      const own = i === 0 && this.firstPerson;
      this.models[i].visible = seat.kind !== 'open' && !own;
      this.models[i].userData.seat = seat.seat; this.chairs[i].userData.seat = seat.seat;
      this.models[i].userData.folded = !!p?.folded;
      this.piles[i].visible = seat.kind !== 'open' && (own || (p ? p.chips > 0 : true));
      this.piles[i].position.set(own ? -1.05 : POSITIONS[i][0] * .7, 1.56, own ? 3.75 : POSITIONS[i][1] * .7);
      this.markers[i].visible = !!p && room.hand.actor === p.seat && !room.hand.done && !this.dealing;
      const label = this.labels[i], lobby = room.phase === 'lobby';
      label.sprite.userData.seat = seat.seat;
      label.sprite.visible = !own && (lobby || seat.kind !== 'open') && (!room.hand?.done || !!p);
      if (seat.kind === 'open') { this.chairs[i].add(label.sprite); label.sprite.position.set(0, 3.45, 0); }
      else { this.models[i].userData.head.add(label.sprite); label.sprite.position.set(0, 1, 0); }
      const canConfigure = lobby && room.hostId === you && !!mine;
      this.paintSeatLabel(label, { seat: seat.seat, open: seat.kind === 'open', bot: seat.kind === 'ai',
        name: seat.kind === 'open' ? '开放' : seat.name,
        value: lobby ? seat.kind === 'open' ? canConfigure ? '切换为 AI' : '点击入座' : seat.kind === 'ai' ? canConfigure ? 'AI · 点击切换' : 'AI · 电脑对手' : room.hostId === seat.id ? '房主' : '已入座' : Number(p?.chips ?? seat.chips ?? 0).toLocaleString('zh-CN'),
        action: lobby ? seat.kind === 'human' && !seat.connected ? '暂时断线' : seat.id === you ? '点击起身' : seat.kind === 'open' ? '＋' : '等待开场' : p ? this.seatActions.get(p.id) : '已出局',
        settlement: settlementLabel(room.hand, p),
        folded: !!p?.folded, active: !!p && room.hand.actor === p.seat && !room.hand.done && !this.dealing });
    }
    this.dealerButtons?.update(room.hand?.button, this.focus, room.hand?.sbSeat, room.hand?.bbSeat, room.opening, room.serverTime);
    this.betView?.setActive(this.firstPerson);
    this.potView?.sync(room, you, this.focus);
    this.tableActions?.sync(room, you, this.actionConnected !== false && !this.dealing);
  }
  resize() {
    const { width, height } = this.container.getBoundingClientRect();
    if (!width || !height) return;
    this.viewWidth = width; this.viewHeight = height;
    this.renderBudget.resize(width, height);
    const ratio = this.renderBudget.ratio;
    if (Math.abs(ratio - this.pixelRatio) > .001) { this.pixelRatio = ratio; this.renderer.setPixelRatio(ratio); }
    this.camera.aspect = width / height;
    if (!this.editor) {
      const source = this.playerCamera;
      this.camera.fov = this.firstPerson ? source.fov : this.camera.aspect < .6 ? 75 : 68;
      this.camera.near = this.firstPerson ? source.near : .1;
      this.camera.far = this.firstPerson ? source.far : 80;
    }
    this.camera.updateProjectionMatrix(); this.renderer.setSize(width, height);
  }
  setQuality(quality) {
    this.renderBudget.setQuality(quality);
    const enabled = this.renderBudget.quality !== 'low', settings = this.renderBudget.settings;
    const shadow = this.keyLight?.shadow;
    if (shadow && (shadow.mapSize.x !== settings.shadowSize || !enabled)) {
      shadow.map?.dispose(); shadow.map = null;
      shadow.mapPass?.dispose(); shadow.mapPass = null;
      shadow.mapSize.set(settings.shadowSize, settings.shadowSize); shadow.needsUpdate = true;
    }
    if (this.renderer.shadowMap.enabled !== enabled) {
      this.renderer.shadowMap.enabled = enabled;
      // Disabling shadow passes alone leaves materials using their last shadow shader.
      // Include hidden objects and shared/multi-slot materials for later seat/card changes.
      const materials = new Set();
      this.scene.traverse(node => {
        if (node.material) for (const mat of Array.isArray(node.material) ? node.material : [node.material]) materials.add(mat);
      });
      for (const mat of materials) mat.needsUpdate = true;
    }
    this.renderer.shadowMap.needsUpdate = enabled; this.shadowDirty = true; this.shadowClock.reset(); this.resize();
  }
  setFrameRate(fps) { this.frameClock.setRate(fps); this.renderBudget.reset(); }
  get shadowMotion() {
    return !!(this.cards.all.some(card => card.animation) || this.cards.boardPresentation.motion || this.cards.boardPresentation.progress > 0 || this.cards.handDrag > 0 ||
      this.dealerButtons?.placement || this.potView?.flights.length || this.potView?.settlement || this.betView?.flight || this.betView?.transfers.length || this.betView?.state.dragging);
  }
  tick(time) {
    this.frame = requestAnimationFrame(this.tick);
    if (document.hidden) { this.frameClock.reset(); this.shadowClock.reset(); this.renderBudget.reset(); this.shadowDirty = true; return; }
    const seconds = this.frameClock.step(time);
    if (seconds === null) return;
    if (this.renderBudget.sample(time, this.frameClock.fps)) this.resize();
    const shadowMotionBefore = !this.editor && this.shadowMotion;
    this.controls?.tick(seconds);
    if (this.viewTransition) {
      const v = this.viewTransition, t = Math.min(1, (time - v.start) / (v.duration || 360)), ease = t * t * (3 - 2 * t);
      this.camera.position.lerpVectors(v.from, v.to, ease);
      this.yaw = THREE.MathUtils.lerp(v.yawFrom, v.yawTo || 0, ease); this.pitch = THREE.MathUtils.lerp(v.pitchFrom, v.pitchTo, ease);
      this.roll = THREE.MathUtils.lerp(v.rollFrom ?? this.roll, v.rollTo ?? this.roll, ease); this.applyView();
      if (t === 1) {
        this.viewTransition = null;
        this.renderer.domElement.setAttribute('aria-description', this.peekActive ? this.inspectMode === 'hand' ? '底牌已翻开，松开盖住' : '正在查看公共牌，松开返回' : '正常坐姿视角');
      }
    }
    const wasDealing = this.dealing;
    this.cards.tick(time, this.camera);
    this.dealerButtons?.tick(time);
    if (wasDealing && !this.dealing) {
      this.tableActions?.sync(this.room, this.viewerId, this.actionConnected !== false); this.onDealFinished?.();
    }
    this.potView?.tick(time);
    this.betView?.tick(time);
    if (this.peekActive) {
      if (this.inspectMode === 'board' && this.cards.boardRaised) this.renderer.domElement.setAttribute('aria-description', '公共牌已立起，松开放回桌面');
      if (this.inspectMode === 'hand' && this.cards.hole.every(card => !card.animation)) this.renderer.domElement.setAttribute('aria-description', '底牌已翻开，松开盖住');
    } else if (this.cardPeekClosing && (this.cardPeekClosing === 'board' ? this.cards.boardResting : this.cards.hole.every(card => !card.animation))) {
      this.renderer.domElement.setAttribute('aria-description', this.cardPeekClosing === 'board' ? '公共牌已放回桌面，保持当前视角' : '底牌已盖住，保持当前视角');
      this.cardPeekClosing = null;
    }
    if (!this.editor) this.models.forEach((model, i) => {
      if (!model.visible) return;
      model.position.y = Math.sin(time * .0011 + i * 1.3) * .012;
      model.userData.head.rotation.x = model.userData.folded ? .18 : Math.sin(time * .0004 + i) * .025;
    });
    // Keep nearby nameplates readable without letting them cover half a phone screen.
    // These remain depth-tested world-space Sprites; there is no screen-positioned UI.
    const labelLimit = Math.min(150, this.viewWidth * .42);
    const worldPerPixel = 2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) / Math.max(1, this.viewHeight);
    for (const label of this.labels) if (label.sprite.visible) {
      this.animateSeatLabel(label, time);
      label.sprite.getWorldPosition(this.labelPosition).applyMatrix4(this.camera.matrixWorldInverse);
      const width = Math.min(2.1, Math.max(.04, -this.labelPosition.z * worldPerPixel * labelLimit));
      label.sprite.scale.set(width, width * label.canvas.height / label.canvas.width, 1);
    }
    if (!this.editor && this.hands.visible) this.hands.position.y = 1.79 + Math.sin(time * .001) * .003;
    this.beforeRender?.();
    // Quality changes affect shadow cost independently of card textures/resolution.
    // Changes and the final animation pose invalidate the cached map immediately.
    const shadowMotion = !this.editor && this.shadowMotion;
    if ((shadowMotionBefore || this.shadowMotionActive) && !shadowMotion) this.shadowDirty = true;
    this.shadowMotionActive = shadowMotion;
    const settings = this.renderBudget.settings, moving = shadowMotionBefore || shadowMotion;
    const shadowDue = moving ? settings.shadowFps === 30 || time - this.lastShadowUpdate >= 1000 / settings.shadowFps - .5
      : time - this.lastShadowUpdate >= 1000 / settings.idleShadowFps - .5;
    if (!this.editor && !this.tableActions?.selecting && this.renderer.shadowMap.enabled &&
        (this.shadowDirty || (shadowDue && this.shadowClock.step(time) !== null))) {
      if (this.shadowDirty) { this.shadowClock.reset(); this.shadowClock.step(time); }
      this.renderer.shadowMap.needsUpdate = true; this.shadowDirty = false; this.lastShadowUpdate = time;
    }
    this.renderer.render(this.scene, this.camera);
    this.afterRender?.();
  }
}
