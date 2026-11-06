export function hasLocalTurn(room, you, connected = true, sceneDealing = false) {
  const hand = room?.hand;
  return !!(connected && room?.phase === 'playing' && !room.dealing && !sceneDealing &&
    !room.actionPresentation && !hand?.done && hand?.legal &&
    hand.players.some(player => player.id === you && player.seat === hand.actor));
}
