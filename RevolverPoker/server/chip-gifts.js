import { chipGiftLimit } from '../shared/chip-gifts.js';

export function lobbyChips(room, id) {
  return room.config.startingChips + (room.lobbyChipAdjustments?.get(id) ?? 0);
}

export function unshownPayout(hand, id) {
  if (!hand.done) return 0;
  let amount = hand.result.refund?.id === id ? hand.result.refund.amount : 0;
  for (const pot of hand.result.pots) for (const award of pot.awards) {
    if (award.id === id) amount += award.amount;
  }
  return amount;
}

function giftAccount(room, id) {
  if (room.phase !== 'playing') {
    const chips = lobbyChips(room, id);
    return { chips, maximum: chips };
  }
  const { hand } = room;
  const record = room.players.find(player => player.id === id);
  const player = hand.players.find(player => player.id === id);
  const opening = room.openingPlayers?.find(player => player.id === id);
  const live = !hand.done || room.dealing || !!room.actionPresentation;
  let chips = player?.chips ?? record?.chips ?? 0;
  // Reserve blinds waiting to post and payouts waiting to be revealed.
  if (opening) chips = opening.chips - opening.ante - opening.blind;
  else if (player && live) chips -= unshownPayout(hand, id);
  const inHand = live && player && !player.folded;
  const pending = room.pendingGiftCredits?.get(id) ?? 0;
  const maximum = Math.max(0, chips - (inHand ? 1 : 0)) + pending;
  return { chips, maximum, pending, record, player, opening, live, deferCredit: inHand && chips === 0 };
}

export function giftSeatState(room, seat) {
  if (!seat.id) return {};
  const { chips, maximum, pending } = giftAccount(room, seat.id);
  return { giftMaximum: maximum, pendingGift: pending || undefined,
    nextMatchChips: room.phase === 'playing' ? undefined : chips };
}

function adjustLobbyChips(room, id, delta) {
  const changes = room.lobbyChipAdjustments ??= new Map();
  changes.set(id, (changes.get(id) ?? 0) + delta);
}

function adjustPending(room, id, delta) {
  const credits = room.pendingGiftCredits ??= new Map();
  credits.set(id, (credits.get(id) ?? 0) + delta);
}

function adjustStack(account, delta) {
  if (account.player) account.player.chips += delta;
  if (account.opening) account.opening.chips += delta;
}

function updateElimination(room, account, previousChips) {
  const { record } = account;
  if (account.player && account.live) return;
  if (record.chips > 0) { delete record.eliminatedAt; delete record.beforeBust; }
  else if (!record.eliminatedAt) { record.eliminatedAt = room.handNumber; record.beforeBust = previousChips; }
}

export function transferChipGift(room, fromId, toId, amount) {
  const { maximum, reason } = chipGiftLimit(room, fromId, toId, seat => giftAccount(room, seat.id).maximum);
  if (reason) throw new Error(reason);
  if (!Number.isSafeInteger(amount) || amount < 1 || amount > maximum) throw new Error(`赠送金额须为 1–${maximum} 的整数`);
  const from = giftAccount(room, fromId), to = giftAccount(room, toId);
  if (!Number.isSafeInteger((to.record?.chips ?? to.chips) + amount)) throw new Error('接收筹码超出范围');

  if (room.phase !== 'playing') {
    adjustLobbyChips(room, fromId, -amount);
    adjustLobbyChips(room, toId, amount);
  } else {
    if (!from.record || !to.record) throw new Error('参赛记录已更新，请稍后重试');
    const fromPending = Math.min(from.pending, amount);
    if (fromPending) adjustPending(room, fromId, -fromPending);
    adjustStack(from, -(amount - fromPending));
    from.record.chips -= amount;
    if (to.deferCredit) adjustPending(room, toId, amount);
    else adjustStack(to, amount);
    to.record.chips += amount;
    updateElimination(room, from, from.chips);
    updateElimination(room, to, to.chips);
    if (!from.live) room.finishing = !!room.stopAfterHand || room.players.filter(player => player.chips > 0).length <= 1;
  }
  return { fromId, targetId: toId, amount, name: room.seats.find(seat => seat.id === toId).name,
    deferred: !!to.deferCredit, nextMatch: room.phase === 'finished' };
}

export function settleChipGifts(room) {
  if (!room.pendingGiftCredits) return;
  for (const player of room.hand.players) player.chips += room.pendingGiftCredits.get(player.id) ?? 0;
  room.pendingGiftCredits.clear();
}
