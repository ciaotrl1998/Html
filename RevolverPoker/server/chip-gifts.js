import { chipGiftLimit } from '../shared/chip-gifts.js';

export function transferChipGift(room, fromId, toId, amount) {
  const { maximum, reason } = chipGiftLimit(room, fromId, toId);
  if (reason) throw new Error(reason);
  if (!Number.isSafeInteger(amount) || amount < 1 || amount > maximum) throw new Error(`赠送金额须为 1–${maximum} 的整数`);
  const from = room.hand.players.find(player => player.id === fromId), to = room.hand.players.find(player => player.id === toId);
  if (!Number.isSafeInteger(to.chips + amount)) throw new Error('接收筹码超出范围');
  const records = new Map([fromId, toId].map(id => [id, room.players.find(record => record.id === id)]));
  if ([...records.values()].some(record => !record)) throw new Error('参赛记录已更新，请稍后重试');
  const before = new Map([[fromId, from.chips], [toId, to.chips]]);
  from.chips -= amount; to.chips += amount;
  for (const player of [from, to]) {
    const record = records.get(player.id);
    // During a hand the match record includes chips already committed to the
    // pot. Shift that record by the gift, rather than replacing it with a stack.
    record.chips += player.id === fromId ? -amount : amount;
    if (room.hand.done) {
      if (player.chips > 0) { delete record.eliminatedAt; delete record.beforeBust; }
      else if (!record.eliminatedAt) { record.eliminatedAt = room.handNumber; record.beforeBust = before.get(player.id); }
    }
  }
  if (room.hand.done) room.finishing = !!room.stopAfterHand || room.players.filter(player => player.chips > 0).length <= 1;
  return { fromId, targetId: toId, amount, name: to.name };
}
