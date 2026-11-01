import { settlementLabel, paintSettlementCard } from './settlement-label.js';
import { fallbackPortrait } from './player-portraits.js';
import { NUMBER_FONT } from './typography.js';

const money = value => Number(value || 0).toLocaleString('zh-CN');
const compactAction = action => String(action || '').replace(/^跟注(?:\s.*)?$/, '已跟注').replace(/^加注至(?:\s.*)?$/, '已加注')
  .replace(/^过牌$/, '已过牌').replace(/^弃牌$/, '已弃牌').replace(/^全下$/, '已全下');

export class PlayerRosterState {
  constructor() { this.key = null; this.actions = new Map(); }
  update(room, viewerId) {
    const hand = room?.hand, key = hand ? `${room.code}:${hand.number}:${hand.street}` : null;
    if (key !== this.key || !hand) { this.key = key; this.actions.clear(); }
    if (!room) return [];
    // Only actions from this betting round replace a player's name. Forced
    // blinds do not count, and a new street restores names until players act.
    for (const entry of hand?.history || []) if (entry.street === hand.street) this.actions.set(entry.seat, entry.action);
    return room.seats.filter(seat => seat.kind !== 'open').sort((a, b) => a.seat - b.seat).map(seat => {
      const player = hand?.players.find(player => player.id === seat.id), settled = !!hand?.done;
      const eliminated = !!hand && !player;
      const result = settled ? settlementLabel(hand, player) || { cards: [null, null], handName: '已出局' } : null;
      const action = player?.folded ? '弃牌' : player?.chips === 0 ? '全下' : this.actions.get(seat.seat);
      const disconnected = seat.kind === 'human' && seat.connected === false;
      const chips = player?.chips ?? seat.chips ?? room.config.startingChips;
      return { id: seat.id, seat: seat.seat, name: seat.name, mine: seat.id === viewerId, bot: seat.kind === 'ai',
        active: !!player && !settled && !room.dealing && !room.settling && hand.actor === seat.seat,
        folded: !!player?.folded, eliminated, disconnected, settled, result, anger: seat.kind === 'ai' ? Math.max(0, Math.min(3, seat.anger || 0)) : 0,
        chips, bet: player?.bet || 0,
        status: settled ? result.handName : eliminated ? '已出局' : compactAction(action) || seat.name,
        badge: hand?.button === seat.seat ? 'D' : hand?.sbSeat === seat.seat ? 'SB' : hand?.bbSeat === seat.seat ? 'BB' : '' };
    });
  }
}

