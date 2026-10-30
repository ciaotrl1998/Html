import { evaluate, handName } from '../shared/poker.js';
import { NUMBER_FONT } from './typography.js';

const validCard = card => Number.isInteger(card) && card >= 0 && card < 52;
export const WIN_COLOR = '#cba66b'; // Same yellow as the RevolverPoker mark.

export function settlementLabel(hand, player) {
  if (!hand?.done || !player) return null;
  if (player.folded) return { cards: [null, null], handName: '已弃牌' };
  const winner = typeof player.id === 'string' && !!hand.result?.pots?.some(pot => pot.awards?.some(award => award.id === player.id && award.amount > 0));
  const label = (cards, name) => ({ cards, handName: name, ...(winner ? { winner: true } : {}) });
  if (!hand.result?.showdown) return label([null, null], '未摊牌');
  const cards = player.cards;
  if (!Array.isArray(cards) || cards.length !== 2 || !cards.every(validCard) || !Array.isArray(hand.board) || hand.board.length < 3 || hand.board.length > 5 || !hand.board.every(validCard)) return label([null, null], '未公开');
  return label([...cards], handName(evaluate([...cards, ...hand.board])));
}

export const settlementLabelHeight = result => result?.winner ? 350 : 240;

export const winPulseScale = elapsed => 1 + .1 * (1 - Math.cos(Math.max(0, elapsed) * Math.PI * 2 / 1000));

export function paintWinLabel(ctx, elapsed = 0) {
  // Repaint only the title band. The cards and their gold outlines stay still.
  ctx.clearRect(0, 0, 512, 67);
  const scale = winPulseScale(elapsed);
  ctx.save(); ctx.translate(256, 60); ctx.scale(scale, scale);
  ctx.textAlign = 'center'; ctx.font = 'bold 54px Georgia, serif';
  ctx.lineWidth = 5; ctx.strokeStyle = '#4a3419'; ctx.strokeText('WIN', 0, 0);
  ctx.fillStyle = WIN_COLOR; ctx.fillText('WIN', 0, 0); ctx.restore();
}

export function paintSettlementCard(ctx, card, x, y, gold = false, { scale = 1, glow = false } = {}) {
  const width = 132 * scale, height = 173 * scale;
  ctx.fillStyle = card === null ? '#483526' : '#faf4e7';
  ctx.strokeStyle = gold ? WIN_COLOR : card === null ? '#b79a63' : '#c9c0ae'; ctx.lineWidth = (gold ? glow ? 7 : 5 : 3) * scale;
  ctx.shadowColor = gold && glow ? WIN_COLOR : 'transparent'; ctx.shadowBlur = gold && glow ? 20 : 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
  ctx.beginPath(); ctx.roundRect(x, y, width, height, 10 * scale); ctx.fill(); ctx.stroke();
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  if (card === null) {
    ctx.strokeStyle = '#b79a6388'; ctx.lineWidth = 2 * scale; ctx.strokeRect(x + 10 * scale, y + 10 * scale, width - 20 * scale, height - 20 * scale);
    ctx.fillStyle = '#d8be86'; ctx.font = `${72 * scale}px Georgia, serif`; ctx.fillText('♠', x + width / 2, y + 111 * scale);
  } else {
    const rank = '23456789TJQKA'[card % 13].replace('T', '10'), suit = ['♣', '♦', '♥', '♠'][Math.floor(card / 13)];
    ctx.fillStyle = card >= 13 && card < 39 ? '#9c3034' : '#171a18';
    ctx.font = `bold ${(rank === '10' ? 68 : 83) * scale}px ${NUMBER_FONT}`; ctx.fillText(rank, x + width / 2, y + 81 * scale);
    ctx.font = `${65 * scale}px Georgia, serif`; ctx.fillText(suit, x + width / 2, y + 149 * scale);
  }
}

export function paintSettlementLabel(ctx, result) {
  const offset = result.winner ? 84 : 0;
  ctx.clearRect(0, 0, 512, settlementLabelHeight(result));
  if (result.winner) paintWinLabel(ctx);
  // Match the five-card result's gold stroke and glow. Leave enough room above
  // for WIN animation updates and below so the hand-name bar cannot clip it.
  for (let i = 0; i < 2; i++) paintSettlementCard(ctx, result.cards[i], 111 + i * 158, 10 + offset, !!result.winner, { glow: !!result.winner });
  const nameY = result.winner ? 294 : 190;
  ctx.fillStyle = '#161914ed'; ctx.beginPath(); ctx.roundRect(76, nameY, 360, 45, 6); ctx.fill();
  ctx.fillStyle = '#f0e0ba'; ctx.font = '600 36px "Microsoft YaHei", sans-serif'; ctx.textAlign = 'center';
  ctx.fillText(result.handName, 256, nameY + 33, 340);
}
