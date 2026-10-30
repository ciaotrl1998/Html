import * as THREE from '/vendor/three.js';

const VALUES = [1000000, 100000, 10000, 1000, 100, 25, 5, 1];
export function chipParts(amount) {
  const parts = [];
  for (const value of VALUES) { const count = Math.floor(amount / value); amount %= value; if (count) parts.push({ value, count }); }
  return parts;
}

export function bankChipParts(amount) {
  const counts = new Map(chipParts(amount).map(part => [part.value, part.count]));
  // Keep change ready in the bankroll instead of showing just two 1K chips
  // for a new 2,000 stack, then suddenly expanding it on the first wager.
  for (let step = 0; step < VALUES.length * 2 && [...counts.values()].filter(count => count > 0).length < 4; step++) {
    const index = VALUES.findLastIndex((value, i) => i < VALUES.length - 1 && counts.get(value) > 0 && !counts.get(VALUES[i + 1]));
    if (index < 0) break;
    const value = VALUES[index], change = VALUES[index + 1];
    counts.set(value, counts.get(value) - 1);
    counts.set(change, value / change);
  }
  return VALUES.filter(value => counts.get(value) > 0).map(value => ({ value, count: counts.get(value) }));
}

export class TableBetView {
  constructor(saloon) {
    this.saloon = saloon; this.bank = saloon.piles[0]; this.decorations = [...this.bank.children];
    this.geometry = new THREE.CylinderGeometry(.105, .105, .045, 18);
    this.materials = [0x463752, 0x5b4338, 0x947752, 0x444d69, 0x4d6757, 0x8e4336, 0xb5985d, 0xd4c2a1].map(color => new THREE.MeshStandardMaterial({ color, roughness: .85 }));
    this.faceGeometry = new THREE.CircleGeometry(.087, 18);
    this.faces = VALUES.map(value => {
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
      const ctx = canvas.getContext('2d'); ctx.strokeStyle = '#efdfb9cc'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(64, 64, 57, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#fff0c9'; ctx.font = 'bold 31px Arial, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(value >= 1000000 ? `${value / 1000000}M` : value >= 1000 ? `${value / 1000}K` : String(value), 64, 75, 108);
      const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace;
      return new THREE.MeshStandardMaterial({ map, transparent: true, roughness: .9, depthWrite: false });
    });
    this.bankCoins = new THREE.Group(); this.bankCoins.userData.chipRole = 'bank'; this.bank.add(this.bankCoins);
    this.plate = new THREE.Mesh(new THREE.CylinderGeometry(.43, .43, .016, 32), new THREE.MeshStandardMaterial({ color: 0x876a3a, transparent: true, opacity: .65 }));
    this.plate.position.y = -.025; this.bankCoins.add(this.plate);
    this.reserveCoins = new THREE.Group(); this.bankCoins.add(this.reserveCoins);
    this.stageAnchor = new THREE.Group(); this.stageAnchor.name = '预下注筹码'; saloon.scene.add(this.stageAnchor);
    this.stage = new THREE.Group(); this.stage.userData.chipRole = 'staged'; this.stageAnchor.add(this.stage);
    this.stageCoins = new THREE.Group(); this.stage.add(this.stageCoins);
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 104;
    this.numberCanvas = canvas; this.numberMap = new THREE.CanvasTexture(canvas); this.numberMap.colorSpace = THREE.SRGBColorSpace;
    this.number = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.numberMap, depthTest: true, depthWrite: false, transparent: true, toneMapped: false }));
    this.number.scale.set(1.45, .295, 1); this.number.position.y = .64; this.stage.add(this.number);
    this.home = new THREE.Vector3(); this.forward = new THREE.Vector3(0, 0, -1); this.transfers = [];
    this.anchors();
    this.stageEntry = saloon.layout?.register(this.stageAnchor, 'staged-chips', '自己 · 预下注筹码', '筹码与扑克');
    this.state = { pending: 0, bankroll: 0, remaining: 0 }; this.lastBank = -1; this.lastStage = -1;
    this.slider = document.createElement('div'); this.slider.className = 'chip-selector'; this.slider.hidden = true;
    this.slider.setAttribute('role', 'slider'); this.slider.setAttribute('aria-label', '预下筹码'); this.slider.setAttribute('aria-orientation', 'vertical');
    this.slider.innerHTML = '<div class="chip-selector-value"></div><div class="chip-selector-track"><i></i><b></b></div><span class="chip-selector-max"></span>';
    saloon.container.appendChild(this.slider);
    this.sliderValue = this.slider.querySelector('.chip-selector-value'); this.sliderFill = this.slider.querySelector('i');
    this.sliderThumb = this.slider.querySelector('b'); this.sliderMax = this.slider.querySelector('.chip-selector-max');
    this.setActive(false);
  }
  setActive(active) {
    this.active = active;
    this.decorations.forEach(node => { node.visible = !active; });
    this.bankCoins.visible = active;
    if (!active) { this.stage.visible = false; this.slider.hidden = true; this.flight = null; this.finishTransfers(); }
  }
  fill(group, amount, bankroll = false) {
    group.clear();
    const parts = (bankroll ? bankChipParts : chipParts)(Math.max(0, Math.floor(amount)));
    parts.forEach(({ value, count }, stack) => {
      const material = this.materials[VALUES.indexOf(value)];
      const row = Math.floor(stack / 3), columns = Math.min(3, parts.length - row * 3);
      for (let i = 0; i < count; i++) {
        const coin = new THREE.Mesh(this.geometry, material);
        coin.userData.value = value;
        const face = new THREE.Mesh(this.faceGeometry, this.faces[VALUES.indexOf(value)]); face.rotation.x = -Math.PI / 2; face.position.y = .024; coin.add(face);
        coin.position.set((stack % 3 - (columns - 1) / 2) * .24, .025 + i * .048, (row - (Math.ceil(parts.length / 3) - 1) / 2) * .24);
        coin.castShadow = true; group.add(coin);
      }
    });
  }
  anchors() {
    const bank = this.bank.getWorldPosition(new THREE.Vector3());
    const board = this.saloon.cards.boardAnchor.getWorldPosition(new THREE.Vector3());
    const direction = board.clone().sub(bank); direction.y = 0; direction.normalize();
    const automatic = bank.clone().addScaledVector(direction, .72); automatic.y += .025;
    if (this.stageEntry) {
      const entry = this.stageEntry;
      const edited = ['position', 'rotation', 'scale'].some(key => entry.proxy[key].toArray().slice(0, 3).some((value, i) => Math.abs(value - entry.defaults[key][i]) > 1e-6));
      // Rebase the automatic placement when older layouts move the bankroll.
      // An explicitly edited preview stays at its saved world-space location.
      entry.defaults.position = automatic.toArray();
      entry.inverseBase.makeTranslation(-automatic.x, -automatic.y, -automatic.z);
      this.stageAnchor.position.copy(automatic);
      if (!edited) entry.proxy.position.copy(automatic);
      this.saloon.layout.sync(entry);
    } else this.stageAnchor.position.copy(automatic);
    this.stageAnchor.getWorldPosition(this.home);
    this.forward.copy(board).sub(this.home); this.forward.y = 0; this.forward.normalize();
    return { bank, board };
  }
  transfer(amount, returning) {
    if (!this.active || !amount || this.saloon.editor) return;
    this.finishTransfers();
    const { bank } = this.anchors(), group = new THREE.Group(); this.fill(group, amount); this.saloon.scene.add(group);
    group.userData.chipRole = returning ? 'bank' : 'staged';
    this.transfers.push({ group, amount, returning, start: performance.now(), from: returning ? this.home.clone() : bank,
      to: returning ? bank : this.home.clone() });
  }
  finishTransfers() { for (const transfer of this.transfers) this.saloon.scene.remove(transfer.group); this.transfers = []; }
  resetDraft() { this.finishTransfers(); this.cancelFlight(); this.state = { ...this.state, pending: 0, inFlight: false }; this.stage.visible = false; }
  setState(state) {
    const previous = this.state.pending;
    this.state = state;
    if (this.flight && !state.inFlight) this.cancelFlight();
    if (this.active && state.pending !== previous && !state.inFlight && !this.flight) this.transfer(Math.abs(state.pending - previous), state.pending < previous);
    const returning = this.transfers.filter(transfer => transfer.returning).reduce((sum, transfer) => sum + transfer.amount, 0);
    const incoming = this.transfers.filter(transfer => !transfer.returning).reduce((sum, transfer) => sum + transfer.amount, 0);
    const remaining = Math.max(0, state.remaining - returning - (state.inFlight ? this.committedAmount || 0 : 0) - (this.saloon.potView?.heldFor(this.saloon.viewerId) || 0));
    if (remaining !== this.lastBank) { this.fill(this.reserveCoins, remaining, true); this.lastBank = remaining; }
    const shown = Math.max(0, state.pending - incoming);
    if (!this.flight && shown !== this.lastStage) { this.fill(this.stageCoins, shown); this.lastStage = shown; }
    if (!this.flight && state.pending !== this.lastNumber) {
      this.lastNumber = state.pending;
      const ctx = this.numberCanvas.getContext('2d'); ctx.clearRect(0, 0, 512, 104);
      ctx.fillStyle = '#17160fdd'; ctx.beginPath(); ctx.roundRect(12, 12, 488, 80, 12); ctx.fill();
      ctx.textAlign = 'center'; ctx.font = 'bold 46px Georgia, "Microsoft YaHei", serif'; ctx.fillStyle = '#f2d18b';
      ctx.fillText(`${state.pending.toLocaleString('zh-CN')}${state.pending && state.pending === state.bankroll ? ' · ALL IN' : ''}`, 256, 68, 470);
      this.numberMap.needsUpdate = true;
    }
    this.saloon.cards.setHandDrag?.(state.dragging === 'hand' ? Math.min(1.5, state.progress) : 0);
    this.slider.hidden = !this.active || !state.selecting;
    if (state.selecting) {
      this.sliderValue.textContent = `${state.selected.toLocaleString('zh-CN')}${state.selected === state.bankroll ? ' · ALL IN' : ''}`;
      this.sliderFill.style.height = `${state.ratio * 100}%`; this.sliderThumb.style.bottom = `${state.ratio * 100}%`;
      this.sliderMax.textContent = `最大 ${state.maximum.toLocaleString('zh-CN')}`;
      this.slider.setAttribute('aria-valuemin', '0'); this.slider.setAttribute('aria-valuemax', String(state.maximum)); this.slider.setAttribute('aria-valuenow', String(state.selected));
      this.positionSlider();
    }
    this.stage.visible = this.active && (state.pending > 0 || !!this.flight);
    this.number.visible = !this.flight;
  }
  commit({ type, amount }) {
    this.finishTransfers(); this.setState(this.state);
    if (['fold', 'check'].includes(type)) { this.transfer(amount, true); this.cancelFlight(); return; }
    if (!['call', 'raise', 'allin'].includes(type) || !amount) return;
    this.anchors(); this.committedAmount = amount;
    this.flight = { start: performance.now(), amount, from: this.stage.getWorldPosition(new THREE.Vector3()), to: this.saloon.potView?.target() || this.saloon.cards.boardAnchor.getWorldPosition(new THREE.Vector3()) };
    this.number.visible = false;
  }
  takeCommitted(amount, now) {
    if (!this.flight || this.flight.amount !== amount) return null;
    const group = new THREE.Group(); for (const coin of [...this.stageCoins.children]) group.add(coin);
    const adopted = { group, from: this.stage.getWorldPosition(new THREE.Vector3()), quaternion: this.stage.getWorldQuaternion(new THREE.Quaternion()), scale: this.stage.getWorldScale(new THREE.Vector3()), duration: Math.max(0, 480 - (now - this.flight.start)) };
    this.cancelFlight(); this.stage.visible = false; return adopted;
  }
  cancelFlight() { this.flight = null; this.committedAmount = 0; this.lastStage = -1; }
  positionSlider() {
    const point = this.bank.getWorldPosition(new THREE.Vector3()); point.y += .25; point.project(this.saloon.camera);
    const { width, height } = this.saloon.container.getBoundingClientRect();
    this.slider.style.left = `${Math.max(8, Math.min(width - 130, (point.x + 1) * width / 2 + 18))}px`;
    this.slider.style.top = `${Math.max(12, Math.min(height - 245, (1 - point.y) * height / 2 - 215))}px`;
  }
  measureForward(start, point) {
    this.anchors();
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -this.home.y), rect = this.saloon.renderer.domElement.getBoundingClientRect();
    const at = point => {
      const ray = new THREE.Raycaster(); ray.setFromCamera(new THREE.Vector2((point.x - rect.left) / rect.width * 2 - 1, 1 - (point.y - rect.top) / rect.height * 2), this.saloon.camera);
      return ray.ray.intersectPlane(plane, new THREE.Vector3());
    };
    const from = at(start), to = at(point);
    if (!from || !to) return 0;
    const delta = to.sub(from), forward = delta.dot(this.forward);
    const sideways = delta.clone().addScaledVector(this.forward, -forward).length();
    return sideways <= Math.max(.22, forward * 1.3) ? forward / .45 : 0;
  }
  tick(time) {
    if (this.active) {
      this.anchors();
      if (this.flight) {
        const t = Math.min(1, (time - this.flight.start) / 480);
        const destination = this.saloon.potView?.target() || this.flight.to;
        const position = new THREE.Vector3().lerpVectors(this.flight.from, destination, 1 - (1 - t) ** 3); position.y += Math.sin(Math.PI * t) * .65;
        this.stage.position.copy(this.stageAnchor.worldToLocal(position));
        // Keep the submitted chips visible here until a confirmed state moves
        // these same meshes into the pot, or a rejection restores the draft.
      } else {
        const position = this.home.clone().addScaledVector(this.forward, this.state.dragging === 'chips' ? Math.min(1.5, this.state.progress) * .45 : 0);
        this.stage.position.copy(this.stageAnchor.worldToLocal(position));
      }
      if (!this.slider.hidden) this.positionSlider();
    }
    let completed = false;
    this.transfers = this.transfers.filter(transfer => {
      const t = Math.max(0, Math.min(1, (time - transfer.start) / 300));
      transfer.group.position.lerpVectors(transfer.from, transfer.to, 1 - (1 - t) ** 3); transfer.group.position.y += Math.sin(Math.PI * t) * .3;
      if (t >= 1 || !this.active) { this.saloon.scene.remove(transfer.group); completed = true; return false; } return true;
    });
    if (completed) this.setState(this.state);
  }
}
