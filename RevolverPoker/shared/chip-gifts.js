// Only uncommitted stacks can move. A live all-in cannot be reopened by a gift.
export function chipGiftLimit(room, fromId, toId) {
  const unavailable = reason => ({ maximum: 0, reason });
  if (room?.phase !== 'playing' || !room.hand) return unavailable('比赛进行中才能送礼');
  if (fromId === toId) return unavailable('不能向自己赠送筹码');
  const from = room.hand.players.find(player => player.id === fromId);
  const to = room.hand.players.find(player => player.id === toId);
  if (!from) return unavailable('入座参赛后才能送礼');
  if (!to) return unavailable('该玩家已出局，不能接收筹码');
  if (room.dealing || room.opening || room.settling) return unavailable('请等待发牌或结算完成');
  if (!room.hand.done && to.chips === 0) return unavailable('全下玩家需在本手结算后接收筹码');
  const reserve = !room.hand.done && !from.folded ? 1 : 0;
  const maximum = Math.max(0, from.chips - reserve);
  return { maximum, reason: maximum ? '' : '没有可赠送的筹码' };
}