export class PlayerRoster {
  constructor(container) {
    this.container = container; this.doc = container.ownerDocument; this.state = new PlayerRosterState(); this.entries = new Map(); this.portraits = [];
    this.measure = this.doc.createElement('canvas').getContext('2d');
    this.observer = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { this.updateLayout(); this.fitAmounts(); }) : null;
    this.observer?.observe(container);
  }
  setPortraits(portraits) {
    this.portraits = portraits;
    for (const entry of this.entries.values()) { const source = portraits[entry.seat] || fallbackPortrait(entry.seat); if (entry.image.src !== source) entry.image.src = source; }
  }
  updateLayout() {
    const count = this.entries.size, width = this.container.clientWidth;
    this.container.classList.toggle('crowded', count > 4 || !!width && count > 0 && width / count < 100);
  }
  create(id, seat) {
    const el = (tag, className) => { const node = this.doc.createElement(tag); node.className = className; return node; };
    const root = el('article', 'player-status'); root.setAttribute('role', 'listitem');
    const portrait = el('div', 'roster-portrait'), image = el('img', 'roster-photo'); image.alt = ''; image.draggable = false;
    image.src = this.portraits[seat] || fallbackPortrait(seat);
    const identity = el('span', 'roster-identity'), badge = el('span', 'roster-badge'), offline = el('i', 'roster-offline');
    offline.setAttribute('aria-hidden', 'true'); portrait.append(image, identity, badge, offline);
    const chips = el('strong', 'roster-stack'), bet = el('span', 'roster-bet'), status = el('span', 'roster-status'), cards = el('canvas', 'roster-cards');
    cards.width = 340; cards.height = 225; cards.setAttribute('role', 'img');
    root.append(portrait, chips, bet, cards, status);
    const entry = { root, image, identity, badge, offline, chips, bet, status, cards, seat };
    root.tabIndex = 0; root.onclick = () => this.onSelect?.(entry.seat);
    root.onkeydown = event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); this.onSelect?.(entry.seat); } };
    this.entries.set(id, entry); return entry;
  }
  fitAmounts() {
    for (const { chips, bet } of this.entries.values()) if (!chips.hidden && chips.clientWidth) {
      this.measure.font = `600 19px ${NUMBER_FONT}`;
      const width = this.measure.measureText(chips.textContent).width;
      const size = Math.min(19, Math.max(13, 19 * chips.clientWidth / Math.max(1, width)));
      chips.style.fontSize = `${size}px`;
      chips.style.transform = `scaleX(${Math.min(1, chips.clientWidth / Math.max(1, width * size / 19))})`;
      this.measure.font = `${this.container.classList.contains('crowded') ? 11 : 12}px ${NUMBER_FONT}`;
      bet.style.transform = `scaleX(${Math.min(1, bet.clientWidth / Math.max(1, this.measure.measureText(bet.textContent).width))})`;
    }
  }
  render(room, viewerId) {
    const states = this.state.update(room, viewerId), ids = new Set(states.map(player => player.id));
    for (const [id, entry] of this.entries) if (!ids.has(id)) { entry.root.remove(); this.entries.delete(id); }
    this.container.style.setProperty('--player-count', Math.max(1, states.length));
    const roots = states.map(player => {
      const entry = this.entries.get(player.id) || this.create(player.id, player.seat);
      entry.root.className = `player-status${player.active ? ' active' : ''}${player.mine ? ' mine' : ''}${player.folded || player.eliminated ? ' folded' : ''}${player.result?.winner ? ' winner' : ''}${player.disconnected ? ' disconnected' : ''}${player.anger ? ` anger-${player.anger}` : ''}`;
      entry.root.title = `${player.name}${player.bot ? '（AI）' : ''}${player.mine ? ' · 你' : ''}${player.disconnected ? ' · 暂时断线' : ''}${player.settled ? '' : ` · 总筹码 ${money(player.chips)} · 本轮下注 ${money(player.bet)}`}`;
      entry.root.setAttribute('aria-label', `${player.seat + 1} 号座位，${entry.root.title}，${player.status}${player.active ? '，正在行动' : ''}`);
      entry.identity.textContent = player.mine ? '你' : String(player.seat + 1).padStart(2, '0');
      entry.badge.textContent = player.result?.winner ? 'WIN' : player.badge; entry.badge.hidden = !entry.badge.textContent;
      entry.offline.hidden = !player.disconnected;
      entry.chips.hidden = player.settled; entry.bet.hidden = player.settled; entry.cards.hidden = !player.settled;
      entry.chips.textContent = player.settled ? '' : money(player.chips);
      entry.bet.textContent = player.settled ? '' : money(player.bet);
      entry.status.textContent = player.status;
      if (player.settled) {
        const key = JSON.stringify(player.result);
        if (entry.cardsKey !== key) {
          const ctx = entry.cards.getContext('2d'); ctx.clearRect(0, 0, 340, 225);
          player.result.cards.forEach((card, i) => paintSettlementCard(ctx, card, 24 + i * 160, 24, !!player.result.winner, { glow: !!player.result.winner }));
          entry.cardsKey = key;
        }
        entry.cards.setAttribute('aria-label', `${player.name}：${player.result.cards.some(card => card === null) ? '底牌未公开' : player.result.cards.map(card => `${'23456789TJQKA'[card % 13].replace('T', '10')}${['♣', '♦', '♥', '♠'][Math.floor(card / 13)]}`).join('、')}，${player.status}`);
      }
      return entry.root;
    });
    // Keep the same DOM nodes and scroll position as amounts and actions change.
    if (roots.some((root, index) => this.container.children[index] !== root)) this.container.replaceChildren(...roots);
    this.updateLayout();
    this.fitAmounts();
  }
}
