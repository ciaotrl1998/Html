export function chipGiftLimit(room, fromId, toId, maximumFor = seat => seat.giftMaximum) {
  const unavailable = reason => ({ maximum: 0, reason });
  if (fromId === toId) return unavailable('不能向自己赠送筹码');
  const from = room?.seats.find(seat => seat.kind === 'human' && seat.id === fromId);
  const to = room?.seats.find(seat => seat.kind !== 'open' && seat.id === toId);
  if (!from) return unavailable('入座后才能送礼');
  if (!to) return unavailable('接收玩家已离开座位');
  const maximum = maximumFor(from);
  if (maximum === undefined) return unavailable('送礼需先重启更新后的 CMD 游戏服务器');
  return { maximum, reason: maximum ? '' : '没有可赠送的筹码' };
}
