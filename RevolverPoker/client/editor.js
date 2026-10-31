import * as THREE from '/vendor/three.js';
import { OrbitControls } from '/vendor/OrbitControls.js';
import { TransformControls } from '/vendor/TransformControls.js';
import { SaloonScene } from './scene.js';
import { EMPTY_LAYOUT, validateLayout } from '/shared/scene-layout.js';
import { EditorCameraPreview } from './editor-camera.js';
import { copyPlayerCamera } from './player-camera.js';

const $ = id => document.getElementById(id);
if (location.port === '3090') document.querySelector('.header-actions a').href = 'http://localhost:3088/';
let selected = null, revision = '', saved = '', busy = false, errorTimer;
const undo = [], redo = [];
let scene, layout, orbit, transform, box, helper, grid, cameraPreview, updateSample, currentView = 'overview';
let previewEnabled = localStorage.getItem('rp-editor-camera-preview') !== 'off';
let previewCameraId = localStorage.getItem('rp-editor-preview-camera') === 'board-camera' ? 'board-camera' : 'player-camera';
const fields = new Map(), rows = new Map();
function viewCamera() { return currentView === 'player' ? scene.playerCamera : currentView === 'board' ? scene.boardCamera : null; }
function syncPreviewControls() {
  $('toggle-camera-preview').setAttribute('aria-pressed', String(previewEnabled));
  $('toggle-camera-preview').classList.toggle('active', previewEnabled);
  $('camera-preview-toggle').checked = previewEnabled; $('preview-camera').value = previewCameraId;
}
function setPreviewEnabled(value) {
  previewEnabled = !!value; localStorage.setItem('rp-editor-camera-preview', previewEnabled ? 'on' : 'off'); syncPreviewControls();
}
function setPreviewCamera(id) {
  previewCameraId = id; localStorage.setItem('rp-editor-preview-camera', id); syncPreviewControls();
}
function message(text, error = false) {
  $('editor-message').textContent = text; $('editor-message').hidden = false; $('editor-message').classList.toggle('error', error);
  clearTimeout(errorTimer); errorTimer = setTimeout(() => $('editor-message').hidden = true, error ? 9000 : 4200);
}
function serialize() { return JSON.stringify(layout.export()); }
function remember(before) { if (before !== serialize()) { undo.push(before); if (undo.length > 80) undo.shift(); redo.length = 0; } refresh(); }
function refresh() {
  const dirty = serialize() !== saved;
  $('save-status').textContent = busy ? '正在保存…' : dirty ? '● 有未保存的调整' : '已保存 · 游戏启动直接使用';
  $('save-layout').disabled = busy; $('reload-layout').disabled = busy; $('reset-all').disabled = busy;
  $('undo').disabled = !undo.length; $('redo').disabled = !redo.length;
  $('reset-object').disabled = !selected;
  const overrides = layout.export().objects;
  for (const entry of layout.entries.values()) {
    const t = overrides[entry.id];
    rows.get(entry.id)?.querySelector('.changed').toggleAttribute('hidden', !t);
  }
  fillFields();
}
function fillFields() {
  for (const [key, inputs] of fields) inputs.forEach((input, i) => {
    input.disabled = !selected;
    if (document.activeElement !== input) input.value = selected ? Number((key === 'rotation' ? THREE.MathUtils.radToDeg(selected.proxy.rotation.toArray()[i]) : selected.proxy[key].toArray()[i]).toFixed(3)) : '';
  });
  const camera = !!selected?.defaultsCamera;
  $('camera-properties').hidden = !camera;
  $('uniform-scale').closest('label').hidden = camera;
  document.querySelector('[data-section="scale"]')?.toggleAttribute('hidden', camera);
  document.querySelector('[data-mode="scale"]').disabled = camera;
  for (const key of ['fov', 'near', 'far']) if (camera && document.activeElement !== $(`camera-${key}`)) $(`camera-${key}`).value = selected.node[key];
  if (camera) $('camera-description').textContent = selected.id === 'board-camera' ? '公共牌的编辑器参考视角，可调整和预览。游戏按住公共牌时会立起牌张并朝向玩家，保持当前摄像机不动。' : '保存后应用于所有玩家的第一人称视角，用 FOV 调整取景范围。';
}
function updateViewControls() {
  if (!transform || !orbit) return;
  const camera = viewCamera();
  orbit.enabled = !camera && !transform.dragging;
  transform.enabled = !(camera && selected?.node === camera);
  transform.getHelper().visible = !!selected && transform.enabled;
  helper.visible = !!selected && transform.enabled;
  $('camera-align').disabled = !!camera;
}
function select(entry) {
  if ((entry?.id === 'hand-discard' || entry?.id.startsWith('opponent-discard-')) && !$('discard-preview').checked) {
    $('discard-preview').checked = true; $('showdown-preview').checked = false; updateSample();
  } else if ((entry?.id.startsWith('opponent-cards-') || entry?.id.startsWith('hand-card-') || entry?.id === 'hand-group' || entry?.id === 'staged-chips') && $('discard-preview').checked) {
    $('discard-preview').checked = false; updateSample();
  }
  selected = entry;
  if (entry) {
    transform.attach(entry.proxy);
    $('selected-name').textContent = entry.label; $('selected-id').textContent = entry.id; $('selected-category').textContent = entry.category;
    $('selection-status').textContent = `${entry.label} · ${entry.id}`;
    $('viewport-hint').textContent = '拖动操作轴调整 · F 聚焦物件 · W / E / R 切换工具';
  } else { transform.detach(); $('selected-name').textContent = '选择一个物件'; $('selected-id').textContent = '—'; $('selected-category').textContent = '未选择物件'; $('selection-status').textContent = '未选择物件'; }
  for (const [id, row] of rows) { row.classList.toggle('selected', id === entry?.id); row.setAttribute('aria-selected', String(id === entry?.id)); }
  helper.visible = !!entry;
  if (entry?.defaultsCamera && transform.mode === 'scale') setMode('translate');
  if (entry?.defaultsCamera) setPreviewCamera(entry.id);
  updateViewControls();
  refresh();
}
function setMode(mode) {
  if (mode === 'scale' && selected?.defaultsCamera) { message('用摄像机 FOV 调整取景范围'); return; }
  transform.setMode(mode);
  document.querySelectorAll('[data-mode]').forEach(button => button.classList.toggle('active', button.dataset.mode === mode));
}
function focus() {
  if (!selected) return;
  scene.scene.updateMatrixWorld(true); box.setFromObject(selected.node);
  const center = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3()).length();
  const direction = scene.camera.position.clone().sub(orbit.target).normalize();
  orbit.target.copy(center); scene.camera.position.copy(center).addScaledVector(direction, Math.max(1.3, size * 1.3)); orbit.update();
}
function setView(kind) {
  currentView = kind;
  if (viewCamera()) { copyPlayerCamera(scene.camera, viewCamera()); }
  else if (kind === 'top') { scene.camera.position.set(0, 6.7, .01); orbit.target.set(0, 1.55, 0); scene.camera.fov = 85; }
  else { scene.camera.position.set(7.7, 6.8, 9.6); orbit.target.set(0, 1.8, 0); scene.camera.fov = 60; }
  if (!viewCamera()) { scene.camera.near = .1; scene.camera.far = 80; orbit.update(); }
  scene.camera.updateProjectionMatrix(); updateViewControls();
  document.querySelectorAll('[data-view]').forEach(button => button.classList.toggle('active', button.dataset.view === kind));
}
async function request(body) {
  const response = await fetch('/api/scene-layout', body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(10000) } : { cache: 'no-store', signal: AbortSignal.timeout(10000) });
  const result = await response.json(); if (!response.ok) throw new Error(result.error || '无法保存场景'); return result;
}
async function load({ initial = false } = {}) {
  if (busy) return;
  const before = serialize(); busy = true; refresh();
  try { const result = await request(); layout.apply(result.layout); revision = result.revision; saved = serialize(); if (!initial) remember(before); message('已载入项目中保存的场景'); }
  catch (error) { message(error.message, true); }
  finally { busy = false; refresh(); }
}
async function save() {
  if (busy || !revision) return;
  busy = true; refresh();
  try { const result = await request({ revision, layout: layout.export() }); revision = result.revision; saved = JSON.stringify(result.layout); message('已保存为游戏场景，重新打开游戏即可使用；手机端请同步更新游戏包'); }
  catch (error) { message(error.message, true); }
  finally { busy = false; refresh(); }
}
function history(backward) {
  const source = backward ? undo : redo, destination = backward ? redo : undo;
  if (!source.length) return; destination.push(serialize()); layout.apply(JSON.parse(source.pop())); refresh();
}
function filterObjects() {
  const query = $('object-search').value.trim().toLowerCase(), category = $('category').value;
  let count = 0;
  for (const entry of layout.entries.values()) {
    const row = rows.get(entry.id); if (!row) continue;
    const visible = (!category || category === entry.category) && `${entry.label} ${entry.id}`.toLowerCase().includes(query);
    row.hidden = !visible; if (visible) count++;
  }
  $('object-count').textContent = `${count} / ${rows.size}`;
}

