import { NUMBER_FONT } from './typography.js';

// The history/cache fallback also supports already-running servers which clear
// player.action between streets. A new hand always starts with fresh labels.
export class SeatActionLabels {
  constructor() { this.key = null; this.actions = new Map(); }
  update(room) {
    const hand = room?.hand, key = hand ? `${room.code}:${hand.number}` : null;
    if (key !== this.key || !hand) { this.actions.clear(); this.key = key; }
    if (!hand) return;
    for (const player of hand.players) {
      const last = hand.history?.findLast(entry => entry.seat === player.seat)?.action;
      const blind = player.seat === hand.bbSeat ? '大盲' : player.seat === hand.sbSeat ? '小盲' : '';
      const action = player.folded ? '弃牌' : player.chips === 0 ? '全下'
        : player.action || last || this.actions.get(player.id) || blind || '等待行动';
      this.actions.set(player.id, action);
    }
  }
  get(id) { return this.actions.get(id); }
}

export function paintSeatNameplate(ctx, data) {
  ctx.clearRect(0, 0, 512, 240);
  ctx.fillStyle = data.active ? '#302b1bf2' : '#181c16ed';
  ctx.strokeStyle = data.active ? '#edc77e' : data.open ? '#ad9b7299' : '#bba16c99';
  ctx.lineWidth = data.active ? 5 : 2;
  ctx.setLineDash(data.open ? [12, 9] : []);
  ctx.beginPath(); ctx.roundRect(7, 7, 498, 226, 12); ctx.fill(); ctx.stroke(); ctx.setLineDash([]);

  const seat = `SEAT${String(data.seat + 1).padStart(2, '0')}`, name = `${data.name}${data.bot ? '（AI）' : ''}`;
  const gap = 10;
  let nameSize = 34, seatSize, seatWidth, nameWidth;
  for (;;) {
    seatSize = Math.round(nameSize * .65); ctx.font = `${seatSize}px ${NUMBER_FONT}`; seatWidth = ctx.measureText(seat).width;
    ctx.font = `600 ${nameSize}px "Microsoft YaHei", sans-serif`; nameWidth = ctx.measureText(name).width;
    if (seatWidth + gap + nameWidth <= 460 || nameSize <= 18) break;
    nameSize--;
  }
  nameWidth = Math.min(460 - seatWidth - gap, nameWidth);
  const left = (512 - seatWidth - gap - nameWidth) / 2;
  ctx.textAlign = 'left'; ctx.fillStyle = '#b8a173'; ctx.font = `${seatSize}px ${NUMBER_FONT}`; ctx.fillText(seat, left, 56);
  ctx.fillStyle = data.folded ? '#b0a58c' : '#f1e3c6'; ctx.font = `600 ${nameSize}px "Microsoft YaHei", sans-serif`; ctx.fillText(name, left + seatWidth + gap, 56, nameWidth);

  const action = data.action || '等待行动';
  let actionSize = 74; ctx.font = `600 ${actionSize}px "Microsoft YaHei", sans-serif`;
  while (ctx.measureText(action).width > 460 && actionSize > 36) ctx.font = `600 ${--actionSize}px "Microsoft YaHei", sans-serif`;
  ctx.textAlign = 'center'; ctx.fillStyle = data.active ? '#f0cc86' : '#eee0bd'; ctx.fillText(action, 256, 153, 460);
  ctx.fillStyle = '#b6ab91'; ctx.font = `30px ${NUMBER_FONT}`; ctx.fillText(data.value, 256, 210, 460);
}
