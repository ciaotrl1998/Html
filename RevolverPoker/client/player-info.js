import { chipGiftLimit } from '../shared/chip-gifts.js';

const money = value => Number(value || 0).toLocaleString('zh-CN');
const requestId = () => 'gift-' + [...crypto.getRandomValues(new Uint32Array(4))].map(value => value.toString(16)).join('-');

export class PlayerInfo {
  constructor(root, { send, notify = () => {}, open = () => {}, makeId = requestId } = {}) {
    this.root = root; this.send = send; this.notify = notify; this.open = open; this.makeId = makeId;
    const doc = root.ownerDocument || document;
    const el = (tag, className, text) => { const node = doc.createElement(tag); node.className = className; if (text) node.textContent = text; return node; };
    root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', '玩家信息与送礼');
    this.summary = el('div', 'player-info-summary');
    this.gift = el('button', 'player-info-gift', '送礼'); this.gift.type = 'button';
    this.amountRow = el('div', 'gift-amount-row');
    this.slider = el('input', 'gift-slider'); this.slider.type = 'range'; this.slider.min = '1'; this.slider.step = '1';
    this.slider.id = 'gift-amount'; this.slider.setAttribute('aria-label', '赠送筹码数');
    this.amount = el('output', 'gift-amount'); this.amount.setAttribute('for', this.slider.id);
    this.amountRow.append(this.slider, this.amount);
    this.actions = el('div', 'gift-actions');
    this.confirm = el('button', 'gift-confirm', '确认'); this.cancel = el('button', 'gift-cancel', '取消');
    this.confirm.type = this.cancel.type = 'button'; this.actions.append(this.confirm, this.cancel);
    this.reason = el('p', 'gift-reason'); this.reason.setAttribute('aria-live', 'polite');
    root.append(this.summary, this.gift, this.amountRow, this.actions, this.reason); root.hidden = true;
    this.gift.onclick = () => { if (!this.limit().reason) { this.mode = 'gift'; this.selected = 1; this.render(); } };
    this.slider.oninput = () => { const { maximum } = this.limit(); this.selected = Math.max(1, Math.min(maximum, Number(this.slider.value))); this.renderAmount(maximum); };
    this.cancel.onclick = () => this.close(); this.confirm.onclick = () => this.submit();
    doc.addEventListener('pointerdown', event => { if (!root.hidden && !root.contains(event.target)) this.close(); });
    doc.addEventListener('keydown', event => { if (!root.hidden && event.key === 'Escape') this.close(); });
  }
  limit() {
    if (!this.connected) return { maximum: 0, reason: '正在连接服务器' };
    if (!this.room?.supportsChipGifts) return { maximum: 0, reason: '送礼需先重启更新后的 CMD 游戏服务器' };
    return chipGiftLimit(this.room, this.you, this.targetId);
  }
  update(room, you, connected) {
    this.room = room; this.you = you; this.connected = connected;
    if (!connected) { this.pending = null; this.close(); return; }
    if (this.root.hidden) return;
    if (!room || room.code !== this.code || !room.seats.some(seat => seat.id === this.targetId)) { this.pending = null; this.close(); return; }
    if (this.hand !== room.handNumber && !this.pending) { this.hand = room.handNumber; this.mode = 'info'; }
    this.render();
  }
  show(seatNumber) {
    const seat = this.room?.seats.find(seat => seat.seat === seatNumber && seat.kind !== 'open');
    if (!seat || seat.id === this.you) return false;
    if (this.pending) { this.notify('正在赠送，请稍候'); return true; }
    this.targetId = seat.id; this.code = this.room.code; this.hand = this.room.handNumber;
    this.mode = 'info'; this.selected = 1; this.root.hidden = false; this.open(); this.render(); return true;
  }
  render() {
    const seat = this.room.seats.find(seat => seat.id === this.targetId), player = this.room.hand?.players.find(player => player.id === this.targetId);
    const { maximum, reason } = this.limit(), form = this.mode === 'gift';
    this.summary.hidden = this.gift.hidden = form; this.amountRow.hidden = this.actions.hidden = !form;
    this.summary.textContent = `${seat.name} · ${seat.kind === 'ai' ? '电脑' : seat.connected === false ? '暂时断线' : '在线'} · 剩余 ${money(player?.chips ?? seat.chips ?? this.room.config.startingChips)} · 本手投入 ${money(player?.total)}`;
    this.gift.disabled = !!reason; this.reason.textContent = reason; this.reason.hidden = !reason;
    this.selected = Math.min(Math.max(1, this.selected || 1), maximum || 1);
    this.slider.max = String(maximum || 1); this.slider.value = String(this.selected);
    this.slider.disabled = !!this.pending || !!reason; this.renderAmount(maximum);
    this.confirm.disabled = !!this.pending || !!reason; this.cancel.disabled = !!this.pending;
    this.confirm.textContent = this.pending ? '赠送中…' : '确认';
  }
  renderAmount(maximum) {
    this.amount.textContent = maximum ? money(this.selected) : '0';
    this.amount.style?.setProperty('--gift-digits', String(money(maximum).length));
    this.slider.style?.setProperty('--gift-fill', `${maximum > 1 ? (this.selected - 1) / (maximum - 1) * 100 : 0}%`);
  }
  submit() {
    const { maximum, reason } = this.limit();
    if (this.pending || reason || !Number.isSafeInteger(this.selected) || this.selected < 1 || this.selected > maximum) { if (reason) this.notify(reason); return; }
    const seat = this.room.seats.find(seat => seat.id === this.targetId);
    const pending = { requestId: this.makeId(), targetId: this.targetId, amount: this.selected, hand: this.room.handNumber, turnId: this.room.turnId, name: seat.name };
    if (this.send('gift-chips', pending) === false) return;
    this.pending = pending; this.render();
  }
  accept(receipt) {
    if (!this.pending || receipt.requestId !== this.pending.requestId) return;
    const name = this.pending.name; this.pending = null; this.close(); this.notify(`已向${name}赠送 ${money(receipt.amount)} 筹码`);
  }
  reject(error) {
    if (!this.pending || error.requestId !== this.pending.requestId) return false;
    this.pending = null;
    if (!this.root.hidden) { this.render(); this.reason.textContent = error.message; this.reason.hidden = false; }
    return true;
  }
  close() { this.root.hidden = true; }
}
