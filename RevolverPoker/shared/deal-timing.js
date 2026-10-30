// Each phase also leaves time for the one-second return to the default view.
export const DEAL_TIMING = { pause: 500, card: 660, holeGap: 160, seatGap: 35, opponentGap: 70, flopGap: 130, initial: 1200, flop: 1100, street: 1100 };

export function dealDuration(initial, previousBoard, board) {
  return initial ? DEAL_TIMING.initial : previousBoard < 3 && board >= 3 ? DEAL_TIMING.flop : DEAL_TIMING.street;
}

export const dealKey = room => room?.hand ? `${room.code}:${room.hand.number}:${room.hand.board?.length || 0}` : null;