try {
  scene = new SaloonScene($('editor-scene'), { editor: true }); layout = scene.layout;
  // Static, fully occupied sample: editing never joins or changes a real poker room.
  const names = ['自己', '沃尔特', '艾达', '亨利', '玛吉', '查理', '比利', '罗斯'];
  const seats = names.map((name, seat) => ({ id: `preview-${seat}`, name, seat, kind: seat ? 'ai' : 'human', connected: true, chips: 2000 }));
  const sampleCards = [[12, 11], [13, 26], [14, 29], [40, 41], [25, 43], [22, 35], [10, 23], [45, 46]];
  updateSample = () => {
    const done = $('showdown-preview').checked;
    const discard = $('discard-preview').checked;
    const players = seats.map((seat, i) => ({ ...seat, cards: !i || done ? sampleCards[i] : [null, null], chips: 2000 - (i + 1) * 20, total: (i + 1) * 20, bet: (i + 1) * 20, folded: discard, action: '' }));
    // Preview toggles can undo folds within the same sample hand.
    scene.seatActions = null;
    scene.update({ code: 'EDITOR', name: 'RevolverPoker', hostId: 'preview-0', phase: 'playing', seats, hand: { number: 1, pot: players.reduce((sum, player) => sum + player.total, 0), board: [0, 18, 28, 49, 38], players, actor: done ? null : 1, button: 4, sbSeat: 5, bbSeat: 6, done, result: { showdown: done } } }, 'preview-0');
    scene.cards.setPeeking(!discard);
    const pending = discard ? 0 : 100;
    scene.betView.setState({ pending, bankroll: players[0].chips, remaining: players[0].chips - pending, enabled: false });
  };
  updateSample();
  $('showdown-preview').onchange = () => { if ($('showdown-preview').checked) $('discard-preview').checked = false; updateSample(); };
  $('discard-preview').onchange = () => { if ($('discard-preview').checked) $('showdown-preview').checked = false; updateSample(); };
  orbit = new OrbitControls(scene.camera, scene.renderer.domElement); orbit.enableDamping = true; orbit.dampingFactor = .12; orbit.minDistance = .25; orbit.maxDistance = 45; orbit.maxPolarAngle = Math.PI * .98;
  orbit.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.PAN };
  transform = new TransformControls(scene.camera, scene.renderer.domElement); transform.setSize(.85); scene.scene.add(transform.getHelper());
  box = new THREE.Box3(); helper = new THREE.Box3Helper(box, 0xd8bd87); helper.visible = false; helper.material.depthTest = false; helper.material.transparent = true; helper.material.opacity = .65; scene.scene.add(helper);
  grid = new THREE.GridHelper(26, 52, 0x7b6542, 0x3a3832); grid.position.y = .015; grid.material.transparent = true; grid.material.opacity = .45; scene.scene.add(grid);
  cameraPreview = new EditorCameraPreview(scene, $('camera-preview'), $('camera-preview-frame'));
  cameraPreview.editorHelpers = [transform.getHelper(), helper, grid, scene.betView.hitOutline];
  scene.beforeRender = () => {
    if (viewCamera()) copyPlayerCamera(scene.camera, viewCamera()); else orbit.update();
    if (selected) box.setFromObject(selected.node);
    cameraPreview.update(selected?.defaultsCamera ? selected.id : null, viewCamera()?.userData.layoutId, previewEnabled, previewCameraId);
  };
  scene.afterRender = () => cameraPreview.render();
  scene.renderer.domElement.setAttribute('aria-label', '场景编辑视口，拖动操作轴编辑，空白处拖动环绕');
  const shell = [...layout.entries.values()].filter(e => { const p = e.node.geometry?.parameters; return p && ((p.width > 20 && p.height > 5) || (p.depth > 20 && e.node.position.y > 5) || (p.depth > 20 && p.height > 5)); });
  cameraPreview.shellObjects = shell.map(entry => entry.node);
  const applyShell = () => shell.forEach(entry => entry.node.visible = $('shell-toggle').checked);
  $('shell-toggle').onchange = applyShell; applyShell();
  $('grid-toggle').onchange = () => grid.visible = $('grid-toggle').checked;
  setView('overview');
  const categories = new Set();
  for (const entry of layout.entries.values()) {
    if (entry.node.userData.editorHidden) continue;
    categories.add(entry.category);
    const row = document.createElement('button'); row.className = 'object-row'; row.setAttribute('role', 'option'); row.setAttribute('aria-selected', 'false'); row.dataset.object = entry.id;
    const icon = document.createElement('span'); icon.className = 'object-icon'; icon.textContent = entry.defaultsCamera ? '▣' : entry.node.isGroup ? '◇' : '▧';
    const name = document.createElement('span'); name.className = 'object-name'; name.textContent = entry.label;
    const changed = document.createElement('span'); changed.className = 'changed'; changed.textContent = '•'; changed.hidden = true;
    row.append(icon, name, changed); row.onclick = () => select(entry); row.ondblclick = focus; $('object-list').append(row); rows.set(entry.id, row);
  }
  for (const category of categories) { const option = document.createElement('option'); option.value = category; option.textContent = category; $('category').append(option); }
  for (const [key, label, step] of [['position', '位置', .05], ['rotation', '旋转 · °', 1], ['scale', '缩放', .05]]) {
    const section = document.createElement('section'); section.className = 'transform-section'; section.dataset.section = key; const title = document.createElement('h2'); title.textContent = label; section.append(title);
    const group = document.createElement('div'); group.className = 'axis-fields'; const inputs = [];
    ['X', 'Y', 'Z'].forEach((axis, i) => {
      const field = document.createElement('label'); field.className = 'axis-field'; const span = document.createElement('span'); span.className = axis.toLowerCase(); span.textContent = axis;
      const input = document.createElement('input'); input.type = 'number'; input.step = step; input.setAttribute('aria-label', `${label.split(' · ')[0]} ${axis}`); input.dataset.transform = key; input.dataset.axis = axis;
      input.min = key === 'scale' ? .01 : key === 'rotation' ? -57295 : -1000; input.max = key === 'scale' ? 100 : key === 'rotation' ? 57295 : 1000;
      let inputBefore = null;
      input.onfocus = () => inputBefore = serialize();
      const applyValue = (report = false) => {
        if (!selected) return;
        let value = Number(input.value);
        if (!input.value.trim() || !Number.isFinite(value) || value < Number(input.min) || value > Number(input.max)) {
          if (report) { input.value = key === 'rotation' ? THREE.MathUtils.radToDeg(selected.proxy.rotation[axis.toLowerCase()]) : selected.proxy[key].getComponent(i); message('请输入范围内的有效数值', true); }
          return;
        }
        if (key === 'rotation') selected.proxy.rotation[axis.toLowerCase()] = THREE.MathUtils.degToRad(value);
        else if (key === 'scale' && $('uniform-scale').checked) selected.proxy.scale.multiplyScalar(value / selected.proxy.scale.getComponent(i));
        else selected.proxy[key].setComponent(i, value);
        layout.sync(selected); refresh();
      };
      input.oninput = () => applyValue();
      const commit = () => { applyValue(true); if (inputBefore !== null) remember(inputBefore); inputBefore = serialize(); };
      input.onchange = commit;
      input.onblur = () => { commit(); inputBefore = null; };
      field.append(span, input); group.append(field); inputs.push(input);
    });
    section.append(group); $('transform-fields').append(section); fields.set(key, inputs);
  }
  for (const key of ['fov', 'near', 'far']) {
    const input = $(`camera-${key}`); let before = null;
    input.onfocus = () => before = serialize();
    const applyLens = report => {
      if (!selected?.defaultsCamera) return;
      const value = Number(input.value), camera = { fov: selected.node.fov, near: selected.node.near, far: selected.node.far, [key]: value };
      try {
        if (!input.value.trim()) throw new Error('请输入有效的摄像机参数');
        validateLayout({ version: 1, objects: { [selected.id]: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], camera } } });
        Object.assign(selected.node, camera); layout.sync(selected); refresh();
      } catch (error) { if (report) { input.value = selected.node[key]; message(error.message, true); } }
    };
    const commit = () => { applyLens(true); if (before !== null) remember(before); before = serialize(); };
    input.oninput = () => applyLens(false); input.onchange = commit; input.onblur = () => { commit(); before = null; };
  }
  $('camera-view').onclick = () => setView(selected?.id === 'board-camera' ? 'board' : 'player');
  $('camera-align').onclick = () => {
    if (!selected?.defaultsCamera || viewCamera()) return;
    const before = serialize(); selected.proxy.position.copy(scene.camera.position); selected.proxy.quaternion.copy(scene.camera.quaternion); selected.node.fov = scene.camera.fov;
    layout.sync(selected); remember(before); message('摄像机已对齐当前编辑视图');
  };
  $('toggle-camera-preview').onclick = () => setPreviewEnabled(!previewEnabled);
  $('camera-preview-toggle').onchange = () => setPreviewEnabled($('camera-preview-toggle').checked);
  $('preview-camera').onchange = () => setPreviewCamera($('preview-camera').value);
  $('edit-preview-camera').onclick = () => {
    $('object-search').value = ''; $('category').value = '摄像机'; filterObjects(); select(layout.entries.get(previewCameraId));
  };
  let pointerStart = null, transforming = false, dragBefore = '';
  transform.addEventListener('dragging-changed', updateViewControls);
  transform.addEventListener('mouseDown', () => { transforming = true; dragBefore = serialize(); });
  transform.addEventListener('objectChange', () => { if (selected) { layout.sync(selected); fillFields(); } });
  transform.addEventListener('mouseUp', () => remember(dragBefore));
  const canvas = scene.renderer.domElement;
  const endTransform = () => { if (transform.dragging) transform.pointerUp(null); updateViewControls(); pointerStart = null; };
  canvas.addEventListener('pointercancel', endTransform);
  window.addEventListener('blur', endTransform);
  document.addEventListener('visibilitychange', () => { if (document.hidden) endTransform(); });
  canvas.addEventListener('pointerdown', event => { pointerStart = [event.clientX, event.clientY]; if (!transform.dragging) transforming = false; });
  canvas.addEventListener('pointerup', event => {
    if (!pointerStart || event.button !== 0 || transforming || Math.hypot(event.clientX - pointerStart[0], event.clientY - pointerStart[1]) > 5) return;
    const rect = canvas.getBoundingClientRect(); scene.scene.updateMatrixWorld(true);
    const ray = new THREE.Raycaster(); ray.setFromCamera(new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, 1 - (event.clientY - rect.top) / rect.height * 2), scene.camera);
    const hit = ray.intersectObjects([...layout.entries.values()].map(entry => entry.node), true).find(({ object }) => {
      if (!object.isMesh && !object.isSprite && !object.userData.interactionArea) return false;
      for (let node = object; node; node = node.parent) if (!node.visible) return false;
      return true;
    });
    for (let node = hit?.object; node; node = node.parent) if (node.userData.layoutId) { select(layout.entries.get(node.userData.layoutId)); return; }
    select(null);
  });
  document.querySelectorAll('[data-mode]').forEach(button => button.onclick = () => setMode(button.dataset.mode));
  document.querySelectorAll('[data-view]').forEach(button => button.onclick = () => setView(button.dataset.view));
  $('space').onchange = () => transform.setSpace($('space').value);
  $('snap').onchange = () => { const active = $('snap').checked; transform.setTranslationSnap(active ? .1 : null); transform.setRotationSnap(active ? Math.PI / 12 : null); transform.setScaleSnap(active ? .1 : null); };
  $('focus-object').onclick = focus; $('object-search').oninput = filterObjects; $('category').onchange = filterObjects;
  $('undo').onclick = () => history(true); $('redo').onclick = () => history(false);
  $('save-layout').onclick = save; $('reload-layout').onclick = load;
  $('reset-all').onclick = () => { const before = serialize(); layout.apply(EMPTY_LAYOUT); remember(before); message('已恢复默认场景。点击“保存到游戏”保存；也可撤销。'); };
  $('reset-object').onclick = () => { if (!selected) return; const before = serialize(); layout.reset(selected); remember(before); };
  window.addEventListener('keydown', event => {
    const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName);
    const command = event.ctrlKey || event.metaKey, key = event.key.toLowerCase();
    if (command && key === 's') { event.preventDefault(); save(); }
    else if (!typing && command && ['z', 'y'].includes(key)) { event.preventDefault(); history(key === 'z' && !event.shiftKey); }
    else if (!typing && !command && !event.altKey && ['w', 'e', 'r', 'f', 'escape'].includes(key)) { event.preventDefault(); if (key === 'f') focus(); else if (key === 'escape') { if (transform.dragging) { transform.reset(); endTransform(); } else select(null); } else if (!transform.dragging) setMode({ w: 'translate', e: 'rotate', r: 'scale' }[key]); }
  });
  window.addEventListener('beforeunload', event => { if (serialize() !== saved) { event.preventDefault(); event.returnValue = ''; } });
  syncPreviewControls(); filterObjects(); select(null); await load({ initial: true });
} catch (error) { console.error(error); $('save-status').textContent = '场景加载失败'; $('save-status').className = 'error'; message(`场景加载失败：${error.message}`, true); }
