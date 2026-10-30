import * as THREE from '/vendor/three.js';
import { NUMBER_FONT } from './typography.js';

const money = value => Number.isSafeInteger(value) && value > 0 ? value : 0;

// Animate only public, confirmed contributions. Player.total survives street
// changes, unlike player.bet, and reconnecting never replays old wagers.
export class TablePotView {
  constructor(saloon, chips) {
    this.saloon = saloon; this.chips = chips; this.flights = []; this.holds = new Map(); this.records = new Map(); this.amount = 0;
    this.banks = saloon.piles.map((pile, local) => {
      const decorations = local === 0 ? chips.decorations : [...pile.children];
      const coins = new THREE.Group(); pile.add(coins); coins.visible = false;
      return { pile, coins, decorations, amount: -1 };
    });
    this.root = new THREE.Group(); this.root.name = '底池筹码'; this.root.position.set(.85, 1.56, -.45);
    const ring = new THREE.Mesh(new THREE.RingGeometry(.68, .70, 48), new THREE.MeshStandardMaterial({ color: 0x967845, roughness: .95, transparent: true, opacity: .45, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = -.005; this.root.add(ring);
    this.coins = new THREE.Group(); this.root.add(this.coins); saloon.scene.add(this.root); this.root.visible = false;
    this.entry = saloon.layout?.register(this.root, 'pot-chips', '底池 · 筹码模型', '筹码与扑克');
    this.numberCanvas = document.createElement('canvas'); this.numberCanvas.width = 512; this.numberCanvas.height = 104;
    this.numberMap = new THREE.CanvasTexture(this.numberCanvas); this.numberMap.colorSpace = THREE.SRGBColorSpace;
    this.number = new THREE.Mesh(new THREE.PlaneGeometry(1.25, .20), new THREE.MeshBasicMaterial({ map: this.numberMap, transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }));
    this.number.name = '底池金额'; this.number.rotation.x = -Math.PI / 2; this.number.position.set(0, .018, .82);
    this.root.add(this.number);
    this.numberEntry = saloon.layout?.register(this.number, 'pot-value', '底池 · 金额', '筹码与扑克');
  }
  setNumber(amount) {
    if (this.displayAmount === amount) return;
    this.displayAmount = amount;
    const ctx = this.numberCanvas.getContext('2d'); ctx.clearRect(0, 0, 512, 104);
    ctx.textAlign = 'center'; ctx.font = `bold 54px ${NUMBER_FONT}`; ctx.fillStyle = '#f2d18b';
    ctx.fillText(`底池 ${amount.toLocaleString('zh-CN')}`, 256, 68, 470);
    this.numberMap.needsUpdate = true;
  }
  target() { return this.root.getWorldPosition(new THREE.Vector3()); }
  heldFor(id) { return this.holds.get(id) || 0; }
  playerBank(id) {
    const player = this.players?.find(player => player.id === id);
    return player ? this.banks[(player.seat - this.focus + 8) % 8] : null;
  }
  renderBanks() {
    this.banks.forEach((bank, local) => {
      const player = this.players?.find(player => player.seat === (local + this.focus) % 8);
      const amount = Math.max(0, money(player?.chips) - this.heldFor(player?.id));
      if (bank.amount !== amount) { this.chips.fill(bank.coins, amount, true); bank.amount = amount; }
      bank.coins.visible = this.active && !(local === 0 && this.chips.active);
      for (const prop of bank.decorations) prop.visible = !this.active && !(local === 0 && this.chips.active);
    });
  }
  clear() {
    for (const flight of this.flights) this.saloon.scene.remove(flight.group);
    this.flights = []; this.holds.clear(); this.records.clear(); this.coins.clear(); this.amount = 0;
    this.settlement = null; this.paid = false; this.root.visible = false; this.active = false; this.players = null; this.key = null;
    this.renderBanks();
  }
  flight({ id, amount, incoming, from, group, quaternion, scale, duration = 650 }, now) {
    if (!amount) return;
    group ||= new THREE.Group(); if (!group.children.length) this.chips.fill(group, amount);
    group.position.copy(from); group.quaternion.copy(quaternion || new THREE.Quaternion()); group.scale.copy(scale || new THREE.Vector3(1, 1, 1));
    group.userData.amount = amount; this.saloon.scene.add(group);
    const flight = { id, amount, incoming, group, from: from.clone(), quaternion: group.quaternion.clone(), scale: group.scale.clone(), start: now, duration };
    if (duration === 0) { this.land(flight); return; }
    this.flights.push(flight);
  }
  land(flight) {
    if (flight.incoming) {
      // Keep the actual incoming coin meshes on the table after they land.
      for (const coin of [...flight.group.children]) this.coins.add(coin);
      this.amount += flight.amount;
      if (this.coins.children.length > 96) this.chips.fill(this.coins, this.amount, true);
      this.arrange();
    } else this.holds.set(flight.id, Math.max(0, this.heldFor(flight.id) - flight.amount));
    this.saloon.scene.remove(flight.group);
  }
  arrange() {
    const denominations = new Map();
    for (const coin of this.coins.children) {
      const value = coin.userData.value;
      if (!denominations.has(value)) denominations.set(value, []);
      denominations.get(value).push(coin);
    }
    const stacks = [];
    for (const [, coins] of [...denominations].sort((a, b) => b[0] - a[0])) for (let i = 0; i < coins.length; i += 10) stacks.push(coins.slice(i, i + 10));
    const columns = Math.min(4, Math.ceil(Math.sqrt(stacks.length))), rows = Math.ceil(stacks.length / columns);
    stacks.forEach((stack, index) => stack.forEach((coin, level) => {
      coin.position.set((index % columns - (columns - 1) / 2) * .24, .025 + level * .048, (Math.floor(index / columns) - (rows - 1) / 2) * .24);
    }));
    this.coins.userData.amount = this.amount;
  }
  sync(room, you, focus = 0, now = performance.now()) {
    const hand = room?.hand;
    if (!hand || !['playing', 'finished'].includes(room.phase)) { if (this.key) this.chips.resetDraft(); this.clear(); return; }
    const key = `${room.code}:${hand.number}:${you}:${focus}`, fresh = this.key !== key;
    if (fresh) {
      if (this.key) this.chips.resetDraft();
      this.clear(); this.key = key;
    }
    this.active = true; this.root.visible = true; this.you = you; this.focus = focus; this.players = hand.players.map(player => ({ ...player }));
    this.setNumber(money(hand.pot));
    if (this.saloon.editor) {
      this.amount = money(hand.pot); this.chips.fill(this.coins, this.amount, true); this.arrange(); this.renderBanks(); return;
    }
    // A settled snapshot on initial connection has already paid the winners.
    if (fresh && hand.done) this.paid = true;
    const animate = !fresh || (hand.street === 'preflop' && hand.history?.length === 0);
    if (!this.paid) for (const player of hand.players) {
      const refund = hand.done && hand.result?.refund?.id === player.id ? money(hand.result.refund.amount) : 0;
      const paid = money(player.total) + refund, previous = this.records.get(player.id) || 0;
      const amount = Math.max(0, paid - previous);
      if (amount) {
        const adopted = player.id === you && this.chips.active ? this.chips.takeCommitted(amount, now) : null;
        if (player.id === you && this.chips.active && !adopted) this.chips.resetDraft();
        const bank = this.playerBank(player.id);
        if (animate && bank) this.flight({ id: player.id, amount, incoming: true, from: bank.pile.getWorldPosition(new THREE.Vector3()), quaternion: bank.pile.getWorldQuaternion(new THREE.Quaternion()), scale: bank.pile.getWorldScale(new THREE.Vector3()), ...adopted }, now);
        else { const coins = new THREE.Group(); this.chips.fill(coins, amount); this.land({ incoming: true, amount, group: coins }); }
      }
      this.records.set(player.id, paid);
    }
    if (hand.done && !this.paid && !this.settlement) {
      const awards = new Map();
      for (const pot of hand.result?.pots || []) for (const award of pot.awards) awards.set(award.id, (awards.get(award.id) || 0) + money(award.amount));
      const refund = hand.result?.refund;
      if (refund) awards.set(refund.id, (awards.get(refund.id) || 0) + money(refund.amount));
      const payouts = [...awards].map(([id, amount]) => ({ id, amount }));
      for (const payout of payouts) this.holds.set(payout.id, payout.amount);
      this.settlement = { payouts, readyAt: now + 650 };
    }
    this.renderBanks();
  }
  tick(now) {
    let changed = false;
    this.flights = this.flights.filter(flight => {
      const destination = flight.incoming ? this.root : this.playerBank(flight.id)?.pile;
      const target = destination?.getWorldPosition(new THREE.Vector3());
      if (!target) { this.saloon.scene.remove(flight.group); return false; }
      const t = Math.max(0, Math.min(1, (now - flight.start) / flight.duration)), ease = 1 - (1 - t) ** 3;
      flight.group.position.lerpVectors(flight.from, target, ease); flight.group.position.y += Math.sin(Math.PI * t) * .45;
      const destinationQ = destination.getWorldQuaternion(new THREE.Quaternion());
      const destinationS = destination.getWorldScale(new THREE.Vector3());
      flight.group.quaternion.slerpQuaternions(flight.quaternion, destinationQ, ease); flight.group.scale.lerpVectors(flight.scale, destinationS, ease);
      if (t < 1) return true;
      this.land(flight); changed = true;
      if (this.settlement && flight.incoming) this.settlement.readyAt = now + 650;
      return false;
    });
    if (this.settlement && !this.flights.some(flight => flight.incoming) && now >= this.settlement.readyAt) {
      const { payouts } = this.settlement; this.settlement = null; this.paid = true;
      for (const { id, amount } of payouts) this.flight({ id, amount, incoming: false, from: this.target(), quaternion: this.root.getWorldQuaternion(new THREE.Quaternion()), scale: this.root.getWorldScale(new THREE.Vector3()) }, now);
      this.amount = 0; this.coins.clear(); this.coins.userData.amount = 0;
    }
    if (changed) { this.renderBanks(); this.chips.setState(this.chips.state); }
  }
}
